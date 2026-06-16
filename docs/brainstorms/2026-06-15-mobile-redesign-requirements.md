# Mobile-First Redesign for Family Hub

**Date:** 2026-06-15  
**Status:** Requirements locked  
**Scope:** Standard — redesign of mobile layout and widget UX within existing app

---

## Problem

The current responsive design attempts to render the full desktop layout (sidebar + calendar + widgets) on phones. This results in:
- Difficult-to-read calendar on small screens
- Cramped sidebar widgets and controls
- Poor touch target sizes
- Confusing navigation (two-option bottom buttons insufficient for mobile UX patterns)
- No adaptation to portrait-only usage

Families want a dedicated mobile experience optimized for phones, not a squeezed desktop view.

---

## Solution Overview

Redesign the app for **mobile-first** starting from phones, expanding to desktop. Replace the current sidebar layout with a **bottom navigation + hamburger menu** pattern — the standard for mobile apps.

### Navigation Structure

**Bottom Tabs (always visible):**
- Calendar (defaults to day view)
- To-Do
- Shopping List
- Weather

**Hamburger Menu (navigation drawer):**
- All secondary widgets (Budget, WOTD, Dad Joke, Quote, Countdown, News, Stock, Assistant)
- Settings
- Family Members management

When a user taps an item in the hamburger menu, it replaces the current tab view. Back button returns to the previous tab.

### Widget Treatment

Every widget — primary and secondary — gets a **visually simplified, mobile-first redesign**, not a responsive scaling of the desktop version. Mobile versions optimize for:
- Touch-friendly tap targets (larger buttons, more padding)
- Single focus: one task at a time
- Vertical scrolling (no horizontal scrolling)
- Tap-to-expand for detail (minimize initial complexity)

### Layout Approach

**Approach 3: Adaptive Components with Mobile-First Base**

- Widgets are redesigned mobile-first, then expanded gracefully at larger breakpoints
- Each widget has a `isMobile` mode (boolean) that controls rendering
- Shared data/state layer between mobile and desktop views
- CSS media queries handle layout adaptation (bottom nav on mobile, sidebar on desktop)
- One codebase, two presentation modes

---

## Core Features

### 1. Bottom Navigation Tabs

Four persistent tabs at the bottom of the screen, always accessible.

**Calendar Tab**
- Defaults to **day view** (not month)
- Month/week view accessible via a segmented control or swipe
- Touch-friendly event tapping and creation
- Shows today's date prominently

**To-Do Tab**
- Simplified list view (one item per row, minimal visual hierarchy)
- Checkbox/completion easy to tap
- "+ Add" button floats or sits at top/bottom
- Assigned-to badges shown inline if assigned

**Shopping Tab**
- List of items with checkboxes
- Tap to mark done (visual feedback: strikethrough or dimmed)
- Category badges optional (swipe to filter by category if many items)
- "+ Add" button prominent

**Weather Tab**
- Current conditions large, readable
- Location selection via tap (if multiple locations saved)
- Forecast scrollable vertically (3-5 day cards)
- Minimal chart/arc — text-primary design

### 2. Hamburger Menu Navigation

Tap menu icon (☰) to open a full-screen or drawer-based menu listing secondary features and settings.

**Menu Structure**
- Secondary Widgets (Budget, WOTD, Dad Joke, Quote, Countdown, News, Stock, Assistant)
- Settings
- Family Members

**Interaction:** Tapping an item navigates away from the current tab, showing that feature full-screen. Back button returns to the last tab.

### 3. Smart Tab Defaults

The app remembers which tab the user was viewing and resumes there on re-open. Additionally, the **initial tab on first load** is time-aware:

- **Morning (6 AM – 12 PM):** Calendar
- **Afternoon (12 PM – 6 PM):** Shopping (assumed meal prep / errand planning time)
- **Evening (6 PM – 11 PM):** To-Do (assumed planning wind-down)
- **Night (11 PM – 6 AM):** Calendar (for early risers)

*Rationale:* Families engage with different features at different times of day. This reduces friction on first open.

### 4. Mobile-First Widget Redesigns

Each widget gets a simplified, touch-optimized mobile version. General principles:

- **Reduce initial visual load:** Hide secondary details behind taps, expands, or tabs within the widget
- **Larger touch targets:** Buttons ≥ 44 × 44 pt, spacing ≥ 8 pt between tappable elements
- **Vertical-only scrolling:** No horizontal swiping for hidden content
- **Clear hierarchy:** One primary action per view
- **Offline-safe:** Mobile users may lose connectivity; ensure critical data is cached and synced when possible

**Per-Widget Notes:**

- **Calendar:** Day view primary; month view via control. Event creation via tap on day. No drag-and-drop (too fiddly on touch).
- **To-Do:** Minimal visual styling; focus on the checkbox and text. No fancy animations; responsiveness matters more than delight.
- **Shopping:** Group by category only if >15 items; otherwise flat list. Tap-to-done is the core interaction.
- **Weather:** Current conditions foreground. Forecast cards in vertical scroll. No complex SVG charts on first load; tap to expand if desired.
- **Budget:** List of bills due this period (month or week based on calendar view). Minimal pie charts; text summary instead.
- **WOTD/Dad Joke/Quote:** Card-based, single item visible; swipe or button to advance (or auto-refresh).
- **Assistant:** Text input at bottom, messages scroll up. Voice mic button accessible. No complex UI for actions/context.
- **Countdown/News/Stock:** Similar single-focus, scrollable-list approach.

---

## Scope Boundaries

### Included in This Redesign

- Mobile layout for all 4 core tabs + all secondary widgets
- Bottom navigation and hamburger menu UI
- Mobile-first widget simplifications (visual, interaction, state)
- Portrait orientation lock
- Smart time-based tab defaults
- Shared Firestore/localStorage state (no separate mobile database)

### Deferred for Later

- **Landscape orientation support** — lock portrait for now; revisit if real usage indicates demand
- **Mobile-specific features** — e.g., native camera integration for receipts, geolocation for shopping nearby stores (future enhancement)
- **Offline-first strategy** — service worker is in place; offline refinement is a separate project
- **Push notifications** — defer to later iteration if mobile engagement requires them

### Outside This Redesign

- Desktop view changes (desktop UX remains sidebar-based)
- New features not listed above
- Accessibility audit (audit separately; ensure WCAG 2.1 AA)
- Performance profiling (measure after implementation, optimize if needed)

---

## Success Criteria

1. **Usability:** A family member can open the app on a phone, navigate to Calendar/To-Do/Shopping/Weather, and perform the core action (view day, check off item, mark item done) in <5 seconds without instructions.

2. **Visual clarity:** Calendar day view is readable at arm's length; weather is legible without pinch-zoom; lists are not visually cramped.

3. **Touch-friendly:** All interactive elements are ≥44 × 44 pt; no horizontal scrolling required for core workflows.

4. **Responsive layout:** Bottom nav is always visible and accessible; hamburger menu is a single tap away.

5. **State sync:** Changes made on mobile sync to Firestore and appear on desktop within seconds; no data loss.

6. **Performance:** App loads and displays the default tab in <2s on a 4G connection; tab switches are instant (cached locally).

---

## Technical Approach Notes

*(For planning phase — not prescriptive, but informed by conversation)*

- Use CSS media queries (breakpoint ~640px) to flip layout: sidebar → bottom nav, full widgets → mobile-mode rendering
- Add a `isMobile` boolean computed from viewport width; widgets check this to conditionally render
- Bottom nav built from existing `.card` structure or new lightweight nav component
- Hamburger menu can be a slide-out drawer or full-screen overlay (design choice during planning)
- Portrait lock via CSS `orientation: portrait` or JS window.orientation guard
- Time-based tab default in `window.addEventListener('load', ...)` using `new Date().getHours()`

---

## Outstanding Questions

- **Hamburger menu UX:** Slide-out drawer (from left) or full-screen modal? (Design team decision.)
- **Widget detail views:** If a widget needs more depth (e.g., Budget breakdown, Assistant context window), how should it render on mobile? Tap-to-expand, second-level screen, or separate modal?
- **Accessibility:** Should the redesign include a mobile accessibility audit, or audit separately after implementation?

---

## Next Steps

1. **Planning** → Break this into milestones: navigation structure, core 4 widgets, secondary widgets
2. **Design** → Wireframes/mockups for mobile layout at 375px (iPhone SE) and 414px (iPhone 12) widths
3. **Implementation** → Build mobile-first widgets, add media queries, test on real devices and simulators
4. **Testing** → Verify state sync, performance, touch usability with real family members on real phones
