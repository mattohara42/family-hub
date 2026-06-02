# Family Hub — Project Retrospective

*Last updated: 2026-06-01*

---

## What Was Built

Family Hub is a three-file local web application (`family-hub.html` + `family-hub.css` + `family-hub.js`) that serves as a family dashboard.

| Feature | Status |
|---|---|
| Monthly / Weekly / Daily calendar views | ✅ Working |
| Google Calendar integration (OAuth2) | ✅ Working |
| Custom calendar labels, colors, holiday overlay | ✅ Working |
| Per-calendar sidebar toggle card | ✅ Working |
| Weather widget — multi-location with nav arrows | ✅ Working |
| Google Photos Picker background slideshow | ✅ Working |
| Light / Dark / Nautical appearance themes | ✅ Working |
| Responsive layout (mobile → desktop) | ✅ Working |
| Full-viewport calendar stretch | ✅ Working |
| Widget placement system (sidebar or bottom) | ✅ Working |
| Firebase shared Shopping List | ✅ Working |
| Firebase shared To-Do list | ✅ Working |
| Clear Done + Clear All for Shopping and To-Do | ✅ Working |
| SMS Shopping List (with multiple named contacts) | ✅ Working |
| Tabbed Settings modal | ✅ Working |
| Year at a Glance (sidebar: 2-month; bottom: 6-month strip) | ✅ Working |
| Meal Planning (Gemini AI suggestions, recipe links) | ✅ Working |
| Meal plan remove buttons (week + day views) | ✅ Working |
| Meal plan on Weekly and Daily views | ✅ Working |
| Add meal ingredients to Shopping List | ✅ Working |
| Budget tracker (recurring bills, context-sensitive sidebar pill) | ✅ Working |
| Word of the Day (dictionary API + built-in fallbacks) | ✅ Working |
| Dad Joke of the Day | ✅ Working |

---

## Session 1 — Initial Build (2026-05-31)

### What Worked Well

**Single-file architecture (later split to three)**
Keeping everything in one file during initial development made it easy to iterate. Claude could read, edit, and test changes without switching files. The eventual split to three files preserved this simplicity while making each file more targeted.

**CSS variables for theming**
Using CSS custom properties (`--text`, `--surface`, `--accent`, etc.) throughout made light/dark mode trivial to implement. Every new component inherited correct theming for free.

**Firebase for real-time shared state**
Firestore required zero backend code. Shopping and to-do lists sync across devices with no polling.

**Free APIs with no key required**
- Dad Joke (`icanhazdadjoke.com`) — zero setup
- Dictionary API (`dictionaryapi.dev`) — zero setup, rich data

### What Was Problematic

**Google API surface area**
- Photos Library API was deprecated — had to be replaced with Photos Picker API
- OAuth scope `generative-language` doesn't exist — caused confusing `invalid_scope` errors
- Photos Picker 403 — download URLs require `Authorization: Bearer` header, undocumented

**Gemini model churn**
`gemini-1.5-flash` → `gemini-2.0-flash` → `gemini-2.5-flash` all within one session. Three model name updates required.

**Gemini billing / quota confusion**
Three distinct "it's not working" states:
1. Free quota exhausted
2. Billing enabled → free tier disabled (no error makes this clear)
3. `PERMISSION_DENIED` — API not enabled for the project
4. `NOT_FOUND` — stale model name

Each required different diagnosis and fix. Significant effort went into building diagnostic error UI.

**Context window limits**
The single-file architecture consumed context heavily. Late in the session, targeted `grep` + offset reads became necessary.

---

## Session 2 — UI Overhaul + New Features (2026-06-01)

### Major Changes

**Refactored from single-file to three-file architecture**
`family-hub.html` was split into three sibling files. This was a prerequisite for the scale of UI work that followed — editing styles without touching HTML or JS became much cleaner.

**Full layout redesign**
- `<header>` removed entirely; app title moved into calendar card header
- Calendar card header restructured as a 3-zone CSS grid (title | period nav | view tabs)
- `#controlCard` (user info, sign-in/out, settings gear) added as a compact sidebar card
- `#budgetTotalCard` added as a slim sidebar pill (red left border) for month/week bill totals
- `#calendarCard` added as a sidebar card with checkbox-style calendar toggles
- Full-viewport stretch: calendar fills all remaining height; sidebar scrolls independently

**Widget placement system**
Every widget can be assigned to sidebar or bottom via radio buttons in Settings → Widgets. The `WIDGET_ORDER` array ensures canonical ordering when widgets are moved. `#yearStrip` is a special case — it always stays inside `.cal-column`; only `#yearCard` moves.

**Year at a Glance as a proper widget**
- Sidebar mode: `#yearCard` shows 2 mini-months with ‹/› navigation
- Bottom mode: `#yearStrip` shows 6-month horizontal strip (existing behavior)

**Multi-location Weather widget**
Replaced single `weatherCity` string with `weatherLocations[]` array. Added per-city in-memory cache (30-minute TTL). Added `#wxLocNav` (prev/next buttons + dot indicators) that appears only when >1 location. Settings panel replaced single city input with a managed location list. Auto-migration from legacy `fh_wcity` on first run.

**Nautical appearance theme**
Third theme option alongside Light and Dark. Navy blue `#0c1a3a` background with 20% diagonal white stripes. Beige-gold (`#c8a96e`) accent colour throughout. Decorative elements: large ⚓ watermark (22% opacity), animated CSS clip-path wave footer (`nauticalWave` keyframe), rope-style card header dividers, compass rose radial gradient on calendar, porthole glow on today's cell. Originally named "Amazing", renamed to "Nautical" in the same session. Auto-migration for users who had `'amazing'` saved.

**Budget card context-sensitivity**
`renderBudgetCard()` now reads `calView` + `calViewDate` to display the right period. Month → "Total Bills this Month". Week → "Total Bills this Week". Day → "Bills Today". Card hidden when no items fall in the current period.

**Meal plan remove buttons**
Week view: hover-revealed `✕` remove button on each meal chip. Day view: inline remove button on each meal slot.

**Clear All for Shopping and To-Do**
Added `clearAllShopping()` and `clearAllTodo()` (with `confirm()` dialogs) alongside the existing "clear done" buttons.

**WOTD fallback dictionary**
Added `WOTD_FALLBACKS` with built-in definitions for common words in the list. If the dictionary API fails, a built-in definition renders instead of a blank card.

### Bugs Fixed

| Bug | Root Cause | Fix |
|---|---|---|
| Touch tap-target rules applied globally | Section 4 of touch optimizations was outside `@media (hover: none)` — leaked to desktop | Wrapped entire section in the media query |
| Sidebar cards compressing | `.sidebar > *` had `flex-shrink: 1` (default) — cards compressed instead of sidebar scrolling | Added `.sidebar > * { flex-shrink: 0 }` |
| Calendar card cut off | Same root cause as sidebar compression | Fixed by above |
| SMS popover transparent | Used `var(--surface)` which is semi-transparent; unreadable over background photos | Changed to solid opaque `#1e2130` / `#f5f6fa` per theme |
| `calendarCard` always hidden | Hid itself when `calendarMeta` was empty; no placeholder for signed-out state | Now shows "Sign in to see your calendars" placeholder |
| WOTD shows "Loading…" permanently | Some words not in dictionary API; error swallowed, stale empty cache served | Added `WOTD_FALLBACKS` + cache rejection when `definition` is empty |
| DOW headers too small | `.cal-dow` used `text-xs` / muted color | Bumped to `text-sm`, bold weight, full text color |
| Weather forecast only 2 days | `cnt=40` was borderline; `fcast.list` null-unsafe | Changed to `cnt=56`, added `fcast.list || []` guard, sorted `dayMap` by date |

### Patterns That Worked

**Context-sensitive rendering via a central dispatch function**
`renderCurrentView()` is called after every navigation action. It shows/hides the correct view, calls `renderBudgetCard()`, and keeps everything in sync. Adding a new context-dependent element just requires adding a call here.

**DOM node migration for widget placement**
Using `appendChild` (which moves existing nodes) to distribute widgets between `.sidebar` and `#bottomStrip` in `WIDGET_ORDER` sequence is elegant — no cloning, no re-rendering, just re-parenting.

**30-minute in-memory cache for weather**
Navigating between locations is instant after first load without any localStorage complexity. Cache lives only for the page session, so data is never stale across days.

**`WOTD_FALLBACKS` as a graceful degradation layer**
Instead of showing an error when the free dictionary API is unavailable, the app falls back to a built-in definition. Users never see a broken widget.

### Patterns That Didn't Work

**CSS `columns` for bottom strip layout**
Tried CSS multi-column layout for bottom widgets — it fills sequentially left-to-right, leaving right columns empty when there are few items. Replaced with CSS grid `auto-fit`.

**`display: ''` to show flex containers**
Setting `display: ''` (empty string) clears the inline style but the element defaults to `display: block`, not `display: flex`. Week and day views broke until JS was changed to explicitly set `display: 'flex'`.

---

## Claude Version & Context Limits

### Model used
All work done with **Claude Sonnet 4.6** (Claude Code / FleetView interface).

### Context window observations
- The three-file architecture helps — reading `family-hub.css` independently is much cheaper than reading a 5000-line combined file
- Targeted `grep -n` + `Read` with `offset`/`limit` is essential for large files
- `/compact` was used between sessions; `CLAUDE.md` and `FEATURES.md` proved critical for restoring context quickly

### How to work most effectively

1. **Read `CLAUDE.md` at the start of every session** — it contains the architectural decisions that aren't obvious from the code
2. **Use `grep -n` before editing** — find the exact line range before reading or editing
3. **Update docs at the end of each session** — the documentation is the cheapest form of context preservation
4. **One feature per session when possible** — each session starts cold; a focused goal produces cleaner work than a sprawling one
5. **Compact proactively** — `/compact` before the context is full generates a better summary

---

## Known Limitations and Open Issues

| Issue | Workaround / Notes |
|---|---|
| Google OAuth blocks `file://` URLs | Serve via `python3 -m http.server 8080` or Netlify; add the origin to Google Cloud Console and Firebase Console |
| Photos Picker URLs expire (session-based) | Re-open Picker to refresh; images stored in IndexedDB |
| Gemini free tier has daily limits | Use AI Studio key in a billing-free project |
| Budget items not shared via Firebase | By design — budget is personal; could be added in a future session |
| No user authentication on the page itself | Acceptable for family use — the app is deployed on Netlify but Google sign-in gates all personal data (calendar, photos, Firebase lists) |
| Weather forecast sometimes shows <5 days | OWM free tier returns up to 40 3-hour slots; fewer future days available late in the day |
| Dictionary API occasionally unavailable | `WOTD_FALLBACKS` covers ~20 common words; rarer words show a retry button |
