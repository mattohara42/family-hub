---
title: Mobile UI Refresh — Parity with Current Desktop UI & Preferences
type: feat
origin: docs/plans/2026-06-15-001-feat-mobile-redesign-plan.md (supersedes)
date: 2026-07-11
---

# Mobile UI Refresh — Implementation Plan

> **✅ IMPLEMENTED 2026-07-11** — R1–R8 shipped on `claude/mobile-ui-redesign-t6bmca` (registry-driven tabs, preference-gated More grid + Chores tab, desktop-only placement, Flavor toggle, themed/Tactile nav chrome, screensaver mobile gate, drawer removal, 375px sweep). See FEATURES.md §20 for the as-built reference.

**Scope:** Standard — close the gap between the shipped mobile UI (June) and the desktop UI/preference system as it exists today (July 11). No new features; parity, correctness, and architecture cleanup.
**Depth:** 7 implementation units.
**Supersedes:** `2026-06-15-001-feat-mobile-redesign-plan.md`. That plan is ~90% shipped; this plan replaces its remaining intent and covers a month of desktop drift (~70 commits since June 15).

---

## Where We Are — Audit of the June Plan

What shipped from the original nine units (all on `main`):

| June unit | Status | As-built notes |
|---|---|---|
| U1 Bottom nav | ✅ Done | `.mobile-bottom-nav`, 5 buttons (Calendar/To-Do/Shopping/Weather/More), `setMobileTab()`, `fh_mobileTab` (not the planned `switchTab`/`fh_currentTab`) |
| U2 Hamburger menu | ✅ Done, then **redesigned** | Slide-out drawer was replaced by an inline **More tab** (`#moreCard`: theme buttons, feature grid, sign-in, Full Settings). Drawer HTML/CSS/JS still present as dead code |
| U3 Smart tab defaults | ✅ Done | `getInitialMobileTab()` — time-of-day default keyed per-day (`fh_mobileTabDate`), session memory |
| U4–U7 Core tab redesigns | ✅ Done | Tab switching is CSS-driven: `body[data-mobile-tab="…"]` attribute + per-tab card hide lists |
| U8 Secondary widgets | ✅ Mostly | budget/wotd/dadjoke/quotes/countdown/news/stock/assistant reachable via More grid; **chores never got a mobile surface** |
| U9 Portrait lock + breakpoint | ✅ Done | 640px breakpoint, `screen.orientation.lock`, safe-area insets, iOS zoom guard |

**Architecture as-built (differs from the June plan — treat this as ground truth):**
- A mobile "tab" = a `data-mobile-tab` attribute on `<body>` + a CSS block per tab that hides `.cal-column` and every non-target sidebar card **by explicit ID list** (~13 IDs × ~12 tabs of near-identical rules in `family-hub.css`).
- There is no separate mobile rendering path; the desktop cards themselves are shown/hidden. `isMobile` exists but is only used for small forks (e.g. year strip 3 vs 6 months).

---

## Desktop Drift Since June 15 — What Mobile Doesn't Know About

1. **Flavor axis (Basic/Tactile)** — new orthogonal design-system axis (`applyFlavor()`, `fh_flavor`, self-hosted Fraunces/Hanken, material tokens). Mobile More tab offers themes only; **no Flavor toggle**. Zero `flavor-tactile` CSS rules target `.mobile-bottom-nav`, `.mobile-nav-btn`, or `#moreCard` — Tactile users get a flat-glass nav bar under a hand-made UI.
2. **Settings modal redesign** — grouped two-pane Preferences with narrow-viewport drill-in already shipped (`8797c51`) and works on mobile. ✅ No work needed; noted so we don't re-plan it.
3. **Cross-device settings sync** — `fh_*` prefs (widgets, tickers, locations, diet prefs, mow config), ICS subs, Life Admin, countdowns, meal templates now sync via Firestore. Mobile inherits this for free, but it **raises the stakes on preference bugs**: a widget disabled on the wall display now disables it on the phone too (see Gap G1).
4. **Weather rebuilt on Open-Meteo** + RainViewer radar + NWS alerts. Mobile weather tab layout was fixed (`1ebe706`), but radar/alert modules have never been verified at 375px.
5. **Calendar upgrades** — recurrence end (count/until), event Location field + Google Maps links + inline pin-map, editor field styling. All render inside the event editor modal on mobile; unverified.
6. **Event Discovery** (💡 modal, 5 sources) — button lives in the calendar header, so it's reachable only on the Calendar tab; modal never audited on mobile.
7. **Assistant upgrades** — proactive daily briefing banner, TTS, mic, full event CRUD, mow advisor. Assistant tab exists via More grid; briefing banner + input row unverified on mobile.
8. **Screensaver** — idle full-screen photo slideshow. Activates by idle timer wherever it's enabled; on a phone this is battery drain and fights the OS lock screen.
9. **Meals** — planned meals render in calendar Week/Day views + meal detail modal (TheMealDB photos, adjust flow). Reachable on mobile through the calendar, unverified.
10. **Easter eggs, kiosk auto-reload, TV mode** — no mobile impact (text-triggered / kiosk-only). ✅ Nothing to do.
11. **Density axis** — REJECTED (see 2026-07-06 brainstorm); desktop layout unchanged. Mobile plan must NOT assume a quadrant desktop.

---

## Gaps (verified against code, ranked)

**G1 — Widget preferences can blank out mobile tabs.** `applyWidgetVisibility()` sets inline `display:none` on disabled cards. The More grid is static HTML: it always shows News/Stock (both **default off**) and every other feature regardless of `widgetVisibility`. Tapping News on a default install → empty screen above the nav. With settings sync (drift #3), disabling a widget on desktop now silently breaks the corresponding mobile tab.

**G2 — Bottom-placement escapes the tab system.** `applyWidgetPlacement()` moves cards into `#bottomStrip` (inside `.cal-column`). Mobile tab CSS only targets `.sidebar > #card`, so a widget placed 'bottom' on desktop shows up under the calendar on the Calendar tab and its own tab goes blank.

**G3 — Chore Chart is unreachable on mobile.** `choreCard` is in every hide list, has no More-grid entry, no `menuItemMap` entry, no `data-mobile-tab="chores"` CSS. A default-on widget (`chores: true`) simply doesn't exist on phones.

**G4 — Hide-list CSS is unmaintainable.** Each new sidebar card must be added to ~12 per-tab ID lists; `moreCard` itself and future cards will keep leaking. This is the root cause of G2/G3 and the reason mobile drifts every time desktop grows a card.

**G5 — More tab is out of date with preferences.** No Flavor toggle (drift #1); feature grid ignores `widgetVisibility` (G1); "Family" entry opens full Settings which is fine post-redesign but the grid duplicates what the two-pane Settings drill-in now does well.

**G6 — Theme/flavor correctness of mobile chrome.** `.mobile-bottom-nav` uses a hard-coded `border-top: rgba(255,255,255,0.08)` (invisible/wrong in Light/Aurora — should be `var(--line)`); no Tactile treatment for nav or More card (drift #1).

**G7 — Screensaver has no mobile policy** (drift #8).

**G8 — Dead drawer code.** `#menuDrawer`/`#menuBackdrop` HTML, `.menu-drawer`/`.menu-backdrop` CSS, `toggleMenu()`/`openMenu()`/`closeMenu()`, `isMenuOpen` are vestigial since the More-tab redesign (`8b3568a`).

**G9 — New desktop surfaces unverified at 375px:** radar/alerts (drift #4), event editor with location + pin-map (#5), Events modal (#6), assistant briefing/input (#7), meal detail modal (#9).

---

## Implementation Units

### R1. Registry-driven mobile tabs (fixes G4, unblocks everything else)

**Goal:** Replace the ~12 per-tab ID hide lists with one generic mechanism, mirroring the registry pattern used for the Flavor axis (`d73a494`) and `WIDGET_ORDER`.

**Approach**
- Single CSS rule set inside `@media (max-width: 640px)`:
  `body[data-mobile-tab] .sidebar > .card { display: none !important; }` plus `body[data-mobile-tab]:not([data-mobile-tab="cal"]) .cal-column { display: none; }` and shared `.sidebar` column layout (already uniform across tabs today).
- JS: add a `MOBILE_TABS` registry `{ tab → cardId }` (derive secondary tabs from `WIDGET_ORDER` where possible). `setMobileTab(tab)` sets `data-mobile-tab` **and** stamps the active card with a class (e.g. `.mobile-tab-active`) shown by one rule: `body[data-mobile-tab] .sidebar > .card.mobile-tab-active { display: flex !important; }`.
- Careful with the inline `display:none` from `applyWidgetVisibility()` — the active-card rule needs `!important` or `setMobileTab` must clear the inline style for the active card (see R2 for the policy when the widget is disabled).
- Keep the existing per-tab exceptions (weather card `flex:1` vs `flex:none`) as two small rules keyed off the active card, not off tab names.
- Delete the old per-tab blocks (~250 lines of CSS).

**Files:** `family-hub.css` (§8 mobile nav), `family-hub.js` (`setMobileTab`, new registry near `WIDGET_ORDER`).

**Test:** every existing tab still shows exactly one card (or calendar); adding a hypothetical new card requires only a registry entry; `moreCard` never leaks into other tabs.

### R2. Make mobile navigation honor widget preferences (fixes G1, G5-partial)

**Goal:** The More grid and tab routing respect `widgetVisibility` — never navigate to a blank screen.

**Approach**
- Build the More "Features" grid dynamically from `WIDGET_ORDER` × `widgetVisibility` (label/emoji from a small map), rendered by `updateMoreCard()`. Hidden widgets don't get grid buttons.
- If the *current* mobile tab's widget gets disabled (settings sync can do this remotely), `applyWidgetVisibility()` should bounce `mobileTab` back to `'cal'`.
- Core tabs (To-Do, Shopping, Weather) stay pinned in the bottom nav regardless — they're not widget-gated on mobile (shopping/todo default on; weather has no visibility toggle today).
- Add the missing **Chores** entry to the registry + grid (fixes G3) — no new CSS needed after R1.

**Files:** `family-hub.js` (`updateMoreCard`, `applyWidgetVisibility`, registry), `family-hub.html` (drop the static grid buttons, keep the container).

**Test:** default install shows no News/Stock in More; disable Budget on "desktop" (another window) → phone's Budget grid button disappears and an open Budget tab bounces to Calendar; Chores reachable and renders.

### R3. Bottom-placement policy on mobile (fixes G2)

**Goal:** Widget placement ('sidebar'/'bottom') is a desktop-layout concept; mobile ignores it.

**Approach:** In `applyWidgetPlacement()`, on mobile (<640px) treat every widget as sidebar-destined (or equivalently: mobile CSS hides `#bottomStrip` and R1's registry shows the card wherever it lives — pick the JS route so the card is actually inside `.sidebar` and inherits tab layout). Re-run placement on the existing resize listener alongside `updateIsMobile()`.

**Test:** set Shopping placement to 'bottom' → phone Shopping tab still works; Calendar tab shows no stray strip; desktop unchanged at ≥640px.

### R4. More tab parity with current preferences (fixes G5)

**Goal:** More tab exposes the two quick-set axes the app actually has now.

**Approach**
- Add a **Flavor** row (Basic / Tactile) under the theme grid, calling the existing `setFlavor()`; highlight active in `updateMoreCard()` like themes.
- Keep the 5 theme buttons (already current). Keep Account + Full Settings.
- Respect KTD-4: when colorblind theme or safe-palette is active, Tactile is suppressed — reflect the effective state, don't fight `applyFlavor()`'s validation.

**Files:** `family-hub.html` (`#moreCard`), `family-hub.js` (`updateMoreCard`).

**Test:** toggle Tactile from phone → persists (`fh_flavor`), syncs, More tab shows active state; colorblind theme + Tactile shows Basic material as on desktop.

### R5. Theme/Tactile-correct mobile chrome (fixes G6)

**Goal:** Mobile nav and More card obey both design axes.

**Approach**
- `.mobile-bottom-nav`: `border-top: 1px solid var(--line)`; verify `var(--surface)` + blur reads correctly in all 5 themes.
- Add a small `body.flavor-tactile` block for `.mobile-bottom-nav` / `.mobile-nav-btn` / `.more-nav-item` (surface token, `--font-display` where appropriate, radius/shadow vocabulary) mirroring how Tactile treats other chrome. Suppressed automatically under KTD-4 since it keys off `body.flavor-tactile`.
- Sweep §8 mobile CSS for other hard-coded colors (drawer removal in R7 shrinks this).

**Files:** `family-hub.css`.

**Test:** Light/Aurora show a visible hairline, not a white ghost line; Tactile phone nav looks material, Basic unchanged.

### R6. Screensaver mobile policy (fixes G7)

**Goal:** Phones never burn battery on the slideshow; kiosk/desktop behavior unchanged.

**Approach:** Guard `startScreensaver()` (and skip arming in `resetSaverIdleTimer()`) when `isMobile`. No settings UI change — it's a policy, not a preference; the Settings toggle keeps governing desktop/kiosk. Note it in FEATURES.md §19.

**Test:** enable screensaver, idle a mobile-width window past the threshold → nothing happens; desktop width still activates.

### R7. Remove dead drawer code (fixes G8)

**Goal:** Delete the pre-More-tab drawer: `#menuDrawer`/`#menuBackdrop` HTML, `.menu-drawer`/`.menu-backdrop`/`.menu-header`/`.menu-item` CSS, `toggleMenu`/`openMenu`/`closeMenu`/`isMenuOpen` JS. Keep `navigateToMenuItem()` (used by the More grid) but simplify it against the R1 registry.

**Test:** grep for removed identifiers returns nothing; More grid navigation still works; no console errors on load.

### R8. Mobile verification sweep of post-June desktop surfaces (closes G9)

**Goal:** Audit-and-fix pass at 375px/414px over the surfaces desktop grew since June. Fix in place where small; file follow-ups if structural.

**Checklist**
- Weather tab: radar embed sizing, NWS alert banner wrapping, AQI row.
- Event editor modal: recurrence-end controls, Location field, Maps link, inline pin-map width.
- Events (💡) modal: card layout, filters, add-to-calendar flow; confirm the 💡 button is tappable (≥44pt) in the mobile calendar header.
- Assistant tab: briefing banner width, input row above the bottom nav (not under it), mic/TTS buttons ≥44pt.
- Meal detail modal: photo, adjust chips, action row.
- Settings two-pane drill-in: spot-check each reorganized panel (Look & Feel subsections, Assistant tab, Widgets, Easter-egg picker, Mow config) on a phone width.

**Method:** per CLAUDE.md, prefer DOM/computed-style inspection over screenshots; reserve screenshots for genuinely visual checks.

---

## Order & Dependencies

R1 → R2 → R3 (registry first; preference-honoring and placement policy build on it) · R4, R5 independent after R1 · R6, R7 independent, any time · R8 last.

Suggested commits: one per unit, `feat(mobile):` / `fix(mobile):` / `refactor(mobile):` prefixes.

---

## Key Decisions

1. **Keep the show/hide-desktop-cards architecture.** The June plan's "separate mobile render paths per widget" (U4–U8 `renderWidgetMobile()` forks) never materialized and isn't needed — the cards work at 375px. What failed is the *routing CSS*, not the rendering. Registry + generic rules fixes maintenance without a rewrite.
2. **Preferences are shared, not forked.** No mobile-specific widget visibility. One `fh_widgets`, synced; mobile routing adapts (R2) rather than storing its own set.
3. **Placement is desktop-only** (R3). A second placement concept on mobile has no meaning under a tab-per-widget model.
4. **More tab stays (no drawer revival).** It's the established pattern post-`8b3568a`; quick axes (theme, flavor) + dynamic feature grid + Full Settings.
5. **Screensaver is a kiosk/desktop feature** — hard-gated off on mobile rather than another setting.

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| R1 specificity fight with inline `display:none` from `applyWidgetVisibility()` | Medium | Active-card rule uses `!important` *and* R2 guarantees we never activate a disabled card; test the disable-while-active path explicitly |
| R3 DOM moves break desktop drag-and-drop ordering | Medium | Only move cards on the mobile side of the breakpoint; re-run `applyWidgetPlacement()` on resize both directions and re-test DnD at desktop width |
| Deleting per-tab CSS regresses a subtle per-tab exception | Medium | Diff computed styles per tab before/after (weather `flex:1` is the known one) |
| Tactile mobile chrome under-designed | Low | Keep R5 minimal (tokens only); visual polish can iterate |

## Success Criteria

1. Adding a new sidebar card to mobile = one registry entry (no CSS edits).
2. No reachable-but-blank or unreachable widgets on mobile, under any combination of `widgetVisibility`/`widgetPlacement` — including changes synced in from another device.
3. Chores usable on a phone.
4. Theme × Flavor both fully apply to mobile chrome; hairline visible in light themes.
5. Screensaver never activates at <640px.
6. `grep -c "data-mobile-tab=" family-hub.css` drops from ~60 rules to <10.
7. All G9 surfaces verified usable at 375px with ≥44pt targets and no horizontal scroll.

## Out of Scope (unchanged from June)

Landscape support, offline-first, push notifications, desktop layout changes, accessibility audit (separate follow-up), Density axis (rejected 2026-07-06 — do not re-propose).
