# Compact Calendar Layout — Brainstorm

**Date:** 2026-07-06 (updated same day with owner answers)
**Status:** Direction settled — ready for planning
**Goal:** A layout variant where the calendar scales proportionally to **50% width × 50% height** (≈25% of its current area), freeing the rest of the screen for other widgets.

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

## Settled direction — quadrant layout (Option A + B hybrid)

Owner answer: 50% means **both axes, scaled proportionally** — the calendar becomes a quadrant-sized card (~25% of its former area), and the freed **L-shaped region** (right half + lower-left quadrant) belongs to widgets.

```
┌─────────────────┬─────────────────┐
│                 │                 │
│    Calendar     │   widget grid   │
│  (50% × 50%)    │  (two columns,  │
├─────────────────┤   spans full    │
│  #bottomStrip   │     height)     │
│  (widget grid)  │                 │
└─────────────────┴─────────────────┘
```

Implementation sketch under `body.density-balanced`:

- `.layout { grid-template-columns: 1fr 1fr }` — columns split 50/50.
- Left column stays `.cal-column` (flex column): calendar card gets `flex: 0 0 50%` of the viewport-height track (`min-height: 0` chain preserved), and `#bottomStrip` — which already exists as an auto-fit card grid — grows (`flex: 1`) to fill the lower-left quadrant.
- `.sidebar` becomes a two-column grid (`grid-template-columns: 1fr 1fr; align-content: start`), spanning the full right half. Wide cards (weather with radar, assistant) get `grid-column: span 2` via a small per-widget list.
- Widget placement model is unchanged: `'sidebar'` → right half, `'bottom'` → lower-left quadrant. No new persistence needed.

**Calendar readability at quarter area** — the critical design problem:

- Month grid at 50%×50% cannot show text pills. Put `container-type: inline-size` on `.cal-card` and degrade `.cal-event` pills to colored dots below a width threshold (generalizing the existing small-size media rule so it works regardless of *why* the calendar is narrow).
- Default the balanced density to **week view** or a **mini-month + next-7-days agenda** combo, which compress far better than the month grid. Month stays one tap away via the existing view tabs.
- `#yearStrip` is cut in balanced mode (first casualty of the height budget).

**Density axis mechanics** (mirrors theme/flavor):

- `'calendar-focus'` (default, absence of class) | `'balanced'` (`body.density-balanced`).
- `applyDensity()` + `setDensity()`, persisted `fh_density`, buttons in Settings → Look & Feel.
- Mobile (`max-width: 640px`) untouched — tab layout already governs it. TV mode forces calendar-focus unless someone asks otherwise.

## Deferred — Option C: uniform dashboard grid

One CSS grid of tiles, calendar spanning 2×2, drag-to-rearrange. Most flexible, but it invalidates the sidebar/bottom placement model and its Settings UI, and drag persistence is a new subsystem. Revisit only if the family lives in balanced mode and wants finer control.

## Remaining open questions

- Which widgets earn promotion into the freed space by default — photos, event discovery, meals?
- Default calendar view in balanced mode: week, or mini-month + agenda?
