---
title: "Implement Craigslist Activities Scraping"
date: 2026-06-19
status: Ready for Implementation
origin: docs/brainstorms/2026-06-18-event-discovery-requirements.md
---

# Implement Craigslist Activities Scraping

**Branch:** `feat/craigslist-scraping`  
**Depth:** Standard (single feature, follows established pattern)

---

## Problem Frame

Event discovery MVP requires aggregating events from Craigslist "activities" section (eee category) to surface local classes, DIY workshops, day trips, and community events. The backend already has a placeholder `scrapeCraigslist()` function that returns empty results. This plan fills that placeholder with a working implementation following the established `scrapeEstateSales()` pattern.

**Core Insight:** Craigslist shares the same HTML-scraping approach as estatesales.net but requires different URL construction, CSS selectors, and date parsing logic. Reusing the Cheerio + fetchWithRetry pattern ensures consistency and reliability.

---

## Requirements Traceability

**Origin requirement:** "Craigslist 'activities' | Classes, DIY, day trips, local events | Scrape | Already used; captures local variety"

**Success criteria from origin:**
- **Discovery:** MVP sources surface mix of sale/auction, local activity, outdoor, and community events
- **Reliability:** Scraping logic tolerates minor HTML changes; graceful fallback when source is down
- **Performance:** Events load within 2-3s (with caching)

**This plan advances MVP by:**
1. Implementing the second core data source (Craigslist activities)
2. Enabling event aggregation to return mixed results across multiple sources
3. Establishing reusable scraping pattern for future sources (Ticketmaster, AllTrails in Phase 2)

---

## Key Technical Decisions

### 1. Reuse Cheerio + fetchWithRetry Pattern (Established)

**Decision:** Follow the exact pattern from `scrapeEstateSales()` rather than inventing a new approach.

**Why:** The estatesales scraper is proven in production, handles errors gracefully, respects retry logic, and updates sourceStatus consistently. No new dependencies or error-handling models needed. Implementer learns from working code rather than building from scratch.

**Alternative considered:** Call a third-party scraper service (ScrapingBee, Bright Data) — would avoid Craigslist blocking, but adds external dependency and cost.

### 2. Craigslist Regional URL Construction

**Decision:** Build search URL as `https://{region}.craigslist.org/search/{category}` where region is derived from state (e.g., `ny.craigslist.org` for New York) and category is `eee` (activities).

**Why:** Craigslist organizes listings by region. The event discovery backend already routes locations to city+state; we map state → region code. The "activities" category (eee) is Craigslist's standardized listing type for classes, workshops, and local events.

**Alternative considered:** Search by coordinates (Craigslist has a `/geo/` endpoint) — more precise but less stable if API changes.

### 3. Incremental Parsing with Error Isolation

**Decision:** Wrap each listing's parse in a try-catch and log errors without failing the entire scrape. Return partial results when some items parse but others fail.

**Why:** Matches the estatesales pattern. Craigslist HTML is fragile (reorganizes frequently), so isolating errors per item allows graceful degradation — missing one listing is better than returning zero events when 20 parse successfully.

### 4. Event Type Categorization from Title + HTML Cues

**Decision:** Infer event type (class, activity, hike, food, sale, etc.) from title text using the existing `normalizeEventType()` helper. Fallback to generic "activity" when no match.

**Why:** Craigslist doesn't tag event type in metadata; title is the only semantic cue. The helper function already normalizes Ticketmaster types, so extending it to Craigslist titles is consistent. Fallback to "activity" is safe and honest.

---

## Implementation Units

### U1. Parse Craigslist Search Response and Extract Listings

**Goal:** Fetch Craigslist activities for a given city, parse the HTML response, and extract the raw listing data (title, URL, date, price, location).

**Requirements:** Enables aggregation of Craigslist results into event discovery pipeline. No type normalization or distance calculation yet.

**Dependencies:** None (independent)

**Files:**
- `netlify/functions/events.js` (modify `scrapeCraigslist()` function, lines 662-673)

**Approach:**

1. **URL construction:** Map state abbreviation to Craigslist region code (e.g., `NY` → `newyork`, `CA` → `sfbay`, etc.). Build search URL: `https://{region}.craigslist.org/search/{query}?` with query parameters for the activities category and sort by date.

2. **Fetch with retry:** Use the existing `fetchWithRetry()` helper (same pattern as estatesales). Include `User-Agent` header to respect rate limits.

3. **Parse HTML:** Load response with `cheerio.load()`. Iterate over listing rows using CSS selector for Craigslist's post-list container (e.g., `ol.posts li` or similar).

4. **Extract per listing:**
   - Title: text content of the listing link
   - URL: href attribute
   - Date posted: Craigslist shows relative date ("3 hours ago", "1 day ago") — parse and convert to ISO date
   - Price: if present (some listings include price)
   - Location: Craigslist shows neighborhood or area — extract as address or use city default
   - Attributes: Craigslist uses span.itemattr for additional tags (e.g., "pic", "email", "map") — note if present

5. **Build event payload:** Construct partial event object with raw data. Date parsing is deferred to U2.

**Patterns to follow:**
- `scrapeEstateSales()` function structure (lines 576-656)
- `fetchWithRetry()` call signature and error handling
- `sourceStatus.craigslist` object updates (matches estatesales pattern)
- CSS selector strategy: inspect live Craigslist HTML, test selectors against multiple listings

**Test scenarios:**
- Scrape returns results for a known city with active listings ✓
- Relative date parsing converts "3 hours ago" to current date ✓
- Missing optional fields (price, neighborhood) don't cause parse failure ✓
- Invalid HTML (missing elements) skips that listing but continues parsing others ✓
- Network timeout is retried up to 3x via fetchWithRetry ✓
- 404 or blocked response sets sourceStatus.craigslist.ok = false and returns [] ✓

**Verification:**
- Function returns array of 5-20 events for a known city
- Each event object has id, title, url, date, location fields (may be null for optional fields)
- sourceStatus.craigslist is updated with count and error state
- Console shows no unhandled errors; per-item errors logged with warning level

---

### U2. Normalize Dates and Infer Event Type

**Goal:** Transform raw Craigslist listing data into the shared event schema (matching estatesales format), including date normalization and event type inference.

**Requirements:** Enables events to be aggregated into the unified event list. Event type categorization enables filtering by user interest.

**Dependencies:** U1 (raw listing data exists)

**Files:**
- `netlify/functions/events.js` (extend `scrapeCraigslist()`, continue from U1)

**Approach:**

1. **Date parsing:** Craigslist posts show relative time ("3 hours ago", "2 days ago", "last week"). Parse relative dates and convert to YYYY-MM-DD. Handle edge cases: "today", "yesterday", timestamp-based formats if Craigslist uses them in some regions.

2. **Time extraction:** Craigslist listings typically don't include specific times for classes or activities. Set `time: null` and `duration: null` as safe defaults (or infer from title hints like "6pm" if present).

3. **Event type inference:** Pass title through `normalizeEventType()` helper (already exists, lines 688-701). This converts keywords like "hike", "workshop", "concert", "dinner" into canonical types (hike, class, concert, food, etc.). Fallback to `activity` if no match.

4. **Location assembly:** Use provided city/state from function parameters; extract neighborhood/address from Craigslist listing if present. Set lat/lon to the city's coordinates (already passed in).

5. **Build final event object:**
   ```js
   {
     id: `cl_${url.split('/').pop()}`, // Craigslist URL slug as ID
     title: title,
     type: normalizeEventType(title),
     source: 'craigslist',
     sourceUrl: url,
     date: normalizedDate,
     time: null,
     duration: null,
     location: { city, state, address, lat, lon, distanceMiles: null },
     description: title, // No detailed description in Craigslist listings
     weather: null       // Added by caller
   }
   ```

**Patterns to follow:**
- `normalizeEventType()` function (lines 688-701)
- Event schema from estatesales (lines 621-640)
- Date formatting: YYYY-MM-DD ISO format (matches calendar schema)
- sourceStatus updates (done in U1, carry forward)

**Test scenarios:**
- Relative date "3 hours ago" converts to today's date ✓
- Relative date "5 days ago" converts to correct past date ✓
- Relative date "last week" handles boundary (7+ days ago) ✓
- Title "yoga class" normalizes to type "class" ✓
- Title "hiking adventure" normalizes to type "hike" ✓
- Title "community potluck" normalizes to type "food" ✓
- Title with no matching keywords falls back to type "activity" ✓
- Event object matches schema (all required fields present, types correct) ✓
- Multiple events from same scrape have unique IDs ✓

**Verification:**
- Returned events conform to the shared event schema
- Event types are one of the canonical values (not raw Craigslist category)
- Dates are ISO format YYYY-MM-DD
- No unhandled null/undefined in required fields

---

### U3. Handle Craigslist Region Mapping and Error Resilience

**Goal:** Map all US states to Craigslist region codes; document known mapping limitations; ensure graceful fallback when Craigslist is blocked or returns no results.

**Requirements:** Enables the scraper to work across the US without per-state hardcoding. Robust error handling prevents cascade failures in event aggregation.

**Dependencies:** U1, U2 (implementation is complete; U3 is cleanup and resilience)

**Files:**
- `netlify/functions/events.js` (add state-to-region mapping object, update error handling in `scrapeCraigslist()`)

**Approach:**

1. **Build state-to-region map:** Create a mapping object at the top of the scraper section mapping US state codes (TX, CA, NY, etc.) to Craigslist region slugs. Most states have one region; some large states have multiple (CA has sfbay, losangeles, etc.). For ambiguity, pick the largest city/metro as default.

   Example:
   ```js
   const STATE_TO_CRAIGSLIST_REGION = {
     'NY': 'newyork',
     'CA': 'sfbay', // or pick based on lat/lon proximity
     'TX': 'dallas', // or 'houston', 'austin'
     // ... all 50 states
   };
   ```

2. **Lookup in scrapeCraigslist():** Fetch region from map using state parameter. Log a warning if state is unmapped (should not happen in production, but defensive).

3. **Error handling enhancements:**
   - Craigslist blocks scrapers with 403. Catch 403 and log as a rate-limit issue (not a bug). Set sourceStatus.craigslist.ok = false and return [] — don't retry.
   - Network timeout or 500: already handled by fetchWithRetry (3 retries built in).
   - HTML parsing errors: already wrapped in try-catch per item (U1). Log and skip that item.
   - Zero results: not an error; return empty array. sourceStatus.craigslist.ok = true, count = 0.

4. **Documentation:** Add a comment block in the code explaining the mapping, limitations (some states map to a default region), and the 403 rate-limit signal.

**Patterns to follow:**
- Error handling from scrapeEstateSales (lines 650-656): catch, log, update sourceStatus, return []
- Mapping pattern: object/dict lookup, with fallback/default when key not found
- Console logging: use `[Events]` prefix (matches existing pattern)

**Test scenarios:**
- scrapeCraigslist('Rochester', 'NY', ...) maps to 'newyork' region ✓
- scrapeCraigslist('San Francisco', 'CA', ...) maps to 'sfbay' region (or 'losangeles' alternative) ✓
- scrapeCraigslist('Dallas', 'TX', ...) maps to 'dallas' region ✓
- 403 Forbidden response: logs rate-limit warning, sets sourceStatus.ok = false, returns [] ✓
- 500 Server error: retries 3x via fetchWithRetry, then returns [] ✓
- Timeout: retried 3x, returns [] if all fail ✓
- HTML with zero listings: returns empty array, sourceStatus.ok = true ✓
- Unmapped state code (e.g., 'XX'): logs warning, returns [] (defensive) ✓

**Verification:**
- Mapping covers all 50 US states
- Error cases return empty array without throwing
- sourceStatus reflects success/failure accurately
- Logs are clear and actionable (rate-limit vs. parse vs. network)

---

## Scope Boundaries

### In Scope

- Scraping Craigslist "activities" (eee) category for a given city/state
- Normalizing listings to the shared event schema
- Following established estatesales.net pattern for consistency
- Error handling: graceful fallback, no cascade failures
- State-to-region mapping for US locations

### Out of Scope (Deferred to Follow-Up Work)

- Scraping other Craigslist categories (for-sale, jobs, services) — different event types, separate scope
- Dynamic region selection based on lat/lon proximity (hardcoded state → region mapping sufficient for MVP)
- Caching strategy or refresh frequency (backend aggregation caller handles this)
- Frontend filtering/sorting (handled by existing modal UI)
- Ticketmaster/AllTrails scraping (Phase 2)
- Anti-scraping measures beyond User-Agent header (basic compliance sufficient for MVP)

---

## Key Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Craigslist HTML structure changes | Medium | Brittle CSS selectors; monitor for failures. Error isolation per item means partial results degrade gracefully. Log all parse failures for visibility. |
| Rate limiting / 403 blocks | Low (rare for one-off queries) | Existing fetchWithRetry + User-Agent header. 403 is caught, logged as rate-limit, does not retry. |
| Relative date parsing edge cases | Low | Test against multiple date formats observed in the wild (3h ago, yesterday, last week, specific dates in some listings). Use robust regex patterns. |
| Poor event type inference | Medium | Title-based inference is lossy. Many Craigslist listings use vague titles like "Fun things to do". Fallback to generic "activity" is honest. Accept that some events are under-categorized. |
| Geographic ambiguity (large states) | Low | CA and TX map to a default region (sfbay, dallas). For MVP, acceptable. Future: use lat/lon to pick closest region. |

---

## Success Criteria

✅ **Craigslist scraper returns 5-20 events** per city when listings are available  
✅ **Event schema compliance** — all events match the shared schema (id, title, type, source, date, location, etc.)  
✅ **Error resilience** — scraper returns empty array rather than throwing when source is down  
✅ **Type inference** — inferred types are canonicalized (hike, class, activity, food, etc.)  
✅ **Integration** — events are aggregated alongside Ticketmaster, Eventbrite in the main event pipeline  
✅ **No new dependencies** — uses only existing Cheerio + fetchWithRetry  

---

## References

- **Origin:** `docs/brainstorms/2026-06-18-event-discovery-requirements.md` (Event Discovery MVP scope)
- **Backend:** `netlify/functions/events.js` (existing `scrapeEstateSales()` pattern, lines 576-656)
- **Event schema:** Origin requirements, Data Model section
- **Existing helper:** `normalizeEventType()` function (lines 688-701)
- **Craigslist:** Activities category at `https://{region}.craigslist.org/search/eee`
