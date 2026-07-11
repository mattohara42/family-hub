# Family Hub — Claude Context File

*Read at the start of every session. This file is intentionally lean — it loads on every turn. Detailed reference (file-structure maps, per-feature function/state/anchor inventories, data shapes, API constants) lives in `FEATURES.md`; read that on demand.*

---

## What This Project Is

A three-file family dashboard. No build step, no npm, no framework — CDN scripts only (Firebase 9 compat, Google Identity Services).

| File | Contents |
|---|---|
| `family-hub.html` | HTML structure + CDN script tags (no inline CSS/JS) |
| `family-hub.css`  | All CSS (vars, layout, components, themes) |
| `family-hub.js`   | All JS logic + config block at top |

All three files must sit in the same directory. Serve via Netlify (prod) or `python3 -m http.server 8080` → `http://localhost:8080/family-hub.html`.

Shared state (shopping, todo, budget) lives in Firebase Firestore. Photos are blobs in IndexedDB. Everything else is `let` globals + `localStorage` (`fh_*` keys).

---

## Architecture Invariants (don't break these)

- **No build tooling.** Any library must be a CDN `<script>`/`<link>` and respect the CSP in `family-hub.html` (`img-src` includes `'self'`).
- **Full-viewport flex.** `body` is `flex-column 100dvh`. `min-height: 0` is required at every flex level to allow shrinking below content size. `.sidebar > *` must keep `flex-shrink: 0` — or cards compress instead of the sidebar scrolling.
- **Google OAuth = GIS token client** (not code flow). Token is in-memory only (`let googleToken`), never localStorage. `file://` blocks OAuth — must serve from `localhost` or HTTPS. Any new serving origin must be added to Google Cloud Console (Authorized JS Origins) **and** Firebase Console (Authorized Domains). `generative-language` is **not** a valid OAuth scope.
- **Touch tap-target CSS must stay inside `@media (hover: none)`** — larger button/list padding rules must never leak outside that block.
- **Mobile tabs are registry-driven.** A tab = one `MOBILE_TABS` entry in `family-hub.js` (cardId + optional `widget` visibility gate + optional `menu` More-grid entry); `setMobileTab()` stamps `.mobile-tab-active` and generic CSS in the 640px media query does the rest. Never write per-tab `body[data-mobile-tab="…"]` card rules. Widget *placement* ('bottom') is desktop-only; the screensaver never runs under 640px. (FEATURES.md §20)
- **Themes (color axis):** `'dark'` (default), `'light'`, `'nautical'`, `'aurora'`, `'colorblind'`. `applyAppMode()` swaps body classes (dark = no class). Nautical/aurora use `body::before`/`::after` pseudo-elements.
- **Flavor (design-system axis), orthogonal to theme:** `'basic'` (default, flat-glass — absence of class) and `'tactile'` (lush/hand-made material). `applyFlavor()` toggles `body.flavor-tactile`; persisted in `fh_flavor`. Themes set color tokens (`--surface-solid/-hi/-lo`, `--ink`, `--line`, `--accent`…); Tactile reads those tokens and changes only the *material* (surface, type via self-hosted Fraunces/Hanken, shadow, radius, grain). Tactile decoration is suppressed under `colorblind-mode`/`safe-palette-on` (KTD-4). Both axes stack, e.g. `body.flavor-tactile.nautical-mode`.

---

## Known Gotchas

| Gotcha | Detail |
|---|---|
| `file://` blocks OAuth | Use `http://localhost:8080` or deploy to Netlify (HTTPS) |
| New serving origin breaks OAuth | Add to Google Cloud Console → Authorized JS Origins AND Firebase → Authorized Domains |
| Photos Picker 403 | Must include `Authorization: Bearer ${googleToken}` header when downloading images |
| Gemini free tier disabled | Happens when GCP billing is enabled — use an AI Studio key from a billing-free project |
| Gemini model deprecated | Update `GEMINI_MODEL` constant; watch for `404 NOT_FOUND` |
| `generative-language` OAuth scope | Doesn't exist — `invalid_scope`. API key only for Gemini |
| Weather is keyless | Widget uses **Open-Meteo** (forecast/geocode/AQI) + **RainViewer** (radar) + **NWS** (US alerts) — no key, no signup. `loadWeatherByCity()` geocodes then fetches. Note: `netlify/functions/events.js` (event discovery) still uses an OWM key — separate feature |
| Open-Meteo uses WMO codes | Conditions are integer WMO codes, not strings. `wmoToCondition()` maps them to the OWM-style strings (`Clear`/`Rain`/…) the renderer keys on |
| Open-Meteo times are location-local | ISO strings have no zone suffix (`timezone=auto`); use `omEpoch(iso, utc_offset_seconds)` to get a real UTC epoch |
| Touch tap-target CSS leak | Larger button/list padding MUST be inside `@media (hover: none)` |
| SMS popover transparency | Use a solid opaque color — `var(--surface)` is semi-transparent over bg photos |
| SMS popover clipping | `backdrop-filter` on `.card` traps `position: fixed`; append popover to `<body>` then position via `getBoundingClientRect()` |
| Sidebar card compression | `.sidebar > *` must have `flex-shrink: 0` |
| `budgetDatesInRange()` returns strings | Returns `YYYY-MM-DD` strings, not Date objects — don't call Date methods on them |
| Budget pill hidden by default | `#budgetTotalCard` starts `display:none`; `renderBudgetCard()` shows it when items exist |
| Budget uses Firestore | Collection `budget` ordered by `createdAt`; `onSnapshot` keeps `budgetItems[]` live |
| Firestore needs Firebase Auth, attached in order | Production rules gate on `request.auth` (Firebase Auth), which is **separate** from the GIS Google token — the app bridges them via `signInWithCredential` in the OAuth callback (needs **Google enabled in Firebase Console → Authentication → Sign-in method**). `setupListeners()` attaches `onSnapshot` then **re-attaches on `firebase.auth().onAuthStateChanged`** — listeners attached before sign-in get `permission-denied` and never recover, so re-attach is what makes shared state load under auth-required rules. Auth failure is surfaced (status pill + control card); don't move listener setup back to a plain load-time attach. |
| Firestore writes silently fail on denied rules | `.add()`/`.update()` reject with `permission-denied` (denied rules, or `request.auth` null because Firebase Auth didn't sign in). Cached reads still render, so it looks like "add does nothing." `addFamilyMember()` surfaces this via `#familyMemberError`; other write paths still swallow it — wrap new writes in try/catch |
| WOTD cache requires definition | Cache entry rejected if `definition` is empty |
| ICS subs = no-OAuth calendars | Subscribe to public/secret `.ics` URLs (`icsSubs`) — events inject into `calEventCache` like Google ones. `parseIcs`/`expandRecurrence` handle TZID + RRULE/EXDATE; `fetchIcsSub` falls back to the `netlify/functions/ics.js` proxy (Netlify-only). Local dev can't proxy CORS-restricted feeds |
| ICS recurrence is pragmatic | Supports FREQ DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL/COUNT/UNTIL/BYDAY/EXDATE only — no BYMONTHDAY/nth-weekday/RDATE/RECURRENCE-ID. Expanded over a ~2 mo back → 14 mo forward window |
| ICS date keys are local | `injectIcsEvent` keys events by `localDateKey()` (not `toISOString()`) — UTC slicing day-shifts evening events in western zones |
| Nautical mode migration | `localStorage 'fh_mode' === 'amazing'` auto-upgrades to `'nautical'` on load |
| Browser caches JS during dev | Keep DevTools open with "Disable cache" or hard-reload (Cmd+Shift+R) after edits |
| Event Discovery keys | Ticketmaster, OpenWeatherMap, LibraryWeb (per-branch), Red Wings (keyless), CitySpark (keyless) — set via Netlify env vars in production |
| Event Discovery backend | Runs on `/.netlify/functions/events`; geocoding via OWM; exponential backoff retry (2x, 1s→4s) for API failures |
| CitySpark sort parameter | MUST use `sort:'Time'` (soonest-first); `'Date'` returns the tail of future events and fails the 30-day filter |

---

## Adding a Feature — Checklist

1. **State:** `let featureState = lsGet('fh_featureName', default)` near similar features
2. **CSS:** `/* ── Feature Name ── */` section in `family-hub.css`; use existing CSS vars; theme variants if needed
3. **HTML:** card in `.sidebar` or modal in `<body>`
4. **JS:** `// ── Feature Name ──` section in `family-hub.js`
5. **Widget?** add to `WIDGET_DEFAULTS`, `WIDGET_PLACEMENT_DEFAULTS`, `WIDGET_ORDER` — and `MOBILE_TABS` (with a `menu` entry) so it's reachable on phones
6. **Settings?** add a `modal-tab` + `settings-panel`; wire into `openSettings()` (populate) and `saveSettings()` (persist). In `saveSettings()`, persist + `closeSettings()` **before** any re-render that could throw.
7. **Init:** call setup from `window.addEventListener('load', ...)`
8. **Docs:** update `FEATURES.md` (function/state/anchor/key) + `CLAUDE.md` if architecture changed

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

When editing, use `Read` with `offset` + `limit` to read only the relevant section — these files are large.

---

## Verification — prefer DOM/JS inspection over screenshots

When checking that a change worked in the browser, **default to `javascript_tool` (read `el.style.display`, `innerHTML`, computed values, state vars) rather than screenshots.** Screenshots cost ~1,000–1,500 tokens each; a DOM/state read costs a fraction of that. Reserve screenshots for genuinely *visual* questions (does this look right / is it aligned) — not for "did it toggle / render / update."

---

## Project Files

**App:** `family-hub.{html,css,js}` · `manifest.json` · `sw.js` (service worker)

**Documentation:** `FEATURES.md` (detailed feature/reference map) · `family-hub-setup.md` (end-user setup) · `RETROSPECTIVE.md` (lessons learned) · `EASTER_EGGS.md` (phrase cheat sheet — what's currently live) · `CLAUDE.md` (this file)

**Backlogs & Plans:** `WEATHER_BACKLOG.md` · `ASSISTANT_BACKLOG.md` · `MEALS_BACKLOG.md` · `EVENT_DISCOVERY_BACKLOG.md` (optional) · `SCREENSAVER_BACKLOG.md` · `docs/brainstorms/` · `docs/plans/`

**Backend:** `netlify/functions/events.js` (event discovery multi-API aggregation)
