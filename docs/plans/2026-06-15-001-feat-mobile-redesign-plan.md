---
title: Mobile-First Redesign
type: feat
origin: docs/brainstorms/2026-06-15-mobile-redesign-requirements.md
date: 2026-06-15
---

# Mobile-First Redesign — Implementation Plan

> **⚠️ SUPERSEDED (2026-07-11)** by `2026-07-11-001-feat-mobile-ui-refresh-plan.md`.
> U1–U9 below shipped (with deviations: `setMobileTab`/`fh_mobileTab` instead of `switchTab`/`fh_currentTab`; the hamburger drawer was later replaced by an inline More tab). The refresh plan audits the as-built state and covers desktop drift since this was written. Kept for historical reference — don't implement from this document.

**Scope:** Standard — mobile layout, navigation, widget simplifications, no new features  
**Depth:** 9 implementation units + supporting CSS/layout work  
**Architecture:** Approach 3 (adaptive components, mobile-first base)  
**Success gate:** Mobile usability (core action <5s), visual clarity, touch-friendly, state sync, <2s load

---

## Problem Frame

The current responsive design attempts to fit the full desktop layout (sidebar + calendar + widgets) onto phones via media queries. This results in:
- Unreadable calendar on small screens
- Cramped widget controls
- Poor touch targets (too small)
- Confusing navigation (two bottom buttons insufficient for mobile patterns)
- No portrait-only optimization

Families need a dedicated mobile UX, not a squeezed desktop view.

---

## Requirements Traceability

**Core features from origin:**
- Bottom navigation with 4 primary tabs (Calendar day-view, To-Do, Shopping, Weather)
- Hamburger menu for secondary widgets + Settings + Family Members
- Mobile-first widget redesigns (all 8+ secondary widgets)
- Smart time-based tab defaults + session memory
- Portrait orientation lock
- Shared Firestore/localStorage state (no separate mobile DB)

**Success criteria:**
1. Core action completable in <5s without instructions
2. Visual clarity: day view readable at arm's length, weather legible, lists not cramped
3. Touch-friendly: ≥44×44pt targets, no horizontal scrolling for core workflows
4. Bottom nav always visible, hamburger one tap away
5. Mobile changes sync to desktop within seconds
6. Load default tab in <2s on 4G, tab switches instant

**Out of scope:**
- Landscape orientation support (portrait-locked)
- Offline-first refinement
- Push notifications
- Desktop layout changes
- Accessibility audit (separate follow-up)

---

## Architecture & High-Level Design

**Layout System Shift**

The layout changes from desktop-first responsive scaling to **mobile-first adaptive components**:

```
Desktop (≥640px)        Mobile (<640px)
┌──────────────┐        ┌────────┐
│  Calendar    │        │Calendar│
│ + sidebar    │        │  Tab   │
│  (all cards) │        ├────────┤
│              │        │ To-Do  │
└──────────────┘        │  Tab   │
  (current)             ├────────┤
                        │Shopping│
                        │  Tab   │
                        ├────────┤
                        │Weather │
                        │  Tab   │
                        ├────────┤
                        │☰ Menu  │
                        └────────┘
                      (redesigned)
```

**CSS Breakpoint**
- `@media (max-width: 640px)` triggers mobile layout
- `.layout` switches from `grid` (sidebar beside calendar) to `flex-column` (single column)
- `.sidebar` becomes bottom nav tabs
- New hamburger menu drawer (slide-left or full-screen modal)

**Component Rendering**
- Each widget checks `isMobile` boolean (computed from viewport width)
- Mobile mode: simplified UI, vertical-only scrolling, larger tap targets
- Desktop mode: current full-featured rendering
- Shared data layer: no new DB, state syncs via Firestore/localStorage

**Navigation Flow**
- Bottom tabs always visible (fixed position at bottom)
- Tab tap → show that tab's content (Calendar day-view, To-Do list, etc.)
- Hamburger tap → slide/overlay menu listing secondary widgets
- Tap menu item → replace current view with that widget
- Back (browser back or custom back button) → return to previous tab

---

## Implementation Units

### U1. Bottom Navigation Structure and Styling

**Goal**  
Build the bottom navigation bar as a fixed, always-visible 4-tab navigation. Each tab shows icon + label, always accessible, never scrolls off screen.

**Requirements**  
- From origin: Bottom tabs for Calendar, To-Do, Shopping, Weather
- Tab must survive app state changes, tab switching, and orientation lock
- Active tab visually highlighted
- Touch targets ≥44×44pt per CLAUDE.md

**Dependencies**  
None — foundational unit.

**Files**
- `family-hub.html` — add bottom-nav container in body
- `family-hub.css` — add `.bottom-nav`, `.bottom-nav-tab`, `.bottom-nav-tab.active` styles
- `family-hub.js` — add `currentTab` state, `switchTab(tabName)` function, event listeners

**Approach**
- HTML: `<nav class="bottom-nav"><button class="bottom-nav-tab" data-tab="calendar">📅 Calendar</button>...</nav>`
- CSS: `position: fixed; bottom: 0; width: 100%; height: 60px; display: flex; justify-content: space-around;`
- JS: `let currentTab = lsGet('fh_currentTab', 'calendar'); function switchTab(name) { currentTab = name; ls.set(...); render(); }`
- Position inside `#layout` or append to body (TBD in design phase based on drawer layering)

**Patterns to follow**
- Use existing button styling from `.btn` class; adapt padding for mobile (44×44pt minimum)
- Use `data-tab` attribute pattern already used for widget placement
- Respect `@media (hover: none)` rule for touch targets (CLAUDE.md)

**Test scenarios**
- Tap each tab → content switches correctly, tab styling reflects active state
- Page reload → last tab is restored from localStorage
- Rapidly tap tabs → content updates smoothly, no race conditions
- Tab buttons are ≥44×44pt (inspect computed size)
- All 4 tabs visible at once (no scrolling, no overflow)

---

### U2. Hamburger Menu (Drawer or Modal)

**Goal**  
Build a navigation menu accessible via a hamburger icon. Menu lists secondary widgets, Settings, and Family Members. Tapping a menu item navigates to that feature full-screen.

**Requirements**  
- Hamburger icon always visible (top-left or top-right, sticky)
- Menu slides out or opens as modal (design choice during planning)
- Lists: Budget, WOTD, Dad Joke, Quote, Countdown, News, Stock, Assistant, Settings, Family Members
- Tapping item replaces current view; back button returns to previous tab
- Menu closes when item is tapped

**Dependencies**  
U1 (bottom nav must exist first to define the remaining layout space)

**Files**
- `family-hub.html` — add hamburger button, menu container (drawer or modal)
- `family-hub.css` — add `.hamburger-btn`, `.menu-drawer`, `.menu-item`, `.menu-drawer.open` styles
- `family-hub.js` — add `isMenuOpen` state, `toggleMenu()`, `navigateToMenuItem(item)` functions

**Approach**
- Hamburger button: fixed position top-left/right, z-index above content
- Menu: slide-out drawer from left (simpler than modal for this no-build app) with transform/transition
- Menu items: list of divs with `data-widget` attribute for routing
- Navigation: tap item → `navigateToMenuItem(item)` → set `currentMenuItem = item` → render
- Back: custom JS back button in secondary view, or browser back + history tracking

**Patterns to follow**
- Use existing `.card` structure for menu items (or simpler list)
- Use `data-widget` naming convention (already used in widget system)
- Back button: either browser back or custom handler tracking navigation stack

**Test scenarios**
- Tap hamburger → menu opens, drawer slides in (or modal appears)
- Tap menu item (e.g., Budget) → current view replaced with Budget, hamburger still accessible
- Tap back (or close) → returns to previous tab (Calendar, To-Do, etc.)
- Hamburger visible at all viewport widths and scroll positions
- Rapid open/close → smooth, no jank or flash

---

### U3. Smart Tab Defaults (Time-Based + Session Memory)

**Goal**  
On app load, select the initial tab intelligently: time-aware on first visit, session memory on return. User can always switch tabs manually.

**Requirements**  
- First load of day: time-based default (6 AM–12 PM → Calendar, 12 PM–6 PM → Shopping, 6 PM–11 PM → To-Do, 11 PM–6 AM → Calendar)
- Revisit (same session): remember last tab, resume there
- Manual tab switch: update memory immediately

**Dependencies**  
U1 (tab switching mechanism must exist)

**Files**
- `family-hub.js` — add `getDefaultTab()` function, update `switchTab()` to persist, update load handler

**Approach**
- On `window.addEventListener('load', ...)`: check `localStorage.getItem('fh_currentTab')`
- If found and valid: `switchTab(fh_currentTab)`
- If not found: `let hour = new Date().getHours(); let tab = hour >= 6 && hour < 12 ? 'calendar' : hour >= 12 && hour < 18 ? 'shopping' : hour >= 18 && hour < 23 ? 'todo' : 'calendar'; switchTab(tab)`
- Every `switchTab(name)` call: `localStorage.setItem('fh_currentTab', name)`

**Patterns to follow**
- Use existing `lsGet()` utility already used in codebase
- Time-of-day logic is deterministic, no external API needed

**Test scenarios**
- Morning visit (7 AM) → Calendar tab defaults
- Afternoon visit (2 PM) → Shopping tab defaults
- Evening visit (8 PM) → To-Do tab defaults
- Switch to different tab → localStorage updates
- Reload page → same tab resumes
- Rapid successive visits in different times of day → each gets correct default

---

### U4. Calendar Mobile Redesign

**Goal**  
Redesign the calendar for mobile: day-view primary, touch-friendly event tapping, simplified controls, readable on small screens.

**Requirements**  
- Day view default (not month)
- Month/week accessible via segmented control or swipe
- Today's date prominent
- Event tapping and creation via tap on day
- No drag-and-drop (too fiddly on touch)
- Readable at arm's length on 375px width

**Dependencies**  
U1 (tab switching), CSS media query setup for mobile

**Files**
- `family-hub.css` — add `.calendar-mobile`, `.day-view-mobile`, `.event-mobile` overrides
- `family-hub.js` — add `isMobile` check in `renderCurrentView()`, simplify event UI for touch

**Approach**
- Add `if (isMobile) { renderDayViewMobile(); return; }`  before current month-view rendering
- Mobile day view: date header, 4-5 events in a vertical list (not grid), tap to see details, create button floating
- Remove calendar grid, event drag/drop, multi-month preview
- Tap event → show event detail popover or expand inline
- Tap day number → open event creation

**Patterns to follow**
- Reuse existing event data structures (`calEventCache`)
- Reuse existing event editing UI (modal) for creation
- Use same touch-target padding as other mobile widgets

**Test scenarios**
- Mobile viewport (<640px): day view renders (not month), readable
- Day title and date are clear and centered
- Events list vertically with ≥8pt padding between items
- Tap event → details appear (popover or inline expand)
- Tap date number → event creation modal opens
- Swipe left/right → navigate to prev/next day (optional enhancement)
- Month view accessible via control (segmented or hamburger menu)

---

### U5. To-Do Mobile Redesign

**Goal**  
Simplify to-do for mobile: one item per row, large checkbox, minimal visual styling, easy add/remove.

**Requirements**  
- Vertical list (one per row)
- Large checkboxes (≥44pt tap target)
- Item text prominent, assignment badges inline
- "+ Add" button accessible (floating or fixed)
- No animations, responsiveness over delight

**Dependencies**  
U1 (tab switching), CSS media query

**Files**
- `family-hub.css` — add `.todo-mobile`, `.todo-item-mobile`, `.todo-checkbox-mobile` styles
- `family-hub.js` — add `isMobile` check in `renderTodoList()`, simplify rendering

**Approach**
- HTML: `<div class="todo-item-mobile"><input type="checkbox" class="todo-checkbox-mobile" /> <span class="todo-text">Item</span> <span class="todo-assigned">👤</span></div>`
- CSS: checkbox 44×44pt, padding 12px, no rounded corners (reduces rendering cost), text left-aligned
- Remove fancy animations, multi-select UI, complex filtering
- "+ Add" button: floating at bottom or at top of list

**Patterns to follow**
- Reuse existing todo data (`todoItems`)
- Reuse existing `toggleTodo()`, `addTodo()` functions
- Keep same Firestore sync

**Test scenarios**
- Mobile view: list renders vertically, one item per row
- Checkbox is ≥44×44pt, easy to tap
- Tap checkbox → item toggles done/not-done (visual feedback: strikethrough or dim)
- Item assigned to a member → badge shows (👤 or initials)
- Tap "+ Add" → input appears (at top or bottom)
- Type item + press Enter → item added, input clears
- No text overflow; wraps at mobile width

---

### U6. Shopping List Mobile Redesign

**Goal**  
Simplify shopping for mobile: flat list or category-grouped, checkboxes for mark-done, touch-optimized.

**Requirements**  
- Flat list if <15 items, grouped by category if ≥15 items
- Large checkboxes for mark-done
- Visual feedback: strikethrough or dim when checked
- "+ Add" button prominent
- Categories collapsible if grouped

**Dependencies**  
U1, CSS media query

**Files**
- `family-hub.css` — add `.shopping-mobile`, `.shopping-item-mobile`, `.shopping-category-mobile` styles
- `family-hub.js` — add `isMobile` check in `renderShopList()`, conditional grouping logic

**Approach**
- Count items in `shopItemsCache`
- If count <15: render flat vertical list
- If count ≥15: group by category (using existing category tags), render collapsible sections
- Each item: checkbox (44×44pt) + text + category badge
- Tap to check/uncheck, strikethrough on done

**Patterns to follow**
- Reuse existing `shopItemsCache`, `toggleShop()`, category system
- Keep same Firestore sync

**Test scenarios**
- <15 items: flat list renders
- ≥15 items: grouped by category with collapsible headers
- Checkbox ≥44×44pt, responsive
- Tap checkbox → done/undone, visual feedback
- Tap "+ Add" → input appears
- Items marked done can be hidden (optional enhancement) or remain visible with strikethrough

---

### U7. Weather Mobile Redesign

**Goal**  
Simplify weather for mobile: current conditions large and readable, forecast cards in vertical scroll, text-primary design (minimal charts).

**Requirements**  
- Current conditions: large temp, icon, description
- Location selectable if multiple saved
- Forecast: 3-5 day cards, scrollable vertically
- No complex SVG charts on first load
- Readable without pinch-zoom

**Dependencies**  
U1, CSS media query

**Files**
- `family-hub.css` — add `.weather-mobile`, `.current-mobile`, `.forecast-card-mobile` styles
- `family-hub.js` — add `isMobile` check in `renderWeatherData()`, simplify rendering

**Approach**
- Current conditions: large heading with temp, icon, description (no sun arc or complex chart)
- Location: text button to show location list if >1 location saved
- Forecast: vertical list of day cards (day name, icon, high/low, description)
- Remove: sun arc, detailed chart, complex SVG
- Scrollable vertically: forecast cards scroll independently or with page

**Patterns to follow**
- Reuse existing `weatherData`, location switching logic
- Text summary instead of SVG/charts

**Test scenarios**
- Current temp, icon, description visible and centered
- All text readable at arm's length (375px width)
- Location selector visible if >1 location
- Tap location → list appears, tap to select
- Forecast cards scrollable, each shows day, icon, high/low
- No horizontal scrolling required

---

### U8. Secondary Widgets Mobile Redesign (Budget, WOTD, Dad Joke, Quote, Countdown, News, Stock, Assistant)

**Goal**  
Apply mobile simplification principles to all secondary widgets: single-focus, vertical scrolling, large tap targets.

**Requirements**  
- Budget: list of bills (text summary, no pie charts)
- WOTD/Dad Joke/Quote: single card, swipe/button to advance
- Countdown: simple text, tap to expand if details
- News/Stock: scrollable list, minimal formatting
- Assistant: text input at bottom, messages scroll up
- All touch-friendly and readable

**Dependencies**  
U1–U3 (core structure in place), CSS media query

**Files**
- `family-hub.css` — add mobile overrides for each widget (`.budget-mobile`, `.wotd-mobile`, `.assistant-mobile`, etc.)
- `family-hub.js` — add `isMobile` checks in each widget's render function

**Approach**
- For each widget, add conditional logic: `if (isMobile) { renderWidgetMobile(); return; }`
- Remove fancy UI, complex layouts, horizontal scrolling
- Text-primary design: minimal icons, focus on readable text
- Button/tap targets: 44×44pt minimum
- Vertical scrolling: primary interaction pattern

**Per-widget notes:**
- **Budget:** List of bills due this period, text summary instead of pie chart
- **WOTD/Dad Joke/Quote:** Large card with content, swipe-left/right or prev/next button
- **Countdown:** Date + days remaining, tap to expand if more details
- **News:** Headline + brief (no full article on first load), tap to read
- **Stock:** Ticker symbol + price + % change, color-coded, scrollable list
- **Assistant:** Conversation stays intact, input box fixed at bottom, messages scroll

**Patterns to follow**
- Reuse existing widget logic, just simplify rendering
- Keep same data structures and state

**Test scenarios**  
(Per-widget samples)
- Budget: bill list renders, tap bill → details
- WOTD: large card visible, button to advance to next word
- Assistant: input box at bottom, tap to focus, type message, send, message appears above, scrollable history
- All widgets: readable at 375px, no horizontal scroll, tap targets ≥44pt

---

### U9. Portrait Orientation Lock + CSS Media Query System

**Goal**  
Lock app to portrait orientation on mobile and set up the CSS breakpoint that triggers mobile layout for all components.

**Requirements**  
- Portrait-only on <640px viewport
- CSS media query `@media (max-width: 640px)` triggers mobile layout
- Desktop layout preserved for ≥640px

**Dependencies**  
All UI units (U1–U8) — this applies the styling triggers

**Files**
- `family-hub.html` — add `meta[name="viewport"]` if not present; consider `manifest.json` for iOS (orientation: portrait)
- `family-hub.css` — wrap all mobile-specific rules in `@media (max-width: 640px) { ... }`
- `family-hub.js` — add portrait lock via JS (window.orientation or screen.orientation API)

**Approach**
- HTML: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- CSS: `@media (max-width: 640px) { .layout { flex-direction: column; } .sidebar { order: 2; position: relative; height: auto; } .bottom-nav { position: fixed; bottom: 0; } ... }`
- JS: optional JS lock for older browsers: `if (screen.orientation) { screen.orientation.lock('portrait-primary'); }`
- `isMobile` boolean: `let isMobile = window.innerWidth < 640;` (computed at load and on resize)

**Patterns to follow**
- Respect existing CSS var system for colors, spacing
- Preserve desktop styles, don't override globally
- Use `min-height: 0` on flex containers per CLAUDE.md

**Test scenarios**
- Desktop (1024px): sidebar layout visible, all desktop widgets rendered
- Tablet (800px): transition happens smoothly, layout adapts
- Mobile (375px): bottom nav visible, hamburger works, all content single-column
- Window resize: layout updates reactively (no page reload needed)
- iOS: orientation lock prevents landscape (confirm in simulator)
- All existing desktop features still work at ≥640px

---

## Key Technical Decisions

1. **`isMobile` Boolean Computation**  
   Computed from viewport width (<640px) at load and on window resize. Cheaper than media queries for JS logic; CSS media queries handle styling. Avoids out-of-sync layout/logic states.

2. **Hamburger Menu: Drawer vs. Modal**  
   Defer to design phase. Drawer (slide-left with transform) is simpler in a no-build app; modal requires careful z-index and backdrop management. Drawer recommended unless design requires overlay.

3. **Tab State Persistence**  
   localStorage `fh_currentTab` tracks last tab. Simple, no external dependency, survives app reload. Time-based default only on first visit of day (hour-based, no dependency on server time).

4. **Secondary Widget Navigation**  
   Tapping a menu item navigates by setting `currentMenuItem` state and re-rendering. Back button uses browser back API or manual history stack. Simpler than full SPA routing.

5. **Mobile Widget Simplification Strategy**  
   Each widget checks `isMobile` early in its render function and takes a different code path. Preserves existing Firestore/localStorage sync. Avoids code duplication by reusing data/state logic.

6. **Touch Target Sizing**  
   All interactive elements ≥44×44pt per CLAUDE.md and accessibility standards. Enforced via CSS classes (`.btn-mobile`, `.checkbox-mobile`, etc.). Larger than desktop (32×32pt) to account for finger size on small screens.

---

## Scope Boundaries

### Included
- Bottom navigation UI and routing logic
- Hamburger menu (drawer structure, item navigation)
- Mobile redesigns of all 12 widgets
- Time-based tab defaults + session memory
- Portrait orientation lock
- CSS media query breakpoint (~640px)
- `isMobile` boolean state
- Responsive adaptation (no new data layer)

### Deferred for Later
- Landscape orientation support
- Mobile-specific features (camera integration, geolocation)
- Offline-first refinement
- Push notifications
- Desktop layout changes

### Outside This Redesign
- New features beyond mobile adaptation
- Accessibility audit (separate follow-up)
- Performance profiling (measure after implementation)

---

## Success Criteria (from origin)

1. ✅ **Usability**: Core action (<5s without instructions)
2. ✅ **Visual clarity**: Readable at arm's length, legible without pinch-zoom
3. ✅ **Touch-friendly**: ≥44×44pt targets, no horizontal scrolling
4. ✅ **Responsive layout**: Bottom nav always visible, hamburger one tap away
5. ✅ **State sync**: Mobile ↔ Desktop sync within seconds
6. ✅ **Performance**: Load default tab in <2s on 4G, tab switches instant

---

## Open Questions & Deferred Decisions

1. **Hamburger menu UX**: Slide-out drawer (left) or full-screen modal? (Design decision, recommend drawer)
2. **Widget detail expansion**: Tap-to-expand inline, second-level screen, or modal? (Specify per-widget during implementation)
3. **Back button**: Browser back API or custom history stack? (Browser back recommended for simplicity)
4. **Accessibility audit**: Include in this PR or defer to follow-up? (Recommend defer, audit separately)

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Layout breakage at intermediate widths (640–800px) | Medium | Test at multiple breakpoints (375, 414, 640, 800px); ensure no unintended layout shifts |
| Touch targets too small on older devices | Medium | Enforce ≥44×44pt via CSS classes; test on actual devices |
| State sync race conditions (mobile → desktop, desktop → mobile) | Low | Firestore is source of truth; localStorage is cache; any sync lag is acceptable per requirements |
| Performance regression on load | Low | Defer heavy rendering (charts, SVG) on mobile; lazy-load secondary widgets |
| Browser back button conflicts with menu open state | Low | Handle via `onpopstate` listener; close menu if needed |

---

## Sources & Research

- **Requirements origin**: `docs/brainstorms/2026-06-15-mobile-redesign-requirements.md`
- **Architectural patterns**: Approach 3 (mobile-first adaptive components) as locked in brainstorm
- **Existing codebase patterns**: responsive breakpoints (640px, 400px), widget system, portrait mode, localStorage sync
- **Touch accessibility**: CLAUDE.md tap-target CSS rules, 44×44pt standard
- **No-build constraint**: CDN-only, CSS variables, no build tooling (informs styling approach, no CSS-in-JS)
