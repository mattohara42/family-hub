# Event Discovery Feature — Requirements

**Date:** 2026-06-18  
**Status:** Approved for planning  
**Scope:** MVP with progressive expansion

---

## Product Vision

A family-shared event discovery tool that helps the Hub find interesting local activities they might not otherwise discover. Primary focus: variety and serendipity, not exhaustive event search. Integrated with the family calendar to surface events during available time. Weather-aware recommendations enhance relevance.

---

## Core Problem Solved

Family members currently browse multiple sites (estatesales.net, Craigslist) and miss categories of events entirely (concerts, hikes, day trips). No single place shows "what's interesting to do this weekend when we're free, given the weather?"

---

## MVP Scope

### Data Sources (Phase 1)

| Source | Event Types | Method | Rationale |
|--------|-------------|--------|-----------|
| estatesales.net | Estate sales, auctions | Scrape | Already used by family; high-signal |
| Craigslist "activities" | Classes, DIY, day trips, local events | Scrape | Already used; captures local variety |
| (Optional future) Ticketmaster API | Concerts, live events, theater | API | High-value vertical; user request |
| (Optional future) AllTrails API | Hikes, trails | API | Outdoor activity discovery |

**MVP decision:** Start with estatesales.net + Craigslist scraping. Add APIs incrementally based on usage feedback.

### Geographic & Time Filtering

- **Primary radius:** 2-hour drive (day-trip distance)
- **Secondary radius:** 30 minutes for weekday events
- **Location source:** Geolocation (auto-detect) + manual city override (fallback; reuse weather location logic)
- **Time horizon:** Browsable for future dates; focus on "this week" / "this weekend" by default
- **Calendar integration:** Surface events only during family's free time blocks (no calendar conflicts)

### User-Facing Features

#### 1. Event Discovery Modal
A dedicated modal/tab opened on-demand when family is "looking for something fun."

**Contents:**
- Search/filter bar (optional: filter by event type, distance, date range)
- Event cards showing:
  - Event title, type (Estate Sale, Concert, Hike, Class, etc.)
  - Date, time, duration
  - Location + distance from home
  - Brief description (from source)
  - Weather context (e.g., "Sunny, 72°F — good hiking weather")
  - Calendar indicator: ✓ (free time block exists) or ⚠ (busy; alternative dates)
  - Link to source or RSVP button (external)
- Sorting: by distance, date, or relevance (TBD in planning)
- Pagination or lazy-load as data grows

**Behavior:**
- Opening modal fetches fresh event data for current location + 7-day window
- Caching: store results in localStorage to avoid re-fetching while browsing

#### 2. Optional Calendar Overlay (Phase 1b)
Toggleable in Settings. When enabled, specific event types (e.g., "Concerts & Shows") appear as colored indicators on the calendar grid.

**Behavior:**
- Click event indicator → open event details (mini-card or link to full modal)
- Only shows events without calendar conflicts (free time blocks)
- Respects distance filter from Settings (e.g., "show calendar events within 1 hour")

### Settings Integration

Add a new Settings tab: **"Events"**

**Controls:**
- Enable/disable event discovery modal (default: on)
- Home location: city name (for geolocation fallback; reuse weather location pattern)
- Max distance for nearby events: 30 min, 1 hr, 2 hrs (default: 2 hrs)
- Calendar overlay toggle: show specific event types on calendar (default: off)
- Event types to show on calendar (multi-select): Concerts, Hikes, Classes, etc.

---

## Non-MVP / Out of Scope (Phase 2+)

- AI-powered recommendations ("based on your past events, you might like...")
- RSVP tracking / "going" status persistence
- Notifications ("cool event coming up!")
- Integration with Google Calendar's "Add to Calendar" (can link, but not bi-directional sync)
- User ratings or reviews of events
- Payment/ticketing directly in app (link out only)
- Mobile app (web-only for now; Family Hub is mobile-responsive, not native)

---

## Success Criteria

1. **Discovery:** Family discovers at least one event/activity per month they wouldn't have found otherwise
2. **Relevance:** Event cards accurately reflect calendar availability + weather context (no suggesting outdoor hikes in thunderstorm)
3. **Variety:** MVP sources surface mix of sale/auction, local activity, outdoor, and community events
4. **Integration:** Modal coexists cleanly with existing Family Hub UI; Settings tab integrates naturally
5. **Reliability:** Scraping logic tolerates minor HTML changes; graceful fallback when source is down
6. **Performance:** Modal opens within 1-2s; events load within 2-3s (with caching)

---

## Constraints & Dependencies

### Architecture Constraints (from Family Hub)
- **Three-file app:** No build tooling. Feature must be in `family-hub.js`, `family-hub.css`, `family-hub.html`
- **CDN scripts only:** Any library must load via `<script>` tag
- **Firebase Firestore:** Shared state lives here (if events need to be shared across family). Personal search history can use localStorage
- **No backend required:** All scraping and API calls must be client-side or via Netlify function (if CORS issues arise)
- **Geolocation API:** Standard browser API; requires HTTPS (Netlify) or localhost

### Data & Privacy
- **Scraping:** Must respect robots.txt and rate limits (Craigslist, estatesales.net)
- **API keys:** Store in `family-hub.js` config block (top of file, same pattern as weather APIs) or Netlify env vars
- **No tracking:** Events are for family use; no analytics or third-party tracking on event data

### Calendar Integration
- **Existing calendar data:** Read from Google Calendar (via existing `calendarEvents` Firestore collection) + local events
- **Conflict detection:** Simple: if time slot is marked "busy" on any family calendar, flag it
- **No double-booking:** Don't create events in calendar from modal; just suggest fit

---

## Data Model

### Event Record (in-memory / localStorage)

```js
{
  id: "unique_id",                    // source + source_id
  title: "Estate Sale at 42 Oak",
  type: "EstateS",                     // "EstateS", "Concert", "Hike", "Class", "Activity", etc.
  source: "estatesales.net",
  sourceUrl: "https://...",
  date: "2026-06-21",                 // YYYY-MM-DD
  time: "09:00",                       // HH:MM (null if all-day)
  duration: 180,                       // minutes
  location: {
    city: "Portland",
    state: "OR",
    address: "42 Oak Street",
    lat: 45.5234,
    lon: -122.6762,
    distanceMiles: 12.5
  },
  description: "Multi-family estate sale with furniture, vintage items...",
  weather: {
    condition: "Sunny",
    temp: 72,
    precipitation: 0
  },
  calendarConflict: false              // true if family has busy block at this time
}
```

### Search/Caching (localStorage)

```js
localStorage.fh_eventCache = JSON.stringify({
  timestamp: 1718734800000,
  location: "Portland",
  events: [ /* array of event records */ ]
})

localStorage.fh_eventSettings = JSON.stringify({
  maxDistance: 120,                    // minutes
  homeCity: "Portland",
  showOnCalendar: true,
  calendarEventTypes: ["Concert", "Hike"],
  enabled: true
})
```

---

## UI Placement & Integration

### Modal Structure
- Reuse existing modal pattern from settings, event editor, meal planner
- Add modal tab in `.modal-tabs`: "Events"
- Modal trigger: button in Settings tab, or new card in sidebar? (Planning to decide)

### Settings Tab
- Add new tab in settings modal: "Events"
- Follows existing pattern from Weather, Calendar toggles, etc.

### Calendar Overlay
- Optional. When enabled, render event indicators on `.cal-grid` cells (similar to current event boxes)
- Click → open event details popover or link to full modal

---

## Open Questions for Planning

1. **Scraping approach:** Use fetch + DOM parsing (cheerio CDN, or manual parsing)? Netlify function to avoid CORS? Third-party scraper service?
2. **Geolocation:** Prompt user on first load, or require manual city entry in Settings?
3. **Modal trigger:** Button in sidebar, gear menu, or dedicated card?
4. **Caching strategy:** How often to refresh? Force-refresh button?
5. **Calendar conflict matching:** Simple time-check only, or also mark as "dinner planned 6pm-7pm" → don't suggest events that overlap?
6. **API for Ticketmaster/AllTrails:** Which API tier? Free sandbox, or paid? (For Phase 2 planning)

---

## Phases

### Phase 1 (MVP)
- Data fetch: estatesales.net + Craigslist scraping
- Modal UI + event display
- Settings tab for location + distance + calendar overlay toggle
- Calendar integration (optional calendar overlay, read-only)
- Weather context (current/forecast display)

### Phase 1b (Quick Win)
- Calendar overlay visualization (show event types on calendar)

### Phase 2
- Add Ticketmaster API (concerts, live events)
- Add AllTrails API (hikes)
- Improve scraping robustness (error handling, fallbacks)
- Caching refinement (smart refresh)

### Phase 3+
- AI recommendations ("you like outdoor events → suggesting new trails")
- Notification system
- RSVP tracking
- More scrapers (local government events, festival calendars, etc.)

---

## Handoff to Planning

Planning should focus on:
1. **Data fetch & aggregation:** Which sources, how to scrape, CORS strategy, caching approach
2. **Modal + Settings UI:** Wireframe, integration with existing modals
3. **Calendar matching:** How to detect free time blocks, algorithm for conflict detection
4. **Error handling:** What if a source is down? Fallback UI?
5. **Performance:** Prefetching, lazy-loading, localStorage budget
6. **Testing:** Manual testing of scraping logic against live sites (fragile!)

---

## References

- Family Hub FEATURES.md: Feature map, existing modal patterns, calendar integration
- Existing scrapers/APIs: Weather (OpenWeatherMap), Calendar (Google), Photos (Google)
- Data sources: estatesales.net, Craigslist activities, (future) Ticketmaster, AllTrails
