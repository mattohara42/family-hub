---
title: "Implement Event Discovery Frontend Enhancements"
date: 2026-06-19
status: Ready for Implementation
origin: Event Discovery Requirements (2026-06-18-event-discovery-requirements.md) + Quick Wins Backend PR #1
---

# Implement Event Discovery Frontend Enhancements

**Branch:** `feat/event-discovery-frontend`  
**Depth:** Standard (3 focused UI improvements)

---

## Problem Frame

The event discovery backend (PR #1) now provides three new data sources that the UI hasn't leveraged yet:

1. **Official Eventbrite categories** — 13-category taxonomy with fallback, cached server-side
2. **Venue enrichment** — Capacity, ratings, accessibility info from both Ticketmaster and Eventbrite
3. **Advanced filtering parameters** — Keyword, artist ID, venue ID support in Ticketmaster backend

Current event cards display basic event information (title, date, location, weather, conflict status) but miss opportunities to help users make decisions based on venue context, event category taxonomy, and advanced search.

**Core Insight:** The backend improvements are ready; the UI needs three focused enhancements to surface this new data and filtering capability to users.

---

## Requirements Traceability

This plan advances the Event Discovery feature (origin: `2026-06-18-event-discovery-requirements.md`) by implementing high-value UX improvements:

- Origin requirement: "Search/filter bar (optional: filter by event type, distance, date range)" → U3 adds keyword + artist/venue search
- Origin requirement: "Event cards showing... location + distance from home" → U2 adds venue capacity context to location
- Origin requirement: "Event types to show on calendar (multi-select): Concerts, Hikes, Classes, etc." → U1 enables official category taxonomy display

Each unit is independently ship-able and follows existing UI patterns.

---

## Key Technical Decisions

### 1. Use Existing Tab Pattern for Category Filters (Not Dropdown)

**Decision:** Implement category filters as horizontal scrolling tabs (like existing event-type tabs), not a dropdown menu.

**Why:** Tabs are already established in the event discovery modal (all/concert/show/sports/hike/class/food/art/sale). Adding category filters as tabs maintains visual consistency and doesn't require new interaction patterns. Horizontal scroll handles small screens naturally.

**Alternative considered:** Dropdown menu for categories — would save horizontal space but breaks visual consistency with existing filter tabs.

### 2. Venue Data Display as Optional Card Section

**Decision:** Add venue details as an optional section below location in event cards. Show capacity, website link, accessibility badges only when data is available (graceful degradation).

**Why:** Venue data is already enriched server-side; displaying it helps users understand event scale and accessibility. Optional display means cards don't break if venue data is missing. Doesn't require modal resizing or major layout restructuring.

**Alternative considered:** Expand cards with modal/popover on hover — would complicate interaction model and reduce discoverability.

### 3. Search UI Stays Within Modal Header

**Decision:** Add search input fields for keyword, artist, venue within the existing search bar area. Use separate inputs or a compound input pattern.

**Why:** Current modal has room in the search bar area (line 1294-1301). Adding inputs here doesn't require modal resizing. Keeps all filtering (tabs + search) together in modal header for scanability.

**Alternative considered:** Add a separate "Advanced Search" section below tabs — would clutter the modal; better to integrate into existing search area.

---

## Implementation Units

### U1. Build Category Filter UI from Official Eventbrite Taxonomy

**Goal:** Display category filters as horizontal tabs, using official Eventbrite taxonomy fetched and cached by backend. Allow users to filter events by category (Music, Food & Drink, Classes, etc.) with multi-select or single-select toggle.

**Requirements:** Enables official event type filtering UI without guesswork normalization. Leverages backend category caching (24h TTL).

**Dependencies:** Backend PR #1 must be merged (categories endpoint cache in place)

**Files:**
- `family-hub.html` (lines 1282-1292) — add new category tabs section
- `family-hub.css` (lines 4784-4803) — extend `.event-tab` styling or create `.category-tab` variant
- `family-hub.js` (lines 9555-9700) — add category state management, filter function, render logic

**Approach:**

**Backend Integration (API call):**
- On modal open, check if categories are in IndexedDB cache (new store: `eventCategories`)
- If not cached or expired (>24h), fetch from endpoint: `GET /.netlify/functions/events?categories=true` (backend returns categories alongside events)
- Parse categories and store in IndexedDB + module-level JS object for immediate access

**UI Rendering:**
- Add a new `.category-filters` container above existing event tabs (after age label, before existing all/concert/show tabs)
- Render category tabs dynamically from cached categories object: Music, Food & Drink, Business, Classes, etc.
- Each tab has `data-category="<id>"` and onclick handler calls `filterEventsByCategory(categoryId)`
- Add "All" tab as default (no category filter)

**Filtering Logic:**
- Add global state: `let eventsCategoryFilter = null` (null = all, otherwise category ID)
- Update `applyFiltersAndSort()` to check category before applying text/tab filters
- If category is set, filter events where `event.category?.id === eventsCategoryFilter`
- Combine with existing tab filter (event type) and text filter in chain

**Edge Cases:**
- No categories available: Show "All" tab only, skip rendering category section
- Event has no category data: Safe to filter (events without category won't match specific category filter)
- Category cache expired: Gracefully fall back to existing filters; fetch fresh data on background refresh

**Patterns to follow:**
- Use `.event-tab` styles (border, padding, accent color) — same as existing type tabs
- Use `data-category` attribute pattern (matches `data-type` on event-type tabs)
- Follow focus trap + Escape key handling pattern (already in modal)
- Use IndexedDB `eventCategories` store (same pattern as `eventCache`)

**Test scenarios:**
- Categories fetch from backend and populate tabs on modal open ✓
- Clicking category tab filters events to that category only ✓
- Category filter combines with existing tab filter (e.g., "Music" + "Concert" shows only music concerts) ✓
- Empty state: no categories available; "All" tab shown only ✓
- Event with null category doesn't match any specific category filter ✓
- Cache expires after 24h; background refresh fetches fresh categories ✓
- Escape key or clicking outside modal clears category filter ✓

**Verification:**
- Category tabs visible and clickable in modal
- Filtering works correctly (events match selected category)
- Category filter persists during session (cleared on modal close)
- CSS styling matches existing tab appearance

---

### U2. Display Venue Details on Event Cards

**Goal:** Enrich event cards with venue information from backend enrichment: venue name, capacity, website link, accessibility details (wheelchair access, parking, transit info). Display gracefully when data is available.

**Requirements:** Helps users understand venue scale and accessibility. Venue data already enriched server-side; just needs display logic.

**Dependencies:** Backend PR #1 must be merged (venue enrichment in place)

**Files:**
- `family-hub.html` (lines 1273-1309) — modal structure (no HTML changes needed; cards rendered in JS)
- `family-hub.css` (lines 4805-4915) — add new `.event-venue` section styles
- `family-hub.js` (lines 9676-9704) — update `renderEventCard()` to display venue details

**Approach:**

**Data Binding:**
- Event objects from backend already include `location.venue` (object with name, capacity, website, accessibility)
- `renderEventCard()` receives full event object; can safely access `event.location.venue`

**HTML Structure in Card:**
- Add new `.event-venue` section between `.event-location` (address) and `.event-weather` (weather emoji)
- Structure:
  ```html
  <div class="event-venue">
    <strong>Venue:</strong> 
    <span class="venue-name">Moda Center</span>
    <span class="venue-capacity">(19,980 capacity)</span>
    <a href="[website]" target="_blank" rel="noopener">Venue Website →</a>
    <div class="venue-accessibility">
      <span>♿ Wheelchair accessible</span>
      <span>🅿️ Parking available</span>
      <span>🚌 TriMet line 4, 8</span>
    </div>
  </div>
  ```

**Conditional Rendering:**
- Only show `.event-venue` if `event.location.venue` exists and is not null
- Show venue name always
- Show capacity only if `venue.capacity > 0`
- Show website link only if `venue.website` is not null/empty
- Show accessibility badges only if corresponding field is truthy
- Use ternary or `&&` patterns for conditional display

**CSS Styling:**
- `.event-venue`: padding: 8px 0; border-top: 1px solid rgba(128,128,128,0.1); margin: 8px 0; font-size: var(--text-sm)
- `.venue-name`: font-weight: bold
- `.venue-capacity`: color: var(--muted); font-size: var(--text-xs); margin-left: 4px
- `.venue-accessibility`: display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; font-size: var(--text-xs)
- Accessibility badges use emojis (♿, 🅿️, 🚌) for visual clarity

**Edge Cases:**
- Venue is null: Don't render section (hide gracefully)
- Venue name is empty: Still render section if other data exists (capacity, website, accessibility)
- Capacity is 0 or null: Don't show capacity, but show other fields
- Website is null: Show venue name without link
- Accessibility is empty object: Don't show accessibility section
- Transit text is very long: Use ellipsis or truncation

**Patterns to follow:**
- Use existing CSS variable names (`--text`, `--text-sm`, `--muted`, `--surface`, etc.)
- Match padding/margin patterns of adjacent card sections (location, weather)
- Use emoji badges like existing weather display (sun emoji for sunny, etc.)
- Anchor links open in new tab with `target="_blank" rel="noopener"` (security pattern)

**Test scenarios:**
- Event with full venue data: all fields displayed correctly ✓
- Event with partial venue data (name + capacity, no website): displays what's available ✓
- Event with no venue data (null): venue section not rendered ✓
- Venue capacity shown with comma separator for large numbers (19,980) ✓
- Website link opens in new tab without security issues ✓
- Accessibility badges show correct icons and text ✓
- Card layout doesn't break with venue section added (responsive on mobile) ✓
- Theme variations (light/nautical/aurora) apply correctly to venue section ✓

**Verification:**
- Venue section appears in rendered event card
- All venue fields display correctly
- Graceful fallback when data missing
- Website links work and open in new tab
- Layout remains responsive with venue section

---

### U3. Implement Search UI with Advanced Filtering (Keyword, Artist, Venue)

**Goal:** Extend event search to include keyword search (event name/description), artist/performer filtering, and venue filtering via Ticketmaster backend advanced parameters. Add UI inputs in modal search area for these filters.

**Requirements:** Enables users to search by artist name, keyword in event title, or specific venue. Leverages Ticketmaster backend support for attractionId/venueId/keyword parameters.

**Dependencies:** Backend PR #1 must be merged (advanced filtering params in backend)

**Files:**
- `family-hub.html` (lines 1294-1301) — add keyword, artist, venue search inputs in modal search bar area
- `family-hub.css` — add search input field styling (use existing `.field` pattern)
- `family-hub.js` (lines 9586-9617) — update `fetchAndUpdateEvents()` to pass filter params to backend

**Approach:**

**UI Changes in Modal Search Area:**
- Current search area has: type-filter input, sort dropdown, refresh button (line 1294-1301)
- Add three new search inputs (stacked vertically or in 2-column grid depending on space):
  1. Keyword search input: `id="eventsKeywordSearch"` placeholder="Search by event name..."
  2. Artist/performer input: `id="eventsArtistSearch"` placeholder="Search by artist..."
  3. Venue input: `id="eventsVenueSearch"` placeholder="Search by venue..."
- Each input has `oninput` handler calling `fetchAndUpdateEvents()` (debounced)

**Styling:**
- Use `.field` wrapper pattern (existing in codebase: label + input structure)
- Or create simpler `.search-input` class: width: 100%, padding: 8px 12px, border-radius, etc.
- Keep consistent with existing event-filter input (line 1295 style)
- Responsive: single column on mobile (max-width: 640px), 2 columns on larger screens

**State Management:**
- Add global variables:
  ```javascript
  let eventsSearchKeyword = '';
  let eventsSearchArtist = '';
  let eventsSearchVenue = '';
  ```
- Update on `oninput` event (debounced with 300ms delay to avoid excessive re-fetches)

**Backend API Call:**
- Update `fetchAndUpdateEvents()` to pass filter params:
  ```javascript
  const params = new URLSearchParams({
    location: eventLocation,
    radius: eventMaxDistance,
    keyword: eventsSearchKeyword || undefined,
    attractionId: eventsSearchArtist || undefined,
    venueId: eventsSearchVenue || undefined
  });
  const response = await fetch(`/.netlify/functions/events?${params}`);
  ```
- Backend receives these params and forwards to Ticketmaster `/events.json` (Eventbrite keyword search in same endpoint)

**Frontend Filtering (Client-Side Fallback):**
- For locally cached events: implement client-side filtering as fallback
  - Keyword: case-insensitive includes match on `event.title` and `event.description`
  - Artist: can't filter locally (attractionId is opaque); skip or show message "refine artist search"
  - Venue: case-insensitive includes match on `event.location.venue.name` (if available)

**Debouncing:**
- Wrap `fetchAndUpdateEvents()` in debounce (300ms):
  ```javascript
  const debouncedFetch = debounce(fetchAndUpdateEvents, 300);
  ```
- Debounce function: standard pattern (create if doesn't exist in codebase)

**Clear Filters:**
- Add "Clear search" link or button in search area (optional) that resets all three fields + re-fetches

**Edge Cases:**
- User clears all search fields: fetch shows all events (no filter)
- Artist/venue ID is entered but backend returns no results: show "No events match your search" message
- Keyword search returns 0 results: same empty state
- Multiple filters applied: backend combines them (AND logic), show results matching all filters
- Debounce prevents excessive API calls during rapid typing

**Patterns to follow:**
- Use `.field` wrapper or match existing `.event-filter-type` input styling (line 1295)
- Use `oninput` event (not `onchange`) for real-time filtering
- Follow existing error handling in `fetchAndUpdateEvents()` (lines 9586-9617)
- Use `URLSearchParams` to build query string (matches backend expectation)
- Preserve debounce function if exists; create if not

**Test scenarios:**
- Keyword search filters events to matching titles/descriptions ✓
- Artist search returns events for that performer (backend filters) ✓
- Venue search returns events at specified venue ✓
- Multiple filters combined: shows only events matching all filters ✓
- Clearing search fields returns to full event list ✓
- Debounce prevents excessive API calls (no more than 1 request per 300ms) ✓
- Empty results show appropriate message ✓
- Keyboard Enter in search field triggers fetch ✓
- Focus remains in inputs after fetch completes ✓
- Mobile layout keeps inputs readable (not too cramped) ✓

**Verification:**
- Search inputs visible and functional in modal
- Filtering works for keyword, artist, and venue
- Backend receives correct params
- Debounce working (monitor network tab)
- Clear filters resets UI and re-fetches

---

## Scope Boundaries

### In Scope

- Category filter UI using official Eventbrite taxonomy (backend-cached)
- Venue enrichment display on event cards (graceful fallback when data missing)
- Advanced search UI for keyword, artist, venue filtering
- Client-side debouncing for search inputs
- Responsive design for mobile and desktop
- Integration with existing IndexedDB caching
- CSS styling following existing patterns and theme variables

### Out of Scope (Deferred to Follow-Up Work)

- Advanced multi-select for category filtering (single-select tab pattern sufficient for MVP)
- Venue search autocomplete/suggestions (manual text input sufficient)
- Search history or saved searches
- Alternative category grouping/hierarchy (stick with Eventbrite's flat 13-category list)
- Performance optimization for large event lists (defer if slow)
- Analytics on which filters users prefer

---

## Success Criteria

✅ **Frontend leverages backend data:** Category taxonomy, venue enrichment, and advanced filtering params all surfaced in UI  
✅ **Graceful degradation:** Missing data doesn't break cards or filters; optional sections hidden safely  
✅ **Responsive design:** Works on mobile and desktop without layout issues  
✅ **Consistent styling:** Matches existing event discovery modal patterns (tabs, buttons, inputs, colors)  
✅ **Fast interactions:** Debounced search, IndexedDB caching, no UI freezes  
✅ **Accessible:** Focus trap on modal, keyboard navigation, ARIA labels where needed  

---

## Implementation Notes

- **Execution posture:** Standard pragmatic approach. No test-first required; existing modal patterns well-established.
- **Testing:** Focus on integration testing (backend params passed correctly, UI updates on fetch). DOM/state inspection in browser console.
- **Risk:** Low. All changes are additive (new sections, inputs, filters). No breaking changes to existing functionality.
- **Context:** Depends on PR #1 (backend quick wins) being merged first.

---

## References

- **Backend API:** `/.netlify/functions/events` — now supports categories, venue enrichment, keyword/attractionId/venueId params
- **Event Discovery Requirements:** `docs/brainstorms/2026-06-18-event-discovery-requirements.md`
- **Quick Wins Backend PR:** #1 (categories caching, venue enrichment, advanced filtering)
- **Current Implementation:** `family-hub.html` lines 1273-1309, `family-hub.js` lines 9555-9700, `family-hub.css` lines 4784-4915
- **API Research:** `docs/API_RESEARCH.md` (full endpoint details for Ticketmaster/Eventbrite)
