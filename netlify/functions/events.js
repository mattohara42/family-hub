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

// ────────────────────────────────────────────────────────────────
// EVENTBRITE CATEGORY CACHE
// ────────────────────────────────────────────────────────────────

// In-memory cache for Eventbrite categories/subcategories.
// TTL: 24 hours. Memoized to avoid repeated API calls.
let categoryCache = {
  categories: {},      // { id: "name" } mapping
  subcategories: {},   // { id: "name" } mapping
  timestamp: null      // when cache was populated
};

// 24 hours in milliseconds
const CATEGORY_CACHE_TTL = 24 * 60 * 60 * 1000;

// Hardcoded fallback categories (top-level Eventbrite categories)
// Used if API fetch fails, ensures graceful degradation
const FALLBACK_CATEGORIES = {
  '1': 'Music',
  '6': 'Food & Drink',
  '11': 'Business & Professional',
  '13': 'Charity & Causes',
  '19': 'Classes & Workshops',
  '21': 'Community & Culture',
  '22': 'Family & Education',
  '25': 'Film, Media & Entertainment',
  '31': 'Hobbies & Special Interests',
  '34': 'Performing & Visual Arts',
  '40': 'Science & Technology',
  '41': 'Sports & Fitness',
  '114': 'Travel & Outdoor'
};

// Source status tracking for this request
const sourceStatus = {
  ticketmaster: { ok: true, count: 0, error: null },
  eventbrite: { ok: true, count: 0, error: null },
  estatesales: { ok: true, count: 0, error: null },
  craigslist: { ok: true, count: 0, error: null },
  alltrails: { ok: true, count: 0, error: null }
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
    // Step 0: Ensure category cache is populated (lazy initialization)
    await ensureCategoryCache();

    // Step 1: Geocode location (city → lat/lon)
    const { lat, lon, city, state } = await geocodeLocation(location);
    if (!lat || !lon) {
      return json(400, { error: `Could not geocode location: ${location}` });
    }

    // Step 2: Fetch from all sources in parallel
    const [tmEvents, ebEvents, estateSalesEvents, craigslistEvents, alltrailsEvents] = await Promise.allSettled([
      fetchTicketmaster(city, state, lat, lon, { keyword, attractionId, venueId }),
      fetchEventbrite(lat, lon),
      scrapeEstateSales(city, state, lat, lon),
      scrapeCraigslist(city, state, lat, lon),
      scrapeAllTrails(city, state, lat, lon)
    ]);

    // Collect all results
    const allEvents = [
      ...extractSettledValue(tmEvents, 'ticketmaster'),
      ...extractSettledValue(ebEvents, 'eventbrite'),
      ...extractSettledValue(estateSalesEvents, 'estatesales'),
      ...extractSettledValue(craigslistEvents, 'craigslist'),
      ...extractSettledValue(alltrailsEvents, 'alltrails')
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
// CATEGORY FETCHING & CACHING
// ────────────────────────────────────────────────────────────────

/**
 * Fetch and cache Eventbrite categories and subcategories.
 * Called on startup (via first event search) and refreshed every 24 hours.
 *
 * Pattern: Mirrors fetchWithRetry() for consistency. On failure, gracefully
 * falls back to hardcoded category list. Categories are memoized in memory
 * to avoid repeated API calls within the 24-hour window.
 */
async function ensureCategoryCache() {
  // Check if cache is still valid (within TTL)
  if (categoryCache.timestamp && Date.now() - categoryCache.timestamp < CATEGORY_CACHE_TTL) {
    return categoryCache;
  }

  try {
    const key = process.env.EVENTBRITE_KEY;
    if (!key) {
      console.warn('[Events] EVENTBRITE_KEY not set, using fallback categories');
      categoryCache.categories = FALLBACK_CATEGORIES;
      categoryCache.timestamp = Date.now();
      return categoryCache;
    }

    // Fetch both categories and subcategories in parallel
    const [categoriesResult, subcategoriesResult] = await Promise.allSettled([
      fetchWithRetry(async () => {
        const params = new URLSearchParams({ token: key });
        const r = await fetch(`${EB_API_BASE}/categories/?${params}`);
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      }, 'Eventbrite Categories', 1),  // Single retry for reference data
      fetchWithRetry(async () => {
        const params = new URLSearchParams({ token: key });
        const r = await fetch(`${EB_API_BASE}/subcategories/?${params}`);
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      }, 'Eventbrite Subcategories', 1)
    ]);

    // Process categories
    if (categoriesResult.status === 'fulfilled' && categoriesResult.value?.categories) {
      categoriesResult.value.categories.forEach(cat => {
        categoryCache.categories[cat.id] = cat.name;
      });
    }

    // Process subcategories
    if (subcategoriesResult.status === 'fulfilled' && subcategoriesResult.value?.subcategories) {
      subcategoriesResult.value.subcategories.forEach(subcat => {
        categoryCache.subcategories[subcat.id] = subcat.name;
      });
    }

    // If either fetch failed but we got some data, that's ok
    if (Object.keys(categoryCache.categories).length === 0) {
      console.warn('[Events] Category fetch returned no data, using fallback');
      categoryCache.categories = FALLBACK_CATEGORIES;
    }

    categoryCache.timestamp = Date.now();
    console.log('[Events] Categories cached:', {
      categories: Object.keys(categoryCache.categories).length,
      subcategories: Object.keys(categoryCache.subcategories).length
    });

    return categoryCache;
  } catch (err) {
    console.warn('[Events] Category caching failed, using fallback:', err.message);
    categoryCache.categories = FALLBACK_CATEGORIES;
    categoryCache.timestamp = Date.now();
    return categoryCache;
  }
}

/**
 * Look up category name by ID.
 * Returns the official Eventbrite category/subcategory name if found,
 * otherwise returns the ID as a fallback.
 */
function getCategoryName(categoryId) {
  if (!categoryId) return null;
  // Check subcategories first (more specific), then top-level categories
  return categoryCache.subcategories[categoryId] ||
         categoryCache.categories[categoryId] ||
         null;
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
      // Build base params (always included)
      const params = new URLSearchParams({
        apikey: key,
        latlong: `${lat},${lon}`,
        radius: 120,  // km (API default ~100, we expand to 120)
        size: 50,     // Results limit (max 200)
        sort: 'date,asc'  // Sort by date ascending
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
        description: e.description || '',
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
// API: EVENTBRITE
// ────────────────────────────────────────────────────────────────

/**
 * Eventbrite event fetching with venue enrichment.
 * Fetches events from Eventbrite API v3 with expand=venue to include venue details inline.
 *
 * Venue enrichment strategy:
 * - Eventbrite /events/search endpoint supports expand=venue parameter
 * - This includes full venue object in each event response (no separate call needed)
 * - We extract: name, address, capacity, website, accessibility fields
 * - Gracefully handles missing/null venue fields (won't break event display)
 * - Single API call per request (no bulk venue enrichment needed)
 *
 * See docs/API_RESEARCH.md for full Eventbrite endpoint catalog (61 endpoints across 13 resources).
 */
async function fetchEventbrite(lat, lon) {
  // Eventbrite API v3: /events/search endpoint with expand=venue
  // Currently using location/date filters with venue expansion. Could enhance with:
  //   - GET /categories, /subcategories: improved event type taxonomy (U1 completed)
  //   - GET /venues/{id}: separate venue detail calls (not needed; using expand instead)
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

    const results = events.map(e => {
      // Enrich with Eventbrite official category/subcategory if available
      let category = null;
      if (e.category_id) {
        category = {
          id: e.category_id,
          name: getCategoryName(e.category_id) || 'Activity'
        };
      }
      if (e.subcategory_id) {
        category = {
          id: e.subcategory_id,
          name: getCategoryName(e.subcategory_id) || 'Activity'
        };
      }

      // Enrich venue data from Eventbrite's expand=venue response
      // Eventbrite includes venue details in e.venue when expand=venue is used
      // Extract capacity, ratings, and accessibility info if available; graceful fallback if missing
      const ebVenue = e.venue ? {
        name: e.venue.name || null,
        address: e.venue.address?.address_1 || null,
        city: e.venue.address?.city || '',
        state: e.venue.address?.region || '',
        capacity: e.venue.capacity || null,  // May be null; graceful handling
        website: e.venue.address?.website || null,
        // Accessibility: Eventbrite may include in venue.address or separate field
        accessibility: {
          wheelchairAccess: e.venue.address?.wheelchair_access ?? false,
          parking: e.venue.address?.parking || false,
          transit: e.venue.address?.public_transit_info || null
        }
      } : null;

      return {
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
          distanceMiles: null,
          venue: ebVenue  // Enrich with venue details
        },
        description: e.description?.text || '',
        weather: null,
        category: category  // Official Eventbrite category metadata (optional)
      };
    });

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

// State to Craigslist region mapping
const STATE_TO_CRAIGSLIST_REGION = {
  'AL': 'alabama', 'AK': 'anchorage', 'AZ': 'phoenix', 'AR': 'littlerock', 'CA': 'sfbay',
  'CO': 'denver', 'CT': 'newhaven', 'DE': 'delaware', 'FL': 'miami', 'GA': 'atlanta',
  'HI': 'honolulu', 'ID': 'boise', 'IL': 'chicago', 'IN': 'indianapolis', 'IA': 'desmoines',
  'KS': 'kansas', 'KY': 'louisville', 'LA': 'neworleans', 'ME': 'maine', 'MD': 'baltimore',
  'MA': 'boston', 'MI': 'detroit', 'MN': 'minneapolis', 'MS': 'jackson', 'MO': 'stlouis',
  'MT': 'missoula', 'NE': 'omaha', 'NV': 'lasvegas', 'NH': 'nh', 'NJ': 'newjersey',
  'NM': 'albuquerque', 'NY': 'newyork', 'NC': 'raleigh', 'ND': 'northdakota', 'OH': 'columbus',
  'OK': 'oklahomacity', 'OR': 'portland', 'PA': 'philadelphia', 'RI': 'providence', 'SC': 'charleston',
  'SD': 'southdakota', 'TN': 'memphis', 'TX': 'dallas', 'UT': 'saltlakecity', 'VT': 'vermont',
  'VA': 'roanoke', 'WA': 'seattle', 'WV': 'huntington', 'WI': 'madison', 'WY': 'wyoming'
};

async function scrapeCraigslist(city, state, lat, lon) {
  try {
    const cheerio = require('cheerio');

    const region = STATE_TO_CRAIGSLIST_REGION[state] || 'craigslist';
    const searchUrl = `https://${region}.craigslist.org/search/eee`;

    const r = await fetchWithRetry(async () => {
      return fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Family Hub Event Discovery)' }
      });
    }, 'Craigslist');

    if (!r.ok) {
      sourceStatus.craigslist.ok = false;
      sourceStatus.craigslist.error = r.status === 403 ? 'rate_limited' : `HTTP ${r.status}`;
      return [];
    }

    const html = await r.text();
    const $ = cheerio.load(html);

    const events = [];

    // Parse Craigslist listings (ol#search-results li.cl-search-result)
    $('li.cl-search-result').each((i, elem) => {
      try {
        const titleElem = $(elem).find('a.titlestring');
        const title = titleElem.text().trim();
        const url = titleElem.attr('href');

        if (!title || !url) return;

        // Craigslist shows relative posting time
        const timeElem = $(elem).find('.result-date');
        const timeText = timeElem.text().trim();

        // Parse relative date (e.g., "3 hours ago", "1 day ago", "yesterday")
        let date = new Date().toISOString().split('T')[0];
        if (timeText) {
          const match = timeText.match(/(\d+)\s*(hour|day|week)s?\s+ago|yesterday|today/i);
          if (match) {
            const now = new Date();
            if (match[0].toLowerCase().includes('hour')) {
              // Same day
              date = now.toISOString().split('T')[0];
            } else if (match[0].toLowerCase().includes('yesterday')) {
              now.setDate(now.getDate() - 1);
              date = now.toISOString().split('T')[0];
            } else if (match[0].toLowerCase().includes('day')) {
              const days = parseInt(match[1]) || 1;
              now.setDate(now.getDate() - days);
              date = now.toISOString().split('T')[0];
            } else if (match[0].toLowerCase().includes('week')) {
              const weeks = parseInt(match[1]) || 1;
              now.setDate(now.getDate() - (weeks * 7));
              date = now.toISOString().split('T')[0];
            }
          }
        }

        // Extract location (price is optional)
        const priceElem = $(elem).find('.result-price');
        const price = priceElem.text().trim();

        events.push({
          id: `cl_${url.split('/').pop()}`,
          title: title,
          type: normalizeEventType(title),
          source: 'craigslist',
          sourceUrl: url.startsWith('http') ? url : `https://${region}.craigslist.org${url}`,
          date: date,
          time: null,
          duration: null,
          location: {
            city: city,
            state: state,
            address: price ? `${title} - ${price}` : title,
            lat: lat,
            lon: lon,
            distanceMiles: null
          },
          description: title,
          weather: null
        });
      } catch (itemErr) {
        console.warn('[Events] Error parsing Craigslist item:', itemErr);
      }
    });

    sourceStatus.craigslist.count = events.length;
    sourceStatus.craigslist.ok = true;
    sourceStatus.craigslist.error = null;
    return events;
  } catch (err) {
    console.warn('[Events] Craigslist scraping error:', err);
    sourceStatus.craigslist.ok = false;
    sourceStatus.craigslist.error = err.message;
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// SCRAPING: ALLTRAILS API
// ────────────────────────────────────────────────────────────────

async function scrapeAllTrails(city, state, lat, lon) {
  try {
    const apiKey = process.env.ALLTRAILS_API_KEY;
    if (!apiKey) {
      sourceStatus.alltrails.ok = false;
      sourceStatus.alltrails.error = 'API key not configured';
      return [];
    }

    const searchUrl = `https://www.alltrails.com/api/v1/trails`;
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      radius: '50',
      sort: 'distance',
      limit: '25'
    });

    const r = await fetchWithRetry(async () => {
      return fetch(`${searchUrl}?${params}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'Mozilla/5.0 (Family Hub Event Discovery)'
        }
      });
    }, 'AllTrails');

    if (!r.ok) {
      if (r.status === 401) {
        sourceStatus.alltrails.error = 'invalid_api_key';
      } else if (r.status === 429) {
        sourceStatus.alltrails.error = 'rate_limit';
      } else {
        sourceStatus.alltrails.error = `HTTP ${r.status}`;
      }
      sourceStatus.alltrails.ok = false;
      return [];
    }

    const data = await r.json();
    const trails = data.data || [];

    const events = [];

    trails.forEach((trail) => {
      try {
        if (!trail.name || !trail.id) return;

        // Estimate duration from distance (assume 2 mph average hiking speed)
        const distance = parseFloat(trail.distance) || 0;
        const duration = distance > 0 ? Math.ceil((distance / 2) * 60) : null;

        // Build description with difficulty and elevation
        const difficulty = trail.difficulty_rating ? trail.difficulty_rating.toUpperCase() : 'MODERATE';
        const elevation = trail.elevation_gain ? ` +${Math.round(trail.elevation_gain)} ft` : '';
        const miles = distance > 0 ? ` ${trail.distance} mi` : '';
        const description = `${difficulty}${miles}${elevation}`;

        events.push({
          id: `at_${trail.id}`,
          title: trail.name,
          type: 'hike',
          source: 'alltrails',
          sourceUrl: `https://www.alltrails.com/trail/${trail.id}`,
          date: null, // Trails are recurring, no specific event date
          time: null,
          duration: duration,
          location: {
            city: city,
            state: state,
            address: trail.location ? trail.location : trail.name,
            lat: trail.latitude || lat,
            lon: trail.longitude || lon,
            distanceMiles: distance > 0 ? distance : null
          },
          description: description,
          weather: null
        });
      } catch (trailErr) {
        console.warn('[Events] Error parsing AllTrails trail:', trailErr);
      }
    });

    sourceStatus.alltrails.count = events.length;
    sourceStatus.alltrails.ok = true;
    sourceStatus.alltrails.error = null;
    return events;
  } catch (err) {
    console.warn('[Events] AllTrails scraping error:', err);
    sourceStatus.alltrails.ok = false;
    sourceStatus.alltrails.error = err.message;
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
