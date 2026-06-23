# Family Hub — Claude Context File

*Loaded on every turn — keep it lean. Deep reference (function/state/anchor inventories, data shapes, API constants) lives in `FEATURES.md`; read that on demand.*

---

## What This Project Is

A family dashboard split across three front-end files + a Netlify serverless back-end.

| Layer | Files | Notes |
|---|---|---|
| Client | `family-hub.html` · `family-hub.css` · `family-hub.js` | CDN scripts only (Firebase 9 compat, GIS) — no client-side build step |
| Functions | `netlify/functions/ai.js` · `weather.js` · `events.js` | Node.js + cheerio; API keys live here as env vars, not in client JS |
| Infra | `netlify.toml` · `netlify-build.js` · `sw.js` · `manifest.json` | Build stamps SW cache version on every deploy |

Serve locally (client only): `python3 -m http.server 8080` → `http://localhost:8080/family-hub.html`  
Full stack locally (with functions): `netlify dev`

Shared state (shopping, todo, budget, meals, chores, familyMembers) → Firebase Firestore.  
Photos → IndexedDB (`fh_bgImages`).  
Everything else → `let` globals + `localStorage` (`fh_*` keys).

---

## Architecture Invariants (don't break these)

- **Client = CDN only.** Front-end may only use libraries via CDN `<script>`/`<link>` tags in `family-hub.html`. No bundler, no `import`. Any new CDN domain must also be added to the CSP in `family-hub.html`.
- **AI calls go through the serverless proxy.** `/.netlify/functions/ai` holds the `GEMINI_KEY` env var server-side. Don't add Gemini API keys to `family-hub.js` directly — use the proxy endpoint. (Exception: meal planning `callMealAI()` still uses the client-side `fh_mealAiKey`.)
- **Full-viewport flex.** `body` is `flex-column 100dvh`. `min-height: 0` is required at every flex level to allow shrinking below content size. `.sidebar > *` must keep `flex-shrink: 0` — or cards compress instead of the sidebar scrolling.
- **Google OAuth = GIS token client** (not code flow). Token is in-memory only (`let googleToken`), never localStorage. `file://` blocks OAuth — must serve from `localhost` or HTTPS. Any new serving origin must be added to Google Cloud Console (Authorized JS Origins) **and** Firebase Console (Authorized Domains). `generative-language` is **not** a valid OAuth scope.
- **Touch tap-target CSS must stay inside `@media (hover: none)`** — larger button/list padding rules must never leak outside that block.
- **Three themes:** `'dark'` (default), `'light'`, `'nautical'`. `applyAppMode()` swaps body classes. Nautical uses `body::before`/`::after` pseudo-elements. TV Mode (`body.tv-mode`) is a separate display overlay, not a fourth theme.

---

## Known Gotchas

| Gotcha | Detail |
|---|---|
| `file://` blocks OAuth | Use `http://localhost:8080` or deploy to Netlify (HTTPS) |
| New serving origin breaks OAuth | Add to Google Cloud Console → Authorized JS Origins AND Firebase → Authorized Domains |
| Photos Picker 403 | Must include `Authorization: Bearer ${googleToken}` header when downloading images |
| Gemini free tier disabled | Happens when GCP billing is enabled — use an AI Studio key from a billing-free project |
| Gemini model deprecated | Update `GEMINI_MODEL` in `family-hub.js` AND `DEFAULT_MODEL` in `netlify/functions/ai.js`; watch for `404 NOT_FOUND` |
| `generative-language` OAuth scope | Doesn't exist — `invalid_scope`. API key only for Gemini |
| OWM keys take 2 hours | New OpenWeatherMap keys need up to 2h to activate |
| Touch tap-target CSS leak | Larger button/list padding MUST be inside `@media (hover: none)` |
| SMS popover transparency | Use a solid opaque color — `var(--surface)` is semi-transparent over bg photos |
| SMS popover clipping | `backdrop-filter` on `.card` traps `position: fixed`; append popover to `<body>` then position via `getBoundingClientRect()` |
| Sidebar card compression | `.sidebar > *` must have `flex-shrink: 0` |
| Weather `fcast.list` may be null | Use `fcast.list \|\| []` — some API error responses omit it |
| `budgetDatesInRange()` returns strings | Returns `YYYY-MM-DD` strings, not Date objects — don't call Date methods on them |
| Budget pill hidden by default | `#budgetTotalCard` starts `display:none`; `renderBudgetCard()` shows it when items exist |
| WOTD cache requires definition | Cache entry rejected if `definition` is empty |
| Nautical mode migration | `localStorage 'fh_mode' === 'amazing'` auto-upgrades to `'nautical'` on load |
| Service worker stale files in dev | SW caches the app shell aggressively. In DevTools: Application → Service Workers → "Update on reload". Hard-reload (Cmd+Shift+R) also works. `netlify-build.js` auto-bumps the cache version on every Netlify deploy. |
| Netlify function env vars | `GEMINI_KEY` (and any OWM key) live in Netlify → Site settings → Environment Variables. For local `netlify dev`, put them in a `.env` file at the project root (not committed). |
| `callMealAI()` bypasses the proxy | Meal planning calls Gemini directly using the client-side `fh_mealAiKey`. The `/.netlify/functions/ai` proxy is used only by the Family Assistant. |
| Browser caches JS during dev | Keep DevTools open with "Disable cache" or hard-reload (Cmd+Shift+R) after edits |

---

## Adding a Feature — Checklist

1. **State:** `let featureState = lsGet('fh_featureName', default)` near similar features
2. **CSS:** `/* ── Feature Name ── */` section in `family-hub.css`; use existing CSS vars; theme variants if needed
3. **HTML:** card in `.sidebar` or modal in `<body>`
4. **JS:** `// ── Feature Name ──` section in `family-hub.js`
5. **Widget?** add to `WIDGET_DEFAULTS`, `WIDGET_PLACEMENT_DEFAULTS`, `WIDGET_ORDER`
6. **Settings?** add a `modal-tab` + `settings-panel`; wire into `openSettings()` (populate) and `saveSettings()` (persist). In `saveSettings()`, persist + `closeSettings()` **before** any re-render that could throw.
7. **Init:** call setup from `window.addEventListener('load', ...)`
8. **Netlify function needed?** add `netlify/functions/featureName.js` + fetch to `/.netlify/functions/featureName` from client. Put any API keys in env vars, not in client JS.
9. **Docs:** update `FEATURES.md` (function/state/anchor/key) + `CLAUDE.md` if architecture changed

---

## How to Find Things Quickly

```bash
grep -n "function functionName" family-hub.js        # JS function
grep -n "id=\"elementId\""       family-hub.html     # HTML element
grep -n "\.class-name"           family-hub.css       # CSS class
grep -n "fh_keyName"             family-hub.js        # localStorage key
grep -n "^// ──"                 family-hub.js        # JS section boundary
grep -n "^/\* ──"                family-hub.css       # CSS section boundary
grep -n "exports.handler"        netlify/functions/*.js  # Netlify function entry points
```

When editing, use `Read` with `offset` + `limit` to read only the relevant section — these files are large.

---

## Verification — prefer DOM/JS inspection over screenshots

When checking that a change worked in the browser, **default to `javascript_tool` (read `el.style.display`, `innerHTML`, computed values, state vars) rather than screenshots.** Screenshots cost ~1,000–1,500 tokens each; a DOM/state read costs a fraction of that. Reserve screenshots for genuinely *visual* questions (does this look right / is it aligned) — not for "did it toggle / render / update."

---

## Project Files

**Client:** `family-hub.{html,css,js}` · `sw.js` (service worker) · `manifest.json` · `favicon.svg`  
**Backend:** `netlify/functions/{ai,weather,events}.js` · `netlify.toml` · `netlify-build.js`  
**Docs:** `FEATURES.md` (full reference) · `CLAUDE.md` (this file) · `family-hub-setup.md` (end-user setup) · `RETROSPECTIVE.md` · `WEATHER_BACKLOG.md` · `ASSISTANT_BACKLOG.md` · `MEALS_BACKLOG.md` · `EASTEREGGS_BACKLOG.md` · `BACKLOG.md`
