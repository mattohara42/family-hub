---
title: "Add Alternative Event Sources (Craigslist + AllTrails)"
date: 2026-06-19
status: Ready for Implementation
origin: docs/brainstorms/2026-06-18-event-discovery-requirements.md
---

# Add Alternative Event Sources: Craigslist Scraping + AllTrails API

**Branch:** `feat/alternative-event-sources`  
**Depth:** Standard (two independent data sources, both high-value)

---

## Problem Frame

Event discovery currently relies on Ticketmaster (concerts/live events) and Eventbrite (classes/workshops). This covers formal events well but misses:
- **Local sales & markets** — garage sales, estate sales, secondhand shopping, farmers markets
- **Outdoor activities** — hiking trails, parks, nature events
- **Community & DIY** — workshop classes, meetups, local skill-shares
- **Food culture** — food festivals, supper clubs, restaurant events

This plan adds two complementary data sources:
1. **Craigslist activities section** — scrapes "eee" category for local, grassroots events
2. **AllTrails API** — curated hiking and outdoor activity data with rich metadata (difficulty, elevation, reviews)

Together, they provide the "serendipity" and local discovery the family currently gets by manually browsing multiple sites.

---

## Requirements Traceability

**Origin requirement:** "No single place shows 'what's interesting to do this weekend when we're free, given the weather?'"

**This plan addresses:**
- **Variety:** Craigslist + AllTrails expand beyond formal ticketed events to grassroots and outdoor activities
- **Local discovery:** Both sources emphasize local, nearby opportunities (not just major concerts)
- **Relevance:** AllTrails integrates with weather context (outdoor activity appropriateness); Craigslist surfaces community engagement

**Success criteria from origin:**
- Discovery: Family discovers events they wouldn't find on Ticketmaster/Eventbrite
- Variety: Mix of sales, local activity, outdoor, and community events
- Reliability: Scraping tolerates minor changes; API calls fail gracefully
- Performance: Events load within 2-3s

---

## Key Technical Decisions

### 1. Craigslist: Scrape, Don't API (No Public API)

**Decision:** Parse Craigslist HTML using Cheerio, following the established `scrapeEstateSales()` pattern.

**Why:** Craigslist has no public API. Web scraping is the only option. Cheerio is already in the project and proven via estatesales pattern. Scraping is accepted practice for Craigslist (it's a classifieds site, expects traffic).

**Constraints:** Craigslist HTML is fragile; selectors may break if site structure changes. Mitigated by per-item error isolation (return partial results, don't fail entirely).

### 2. AllTrails: Use Official API (Free Tier Available)

**Decision:** Call AllTrails API directly (free tier: 50 requests/month, 25 trails per request). Fallback to returning empty if rate limit hit.

**Why:** AllTrails has a structured API, rich metadata (difficulty, elevation, distance, reviews, weather context), and official support. No scraping needed. Free tier is sufficient for MVP (users search occasionally, not constantly).

**Alternative considered:** Scrape AllTrails website — would avoid API dependency but breaks terms of service and is fragile.

### 3. Normalize to Shared Event Schema

**Decision:** Both sources output events in the same schema as Ticketmaster/Eventbrite (id, title, type, source, date, location, description, weather, etc.).

**Why:** Unified schema allows aggregation without frontend changes. Existing calendar integration and filtering work for all sources transparently.

### 4. Incremental Parsing with Graceful Degradation

**Decision:** Wrap each item's parse in try-catch. Return partial results when some items parse but others fail.

**Why:** Craigslist HTML is unstable; AllTrails API may rate-limit. Returning 15 events instead of 20 is acceptable; returning 0 events when API is briefly down is not.

---

## Implementation Units

### U1. Scrape Craigslist Activities (eee category)

**Goal:** Fetch Craigslist "activities" for a given city, parse the HTML, and return normalized event records covering local classes, DIY, workshops, yard sales, community events, and food-related activities.

**Requirements:** Enables local discovery of grassroots events and activities. Covers local sales, community calendar, and DIY categories from the four priorities.

**Dependencies:** None (independent)

**Files:**
- `netlify/functions/events.js` (replace placeholder `scrapeCraigslist()`, lines 662-673)

**Approach:**

1. **URL construction:** Map US state → Craigslist region (NY → newyork, CA → sfbay, TX → dallas, etc.). Build search URL: `https://{region}.craigslist.org/search/eee` (eee = activities category).

2. **Fetch & parse:** Use existing `fetchWithRetry()` helper with User-Agent header. Load HTML with `cheerio.load()`.

3. **Extract listings:** Iterate over Craigslist listing rows (CSS selector for `<li>` posts). Per item, extract:
   - Title (listing link text)
   - URL (href)
   - Date posted (Craigslist shows relative time: "3 hours ago", convert to ISO date)
   - Price (if present)
   - Location/neighborhood (if present; fallback to city)

4. **Normalize to schema:**
   - **id:** `cl_${url-slug}`
   - **title:** As extracted
   - **type:** Infer from title using existing `normalizeEventType()` helper (hike, class, food, activity, sale, etc.)
   - **source:** `craigslist`
   - **sourceUrl:** Full Craigslist listing URL
   - **date:** Parsed from relative timestamp (today, yesterday, N days ago)
   - **time:** null (Craigslist doesn't specify times)
   - **duration:** null
   - **location:** {city, state, address/neighborhood, lat, lon, distanceMiles: null}
   - **description:** Title or excerpt (if available)
   - **weather:** null (added by caller)

5. **Error handling:**
   - Per-item parse errors: log warning, skip that item, continue
   - Network timeout: retry via fetchWithRetry (3x)
   - 403 Forbidden (rate limit): log, return [] with sourceStatus.ok = false
   - 404 or bad URL: return [] with sourceStatus.ok = false

6. **Update sourceStatus:** Set `sourceStatus.craigslist = { ok: true/false, count: N, error: null or message }`

**Patterns to follow:**
- `scrapeEstateSales()` function structure (error handling, sourceStatus updates, return format)
- `fetchWithRetry()` call signature (lines 532-573)
- `normalizeEventType()` helper (lines 688-701)
- CSS selector strategy: test against live Craigslist HTML; document selectors in comments

**Test scenarios:**
- Scrape returns 5-20 events for a city with active listings ✓
- Relative date "3 hours ago" converts to today's date ✓
- Relative date "5 days ago" converts to correct past date ✓
- Title "yoga class" normalizes to type "class" ✓
- Title "hiking adventure" normalizes to type "hike" ✓
- Title "community potluck" normalizes to type "food" ✓
- Title with no keyword match falls back to type "activity" ✓
- Network timeout is retried, returns [] on failure ✓
- 403 Forbidden sets sourceStatus.ok = false, returns [] ✓
- HTML parse error on one listing skips that item, returns others ✓
- Zero listings returns empty array (not an error) ✓

**Verification:**
- Returns array of 0-20 events for test cities
- Event objects conform to shared schema (all required fields present)
- Event types are canonical (hike, class, food, activity, sale, etc.)
- Dates are ISO format YYYY-MM-DD
- sourceStatus.craigslist reflects success/failure accurately
- Per-item errors logged as warnings (visible in netlify dev logs)

---

### U2. Integrate AllTrails API for Outdoor Activities

**Goal:** Call AllTrails API to fetch hiking trails and outdoor activities for a given location. Return normalized event records covering outdoor recreation category.

**Requirements:** Provides curated, high-quality outdoor activity data with rich metadata (difficulty, elevation, reviews). Integrates weather context for activity appropriateness.

**Dependencies:** None (independent from U1; both can be implemented in parallel)

**Files:**
- `netlify/functions/events.js` (add `scrapeAllTrails()` function, integrate into event aggregation pipeline)
- `.env.local` (AllTrails API key for local dev; production uses Netlify env var)

**Approach:**

1. **API setup:**
   - Sign up for AllTrails API key at https://www.alltrails.com/api (free tier: 50 requests/month)
   - Store key in environment variable `ALLTRAILS_API_KEY`
   - Endpoint: `https://www.alltrails.com/api/v1/trails` (or current version)

2. **Build request:**
   - Query parameters:
     - `latitude` and `longitude` (city center, already have from geocoding)
     - `radius` (default: 50km, matches event discovery radius)
     - `sort` (by distance or rating)
   - Limit: 25 trails per request (free tier allows)
   - Include fields: name, difficulty, elevation_gain, distance, rating, reviews, location, url, etc.

3. **Fetch & handle:**
   - Use `fetchWithRetry()` helper with Authorization header (Bearer token)
   - 401 Unauthorized: API key invalid or expired. Log error, return []
   - 429 Rate Limited: Hit monthly quota. Log, return [], set sourceStatus.ok = false but error = "rate_limit"
   - 200: Parse response JSON

4. **Normalize to schema:**
   - **id:** `at_${trail-id}`
   - **title:** Trail name
   - **type:** `hike` (all AllTrails entries are outdoor/hiking)
   - **source:** `alltrails`
   - **sourceUrl:** AllTrails trail URL
   - **date:** null (trails are recurring; no specific event date)
   - **time:** null
   - **duration:** Estimated from trail length/difficulty (calculate or use AllTrails estimate)
   - **location:** {city, state, address (trail name/location), lat, lon, distanceMiles: calculated from radius}
   - **description:** Trail description, difficulty level, elevation gain (e.g., "Moderate hike, 8.2 mi, +1200 ft elevation")
   - **weather:** null (caller adds; should check weather appropriateness for hiking)

5. **Weather integration note:**
   - For hikes, weather is contextual: "don't suggest muddy/rainy trails during rain" (future enhancement)
   - For MVP, just include weather temp/condition and let user decide

6. **Error handling:**
   - API key missing: skip AllTrails, return []
   - Network timeout: retry via fetchWithRetry
   - 429 Rate limit: log, return [] with sourceStatus.ok = false, error = "monthly_quota_exceeded"
   - Parse error: log, skip that trail, continue
   - No trails found: return empty array (not an error)

7. **Update sourceStatus:** Set `sourceStatus.alltrails = { ok: true/false, count: N, error: null or message }`

**Patterns to follow:**
- `fetchWithRetry()` call pattern (lines 532-573)
- Event schema normalization (same as U1)
- Error handling: catch, log, update sourceStatus, return []
- API key handling: read from `process.env.ALLTRAILS_API_KEY`

**Test scenarios:**
- API call returns 5-15 trails for a city with hiking nearby ✓
- Trail data normalizes to event schema (all required fields present) ✓
- Difficulty level parsed correctly (easy, moderate, hard) ✓
- Distance and elevation extracted and included in description ✓
- Trail URL points to valid AllTrails page ✓
- Missing API key logs error, returns [] ✓
- 429 Rate limit sets sourceStatus.ok = false with rate_limit error ✓
- Network timeout retried, returns [] on failure ✓
- No trails found returns empty array with sourceStatus.ok = true ✓
- Parse error on one trail skips it, returns others ✓

**Verification:**
- Returns 0-15 event records for test locations
- All events have type = "hike"
- Event objects conform to shared schema
- sourceStatus reflects success and rate-limit states
- API key requirement is documented (README or comments)

---

### U3. Integrate Both Sources into Event Aggregation Pipeline

**Goal:** Wire Craigslist and AllTrails into the main event aggregation flow (alongside Ticketmaster/Eventbrite). Ensure both sources contribute to results without blocking on either.

**Requirements:** Users see a mix of sources in event discovery. One source down doesn't prevent others from loading.

**Dependencies:** U1 (Craigslist scraper), U2 (AllTrails API)

**Files:**
- `netlify/functions/events.js` (update main `handler()` function, lines ~100-110, to call both new scrapers)

**Approach:**

1. **Update aggregation call:** In the main event handler, update the `Promise.allSettled()` call to include `scrapeCraigslist()` and `scrapeAllTrails()` alongside existing `fetchTicketmasterEvents()` and `fetchEventbriteEvents()`.

   Current pattern:
   ```js
   const [tmEvents, ebEvents, estateSalesEvents, craigslistEvents] = await Promise.allSettled([
     fetchTicketmasterEvents(...),
     fetchEventbriteEvents(...),
     scrapeEstateSales(...),
     scrapeCraigslist(...)  // Add this
   ]);
   ```

   With AllTrails:
   ```js
   const [tmEvents, ebEvents, craigslistEvents, alltrailsEvents] = await Promise.allSettled([
     fetchTicketmasterEvents(...),
     fetchEventbriteEvents(...),
     scrapeCraigslist(...),
     scrapeAllTrails(...)
   ]);
   ```

2. **Extract settled values:** Use existing `extractSettledValue()` helper to safely get results from each source, with fallback to [] if source fails.

3. **Concatenate & return:** Combine all source results into a single events array. Return alongside existing `sourceStatus` object.

4. **No changes needed to:**
   - Frontend modal (already handles mixed sources)
   - Filtering/sorting (works on aggregated list)
   - Calendar integration (works on aggregated list)

**Patterns to follow:**
- `Promise.allSettled()` pattern (lines ~103)
- `extractSettledValue()` helper (lines 679-687)
- sourceStatus object structure (already exists, just add craigslist and alltrails entries)

**Test scenarios:**
- Both scrapers called in parallel ✓
- One source fails, others still return results ✓
- All sources succeed, results concatenated ✓
- sourceStatus includes entries for both new sources ✓
- Frontend receives mixed array with events from all sources ✓

**Verification:**
- API call returns events from all sources mixed together
- sourceStatus shows status for each source (ok, count, error)
- One source failing doesn't prevent others from loading
- Frontend event count increases (more sources = more events)

---

## Scope Boundaries

### In Scope

- Scraping Craigslist "activities" (eee) category
- Calling AllTrails API for hiking/outdoor activities
- Normalizing both to shared event schema
- Error handling: graceful fallback, no cascade failures
- Integration into existing aggregation pipeline
- State-to-region mapping for Craigslist
- Basic weather integration (temp/condition noted; detailed weather matching deferred)

### Out of Scope (Deferred to Follow-Up Work)

- Advanced weather matching (don't suggest outdoor hikes during thunderstorms) — future enhancement
- Meetup.com API for community events — Phase 2
- Yelp or restaurant aggregators for food events — Phase 2
- Dynamic region selection for Craigslist based on lat/lon proximity — hardcoded mapping sufficient for MVP
- AllTrails premium tier features (trail conditions, permit requirements) — free tier sufficient for MVP
- Caching strategy (backend caller handles refresh frequency)

---

## Key Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Craigslist HTML structure changes | Medium | Brittle CSS selectors. Mitigated by error isolation per item (partial results, not all-or-nothing). Monitor logs for parse failures. |
| AllTrails API rate limit (50/mo free tier) | Low | Rate limit is per calendar month. Typical user searches 2-3x/month. If exceeded, error logged and user sees Ticketmaster/Eventbrite results. Consider upgrading to paid tier if usage grows. |
| AllTrails API key leaked | Low | Never commit .env.local. Store in Netlify env vars for production. Document in README. |
| Poor trail-to-event matching | Low | AllTrails trails aren't "events" (no date/time). Presented as "available anytime" activities. Mitigated by including in "things to do" discovery, not formal event calendar. |
| Weather context for hiking | Low | MVP just shows current weather. Advanced "don't suggest muddy trails in rain" deferred to Phase 2. Current approach is honest. |
| Craigslist listings are stale | Low | Craigslist auto-archives old listings. Expect mostly current events. Listings >7 days old naturally drop off. |

---

## Integration with Existing Features

**Event Modal:** Both sources' events appear in the existing discovery modal alongside Ticketmaster/Eventbrite results. No UI changes needed.

**Filtering & Sorting:** Existing type filters (concert, hike, class, sale, activity) work across all sources. AllTrails always returns type "hike"; Craigslist infers type from title.

**Calendar Integration:** Both sources' events subject to calendar conflict detection. Hikes and outdoor activities show on calendar if enabled (respecting distance filter).

**Weather Context:** Existing weather integration adds temp/condition to event cards. Hiking events show "good hiking weather" or "rainy" context automatically.

---

## Success Criteria

✅ **Craigslist scraper returns 5-20 events** per city (when listings exist)  
✅ **AllTrails API returns 5-15 trails** per location (when trails exist)  
✅ **Both normalize to shared event schema** — events mix seamlessly in results  
✅ **Error resilience** — one source down doesn't block others  
✅ **No new dependencies** — uses existing Cheerio + fetchWithRetry  
✅ **Type inference works** — Craigslist types inferred from title; AllTrails all "hike"  
✅ **Integration seamless** — frontend sees aggregated results, no code changes needed  

---

## References

- **Origin:** `docs/brainstorms/2026-06-18-event-discovery-requirements.md`
- **Backend aggregation:** `netlify/functions/events.js` (lines 90-110, event pipeline)
- **Event schema:** Origin requirements, Data Model section
- **Craigslist:** Activities (eee) at `https://{region}.craigslist.org/search/eee`
- **AllTrails API:** https://www.alltrails.com/api (free tier, 50 requests/month)
- **Existing patterns:** `scrapeEstateSales()` (lines 576-656), `fetchWithRetry()` (lines 532-573), `normalizeEventType()` (lines 688-701)
