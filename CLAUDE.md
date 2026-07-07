# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

*Read at the start of every session. This file is intentionally lean — it loads on every turn. Detailed reference (file-structure maps, per-feature function/state/anchor inventories, data shapes, API constants) lives in `FEATURES.md`; read that on demand.*

---

## What This Project Is

A three-file family dashboard. No build step for the app, no framework — CDN scripts only (Firebase 9 compat, Google Identity Services). `package.json` exists solely for `npm test`.

| File | Contents |
|---|---|
| `family-hub.html` | HTML structure + CDN script tags (no inline CSS/JS) |
| `family-hub.css`  | All CSS (vars, layout, components, themes) |
| `family-hub.js`   | All JS logic + config block at top |

All three files must sit in the same directory. Serve via Netlify (prod), `netlify dev` → `http://localhost:8888` (app **+** functions), or `python3 -m http.server 8080` → `http://localhost:8080/family-hub.html` (app only — AI proxy, news proxy, ICS proxy, event discovery won't work).

Shared state (shopping, todo, budget) lives in Firebase Firestore. Photos are blobs in IndexedDB. Everything else is `let` globals + `localStorage` (`fh_*` keys).

---

## Commands

```bash
npm test                          # all tests — Node built-in runner, zero deps
node --test tests/events.test.js  # one test file
node tests/mow-scorer.test.js     # golden tests also run standalone
netlify dev                       # app + Netlify functions on :8888 (keys in .env.local)
```

**Golden-test convention:** `family-hub.js` is a browser script and can't be `require()`d, so `tests/mow-scorer.test.js` and `tests/event-shift.test.js` carry **deliberate copies** of the pure functions they test (`scoreMowWindows()`, `computeEventShift()`). If you edit either function, update its test copy in the same change — the tests are the spec's worked examples. Pure helpers in `netlify/functions/events.js` are instead exported via `module.exports._test` and tested directly in `tests/events.test.js`; export new pure helpers the same way.

---

## Architecture Invariants (don't break these)

- **No build tooling for the app.** Any library must be a CDN `<script>`/`<link>` and respect the CSP in `family-hub.html` (`img-src` includes `'self'`). (`netlify-build.js` only stamps a fresh `CACHE_VERSION` into `sw.js` at deploy — it never transforms app files.)
- **Full-viewport flex.** `body` is `flex-column 100dvh`. `min-height: 0` is required at every flex level to allow shrinking below content size. `.sidebar > *` must keep `flex-shrink: 0` — or cards compress instead of the sidebar scrolling.
- **Google OAuth = GIS token client** (not code flow). Token is in-memory only (`let googleToken`), never localStorage. `file://` blocks OAuth — must serve from `localhost` or HTTPS. Any new serving origin must be added to Google Cloud Console (Authorized JS Origins) **and** Firebase Console (Authorized Domains). `generative-language` is **not** a valid OAuth scope.
- **Touch tap-target CSS must stay inside `@media (hover: none)`** — larger button/list padding rules must never leak outside that block.
- **Themes (color axis):** `'dark'` (default), `'light'`, `'nautical'`, `'aurora'`, `'colorblind'`. `applyAppMode()` swaps body classes (dark = no class). Nautical/aurora use `body::before`/`::after` pseudo-elements.
- **Flavor (design-system axis), orthogonal to theme:** `'basic'` (default, flat-glass — absence of class) and `'tactile'` (lush/hand-made material). `applyFlavor()` toggles `body.flavor-tactile`; persisted in `fh_flavor`. Themes set color tokens (`--surface-solid/-hi/-lo`, `--ink`, `--line`, `--accent`…); Tactile reads those tokens and changes only the *material* (surface, type via self-hosted Fraunces/Hanken in `fonts/`, shadow, radius, grain). Tactile decoration is suppressed under `colorblind-mode`/`safe-palette-on` (KTD-4). Both axes stack, e.g. `body.flavor-tactile.nautical-mode`.
- **Service worker is network-first** for same-origin GETs, passthrough for everything else (`sw.js`). Kiosk tabs auto-reload when idle after a new deploy (`controllerchange` + 60s-idle check in the "Kiosk auto-update" section) — don't add SW caching strategies that would delay updates.
- **Settings shell is data-driven.** The Preferences modal is a grouped two-pane layout (nav left, panel right; drill-in on narrow screens). The nav renders from `SETTINGS_GROUPS` in `family-hub.js` — add/reorder settings there, never by hand-editing nav HTML.

---

## Known Gotchas

| Gotcha | Detail |
|---|---|
| `file://` blocks OAuth | Use `http://localhost:8080` or deploy to Netlify (HTTPS) |
| New serving origin breaks OAuth | Add to Google Cloud Console → Authorized JS Origins AND Firebase → Authorized Domains |
| Photos Picker 403 | Must include `Authorization: Bearer ${googleToken}` header when downloading images |
| Gemini key routing | `geminiFetch()` calls Gemini directly only when the user pasted a key (`mealAiKey`); otherwise it POSTs to `/.netlify/functions/ai`, which holds `GEMINI_KEY` server-side (Netlify env var). Local dev without `netlify dev` + no pasted key = AI features fail |
| Gemini free tier disabled | Happens when GCP billing is enabled — use an AI Studio key from a billing-free project |
| Gemini model deprecated | Update `GEMINI_MODEL` constant (also `DEFAULT_MODEL` in `netlify/functions/ai.js`); watch for `404 NOT_FOUND` |
| `generative-language` OAuth scope | Doesn't exist — `invalid_scope`. API key only for Gemini |
| Weather is keyless | Widget uses **Open-Meteo** (forecast/geocode/AQI) + **RainViewer** (radar) + **NWS** (US alerts) — no key, no signup. `loadWeatherByCity()` geocodes then fetches. Note: `netlify/functions/events.js` (event discovery) still uses an OWM key — separate feature |
| Open-Meteo uses WMO codes | Conditions are integer WMO codes, not strings. `wmoToCondition()` maps them to the OWM-style strings (`Clear`/`Rain`/…) the renderer keys on |
| Open-Meteo times are location-local | ISO strings have no zone suffix (`timezone=auto`); use `omEpoch(iso, utc_offset_seconds)` to get a real UTC epoch |
| News feeds need the proxy | RSS/Atom feeds (BBC/AP send no CORS headers) are fetched via `netlify/functions/news.js` (SSRF-guarded) — news widget is empty under plain `http.server` |
| Touch tap-target CSS leak | Larger button/list padding MUST be inside `@media (hover: none)` |
| SMS popover transparency | Use a solid opaque color — `var(--surface)` is semi-transparent over bg photos |
| SMS popover clipping | `backdrop-filter` on `.card` traps `position: fixed`; append popover to `<body>` then position via `getBoundingClientRect()` |
| Sidebar card compression | `.sidebar > *` must have `flex-shrink: 0` |
| `budgetDatesInRange()` returns strings | Returns `YYYY-MM-DD` strings, not Date objects — don't call Date methods on them |
| Budget pill hidden by default | `#budgetTotalCard` starts `display:none`; `renderBudgetCard()` shows it when items exist |
| Budget uses Firestore | Collection `budget` ordered by `createdAt`; `onSnapshot` keeps `budgetItems[]` live |
| Firestore needs Firebase Auth, attached in order | Production rules gate on `request.auth` (Firebase Auth), which is **separate** from the GIS Google token — the app bridges them via `signInWithCredential` in the OAuth callback (needs **Google enabled in Firebase Console → Authentication → Sign-in method**). `setupListeners()` attaches `onSnapshot` then **re-attaches on `firebase.auth().onAuthStateChanged`** — listeners attached before sign-in get `permission-denied` and never recover, so re-attach is what makes shared state load under auth-required rules. Auth failure is surfaced (status pill + control card); don't move listener setup back to a plain load-time attach. |
| Firestore writes silently fail on denied rules | `.add()`/`.update()` reject with `permission-denied` (denied rules, or `request.auth` null because Firebase Auth didn't sign in). Cached reads still render, so it looks like "add does nothing." `addFamilyMember()` surfaces this via `#familyMemberError`; other write paths still swallow it — wrap new writes in try/catch |
| `firestore.rules` deploys manually | The rules file is versioned here but takes effect only via Firebase Console → Rules → Publish (or `firebase deploy --only firestore:rules`). Allowed emails are hardcoded in its `isAllowed()` list |
| WOTD cache requires definition | Cache entry rejected if `definition` is empty |
| ICS subs = no-OAuth calendars | Subscribe to public/secret `.ics` URLs (`icsSubs`) — events inject into `calEventCache` like Google ones. `parseIcs`/`expandRecurrence` handle TZID + RRULE/EXDATE; `fetchIcsSub` falls back to the `netlify/functions/ics.js` proxy (Netlify-only). Local dev can't proxy CORS-restricted feeds |
| ICS recurrence is pragmatic | Supports FREQ DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL/COUNT/UNTIL/BYDAY/EXDATE only — no BYMONTHDAY/nth-weekday/RDATE/RECURRENCE-ID. Expanded over a ~2 mo back → 14 mo forward window |
| ICS date keys are local | `injectIcsEvent` keys events by `localDateKey()` (not `toISOString()`) — UTC slicing day-shifts evening events in western zones |
| Nautical mode migration | `localStorage 'fh_mode' === 'amazing'` auto-upgrades to `'nautical'` on load |
| Browser caches JS during dev | Keep DevTools open with "Disable cache" or hard-reload (Cmd+Shift+R) after edits — the network-first SW helps, but stale tabs happen |
| Event Discovery keys | Ticketmaster, OpenWeatherMap, LibraryWeb (per-branch), Red Wings (keyless), CitySpark (keyless) — set via Netlify env vars in production |
| Event Discovery backend | Runs on `/.netlify/functions/events`; geocoding via OWM; exponential backoff retry (2x, 1s→4s) for API failures |
| CitySpark sort parameter | MUST use `sort:'Time'` (soonest-first); `'Date'` returns the tail of future events and fails the 30-day filter |
| TV mode is read-only | `openEventEditor()` is gated in TV mode — keep new edit affordances gated the same way |

---

## Adding a Feature — Checklist

1. **State:** `let featureState = lsGet('fh_featureName', default)` near similar features
2. **CSS:** `/* ── Feature Name ── */` section in `family-hub.css`; use existing CSS vars; theme variants if needed
3. **HTML:** card in `.sidebar` or modal in `<body>`
4. **JS:** `// ── Feature Name ──` section in `family-hub.js`
5. **Widget?** add to `WIDGET_DEFAULTS`, `WIDGET_PLACEMENT_DEFAULTS`, `WIDGET_ORDER`
6. **Settings?** add a `settings-panel` div (`data-panel="x"`) in `family-hub.html` + a nav entry in `SETTINGS_GROUPS` (`family-hub.js`); wire into `openSettings()` (populate) and `saveSettings()` (persist). In `saveSettings()`, persist + `closeSettings()` **before** any re-render that could throw.
7. **Pure logic?** date/scoring math gets a golden test in `tests/` (see golden-test convention above)
8. **Init:** call setup from `window.addEventListener('load', ...)`
9. **Docs:** update `FEATURES.md` (function/state/anchor/key) + `CLAUDE.md` if architecture changed

---

## How to Find Things Quickly

```bash
grep -n "function functionName" family-hub.js   # JS function
grep -n "id=\"elementId\""       family-hub.html # HTML element
grep -n "\.class-name"           family-hub.css  # CSS class
grep -n "fh_keyName"             family-hub.js   # localStorage key
grep -n "^// ──"                 family-hub.js   # JS section boundary
grep -n "^/\* ──"                family-hub.css  # CSS section boundary
```

When editing, use `Read` with `offset` + `limit` to read only the relevant section — these files are large (`family-hub.js` is ~11k lines).

---

## Verification — prefer DOM/JS inspection over screenshots

When checking that a change worked in the browser, **default to `javascript_tool` (read `el.style.display`, `innerHTML`, computed values, state vars) rather than screenshots.** Screenshots cost ~1,000–1,500 tokens each; a DOM/state read costs a fraction of that. Reserve screenshots for genuinely *visual* questions (does this look right / is it aligned) — not for "did it toggle / render / update."

---

## Project Files

**App:** `family-hub.{html,css,js}` · `manifest.json` · `sw.js` (network-first service worker) · `favicon.svg` · `fonts/` (Tactile woff2) · `firestore.rules`

**Backend & deploy:** `netlify/functions/` — `events.js` (event discovery multi-API aggregation), `ai.js` (Gemini proxy, `GEMINI_KEY`), `ics.js` (ICS feed proxy), `news.js` (RSS/Atom proxy) · `netlify.toml` (build/redirects/headers; no-cache on HTML + SW) · `netlify-build.js` (stamps SW `CACHE_VERSION` per deploy)

**Tests:** `tests/*.test.js` (`npm test`) · `BACKEND_TESTING_SETUP.md` (local `netlify dev` + curl walkthrough)

**Documentation:** `FEATURES.md` (detailed feature/reference map) · `family-hub-setup.md` (end-user setup) · `RETROSPECTIVE.md` (lessons learned) · `EVENT_DISCOVERY.md` (feature deep-dive) · `CLAUDE.md` (this file)

**Backlogs & Plans:** `BACKLOG.md` (general) · `WEATHER_BACKLOG.md` · `ASSISTANT_BACKLOG.md` · `MEALS_BACKLOG.md` · `SCREENSAVER_BACKLOG.md` · `EASTEREGGS_BACKLOG.md` · `docs/brainstorms/` · `docs/plans/` · `docs/superpowers/specs/` (design specs)
