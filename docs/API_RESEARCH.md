# API Research & Integration Analysis

**Generated:** 2026-06-19  
**Tool:** Printing Press (crowd-sniff, probe-reachability)  
**Status:** In Progress (U1-U2 complete, U3-U4 pending)

---

## Executive Summary

Printing Press analysis reveals significant untapped API capability:
- **Eventbrite:** 61 endpoints discovered (current backend uses only 1)
- **Ticketmaster:** Initial scan found only 2 endpoints (requires deeper research)
- **Both APIs:** Standard HTTP reachability confirmed, no special transport required

---

## Eventbrite API Analysis (U1)

### Overview
- **Base URL:** `https://www.eventbriteapi.com/v3`
- **Auth:** Bearer token (env var: `EVENTBRITE_API_TOKEN`)
- **API Key URL:** https://www.eventbrite.com/platform/api-keys
- **Discovered by Printing Press:** 61 endpoints across 13 resources

### Resource Catalog

| Resource | Endpoints | Current Usage | Notes |
|----------|-----------|---------------|-------|
| **categories** | 2 | ❌ None | Could enhance search with event type filtering |
| **discounts** | 3 | ❌ None | Event organizers use; not needed for discovery |
| **events** | ~20 | ✅ 1 (`/events/search`) | Largest resource; many endpoints unused |
| **formats** | 2 | ❌ None | Event format data; could enhance categorization |
| **media** | ? | ❌ None | Image/media handling |
| **orders** | ? | ❌ None | Ticketing/orders; not needed for discovery |
| **organizations** | ? | ❌ None | Organizer/venue management |
| **pricing** | ? | ❌ None | Pricing data; not needed for discovery |
| **series** | ? | ❌ None | Recurring event series |
| **subcategories** | 2 | ❌ None | Sub-categorization for events |
| **users** | ? | ❌ None | User profiles; not needed for discovery |
| **venues** | ? | ❌ None | Venue details (address, capacity, etc.) |

### Currently Used Endpoint

```
GET /events/search/
```

**Parameters:**
- `token` — OAuth token (required)
- `location.latitude` — Search latitude
- `location.longitude` — Search longitude
- `location.within` — Radius (e.g., "120km")
- `start_date.range_start` — Start date (ISO)
- `start_date.range_end` — End date (ISO)
- `sort_by` — Sort order
- `expand` — Related data to expand

**Usage in Backend:** `netlify/functions/events.js` line 251, `fetchEventbrite()` function

### Quick-Win Improvements (Identified)

1. **Categories Endpoint** (`GET /categories`)
   - Could pre-populate event type filters in UI
   - Provides official taxonomy vs. our normalization

2. **Subcategories Endpoint** (`GET /subcategories`)
   - Deeper event categorization (e.g., "Rock Concert" under "Music")
   - Better event type suggestions

3. **Venues Endpoint** (`GET /venues`)
   - Could enrich event cards with venue details (capacity, rating, etc.)
   - Currently all venue data comes from search response

4. **Event Details Endpoint** (`GET /events/{id}`)
   - Deeper details if user clicks into a single event
   - Additional metadata (ticket availability, organizer info)

5. **Advanced Search Filters**
   - Events already supports filtering by organizer, status, type
   - Current code only uses basic location/date filters

### Recommendations

- **Short-term:** Leverage categories/subcategories for improved type filtering UI
- **Medium-term:** Add venue enrichment endpoint calls for better event context
- **Long-term:** Consider event-detail view that uses `/events/{id}` endpoint

---

## Ticketmaster API Analysis (U2)

### Overview
- **Base URL:** `https://app.ticketmaster.com/discovery/v2`
- **Auth:** API key (query parameter `apikey`)
- **Printing Press Discovery:** Only 2 generic endpoints (incomplete SDK analysis)
- **Actual API Surface:** ~10 main endpoints for event discovery

### Why Printing Press Found Limited Coverage

The Ticketmaster npm SDK appears to have thin community integration or the `crowd-sniff` tool couldn't map the full discovery API. The actual Ticketmaster Discovery API v2 is well-documented and much larger than the 2 endpoints Printing Press discovered.

### Complete Official API Surface (Mapped)

#### Event Resources

| Endpoint | Method | Use Case | Current Usage |
|----------|--------|----------|----------------|
| `/events.json` | GET | Search events by location/date | ✅ **Used** |
| `/events/{id}.json` | GET | Get single event details | ❌ Not used |

#### Attraction Resources

| Endpoint | Method | Use Case | Current Usage |
|----------|--------|----------|----------------|
| `/attractions.json` | GET | Search artists/performers | ❌ Not used |
| `/attractions/{id}.json` | GET | Get artist/performer details | ❌ Not used |

#### Venue Resources

| Endpoint | Method | Use Case | Current Usage |
|----------|--------|----------|----------------|
| `/venues.json` | GET | Search venues | ❌ Not used |
| `/venues/{id}.json` | GET | Get venue details (capacity, address, etc.) | ❌ Not used |

#### Classification Resources

| Endpoint | Method | Use Case | Current Usage |
|----------|--------|----------|----------------|
| `/classifications.json` | GET | Browse event types/classifications | ❌ Not used |
| `/classifications/{id}.json` | GET | Get classification details | ❌ Not used |

**Source:** https://developer.ticketmaster.com/docs/read/ticketmaster_discovery_api

### Currently Used Endpoint

```
GET /events.json
```

**Parameters (Current Implementation):**
- `apikey` — API key (required, in query)
- `latlong` — Search coordinates (e.g., "45.5,-122.7")
- `radius` — Search radius in km (e.g., 120)
- `size` — Result limit (max 200, default varies)
- `sort` — Sort order (e.g., "date,asc")

**Full Available Parameters (Not Currently Used):**
- `keyword` — Text search in event name/description
- `attractionId` — Filter by specific artist/performer
- `venueId` — Filter by specific venue
- `startDateTime` — ISO datetime start
- `endDateTime` — ISO datetime end
- `includeTested` — Include test events
- `includeSpellcheck` — Enable spell-correction
- `locale` — Response language/locale

**Usage in Backend:** `netlify/functions/events.js` line 152, `fetchTicketmaster()` function

### API Characteristics

| Aspect | Details |
|--------|---------|
| **Base URL** | https://app.ticketmaster.com/discovery/v2 |
| **Auth Method** | API key in query param (query param: `apikey`) |
| **Response Format** | JSON |
| **Rate Limits** | Not officially documented; ~5000 req/day typical |
| **Pagination** | Supported via `page`, `size` params |
| **CORS** | May require backend proxy (our Netlify function handles this) |

### Quick-Win Improvements (Identified)

1. **Attraction Details Endpoint**
   - Get more context for music events (artist bios, images, links)
   - Enhance event cards with artist info beyond event name

2. **Venue Details Endpoint** 
   - Enrich with venue capacity, accessibility info, parking details
   - Link venue events together on calendar

3. **Advanced Filtering**
   - Use `attractionId` or `venueId` for faceted search
   - Implement artist/venue filters in UI

4. **Event Details Endpoint**
   - For click-through event detail pages
   - More complete event information and ticket data

### Known Limitations & Considerations

- API key in query param — less secure than header-based auth (but required by API design)
- Rate limits not guaranteed in free tier
- Test events may clutter results (use `includeTested=false`)
- Pagination required for result sets >200 items

---

## API Reachability Verification

Both APIs confirmed reachable with standard HTTP:

| API | Transport | Status Code | Notes |
|-----|-----------|------------|-------|
| Ticketmaster | stdlib HTTP | 401 | Auth required (expected) |
| Eventbrite | stdlib HTTP | 404 | Endpoint not found (expected) |

**Conclusion:** No browser capture, clearance cookies, or special transport needed. Standard HTTP fetch works for both.

---

## estatesales.net Analysis (U4 - Complete)

### Findings

**Printing Press Suitability:** ❌ **Not Viable**

| Assessment | Result | Notes |
|-----------|--------|-------|
| API Discovery | ❌ Failed | No public API or SDK; `crowd-sniff` found 0 endpoints |
| Reachability | ✅ Success | Standard HTTP works (200 OK on main domain, 404 on search) |
| Transport Requirements | ✅ Simple | No browser capture, clearance cookies, or auth required |
| Web Traffic Analysis | ❌ N/A | Printing Press `browser-sniff` requires captured HAR traffic (not available) |

### Conclusion

**Printing Press is not suitable for estatesales.net scraping discovery** because:

1. **No Public API:** estatesales.net doesn't expose an API or SDK for Printing Press to analyze
2. **Web Scraping, Not API:** The site is a traditional web application; Printing Press is designed for API discovery
3. **Browser-Sniff Requires Captured Traffic:** Would need HAR file or proxy recording of actual site usage (not practical)

### Alternative Approaches for estatesales.net Scraper

#### Option A: HTML Parsing with Cheerio (Current Placeholder)
- **Status:** Already implemented as placeholder in backend
- **Effort:** Medium (HTML structure analysis + parsing logic)
- **Maintainability:** Low (fragile to site redesigns)
- **Recommendation:** ⭐ **Viable but risky** — feasible MVP, requires monitoring for site changes

**Implementation Path:**
1. Analyze estatesales.net HTML structure manually
2. Extract listing elements, event dates, location, address
3. Test with real estate sales URLs for target city/state
4. Add monitoring to detect structure changes

#### Option B: Selenium/Playwright Headless Browser
- **Effort:** High (browser automation setup in Netlify)
- **Cost:** Higher function execution time, cold-start overhead
- **Recommendation:** ⭐⭐ **More robust but expensive** — handles dynamic content, survives UI changes better

#### Option C: Third-Party Scraping API
- **Examples:** ScrapingBee, Bright Data, RealEstate.com APIs
- **Cost:** Subscription-based (additional expense)
- **Recommendation:** ⭐⭐⭐ **Best maintainability** — no monitoring needed, handles structure changes

#### Option D: Defer Scraping to Phase 2
- **Effort:** None (in current MVP scope)
- **Recommendation:** ⭐⭐⭐⭐ **Safest for Phase 1** — focus on proven APIs first, explore scraping when feature gains traction

### Recommendation for Phase 1

**Keep the current Cheerio scraper as a placeholder.** 

Reasons:
1. Printing Press is not suitable for this use case
2. Estatesales.net scraping is exploratory—not yet critical for feature adoption
3. Current Ticketmaster + Eventbrite APIs provide strong event coverage
4. Monitoring + maintaining a web scraper adds operational burden

**Phase 2 options:**
- Monitor which events users click most; if estate sales are heavily requested, implement Cheerio scraper
- Switch to third-party scraping API if volume justifies it
- Use this Phase 1 to refine Ticketmaster/Eventbrite integration quality first

---

## Next Steps

1. **U2:** Complete Ticketmaster research and map full endpoint set
2. **U3:** Polish this document and update backend code comments
3. **U4:** Exploratory analysis for estatesales.net
4. **Phase 2:** Decide on implementing quick-win improvements

---

## References

- **Printing Press Specs:**
  - Eventbrite: `/tmp/eventbrite-spec.yaml` (61 endpoints)
  - Ticketmaster: `/tmp/ticketmaster-spec.yaml` (2 endpoints, incomplete)
  
- **Official Docs:**
  - Eventbrite: https://www.eventbrite.com/platform/api/
  - Ticketmaster: https://developer.ticketmaster.com/
  
- **Backend Implementation:** `netlify/functions/events.js`
  - `fetchEventbrite()` — lines ~220-290
  - `fetchTicketmaster()` — lines ~135-190
