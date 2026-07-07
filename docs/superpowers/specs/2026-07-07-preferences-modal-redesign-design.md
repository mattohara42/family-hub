# Preferences Modal Redesign — Design

*Status: Design approved, ready for implementation plan. Created 2026-07-07.*

## Summary

Overhaul the Settings ("Preferences") modal to conserve space and create a
cleaner flow. Today it's **12 flat tabs in a single horizontal scroll strip**
(Look & Feel, Family, Calendar, Weather, Shopping, To-Do, Chores, Meals,
Widgets, Events, Feeds, Easter Eggs) with several long, dense panels (the Look &
Feel panel alone is ~170 lines of markup). The redesign replaces the strip with
a **grouped two-pane layout** (nav + content) that drills into a single-column
flow on phones, reorganizes the 12 categories into 5 groups, and tightens
within-panel density — all riding the existing theme/token system.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Primary problem | **All three** — navigation crowding, panel density, and visual polish. |
| Scope | **Full rethink** — reorganize categories, tighten presentation, progressive disclosure for advanced options. |
| Device target | **Equally wall + phone** — two-pane on wide, single-column drill-in on narrow. |
| Layout approach | **A — two-pane + grouped nav** (rejected: B category-hub drill-in; C grouped accordion). A is the only option that optimizes both wide and narrow. |

## Constraints (architecture invariants)

- No build step; CDN only; respect CSP.
- Five themes (`dark`/`light`/`nautical`/`aurora`/`colorblind`) × two Flavors
  (`basic`/`tactile`) = 10 combinations must all read correctly.
- Tactile re-skins material only, off the same tokens — so token-driven styling
  inherits Tactile automatically.
- Touch tap-target padding must stay inside `@media (hover: none)`.
- KTD-4: no color-only signaling under `colorblind-mode`/`safe-palette-on`.
- `openSettings()` (populate) and `saveSettings()` (persist) behavior must not
  regress. `saveSettings()` persists + `closeSettings()` before any re-render
  that could throw.

## Section 1 — Category reorganization

The 12 tabs regroup into **5 nav groups** (each with a header), nothing deleted:

- **General** — Look & Feel · Family
- **Calendar** — Calendar (subscriptions, member colors) · Events (discovery)
- **Widgets** — Widget layout (placement/order) · Weather · Feeds (stocks/news)
- **Lists & chores** — Shopping · To-Do · Chores · Meals
- **Advanced** — Easter Eggs (and future power-user toggles)

Each group is 1–4 items → the nav scans without scrolling. "Advanced" is last and
visually de-emphasized (progressive disclosure); Easter Eggs no longer sits
between Calendar and Weather. Heavy per-widget config (e.g. Shopping categories)
stays put, just under a clearer parent.

## Section 2 — Layout & responsive behavior

**Wide (≥ ~700px):** two-pane. Left = grouped nav (section headers + items);
right = active panel. Selecting an item swaps the right pane and highlights the
nav item. The horizontal `.modal-tabs` strip is retired.

**Narrow (phone):** modal opens showing only the nav (full grouped list,
comfortable tap targets). Tapping an item slides the panel in to fill the modal
with a **‹ Back** header returning to the nav. Standard mobile settings drill-in.

**Mapping to existing code (minimal churn):**
- The 12 `.settings-panel` divs keep their content unchanged — only their
  container and show/hide change.
- `switchSettingsTab(tab)` stays the single switch point. It gains: set active
  panel, mark active nav item, and on narrow screens toggle the modal into
  "panel view." A `‹ Back` returns to "nav view."
- Nav renders from a new `SETTINGS_GROUPS` array (group label → items) so
  structure lives in one place, not 12 hand-ordered buttons in HTML.
- One CSS breakpoint drives wide-vs-narrow; drill-in state is a modal/body class
  toggled in JS. Larger touch targets stay inside `@media (hover: none)`.
- `openSettings()` / `saveSettings()` unchanged — same field IDs populated and
  persisted. The redo is structural, so it cannot regress settings behavior.

## Section 3 — Within-panel density & progressive disclosure

Applied per panel, against existing controls (no new settings invented):
- **Consistent field rhythm** — one shared field pattern (label + control +
  optional helper), reusing the `.field` styling fixed for the event editor.
- **Sub-grouping** — long panels get lightweight labeled subsections (small
  header + hairline) instead of one undivided wall. E.g. Look & Feel → *Theme &
  Flavor* / *Layout* / *Display/TV*.
- **Progressive disclosure** — advanced/seldom-touched controls sit under a
  collapsed "Advanced" disclosure within their panel; collapsed by default,
  persists nothing, just tidies the first impression.
- **Toggles read as toggles** — booleans use a consistent switch/row style, not
  raw checkboxes scattered among inputs.

Each panel is an independent, low-risk unit of work.

## Section 4 — Styling & theming

Leans entirely on existing tokens; no hard-coded colors:
- **Token-driven surfaces** — nav pane, content pane, dividers, active-item
  highlight all use `--surface-solid/-hi/-lo`, `--ink`, `--line`, `--accent`.
  Tactile paper/serif treatment is inherited automatically (no Tactile-specific
  modal code).
- **Nautical/aurora** — modal sits above the `body::before/::after` backdrops;
  redesigned panes verified against both.
- **Colorblind/safe-palette** — active nav item marked by fill *and* a
  weight/indicator, never color alone (KTD-4).
- **Touch** — comfortable tap targets strictly inside `@media (hover: none)`.
- **Type** — app type scale; under Tactile, labels/headers pick up
  Fraunces/Hanken via `font: inherit`.

No new color decisions, no per-theme special-casing beyond verification.

## Section 5 — Verification & rollout

**Verification (browser-proven, per project rule — DOM/state reads over
screenshots except for genuinely visual checks):**
- **Behavior parity (top risk):** every setting still populates on open and
  persists on save. Spot-check one control per panel: open → change → save →
  reopen → value stuck.
- **Navigation:** each nav item shows its panel and marks active (wide);
  drill-in + Back works (narrow) — verified by resizing preview to mobile.
- **Theming matrix:** walk the modal through the 10 theme×Flavor combos;
  surfaces/active-state read correctly.
- **Touch targets:** larger padding only under `@media (hover: none)`.

**Rollout (independent units, never half-broken):**
1. **Shell first** — `SETTINGS_GROUPS` array + two-pane container +
   `switchSettingsTab()` update + responsive drill-in. All 12 existing panels
   drop in unchanged. Shippable alone: nav already better, panels as-is.
2. **Per-panel density passes** — restyle panels one at a time (Section 3)
   against the new shell. Each panel an independent commit; the modal works
   throughout.

Risky structural change lands once and is verified; cosmetic per-panel work
proceeds incrementally, no big-bang.

## Components / units

| Unit | What it does | Depends on |
|---|---|---|
| `SETTINGS_GROUPS` (data) | Declares nav groups → items in one place | — |
| Nav renderer | Builds the grouped nav from `SETTINGS_GROUPS` | `SETTINGS_GROUPS` |
| Two-pane container + CSS | Wide two-pane / narrow drill-in shell | tokens, breakpoint |
| `switchSettingsTab()` (updated) | Activate panel, mark nav item, toggle panel-view on narrow | nav renderer, panels |
| `‹ Back` control | Return narrow view to nav | modal state class |
| Per-panel density passes (×N) | Subsections, shared field rhythm, Advanced disclosure, toggles | `.field` styling |

## Out of scope

- No new settings/controls invented; existing controls only.
- No change to `openSettings()`/`saveSettings()` field IDs or persistence keys.
- Unrelated refactoring of non-settings code.

## Key touch points

- `family-hub.html` — settings modal markup (`.modal-tabs` strip → two-pane
  container; `.settings-panel` divs retained).
- `family-hub.css` — `.modal-tabs`/`.modal-tab`/`.settings-panel` rules → new
  two-pane + nav + responsive drill-in; per-panel subsection styling.
- `family-hub.js` — new `SETTINGS_GROUPS`, nav renderer, updated
  `switchSettingsTab()`, Back handler. `openSettings()`/`saveSettings()`
  untouched.
