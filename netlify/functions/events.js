/**
 * Netlify Function: Event Discovery Aggregator
 * Fetches and aggregates events from the Ticketmaster Discovery API
 * Normalizes, geocodes, adds weather context, filters by distance/date
 * Client calls: /.netlify/functions/events?location=<city>&radius=<minutes>&eventTypes=<comma-sep>
 *
 * API Integration Notes:
 * - Ticketmaster: Uses /events.json endpoint (Discovery v2 API). Available params include
 *   keyword, attractionId, venueId for advanced filtering. See docs/API_RESEARCH.md for details.
 * - OpenWeatherMap: Geocoding (direct API) + Forecast (data.2.5/forecast for weather context)
 * - Retry strategy: Exponential backoff (1s, 2s, 4s max). Gracefully handles partial source failures.
 *
 * Performance: Parallel source fetching via Promise.allSettled. Weather enrichment happens
 * after aggregation. Distance filtering uses Haversine formula (see calculateDistance).
 */

// Time limits. Netlify ends a function at 30s, and every source is awaited
// together, so one hung upstream used to take the whole response down: on
// 2026-10-20 the Overpass API stopped answering and every request 504'd.
// Each fetch now has its own deadline (the module-level fetch below shadows
// the global one), each source an overall cap covering its retries, and the
// weather step a budget after which events go out without weather.
const FETCH_TIMEOUT_MS   = 8000;
const GEOCODE_TIMEOUT_MS = 6000;
const SOURCE_TIMEOUT_MS  = 12000;
const WEATHER_STEP_MS    = 5000;
const fetch = (url, opts = {}) => globalThis.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...opts });

/** Reject if `promise` hasn't settled within `ms`. The work underneath isn't
 *  cancelled, only no longer waited on. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

const TM_API_BASE = 'https://app.ticketmaster.com/discovery/v2';
const OWM_API_BASE = 'https://api.openweathermap.org/data/2.5';
const OWM_GEO_BASE = 'https://api.openweathermap.org/geo/1.0';

// Source status tracking for this request
const sourceStatus = {
  ticketmaster: { ok: true, count: 0, error: null },
  osm: { ok: true, count: 0, error: null },
  libraryweb: { ok: true, count: 0, error: null },
  redwings: { ok: true, count: 0, error: null },
  cityspark: { ok: true, count: 0, error: null },
  towns: { ok: true, count: 0, error: null },
  pittsford: { ok: true, count: 0, error: null }
};

// CitySpark local-events aggregator (powers RocCityMag's calendar). Public
// JSON API, location-based (pass lat/lng), returns rich events with images.
const CITYSPARK_URL = 'https://portal.cityspark.com/api/events/GetEvents/CITYMagazine';
const CITYSPARK_RADIUS_MILES = 30;
// Numeric Tag id → our canonical event type (best-effort; falls back to activity)
const CITYSPARK_TAG_TYPE = {
  17: 'concert', 85: 'concert', 87: 'concert', 93: 'concert', 95: 'concert',
  20: 'show', 18: 'show', 3: 'art', 34: 'art', 74: 'food', 75: 'food', 79: 'activity'
};

// Numeric Tag id → display category (for the "Around Town" sub-tabs). Music
// sub-genres roll up to Music, arts variants to Arts, food/drink together.
const CITYSPARK_CATEGORIES = {
  17: 'Music', 85: 'Music', 86: 'Music', 87: 'Music', 93: 'Music', 94: 'Music',
  95: 'Music', 96: 'Music', 99: 'Music', 206: 'Music', 270: 'Music',
  3: 'Arts', 4: 'Arts', 25: 'Arts', 32: 'Arts', 350: 'Arts',
  19: 'Theater', 18: 'Dance', 20: 'Comedy', 26: 'Film',
  74: 'Food & Drink', 75: 'Food & Drink', 10252: 'Food & Drink', 10268: 'Food & Drink',
  79: 'Family', 6: 'Sports & Outdoors', 38: 'Sports & Outdoors',
  31: 'Festivals', 386: 'Festivals', 390: 'Holidays', 400: 'Holidays',
  14: 'Nightlife', 7: 'Learning', 70: 'Civic'
};
let citysparkCache = {};  // keyed by rounded lat/lon
const CITYSPARK_CACHE_TTL = 30 * 60 * 1000;  // 30 minutes

// Rochester Red Wings (AAA baseball) — public MLB Stats API. Region-specific:
// home games only, at ESL Ballpark. teamId 534, sportId 11 (Triple-A).
const REDWINGS_TEAM_ID = 534;
const REDWINGS_SPORT_ID = 11;
const REDWINGS_VENUE = { name: 'Innovative Field (ESL Ballpark)', lat: 43.1547, lon: -77.6160 };
const REDWINGS_MAX_MILES = 90;  // skip for far-away searches
let redwingsCache = { events: null, timestamp: 0 };
const REDWINGS_CACHE_TTL = 6 * 60 * 60 * 1000;  // 6 hours (schedule changes rarely)

// Monroe County (Rochester, NY) public library system — LibCal iCal feeds.
// This is a region-specific source: each branch has its own calendar id.
// iCal carries no coordinates, so each branch is tagged with its location
// (approx) — the distance filter then includes it only for nearby searches.
const LIBRARYWEB_BRANCHES = [
  { name: 'Brighton Memorial Library', cid: 6814, lat: 43.1182, lon: -77.5673 },
  { name: 'East Rochester Public Library', cid: 6816, lat: 43.1126, lon: -77.4869 },
  { name: 'Fairport Public Library', cid: 7670, lat: 43.0987, lon: -77.4425 },
  { name: 'Penfield Public Library', cid: 5054, lat: 43.1490, lon: -77.4803 },
  { name: 'Pittsford Community Library', cid: 6821, lat: 43.0905, lon: -77.5152 },
  { name: 'Henrietta Public Library', cid: 5053, lat: 43.0640, lon: -77.6220 }
];
const LIBRARYWEB_CENTER = { lat: 43.1566, lon: -77.6088 };  // Rochester, NY
const LIBRARYWEB_MAX_MILES = 90;  // skip the whole source for far-away searches
const LIBRARYWEB_PER_BRANCH_LIMIT = 8;  // soonest N per branch, so libraries don't flood

// In-memory cache for parsed library events (LibCal feeds change slowly)
let librarywebCache = { events: null, timestamp: 0 };
const LIBRARYWEB_CACHE_TTL = 30 * 60 * 1000;  // 30 minutes

// Town of Pittsford municipal calendar. Drupal fullcalendar_view embeds the
// whole event list as JSON in drupalSettings, so one page fetch gets everything
// — no per-event scraping. Events carry a taxonomy colour: board meetings,
// holidays/closures and library-closure notices are noise for a family hub, so
// only the rest survives (their tagging is unreliable, hence the title filter
// too — "Food Truck and Music Festival" is tagged "Board Meeting").
const PITTSFORD_URL = 'https://www.townofpittsfordny.gov/calendar';
const PITTSFORD_VENUE = { name: 'Town of Pittsford', lat: 43.0906, lon: -77.5147 };
const PITTSFORD_MAX_MILES = 90;
// Colour is the taxonomy term. Holidays and library-closure notices are always
// noise so they go by colour; board meetings are NOT filtered by colour because
// real events get mistagged as "Board Meeting" (e.g. the Food Truck Festival) —
// the title regex catches the actual boards instead.
const PITTSFORD_SKIP_COLORS = ['#ac394b', '#987b2a'];  // holiday / library closure
const PITTSFORD_SKIP_TITLE = /board|meeting|closure|closed|cancell?ed|committee|public hearing|holiday|deadline/i;
let pittsfordCache = { events: null, timestamp: 0 };
const PITTSFORD_CACHE_TTL = 6 * 60 * 60 * 1000;  // 6 hours (municipal calendar changes rarely)

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelay: 1000,  // 1 second
  maxDelay: 10000   // 10 seconds
};

exports.handler = async (event) => {
  // CORS pre-flight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  const qs = event.queryStringParameters || {};
  const { location, radius, eventTypes, keyword, attractionId, venueId } = qs;

  if (!location) {
    return json(400, { error: 'location parameter required' });
  }

  const radiusMinutes = parseInt(radius) || 120;
  const eventTypesList = eventTypes ? eventTypes.split(',').map(t => t.trim().toLowerCase()) : [];

  try {
    // Step 1: Geocode location (city → lat/lon)
    const { lat, lon, city, state } = await withTimeout(geocodeLocation(location), GEOCODE_TIMEOUT_MS, 'Geocoding');
    if (!lat || !lon) {
      return json(400, { error: `Could not geocode location: ${location}` });
    }

    // Step 2: Fetch from all sources in parallel
    const capped = (promise, name) => withTimeout(promise, SOURCE_TIMEOUT_MS, name).catch(err => {
      if (sourceStatus[name]) { sourceStatus[name].ok = false; sourceStatus[name].error = err.message; }
      throw err;
    });
    const [tmEvents, osmEvents, libEvents, rwEvents, csEvents, fpEvents, pfEvents] = await Promise.allSettled([
      capped(fetchTicketmaster(city, state, lat, lon, { keyword, attractionId, venueId }), 'ticketmaster'),
      capped(fetchOpenStreetMap(city, state, lat, lon, radiusMinutes), 'osm'),
      capped(fetchLibraryWeb(city, state, lat, lon), 'libraryweb'),
      capped(fetchRedWings(city, state, lat, lon), 'redwings'),
      capped(fetchCitySpark(city, state, lat, lon), 'cityspark'),
      capped(fetchFairport(city, state, lat, lon), 'towns'),
      capped(fetchPittsford(city, state, lat, lon), 'pittsford')
    ]);

    // Collect all results
    const allEvents = [
      ...extractSettledValue(tmEvents, 'ticketmaster'),
      ...extractSettledValue(osmEvents, 'osm'),
      ...extractSettledValue(libEvents, 'libraryweb'),
      ...extractSettledValue(rwEvents, 'redwings'),
      ...extractSettledValue(csEvents, 'cityspark'),
      ...extractSettledValue(fpEvents, 'towns'),
      ...extractSettledValue(pfEvents, 'pittsford')
    ];

    // Step 3: Remove duplicates by title + date + venue
    const uniqueEvents = deduplicateEvents(allEvents);

    // Step 4: Filter by distance and date
    const filteredEvents = filterEventsByDistanceAndDate(uniqueEvents, radiusMinutes, lat, lon);

    // Step 5: Add weather context to each event. One forecast per ~100km cell,
    // not one per event (it used to be hundreds of calls), and a time budget.
    const forecasts = new Map();
    const withWeather = await withTimeout(
      Promise.all(filteredEvents.map(e => addWeatherContext(e, forecasts))),
      WEATHER_STEP_MS, 'Weather'
    ).catch(err => { console.warn('[Events]', err.message); return filteredEvents; });

    // Step 6: Filter by event type if specified
    const finalEvents = eventTypesList.length > 0
      ? withWeather.filter(e => eventTypesList.includes(e.type.toLowerCase()))
      : withWeather;

    return json(200, {
      success: true,
      events: finalEvents,
      location,
      radius: radiusMinutes,
      timestamp: Date.now(),
      sourceStats: {
        ticketmaster: sourceStatus.ticketmaster.count,
        osm: sourceStatus.osm.count,
        libraryweb: sourceStatus.libraryweb.count,
        redwings: sourceStatus.redwings.count,
        cityspark: sourceStatus.cityspark.count,
        towns: sourceStatus.towns.count,
        pittsford: sourceStatus.pittsford.count
      },
      warnings: Object.entries(sourceStatus)
        .filter(([, status]) => !status.ok)
        .map(([name]) => `${name} unavailable`)
    });

  } catch (err) {
    console.error('[Events] Handler error:', err);
    return json(500, { success: false, error: err.message });
  }
};

// ────────────────────────────────────────────────────────────────
// GEOCODING
// ────────────────────────────────────────────────────────────────

async function geocodeLocation(location) {
  try {
    const key = process.env.OWM_KEY;
    if (!key) throw new Error('OWM_KEY not set');

    // OWM geocoding rejects "City, ST" (space after comma) — normalize to "City,ST,US"
    const q = location.replace(/,\s+([A-Za-z]{2})$/, ',$1,US');

    const data = await fetchWithRetry(async () => {
      const params = new URLSearchParams({ q, limit: 1, appid: key });
      const r = await fetch(`${OWM_GEO_BASE}/direct?${params}`);
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      return r.json();
    }, 'Geocoding');

    if (!data || data.length === 0) {
      throw new Error(`No results for location: ${location}`);
    }

    const { lat, lon, name, state } = data[0];
    return { lat, lon, city: name, state: state || '' };
  } catch (err) {
    console.error('[Events] Geocoding failed:', err);
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────
// RETRY LOGIC
// ────────────────────────────────────────────────────────────────

async function fetchWithRetry(fn, sourceName, maxRetries = RETRY_CONFIG.maxRetries) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelay
        );
        console.warn(`[Events] ${sourceName} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastErr;
}

// ────────────────────────────────────────────────────────────────
// API: TICKETMASTER
// ────────────────────────────────────────────────────────────────

/**
 * Ticketmaster event fetching with venue enrichment and advanced filtering.
 * Fetches events from Ticketmaster Discovery v2 API and extracts venue details
 * from the standard response (no separate venue API call needed).
 *
 * Venue enrichment strategy:
 * - Ticketmaster /events.json response includes venue data in _embedded.venues[0]
 * - We extract: name, address, capacity, website, accessibility fields
 * - Gracefully handles missing/null venue fields (won't break event display)
 * - No separate /venues/{id} call required (keeps API quota low)
 *
 * Advanced filtering:
 * - keyword: Text search in event name (e.g., "jazz", "comedy")
 * - attractionId: Filter by specific artist/performer ID (alphanumeric validation)
 * - venueId: Filter by specific venue ID (alphanumeric validation)
 * - All filters are optional and passed server-side to Ticketmaster API
 * - See docs/API_RESEARCH.md for full Ticketmaster parameter reference.
 *   https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */
async function fetchTicketmaster(city, state, lat, lon, filters = {}) {
  // Ticketmaster Discovery API v2: /events.json endpoint
  // Supports optional advanced filtering parameters from query string:
  //   - keyword: text search in event name
  //   - attractionId: pre-filter by artist/performer ID
  //   - venueId: filter to specific venue ID
  // See https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

  try {
    const key = process.env.TICKETMASTER_KEY;
    if (!key) {
      console.warn('[Events] TICKETMASTER_KEY not set');
      sourceStatus.ticketmaster.ok = false;
      sourceStatus.ticketmaster.error = 'API key not configured';
      return [];
    }

    const data = await fetchWithRetry(async () => {
      // Calculate date range: today to 30 days ahead
      const today = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Build base params (always included)
      const params = new URLSearchParams({
        apikey: key,
        latlong: `${lat},${lon}`,
        radius: 120,  // km (API default ~100, we expand to 120)
        size: 50,     // Results limit (max 200)
        sort: 'date,asc',  // Sort by date ascending
        startDateTime: `${today}T00:00:00Z`,  // Start of today
        endDateTime: `${in30Days}T23:59:59Z`  // End of day 30 days from now
      });

      // Add optional advanced filter parameters from query string
      // All parameters are forwarded directly to Ticketmaster API (server-side filtering)
      // Validation prevents injection attacks while allowing flexibility

      const { keyword, attractionId, venueId } = filters;

      // keyword: text search in event name (safe string pass-through, no validation needed)
      if (keyword && typeof keyword === 'string' && keyword.trim()) {
        params.set('keyword', keyword.trim());
      }

      // attractionId: filter by specific artist/performer
      // Validation: alphanumeric only (Ticketmaster IDs are numeric, but allow alphanum for safety)
      if (attractionId && typeof attractionId === 'string') {
        if (!/^[a-zA-Z0-9]+$/.test(attractionId)) {
          console.warn('[Events] Invalid attractionId format (non-alphanumeric), ignoring:', attractionId);
        } else {
          params.set('attractionId', attractionId);
        }
      }

      // venueId: filter by specific venue
      // Validation: alphanumeric only (Ticketmaster IDs are numeric, but allow alphanum for safety)
      if (venueId && typeof venueId === 'string') {
        if (!/^[a-zA-Z0-9]+$/.test(venueId)) {
          console.warn('[Events] Invalid venueId format (non-alphanumeric), ignoring:', venueId);
        } else {
          params.set('venueId', venueId);
        }
      }

      const r = await fetch(`${TM_API_BASE}/events.json?${params}`);
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      return r.json();
    }, 'Ticketmaster');

    const events = data._embedded?.events || [];

    const results = events.map(e => {
      // Extract venue data from Ticketmaster response (if available)
      // Ticketmaster includes venue info in _embedded.venues[0], but capacity/ratings may be null
      // Enrich with what's available; graceful fallback if fields are missing
      const tmVenue = e._embedded?.venues?.[0];
      const venueData = tmVenue ? {
        name: tmVenue.name || null,
        address: tmVenue.address?.address1 || null,
        city: tmVenue.city?.name || city,
        state: tmVenue.state?.stateCode || state,
        capacity: tmVenue.capacity || null,  // May be null; graceful handling below
        website: tmVenue.url || null,
        // Accessibility info from Ticketmaster (may be sparse)
        accessibility: {
          wheelchairAccess: tmVenue.accessibility?.wheelchairAccess ?? false,
          parking: tmVenue.parking?.parkingDetail ?? false,
          transit: tmVenue.publicTransitInfo || null
        }
      } : null;

      // Ticketmaster Discovery API rarely returns `description`; it uses
      // `info`/`pleaseNote`. When all are absent, synthesize a short blurb
      // from genre + venue so the card isn't blank.
      const tmGenre = e.classifications?.[0]?.genre?.name;
      const tmSegment = e.classifications?.[0]?.segment?.name;
      const tmGenreLabel = (tmGenre && tmGenre !== 'Undefined') ? tmGenre
        : (tmSegment && tmSegment !== 'Undefined') ? tmSegment : null;
      const tmFallbackDesc = [
        tmGenreLabel,
        venueData?.name ? `at ${venueData.name}` : null,
        e._embedded?.venues?.[0]?.city?.name ? `in ${e._embedded.venues[0].city.name}` : null
      ].filter(Boolean).join(' ');

      return {
        id: `tm_${e.id}`,
        title: e.name,
        type: normalizeEventType(e.classifications?.[0]?.segment?.name),
        source: 'ticketmaster',
        sourceUrl: e.url,
        date: e.dates?.start?.localDate || null,
        time: e.dates?.start?.localTime || null,
        duration: null,
        location: {
          city: e._embedded?.venues?.[0]?.city?.name || city,
          state: e._embedded?.venues?.[0]?.state?.stateCode || state,
          address: e._embedded?.venues?.[0]?.address?.address1 || '',
          lat: parseFloat(e._embedded?.venues?.[0]?.location?.latitude) || lat,
          lon: parseFloat(e._embedded?.venues?.[0]?.location?.longitude) || lon,
          distanceMiles: null,  // Will calculate
          venue: venueData  // Enrich with venue details
        },
        description: e.description || e.info || e.pleaseNote || tmFallbackDesc || '',
        image: e.images?.[0]?.url || null,
        weather: null
      };
    });

    sourceStatus.ticketmaster.count = results.length;
    sourceStatus.ticketmaster.ok = true;
    sourceStatus.ticketmaster.error = null;
    return results;
  } catch (err) {
    console.error('[Events] Ticketmaster error:', err);
    sourceStatus.ticketmaster.ok = false;
    sourceStatus.ticketmaster.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// OPENSTREETMAP (things to do — museums, parks, galleries, theatres)
// ────────────────────────────────────────────────────────────────

// Overpass mirrors (try in order on failure)
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

// Map an OSM tag value to one of our canonical event types + a human label
function osmCategoryInfo(tags) {
  const cultural = { museum: 'Museum', gallery: 'Art gallery', arts_centre: 'Arts centre', theatre: 'Theatre', cinema: 'Cinema' };
  const outdoor = { park: 'Park', nature_reserve: 'Nature reserve', garden: 'Garden', viewpoint: 'Scenic viewpoint' };
  const fun = { zoo: 'Zoo', aquarium: 'Aquarium', theme_park: 'Theme park' };

  const key = tags.tourism || tags.leisure || tags.amenity;
  if (cultural[key]) return { type: 'art', label: cultural[key] };
  if (outdoor[key]) return { type: 'hike', label: outdoor[key] };
  if (fun[key]) return { type: 'activity', label: fun[key] };
  return { type: 'activity', label: 'Place of interest' };
}

/**
 * Fetch nearby "things to do" from OpenStreetMap via the Overpass API.
 * Free, keyless, server-reachable. Returns dateless POIs (always-available),
 * which the distance/date filter keeps (date === null) and trims by distance.
 */
async function fetchOpenStreetMap(city, state, lat, lon, radiusMinutes) {
  try {
    // Cap the POI search radius — things-to-do are local day-trips, and a huge
    // Overpass area is slow. Derive from drive radius but cap at 60km.
    const radiusMiles = (parseInt(radiusMinutes) || 120) / 60 * 70;
    const radiusMeters = Math.min(Math.round(radiusMiles * 1609), 60000);

    const query = `[out:json][timeout:25];
(
  nwr["tourism"~"^(museum|gallery|theme_park|zoo|aquarium|viewpoint)$"]["name"](around:${radiusMeters},${lat},${lon});
  nwr["leisure"~"^(park|nature_reserve|garden)$"]["name"](around:${radiusMeters},${lat},${lon});
  nwr["amenity"~"^(theatre|arts_centre|cinema)$"]["name"](around:${radiusMeters},${lat},${lon});
);
out center tags 80;`;

    let data = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'FamilyHub/1.0 (event discovery)'
          },
          body: 'data=' + encodeURIComponent(query)
        });
        if (r.ok) { data = await r.json(); break; }
      } catch (endpointErr) {
        console.warn(`[Events] Overpass endpoint failed (${endpoint}):`, endpointErr.message);
      }
    }

    if (!data) {
      sourceStatus.osm.ok = false;
      sourceStatus.osm.error = 'all Overpass endpoints failed';
      return [];
    }

    const seenNames = new Set();
    const events = [];

    for (const el of (data.elements || [])) {
      try {
        const tags = el.tags || {};
        const name = tags.name;
        if (!name) continue;

        // Nodes carry lat/lon directly; ways/relations carry a computed center
        const pLat = el.lat ?? el.center?.lat;
        const pLon = el.lon ?? el.center?.lon;
        if (pLat == null || pLon == null) continue;

        // Dedupe repeated names (e.g. a park mapped as both node and area)
        const nameKey = name.toLowerCase().trim();
        if (seenNames.has(nameKey)) continue;
        seenNames.add(nameKey);

        const { type, label } = osmCategoryInfo(tags);
        const website = tags.website || tags['contact:website'] || null;
        const osmType = el.type;  // node | way | relation

        events.push({
          id: `osm_${osmType}${el.id}`,
          title: name,
          type,
          source: 'osm',
          sourceUrl: website || `https://www.openstreetmap.org/${osmType}/${el.id}`,
          date: null,   // always-available "thing to do"
          time: null,
          duration: null,
          location: {
            city,
            state,
            address: tags['addr:street']
              ? `${tags['addr:housenumber'] || ''} ${tags['addr:street']}`.trim()
              : label,
            lat: pLat,
            lon: pLon,
            distanceMiles: null
          },
          description: tags.description || `${label} in ${tags['addr:city'] || city}`,
          image: tags.image || null,
          weather: null
        });
      } catch (itemErr) {
        console.warn('[Events] Error parsing OSM element:', itemErr);
      }
    }

    sourceStatus.osm.count = events.length;
    sourceStatus.osm.ok = true;
    sourceStatus.osm.error = null;
    return events;
  } catch (err) {
    console.warn('[Events] OpenStreetMap error:', err);
    sourceStatus.osm.ok = false;
    sourceStatus.osm.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// LIBRARYWEB (Monroe County public library events — LibCal iCal feeds)
// ────────────────────────────────────────────────────────────────

// Unescape an iCal text value (\, \; \n \\)
function icalUnescape(s) {
  return (s || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

// Convert an iCal DTSTART value to { date: 'YYYY-MM-DD', time: 'HH:MM'|null }
// in America/New_York (the library system's local time).
function icalToLocal(value) {
  // All-day form: YYYYMMDD (no time)
  const allDay = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (allDay) return { date: `${allDay[1]}-${allDay[2]}-${allDay[3]}`, time: null };

  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return { date: null, time: null };

  // UTC (Z) → convert to Eastern; local (no Z) → take as-is
  let d;
  if (m[7] === 'Z') {
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  } else {
    return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).reduce((o, p) => (o[p.type] = p.value, o), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
  };
}

// Parse an iCal document into raw VEVENT field maps (handles line folding)
function parseICal(text) {
  // Unfold: continuation lines begin with a space or tab
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx === -1) return events.length ? events : [];
    const rawKey = line.slice(0, idx);     // e.g. DTSTART;TZID=... or SUMMARY
    const value = line.slice(idx + 1);
    const key = rawKey.split(';')[0];       // strip parameters
    cur[key] = value;
  }
  return events;
}

/**
 * Fetch upcoming events from the Monroe County (Rochester) public library
 * system via LibCal per-branch iCal feeds. Region-specific: skipped entirely
 * when the search location is far from Rochester. Cached 30 min in memory.
 */
async function fetchLibraryWeb(city, state, lat, lon) {
  try {
    // Gate: only relevant near Rochester, NY
    const distToRochester = calculateDistance(lat, lon, LIBRARYWEB_CENTER.lat, LIBRARYWEB_CENTER.lon);
    if (distToRochester > LIBRARYWEB_MAX_MILES) {
      sourceStatus.libraryweb.ok = true;
      sourceStatus.libraryweb.count = 0;
      return [];
    }

    // Serve from cache when warm
    if (librarywebCache.events && Date.now() - librarywebCache.timestamp < LIBRARYWEB_CACHE_TTL) {
      sourceStatus.libraryweb.count = librarywebCache.events.length;
      sourceStatus.libraryweb.ok = true;
      return librarywebCache.events;
    }

    const results = await Promise.allSettled(
      LIBRARYWEB_BRANCHES.map(branch =>
        fetchWithRetry(async () => {
          const r = await fetch(`https://calendar.libraryweb.org/ical_subscribe.php?cid=${branch.cid}`, {
            headers: { 'User-Agent': 'FamilyHub/1.0 (event discovery)' }
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return { branch, text: await r.text() };
        }, `LibraryWeb ${branch.name}`, 1)
      )
    );

    const todayStr = new Date().toISOString().split('T')[0];
    const events = [];
    for (const settled of results) {
      if (settled.status !== 'fulfilled') continue;
      const { branch, text } = settled.value;

      const branchEvents = [];
      for (const ve of parseICal(text)) {
        try {
          const title = icalUnescape(ve.SUMMARY);
          if (!title || !ve.DTSTART) continue;

          const { date, time } = icalToLocal(ve.DTSTART);
          if (!date || date < todayStr) continue;  // skip past occurrences

          // Duration from DTEND if present
          let duration = null;
          if (ve.DTEND) {
            const s = icalToLocal(ve.DTSTART), e = icalToLocal(ve.DTEND);
            if (s.time && e.time && s.date && e.date) {
              duration = Math.round((new Date(`${e.date}T${e.time}`) - new Date(`${s.date}T${s.time}`)) / 60000) || null;
            }
          }

          const eventId = (ve.URL || '').match(/\/event\/(\d+)/)?.[1] || `${branch.cid}_${title}_${date}`;

          branchEvents.push({
            id: `lw_${eventId}`,
            title,
            type: 'class',
            source: 'libraryweb',
            sourceUrl: ve.URL || 'https://calendar.libraryweb.org/',
            date,
            time,
            duration,
            location: {
              city, state,
              address: branch.name,   // clean branch name (shown on the card)
              lat: branch.lat,
              lon: branch.lon,
              distanceMiles: null
            },
            description: icalUnescape(ve.DESCRIPTION) || `Library event at ${branch.name}`,
            image: null,
            weather: null
          });
        } catch (veErr) {
          console.warn('[Events] Error parsing LibraryWeb VEVENT:', veErr.message);
        }
      }

      // Keep only the soonest few per branch so libraries don't flood results
      branchEvents.sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
      events.push(...branchEvents.slice(0, LIBRARYWEB_PER_BRANCH_LIMIT));
    }

    librarywebCache = { events, timestamp: Date.now() };
    sourceStatus.libraryweb.count = events.length;
    sourceStatus.libraryweb.ok = true;
    sourceStatus.libraryweb.error = null;
    return events;
  } catch (err) {
    console.warn('[Events] LibraryWeb error:', err);
    sourceStatus.libraryweb.ok = false;
    sourceStatus.libraryweb.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// TOWN OF PITTSFORD (municipal calendar — Drupal fullcalendar_view)
// ────────────────────────────────────────────────────────────────

// Strip tags/entities from the Drupal description HTML and collapse whitespace
function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull the town's event list out of the page and drop the municipal noise.
 * Pure (no network) so it can be unit-tested against a fixture.
 * Throws if the drupalSettings blob is missing — that means the page changed.
 */
function parsePittsfordEvents(html, city, state) {
  const m = html.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('drupalSettings JSON not found (page markup changed?)');
  const view = JSON.parse(m[1]).fullCalendarView?.[0];
  const raw = JSON.parse(view?.calendar_options || '{}').events || [];

  const todayStr = new Date().toISOString().split('T')[0];
  const events = [];
  for (const e of raw) {
    const date = (e.start || '').split('T')[0];
    if (!date || date < todayStr) continue;
    if (PITTSFORD_SKIP_COLORS.includes(e.backgroundColor)) continue;
    const title = stripHtml(e.title);
    if (!title || PITTSFORD_SKIP_TITLE.test(title)) continue;

    const time = (e.start.split('T')[1] || '').slice(0, 5) || null;
    const endTime = e.end ? (e.end.split('T')[1] || '').slice(0, 5) : null;
    const duration = (time && endTime && e.end.split('T')[0] === date)
      ? Math.round((new Date(`${date}T${endTime}`) - new Date(`${date}T${time}`)) / 60000) || null
      : null;

    events.push({
      id: `pf_${e.eid || e.id}`,
      title,
      // ponytail: first matching title keyword wins — this only picks the card
      // emoji. Their taxonomy is too unreliable to map properly.
      type: /concert|music|band/i.test(title) ? 'concert'
          : /food|truck|farmers|market/i.test(title) ? 'food'
          : /movie|festival|parade/i.test(title) ? 'show' : 'activity',
      // Shares the "Town Events" tab with the Fairport village schedule —
      // same shelf, told apart by location.address.
      source: 'towns',
      sourceUrl: e.url ? `https://www.townofpittsfordny.gov${e.url}` : PITTSFORD_URL,
      date,
      time,
      duration,
      location: {
        city, state,
        address: PITTSFORD_VENUE.name,
        lat: PITTSFORD_VENUE.lat,
        lon: PITTSFORD_VENUE.lon,
        distanceMiles: null
      },
      description: stripHtml(e.des).slice(0, 400) || 'Town of Pittsford community event',
      image: null,
      weather: null
    });
  }
  events.sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
  return events;
}

async function fetchPittsford(city, state, lat, lon) {
  try {
    if (calculateDistance(lat, lon, PITTSFORD_VENUE.lat, PITTSFORD_VENUE.lon) > PITTSFORD_MAX_MILES) {
      sourceStatus.pittsford.count = 0;
      return [];
    }

    if (pittsfordCache.events && Date.now() - pittsfordCache.timestamp < PITTSFORD_CACHE_TTL) {
      sourceStatus.pittsford.count = pittsfordCache.events.length;
      sourceStatus.pittsford.ok = true;
      return pittsfordCache.events;
    }

    const html = await fetchWithRetry(async () => {
      const r = await fetch(PITTSFORD_URL, { headers: { 'User-Agent': 'FamilyHub/1.0 (event discovery)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }, 'Pittsford', 1);

    const events = parsePittsfordEvents(html, city, state);

    pittsfordCache = { events, timestamp: Date.now() };
    sourceStatus.pittsford.count = events.length;
    sourceStatus.pittsford.ok = true;
    sourceStatus.pittsford.error = null;
    return events;
  } catch (err) {
    console.warn('[Events] Pittsford error:', err);
    sourceStatus.pittsford.ok = false;
    sourceStatus.pittsford.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// ROCHESTER RED WINGS (AAA baseball home games — MLB Stats API)
// ────────────────────────────────────────────────────────────────

// Convert a UTC Date to { date:'YYYY-MM-DD', time:'HH:MM' } in Eastern time
function dateToEastern(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).reduce((o, p) => (o[p.type] = p.value, o), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
  };
}

async function fetchRedWings(city, state, lat, lon) {
  try {
    // Region gate — only relevant near Rochester
    if (calculateDistance(lat, lon, REDWINGS_VENUE.lat, REDWINGS_VENUE.lon) > REDWINGS_MAX_MILES) {
      sourceStatus.redwings.count = 0;
      return [];
    }

    if (redwingsCache.events && Date.now() - redwingsCache.timestamp < REDWINGS_CACHE_TTL) {
      sourceStatus.redwings.count = redwingsCache.events.length;
      sourceStatus.redwings.ok = true;
      return redwingsCache.events;
    }

    const start = new Date().toISOString().split('T')[0];
    const end = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=${REDWINGS_SPORT_ID}&teamId=${REDWINGS_TEAM_ID}&startDate=${start}&endDate=${end}&hydrate=team`;

    const data = await fetchWithRetry(async () => {
      const r = await fetch(url, { headers: { 'User-Agent': 'FamilyHub/1.0 (event discovery)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }, 'RedWings', 1);

    const events = [];
    for (const day of (data.dates || [])) {
      for (const g of (day.games || [])) {
        try {
          // Home games only (attendable at ESL Ballpark)
          if (g.teams?.home?.team?.id !== REDWINGS_TEAM_ID) continue;
          if (!g.gameDate) continue;

          const opponent = g.teams?.away?.team?.name || 'TBD';
          const { date, time } = dateToEastern(new Date(g.gameDate));

          events.push({
            id: `rw_${g.gamePk}`,
            title: `Red Wings vs ${opponent}`,
            type: 'sports',
            source: 'redwings',
            sourceUrl: `https://www.milb.com/gameday/${g.gamePk}`,
            date,
            time,
            duration: null,
            location: {
              city, state,
              address: REDWINGS_VENUE.name,
              lat: REDWINGS_VENUE.lat,
              lon: REDWINGS_VENUE.lon,
              distanceMiles: null
            },
            description: `AAA baseball — Rochester Red Wings vs ${opponent} at ${REDWINGS_VENUE.name}`,
            image: null,
            weather: null
          });
        } catch (gErr) {
          console.warn('[Events] RedWings game parse error:', gErr.message);
        }
      }
    }

    redwingsCache = { events, timestamp: Date.now() };
    sourceStatus.redwings.count = events.length;
    sourceStatus.redwings.ok = true;
    sourceStatus.redwings.error = null;
    return events;
  } catch (err) {
    console.warn('[Events] RedWings error:', err);
    sourceStatus.redwings.ok = false;
    sourceStatus.redwings.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// CITYSPARK (broad local "Around Town" events — RocCityMag calendar)
// ────────────────────────────────────────────────────────────────

/**
 * Fetch local events from CitySpark (the aggregator behind RocCityMag's
 * calendar). Public JSON API, location-based via lat/lng. Rich data with
 * images. DateStart carries local time tagged with a spurious 'Z', so we
 * read its components directly without timezone conversion.
 */
async function fetchCitySpark(city, state, lat, lon) {
  try {
    const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const cached = citysparkCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CITYSPARK_CACHE_TTL) {
      sourceStatus.cityspark.count = cached.events.length;
      sourceStatus.cityspark.ok = true;
      return cached.events;
    }

    const start = new Date().toISOString();
    const end = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();
    const body = JSON.stringify({
      lat, lng: lon, distance: CITYSPARK_RADIUS_MILES,
      start, end, sort: 'Time', category: [], page: 1  // 'Time' = soonest-first
    });

    const data = await fetchWithRetry(async () => {
      const r = await fetch(CITYSPARK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://www.roccitymag.com/',
          'User-Agent': 'FamilyHub/1.0 (event discovery)'
        },
        body
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }, 'CitySpark', 1);

    const seen = new Set();
    const events = [];
    for (const e of (data.Value || [])) {
      try {
        const name = e.Name;
        const raw = e.StartLocal || e.DateStart || e.Date;  // local time w/ spurious Z
        if (!name || !raw) continue;

        const date = raw.slice(0, 10);
        const time = e.HasTime && !e.AllDay && raw.length >= 16 ? raw.slice(11, 16) : null;

        const id = `cs_${e.PId || e.Id}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const tags = Array.isArray(e.Tags) ? e.Tags : [];
        const type = tags.map(t => CITYSPARK_TAG_TYPE[t]).find(Boolean) || 'activity';
        const category = tags.map(t => CITYSPARK_CATEGORIES[t]).find(Boolean) || 'Other';
        const description = (e.Description || '').replace(/\\(.)/g, '$1');

        events.push({
          id,
          title: name,
          type,
          category,   // display category for "Around Town" sub-tabs
          source: 'cityspark',
          sourceUrl: e.PrimaryUrl || e.TicketUrl || 'https://www.roccitymag.com/events/',
          date,
          time,
          duration: null,
          location: {
            city: (e.CityState || '').split(',')[0] || city,
            state: (e.CityState || '').split(',')[1]?.trim() || state,
            address: e.Venue || e.Address || '',
            lat: e.latitude || lat,
            lon: e.longitude || lon,
            distanceMiles: null
          },
          description,
          image: e.LargeImg || e.MediumImg || null,
          weather: null
        });
      } catch (itemErr) {
        console.warn('[Events] CitySpark item parse error:', itemErr.message);
      }
    }

    citysparkCache[cacheKey] = { events, timestamp: Date.now() };
    sourceStatus.cityspark.count = events.length;
    sourceStatus.cityspark.ok = true;
    sourceStatus.cityspark.error = null;
    return events;
  } catch (err) {
    console.warn('[Events] CitySpark error:', err);
    sourceStatus.cityspark.ok = false;
    sourceStatus.cityspark.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// FAIRPORT FESTIVALS (village festival & concert season — curated)
// Emits source:'towns' — the shared "Town Events" tab it shares with Pittsford.
// ────────────────────────────────────────────────────────────────

/**
 * The Fairport/Perinton festival season, transcribed from the FairportFestivals.com
 * season poster. It is a fixed, published-once-a-year schedule that fits in a table,
 * so it lives here as data rather than as a scrape. If the village ever publishes an
 * ICS feed, prefer subscribing to it (either here or via the hub's ICS subscriptions)
 * over maintaining this table.
 *
 * MAINTENANCE: this is the 2026 season. Once those dates pass the source simply
 * returns nothing (everything is filtered to today..+35 days) — refresh the table
 * from the new poster each spring.
 *
 * Every event is placed at the village centre. Fairport's venues (Kennelly Park,
 * Center Park, the Village Landing) are all within about a mile of it, which is
 * far below the resolution of the drive-time radius filter, so the real venue is
 * carried as text in `address` instead of as its own coordinates.
 */
const FAIRPORT_VILLAGE = { lat: 43.0987, lon: -77.4425 };  // Fairport, NY
const FAIRPORT_MAX_MILES = 60;      // skip the source entirely for far-away searches
const FAIRPORT_URL = 'https://fairportfestivals.com/';

// One-off events. `days` = consecutive dates the event runs (one card per day).
// `time` is local 24h, or null for an all-day / start-time-unpublished event.
const FAIRPORT_SCHEDULE = [
  { date: '2026-03-01', title: 'Savor the Flavor',                        type: 'food',     host: 'Fairport Rotary' },
  { date: '2026-03-01', title: 'Fairport Museum Opens for the Season',    type: 'art',      host: 'Perinton Historical Society' },
  { date: '2026-04-12', title: 'Empty Bowls Fundraiser',                  type: 'food',     host: 'Fairport Perinton Partnership', note: 'Fundraiser for the Perinton Food Shelf' },
  { date: '2026-04-22', title: 'Clean Sweep!',            days: 5,        type: 'activity', host: 'Fairport Perinton Partnership' },
  { date: '2026-05-25', title: 'Memorial Day Parade',     time: '10:00',  type: 'activity', host: 'Perinton VFW', note: 'Ceremony begins after the parade' },
  { date: '2026-06-05', title: 'Canal Nights / Chicken BBQ', days: 2,     type: 'food',     host: 'Fairport Perinton Merchants Association' },
  { date: '2026-06-06', title: 'Canal Days',              days: 2,        type: 'activity', host: 'Fairport Perinton Merchants Association' },
  { date: '2026-06-16', title: "Children's Concert at The Gazebo", time: '18:30', type: 'concert', host: 'Town of Perinton', venue: 'Kennelly Park' },
  { date: '2026-07-04', title: 'Independence Day Run',    time: '08:00',  type: 'sports',   host: 'Fairport Perinton Chamber of Commerce' },
  { date: '2026-07-04', title: 'Independence Day Parade', time: '10:00',  type: 'activity', host: 'Fairport Perinton Chamber of Commerce' },
  { date: '2026-07-04', title: 'Party in the Park',       time: '12:00',  type: 'activity', host: 'Fairport Perinton Chamber of Commerce' },
  { date: '2026-07-13', title: 'Cycle the Erie Canal',                    type: 'hike',     host: 'Fairport Perinton Partnership' },
  { date: '2026-07-21', title: "Children's Concert at The Gazebo", time: '18:30', type: 'concert', host: 'Town of Perinton', venue: 'Kennelly Park' },
  { date: '2026-07-25', title: 'Steel Rail Festival',                     type: 'activity', host: 'Steel Rail Festival' },
  { date: '2026-08-18', title: "Children's Concert at The Gazebo", time: '18:30', type: 'concert', host: 'Town of Perinton', venue: 'Kennelly Park' },
  { date: '2026-08-28', title: 'Fairport Music Festival', days: 2,        type: 'concert',  host: 'Fairport Music Festival' },
  { date: '2026-09-24', title: 'Oktoberfest',             days: 3,        type: 'food',     host: 'Fairport Perinton Partnership' },
  { date: '2026-09-26', title: 'Scarecrow Festival',                      type: 'activity', host: 'Fairport Perinton Merchants Association' },
  { date: '2026-09-26', title: 'Plein Air Paint-Out',                     type: 'art',      host: 'Fairport Public Art Committee' },
  { date: '2026-11-21', title: 'Savor the Season',                        type: 'food',     host: 'Perinton Historical Society' },
  { date: '2026-12-05', title: 'Come Home for the Holidays', days: 2,     type: 'activity', host: 'FPMA & Fairport Perinton Partnership' }
];

// Weekly series — one occurrence every 7 days from `start` through `end` inclusive.
const FAIRPORT_WEEKLY = [
  { title: "Fairport Farmers Market",   start: '2026-05-09', end: '2026-11-21', time: '08:00', type: 'food',    host: 'Village of Fairport', note: '8am–noon, Saturdays' },
  { title: 'Gazebo Concerts',           start: '2026-06-11', end: '2026-08-13', time: '19:00', type: 'concert', host: 'Town of Perinton & Fairport Library', venue: 'Kennelly Park', note: 'Thursday evenings' },
  { title: 'Sunday Center Stage Concert', start: '2026-06-28', end: '2026-08-23', time: '18:00', type: 'concert', host: 'Town of Perinton', venue: 'Center Park', note: 'Start times may vary' }
];

/** Add `n` days to a YYYY-MM-DD string and return YYYY-MM-DD (DST-safe: noon UTC). */
function addDaysISO(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

/** Expand the curated tables into one dated event per occurrence. */
function expandFairportSchedule() {
  const out = [];

  const push = (entry, date, dayIndex, dayCount) => {
    const venue = entry.venue || 'Fairport Village';
    const parts = [entry.host];
    if (entry.note) parts.push(entry.note);
    if (dayCount > 1) parts.push(`Day ${dayIndex + 1} of ${dayCount}`);
    out.push({
      id: `fp_${date}_${entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: entry.title,
      type: entry.type,
      source: 'towns',
      sourceUrl: FAIRPORT_URL,
      date,
      time: entry.time || null,
      duration: null,
      location: {
        city: 'Fairport', state: 'NY',
        address: venue,
        lat: FAIRPORT_VILLAGE.lat,
        lon: FAIRPORT_VILLAGE.lon,
        distanceMiles: null
      },
      description: parts.filter(Boolean).join(' · '),
      image: null,
      weather: null
    });
  };

  for (const entry of FAIRPORT_SCHEDULE) {
    const days = entry.days || 1;
    for (let i = 0; i < days; i++) push(entry, addDaysISO(entry.date, i), i, days);
  }

  for (const series of FAIRPORT_WEEKLY) {
    for (let date = series.start; date <= series.end; date = addDaysISO(date, 7)) {
      push(series, date, 0, 1);
    }
  }

  return out;
}

async function fetchFairport(city, state, lat, lon) {
  try {
    // Region gate — a village calendar is only worth showing to nearby searches
    if (calculateDistance(lat, lon, FAIRPORT_VILLAGE.lat, FAIRPORT_VILLAGE.lon) > FAIRPORT_MAX_MILES) {
      sourceStatus.towns.count = 0;
      return [];
    }

    // Local data, but still windowed so an out-of-date table quietly returns nothing
    const today = new Date().toISOString().split('T')[0];
    const horizon = addDaysISO(today, 35);
    const events = expandFairportSchedule().filter(e => e.date >= today && e.date <= horizon);

    sourceStatus.towns.count = events.length;
    sourceStatus.towns.ok = true;
    sourceStatus.towns.error = null;
    return events;
  } catch (err) {
    console.warn('[Events] Fairport error:', err);
    sourceStatus.towns.ok = false;
    sourceStatus.towns.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────

function extractSettledValue(settledPromise, sourceName) {
  if (settledPromise.status === 'fulfilled') {
    return settledPromise.value || [];
  } else {
    console.warn(`[Events] ${sourceName} failed:`, settledPromise.reason);
    return [];
  }
}

function normalizeEventType(tmType) {
  if (!tmType) return 'activity';
  const type = tmType.toLowerCase();
  if (type.includes('music') || type.includes('concert')) return 'concert';
  if (type.includes('sport')) return 'sports';
  if (type.includes('theater') || type.includes('theatre') || type.includes('show') || type.includes('performing')) return 'show';
  if (type.includes('comedy')) return 'comedy';
  if (type.includes('sale') || type.includes('estate') || type.includes('garage')) return 'sale';
  if (type.includes('hike') || type.includes('trail') || type.includes('outdoor') || type.includes('nature')) return 'hike';
  if (type.includes('class') || type.includes('workshop') || type.includes('seminar') || type.includes('course')) return 'class';
  if (type.includes('food') || type.includes('festival') || type.includes('wine') || type.includes('dinner') || type.includes('tasting')) return 'food';
  if (type.includes('art') || type.includes('exhibition') || type.includes('gallery') || type.includes('museum')) return 'art';
  return 'activity';
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;  // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deduplicateEvents(events) {
  const seen = new Set();
  return events.filter(e => {
    const key = `${e.title}|${e.date}|${e.location.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterEventsByDistanceAndDate(events, radiusMinutes, searchLat, searchLon) {
  const radiusMiles = radiusMinutes / 60 * 70;  // Rough approximation: ~70 mph
  const today = new Date().toISOString().split('T')[0];
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return events.filter(e => {
    if (!e.location.lat || !e.location.lon) return false;

    // Dateless items (e.g. OSM "things to do") are always-available — keep them
    // and let distance decide. Dated events must fall within today..+30 days.
    if (e.date && (e.date < today || e.date > nextMonth)) return false;

    const dist = calculateDistance(
      searchLat, searchLon,
      e.location.lat, e.location.lon
    );
    e.location.distanceMiles = Math.round(dist * 10) / 10;
    return dist <= radiusMiles;
  });
}

async function addWeatherContext(event, forecasts = new Map()) {
  try {
    if (!event.date) return event;

    const key = process.env.OWM_KEY;
    if (!key) return event;

    // Events share a forecast with everything else in their ~1° (≈100km) cell
    const cell = `${Math.round(event.location.lat)},${Math.round(event.location.lon)}`;
    if (!forecasts.has(cell)) forecasts.set(cell, fetchWithRetry(async () => {
      const params = new URLSearchParams({
        lat: event.location.lat,
        lon: event.location.lon,
        appid: key,
        units: 'imperial'
      });

      const r = await fetch(`${OWM_API_BASE}/forecast?${params}`);
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      return r.json();
    }, 'Weather', 1));  // Single retry for weather (less critical)
    const data = await forecasts.get(cell);

    const eventDate = event.date;
    const dayForecasts = (data.list || []).filter(f => f.dt_txt.startsWith(eventDate));

    if (dayForecasts.length === 0) return event;

    const avgTemp = Math.round(dayForecasts.reduce((s, f) => s + f.main.temp, 0) / dayForecasts.length);
    const condition = dayForecasts[0]?.weather?.[0]?.main || 'Unknown';
    const maxPrecip = Math.max(...dayForecasts.map(f => f.pop || 0));

    event.weather = {
      condition,
      temp: avgTemp,
      precipitation: Math.round(maxPrecip * 100)
    };

    return event;
  } catch (err) {
    // Silently continue if weather fails
    console.warn('[Events] Weather enrichment failed (non-critical):', err.message);
    return event;
  }
}

// ────────────────────────────────────────────────────────────────
// RESPONSE HELPERS
// ────────────────────────────────────────────────────────────────

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

// ────────────────────────────────────────────────────────────────
// Test-only exports (Netlify uses exports.handler; these are extra and
// harmless in production — they let tests/ unit-test the pure helpers).
// ────────────────────────────────────────────────────────────────
exports._test = {
  normalizeEventType,
  calculateDistance,
  icalUnescape,
  icalToLocal,
  parseICal,
  dateToEastern,
  addDaysISO,
  expandFairportSchedule,
  fetchFairport,
  stripHtml,
  parsePittsfordEvents
};
