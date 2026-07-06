# Compact Calendar Layout — Brainstorm

**Date:** 2026-07-06
**Status:** Brainstorm — not yet approved for planning
**Goal:** A layout variant where the calendar occupies roughly half its current footprint, freeing space for other widgets.

---

## Current State

Desktop layout is a two-column grid: `.layout { grid-template-columns: 1fr 300px }` (`1fr 260px` under 1200px). The calendar column (`.cal-column`: calendar card + optional `#yearStrip` + `#bottomStrip`) takes all remaining width — on a typical wall display the calendar is ~75–80% of the screen. The sidebar is a single 300px column that scrolls; widgets compete for one narrow track.

Widget placement already supports two destinations (`fh_widget_placement`: `'sidebar' | 'bottom'`), and the app already has two orthogonal presentation axes (theme, flavor) with an established pattern: body class + `apply*()` + persisted `fh_*` key + Settings buttons.

## Framing recommendation

Don't *replace* the current layout — add a third presentation axis, **Density**, following the theme/flavor pattern:

- `'calendar-focus'` (default — today's layout, absence of class)
- `'balanced'` (calendar ≈ 50%, widgets get the other half)

`applyDensity()` toggles `body.density-balanced`; persisted as `fh_density`; buttons in Settings → Look & Feel next to Theme/Flavor. Mobile (`max-width: 640px`) is untouched — it already has its own tab layout.

---

## Options for the "balanced" layout

### Option A — 50/50 split with a two-column widget grid (recommended)

`body.density-balanced .layout { grid-template-columns: 1fr 1fr }` and `.sidebar` becomes a two-column grid (`grid-template-columns: 1fr 1fr; align-content: start`). Cards keep their current size; roughly twice as many are visible without scrolling.

- **Pros:** CSS-only + one small JS toggle; reuses every existing card unchanged; respects the `.sidebar > *` no-shrink invariant (grid ignores flex-shrink anyway).
- **Cons:** Wide cards (weather with radar, assistant) may want to span both tracks → needs a per-widget `grid-column: span 2` list.
- **Watch out:** month-view pills get cramped at half width. There is already a media rule that hides `.cal-event` pills at small sizes — generalize it into a container-based rule (`container-type: inline-size` on `.cal-card`) so pills degrade to dots whenever the calendar is narrow, regardless of *why*.

### Option B — Shrink the calendar vertically, grow `#bottomStrip`

Keep column widths; the calendar card gets `flex: 0 0 50%` of the column height and `#bottomStrip` grows to fill the lower half (it's already an auto-fit grid). Pairs well with switching the default view to **week** or a **mini-month + next-7-days agenda** combo, which read better short-and-wide than a full month grid.

- **Pros:** No new grid; bottom strip already exists and handles any widget.
- **Cons:** Month view at half height is the hardest calendar view to compress; probably forces an agenda-style default in this density.

### Option C — Uniform dashboard grid (bigger swing)

Drop the column split entirely: one CSS grid of tiles, calendar spans 2×2, every widget is a 1×1 tile, optional drag-to-rearrange. This is the "real dashboard" end state.

- **Pros:** Most flexible; makes widget placement first-class.
- **Cons:** Largest effort; invalidates the sidebar/bottom placement model and its Settings UI; drag persistence is a new subsystem. Better as a later phase after A proves demand.

## Suggested path

1. Ship Option A behind the Density toggle (small, reversible, CSS-first).
2. Add per-widget `span 2` tuning and the container-query pill degradation.
3. Revisit Option C only if the family actually lives in balanced mode.

## Open questions

- Does "50%" mean width (A), height (B), or area? A is the assumption.
- Which widgets earn promotion into the freed space by default — photos, event discovery, meals?
- Does `#yearStrip` survive in balanced mode, or is it the first thing to cut?
- TV mode interaction: should TV mode force calendar-focus?
