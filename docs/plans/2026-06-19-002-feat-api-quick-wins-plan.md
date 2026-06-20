---
title: "Implement Printing Press API Quick Wins"
date: 2026-06-19
status: Ready for Implementation
origin: docs/brainstorms/2026-06-18-event-discovery-requirements.md + docs/API_RESEARCH.md
---

# Implement Printing Press API Quick Wins

**Branch:** `feat/api-quick-wins`  
**Depth:** Standard (3 focused backend improvements)

---

## Problem Frame

The event discovery backend currently uses only 1 Eventbrite endpoint (`/events/search`) and basic Ticketmaster parameters (`/events.json` with latlong/radius/size/sort). Printing Press API analysis revealed:

- **Eventbrite:** 61 endpoints across 13 resources; current backend ignores categories, subcategories, and venue endpoints
- **Ticketmaster:** ~10 main endpoints; current backend doesn't use advanced parameters (keyword, attractionId, venueId)

This underutilization means:
- Event type filtering relies on normalization heuristics rather than official taxonomy
- Venue context (capacity, ratings, accessibility) is missing from event cards
- Advanced search (by artist/venue) is unavailable to frontend

**Core Insight:** Quick implementation of discovered endpoints will improve event discovery quality and lay foundation for richer filtering UI.

---

## Requirements Traceability

This plan advances the Event Discovery feature (origin: `2026-06-18-event-discovery-requirements.md`) by enriching backend capabilities:

- Origin requirement: "Event cards showing... location + distance from home" → venues need capacity/ratings context (U2)
- Origin requirement: "Filter by event type" → need official taxonomy sources (U1)
- Origin requirement: "Browsable for future dates; focus on 'this week' / 'this weekend'" → advanced filtering improves UX (U3)

Each unit is additive and ship-able independently. No blocking dependencies between units.

---

## Key Technical Decisions

### 1. Eventbrite Categories as Single Call, Cached Serverside

**Decision:** Fetch categories/subcategories once per server start (or on-demand with TTL), cache in memory or short-lived file storage.

**Why:** Categories are stable reference data (rarely change). Fetching on every event search is wasteful. Caching prevents rate-limit churn.

**Alternative considered:** Fetch in frontend and cache in localStorage — simpler, but shifts auth complexity to client (token exposure risk).

### 2. Venue Details via Expansion Parameter, Not Separate Calls

**Decision:** Leverage Eventbrite's existing `expand=venue` parameter in `/events/search` to include venue details inline. Do not make separate venue API calls.

**Why:** Eventbrite already supports this. One request is cheaper than N venue lookups. Reduces API quota consumption and latency.

### 3. Ticketmaster Advanced Params Passed Through, Not Filtered

**Decision:** Backend accepts `keyword`, `attractionId`, `venueId` from frontend and passes them directly to Ticketmaster API. No client-side filtering.

**Why:** Ticketmaster applies these server-side; filtering client-side after full result set is inefficient. Offload to API.

---

## Implementation Units

### U1. Fetch and Cache Eventbrite Categories/Subcategories

**Goal:** Populate a categories registry from Eventbrite `/categories` and `/subcategories` endpoints so the backend can reference official taxonomy instead of normalizing on heuristics.

**Requirements:** Enables official event type filtering in UI without guesswork normalization.

**Dependencies:** None (can ship independently)

**Files:**
- `netlify/functions/events.js` — add category caching logic and new endpoint or startup routine
- `docs/API_RESEARCH.md` — reference for category endpoint details

**Approach:**

Eventbrite exposes:
- `GET /categories` — returns list of top-level categories (e.g., "Music", "Comedy", "Sports")
- `GET /subcategories` — returns detailed taxonomy (e.g., "Rock Concert" under "Music")

Add a simple cache to the Netlify function:
1. **On startup or first event search:** Fetch categories and subcategories from Eventbrite API
2. **Store in memory:** Keep a simple JS object mapping category IDs to names
3. **TTL:** Refresh every 24 hours (can be lazy or scheduled)
4. **Fallback:** If fetch fails, use hardcoded fallback list or skip enrichment gracefully
5. **Response:** Attach category metadata to event search responses so frontend can filter/label by official taxonomy

**Patterns to follow:**
- Mirror the retry logic in `fetchWithRetry()` used by existing API calls (exponential backoff)
- Follow existing error handling pattern: log to console, continue gracefully if category fetch fails

**Test scenarios:**
- Categories fetch succeeds and are available within 500ms (memoized) ✓
- Categories fetch fails; events still return without category enrichment ✓
- Category ID matches returned events; frontend can filter by category ✓
- TTL expires; fresh fetch happens on next request ✓
- Hardcoded fallback covers top 10 categories if API is unavailable ✓

**Verification:**
- Categories are memoized in memory and do not re-fetch on every request
- Event responses include category metadata when available
- Frontend can filter/group events by category ID or name
- Graceful degradation when API is down

---

### U2. Enrich Venue Data in Event Responses

**Goal:** Add venue capacity, ratings, and accessibility details to event cards by leveraging Eventbrite's built-in venue expansion and (optionally) Ticketmaster venue endpoint.

**Requirements:** Event cards display richer venue context for decision-making ("capacity 500 → small intimate show" vs. "capacity 15000 → arena concert").

**Dependencies:** None (can ship independently)

**Files:**
- `netlify/functions/events.js` — update Eventbrite fetch to use `expand=venue`; optionally add Ticketmaster venue enrichment

**Approach:**

**For Eventbrite:** Already partially done. The existing `/events/search` call includes `expand=venue` in the query params (line ~264). Verify venue details are extracted and passed through to the response.

**For Ticketmaster:** Eventbrite response already includes venue; Ticketmaster's `/events.json` response may include limited venue data. Optionally:
1. For high-value events (first N results), make a **single parallel call** to `/venues.json` with a `id=` filter to fetch details
2. Merge capacity/details back into event response
3. **Keep it simple:** Don't call `/venues/{id}` for each event. One bulk call is acceptable.

**Data shape:**
```js
// Enrich event.location with:
{
  name: "Moda Center",
  capacity: 19980,
  address: "...",
  website: "...",
  accessibility: {
    wheelchairAccess: true,
    parking: true,
    transit: "TriMet line 4, 8"
  }
}
```

**Patterns to follow:**
- Existing pattern: handle missing/partial venue data gracefully (don't crash if field is empty)
- Follow lazy-load pattern: enrich what you can, skip enrichment if source doesn't provide it

**Test scenarios:**
- Eventbrite event includes venue expand data; venue name + capacity present in response ✓
- Ticketmaster event venue details merged from `/venues` call (if capacity >0) ✓
- Venue enrichment missing doesn't break event display (graceful fallback) ✓
- Venue data matches event response (no stale/mismatched data) ✓

**Verification:**
- Event responses include venue.name, venue.capacity, venue.address
- Frontend event cards display venue capacity or rating when available
- No venue data means event still displays without venue section

---

### U3. Add Ticketmaster Advanced Filtering Parameters

**Goal:** Extend Ticketmaster backend integration to accept and forward `keyword`, `attractionId`, and `venueId` parameters, enabling frontend filters for artist/venue search.

**Requirements:** Backend supports advanced search for better event discovery UX ("find concerts by artist X" or "events at venue Y").

**Dependencies:** None (can ship independently)

**Files:**
- `netlify/functions/events.js` — extend fetchTicketmaster() to accept and forward advanced params

**Approach:**

Current Ticketmaster call (line ~152-170) uses hardcoded params: `latlong`, `radius`, `size`, `sort`.

Extend to accept optional parameters from query string:
- `keyword` — search in event name/description (e.g., "Hendrix tribute band")
- `attractionId` — filter by artist/performer (e.g., attractionId=K8vZ9A7XC1d)
- `venueId` — filter by venue (e.g., venueId=Z7r9Zk7XB1d)

**Implementation:** 
1. Modify handler signature to accept these params (e.g., `searchEvents(lat, lon, keyword, attractionId, venueId)`)
2. Build query params object conditionally:
   ```js
   const params = {
     apikey: key,
     latlong: `${lat},${lon}`,
     radius: 120,
     size: 50,
     sort: 'date,asc'
   };
   if (keyword) params.keyword = keyword;
   if (attractionId) params.attractionId = attractionId;
   if (venueId) params.venueId = venueId;
   ```
3. Pass to Ticketmaster; API handles filtering server-side
4. **Validation:** Sanitize/validate attractionId and venueId to prevent injection (alphanumeric check)

**Patterns to follow:**
- Mirror Eventbrite param handling (safe string pass-through)
- Add inline comments explaining parameter origin and Ticketmaster API docs link

**Test scenarios:**
- Keyword search returns events matching text (e.g., "jazz" returns jazz events) ✓
- attractionId filter returns events for specific artist ✓
- venueId filter returns events at specific venue ✓
- Multiple params combined work correctly (keyword + attractionId) ✓
- Invalid/missing params don't break request (optional params) ✓
- API rejects/handles malformed IDs gracefully ✓

**Verification:**
- Backend accepts keyword, attractionId, venueId query params
- Ticketmaster API receives and applies filters correctly
- Filtered results return fewer/more specific events as expected
- Invalid IDs logged and handled gracefully

---

## Scope Boundaries

### In Scope

- Backend endpoint and parameter extensions for Ticketmaster and Eventbrite
- Caching of stable reference data (categories)
- Data enrichment (venue details) in existing responses
- Graceful fallback and error handling for all enhancements

### Out of Scope (Deferred to Follow-Up Work)

- **Frontend filtering UI** — building the category/artist/venue filters in the modal (depends on backend being ready; separate work)
- **CLI generation** — building standalone Ticketmaster/Eventbrite CLIs (exploratory; defer based on adoption)
- **estatesales.net scraper** — keeping as placeholder; revisit if estate sales become high-value discovery category
- **Ticketmaster venue endpoint optimization** — venueId can be optimized later if we see high call volume
- **Advanced caching strategy** — current per-request caching sufficient for MVP; optimize cache invalidation later if needed

---

## Success Criteria

✅ **Backend APIs enhanced:** Ticketmaster accepts keyword/attractionId/venueId; Eventbrite categories fetched and available  
✅ **Data enriched:** Event responses include official category, venue capacity/details  
✅ **Graceful degradation:** API failures don't crash event discovery; fallbacks work  
✅ **Ready for UI:** Frontend team can build filters on top of backend parameters  
✅ **Documented:** Code comments explain parameter origin and API constraints  

---

## Implementation Notes

- **Execution posture:** No special posture required. Straightforward backend enhancement. Standard implementation approach.
- **Testing:** Focus on API behavior (mocking Ticketmaster/Eventbrite responses). Verify parameter passing and data shape. Edge cases: missing venue, failed category fetch, invalid IDs.
- **Dependencies:** No new npm packages required. Uses existing fetch + error handling patterns.
- **Risk:** Low. Changes are additive (new params, new data fields). No removal of existing behavior.

---

## References

- **API Research:** `docs/API_RESEARCH.md` — full endpoint catalog, parameter reference, quick-win identification
- **Backend Code:** `netlify/functions/events.js` — current integration, retry logic, error handling patterns
- **Origin Requirements:** `docs/brainstorms/2026-06-18-event-discovery-requirements.md` — event discovery feature scope
- **Ticketmaster API:** https://developer.ticketmaster.com/docs/read/ticketmaster_discovery_api
- **Eventbrite API:** https://www.eventbrite.com/platform/api/ (categories, subcategories, venue expansion)
