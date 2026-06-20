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

const TM_API_BASE = 'https://app.ticketmaster.com/discovery/v2';
const OWM_API_BASE = 'https://api.openweathermap.org/data/2.5';
const OWM_GEO_BASE = 'https://api.openweathermap.org/geo/1.0';

// Source status tracking for this request
const sourceStatus = {
  ticketmaster: { ok: true, count: 0, error: null },
  osm: { ok: true, count: 0, error: null }
};

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
    const { lat, lon, city, state } = await geocodeLocation(location);
    if (!lat || !lon) {
      return json(400, { error: `Could not geocode location: ${location}` });
    }

    // Step 2: Fetch from all sources in parallel
    const [tmEvents, osmEvents] = await Promise.allSettled([
      fetchTicketmaster(city, state, lat, lon, { keyword, attractionId, venueId }),
      fetchOpenStreetMap(city, state, lat, lon, radiusMinutes)
    ]);

    // Collect all results
    const allEvents = [
      ...extractSettledValue(tmEvents, 'ticketmaster'),
      ...extractSettledValue(osmEvents, 'osm')
    ];

    // Step 3: Remove duplicates by title + date + venue
    const uniqueEvents = deduplicateEvents(allEvents);

    // Step 4: Filter by distance and date
    const filteredEvents = filterEventsByDistanceAndDate(uniqueEvents, radiusMinutes, lat, lon);

    // Step 5: Add weather context to each event
    const withWeather = await Promise.all(
      filteredEvents.map(e => addWeatherContext(e))
    );

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
        osm: sourceStatus.osm.count
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

    const data = await fetchWithRetry(async () => {
      const params = new URLSearchParams({ q: location, limit: 1, appid: key });
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
  if (type.includes('theater') || type.includes('show') || type.includes('performing')) return 'show';
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

async function addWeatherContext(event) {
  try {
    if (!event.date) return event;

    const key = process.env.OWM_KEY;
    if (!key) return event;

    const data = await fetchWithRetry(async () => {
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
    }, 'Weather', 1);  // Single retry for weather (less critical)

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
