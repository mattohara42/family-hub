/**
 * Netlify Function: Event Discovery Aggregator
 * Fetches from Ticketmaster, Eventbrite APIs + scrapes estatesales.net, Craigslist
 * Normalizes, geocodes, adds weather context, filters by distance/date
 * Client calls: /.netlify/functions/events?location=<city>&radius=<minutes>&eventTypes=<comma-sep>
 *
 * API Integration Notes:
 * - Eventbrite: Uses /events/search endpoint (v3 API). Could leverage categories, venues,
 *   subcategories endpoints for enhanced filtering. See docs/API_RESEARCH.md for full endpoint list.
 * - Ticketmaster: Uses /events.json endpoint (Discovery v2 API). Available params include
 *   keyword, attractionId, venueId for advanced filtering. See docs/API_RESEARCH.md for details.
 * - OpenWeatherMap: Geocoding (direct API) + Forecast (data.2.5/forecast for weather context)
 * - Retry strategy: Exponential backoff (1s, 2s, 4s max). Gracefully handles partial source failures.
 *
 * Performance: Parallel source fetching via Promise.allSettled. Weather enrichment happens
 * after aggregation. Distance filtering uses Haversine formula (see calculateDistance).
 */

const TM_API_BASE = 'https://app.ticketmaster.com/discovery/v2';
const EB_API_BASE = 'https://www.eventbriteapi.com/v3';
const OWM_API_BASE = 'https://api.openweathermap.org/data/2.5';
const OWM_GEO_BASE = 'https://api.openweathermap.org/geo/1.0';

// Source status tracking for this request
const sourceStatus = {
  ticketmaster: { ok: true, count: 0, error: null },
  eventbrite: { ok: true, count: 0, error: null },
  estatesales: { ok: true, count: 0, error: null },
  craigslist: { ok: true, count: 0, error: null }
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
  const { location, radius, eventTypes } = qs;

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
    const [tmEvents, ebEvents, estateSalesEvents, craigslistEvents] = await Promise.allSettled([
      fetchTicketmaster(city, state, lat, lon),
      fetchEventbrite(lat, lon),
      scrapeEstateSales(city, state, lat, lon),
      scrapeCraigslist(city, state, lat, lon)
    ]);

    // Collect all results
    const allEvents = [
      ...extractSettledValue(tmEvents, 'ticketmaster'),
      ...extractSettledValue(ebEvents, 'eventbrite'),
      ...extractSettledValue(estateSalesEvents, 'estatesales'),
      ...extractSettledValue(craigslistEvents, 'craigslist')
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
        eventbrite: sourceStatus.eventbrite.count,
        estatesales: sourceStatus.estatesales.count,
        craigslist: sourceStatus.craigslist.count
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

async function fetchTicketmaster(city, state, lat, lon) {
  // Ticketmaster Discovery API v2: /events.json endpoint
  // Currently using basic location/date/size params. Could enhance with:
  //   - attractionId: pre-filter by artist/performer
  //   - keyword: text search in event name
  //   - venueId: filter to specific venue
  // See docs/API_RESEARCH.md for full parameter reference.

  try {
    const key = process.env.TICKETMASTER_KEY;
    if (!key) {
      console.warn('[Events] TICKETMASTER_KEY not set');
      sourceStatus.ticketmaster.ok = false;
      sourceStatus.ticketmaster.error = 'API key not configured';
      return [];
    }

    const data = await fetchWithRetry(async () => {
      const params = new URLSearchParams({
        apikey: key,
        latlong: `${lat},${lon}`,
        radius: 120,  // km (API default ~100, we expand to 120)
        size: 50,     // Results limit (max 200)
        sort: 'date,asc'  // Sort by date ascending
      });

      const r = await fetch(`${TM_API_BASE}/events.json?${params}`);
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      return r.json();
    }, 'Ticketmaster');

    const events = data._embedded?.events || [];

    const results = events.map(e => ({
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
        distanceMiles: null  // Will calculate
      },
      description: e.description || '',
      weather: null
    }));

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
// API: EVENTBRITE
// ────────────────────────────────────────────────────────────────

async function fetchEventbrite(lat, lon) {
  // Eventbrite API v3: /events/search endpoint
  // Currently using location/date filters with venue expansion. Could enhance with:
  //   - GET /categories, /subcategories: improved event type taxonomy
  //   - GET /venues/{id}: venue capacity, ratings, accessibility info
  //   - Advanced filters: price range, ticket availability, free vs. paid
  // See docs/API_RESEARCH.md for full endpoint catalog (61 endpoints across 13 resources).

  try {
    const key = process.env.EVENTBRITE_KEY;
    if (!key) {
      console.warn('[Events] EVENTBRITE_KEY not set');
      sourceStatus.eventbrite.ok = false;
      sourceStatus.eventbrite.error = 'API key not configured';
      return [];
    }

    const data = await fetchWithRetry(async () => {
      const params = new URLSearchParams({
        token: key,
        'location.latitude': lat,
        'location.longitude': lon,
        'location.within': '120km',  // Search radius
        'start_date.range_start': new Date().toISOString().split('T')[0],  // Today
        'start_date.range_end': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],  // +7 days
        'sort_by': 'date',
        'expand': 'venue'  // Include venue data in response
      });

      const r = await fetch(`${EB_API_BASE}/events/search/?${params}`);
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      return r.json();
    }, 'Eventbrite');

    const events = data.events || [];

    const results = events.map(e => ({
      id: `eb_${e.id}`,
      title: e.name?.text || 'Event',
      type: 'activity',  // Eventbrite doesn't always categorize clearly
      source: 'eventbrite',
      sourceUrl: e.url,
      date: e.start?.local?.split('T')[0] || null,
      time: e.start?.local?.split('T')[1] || null,
      duration: null,
      location: {
        city: e.venue?.address?.city || '',
        state: e.venue?.address?.region || '',
        address: e.venue?.address?.address_1 || '',
        lat: parseFloat(e.venue?.address?.latitude) || lat,
        lon: parseFloat(e.venue?.address?.longitude) || lon,
        distanceMiles: null
      },
      description: e.description?.text || '',
      weather: null
    }));

    sourceStatus.eventbrite.count = results.length;
    sourceStatus.eventbrite.ok = true;
    sourceStatus.eventbrite.error = null;
    return results;
  } catch (err) {
    console.error('[Events] Eventbrite error:', err);
    sourceStatus.eventbrite.ok = false;
    sourceStatus.eventbrite.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// SCRAPING: ESTATESALES.NET
// ────────────────────────────────────────────────────────────────

async function scrapeEstateSales(city, state, lat, lon) {
  try {
    const cheerio = require('cheerio');

    // Search estatesales.net by city/state
    const searchUrl = `https://www.estatesales.net/en/search?city=${encodeURIComponent(city)}&state=${state}`;

    const r = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Family Hub Event Discovery)' }
    });
    if (!r.ok) {
      sourceStatus.estatesales.ok = false;
      return [];
    }

    const html = await r.text();
    const $ = cheerio.load(html);

    const events = [];

    // Parse estate sale listings
    $('div.item').each((i, elem) => {
      try {
        const titleElem = $(elem).find('a.overlay');
        const title = titleElem.text().trim();
        const url = titleElem.attr('href');

        if (!title || !url) return;

        const dateElem = $(elem).find('.dates');
        const dateText = dateElem.text().trim();

        const addressElem = $(elem).find('.address');
        const address = addressElem.text().trim();

        // Extract date (format varies; try to parse)
        let date = null;
        if (dateText) {
          const dateMatch = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (dateMatch) {
            const [, m, d, y] = dateMatch;
            date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
        }

        events.push({
          id: `es_${url.split('/').pop()}`,
          title: title,
          type: 'sale',
          source: 'estatesales',
          sourceUrl: url.startsWith('http') ? url : `https://www.estatesales.net${url}`,
          date: date,
          time: null,
          duration: null,
          location: {
            city: city,
            state: state,
            address: address,
            lat: lat,
            lon: lon,
            distanceMiles: null
          },
          description: dateText,
          weather: null
        });
      } catch (itemErr) {
        console.warn('[Events] Error parsing estate sale item:', itemErr);
      }
    });

    sourceStatus.estatesales.count = events.length;
    sourceStatus.estatesales.ok = true;
    sourceStatus.estatesales.error = null;
    return events;
  } catch (err) {
    console.warn('[Events] Estate sales scraping error:', err);
    sourceStatus.estatesales.ok = false;
    sourceStatus.estatesales.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// SCRAPING: CRAIGSLIST
// ────────────────────────────────────────────────────────────────

async function scrapeCraigslist(city, state, lat, lon) {
  try {
    // Placeholder: would scrape Craigslist activities section
    // For now, return empty; to be implemented with HTML parsing
    sourceStatus.craigslist.count = 0;
    return [];
  } catch (err) {
    console.warn('[Events] Craigslist scraping error:', err);
    sourceStatus.craigslist.ok = false;
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
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return events.filter(e => {
    if (!e.location.lat || !e.location.lon) return false;
    if (!e.date || e.date < today || e.date > nextWeek) return false;

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
