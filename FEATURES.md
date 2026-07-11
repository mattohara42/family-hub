# Family Hub — Feature Map

*Last updated: 2026-06-21*

A living reference of every feature, its key functions, state variables, localStorage keys, and HTML anchor points. Update this file whenever a feature is added or significantly changed.

---

## Architecture

- **Three files:** `family-hub.html` (structure), `family-hub.css` (all styles), `family-hub.js` (all logic)
- **Served via:** Netlify (production) or `python3 -m http.server 8080` → `http://localhost:8080/family-hub.html` (local dev)
- **Config block:** Top of `family-hub.js` — `FIREBASE_CONFIG`, `GOOGLE_CLIENT_ID`, pinned API constants
- **State:** Mix of `let` globals + `localStorage` + IndexedDB (photos only)
- **Shared state:** Firebase Firestore (shopping list, to-do list, budget, meal plan, family members, chores)
- **Theming:** CSS custom properties on `:root` — `--text`, `--surface`, `--surface2`, `--accent`, `--accent2`, `--muted`, `--card-bg-photo`, `--scrim`, etc.
- **Layout:** CSS Grid (`.layout` = `1fr 300px`) — `.cal-column` left, `.sidebar` right
- **Full-viewport stretch:** `body` is `flex-column 100dvh`; `.layout` fills remaining space; `.cal-card` grows to fill `.cal-column`; `.sidebar` scrolls with `overflow-y: auto`
- **Responsive breakpoints:** 1100px, 860px, 640px, 400px

---

## File Layout Maps

*Detailed structure of each of the three files. (Moved here from CLAUDE.md to keep that file lean.)*

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
│   │       ├── #controlCard  (collapsible: status pill, sign-in/out, ⚙️, per-cal toggles)
│   │       ├── #budgetTotalCard  (context-sensitive bill total pill)
│   │       ├── Weather card  (#weatherCard, includes #wxSunArc)
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
├── Sidebar cards          (.card, #controlCard, #budgetTotalCard)
├── Weather                (.wx-*, .wx-sun-*, .wx-loc-nav, .wx-loc-dot)
├── List widgets           (.list-items, .list-item, shopping, todo)
├── Meal Planning          (.week-meals-strip, .day-meals-*, .meal-*)
├── Budget                 (.budget-*, .cal-event-budget)
├── Year at a Glance       (.mini-grid, .mini-cal-*, #yearCard, #yearStrip)
├── Event Editor           (.evt-editor-*, .btn-danger)
├── SMS popover            (.sms-*)
├── Settings modal         (.modal-*, .settings-panel, .widget-toggle-row)
├── Chore Chart            (.chore-*, .chore-members-row, #bottomStrip #choreCard grid layout)
├── TV mode                (body.tv-mode overrides, .tv-cursor-hidden)
├── Easter egg animations  (@keyframes hadouken, .hadouken-ball, @keyframes choreRedeemPulse)
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
├── ── LOCAL CALENDARS ──      injectLocalEvents, lcAddBirthday/Medication/etc. (LC_IDS, LC_DEFS)
├── ── BUDGET ──               renderBudgetCard (context-sensitive), budgetDatesInRange
├── ── WEATHER ──              showWeatherLocation, loadWeatherByCity, renderWeatherData,
│                              renderSunArc, renderWeatherTicker, prev/nextWeatherLocation,
│                              add/removeWeatherLocation
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
├── ── CHORE CHART ──          renderChoreCard, addChore, deleteChore, toggleChore, redeemChoreReward, renderChoreRewardList
├── ── EASTER EGGS ──          EASTER_EGG_FRANCHISES, checkAssistantEasterEgg, checkCalendarEasterEggs, buildVogonPoetry, triggerHadouken, handleSettingsGearClick, renderEggFranchiseChips
└── window.addEventListener('load', ...) — app init
```

**Key data shapes:**
```js
// All three calendar views read from this; disabledCals (Set) holds toggled-off calIDs
calEventCache = { calId: { 'YYYY-MM-DD': [{ eventId, calId, summary, description,
                  color, holiday, allDay, startDT, endDT, startDate, endDate }] } }

mealPlan['YYYY-MM-DD'] = { breakfast: { name, description, cuisine, prepTime,
                  healthyNotes, recipeSite, recipeSearchQuery, recipeUrl, ingredients[] },
                  lunch: {...}, dinner: {...} }
```

---

## Pinned API Constants (top of `family-hub.js`)

```js
const GEMINI_MODEL     = 'gemini-2.5-flash';      // pinned 2026-05-31
const GEMINI_API_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_MODEL     = 'gpt-4o-mini';            // pinned 2026-05-31
const OPENAI_API_BASE  = 'https://api.openai.com/v1';
// Weather: all keyless — no signup, no activation delay, no proxy
const OM_FORECAST_BASE     = 'https://api.open-meteo.com/v1/forecast';
const OM_GEOCODE_BASE      = 'https://geocoding-api.open-meteo.com/v1/search';
const OM_AIRQUALITY_BASE   = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const REVERSE_GEOCODE_BASE = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const DICT_API_BASE    = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const DADJOKE_API_BASE = 'https://icanhazdadjoke.com';
```

---

## Feature Index

### 1. Calendar

**Views:** Month · Week · Day
**State:**
```js
let calView     = localStorage.getItem('fh_calView') || 'month'; // 'month'|'week'|'day'
let calViewDate = new Date();
let calEventCache = {}; // { calId: { 'YYYY-MM-DD': [{summary, color, holiday, allDay, startDT, endDT}] } }
let disabledCals = new Set(); // calendar IDs toggled off by user
```
**Key functions:**
- `switchCalView(view)` — switches between month/week/day, saves to localStorage
- `renderCurrentView()` — dispatches to the correct render function; also calls `renderBudgetCard()`
- `renderMonthGrid()` — builds the month grid in `#calGrid`
- `renderWeekGrid()` — builds the 7-column week grid in `#weekView`
- `renderDayGrid()` — builds the day timeline in `#dayView`
- `makeDayCell(year, month, day, otherMonth, isToday)` — creates one month grid cell
- `changeCalPeriod(delta)` — navigates forward/back by period
- `getWeekStart(date)` — returns the Sunday of a given week
- `loadAllCalendars()` — fetches Google Calendar events for all enabled cals
- `renderCalendarTabs()` — draws toggle rows in `#calendarCard` sidebar card

**Calendar header (3-zone grid):**
- Left: `🏠 Family Hub` app title
- Centre: `‹ [Month Label] ›` period navigator
- Right: Month / Week / Day view tabs

**Sidebar calendar card:** `#calendarCard` shows per-calendar checkbox toggles (swatch + name + checkbox). Hidden when no calendars loaded; shows "Sign in to see your calendars" placeholder when signed out.

**HTML anchors:** `#calGrid`, `#weekView`, `#dayView`, `#calMonthLabel`, `#calendarTabs` (inside `#calendarCard`), `#calendarStatus`

**localStorage:** `fh_calView`, `fh_calIds` (array of calendar IDs), `fh_calMeta` (labels/colors)

#### ICS Subscriptions (no-OAuth read-only calendars)

Subscribe to any public/secret `.ics` URL (Google, Outlook, school/sports feeds)
without signing into Google — events inject into the same `calEventCache` and
render in every calendar view, the countdown picker, and conflict detection.

**State:** `icsSubs` — Firestore collection `icsSubs` (`{id,url,label,color,weekdaysOnly}`, real-time sync across devices via `onSnapshot` in `attachFirestoreListeners()`; falls back to `lsGet('fh_icsSubs', [])` when `db` is unconfigured). `icsCache` = `lsGet('fh_icsCache', {})` (`{id:{fetchedAt,events}}`, 4 h TTL) — always local, it's just a fetch cache, not shared state.

**Key functions:**
- `parseIcs(text)` — VEVENT parser: summary/description, all-day vs timed, **TZID** (→ UTC via `tzWallToUTCISO`), **RRULE** + **EXDATE**, RFC line unfolding.
- `expandRecurrence(ev, winStart, winEnd)` — expands `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY` with `INTERVAL`/`COUNT`/`UNTIL`/`BYDAY`(weekly)/`EXDATE` across the load window (~2 mo back → ~14 mo forward). Non-recurring events pass through unchanged.
- `fetchIcsSub(sub)` — direct fetch, falling back to the same-origin `/.netlify/functions/ics` proxy (keeps private feed URLs in your own infra; only on a Netlify deploy).
- `loadIcsSubs()` — rebuilds each sub's `calEventCache` slice from scratch (no duplicate injection); `injectIcsEvent()` keys events by **local** date (no UTC day-shift).
- `addIcsSub()` / `removeIcsSub(id)` / `renderIcsSubList()` — Settings → Calendar UI.

**HTML anchors:** `#icsSubList`, `#icsUrlInput`, `#icsLabelInput`, `#icsColorInput`, `#icsSubStatus` (Settings → Calendar → 📡 ICS Subscriptions)

**localStorage:** `fh_icsCache` (always); `fh_icsSubs` only as the no-Firebase fallback (migrated to Firestore on first sign-in, deduped by URL — see `runFirestoreMigrations()`)

**Server:** `netlify/functions/ics.js` proxies a single feed URL server-side (keyless; SSRF-guards loopback/private hosts).

**Gotchas:** Recurrence is pragmatic — no `BYMONTHDAY`/nth-weekday/`RDATE`/`RECURRENCE-ID` overrides. `TZID` resolves via `Intl` (unknown zones fall back to floating/local). Local dev without Netlify can't use the proxy, so CORS-restricted feeds (e.g. Google's `.ics`) only load when deployed.

---

### 2. Google Authentication

**Library:** Google Identity Services (GIS) token client
**Scopes:**
```
calendar.events  calendar.readonly  userinfo.profile  userinfo.email  photospicker.mediaitems.readonly
```
**State:**
```js
let googleToken = '';   // in-memory only — never persisted
let tokenClient;
let gsiReady = false;
```
**Key functions:**
- `initGoogleAuth()` — initializes GIS token client
- `onGsiLoad()` — called by GIS script `onload`
- `requestGoogleToken()` — prompts OAuth consent / silent refresh
- `signOut()` — clears token, clears calendar events, hides `#calendarCard`

**Control card:** `#controlCard` in sidebar — contains `#userInfo`, sign-in/sign-out buttons, ⚙️ settings button.

**Gotcha:** Must be served from `http://localhost:*` or an HTTPS origin (e.g. Netlify), not `file://`. Any new origin must be added to Authorized JavaScript Origins in Google Cloud Console and to Authorized Domains in Firebase Console.

---

### 3. Weather Widget

**API:** **Keyless** — Open-Meteo for forecast (`OM_FORECAST_BASE`), geocoding (`OM_GEOCODE_BASE`), and US AQI (`OM_AIRQUALITY_BASE`); RainViewer for radar tiles; BigDataCloud for reverse geocoding (`REVERSE_GEOCODE_BASE`, geolocation button); NWS for US severe-weather alerts. No signup, no activation delay, no Netlify proxy. (The separate `netlify/functions/events.js` event-discovery feature still uses an OWM key.)
**Multi-location:** Supports any number of saved cities; nav arrows and dot indicators appear when >1 location.

**State:**
```js
let weatherLocations    = lsGet('fh_wlocations', []);  // array of city strings — synced via Firestore settings/weatherLocations doc
let weatherLocIdx       = 0;                           // currently-displayed index
const weatherCache      = {};                          // { cityKey: { ts, data } } — in-memory
const WX_CACHE_TTL      = 30 * 60 * 1000;             // 30-minute cache TTL
let sunArcEnabled       = lsGet('fh_sunArc', true);   // sun-path arc on/off
```

**Key functions:**
- `showWeatherLocation(idx)` — loads (or restores from cache) weather for `weatherLocations[idx]`
- `loadWeatherByCity(city)` — geocodes the city (Open-Meteo), fetches current+hourly+daily forecast + US AQI, builds the normalized `data` object, caches it
- `geocodeCity(city)` — Open-Meteo forward geocode; parses `"City, ST"` / `"City, Country"` hints to pick the best match
- `wmoToCondition(code)` / `wmoDescription(code)` — map WMO weather codes to OWM-style condition strings / human descriptions
- `usAqiToBucket(aqi)` — US AQI (0-500) → `{ bucket 1-5, label }` for the ticker's color + text
- `omEpoch(isoLocal, offsetSec)` — convert an Open-Meteo location-local ISO time to a real UTC epoch
- `addRainViewerLayer(map)` — fetches RainViewer's latest radar frame and adds it as a Leaflet tile layer (keyless)
- `renderWeatherData(data)` — populates all weather DOM elements from a data object
- `renderSunArc(data)` — draws the optional sun-path arc (SVG): sun position between sunrise/sunset, daylight-remaining readout, golden-hour + day/night states. Gated by `sunArcEnabled`. Pure local compute (uses `sunriseTs`/`sunsetTs` epochs, no extra API call).
- `renderWeatherTicker(data)` — scrolling ticker; shows severe-weather **alerts first** (bold, severity-colored), then precip/humidity/wind/visibility/sunrise/sunset/AQI.
- `fetchNwsAlerts(lat, lon)` — active severe-weather alerts from NWS `api.weather.gov` (free, keyless, **US-only**); returns `[{ event, headline, severity }]` sorted by severity; `[]` on failure/non-US. Stored as `data.alerts`.
- `renderWeatherNav()` — draws prev/next buttons and dot indicators in `#wxLocNav`
- `prevWeatherLocation()` / `nextWeatherLocation()` — wrapping navigation
- `fetchWeather()` — reads from `#cityInput` first-time setup form
- `addWeatherLocation(city)` / `removeWeatherLocation(i)` — manage `weatherLocations` array
- `renderWeatherLocationsList()` — renders location list in Settings → Weather
- `saveWeatherLocations()` — persists via `saveFsSetting()` to Firestore `settings/weatherLocations` (or `fh_wlocations` if `db` unconfigured) and always syncs legacy `fh_wcity`

**HTML anchors:** `#weatherDisplay`, `#weatherSetup`, `#wTemp`, `#wDesc`, `#wIcon`, `#wHigh`, `#wLow`, `#wRain`, `#wForecast`, `#wxSunArc`, `#wxLocNav`, `#wxLocDots`, `#weatherCity`, `#wxLocationsList`, `#sunArcToggle` (Settings → Weather)

**localStorage:** `fh_wlocations` (array — no-Firebase fallback only; synced via Firestore `settings/weatherLocations` doc otherwise), `fh_wcity` (legacy, kept in sync with first location), `fh_sunArc` (bool — sun-path arc visibility, always local). *(`fh_wkey` removed — weather is keyless now.)*

**Migration:** On first run, any existing `fh_wcity` value is auto-migrated into `fh_wlocations[0]`. On first Firestore sign-in, an existing `fh_wlocations` gets uploaded to `settings/weatherLocations` (first device to sign in wins; see `runFirestoreMigrations()`).

**External (all keyless, covered by CSP `connect-src https:` / `img-src https:`):**
- Open-Meteo `api.open-meteo.com`, `geocoding-api.open-meteo.com`, `air-quality-api.open-meteo.com`
- RainViewer `api.rainviewer.com` (frame index) + `tilecache.rainviewer.com` (tiles)
- BigDataCloud `api.bigdatacloud.net` (reverse geocode for the 📍 geolocation button)
- NWS `api.weather.gov/alerts/active?point=` for severe-weather alerts. US-only; calls succeed with permissive CORS.

**Gotcha:** Open-Meteo returns conditions as integer **WMO codes** (mapped via `wmoToCondition`) and times as **location-local ISO** strings without a zone suffix (convert with `omEpoch`). Open-Meteo has no map tiles — radar uses RainViewer instead.

---

### 4. Google Photos Background Slideshow

**API:** Google Photos Picker API (session-based, OAuth token required)
**Storage:** IndexedDB database `fh_bgImages` (stores downloaded blobs). **Imports are additive** (Picker picks and local uploads join the existing pool); beyond `BG_MAX_PHOTOS` (200) the oldest photos are evicted (auto-increment ids = import order). "Clear background images" resets the pool.
**State:**
```js
const BG_MAX_PHOTOS = 200;  // pool cap — oldest evicted beyond this
let bgPhotos = [];
let bgIndex  = 0;
let bgTimer  = null;
let slideInterval = parseInt(localStorage.getItem('fh_slideInterval')) || 30;
```
**Key functions:**
- `rebuildBgPhotosFromDb()` — rebuilds `bgPhotos` object URLs from the full pool (shuffled), refreshes preview, restarts slideshow; returns count
- `evictBgOverflow()` — deletes oldest photos beyond `BG_MAX_PHOTOS`; returns evicted count
- `loadBgFromDb()` — startup wrapper around `rebuildBgPhotosFromDb()`
- `startSlideshow()` — manages `bgTimer` interval
- `openPhotosPicker()` — creates Picker session, opens picker popup, polls for result; **paginates** `mediaItems` (`nextPageToken`, capped at `BG_MAX_PHOTOS`); downloads at **`=w2560-h1440`** (display resolution — the screensaver shows photos full-screen) with 4 concurrent workers
- `saveBgFiles(files)` — local uploads, same additive + eviction path

**Staleness nudge:** every import stamps `fh_photosImportedAt`; `openSettings()` shows "✓ N image(s) in the pool · updated X days ago" and, past 30 days, an accent-colored prompt to re-pick (the Picker API can't auto-sync an album — re-picking is the only refresh).

**Gotcha:** Picker session URLs expire. If photos stop loading, re-open the picker. Download requires `Authorization: Bearer ${googleToken}` header — without it you get 403.

**localStorage:** `fh_slideInterval`, `fh_photosImportedAt`

---

### 5. Appearance Themes

Three modes, toggled via ⚙️ Settings → Look & Feel:

| Mode | Class on `<body>` | Description |
|---|---|---|
| Dark (default) | _(none)_ | Deep charcoal, blue accent |
| Light | `light-mode` | Light grey background, dark text |
| Nautical | `nautical-mode` | Navy hull + 20% diagonal white stripes, beige-gold accents, anchor watermark, animated wave footer |

**State:**
```js
let appMode = localStorage.getItem('fh_mode') || 'dark'; // 'light' | 'dark' | 'nautical' | 'aurora' | 'colorblind'
let appFlavor = localStorage.getItem('fh_flavor') || 'basic'; // 'basic' | 'tactile' — design-system axis, orthogonal to appMode
```
**Key functions:**
- `applyAppMode(mode)` — removes all mode classes, adds the correct one
- `setAppMode(mode)` — calls `applyAppMode`, saves to localStorage, updates button highlights
- `applyFlavor(flavor)` — toggles `body.flavor-tactile` (basic = no class)
- `setFlavor(flavor)` — calls `applyFlavor`, saves `fh_flavor`, updates button highlights. Tactile reads each theme's color tokens; CSS lives in the `✦ TACTILE FLAVOR` section of `family-hub.css` (self-hosted fonts in `fonts/`)

**Nautical-specific CSS elements:**
- `body.nautical-mode::before` — large ⚓ watermark (22% opacity), lower-right corner
- `body.nautical-mode::after` — animated `clip-path` wave along bottom edge (`nauticalWave` keyframe)
- Rope-style card header dividers (repeating-linear-gradient brass strands)
- Compass rose radial gradient on calendar card body
- Beige-gold DOW labels, today cell porthole glow, gradient brass buttons

**localStorage:** `fh_mode` — migration: `'amazing'` is auto-upgraded to `'nautical'` on load

**TV / Display Mode:**
Activated via Settings → Look & Feel → 📺 TV / Display Mode toggle, or by appending `?tv=1` to the URL.
- Adds `body.tv-mode` — hides all edit controls and input chrome, enlarges text, suppresses hover effects
- Cursor hides after 4 s of inactivity (`body.tv-cursor-hidden`); any mouse move restores it
- Escape key exits TV mode
- **State:** `let tvMode = lsGet('fh_tvMode', false);`
- **Key function:** `applyTvMode(on?)` — toggles the class, saves to `fh_tvMode`
- **HTML:** `#tvModeToggle` in Settings → Look & Feel

---

### 6. Widget Placement System

Every sidebar widget can be assigned to **Sidebar** or **Bottom** via ⚙️ Settings → Widgets.

**State:**
```js
const WIDGET_DEFAULTS = { shopping: true, todo: true, budget: true, chores: true, wotd: true, quote: true, dadjoke: true, yearstrip: false, assistant: true, countdown: true, news: false, stock: false };
let widgetVisibility = { ...WIDGET_DEFAULTS, ...lsGet('fh_widgets', {}) };

const WIDGET_PLACEMENT_DEFAULTS = {
  shopping: 'sidebar', todo: 'sidebar', budget: 'sidebar', chores: 'sidebar',
  wotd: 'sidebar', quote: 'sidebar', dadjoke: 'sidebar', yearstrip: 'bottom',
  assistant: 'sidebar', countdown: 'sidebar', news: 'sidebar', stock: 'sidebar',
};
let widgetPlacement = { ...WIDGET_PLACEMENT_DEFAULTS, ...lsGet('fh_widget_placement', {}) };

const WIDGET_ORDER = [
  { key: 'shopping',  id: 'shopCard'      },
  { key: 'todo',      id: 'todoCard'      },
  { key: 'budget',    id: 'budgetCard'    },
  { key: 'chores',    id: 'choreCard'     },
  { key: 'yearstrip', id: 'yearCard'      },
  { key: 'wotd',      id: 'wotdCard'      },
  { key: 'dadjoke',   id: 'dadjokeCard'   },
  { key: 'quote',     id: 'quoteCard'     },
  { key: 'assistant', id: 'assistantCard' },
  { key: 'countdown', id: 'countdownCard' },
  { key: 'news',      id: 'newsCard'      },
  { key: 'stock',     id: 'stockCard'     },
];
```
**Key functions:**
- `applyWidgetPlacement()` — moves each card DOM node to `.sidebar` or `#bottomStrip` in canonical order, then calls `applyWidgetVisibility()`. **Placement is desktop-only:** under 640px every card stays in `.sidebar` so the mobile tab system can reach it; crossing the breakpoint re-distributes (resize handler).
- `applyWidgetVisibility()` — shows/hides each card; handles yearstrip special case (sidebar→`#yearCard`, bottom→`#yearStrip`). On mobile, if the open tab's widget was just disabled (locally or via settings sync) it bounces the tab to Calendar (see §20).

**Special case — Year at a Glance:**
- In **sidebar**: `#yearCard` (shows 2 months with ‹/› navigation)
- In **bottom**: `#yearStrip` (6-month horizontal strip, always inside `.cal-column`)

**Special case — Chore Chart:**
- In **sidebar**: per-member sections stacked vertically; add-row below card body
- In **bottom**: per-member sections tiled horizontally in a scrollable `.chore-members-row` flex container; add-row moves to the right side via CSS grid on `#choreCard`

**HTML anchors:** `#bottomStrip` (inside `.cal-column`), `.sidebar`

**localStorage:** `fh_widgets`, `fh_widget_placement`

---

### 7. Shopping List

**Backend:** Firebase Firestore collection `shopping`
**Key functions:**
- `addShop()` — adds item to Firestore
- `toggleShop(id)` — marks item done/undone
- `clearDoneShopping()` — removes completed items only (confirms with nothing — immediate)
- `clearAllShopping()` — removes all items after `confirm()` dialog
- `renderShopList(items)` — re-renders `#shopList`
- `toggleSmsPopover(event)` — shows/hides SMS contact picker
- `sendShoppingViaSms(phone)` — opens `sms:` URL with list contents

**SMS popover:** `.sms-popover` uses a solid opaque background (`#1e2130` dark / `#f5f6fa` light / `#0e1e48` nautical) so it's readable over background photos.

**HTML anchors:** `#shopList`, `#shopInput`, `#shopEmpty`, `#smsPopover`, `#smsTriggerBtn`

**SMS recipients:** derived from family members with a phone number (Settings → Family) via `getSmsContacts()` — no separate contact list. The legacy `fh_smsContacts` localStorage list is migrated into member phone numbers on load by `migrateSmsContactsToMembers()` (name-matched to existing members; unmatched nicks become new members).

---

### 8. To-Do List

**Backend:** Firebase Firestore collection `todo`
**Firestore schema:** `{ text, done, by, createdAt, dueDate?: 'YYYY-MM-DD', assignedTo?: string }`

**State:**
```js
let todoItems      = [];  // in-memory mirror of Firestore 'todo' (or localStorage fallback)
let familyMembers  = JSON.parse(localStorage.getItem('fh_familyMembers') || '[]');
```
**Key functions:**
- `addTodo()` — reads text + optional dueDate + assignedTo, writes to Firestore
- `renderTodoList()` — re-renders `#todoList` from `todoItems`; list scrolls at `max-height: 220px`
- `clearDoneTodo()` — removes completed items only
- `clearAllTodo()` — removes all items after `confirm()` dialog
- `todosDueOnDate(dateKey)` — returns todos with `dueDate === dateKey` that are not done

**localStorage:** `fh_familyMembers`

---

### 9. Settings Modal

**Key functions:** `openSettings()`, `closeSettings()`, `saveSettings()`, `switchSettingsTab(tab)`
**Tabs:** `look` · `calendar` · `weather` · `shopping` · `todo` · `meals` · `budget` · `widgets` · `chores` · `eggs` *(eggs hidden; revealed by triple-clicking the ⚙️ in the modal title)*
**HTML anchor:** `#settingsModal`, `#settingsModalGear` (triple-click target in modal `<h2>`)
**Pattern:** Each tab has a `.settings-panel[data-panel="X"]` div; `switchSettingsTab` toggles `.active`
**Easter eggs unlock:** `handleSettingsGearClick()` — triple-click on `#settingsModalGear` within 700ms adds `body.eggs-unlocked`, revealing the 🥚 tab

---

### 10. Year at a Glance

Two rendering modes depending on widget placement:

**Sidebar mode (`#yearCard`):**
- Shows 2 mini-months at a time
- ‹/› navigation buttons in card header
- "Today" button appears when navigated away from current month
- State: `let yearCardOffset = 0;`
- Functions: `renderYearCard()`, `changeYearCardMonth(delta)`, `resetYearCard()`, `updateYearCardTodayBtn()`

**Bottom mode (`#yearStrip` inside `.cal-column`):**
- 6-month horizontal strip (always constrained to calendar column width)
- State: `let stripStartMonth = 0;`
- Functions: `renderYearStrip()`, `changeStripMonth(delta)`, `resetStripToToday()`
- `renderYearStrip()` calls `renderYearCard()` at its top to keep both in sync

**HTML anchors:** `#yearCard`, `#yearCardBody`, `#yearCardTodayBtn`, `#yearStrip`, `#miniGrid`

---

### 11. Meal Planning

**State:**
```js
let mealPlan       = lsGet('fh_mealPlan', {});
// { 'YYYY-MM-DD': { breakfast: {name, description, recipeUrl, ingredients[]}, lunch, dinner } }
let mealAiKey      = localStorage.getItem('fh_mealAiKey')    || '';
let mealAiProvider = localStorage.getItem('fh_mealAiProvider') || 'gemini';
let mealDietPrefs  = lsGet('fh_mealDietPrefs', []);  // synced via Firestore settings/mealDietPrefs doc
let mealPantryDef  = localStorage.getItem('fh_mealPantry')   || '';
```
**Key functions:**
- `openMealModal(dateKey, mealType)` — opens the suggestion/planner modal (also the fallback when an empty slot is clicked)
- `generateMealSuggestions()` — builds prompt, calls AI, renders results
- `callMealAI(prompt)` — fetches from Gemini or OpenAI
- `acceptMealSuggestion(i)` — saves to `mealPlan`, updates calendar views
- `addIngredientsToShoppingList(i)` — pushes ingredients to Firestore shopping

**Meal Detail modal** (opens when clicking an *already-planned* meal in Week/Day view):
- `openMealDetail(dateKey, mealType)` — populates the detail popup; falls back to `openMealModal` if the slot is empty
- `closeMealDetail()`
- `fetchMealImage(name)` — best-effort dish photo from TheMealDB (free, keyless); returns a thumb URL or null. Cached in `_mealImgCache`. Falls back to an emoji placeholder when no match.
- `toggleMealAdjust()` — reveals/hides the Adjust section
- `addAdjustPreset(label)` — appends a quick-adjust chip's text to the instruction input (de-duped)
- `adjustMeal()` — re-generates the current meal via `callMealAI` per the user's adjustment, replaces it via `setMealInFs` (optimistic local update), and re-opens the detail
- `deleteMealFromDetail()` — `removeMeal()` + close
- Actions: **Keep** (close, no change) · **Adjust** (vegetarian, lactose-free, swap ingredients, free-text…) · **Delete**

**Meal remove buttons:**
- Week view: each meal chip has a `✕` remove button (`.meal-remove-btn`) revealed on hover
- Day view: each meal slot has an inline remove button (`.day-meal-remove-btn`)

**HTML anchors:** `#mealModal`, `#mealSuggestionsWrap`, `#mealGenerateBtn`, `#mealDetailModal`, `#mealDetailImg`, `#mealDetailImgPlaceholder`, `#mealAdjustSection`, `#mealAdjustChips`, `#mealAdjustInput`

**External:** TheMealDB `search.php?s=` (keyless) for dish photos — covered by CSP `connect-src https:` / `img-src https:`.

**localStorage:** `fh_mealPlan`, `fh_mealAiKey`, `fh_mealAiProvider`, `fh_mealDietPrefs`, `fh_mealPantry`, `fh_mealLoadingMsgs`, `fh_mealTemplates` — `fh_mealDietPrefs` (Firestore `settings/mealDietPrefs` doc) and `fh_mealTemplates` (Firestore `mealTemplates` collection) are no-Firebase fallbacks only; `saveMealTemplate()`/`deleteMealTemplate(id)` manage the templates collection.

---

### 12. Budget

**Backend:** Firebase Firestore collection `budget` (ordered by `createdAt`) — real-time via `onSnapshot`

**Context-sensitive display:** `renderBudgetCard()` reads `calView` and `calViewDate` to show the right period:
- Month view → "Total Bills this Month" in `#budgetTotalCard` sidebar pill
- Week view → "Total Bills this Week" in `#budgetTotalCard` sidebar pill
- Day view → "Bills Today" (pill hidden; detail shown in `#budgetCard` only)
- Card hidden entirely when no items fall in the current period

**State:**
```js
let budgetItems = []; // live from Firestore onSnapshot
```
**Key functions:**
- `budgetDatesInRange(item, startD, endD)` — returns `['YYYY-MM-DD', ...]`
- `renderBudgetCard()` — context-sensitive; called from `renderCurrentView()`
- `saveBudgetItems()` / Firestore listener keeps `budgetItems[]` live

**HTML anchors:** `#budgetCard`, `#budgetTotalCard`, `#budgetTotalInner`, `#budgetCardLabel`

**localStorage fallback:** `fh_budgetItems` — auto-migrated to Firestore on first Firebase-enabled run

---

### 13. Word of the Day

**API:** `${DICT_API_BASE}/{word}` — free, no key
**Fallback:** `WOTD_FALLBACKS` object contains built-in definitions for common words in the list — used when the API is unavailable; never shows blank.
**State:** Cached in localStorage as `{ date, word, phonetic, partOfSpeech, definition, example }`. Cache is rejected if `definition` is empty (forces re-fetch).
**Word source:** `WOTD_WORDS` array (~74 curated words), picked by `dayOfYear % length`
**Key functions:** `loadWotd(force)`, `renderWotd(w)`, `refreshWotd()`
**HTML anchors:** `#wotdCard`, `#wotdBody`
**localStorage:** `fh_wotd`

---

### 14. Dad Joke of the Day

**API:** `${DADJOKE_API_BASE}/` with `Accept: application/json` — free, no key
**Key functions:** `loadDadJoke(force)`, `renderDadJoke(joke)`, `refreshDadJoke()`
**HTML anchors:** `#dadjokeCard`, `#dadjokeBody`
**localStorage:** `fh_dadjoke`

---

### 15. Family Assistant

Gemini-powered chat (shares the Meals key `mealAiKey`) with live family-data context. See `ASSISTANT_BACKLOG.md` for the enhancement roadmap.

**Assistant rename:** Name is user-configurable. `applyAssistantName()` updates the card title, aria-labels, and the `#assistantWidgetLabel`. Named personalities: naming the assistant **Jarvis**, **HAL 9000**, or **Alfred** injects a character voice into `buildAssistantContext()`.

**State:** `assistantHistory` (in-memory, not persisted), `shopItemsCache`, `ASSISTANT_QUICK_PROMPTS` (empty-state chips — keep current as capabilities grow).
```js
let assistantName = localStorage.getItem('fh_assistantName') || 'Family Assistant';
```

**Key functions:**
- `buildAssistantContext()` — builds the system prompt (calendar 7d, to-dos, shopping, budget, weather location) + the ACTIONS spec
- `sendAssistantMessage()` — calls Gemini, then `extractAssistantActions()` → `await executeAssistantActions()`
- `extractAssistantActions(raw)` — pulls `[ACTION:type:value]` tags; multi-arg values use a `|` delimiter
- `executeAssistantActions(actions)` *(async)* — dispatches to per-action `assistant*()` handlers; returns confirmation strings appended to the reply
- `renderAssistantMessages()` — renders chat / empty-state chips; `useQuickPrompt(text)` sends a chip
- `initAssistantVoice()` — Web Speech mic **input**
- `speakAssistant(text)` / `toggleAssistantTTS()` / `updateAssistantTtsBtn()` — voice **output** (TTS). Reads replies aloud via `speechSynthesis` (strips markdown/emoji), gated by `assistantTTS` (`fh_assistantTTS`, default off), toggled by the header 🔇/🔊 button. Interruptible (cancels on new send / clear).

**Action vocabulary** (`[ACTION:...]`): `addShopping` · `addTodo` · `completeTodo` · `checkShopping` · `addEvent:YYYY-MM-DD|HH:MM|Title` (Google Calendar `primary`; `allday` for no time) · `setMeal:YYYY-MM-DD|mealType|Name` · `addBudget:Name|Amount|frequency`. Handlers: `assistantAddShopping/AddTodo/CompleteTodo/CheckShopping/AddEvent/SetMeal/AddBudget`, plus `fuzzyTextMatch()`.

**HTML anchors:** `#assistantCard`, `#assistantCardTitle` (renamed by `applyAssistantName`), `#assistantMessages`, `#assistantInput`, `#assistantMicBtn`, `#assistantTtsBtn`, `.assistant-chip`
**localStorage:** `fh_assistantTTS` (bool — read replies aloud), `fh_assistantName` (string — display name)

**Requires:** Gemini key for chat; Google sign-in for `addEvent` (degrades gracefully otherwise).

---

### 16. Chore Chart

**Backend:** Firebase Firestore collections `chores` + `familyMembers`
**Firestore schema:**
```js
// chores collection
{ text: string, points: number, assignedTo: memberId, doneDate: 'YYYY-MM-DD'|null, createdAt }

// familyMembers collection (also used by To-Do assignee and member colors)
{ name, color, points: number, rewardName?: string, rewardThreshold?: number }
```

**Daily reset pattern:** `doneDate` stores the date last completed (`YYYY-MM-DD`). A chore renders as done only if `doneDate === today` — no reset job needed.

**Points + rewards:** Completing a chore atomically increments `familyMembers.points` via `firebase.firestore.FieldValue.increment(n)`. When points reach `rewardThreshold`, a pulsing "🎉 Redeem!" button appears. `redeemChoreReward(memberId)` resets points to 0 and fires confetti + toast.

**Bottom-strip layout:** When `widgetPlacement.chores === 'bottom'`, `renderChoreCard()` wraps member sections in `.chore-members-row` (horizontal flex, overflow-x scroll). The card itself becomes a CSS grid (`1fr auto`) so the add-row sits as a vertical column on the right side.

**Key functions:**
- `renderChoreCard()` — renders per-member sections; detects bottom placement for horizontal layout
- `addChore()` — reads `#choreInput`, `#chorePoints`, `#choreAssignee`; writes to Firestore
- `deleteChore(choreId)` — removes from Firestore
- `toggleChore(choreId, memberId, pts, wasDone)` — batch updates `chores.doneDate` + `familyMembers.points`
- `redeemChoreReward(memberId)` — resets member points to 0, triggers confetti
- `renderChoreRewardList()` — populates Settings → ⭐ Chores reward configuration
- `updateChoreAssigneeDropdown()` — syncs `#choreAssignee` options from `familyMembers`

**HTML anchors:** `#choreCard`, `#choreCardBody`, `#choreInput`, `#chorePoints`, `#choreAssignee`, `#choreRewardList`

**CSS classes:** `.chore-member-section`, `.chore-member-header`, `.chore-member-name`, `.chore-pts-total`, `.chore-redeem-btn`, `.chore-progress-wrap`, `.chore-progress-fill`, `.chore-list`, `.chore-item`, `.chore-check`, `.chore-text`, `.chore-pts-badge`, `.chore-del-btn`, `.chore-add-row`, `.chore-pts-input`, `.chore-assignee-sel`, `.chore-members-row`

---

### 17. Easter Eggs

Hidden delights gated by `eggCategories`. All eggs are session-only; no persistence beyond the category on/off toggles.

**Category system:**
```js
const EGG_CATEGORY_DEFAULTS = { phrases: true, calendar: true, ui: true, weather: true };
let eggCategories = lsGet('fh_eggCategories', { ...EGG_CATEGORY_DEFAULTS });
```
Categories: `phrases` (assistant triggers), `calendar` (date-based), `ui` (interaction tricks), `weather` (weather card).

**Settings unlock:** Triple-clicking `#settingsModalGear` (the ⚙️ in the modal `<h2>`) within 700ms reveals the hidden 🥚 Easter Eggs tab via `body.eggs-unlocked`. Function: `handleSettingsGearClick()`.

**Assistant phrase triggers (`phrases` category):**
`checkAssistantEasterEgg(text)` — called in `sendAssistantMessage()` before the Gemini API call. Returns a canned response string or `null`.

Franchise triggers live in the `EASTER_EGG_FRANCHISES` registry (array of `{ id, label, triggers: [fn(t) => string|null, ...] }`) right above the function — the single source of truth for both the matching logic and the Settings chip-grid picker, so adding a franchise needs no other markup edits. 33 franchises as of this writing (LOTR, Hitchhiker's Guide, Dune, BSG, Star Trek, Star Wars, Seinfeld, Friends, Marvel, Harry Potter, The Office, Back to the Future, Jurassic Park, Ghostbusters, Elf, Toy Story, Anchorman, Mean Girls, Parks and Rec, video game cheats (IDDQD, IDKFA), and more). Each franchise can be individually toggled — picks live in `eggFranchises` (`lsGet`-style default: every registry id defaults to `true`, including ones added after a user's first run).

A handful of triggers aren't tied to any franchise (birthday, politeness, dark-mode escalation) and stay inline in `checkAssistantEasterEgg`, gated only by the `phrases` category master toggle — same as the three named-assistant personality overlays (Jarvis/HAL 9000/Alfred), which live further down the function keyed on `assistantName` rather than on user text.

**UI eggs (`ui` category):**
- **Konami Code** — rainbow hue-rotate + 🌈 burst
- **Emoji Fireworks** — 7× click app title emoji → 12 colored sparks
- **Do a Barrel Roll** — `rotateY` full-page flip
- **Darker Mode** — dims to near-black for 2 s
- **Hadouken** — `triggerHadouken()` spawns `.hadouken-ball` across viewport
- **Last to-do confetti** — `renderTodoList()` fires `spawnConfetti` when all to-dos are done
- **Destroy the Ring** — checking off a to-do named "destroy the ring" triggers an orange glow

**Calendar eggs (`calendar` category):** `checkCalendarEasterEggs(dateKey)` — May 4, Dec 24/25, Oct 31, Feb 14, Jul 4, Feb 2, seasonal emoji, Back to the Future drag, Welcome Back to the Shire.

**Weather eggs (`weather` category):** Triple-click temperature → toggle °F/°C; Perfect Weather (72°F); Heatwave (≥100°F); Full Moon glow; weather on Arrakis assistant trigger.

**Named-assistant personalities:** Detected in `buildAssistantContext()` — `assistantName.toLowerCase()` matched against `'jarvis'`, `'hal 9000'`, `'alfred'`. Each injects a character voice into the Gemini system prompt and enables special phrase triggers.

---

### 18. Event Discovery

**Overview:** Discover local events (concerts, shows, family activities, library programs, sports) within a configurable radius. Calendar-aware (shows free/busy conflicts), weather-aware, and uses intelligent IndexedDB caching with background refresh.

**UX:** Click 💡 button on calendar header → modal opens with cached events → fresh data fetches in background → modal updates with age label ("Fresh — just now" to "⚠️ Cached — may be outdated").

**Data sources (multi-API aggregation):**
1. **Ticketmaster Discovery API** — dated ticketed events (concerts, shows, sports)
2. **OpenStreetMap / Overpass** — keyless POIs (museums, galleries, theatres, parks, zoos, viewpoints)
3. **LibraryWeb (LibCal)** — free Monroe County (Rochester NY) public library events via iCal feeds
4. **Red Wings** — Rochester Red Wings (AAA baseball) home games via MLB Stats API
5. **CitySpark ("Around Town")** — broad local events via aggregator (concerts, festivals, food, art, comedy, family)

**State:**
```js
let eventLocation       = lsGet('fh_eventLocation', 'Rochester');
let eventMaxDistance    = lsGet('fh_eventMaxDistance', 120);  // minutes driving time (converted to radius)
let eventsData          = [];         // filtered/sorted for display
let eventsRawData       = [];         // raw from API + calendar conflicts
let eventsSort          = 'distance'; // or 'date'
let eventsFetchTimestamp = 0;        // for age label
let eventsModalOpen     = false;
```

**Key functions:**
- `openEventsModal()` — reads cached events from IndexedDB, shows immediately; fetches fresh data in background
- `fetchAndUpdateEvents()` — calls `/.netlify/functions/events?location=<>&radius=<>`, saves to IndexedDB, re-renders modal (caching is inline here, not a separate function)
- `addEventToCalendar(event)` — opens event editor modal; reuses `saveCalEvent()` for Google Calendar write
- `openEventsModal()` / `closeEventsModal()` — modal state
- `applyFiltersAndSort()` — filters by distance, date window (30 days), type; sorts by distance or date
- `renderEventsList()` / `renderEventCard(event)` — builds card DOM for display

**Netlify backend function:** `netlify/functions/events.js` (400+ lines)
- `geocodeLocation()` — city name → lat/lon via OpenWeatherMap
- `fetchTicketmaster()`, `fetchOpenStreetMap()`, `fetchLibraryWeb()`, `fetchRedWings()`, `fetchCitySpark()` — per-source fetchers
- `calculateDistance()` — Haversine formula
- `deduplicateEvents()` — by title + date + venue
- `filterEventsByDistanceAndDate()` — 30-day window, radius filtering
- `addWeatherContext()` — enriches with OWM forecast data
- Error handling with exponential backoff (2 retries, 1s→2s→4s, 10s cap)

**HTML anchors:** `#eventsModal`, `.cal-event-discover-btn` (💡 button in calendar header)

**CSS classes:** `.event-card`, `.event-type-badge`, `.event-weather`, `.event-calendar-indicator`, `.event-age-label`, `.event-distance-pill`

**localStorage:** `fh_eventLocation`, `fh_eventMaxDistance`

**IndexedDB:** Database `fh_events` (v1)
- Object store `events` (keyPath: id) with indexes: byDate, byType, byDistance
- Object store `eventCache` (keyPath: key) — stores { key: 'current', timestamp, location, radiusMinutes, eventCount }

**Configuration before production:**
```
Netlify environment variables:
  TICKETMASTER_KEY=<production-key>
  OWM_KEY=<production-key>
```

**Gotchas:**
- Ticketmaster requests pass explicit `startDateTime`/`endDateTime` for 30-day window (was returning past events)
- CitySpark requires `sort:'Time'` (not `'Date'`) for soonest-first results; `'Date'` returns tail
- CitySpark `DateStart` is local time with spurious `Z` — read components directly, do NOT tz-convert
- LibraryWeb: no all-branches feed exists; must fetch per-branch iCal separately + merge
- Dateless events (OpenStreetMap POIs, some library events) show "Anytime" in modal; require date selection if added to calendar

---

### 19. Screensaver

**Overview:** Idle-triggered full-screen photo slideshow with ambient info (SCREENSAVER_BACKLOG.md S1+S3). After N minutes without pointer/key/touch activity, fades to a black overlay cycling the background photo pool (`bgPhotos` — same IndexedDB pool as the background slideshow) with slow Ken Burns pan/zoom, an optional drifting clock (burn-in protection), and an optional info line (current temp + next calendar event). A configurable night window switches to a dim clock-only mode. Any interaction wakes it instantly; the waking tap is swallowed by the overlay. Doesn't activate when the photo pool is empty or the tab is hidden.

**State:**
```js
let saverEnabled  = lsGet('fh_saver', false);
let saverIdleMin  = lsGet('fh_saverIdleMin', 10);   // minutes idle before start
let saverDwellSec = lsGet('fh_saverDwellSec', 20);  // seconds per photo
let saverClock    = lsGet('fh_saverClock', true);   // clock overlay on/off
let saverInfo     = lsGet('fh_saverInfo', true);    // temp + next event line
let saverNight    = lsGet('fh_saverNight', true);   // night dimming on/off
let saverNightStart = lsGet('fh_saverNightStart', '22:00'); // HH:MM
let saverNightEnd   = lsGet('fh_saverNightEnd', '06:30');   // HH:MM (wraps midnight)
let saverActive   = false;                          // runtime only
let lastWxData    = null;  // set by renderWeatherData(); reused for the temp line
```

**Key functions:**
- `resetSaverIdleTimer()` — (re)arms the idle timeout; no-op when disabled or already active
- `startScreensaver()` — activates overlay; guards: enabled, not active, tab visible, photos exist (else re-arms); computes night state before the first photo
- `stopScreensaver()` — fades out, clears timers + night class, removes photo layers after the fade, re-arms
- `advanceSaverPhoto()` — appends the next photo `<img>` (random `kb0–kb3` Ken Burns class, inline `animationDuration` = dwell + 4s), crossfades, retires the previous layer, schedules itself; no-op during night
- `updateSaverOverlay()` — every 10s: time + date, temp (`lastWxData` + `WX_ICONS`), next event, night transitions (entering night drops photo layers + pauses cycling; exiting resumes), ±30/±20px drift
- `getNextCalendarEvent()` — soonest timed event later today across enabled calendars (skips holidays + `disabledCals`), else tomorrow's first event; returns display text or null
- `saverInNightWindow(d)` — HH:MM window test, handles midnight wrap
- `saverActivity(e)` — global listener (`pointerdown`/`pointermove` throttled 1/s/`keydown`/`touchstart`/`wheel`): wakes if active, else re-arms; `visibilitychange` stops when hidden

**Night mode:** `#screensaver.night` — photos hidden/dropped, info hidden, clock forced visible at 35% opacity (even if the clock toggle is off).

**HTML anchors:** `#screensaver` (fixed overlay, `z-index: 20000` — above modals, below easter-egg layers), `#saverClock` / `#saverClockTime` / `#saverClockDate` / `#saverInfo` (`#saverInfoWx`, `#saverInfoEvent`)

**CSS:** `/* ── Screensaver ── */` section — `.saver-img` (crossfade + `saverKb0–3` keyframes), `#screensaver.active`, `#screensaver.night`, `#saverInfo`, tactile flavor uses `--font-display` for the clock

**Settings:** Screensaver/Background tab (General group) → Screensaver section: enable toggle, idle minutes (1–240), dwell seconds (5–600), clock toggle, weather & next event toggle, night dimming toggle + from/to times. Wired in `openSettings()` / `saveSettings()`; init armed from the `load` handler.

**localStorage:** `fh_saver`, `fh_saverIdleMin`, `fh_saverDwellSec`, `fh_saverClock`, `fh_saverInfo`, `fh_saverNight`, `fh_saverNightStart`, `fh_saverNightEnd`

**Mobile:** never activates under 640px — `resetSaverIdleTimer()`/`startScreensaver()` bail when `isMobile` (battery + OS lock screen); crossing the breakpoint re-arms/disarms via the resize handler. The Settings toggle governs desktop/kiosk only.

---

### 20. Mobile Layout (bottom nav + tab registry)

**Overview:** Under 640px the app becomes a tab-per-card layout: a fixed bottom nav with five buttons — Calendar · To-Do · Shopping · Weather · ⚙️ Settings. The first four are tabs (`data-mobile-tab`); Settings opens the Full Settings modal directly (`openSettings()`) rather than switching tabs — there's no intermediate mobile-only settings screen. A mobile tab shows exactly one sidebar card full-screen ('cal' shows `.cal-column` instead).

**Registry (single source of truth):**
```js
const MOBILE_TABS = { todo: { cardId, widget }, shop: { cardId, widget }, weather: { cardId } };
// cardId — the card shown full-screen on that tab
// widget — optional widgetVisibility key gating the tab (bounces to 'cal' when off)
```
Adding a card to mobile = one registry entry. **No per-tab CSS:** `setMobileTab()` stamps `.mobile-tab-active` on the tab's card and generic rules in the 640px media query (family-hub.css §8) hide everything else. The active-card rule is `!important` so a synced `display:none` from `applyWidgetVisibility()` can't blank the screen before the tab bounces.

Secondary widgets (Budget, Chores, Word, Joke, Quotes, Countdown, News, Stock, Assistant) have no mobile surface — reachable only via Full Settings' configuration panels, not for day-to-day use on a phone. This is a deliberate scope cut (2026-07-11): the prior "More tab" feature grid that routed to them was removed along with the settings duplication it lived next to.

**Key functions:**
- `setMobileTab(tab)` — validates (unknown tab or disabled widget → `'cal'`), persists, stamps the active card, highlights the nav button
- `getInitialMobileTab()` / `getTimeBasedDefaultTab()` — time-of-day default on first visit of the day (`fh_mobileTabDate`), else last tab
- `updateIsMobile()` + resize handler — `isMobile` (<640px); breakpoint crossings re-run `applyWidgetPlacement()` and `resetSaverIdleTimer()`

**Tactile/theming:** nav chrome derives from tokens (`--line`, `--surface-solid/-hi`, `--accent`); Tactile mobile rules use neutral tokens only (KTD-4-safe). Touch tap-target sizing (nav buttons, assistant send/mic 42px) lives inside `@media (hover: none)` per the CLAUDE.md invariant.

**HTML anchors:** `.mobile-bottom-nav` / `#mobileNav`, `#hamburgerBtn` (opens Settings)

**localStorage:** `fh_mobileTab`, `fh_mobileTabDate`. Default calendar view (`fh_calView`, unset) is `'week'` on both mobile and desktop.

---

## localStorage Key Index

| Key | Type | Feature | Notes |
|---|---|---|---|
| `fh_name` | string | Settings | Display name |
| `fh_mode` | string | Theme | `'light'` \| `'dark'` \| `'nautical'` \| `'aurora'` \| `'colorblind'` |
| `fh_flavor` | string | Flavor | `'basic'` \| `'tactile'` — design-system axis, orthogonal to theme |
| `fh_calView` | string | Calendar | `'month'` \| `'week'` \| `'day'` |
| `fh_calIds` | JSON array | Calendar | Google Calendar IDs |
| `fh_calMeta` | JSON object | Calendar | `{ calId: { label, color } }` |
| `fh_wkey` | string | Weather | OpenWeatherMap API key |
| `fh_wlocations` | JSON array | Weather | Fallback only — synced via Firestore `settings/weatherLocations` doc otherwise. Array of city strings e.g. `["Boston, US", "London, GB"]` |
| `fh_wcity` | string | Weather | Legacy single city — kept in sync with `fh_wlocations[0]` |
| `fh_sunArc` | bool | Weather | Sun-path arc visibility (default true) |
| `fh_slideInterval` | string | Photos | Slideshow seconds |
| `fh_photosImportedAt` | string | Photos | Epoch ms of last photo import (staleness nudge) |
| `fh_widgets` | JSON object | Widgets | `{ shopping: bool, todo: bool, … }` |
| `fh_widget_placement` | JSON object | Widgets | `{ shopping: 'sidebar'\|'bottom', … }` |
| `fh_mealPlan` | JSON object | Meals | `{ dateKey: { breakfast, lunch, dinner } }` |
| `fh_mealAiKey` | string | Meals | API key (Gemini or OpenAI) |
| `fh_mealAiProvider` | string | Meals | `'gemini'` \| `'openai'` |
| `fh_mealDietPrefs` | JSON array | Meals | Fallback only — synced via Firestore `settings/mealDietPrefs` doc otherwise. e.g. `['Vegetarian', 'Gluten-Free']` |
| `fh_mealPantry` | string | Meals | Default pantry text |
| `fh_mealLoadingMsgs` | JSON array | Meals | Custom loading messages |
| `fh_mealTemplates` | JSON array | Meals | Fallback only — migrated to Firestore `mealTemplates` collection on first Firebase-enabled run |
| `fh_budgetItems` | JSON array | Budget | Fallback only — migrated to Firestore on first Firebase-enabled run |
| `fh_familyMembers` | JSON array | To-Do | `[{ name }]` — used to populate assignee dropdown |
| `fh_icsSubs` | JSON array | ICS Subscriptions | Fallback only — migrated to Firestore `icsSubs` collection (deduped by URL) on first Firebase-enabled run |
| `fh_icsCache` | JSON object | ICS Subscriptions | Always local — fetched-event cache, not shared state |
| `fh_birthdays` | JSON array | Life Admin | Fallback only — migrated to Firestore `birthdays` collection |
| `fh_medications` | JSON array | Life Admin | Fallback only — migrated to Firestore `medications` collection |
| `fh_school` | JSON array | Life Admin | Fallback only — migrated to Firestore `schoolPeriods` collection |
| `fh_trash` | JSON array | Life Admin | Fallback only — migrated to Firestore `trashPickups` collection |
| `fh_countdowns` | JSON array | Countdowns | Fallback only — migrated to Firestore `countdowns` collection |
| `fh_newsFeeds` | JSON array | News Feed | Fallback only — migrated to Firestore `newsFeeds` collection (deduped by URL) |
| `fh_stockTickers` | JSON array | Stock Ticker | Fallback only — synced via Firestore `settings/stockTickers` doc otherwise |
| `fh_shopCategories` | JSON array | Shopping | Fallback only — synced via Firestore `settings/shopCategories` doc otherwise |
| `fh_mowConfig` | JSON object | Mow Advisor | Fallback only — synced via Firestore `settings/mowConfig` doc otherwise (only user-set override keys, defaults come from `MOW_CONFIG`) |
| `fh_wotd` | JSON object | Word of Day | `{ date, word, phonetic, partOfSpeech, definition, example }` |
| `fh_dadjoke` | JSON object | Dad Joke | `{ date, joke }` |
| `fh_assistantName` | string | Assistant | Display name (default `'Family Assistant'`) |
| `fh_assistantTTS` | bool | Assistant | Read replies aloud via TTS (default off) |
| `fh_tvMode` | bool | TV Mode | TV / Display Mode on/off (default false) |
| `fh_eggCategories` | JSON object | Easter Eggs | `{ phrases, calendar, ui, weather }` — all true by default |
| `fh_eggFranchises` | JSON object | Easter Eggs | `{ [franchiseId]: bool }` — per-franchise on/off pick within the `phrases` category, all true by default |
| `fh_saver` | bool | Screensaver | Idle photo screensaver on/off (default false) |
| `fh_saverIdleMin` | number | Screensaver | Minutes idle before start (default 10) |
| `fh_saverDwellSec` | number | Screensaver | Seconds per photo (default 20) |
| `fh_saverClock` | bool | Screensaver | Clock overlay (default true) |
| `fh_saverInfo` | bool | Screensaver | Temp + next event line (default true) |
| `fh_saverNight` | bool | Screensaver | Night dimming (default true) |
| `fh_saverNightStart` | string | Screensaver | Night window start `HH:MM` (default `22:00`) |
| `fh_saverNightEnd` | string | Screensaver | Night window end `HH:MM` (default `06:30`, wraps midnight) |
| `fh_eventLocation` | string | Event Discovery | Default search location (default `'Rochester'`) |
| `fh_eventMaxDistance` | number | Event Discovery | Max distance in minutes driving time (default 120) |
| `fh_mobileTab` | string | Mobile (§20) | Current mobile tab — `'cal'` or any `MOBILE_TABS` key; invalid/disabled values bounce to `'cal'` |
| `fh_mobileTabDate` | string | Mobile (§20) | YYYY-MM-DD of last mobile tab switch (for time-based defaults) |

**Firestore collections:**

| Collection | Ordered by | Used by |
|---|---|---|
| `shopping` | `createdAt` | Shopping list |
| `todo` | `createdAt` | To-Do list |
| `budget` | `createdAt` | Budget |
| `mealPlan` | — (doc per date key) | Meal Planning |
| `familyMembers` | `createdAt` | To-Do assignees, Chore Chart members + points |
| `chores` | `createdAt` | Chore Chart |
| `icsSubs` | `createdAt` | ICS calendar subscriptions |
| `birthdays` | `createdAt` | Life Admin card |
| `medications` | `createdAt` | Life Admin card |
| `schoolPeriods` | `createdAt` | Life Admin card |
| `trashPickups` | `createdAt` | Life Admin card |
| `countdowns` | `createdAt` | Countdown timers |
| `mealTemplates` | `createdAt` (display date string) | Meal Plan Templates |
| `newsFeeds` | `createdAt` | News Feed widget |
| `settings` | — (fixed doc id per key: `shopCategories`, `stockTickers`, `weatherLocations`, `mealDietPrefs`, `mowConfig`) | Single-value config synced whole via `saveFsSetting(fsKey, lsKey, value)` |

**IndexedDB:** `fh_bgImages` (object store `images`) — stores downloaded photo blobs for background slideshow
