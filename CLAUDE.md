# Family Hub — Claude Context File

*Read this at the start of every session. Update it when architecture changes.*

---

## What This Project Is

A three-file family dashboard.
Served via Netlify (production) or locally via `python3 -m http.server 8080` → `http://localhost:8080/family-hub.html`

There is no build step, no npm, no framework. CDN scripts only.

| File | Contents | Lines (approx) |
|---|---|---|
| `family-hub.html` | HTML structure + CDN script tags | ~590 |
| `family-hub.css`  | All CSS (vars, layout, components, themes) | ~1,400 |
| `family-hub.js`   | All JavaScript logic + config block | ~3,200 |

**All three files must be in the same directory** — `family-hub.html` loads the other two as siblings.

---

## Critical File Layout

```
family-hub.html   (HTML only — no inline CSS or JS)
├── <head>
│   ├── CDN scripts  (Firebase, Google GIS/API)
│   └── <link rel="stylesheet" href="family-hub.css">
├── <body>
│   ├── #bgPhoto, #configBanner
│   ├── .layout
│   │   ├── .cal-column
│   │   │   ├── .cal-card  (#calGrid / #weekView / #dayView)
│   │   │   ├── #yearStrip  (bottom-mode year widget — stays here always)
│   │   │   └── #bottomStrip  (widgets placed at "bottom")
│   │   └── .sidebar
│   │       ├── #controlCard  (user info, sign-in/out, ⚙️)
│   │       ├── #budgetTotalCard  (context-sensitive bill total pill)
│   │       ├── #calendarCard  (per-calendar toggle checkboxes)
│   │       ├── Weather card
│   │       └── Widget cards (shopping, todo, budget, yearCard, wotd, dadjoke, quote)
│   └── Modals  (#settingsModal, #budgetModal, #mealModal, #eventEditorModal)
└── <script src="family-hub.js">

family-hub.css    (stylesheet)
├── :root                  CSS variables (dark defaults)
├── body.nautical-mode     Nautical theme overrides + decorative elements
├── body.light-mode        Light theme overrides
├── Layout                 (.layout, .cal-column, .sidebar, #bottomStrip)
├── Calendar               (.cal-grid, .week-*, .day-*, .cal-event-*, .cal-dow)
├── Calendar card header   (.cal-card-header 3-zone grid)
├── Sidebar cards          (.card, #controlCard, #budgetTotalCard, #calendarCard)
├── Weather                (.wx-*, .wx-loc-nav, .wx-loc-dot)
├── List widgets           (.list-items, .list-item, shopping, todo)
├── Meal Planning          (.week-meals-strip, .day-meals-*, .meal-*)
├── Budget                 (.budget-*, .cal-event-budget)
├── Year at a Glance       (.mini-grid, .mini-cal-*, #yearCard, #yearStrip)
├── Event Editor           (.evt-editor-*, .btn-danger)
├── SMS popover            (.sms-*)
├── Settings modal         (.modal-*, .settings-panel, .widget-toggle-row)
└── Touch / responsive     (@media hover:none tap targets, @media breakpoints)

family-hub.js     (all logic)
├── ── CONFIGURATION BLOCK (top) ──
│   FIREBASE_CONFIG, GOOGLE_CLIENT_ID, WEATHER_*, pinned API constants
├── ── STATE VARIABLES ──
├── ── FIREBASE INIT ──
├── ── GOOGLE AUTH ──
├── ── WIDGET PLACEMENT ──     applyWidgetPlacement, applyWidgetVisibility
├── ── CALENDAR ──             switchCalView, render*Grid, makeDayCell, loadAllCalendars
├── ── CALENDAR TABS ──        renderCalendarTabs
├── ── CALENDAR EVENT EDITOR── openEventEditor, saveCalEvent, deleteCalEvent
├── ── BUDGET ──               renderBudgetCard (context-sensitive), budgetDatesInRange
├── ── WEATHER ──              showWeatherLocation, loadWeatherByCity, renderWeatherData
│                              prevWeatherLocation, nextWeatherLocation, renderWeatherNav
│                              addWeatherLocation, removeWeatherLocation
├── ── PHOTOS ──               openPhotosPicker, loadBgFromDb, startSlideshow
├── ── SHOPPING ──             addShop, toggleShop, clearDoneShopping, clearAllShopping
├── ── TODO ──                 addTodo, renderTodoList, clearDoneTodo, clearAllTodo
├── ── SETTINGS ──             openSettings, saveSettings, switchSettingsTab
├── ── APPEARANCE ──           applyAppMode, setAppMode
├── ── YEAR STRIP ──           renderYearStrip, changeStripMonth (bottom mode)
├── ── YEAR CARD ──            renderYearCard, changeYearCardMonth (sidebar mode)
├── ── MEAL PLANNING ──        openMealModal, generateMealSuggestions, callMealAI
├── ── WORD OF DAY ──          loadWotd, renderWotd, WOTD_FALLBACKS
├── ── DAD JOKE ──             loadDadJoke, renderDadJoke
└── window.addEventListener('load', ...) — app init
```

---

## Configuration Block (top of `family-hub.js`)

```js
const FIREBASE_CONFIG = { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
const GOOGLE_CLIENT_ID = "...apps.googleusercontent.com";
const WEATHER_API_KEY  = "...";   // also settable via ⚙️ Settings
const WEATHER_CITY     = "...";   // legacy; multi-location now uses fh_wlocations array

// Pinned API versions — update date comment when changing
const GEMINI_MODEL     = 'gemini-2.5-flash';       // pinned 2026-05-31
const GEMINI_API_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_MODEL     = 'gpt-4o-mini';             // pinned 2026-05-31
const OPENAI_API_BASE  = 'https://api.openai.com/v1';
const OWM_API_BASE     = 'https://api.openweathermap.org/data/2.5';
const DICT_API_BASE    = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const DADJOKE_API_BASE = 'https://icanhazdadjoke.com';
```

---

## Key Architectural Decisions

### Three-file, no build tooling
HTML, CSS, and JS are split across three files in the same directory. No npm, no webpack, no framework. CDN scripts only:
- Firebase 9 compat SDK
- Google Identity Services (GIS)

### Full-viewport stretch
```
body  (flex-column, height: 100dvh, overflow: hidden)
  #configBanner  (flex-shrink: 0)
  .layout  (flex: 1, grid 1fr 300px, align-items: stretch)
    .cal-column  (flex-column, min-height: 0)
      .cal-card  (flex: 1 → fills remaining space)
      #yearStrip  (natural height, always stays in .cal-column)
      #bottomStrip  (natural height, CSS grid auto-fit)
    .sidebar  (overflow-y: auto, min-height: 0)
      .sidebar > *  { flex-shrink: 0 }  ← critical: cards don't compress; sidebar scrolls
```
`min-height: 0` is required at every flex level to allow shrinking below content size.

### Google OAuth
- Uses GIS **token client** (not code flow)
- Token stored in `let googleToken = ''` (in-memory only, not localStorage)
- Scopes: `calendar.events`, `calendar.readonly`, `userinfo.profile`, `userinfo.email`, `photospicker.mediaitems.readonly`
- ⚠️ `generative-language` is NOT a valid OAuth scope — do not attempt it
- ⚠️ Must serve from `http://localhost:*` or an HTTPS origin — `file://` blocks OAuth popups
- ⚠️ Any new serving origin (e.g. a Netlify domain) must be added to **Authorized JavaScript Origins** in Google Cloud Console and to **Authorized Domains** in Firebase Console

### Calendar event cache
```js
calEventCache = {
  calId: {
    'YYYY-MM-DD': [{ eventId, calId, summary, description, color, holiday, allDay, startDT, endDT, startDate, endDate }]
  }
}
```
All three views read from this cache. `disabledCals` (Set) holds calIDs the user toggled off.

### Widget placement system
`WIDGET_ORDER` defines canonical order. `applyWidgetPlacement()` uses `appendChild` to move DOM nodes between `.sidebar` and `#bottomStrip` in order. `#yearStrip` is **never** moved — only `#yearCard` moves. When yearstrip placement is `'bottom'`, `#yearStrip` (6-month) renders; when `'sidebar'`, `#yearCard` (2-month) renders.

### Multi-location weather
`weatherLocations[]` holds city strings. `weatherCache{}` caches fetched data per city (30-minute TTL). `showWeatherLocation(idx)` checks cache before fetching. Nav arrows + dot indicators appear when >1 location. Settings has an add/remove list. `fh_wcity` (legacy single city) is kept in sync with `fh_wlocations[0]`.

### Budget rendering
`renderBudgetCard()` is context-sensitive — reads `calView` + `calViewDate` to compute the relevant range and label. Called from `renderCurrentView()`. `#budgetTotalCard` (sidebar pill, red left border) shows month/week totals; hidden on day view and when no items fall in range.

### Appearance themes
Three modes: `'dark'` (default), `'light'`, `'nautical'`. `applyAppMode(mode)` removes all mode classes then adds the correct one. Nautical mode uses `body::before` (⚓ watermark, 22% opacity) and `body::after` (animated wave) CSS pseudo-elements. Touch tap-target rules are wrapped in `@media (hover: none)` — they must **never** leak outside that block.

### Meal plan storage
```js
mealPlan['YYYY-MM-DD'] = {
  breakfast: { name, description, cuisine, prepTime, healthyNotes, recipeSite, recipeSearchQuery, recipeUrl, ingredients[] },
  lunch: { ... },
  dinner: { ... }
}
```

### Photos
- Downloaded from Google Photos Picker with `Authorization: Bearer ${googleToken}` header (required — 403 without it)
- Stored as blobs in IndexedDB (`fh_bgImages`)
- Picker sessions expire; user must re-open picker to refresh

---

## Known Gotchas

| Gotcha | Detail |
|---|---|
| `file://` blocks OAuth | Always use `http://localhost:8080` or deploy to Netlify (HTTPS) |
| New serving origin breaks OAuth | Add origin to Google Cloud Console → OAuth Client → Authorized JavaScript Origins AND Firebase Console → Authentication → Authorized Domains |
| Photos Picker 403 | Must include `Authorization: Bearer` header when downloading images |
| Gemini free tier disabled | Happens when GCP billing is enabled — use AI Studio key from a billing-free project |
| Gemini model deprecated | Update `GEMINI_MODEL` constant; check for `404 NOT_FOUND` error |
| `generative-language` OAuth scope | Does not exist — `invalid_scope` error. API key only for Gemini. |
| OWM keys take 2 hours | New OpenWeatherMap keys need up to 2 hours to activate |
| Touch tap-target CSS leak | Larger button/list padding rules MUST be inside `@media (hover: none)` |
| SMS popover transparency | Must use a solid opaque color — `var(--surface)` is semi-transparent over background photos |
| Sidebar card compression | `.sidebar > *` must have `flex-shrink: 0` or cards compress instead of the sidebar scrolling |
| Weather `fcast.list` may be null | Use `fcast.list \|\| []` — some API error responses omit the field |
| Budget pill hidden by default | `#budgetTotalCard` starts `display:none`; `renderBudgetCard()` shows it when items exist |
| Budget uses Firestore | Collection `budget` ordered by `createdAt`; `onSnapshot` keeps `budgetItems[]` live |
| WOTD cache requires definition | Cache entry rejected if `definition` is empty — prevents blank cards from being served from cache |
| Nautical mode migration | `localStorage 'fh_mode' === 'amazing'` is auto-upgraded to `'nautical'` on load |

---

## Settings Modal Pattern

Each settings tab follows this structure:

**HTML:**
```html
<button class="modal-tab" data-tab="X" onclick="switchSettingsTab('X')">Label</button>
...
<div class="settings-panel" data-panel="X"> ... </div>
```

**JS — to add content when opening:**
Add to `openSettings()` function.

**JS — to save:**
Add to `saveSettings()` function.

---

## Adding a New Feature — Checklist

1. **State:** Add `let featureState = ...` near similar features in the state block
2. **localStorage key:** Use `fh_featureName` pattern; add to `FEATURES.md` key index
3. **CSS:** Add a `/* ── Feature Name ── */` section in `family-hub.css`; use existing CSS vars
4. **HTML:** Add card to `.sidebar` or modal to `<body>` in `family-hub.html`
5. **JS:** Add `// ── Feature Name ──` section comment in `family-hub.js`
6. **Widget:** If it's a sidebar widget, add to `WIDGET_DEFAULTS`, `WIDGET_PLACEMENT_DEFAULTS`, and `WIDGET_ORDER`
7. **Settings tab:** Add `modal-tab` button + `settings-panel` div; wire into `openSettings()` and `saveSettings()`
8. **Init:** Call any setup function from `window.addEventListener('load', ...)`
9. **Docs:** Update `FEATURES.md`, `CLAUDE.md`, `family-hub-setup.md`, `RETROSPECTIVE.md`

---

## Files in This Project

| File | Purpose |
|---|---|
| `family-hub.html` | HTML structure only — no inline CSS or JS |
| `family-hub.css`  | All styles — edit this to change appearance |
| `family-hub.js`   | All logic + configuration block at top |
| `family-hub-setup.md` | End-user setup guide (accounts, API keys, steps) |
| `FEATURES.md` | Feature map — functions, state, HTML anchors, localStorage keys |
| `CLAUDE.md` | This file — Claude session context |
| `RETROSPECTIVE.md` | What worked, what didn't, lessons learned |

---

## How to Find Things Quickly

```bash
# Find a JS function
grep -n "function functionName" family-hub.js

# Find an HTML element
grep -n "id=\"elementId\"" family-hub.html

# Find a CSS class
grep -n "\.class-name" family-hub.css

# Find a localStorage key
grep -n "fh_keyName" family-hub.js

# Find a JS section boundary
grep -n "^// ──" family-hub.js

# Find a CSS section boundary
grep -n "^/\* ──" family-hub.css
```

When editing, use `Read` with `offset` + `limit` to read only the relevant section.
