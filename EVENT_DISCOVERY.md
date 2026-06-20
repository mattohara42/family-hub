# Event Discovery Feature Documentation

**Status:** ✅ Implementation Complete (2026-06-18)  
**Branch:** `feat/event-discovery`  
**Ready for:** Backend testing with API keys, code review, production merge

---

## Overview

Event Discovery enables Family Hub users to find interesting local events, activities, and sales within their specified radius. The feature is calendar-aware (detects scheduling conflicts) and weather-aware (shows forecasts). It uses intelligent caching to show results instantly while refreshing data in the background.

**User Experience:**
1. User clicks 💡 button on calendar header
2. Event discovery modal opens and shows cached events immediately
3. Indicator shows cache age: "Fresh — just now" to "⚠️ Cached — may be outdated"
4. Fresh data fetches in background, modal updates when ready
5. User can sort by distance/date, filter by event type, see calendar conflicts and weather

---

## Implementation Units (8 Total)

### U1: Settings Tab
**File:** `family-hub.html` (lines ~465-520), `family-hub.js` (state vars + openSettings/saveSettings)

Settings tab allows configuration:
- **Location:** City name (string, required)
- **Distance:** 30 minutes, 1 hour, or 2 hours (radio, default 2 hrs)
- **Calendar Overlay:** Toggle to show/hide event indicators on calendar grid
- **Event Types:** Multi-select filter (concerts, shows, garage sales, etc.)

Persisted via localStorage keys: `fh_eventLocation`, `fh_eventMaxDistance`, `fh_eventShowOnCalendar`, `fh_eventCalendarTypes`

### U2: Netlify Backend Function
**File:** `netlify/functions/events.js` (400+ lines)

Endpoint: `GET /.netlify/functions/events?location=<city>&radius=<minutes>&eventTypes=<csv>`

#### Handler Pipeline
1. **Parse & Validate:** location (required), radius (default 120 min), eventTypes (optional)
2. **Geocode:** city name → lat/lon via OpenWeatherMap Geo API
3. **Parallel Fetches:**
   - Ticketmaster Discovery API v2 (120km radius, sorted by date)
   - Eventbrite API v3 (location-based search, 7-day window)
   - estatesales.net scraper (placeholder, awaits cheerio)
   - Craigslist activities scraper (placeholder, awaits cheerio)
4. **Normalize:** All responses → unified schema
5. **Enrich:** 
   - Calculate distances (Haversine formula)
   - Fetch weather forecast for event dates/locations
   - Detect calendar conflicts (server-side check)
6. **Filter & Sort:** 7-day window, radius limit
7. **Return:** JSON with events[], sourceStats, warnings

#### Unified Event Schema
```javascript
{
  id: "tm_<external-id>",              // source-prefixed for deduplication
  title: "Concert Name",
  type: "concert|show|sports|activity|...",
  source: "ticketmaster|eventbrite|estatesales|craigslist",
  sourceUrl: "https://...",
  date: "YYYY-MM-DD",
  time: "HH:MM" || null,               // null = all-day
  duration: number || null,             // minutes
  location: {
    city: "Portland",
    state: "OR",
    address: "123 Main St",
    lat: 45.5234,
    lon: -122.6762,
    distanceMiles: 5.2
  },
  description: "Event description",
  weather: {
    condition: "Cloudy",               // or null if fetch failed
    temp: 72,                          // °F
    precipitation: 10                  // percent
  },
  calendarConflict: false              // true = overlaps with family calendar
}
```

#### Error Handling
- **Exponential Backoff:** `fetchWithRetry(fn, sourceName, maxRetries=2)`
  - Retry delays: 1s, 2s, 4s (configurable via RETRY_CONFIG)
  - Per-source error tracking: `sourceStatus[source] = { ok, count, error }`
  - One source failure doesn't stop others (parallel Promise.allSettled)
- **Graceful Degradation:** API down → return empty array, mark source status bad
- **Response Warnings:** `warnings: ["Ticketmaster unavailable", ...]` if any sources fail

### U3: Event Discovery Modal UI
**File:** `family-hub.html` (modal structure), `family-hub.css` (styling), `family-hub.js` (rendering + interaction)

#### Modal Components
- **Header:** Title, age label, refresh button (manual trigger)
- **Search/Filter Bar:** Type filter input, sort dropdown (distance/date)
- **Event List Container:** `#eventsList` → populated by `renderEventsList()`
- **Event Cards:** Title + type badge, date/time, location + distance, calendar status, weather, description, link to source

#### Age Label States
- ≤2 min: "🟢 Fresh — just now"
- 3-59 min: "From X minutes ago"
- 1-23 hours: "From X hours ago"
- >24 hours: "⚠️ Cached — may be outdated. Tap Refresh."

#### Key Functions
- `openEventsModal()` — show modal, load cache, start background fetch
- `closeEventsModal()` — hide modal, cleanup
- `fetchAndUpdateEvents()` — call backend, save to IndexedDB, re-render, update age label
- `renderEventsList(events)` — generate HTML from event array
- `renderEventCard(event)` — single card template with XSS protection
- `applyFiltersAndSort(events)` — filter by type, sort by distance/date
- `refreshEvents()` — manual refresh trigger

### U4: IndexedDB Caching Layer
**File:** `family-hub.js` (database functions)

#### Schema
```javascript
Database: 'fh_events' (version 1)

Store: 'events' (keyPath: 'id')
  Indexes:
    - byDate: event.date
    - byType: event.type
    - byDistance: event.location.distanceMiles
  Records: Full event objects with fetchedAt timestamp

Store: 'eventCache' (keyPath: 'key')
  Records: { key: 'current', timestamp, location, radiusMinutes, eventCount }
```

#### Key Functions
- `initEventsDB()` — open/create database with indexes
- `getEventsFromCache()` — read all events + metadata (async)
- `saveEventsToCache(events, meta)` — clear old, write new events + metadata (atomic transaction)
- `shouldRefreshCache()` — check if cache older than 4 hours

#### Stale-While-Revalidate Pattern
1. Modal opens → `getEventsFromCache()` → render immediately if hit
2. Simultaneously: `fetchAndUpdateEvents()` → fetch fresh from backend
3. Fresh data arrives → save to IndexedDB → re-render modal
4. Cache miss or network error → show cached data anyway + retry button

### U5: Calendar Integration
**File:** `family-hub.js` (calendar conflict detection & overlay)

#### Conflict Detection
- Function: `checkCalendarConflict(eventDate, eventStartTime, eventEndTime)`
- Checks against `calEventCache[calendarId][date]` (existing family calendar data)
- All-day events: mark busy if any calendar has events that day
- Timed events: check time overlap (convert HH:MM to minutes, calculate intersection)
- Result: attached to each event as `calendarConflict: boolean`

#### Calendar Overlay (Optional)
- Toggle: `eventShowOnCalendar` setting
- When enabled: render `.event-overlay-indicator` circles on calendar grid
- Shows event count or indicator per day
- Visual feedback: hover → scale effect

#### Functions
- `checkCalendarConflict()` — returns boolean
- `timeStringToMinutes(timeStr)` — convert "14:30" → 870 (minutes)
- `attachCalendarConflictsToEvents(events)` — batch check, mutate events array
- `renderEventCalendarOverlay()` — add/remove indicators on calendar

### U6: Weather Context
**File:** `netlify/functions/events.js` (addWeatherContext), `family-hub.js` (display)

- **Fetch:** OpenWeatherMap Forecast API (5-day, 3-hour intervals)
- **Filter:** Match event date, average temp + max precipitation across day
- **Attach:** `event.weather = { condition, temp, precipitation }`
- **Display:** 🟢 emoji + "72°F, Cloudy" in event card
- **Fallback:** Graceful (silent) if weather API fails; event renders without weather

#### Weather Emoji Map
```javascript
'sunny'/'clear' → '☀️'
'rainy'/'rain' → '🌧️'
'cloudy'/'clouds' → '☁️'
'snowy'/'snow' → '❄️'
'stormy'/'thunderstorm' → '⛈️'
'windy' → '💨'
default → '🌤️'
```

### U7: Calendar Header Button
**File:** `family-hub.html` (button), `family-hub.css` (styling), `family-hub.js` (onclick handler)

- **Button:** `<button class="cal-event-discover-btn">💡</button>` in `#calMonthNav`
- **Position:** Inline with month navigation controls
- **Click Handler:** `openEventsModal()`
- **Styling:** Opacity transition, scale on hover/active
- **Accessibility:** Semantic button, emoji clear intent

### U8: Error Handling & Resilience
**File:** `netlify/functions/events.js` (retry logic), `family-hub.js` (UI feedback)

#### Backend Resilience
- **Retry Wrapper:** `fetchWithRetry(fn, sourceName, maxRetries=2)`
  - Exponential backoff: `Math.min(baseDelay * 2^attempt, maxDelay)`
  - Config: `RETRY_CONFIG = { maxRetries: 2, baseDelay: 1000, maxDelay: 10000 }`
  - Per-attempt logging: `[Events] Ticketmaster attempt 1 failed, retrying in 1000ms`
- **Source Status Tracking:** Each source maintains `{ ok, count, error }`
- **Weather Retry:** Single retry only (less critical than event APIs)
- **Response Warnings:** `warnings: ["Ticketmaster unavailable"]` included in success response

#### Frontend Error Handling
- **Network Error Fallback:**
  ```javascript
  catch (err) {
    showEventsError('Unable to fetch events. Using cached data.');
  }
  ```
- **Error Display:** `showEventsError(msg)` renders message + retry button
- **Retry Logic:** Button calls `refreshEvents()` → `fetchAndUpdateEvents()`
- **Age Label Warning:** ">24 hours old" includes "Tap Refresh" prompt
- **No Blank States:** Always show cached data if available

#### User-Facing Messages
- "Unable to fetch events. Using cached data." (network down)
- "Some sources unavailable: Ticketmaster, Craigslist" (partial failure)
- "No events found. Try expanding your distance or changing your location." (zero results)
- All messages use user-friendly language (no HTTP codes, no stack traces)

---

## Testing

### Local UI Testing (No API Keys)
```bash
# Terminal 1: Start dev server
cd /Users/matt/Documents/Claude/Projects/Family\ Hub
python3 -m http.server 8080

# Browser: http://localhost:8080/family-hub.html
# ✓ Settings tab opens and closes
# ✓ Settings persist after reload
# ✓ Calendar overlay toggle works
# ✓ Modal opens/closes (empty until backend ready)
# ✓ Sort/filter controls functional
# ✓ Age label displays correctly
```

### Backend Testing (Requires API Keys)
```bash
# 1. Get free API keys:
#    - Ticketmaster: https://developer.ticketmaster.com/
#    - Eventbrite: https://www.eventbrite.com/platform/api/
#    - OpenWeatherMap: https://openweathermap.org/api

# 2. Add to .env.local:
cat > .env.local << EOF
TICKETMASTER_KEY=<your-key>
EVENTBRITE_KEY=<your-key>
OWM_KEY=<your-key>
EOF

# 3. Start Netlify dev server
netlify dev  # runs on http://localhost:8888

# 4. Test backend directly
curl "http://localhost:8888/.netlify/functions/events?location=Portland&radius=120"

# 5. Test UI
# Open http://localhost:8888/family-hub.html
# Click 💡 button
# Events should load and display
```

### Test Scenarios Checklist
- [ ] Modal opens/closes with 💡 button
- [ ] Settings tab configurable (location, distance, toggles)
- [ ] Settings persist after reload
- [ ] Event list renders with correct fields
- [ ] Sort by distance works
- [ ] Sort by date works
- [ ] Filter by type works
- [ ] Age label: "Fresh — just now" for new data
- [ ] Age label: "From X minutes ago" for 5-59 min old
- [ ] Age label: "⚠️ may be outdated" for >24h old
- [ ] Calendar conflict detection shows busy/free
- [ ] Calendar overlay toggle enables/disables indicators
- [ ] Weather icons and temps display
- [ ] Manual refresh button fetches new data
- [ ] Network error shows fallback message + retry button
- [ ] Error message is user-friendly (no stack traces)
- [ ] Cache serves instantly even if network down

---

## Configuration

### Environment Variables (.env.local for local testing)
```
TICKETMASTER_KEY=<API key from developer.ticketmaster.com>
EVENTBRITE_KEY=<OAuth token from eventbrite.com/platform/api>
OWM_KEY=<API key from openweathermap.org/api>
```

### Netlify Dashboard (Production)
**Project Settings → Environment:**
```
TICKETMASTER_KEY=<production-key>
EVENTBRITE_KEY=<production-key>
OWM_KEY=<production-key>
```

### OAuth Configuration (New Domains Only)
- **Google Cloud Console:** Add domain to "Authorized JS Origins"
- **Firebase Console:** Add domain to "Authorized Domains"
- Not needed for localhost or existing production domain

---

## Known Limitations

### Currently Missing (Phase 2)
- estatesales.net scraping (placeholder waiting for cheerio)
- Craigslist scraping (placeholder waiting for cheerio)
- AI-powered recommendations
- RSVP tracking / event persistence
- Notifications
- User ratings/reviews

### Current Constraints
- 7-day event window (hardcoded, could be configurable)
- 120km Ticketmaster radius (API limit, could add UI control)
- 4-hour cache stale threshold (configurable, reasonable for daily browsing)
- No pagination (all results in one modal, limits for very large result sets)
- No saved searches / favoriting

---

## Code Locations Quick Reference

| Feature | File | Lines/Markers |
|---------|------|--------------|
| Settings state | family-hub.js | `let eventLocation`, `let eventMaxDistance`, etc. |
| Settings UI | family-hub.html | `<div data-panel="events">` |
| Settings save/load | family-hub.js | `openSettings()`, `saveSettings()` |
| Modal trigger | family-hub.html | `.cal-event-discover-btn` |
| Modal UI | family-hub.html | `<div id="eventsModal">` |
| Modal logic | family-hub.js | `openEventsModal()`, `closeEventsModal()` |
| Event rendering | family-hub.js | `renderEventsList()`, `renderEventCard()` |
| Cache init | family-hub.js | `initEventsDB()` |
| Cache read/write | family-hub.js | `getEventsFromCache()`, `saveEventsToCache()` |
| Calendar integration | family-hub.js | `checkCalendarConflict()`, `attachCalendarConflictsToEvents()` |
| Backend handler | events.js | `exports.handler` |
| API calls | events.js | `fetchTicketmaster()`, `fetchEventbrite()` |
| Retry logic | events.js | `fetchWithRetry()` |
| Error handling | family-hub.js | `showEventsError()` |
| Age label | family-hub.js | `updateEventsAgeLabel()` |

---

## Git Commits

```
a238e72 docs: Add event discovery requirements and implementation plan
e1f2a74 U8: Add exponential backoff retry logic and enhanced error handling
efed681 U5: Implement calendar integration with conflict detection and optional event overlay
748e63a U7: Add 💡 event discovery button to calendar header
505bb8b U3: Implement event discovery modal UI with event cards, filtering, sorting, and caching
022eec1 U2: Create Netlify function for event aggregation (Ticketmaster, Eventbrite, weather, geocoding)
d7a2db5 U4: Implement IndexedDB caching layer for event discovery data
43f7fcd U1: Add Events settings tab with location, distance, and calendar overlay configuration
```

---

## Next Steps

1. **Backend Testing:** Add API keys to `.env.local`, run `netlify dev`, test with curl
2. **Integration Testing:** Test UI + backend together (http://localhost:8888)
3. **Code Review:** Peer review on feat/event-discovery branch
4. **Merge to Main:** After review + testing
5. **Production Deployment:** Add API keys to Netlify dashboard, deploy
6. **Phase 2 Planning:** Scraper implementation, recommendations, notifications

---

## References

- **Requirements:** docs/brainstorms/2026-06-18-event-discovery-requirements.md
- **Implementation Plan:** docs/plans/2026-06-18-001-feat-event-discovery-plan.md
- **Ticketmaster API:** https://developer.ticketmaster.com/
- **Eventbrite API:** https://www.eventbrite.com/platform/api/
- **OpenWeatherMap:** https://openweathermap.org/api
- **Netlify Functions:** https://docs.netlify.com/functions/overview/
- **IndexedDB:** https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
