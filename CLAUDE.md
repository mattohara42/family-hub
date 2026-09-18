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
- **`pond/` is vendored, not ours to edit.** The Pond Chimes screensaver mode is a **git subtree** of `mattohara42/pond-chimes`, kept byte-identical so upstream work comes back with `git subtree pull --prefix=pond https://github.com/mattohara42/pond-chimes main --squash`. It runs in a same-origin iframe; anything the hub needs from it (audio, hiding its title card) is reached in from `family-hub.js` — never by editing files under `pond/`. Framing it requires CSP `frame-src 'self'` **and** `X-Frame-Options = "SAMEORIGIN"` in `netlify.toml`. (FEATURES.md §19)
- **Full-viewport flex.** `body` is `flex-column 100dvh`. `min-height: 0` is required at every flex level to allow shrinking below content size. `.sidebar > *` must keep `flex-shrink: 0` — or cards compress instead of the sidebar scrolling.
- **Google OAuth = GIS token client** (not code flow). Token is in-memory only (`let googleToken`), never localStorage. `file://` blocks OAuth — must serve from `localhost` or HTTPS. Any new serving origin must be added to Google Cloud Console (Authorized JS Origins) **and** Firebase Console (Authorized Domains). `generative-language` is **not** a valid OAuth scope.
- **Touch tap-target CSS must stay inside `@media (hover: none)`** — larger button/list padding rules must never leak outside that block.
- **Mobile has no bottom nav — Calendar is the permanent surface.** Under 640px the `.sidebar` is unconditionally hidden; nothing in it besides Shopping/To-Do/Home Assistant/Assistant is mobile-reachable (same as before this redesign — Budget, Chores, Word of the Day, etc. have never had mobile UI). One floating button replaces the old tab bar — `#mobileAddFab` (`openEventEditor(null)`, quick-add defaulting to today) — and the Lists sheet opens from the 🏠 app icon (`.cal-app-emoji`) in the header instead of its own floating button; that icon is a real `<button onclick="openMobileLists()">` now (was a decorative `<em>`), reset to its old borderless look on desktop and given a visible border/background under 640px so it reads as tappable. `openMobileLists()` no-ops when `!isMobile`, since the sheet's CSS only exists under that query. The icon still carries the existing 7-tap fireworks Easter egg (`setupEmojiFireworks()`) — unrelated, don't conflate the two handlers. The sheet holds Shopping/To-Do/Home Assistant/Assistant as sections — `MOBILE_SHEET_SECTIONS` in `family-hub.js` maps each widget key to its section wrapper id, and `applyWidgetPlacement()` reparents the real card into it when `isMobile` (no duplicated markup); `setMobileListsSection()` toggles which one shows, not persisted (always opens on Shopping). The Home Assistant and Assistant tabs are each hidden unless their widget is toggled on (`applyWidgetVisibility()`), bouncing back to Shopping if the open section gets disabled out from under it. Settings and Find Events (💡) live in the sheet's footer instead of their own chrome. Widget *placement* ('bottom') is still desktop-only; the screensaver never runs under 640px. The view toggle collapses to Month/Day/Agenda (Week stays desktop-only) and the prev/next arrows are hidden — both redundant with `setupCalSwipe()`. Preferences itself is filtered on mobile too: `SETTINGS_GROUPS` items can carry `desktopOnly: true` (screensaver, Mowing, Widget Layout, Weather, Feeds, Chores — each either a desktop-only concept or a widget with no mobile surface), and `renderSettingsNav()` drops those under `isMobile`. Assistant's settings tab is *not* desktopOnly — its Gemini API key needs setting from a phone too, same reasoning as Home Assistant's token. The mobile type scale (`--text-*` tokens, plus a `#settingsModal` text/line-height bump) is intentionally larger than desktop's — sized for a wall panel read from a few feet away, not a phone in the hand.
- **Day/Agenda typography is token-driven, not ad hoc.** `--fs-title`/`--fs-item`/`--fs-meta` (family-hub.css `:root`) are semantic aliases into the `--text-*` ladder — use them for new Day/Agenda markup instead of a literal `font-size`. Currency and clock-time text gets `font-variant-numeric: tabular-nums`. Fraunces (the serif `--font-display`) only ever renders under `body.flavor-tactile h1/h2/.cal-app-title/.card-header h2` and a few Tactile-scoped "prominent numeral" classes (`.budget-day-amt`, `.wx-temp`, `.countdown-days`, …) — if serif shows up outside Tactile flavor, that's a new scoping bug, not expected behavior.
- **Agenda event fills are a stable hash, not per-render random.** `agendaPastelClass(title)` (family-hub.js) hashes the event title to one of 6 fixed `--agenda-pastel-1..6` tokens (dark-theme dusty tones in `:root`, true pastels under `body.light-mode`) — same title always gets the same swatch, across reloads and across different events. The calendar's real color stays on `border-left`, set inline per event since it's dynamic.
- **Themes (color axis):** `'auto'` (true default — follows the device's `prefers-color-scheme`, resolving to `'light'`/`'dark'` via `resolveAppMode()`), plus manual `'light'`, `'dark'`, `'nautical'`, `'aurora'`, `'colorblind'`. `applyAppMode()` swaps body classes off the *resolved* mode (dark = no class) while `appMode` itself keeps `'auto'` as the logical value; a `prefers-color-scheme` `change` listener reapplies whenever `appMode === 'auto'`. Nautical/aurora use `body::before`/`::after` pseudo-elements.
- **Flavor (design-system axis), orthogonal to theme:** `'basic'` (default, flat-glass — absence of class) and `'tactile'` (lush/hand-made material). `applyFlavor()` toggles `body.flavor-tactile`; persisted in `fh_flavor`. Themes set color tokens (`--surface-solid/-hi/-lo`, `--ink`, `--line`, `--accent`…); Tactile reads those tokens and changes only the *material* (surface, type via self-hosted Fraunces/Hanken, shadow, radius, grain). Tactile decoration is suppressed under `colorblind-mode`/`safe-palette-on` (KTD-4). Both axes stack, e.g. `body.flavor-tactile.nautical-mode`.

---

## Known Gotchas

| Gotcha | Detail |
|---|---|
| `file://` blocks OAuth | Use `http://localhost:8080` or deploy to Netlify (HTTPS) |
| GIS token expires (~1h) | Access token is in-memory and short-lived; on an all-day wall display it silently lapses, so a later calendar write 401s and reads as a hang/"timeout." `tokenExpiresAt` tracks TTL from `resp.expires_in`; `scheduleTokenRefresh()` does a silent `prompt:''` refresh ~5 min early; `ensureFreshToken()` awaits a valid token and `calFetch()` wraps Google API writes (refresh-first, one 401 retry, 20s AbortController timeout). Route new calendar writes through `calFetch`, not raw `fetch` + `Bearer ${googleToken}` |
| New serving origin breaks OAuth | Add to Google Cloud Console → Authorized JS Origins AND Firebase → Authorized Domains |
| Photos Picker 403 | Must include `Authorization: Bearer ${googleToken}` header when downloading images |
| Pond screensaver taps don't reach the hub | Pointer events inside the `#saverPond` iframe never hit the hub's `window` listeners, so wake is wired into the iframe document by `wireSaverPondWake()`. In `'play'` mode that's a keypress or the `#saverWakeBtn` corner button only — waking on `pointermove` would make the pond unplayable with a mouse |
| Pond audio needs the parent | The pond only calls `initAudio()` on its own tap, so as a screensaver it would be silent; `applySaverPondSound()` starts and mutes it from the hub via the same-origin `contentWindow`. Autoplay inheritance is unverified on the real panel — worst case it stays silent until tapped |
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
| Recipe import needs Netlify functions | `netlify/functions/recipe.js` does the cross-origin fetch + `schema.org/Recipe` JSON-LD parse — browsers can't fetch recipe pages directly. Under plain `python3 -m http.server` the function doesn't exist; `importRecipeFromUrl()` detects that and says to run `netlify dev` (:8888) rather than blaming the recipe. Recipe sites 403 bot User-Agents, so the function sends a browser-like UA |
| NYT JSON-LD is undocumented behavior | NYT Cooking serves the full Recipe JSON-LD unauthenticated even at `isAccessibleForFree: false` — the paywall gates the *render*, not the metadata (probe 2026-07-06). **Not a contract.** If it's gated, the function returns `422 no-recipe` and the UI falls back to "Type It In" — that's the designed failure, don't "fix" it by scraping the rendered page. There is **no API for a user's saved NYT Recipe Box**; only individual recipe URLs work |
| Firestore rejects `undefined` fields | A parsed recipe has sparse optional fields, so recipe writes go through `recipeExtras()` (drops empty/undefined) instead of spreading raw parsed data into `.add()`. Same trap for any new sparse-record write |
| WOTD cache requires definition | Cache entry rejected if `definition` is empty |
| ICS subs = no-OAuth calendars | Subscribe to public/secret `.ics` URLs (`icsSubs`) — events inject into `calEventCache` like Google ones, but carry `readOnly: true`: their `eventId` is the publisher's UID and their `calId` is a subscription, so gate every new **edit** affordance on `isEventEditable(ev)` (as drag and `findCalEvent()` do) or it will PATCH/DELETE a Google URL that cannot exist. Clicks all go through `onCalEventClick(ev)`, which sends ours to the editor and everything read-only to `#eventDetailsModal` (§Event Details). `parseIcs`/`expandRecurrence` handle TZID + RRULE/EXDATE; `fetchIcsSub` falls back to the `netlify/functions/ics.js` proxy (Netlify-only). Local dev can't proxy CORS-restricted feeds |
| ICS recurrence is pragmatic | Supports FREQ DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL/COUNT/UNTIL/BYDAY/EXDATE only — no BYMONTHDAY/nth-weekday/RDATE/RECURRENCE-ID. Expanded over a ~2 mo back → 14 mo forward window |
| ICS date keys are local | `injectIcsEvent` keys events by `localDateKey()` (not `toISOString()`) — UTC slicing day-shifts evening events in western zones |
| Nautical mode migration | `localStorage 'fh_mode' === 'amazing'` auto-upgrades to `'nautical'` on load |
| Browser caches JS during dev | Keep DevTools open with "Disable cache" or hard-reload (Cmd+Shift+R) after edits |
| Event Discovery keys | Ticketmaster, OpenWeatherMap, LibraryWeb (per-branch), Red Wings (keyless), CitySpark (keyless), Fairport Festivals (no network at all), Town of Pittsford (keyless page scrape) — set via Netlify env vars in production |
| Fairport Festivals source is curated | `FAIRPORT_SCHEDULE`/`FAIRPORT_WEEKLY` in `netlify/functions/events.js` are the village's published season typed out by hand (2026 today) from the FairportFestivals.com poster; no feed from that site has been confirmed. Re-type it from the new poster each spring; stale years return nothing rather than wrong dates |
| Pittsford calendar is scraped | No feed exists — `fetchPittsford()` pulls the whole event list out of the Drupal `drupal-settings-json` blob on `/calendar`. Board meetings/closures are filtered out; their event tagging is unreliable so don't filter boards by taxonomy colour |
| "Town Events" tab = two sources | Fairport (curated table) and Pittsford (scrape) both emit `source: 'towns'` and share one tab, told apart by `location.address`. `sourceStatus` still tracks them separately so a broken scrape is visible in `sourceStats` |
| Event Discovery backend | Runs on `/.netlify/functions/events`; geocoding via OWM; exponential backoff retry (2x, 1s→4s) for API failures |
| CitySpark sort parameter | MUST use `sort:'Time'` (soonest-first); `'Date'` returns the tail of future events and fails the 30-day filter |
| HTTPS page can't call a LAN box | The hub is served over HTTPS, so `http://homeassistant.local:8123` is blocked three ways over (mixed content, our `connect-src`, HA's CORS). Home Assistant is reached at its Tailscale `https://….ts.net` name, which the blanket `https:` in the CSP already allows. `http://localhost:8123` is in `connect-src` for `tests/ha-mock.js` only |
| HA CORS failure looks like a dead host | A CORS rejection reaches JS as a bare `TypeError`, identical to "the host is down". `haFetch()`'s `unreachable` message names both causes deliberately; don't "simplify" it to one |
| HA token is per-device on purpose | `fh_haToken` is excluded from the Firestore settings sync (`haConfig` is synced, the token isn't). A long-lived HA token controls every entity its user can see, so per-device means individually revocable. Don't add it to the sync list |
| HA service calls aren't instant | Z-Wave/Zigbee devices take seconds to report a new state. `haRecheckEntity()` re-reads at 1s and 4s before handing back to the 120s poll — a single immediate re-read reports working devices as failures |
| Mobile SpeechRecognition is best-effort | The Assistant mic (`initAssistantVoice()`) feature-detects `SpeechRecognition`/`webkitSpeechRecognition` and hides the button when absent — reliable on Android Chrome, but iOS Safari's implementation (also used by every browser on iOS, since they're all WebKit under the hood) has a history of interim-results and permission-API quirks Apple doesn't fully document. `showMicDeniedHelp()` branches on `isIOSDevice()` for the right permission path (iOS has no in-page address-bar 🔒 icon — it's Settings → Safari → Microphone) but the deeper behavioral quirks are unverified on a real device; treat iOS voice input as needing real-device follow-up, not a closed loop |

---

## Adding a Feature — Checklist

1. **State:** `let featureState = lsGet('fh_featureName', default)` near similar features
2. **CSS:** `/* ── Feature Name ── */` section in `family-hub.css`; use existing CSS vars; theme variants if needed
3. **HTML:** card in `.sidebar` or modal in `<body>`
4. **JS:** `// ── Feature Name ──` section in `family-hub.js`
5. **Widget?** add to `WIDGET_DEFAULTS`, `WIDGET_PLACEMENT_DEFAULTS`, `WIDGET_ORDER`. Most widgets have no mobile surface at all (Settings-only, like Budget/Chores/Word of the Day); if this one genuinely needs day-to-day phone use, add it to `MOBILE_SHEET_SECTIONS` and give it a tab in the Lists sheet markup (§20) instead of inventing new mobile chrome
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

**App:** `family-hub.{html,css,js}` · `manifest.json` · `sw.js` (service worker) · `pond/` (vendored Pond Chimes subtree — screensaver mode)

**Documentation:** `FEATURES.md` (detailed feature/reference map) · `family-hub-setup.md` (end-user setup) · `RETROSPECTIVE.md` (lessons learned) · `EASTER_EGGS.md` (phrase cheat sheet — what's currently live) · `CLAUDE.md` (this file)

**Backlogs & Plans:** `WEATHER_BACKLOG.md` · `ASSISTANT_BACKLOG.md` · `MEALS_BACKLOG.md` · `EVENT_DISCOVERY_BACKLOG.md` (optional) · `SCREENSAVER_BACKLOG.md` · `docs/brainstorms/` · `docs/plans/`

**Backend:** `netlify/functions/events.js` (event discovery multi-API aggregation)

**Dev tools:** `tests/ha-mock.js` (fake Home Assistant on :8123, so the smart-home card is testable with no Pi in the room)
