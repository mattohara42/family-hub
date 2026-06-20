---
title: "Event Discovery Feature — Implementation Plan"
date: 2026-06-18
status: Ready for Implementation
origin: docs/brainstorms/2026-06-18-event-discovery-requirements.md
---

# Event Discovery Feature — Implementation Plan

**Branch:** `feat/event-discovery`  
**Depth:** Deep (cross-cutting, multi-component, backend + frontend, stateful)

---

## Problem Frame

Family Hub users currently browse multiple separate websites (estatesales.net, Craigslist) to find interesting local activities and events. They want a single place to discover events matching their availability and weather context, without having to think about specific event types or exhaustively search categories.

**Core Insight:** Discovery and serendipity matter more than exhaustive search. The family wants "show me something fun this weekend when we're free" not "find me every concert in the next month."

---

## Requirements Traceability

This plan delivers the MVP scope from the requirements document:

- ✅ Event Discovery Modal (dedicated on-demand interface)
- ✅ Settings tab for location, distance, calendar overlay toggle
- ✅ Data sources: Ticketmaster API + Eventbrite API + estatesales.net scraping + Craigslist scraping
- ✅ Calendar integration: conflict detection + optional calendar overlay
- ✅ Weather context: display current/forecast conditions, mark weather-appropriate activities
- ✅ Geographic filtering: 2-hour radius (day-trip), 30-minute secondary for weekday events
- ✅ Caching: IndexedDB with stale-while-revalidate pattern
- ✅ Modal trigger: 💡 button on calendar header

**Out of Scope (Phase 2+):**
- AI-powered recommendations
- RSVP tracking / event persistence
- Notifications
- User ratings or reviews

---

## Key Technical Decisions

### 1. Backend Proxy for Web Scraping (Netlify Function)

**Decision:** Client-side scraping of estatesales.net and Craigslist is not viable for production. CORS security, anti-scraping measures (CAPTCHA, IP bans, behavioral fingerprinting), and HTML fragility require a server-side proxy.

**Implementation:** Netlify function (`/netlify/functions/events.js`) that:
- Fetches from Ticketmaster and Eventbrite APIs directly
- Scrapes estatesales.net and Craigslist (with rate limiting, User-Agent headers, error handling)
- Normalizes all responses into a uniform event schema
- Caches parsed results in Netlify environment (simple in-memory or key-value store)
- Returns events as JSON to the browser

**Why:** Decouples scraping maintenance from client code; rate limiting is server-side; HTML parsing is done server-side (no CORS; uses cheerio or similar); API keys are secured in Netlify env vars.

### 2. IndexedDB for Event Caching

**Decision:** Use IndexedDB (not localStorage) for event data. localStorage has ~5MB limit; event caches will grow beyond this. IndexedDB provides:
- Async non-blocking reads
- 50–500MB capacity
- Indexed queries (filter by type, distance, date)
- Structured data (events are objects, not serialized JSON)

**Schema:**
```js
// Store: "events"
// Indexes: by date, by type, by distance, by source
{
  key: "eventId",  // Unique across all sources
  id, title, type, source, sourceUrl,
  date, time, duration,
  location: { city, state, address, lat, lon, distanceMiles },
  description,
  weather: { condition, temp, precipitation },
  calendarConflict,
  fetchedAt  // Timestamp for cache invalidation
}

// Store: "eventCache"
// Metadata: timestamp, location, radius, events count
{
  key: "current",  // Only one active cache entry
  timestamp,
  location,
  radiusMinutes,
  eventCount,
  source: "combined"
}
```

### 3. Stale-While-Revalidate Caching

**Decision:** Return cached results immediately (even if 1–4 hours old), fetch fresh data in the background, update UI when new data arrives.

**Why:** Perceived performance is instant; data updates are non-blocking; network failures don't break the UI (we show cached data with age label).

**Implementation:**
- On modal open: read from IndexedDB, render immediately with `data-age="stale"` label
- Simultaneously: fetch fresh from `/.netlify/functions/events` (background, non-blocking)
- On success: update IndexedDB, re-render with fresh data
- On failure: keep showing cached data; show retry prompt

### 4. Geolocation Fallback Chain

**Decision:** Manual city input (primary) → Browser Geolocation API (optional) → IP geolocation (fallback).

**Why:**
- Manual input is always available, works offline, respects privacy
- Browser Geolocation API is accurate but requires permission (not guaranteed)
- IP geolocation is a safety net for mobile users on slow or denied permissions

**Flow:**
1. User enters city in Settings → stored in localStorage + Firestore (shared with family)
2. On modal open: use city from settings
3. User can tap "📍 Use current location" → triggers browser Geolocation API
4. If GPS denied/slow: offer IP geolocation lookup (one-shot, no tracking)
5. If all fail: fall back to last-known city

### 5. Simple Calendar Conflict Detection

**Decision:** Query family calendars for busy blocks at event time. If event overlaps any calendar event marked "busy" (default), flag it.

**Why:** Keep it simple for MVP. Future versions can add pattern recognition ("you always have dinner at 6pm") or smart exclusions.

**Implementation:**
- For each event: check if `startTime` to `endTime` overlaps any calendar event
- Calendar events already loaded in memory (from `calendarEvents` Firestore collection)
- Mark event with `calendarConflict: true/false`
- In UI: show ⚠️ if conflict, ✓ if free

---

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────────┐
│ BROWSER (Family Hub)                                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐     ┌──────────────────────┐     │
│  │ Settings Tab         │     │ Event Discovery      │     │
│  │ (Location, Prefs)    │     │ Modal                │     │
│  └──────────────────────┘     ├──────────────────────┤     │
│                                │ • Event cards        │     │
│  ┌──────────────────────┐     │ • Sorting/filtering  │     │
│  │ Calendar Header      │     │ • Age label          │     │
│  │ (💡 button → modal)  │     │ • Retry on failure   │     │
│  └──────────────────────┘     └──────────────────────┘     │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Calendar Overlay (optional)                          │   │
│  │ • Event indicators by type (Concerts, Hikes, etc)   │   │
│  │ • Click → event detail popover or modal             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ IndexedDB                                            │   │
│  │ • events store (title, date, location, etc)         │   │
│  │ • eventCache store (metadata, freshness)            │   │
│  │ • Indexed by date, type, distance                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │ fetch JSON                   │ read/write
         ↓                              ↓
┌─────────────────────────────────────────────────────────────┐
│ NETLIFY FUNCTION: /.netlify/functions/events.js             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Input: { location, radiusMinutes, eventTypes?, token }     │
│                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │ Ticketmaster   │  │ Eventbrite     │  │ Craigslist     │ │
│  │ API            │  │ API            │  │ Scraper        │ │
│  │ (5k/day free)  │  │ (1k/hr free)   │  │ (estatesales)  │ │
│  └────────────────┘  └────────────────┘  └────────────────┘ │
│         │                    │                    │          │
│         └────────────────────┼────────────────────┘          │
│                              │                               │
│                     ┌────────▼────────┐                      │
│                     │ Normalize &     │                      │
│                     │ Geocode         │                      │
│                     │ (location → lat │                      │
│                     │  /lon + distance)                     │
│                     └────────┬────────┘                      │
│                              │                               │
│                     ┌────────▼────────┐                      │
│                     │ Filter by:      │                      │
│                     │ • Distance      │                      │
│                     │ • Date range    │                      │
│                     │ • Type (opt)    │                      │
│                     └────────┬────────┘                      │
│                              │                               │
│                     ┌────────▼────────┐                      │
│                     │ Add Weather     │                      │
│                     │ Context         │                      │
│                     │ (OWM forecast)  │                      │
│                     └────────┬────────┘                      │
│                              │                               │
│                     ┌────────▼────────┐                      │
│                     │ Return JSON     │                      │
│                     │ (normalized     │                      │
│                     │  events[])      │                      │
│                     └────────────────┘                      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │
         │ HTTP GET /.netlify/functions/events?location=Portland&radius=120
         │
    ┌────┴──────────────────────────────────────────────────┐
    │ EXTERNAL SERVICES                                     │
    ├───────────────────────────────────────────────────────┤
    │ • Ticketmaster Discovery API                         │
    │ • Eventbrite API                                     │
    │ • estatesales.net (HTML scrape)                     │
    │ • Craigslist (HTML scrape)                          │
    │ • OpenWeatherMap (weather forecast)                 │
    └───────────────────────────────────────────────────────┘
```

**Data Flow:**

1. **Open Modal:**
   - Read settings (location, radius) from localStorage
   - Query IndexedDB for cached events
   - Render immediately with age label if cache exists
   - Fetch fresh from `/.netlify/functions/events` in background

2. **Backend Processing:**
   - Call Ticketmaster, Eventbrite, scrape estatesales.net, Craigslist
   - Normalize all responses to uniform schema
   - Geocode locations (city → lat/lon, calculate distance)
   - Fetch weather forecast for region
   - Filter by distance and date range
   - Mark calendar conflicts (server-side check against calendar list)
   - Return as JSON

3. **Browser Update:**
   - Receive fresh events, save to IndexedDB
   - Re-render modal with new data
   - Show age label as "updated just now"

4. **Error Handling:**
   - If fetch fails: show cached events with retry prompt
   - If scraper breaks: disable that source, log alert, show fallback message
   - If no events found: show "Try expanding your radius" suggestion

---

## Implementation Units

### U1. Settings Tab: "Events" Configuration

**Goal:** Add a new settings tab allowing users to configure location, distance, and calendar overlay preferences.

**Requirements:** Settings tab infrastructure exists; reuse pattern from Weather tab.

**Dependencies:** None (can be done first)

**Files:**
- `family-hub.html` — add `<div data-panel="events">` tab content
- `family-hub.css` — add `.events-panel` styles (minimal; inherit from existing)
- `family-hub.js` — add state variables, populate/save logic, form handlers

**Approach:**

1. **HTML Structure:**
   - Tab button: `<button data-tab="events">Events</button>` in `.modal-tabs`
   - Panel: `<div data-panel="events">` with form fields:
     - Location input (city name)
     - Max distance radio buttons (30 min, 1 hr, 2 hrs)
     - Checkbox: "Show events on calendar"
     - Multi-select: event types to show (Concerts, Hikes, Classes, etc.)

2. **JS State:**
   ```js
   let eventLocation = lsGet('fh_eventLocation', 'Portland');
   let eventMaxDistance = lsGet('fh_eventMaxDistance', 120);  // minutes
   let eventShowOnCalendar = lsGet('fh_eventShowOnCalendar', false);
   let eventCalendarTypes = lsGet('fh_eventCalendarTypes', []);
   ```

3. **openSettings() → populate tab:**
   - Set input value to `eventLocation`
   - Check radio matching `eventMaxDistance`
   - Set checkbox state for `eventShowOnCalendar`
   - Populate multi-select with `eventCalendarTypes`

4. **saveSettings() → persist:**
   - Read inputs
   - Update state variables
   - `localStorage.setItem('fh_eventLocation', eventLocation)`
   - Same for other settings
   - Trigger re-render of calendar (to update overlay visibility)

**Patterns to Follow:**
- Follow Weather tab structure (HTML lines 740–798, JS lines 8914–8928)
- Use `lsGet()` and `localStorage.setItem()` for persistence
- Validate location input (non-empty)

**Test Scenarios:**
1. Open Settings → Events tab → verify inputs are populated from localStorage
2. Change location, distance, toggles → click Save → verify localStorage updated
3. Reload page → verify settings persist
4. Change calendar overlay toggle → calendar view updates (shows/hides event indicators)
5. Invalid location input (empty) → show validation error

---

### U2. Netlify Function: Event Aggregation Backend

**Goal:** Create backend service to fetch from Ticketmaster, Eventbrite, scrape estatesales.net/Craigslist, normalize, geocode, and return event data.

**Requirements:** Integrate with existing Netlify setup; use environment variables for API keys.

**Dependencies:** None (independent of browser code; can be developed and tested in parallel)

**Files:**
- `netlify/functions/events.js` — main aggregation function
- `.env.local` (dev) and Netlify env vars (production) — API keys

**Approach:**

1. **Function Signature:**
   ```js
   // GET /.netlify/functions/events?location=Portland&radius=120&eventTypes=concert,hike
   // Returns: { success: true, events: [...], cached: false, timestamp }
   ```

2. **Implementation Steps:**

   a. **Parse Query Parameters:**
   - `location` (required): city name
   - `radius` (optional): minutes (default: 120)
   - `eventTypes` (optional): comma-separated types to filter
   - `token` (optional): for calendar conflict checking (future)

   b. **Parallel Fetches:**
   ```js
   const [tmResults, ebResults, crResults, estateResults] = await Promise.allSettled([
     fetchTicketmaster(location, radius),
     fetchEventbrite(location, radius),
     scrapeCraigslist(location, radius),
     scrapeEstateSales(location, radius)
   ]);
   ```

   c. **Normalize Each Source:**
   - Ticketmaster → extract title, date/time, venue, lat/lon, description
   - Eventbrite → extract title, date/time, location, description
   - Craigslist → parse HTML, extract title, date, category, location
   - estatesales.net → parse HTML, extract title, sale date/times, address

   d. **Geocode Locations:**
   - If location has lat/lon: use it
   - If only address: use OpenWeatherMap reverse geocoding API
   - Calculate distance from home (parsed from `location` param)

   e. **Fetch Weather Context:**
   - For each event's lat/lon, fetch OWM forecast
   - Extract condition, temperature, precipitation
   - Determine weather appropriateness (sunny → hike-friendly, rainy → indoor event)

   f. **Filter Results:**
   - Remove duplicates (same event from multiple sources)
   - Filter by distance (keep only within `radius`)
   - Filter by date (7-day window by default)
   - Filter by type if `eventTypes` specified

   g. **Return:**
   ```js
   return {
     success: true,
     events: [
       {
         id, title, type, source, sourceUrl,
         date, time, duration,
         location: { city, state, address, lat, lon, distanceMiles },
         description,
         weather: { condition, temp, precipitation },
         // calendarConflict checked client-side
       }
     ],
     timestamp: Date.now(),
     location,
     radius,
     sourceStats: { ticketmaster: 5, eventbrite: 3, craigslist: 2, estatesales: 1 }
   };
   ```

3. **Error Handling:**
   - If Ticketmaster API fails: skip, log, continue with other sources
   - If scraper breaks: log selector failure, disable that source, return partial results
   - If all sources fail: return `{ success: false, reason: "No data available", events: [] }`
   - Rate limiting: implement exponential backoff on 429 responses

4. **Rate Limiting & Caching:**
   - Use Netlify KV store or simple in-memory cache (expires after 1 hour)
   - Cache by `location + radius` key
   - Return cache hit with `cached: true` flag (browser will prefer fresh)
   - Implement server-side rate limiting: 100 requests per minute per IP

**Patterns to Follow:**
- Reuse pattern from existing Netlify functions (weather, ai)
- Store API keys in Netlify env vars, never commit to repo
- Log errors with context (which source, which operation)
- Always return structured JSON with `success` flag

**Test Scenarios:**
1. Valid location, valid radius → returns events array with at least 5 items
2. Each event has all required fields: id, title, type, date, location with lat/lon, weather
3. Distance calculation is correct (event distance ≤ radius)
4. Ticketmaster API down → still returns Eventbrite/scraper results
5. Scraper HTML changes → graceful fallback, logs error, scraper disabled
6. Cache hit within 1 hour → returns same data with `cached: true`
7. No events found → returns `{ success: true, events: [] }`

---

### U3. Event Discovery Modal UI

**Goal:** Create dedicated modal for browsing events, with event cards, sorting, and filtering.

**Requirements:** Reuse modal pattern; integrate with Settings location/distance; handle stale cache gracefully.

**Dependencies:** U1 (Settings), U2 (Backend function)

**Files:**
- `family-hub.html` — add modal markup and tab
- `family-hub.css` — style event cards, modal, age label
- `family-hub.js` — modal lifecycle, event card rendering, filtering logic

**Approach:**

1. **HTML Structure:**
   ```html
   <div class="modal-overlay" id="eventsModal" onclick="if(event.target===this)closeEventsModal()">
     <div class="modal" role="dialog" aria-labelledby="eventsModalTitle">
       <h2 id="eventsModalTitle">Discover Events</h2>
       
       <div class="events-search-bar">
         <input type="text" placeholder="Filter by type...">
         <select>
           <option value="">All types</option>
           <option value="concert">Concerts</option>
           <option value="hike">Hikes</option>
           <!-- etc -->
         </select>
         <button onclick="sortEvents('distance')">Sort by Distance</button>
         <button onclick="refreshEvents()">🔄 Refresh</button>
       </div>

       <div class="events-age-label" id="eventsAgeLabel"></div>

       <div class="events-list" id="eventsList">
         <!-- Event cards rendered here -->
       </div>

       <div class="modal-actions">
         <button onclick="closeEventsModal()">Close</button>
       </div>
     </div>
   </div>
   ```

2. **Event Card Template:**
   ```html
   <div class="event-card">
     <div class="event-header">
       <h3 class="event-title">Estate Sale at 42 Oak</h3>
       <span class="event-type-badge">EstateS</span>
     </div>
     <div class="event-details">
       <div class="event-date-time">
         <span class="event-date">Sat, Jun 21</span>
         <span class="event-time">9:00 AM – 3:00 PM</span>
       </div>
       <div class="event-location">
         <span class="event-distance">12.5 mi</span>
         <span class="event-address">42 Oak St, Portland, OR</span>
       </div>
       <div class="event-calendar-indicator">
         <span class="calendar-free">✓ You're free</span>
         <!-- or: <span class="calendar-conflict">⚠ Busy</span> -->
       </div>
     </div>
     <div class="event-weather">
       <span class="weather-icon">☀️</span>
       <span class="weather-text">Sunny, 72°F — good for outdoor events</span>
     </div>
     <div class="event-description">
       <p>Multi-family estate sale with furniture, vintage items, collectibles, and more...</p>
     </div>
     <div class="event-actions">
       <a href="https://estatesales.net/..." target="_blank" class="btn btn-primary">View Details</a>
     </div>
   </div>
   ```

3. **JS State & Lifecycle:**
   ```js
   let eventsModalOpen = false;
   let eventsData = [];           // Current displayed events
   let eventsRawData = [];        // Full result set from backend
   let eventsFetchTimestamp = 0;  // When we last fetched
   let eventsSort = 'distance';   // Current sort mode

   async function openEventsModal() {
     eventsModalOpen = true;
     document.getElementById('eventsModal').style.display = 'flex';
     
     // 1. Show cached data immediately
     const cached = await getEventsFromCache();
     if (cached?.length > 0) {
       eventsData = cached;
       renderEventsList(cached);
       updateEventsAgeLabel(Date.now() - cached[0].fetchedAt);
     }
     
     // 2. Fetch fresh in background
     fetchAndUpdateEvents();
     
     trapFocus(document.querySelector('#eventsModal .modal'), null, closeEventsModal);
   }

   async function fetchAndUpdateEvents() {
     const location = eventLocation;
     const radius = eventMaxDistance;
     
     try {
       const r = await fetch(
         `/.netlify/functions/events?location=${encodeURIComponent(location)}&radius=${radius}`
       );
       const data = await r.json();
       
       if (data.success) {
         eventsRawData = data.events;
         eventsData = applyFiltersAndSort(eventsRawData);
         
         // Save to IndexedDB
         await saveEventsToCache(eventsRawData, { timestamp: Date.now(), location, radius });
         
         // Re-render
         renderEventsList(eventsData);
         updateEventsAgeLabel(0);  // Fresh
       }
     } catch (err) {
       console.warn('Event fetch failed:', err);
       // Keep showing cached data; show retry prompt
       showEventsErrorMessage(`Unable to refresh. Showing cached events from ${getAgeLabel()}.`);
     }
   }

   function renderEventsList(events) {
     const html = events.map(e => renderEventCard(e)).join('');
     document.getElementById('eventsList').innerHTML = html;
   }

   function renderEventCard(event) {
     const calendarLabel = event.calendarConflict 
       ? '<span class="calendar-conflict">⚠ You\'re busy</span>'
       : '<span class="calendar-free">✓ You\'re free</span>';
     
     return `
       <div class="event-card">
         <h3>${event.title}</h3>
         <span class="event-type-badge">${event.type}</span>
         <div class="event-date-time">${event.date} ${event.time || 'All Day'}</div>
         <div class="event-location">${event.location.distanceMiles.toFixed(1)} mi • ${event.location.address}</div>
         ${calendarLabel}
         <div class="event-weather">
           ${getWeatherEmoji(event.weather.condition)} ${event.weather.temp}°F, ${event.weather.condition}
         </div>
         <p>${event.description}</p>
         <a href="${event.sourceUrl}" target="_blank" class="btn">View on ${event.source}</a>
       </div>
     `;
   }

   function closeEventsModal() {
     eventsModalOpen = false;
     document.getElementById('eventsModal').style.display = 'none';
     releaseFocusTrap();
   }
   ```

4. **Age Label:**
   - If cache < 5 minutes old: "Fresh just now"
   - If 5 min – 1 hour: "From 30 minutes ago"
   - If 1–4 hours: "From this morning"
   - If > 4 hours: "From yesterday"

**Patterns to Follow:**
- Reuse modal structure from settings (HTML 458–1119, JS 8875–9002)
- Use `trapFocus()` for keyboard accessibility
- Event cards follow card design from existing widgets (CSS search `.card`)
- Render lists with template strings (no DOM APIs)

**Test Scenarios:**
1. Click 💡 button on calendar → modal opens, cached events show immediately
2. Fresh fetch completes → modal updates with new data, age label changes
3. Fetch fails (network down) → cached events remain visible, error message shown
4. Sorting by distance → events reordered correctly
5. Filter by type → only matching events displayed
6. Manual refresh button → fetches fresh data immediately
7. Close modal → state preserved (scroll position, filter, sort)

---

### U4. IndexedDB Caching Layer

**Goal:** Implement IndexedDB schema for events, cache management, and stale-while-revalidate pattern.

**Requirements:** Non-blocking async reads/writes; structured queries.

**Dependencies:** None

**Files:**
- `family-hub.js` — IndexedDB init, CRUD helpers, cache management

**Approach:**

1. **IndexedDB Schema Initialization:**
   ```js
   const DB_NAME = 'fh_events';
   const DB_VERSION = 1;
   const STORE_EVENTS = 'events';
   const STORE_CACHE_META = 'eventCache';

   async function initEventsDB() {
     return new Promise((resolve, reject) => {
       const req = indexedDB.open(DB_NAME, DB_VERSION);
       
       req.onerror = () => reject(req.error);
       req.onsuccess = () => resolve(req.result);
       
       req.onupgradeneeded = (e) => {
         const db = e.target.result;
         
         // Events store
         const evStore = db.createObjectStore(STORE_EVENTS, { keyPath: 'id' });
         evStore.createIndex('byDate', 'date');
         evStore.createIndex('byType', 'type');
         evStore.createIndex('byDistance', 'location.distanceMiles');
         
         // Cache metadata store
         db.createObjectStore(STORE_CACHE_META, { keyPath: 'key' });
       };
     });
   }
   ```

2. **Cache Read:**
   ```js
   async function getEventsFromCache() {
     const db = await initEventsDB();
     const tx = db.transaction(STORE_EVENTS, 'readonly');
     const store = tx.objectStore(STORE_EVENTS);
     
     return new Promise((resolve) => {
       const req = store.getAll();
       req.onsuccess = () => {
         const events = req.result;
         if (events.length === 0) return resolve(null);
         
         // Return with `fetchedAt` for age calculation
         return resolve(events.map(e => ({ ...e, fetchedAt: e.fetchedAt || Date.now() })));
       };
     });
   }
   ```

3. **Cache Write:**
   ```js
   async function saveEventsToCache(events, meta) {
     const db = await initEventsDB();
     const tx = db.transaction([STORE_EVENTS, STORE_CACHE_META], 'readwrite');
     
     // Clear old events
     tx.objectStore(STORE_EVENTS).clear();
     
     // Write new events with timestamp
     events.forEach(e => {
       tx.objectStore(STORE_EVENTS).add({ ...e, fetchedAt: Date.now() });
     });
     
     // Write metadata
     tx.objectStore(STORE_CACHE_META).put({
       key: 'current',
       timestamp: Date.now(),
       ...meta
     });
     
     return new Promise((resolve, reject) => {
       tx.oncomplete = () => resolve();
       tx.onerror = () => reject(tx.error);
     });
   }
   ```

4. **Cache Invalidation:**
   ```js
   async function shouldRefreshCache() {
     const db = await initEventsDB();
     const tx = db.transaction(STORE_CACHE_META, 'readonly');
     const meta = await getPromise(tx.objectStore(STORE_CACHE_META).get('current'));
     
     if (!meta) return true;  // No cache
     const ageMinutes = (Date.now() - meta.timestamp) / 60000;
     return ageMinutes > 240;  // Refresh if > 4 hours old
   }
   ```

**Patterns to Follow:**
- Wrap IndexedDB in Promises for async/await usage
- Use `getAll()` for bulk reads, `add()` for writes
- Always clear old data before writing new cache
- Store timestamps with events for age calculation

**Test Scenarios:**
1. Save 10 events to cache → verify all stored with fetchedAt timestamps
2. Read from empty cache → returns null/empty array
3. Read after save → retrieves all events
4. Cache older than 4 hours → `shouldRefreshCache()` returns true
5. Cache newer than 4 hours → `shouldRefreshCache()` returns false
6. Clear cache (on logout) → all events and metadata removed

---

### U5. Calendar Integration: Conflict Detection & Overlay

**Goal:** Query family calendars for free/busy time at event time, and optionally render event indicators on calendar grid.

**Requirements:** Existing calendar data in memory; optional overlay rendering.

**Dependencies:** U3 (modal with event data)

**Files:**
- `family-hub.js` — conflict detection logic, calendar overlay rendering
- `family-hub.css` — overlay styles, event indicator colors

**Approach:**

1. **Conflict Detection:**
   ```js
   function checkCalendarConflict(eventDate, eventStartTime, eventEndTime) {
     // eventDate: 'YYYY-MM-DD'
     // eventStartTime, eventEndTime: 'HH:MM' or null (all-day)
     
     // If event is all-day, mark as busy (requires full day availability)
     if (!eventStartTime) {
       // Check if any calendar has events on this date
       for (const [calId, dayCache] of Object.entries(calEventCache)) {
         const dayEvents = dayCache[eventDate] || [];
         if (dayEvents.length > 0) return true;  // Busy
       }
       return false;  // Free all day
     }
     
     // Timed event: check for overlap
     const [eventStart, eventEnd] = [
       timeStringToMinutes(eventStartTime),
       timeStringToMinutes(eventEndTime || eventStartTime)
     ];
     
     for (const [calId, dayCache] of Object.entries(calEventCache)) {
       const dayEvents = dayCache[eventDate] || [];
       for (const calEvent of dayEvents) {
         if (calEvent.allDay) {
           return true;  // Calendar busy all day; event conflicts
         }
         const [calStart, calEnd] = [
           timeStringToMinutes(calEvent.startDT),
           timeStringToMinutes(calEvent.endDT)
         ];
         if (!(eventEnd <= calStart || eventStart >= calEnd)) {
           return true;  // Overlap detected
         }
       }
     }
     return false;  // Free
   }

   function timeStringToMinutes(timeStr) {
     const [h, m] = timeStr.split(':').map(Number);
     return h * 60 + m;
   }
   ```

2. **Attach Conflict to Events:**
   In `U2` backend, or client-side before rendering:
   ```js
   events.forEach(e => {
     e.calendarConflict = checkCalendarConflict(e.date, e.time, e.timeEnd);
   });
   ```

3. **Calendar Overlay (Optional, Phase 1b):**
   When `eventShowOnCalendar` is true:
   ```js
   function renderCalendarOverlay() {
     if (!eventShowOnCalendar) return;
     
     const eventsToShow = eventsRawData.filter(e => 
       eventCalendarTypes.includes(e.type) && !e.calendarConflict
     );
     
     for (const event of eventsToShow) {
       const dateKey = event.date;  // 'YYYY-MM-DD'
       const dayCell = document.querySelector(`[data-date="${dateKey}"]`);
       if (dayCell) {
         const indicator = document.createElement('div');
         indicator.className = `event-overlay-indicator event-type-${event.type.toLowerCase()}`;
         indicator.textContent = getTypeEmoji(event.type);
         indicator.title = event.title;
         indicator.onclick = (e) => {
           e.stopPropagation();
           showEventDetail(event);
         };
         dayCell.appendChild(indicator);
       }
     }
   }
   ```

4. **CSS for Overlay:**
   ```css
   .event-overlay-indicator {
     display: inline-block;
     width: 24px; height: 24px;
     border-radius: 50%;
     font-size: 12px;
     line-height: 24px;
     text-align: center;
     cursor: pointer;
     margin: 2px;
     background: var(--accent);
     color: var(--text-light);
   }

   .event-overlay-indicator.event-type-concert { background: #ff6b6b; }
   .event-overlay-indicator.event-type-hike { background: #51cf66; }
   .event-overlay-indicator.event-type-class { background: #4c6ef5; }
   ```

**Patterns to Follow:**
- Reuse calendar event iteration pattern from renderCurrentView (line 8468)
- Time comparisons use 24-hour format (already in calendar cache)
- Color coding matches existing calendar event colors (CSS: `.cal-event-*`)

**Test Scenarios:**
1. Event at time with no calendar entries → `calendarConflict: false`
2. Event overlaps calendar event → `calendarConflict: true`
3. Event overlaps all-day calendar event → `calendarConflict: true`
4. Calendar overlay disabled → no indicators on calendar
5. Calendar overlay enabled → indicators appear only for non-conflicting events of selected types
6. Click overlay indicator → shows event detail modal

---

### U6. Weather Context Integration

**Goal:** Fetch weather forecast for event location, mark weather-appropriate activities.

**Requirements:** Reuse OpenWeatherMap API (already configured); correlate weather with event type.

**Dependencies:** U2 (backend includes weather fetching), U3 (modal displays weather)

**Files:**
- `netlify/functions/events.js` — fetch and attach weather to events
- `family-hub.js` — weather emoji/label rendering

**Approach:**

1. **In Backend (U2):**
   ```js
   async function attachWeatherToEvents(events) {
     const weatherPromises = events.map(async (e) => {
       if (!e.location.lat || !e.location.lon) return e;  // Skip if no coords
       
       try {
         const forecast = await fetchWeatherForecast(e.location.lat, e.location.lon, e.date);
         if (forecast) {
           e.weather = {
             condition: forecast.main,        // 'Sunny', 'Rainy', 'Cloudy', etc.
             temp: Math.round(forecast.temp),
             precipitation: forecast.pop * 100,  // Probability of precipitation (%)
             windSpeed: forecast.windSpeed
           };
         }
       } catch (err) {
         console.warn(`Weather fetch failed for event ${e.id}:`, err);
         e.weather = null;
       }
       return e;
     });
     
     return Promise.all(weatherPromises);
   }

   async function fetchWeatherForecast(lat, lon, dateString) {
     // Use OWM API to get 5-day forecast
     const r = await fetch(
       `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=imperial`
     );
     const data = await r.json();
     
     // Find forecast for requested date
     const forecastList = data.list || [];
     const dayForecasts = forecastList.filter(f => f.dt_txt.startsWith(dateString));
     if (dayForecasts.length === 0) return null;
     
     // Average the day's forecast
     const avg = {
       main: dayForecasts[0].weather[0].main,
       temp: Math.round(dayForecasts.reduce((s, f) => s + f.main.temp, 0) / dayForecasts.length),
       pop: Math.max(...dayForecasts.map(f => f.pop)),
       windSpeed: Math.round(dayForecasts.reduce((s, f) => s + f.wind.speed, 0) / dayForecasts.length)
     };
     return avg;
   }
   ```

2. **In Browser (U3):**
   ```js
   function getWeatherEmoji(condition) {
     const map = {
       'Sunny': '☀️', 'Clear': '☀️',
       'Rainy': '🌧️', 'Rain': '🌧️',
       'Cloudy': '☁️', 'Clouds': '☁️',
       'Snowy': '❄️', 'Snow': '❄️',
       'Stormy': '⛈️', 'Thunderstorm': '⛈️',
       'Windy': '💨'
     };
     return map[condition] || '🌤️';
   }

   function getWeatherLabel(event) {
     if (!event.weather) return '';
     const { condition, temp, precipitation } = event.weather;
     let label = `${getWeatherEmoji(condition)} ${temp}°F, ${condition}`;
     
     if (precipitation > 30) {
       label += ` (${Math.round(precipitation)}% chance of rain)`;
     }
     return label;
   }

   function renderEventCard(event) {
     const weatherHtml = event.weather 
       ? `<div class="event-weather">${getWeatherLabel(event)}</div>`
       : '';
     // ... rest of card
   }
   ```

**Patterns to Follow:**
- Reuse OWM integration from weather widget (family-hub.js lines 3437–4432)
- Cache weather with events in IndexedDB (already done in U2)
- Handle missing weather gracefully (no error if OWM is down)

**Test Scenarios:**
1. Event with valid lat/lon → weather fetched and attached
2. Event date is 5+ days away (outside forecast range) → weather is null, card still renders
3. OWM API down → events render without weather, no error
4. Weather label displayed correctly in event card
5. Weather emoji matches condition correctly

---

### U7. Calendar Header Button: 💡 Event Discovery Trigger

**Goal:** Add light bulb button to calendar header that opens the events modal.

**Requirements:** Calendar header is rendered at line 1091; minimal change.

**Dependencies:** U3 (events modal exists)

**Files:**
- `family-hub.html` — add button to calendar header HTML
- `family-hub.css` — style button (minimal)
- `family-hub.js` — click handler

**Approach:**

1. **HTML (in `.cal-card-header`):**
   ```html
   <button id="eventsDiscoverBtn" class="btn btn-sm btn-icon" onclick="openEventsModal()" title="Discover events">💡</button>
   ```

2. **CSS:**
   ```css
   #eventsDiscoverBtn {
     font-size: 18px;
     padding: 4px 8px;
     background: transparent;
     border: none;
     cursor: pointer;
     opacity: 0.7;
     transition: opacity 0.2s;
   }

   #eventsDiscoverBtn:hover {
     opacity: 1;
   }
   ```

3. **JS:**
   - Button already wired via `onclick="openEventsModal()"` (defined in U3)
   - No additional JS needed

**Patterns to Follow:**
- Button placement: next to month navigation (symmetrical with prev/next buttons)
- Emoji use is fine for UI (existing code uses emojis: ⚙️, 🔄, etc.)
- Hover state for discoverability

**Test Scenarios:**
1. Calendar header renders with 💡 button visible
2. Click 💡 button → events modal opens
3. Button is accessible (keyboard-focusable, ARIA label)
4. Button styling matches calendar header aesthetic

---

### U8. Error Handling & Resilience

**Goal:** Implement multi-layer fallback strategy, graceful degradation, and monitoring.

**Requirements:** Show data age labels; retry prompts; disabled-scraper messages.

**Dependencies:** U2 (backend), U3 (modal)

**Files:**
- `netlify/functions/events.js` — source error detection, exponential backoff
- `family-hub.js` — UI error messages, retry logic

**Approach:**

1. **Backend Source Monitoring:**
   ```js
   const sourceStatus = {
     ticketmaster: { ok: true, lastFail: null },
     eventbrite: { ok: true, lastFail: null },
     craigslist: { ok: true, lastFail: null },
     estatesales: { ok: true, lastFail: null }
   };

   async function fetchTicketmaster(...) {
     try {
       // ... fetch
       sourceStatus.ticketmaster.ok = true;
       return results;
     } catch (err) {
       sourceStatus.ticketmaster.ok = false;
       sourceStatus.ticketmaster.lastFail = Date.now();
       console.error('Ticketmaster error:', err);
       return [];  // Return empty, continue with other sources
     }
   }

   // Before returning, attach status
   return {
     success: true,
     events: [...],
     sourceStatus,
     warnings: sourceStatus
       .filter(s => !s.ok)
       .map(s => `${s.name} data unavailable; will retry later`)
   };
   ```

2. **Client-Side Error Display:**
   ```js
   async function fetchAndUpdateEvents() {
     try {
       const r = await fetch(`/.netlify/functions/events?...`);
       const data = await r.json();
       
       if (!data.success) {
         showEventsError('Unable to fetch events. Try again in a few minutes.');
         return;
       }
       
       // Show warnings if any sources failed
       if (data.warnings?.length > 0) {
         const msg = `Some sources unavailable: ${data.warnings.join(', ')}`;
         console.warn(msg);
       }
       
       // ... proceed with UI update
     } catch (err) {
       showEventsError('Network error. Showing cached events.');
     }
   }

   function showEventsError(msg) {
     const errorEl = document.getElementById('eventsErrorMsg') || createErrorElement();
     errorEl.textContent = msg;
     errorEl.style.display = 'block';
     
     const retryBtn = document.createElement('button');
     retryBtn.textContent = 'Retry';
     retryBtn.onclick = () => fetchAndUpdateEvents();
     errorEl.appendChild(retryBtn);
   }
   ```

3. **Data Age Label:**
   ```js
   function updateEventsAgeLabel(ageMs) {
     const minutes = Math.round(ageMs / 60000);
     let label = 'Fresh — just now';
     
     if (minutes > 5 && minutes < 60) {
       label = `From ${minutes} minutes ago`;
     } else if (minutes >= 60 && minutes < 1440) {
       const hours = Math.round(minutes / 60);
       label = `From ${hours} hours ago`;
     } else if (minutes >= 1440) {
       label = 'Cached — may be outdated';
     }
     
     document.getElementById('eventsAgeLabel').textContent = label;
   }
   ```

4. **Exponential Backoff (Backend):**
   ```js
   async function fetchWithBackoff(url, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fetch(url);
       } catch (err) {
         if (i === maxRetries - 1) throw err;
         
         const delayMs = Math.min(1000 * Math.pow(2, i), 30000);  // 1s, 2s, 4s... max 30s
         await sleep(delayMs);
       }
     }
   }
   ```

**Patterns to Follow:**
- Error messages are user-friendly (no stack traces or HTTP status codes)
- Always show cached data rather than blank states
- Provide manual retry button
- Log technical details to console for debugging

**Test Scenarios:**
1. Network down → modal shows cached events with age label + retry button
2. Ticketmaster API down → events from other sources shown, warning logged
3. All APIs down → show "Unable to fetch events" + cached data fallback
4. Scraper fails (HTML changed) → scraper disabled, other sources continue
5. Very stale cache (> 24 hours) → show "Cached — may be outdated" label
6. Fresh data fetched → age label updates to "Fresh — just now"
7. Manual refresh button → fetches immediately, updates age label

---

## Scope Boundaries

### In Scope (MVP)
- Event Discovery modal with browse + sort/filter
- Settings tab for location, distance, calendar overlay
- Ticketmaster + Eventbrite APIs
- estatesales.net + Craigslist scraping (via Netlify function)
- Calendar conflict detection (simple time overlap)
- Optional calendar overlay (Phase 1b)
- Weather context (current + forecast)
- IndexedDB caching with stale-while-revalidate
- Error handling and multi-layer fallback
- 💡 button on calendar header

### Deferred to Follow-Up Work
- Phase 2: Add AllTrails API for hikes
- Phase 2: Improve scraping robustness, handle more edge cases
- Phase 3: AI-powered recommendations based on past behavior
- Phase 3: RSVP tracking and event persistence
- Phase 3: Notification system ("cool event coming up")
- Phase 3: User ratings/reviews of events

### Outside This Feature's Scope
- Mobile native app (web-responsive only)
- Real-time ticket availability / pricing
- Payment/checkout integration
- Analytics on user behavior with events

---

## Open Questions

1. **Scraper Maintenance Plan:** When estatesales.net or Craigslist HTML changes, who maintains the parsing selectors? (Answer: For MVP, we log failures and disable the scraper; long-term, ops/maintenance plan needed.)

2. **API Key Rotation:** Should we implement key rotation / rate limit monitoring? (Answer: For MVP, manual monitoring; Phase 2 adds automated monitoring.)

3. **Timezone Handling:** How should we handle events across timezones? (Answer: Store in UTC; display in user's local timezone; for MVP, assume all events in user's region.)

4. **Event Deduplication:** When the same event appears in multiple sources (e.g., concert listed on both Ticketmaster and Eventbrite), should we deduplicate? (Answer: Simple dedup by title + date + venue for MVP; Phase 2 adds fuzzy matching.)

---

## Dependencies & Prerequisites

### External Services
- **Ticketmaster API:** Requires free API key (https://developer.ticketmaster.com) — request in Netlify env setup
- **Eventbrite API:** Requires free API key (https://www.eventbrite.com/platform/api/) — request in Netlify env setup
- **OpenWeatherMap:** Already configured; reuse existing API key

### Infrastructure
- **Netlify Functions:** Already deployed; this plan uses `/.netlify/functions/events.js`
- **IndexedDB:** Browser-native; no setup needed

### Rate Limits
- Ticketmaster: 5,000 calls/day (free tier)
- Eventbrite: 1,000 calls/hour (free tier)
- OWM: 1,000 calls/day (free tier, already using for weather)

---

## Testing Plan

### Unit-Level Testing
- IndexedDB CRUD operations (U4)
- Calendar conflict detection logic (U5)
- Time parsing and overlap calculation (U5)
- Weather emoji/label mapping (U6)
- Cache age label formatting (U8)

### Integration Testing
- Modal open → cached data render → fresh fetch → UI update (U3 + U4)
- Settings save → location/distance change → modal re-fetches (U1 + U3)
- Calendar overlay toggle → calendar updates with/without event indicators (U5)

### Manual Testing (Fragile)
- Ticketmaster API: verify events returned match query location + date range
- Eventbrite API: verify geolocation filtering works correctly
- estatesales.net scraper: verify selector accuracy (will break; needs re-validation when HTML changes)
- Craigslist scraper: verify selector accuracy (will break; needs re-validation when HTML changes)

### End-to-End Testing
1. Open Family Hub → click 💡 on calendar → modal opens with cached events
2. Settings → Events tab → change location → close settings → modal fetches new location's events
3. Fetch fails (disable WiFi) → cached events shown with age label
4. Calendar overlay enabled → event indicators appear on calendar grid
5. Click event indicator → shows event detail modal
6. Change distance to 30 min → fewer events shown
7. Weather context displays with emoji and temperature

---

## Rollout Plan

**Phase 1 (MVP):** Ship with Ticketmaster + Eventbrite + scraping, basic UI, caching.

**Phase 1b (Quick Win):** Add calendar overlay visualization (one-line CSS addition).

**Phase 2:** Add AllTrails API, improve scraper robustness, smart retry, analytics.

**Phase 3+:** AI recommendations, RSVP tracking, notifications, more sources.

---

## Success Metrics

1. **Discovery:** Family discovers ≥1 event/month they wouldn't have found
2. **Relevance:** Calendar conflicts accurately detected; weather context useful
3. **Reliability:** Scraping/API failures don't block UI; cached data shown gracefully
4. **Performance:** Modal opens in <1s; events load in <2s (with cache)
5. **Engagement:** Modal opened ≥2x per week (indicates ongoing value)

---

## Key Files Summary

| File | Changes |
|------|---------|
| `family-hub.html` | Add Events modal + tab, add 💡 button to calendar header |
| `family-hub.css` | Add event card styles, overlay indicator styles, modal styling |
| `family-hub.js` | Add settings state, modal lifecycle, IndexedDB layer, conflict detection, event rendering |
| `netlify/functions/events.js` | NEW: Event aggregation backend (Ticketmaster, Eventbrite, scrapers, weather) |
| `.env.local` (dev) | Add TICKETMASTER_KEY, EVENTBRITE_KEY |
| Netlify env vars (prod) | Add TICKETMASTER_KEY, EVENTBRITE_KEY |

---

## Sources & Research

- Ticketmaster Discovery API: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
- Eventbrite API: https://www.eventbrite.com/platform/api/
- estatesales.net: Scraping via Netlify function with cheerio
- Craigslist: Scraping via Netlify function with HTML parsing
- OpenWeatherMap: Already integrated; reuse existing pattern
- Browser Geolocation API: MDN docs
- IndexedDB: MDN docs, existing usage in Family Hub for photos

