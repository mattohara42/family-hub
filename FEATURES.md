# Family Hub — Feature Map

*Last updated: 2026-06-01*

A living reference of every feature, its key functions, state variables, localStorage keys, and HTML anchor points. Update this file whenever a feature is added or significantly changed.

---

## Architecture

- **Three files:** `family-hub.html` (structure), `family-hub.css` (all styles), `family-hub.js` (all logic)
- **Served via:** Netlify (production) or `python3 -m http.server 8080` → `http://localhost:8080/family-hub.html` (local dev)
- **Config block:** Top of `family-hub.js` — `FIREBASE_CONFIG`, `GOOGLE_CLIENT_ID`, pinned API constants
- **State:** Mix of `let` globals + `localStorage` + IndexedDB (photos only)
- **Shared state:** Firebase Firestore (shopping list, to-do list, budget)
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
const OWM_API_BASE     = 'https://api.openweathermap.org/data/2.5';
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

**API:** OpenWeatherMap v2.5 (free tier) via `OWM_API_BASE`
**Multi-location:** Supports any number of saved cities; nav arrows and dot indicators appear when >1 location.

**State:**
```js
let weatherKey          = WEATHER_API_KEY || localStorage.getItem('fh_wkey') || '';
let weatherLocations    = lsGet('fh_wlocations', []);  // array of city strings
let weatherLocIdx       = 0;                           // currently-displayed index
const weatherCache      = {};                          // { cityKey: { ts, data } } — in-memory
const WX_CACHE_TTL      = 30 * 60 * 1000;             // 30-minute cache TTL
let sunArcEnabled       = lsGet('fh_sunArc', true);   // sun-path arc on/off
```

**Key functions:**
- `showWeatherLocation(idx)` — loads (or restores from cache) weather for `weatherLocations[idx]`
- `loadWeatherByCity(city)` — fetches current + forecast from OWM, builds data object, caches it
- `renderWeatherData(data)` — populates all weather DOM elements from a data object
- `renderSunArc(data)` — draws the optional sun-path arc (SVG): sun position between sunrise/sunset, daylight-remaining readout, golden-hour + day/night states. Gated by `sunArcEnabled`. Pure local compute (uses `sunriseTs`/`sunsetTs` epochs, no extra API call).
- `renderWeatherNav()` — draws prev/next buttons and dot indicators in `#wxLocNav`
- `prevWeatherLocation()` / `nextWeatherLocation()` — wrapping navigation
- `fetchWeather()` — reads from `#cityInput` first-time setup form
- `addWeatherLocation(city)` / `removeWeatherLocation(i)` — manage `weatherLocations` array
- `renderWeatherLocationsList()` — renders location list in Settings → Weather
- `saveWeatherLocations()` — persists to `fh_wlocations` and syncs legacy `fh_wcity`

**HTML anchors:** `#weatherDisplay`, `#weatherSetup`, `#wTemp`, `#wDesc`, `#wIcon`, `#wHigh`, `#wLow`, `#wRain`, `#wForecast`, `#wxSunArc`, `#wxLocNav`, `#wxLocDots`, `#weatherCity`, `#wxLocationsList`, `#sunArcToggle` (Settings → Weather)

**localStorage:** `fh_wkey`, `fh_wlocations` (array), `fh_wcity` (legacy, kept in sync with first location), `fh_sunArc` (bool — sun-path arc visibility)

**Migration:** On first run, any existing `fh_wcity` value is auto-migrated into `fh_wlocations[0]`.

**Gotcha:** New OWM API keys take up to 2 hours to activate.

---

### 4. Google Photos Background Slideshow

**API:** Google Photos Picker API (session-based, OAuth token required)
**Storage:** IndexedDB database `fh_bgImages` (stores downloaded blobs)
**State:**
```js
let bgPhotos = [];
let bgIndex  = 0;
let bgTimer  = null;
let slideInterval = parseInt(localStorage.getItem('fh_slideInterval')) || 30;
```
**Key functions:**
- `loadBgFromDb()` — loads stored images from IndexedDB, starts slideshow
- `startSlideshow()` / `stopSlideshow()` — manages `bgTimer` interval
- `openPhotosPicker()` — creates Picker session, opens picker popup, polls for result
- `downloadPickerPhotos(mediaItems)` — fetches each image with `Authorization: Bearer` header, stores in IndexedDB

**Gotcha:** Picker session URLs expire. If photos stop loading, re-open the picker. Download requires `Authorization: Bearer ${googleToken}` header — without it you get 403.

**localStorage:** `fh_slideInterval`

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
let appMode = localStorage.getItem('fh_mode') || 'dark'; // 'light' | 'dark' | 'nautical'
```
**Key functions:**
- `applyAppMode(mode)` — removes all mode classes, adds the correct one
- `setAppMode(mode)` — calls `applyAppMode`, saves to localStorage, updates button highlights

**Nautical-specific CSS elements:**
- `body.nautical-mode::before` — large ⚓ watermark (22% opacity), lower-right corner
- `body.nautical-mode::after` — animated `clip-path` wave along bottom edge (`nauticalWave` keyframe)
- Rope-style card header dividers (repeating-linear-gradient brass strands)
- Compass rose radial gradient on calendar card body
- Beige-gold DOW labels, today cell porthole glow, gradient brass buttons

**localStorage:** `fh_mode` — migration: `'amazing'` is auto-upgraded to `'nautical'` on load

---

### 6. Widget Placement System

Every sidebar widget can be assigned to **Sidebar** or **Bottom** via ⚙️ Settings → Widgets.

**State:**
```js
const WIDGET_DEFAULTS = { shopping: true, todo: true, budget: true, wotd: true, quote: true, dadjoke: true, yearstrip: true };
let widgetVisibility = { ...WIDGET_DEFAULTS, ...lsGet('fh_widgets', {}) };

const WIDGET_PLACEMENT_DEFAULTS = {
  shopping: 'sidebar', todo: 'sidebar', budget: 'sidebar',
  wotd: 'sidebar', quote: 'sidebar', dadjoke: 'sidebar', yearstrip: 'bottom'
};
let widgetPlacement = { ...WIDGET_PLACEMENT_DEFAULTS, ...lsGet('fh_widget_placement', {}) };

const WIDGET_ORDER = [
  { key: 'shopping',  id: 'shopCard'    },
  { key: 'todo',      id: 'todoCard'    },
  { key: 'budget',    id: 'budgetCard'  },
  { key: 'yearstrip', id: 'yearCard'    },
  { key: 'wotd',      id: 'wotdCard'    },
  { key: 'dadjoke',   id: 'dadjokeCard' },
  { key: 'quote',     id: 'quoteCard'   },
];
```
**Key functions:**
- `applyWidgetPlacement()` — moves each card DOM node to `.sidebar` or `#bottomStrip` in canonical order, then calls `applyWidgetVisibility()`
- `applyWidgetVisibility()` — shows/hides each card; handles yearstrip special case (sidebar→`#yearCard`, bottom→`#yearStrip`)

**Special case — Year at a Glance:**
- In **sidebar**: `#yearCard` (shows 2 months with ‹/› navigation)
- In **bottom**: `#yearStrip` (6-month horizontal strip, always inside `.cal-column`)

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

**SMS contacts state:**
```js
let smsContacts = JSON.parse(localStorage.getItem('fh_smsContacts') || '[]');
// each: { nick: string, phone: string }
```
**localStorage:** `fh_smsContacts`

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
**Tabs:** `look` · `calendar` · `weather` · `shopping` · `todo` · `meals` · `budget` · `widgets`
**HTML anchor:** `#settingsModal`
**Pattern:** Each tab has a `.settings-panel[data-panel="X"]` div; `switchSettingsTab` toggles `.active`

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
let mealDietPrefs  = lsGet('fh_mealDietPrefs', []);
let mealPantryDef  = localStorage.getItem('fh_mealPantry')   || '';
```
**Key functions:**
- `openMealModal(dateKey, mealType)` — opens suggestion modal
- `generateMealSuggestions()` — builds prompt, calls AI, renders results
- `callMealAI(prompt)` — fetches from Gemini or OpenAI
- `acceptMealSuggestion(i)` — saves to `mealPlan`, updates calendar views
- `addIngredientsToShoppingList(i)` — pushes ingredients to Firestore shopping

**Meal remove buttons:**
- Week view: each meal chip has a `✕` remove button (`.meal-remove-btn`) revealed on hover
- Day view: each meal slot has an inline remove button (`.day-meal-remove-btn`)

**HTML anchors:** `#mealModal`, `#mealSuggestionsWrap`, `#mealGenerateBtn`

**localStorage:** `fh_mealPlan`, `fh_mealAiKey`, `fh_mealAiProvider`, `fh_mealDietPrefs`, `fh_mealPantry`, `fh_mealLoadingMsgs`

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

## localStorage Key Index

| Key | Type | Feature | Notes |
|---|---|---|---|
| `fh_name` | string | Settings | Display name |
| `fh_mode` | string | Theme | `'light'` \| `'dark'` \| `'nautical'` |
| `fh_calView` | string | Calendar | `'month'` \| `'week'` \| `'day'` |
| `fh_calIds` | JSON array | Calendar | Google Calendar IDs |
| `fh_calMeta` | JSON object | Calendar | `{ calId: { label, color } }` |
| `fh_wkey` | string | Weather | OpenWeatherMap API key |
| `fh_wlocations` | JSON array | Weather | Array of city strings e.g. `["Boston, US", "London, GB"]` |
| `fh_wcity` | string | Weather | Legacy single city — kept in sync with `fh_wlocations[0]` |
| `fh_sunArc` | bool | Weather | Sun-path arc visibility (default true) |
| `fh_slideInterval` | string | Photos | Slideshow seconds |
| `fh_widgets` | JSON object | Widgets | `{ shopping: bool, todo: bool, … }` |
| `fh_widget_placement` | JSON object | Widgets | `{ shopping: 'sidebar'\|'bottom', … }` |
| `fh_smsContacts` | JSON array | Shopping | `[{ nick, phone }]` |
| `fh_mealPlan` | JSON object | Meals | `{ dateKey: { breakfast, lunch, dinner } }` |
| `fh_mealAiKey` | string | Meals | API key (Gemini or OpenAI) |
| `fh_mealAiProvider` | string | Meals | `'gemini'` \| `'openai'` |
| `fh_mealDietPrefs` | JSON array | Meals | e.g. `['Vegetarian', 'Gluten-Free']` |
| `fh_mealPantry` | string | Meals | Default pantry text |
| `fh_mealLoadingMsgs` | JSON array | Meals | Custom loading messages |
| `fh_budgetItems` | JSON array | Budget | Fallback only — migrated to Firestore on first Firebase-enabled run |
| `fh_familyMembers` | JSON array | To-Do | `[{ name }]` — used to populate assignee dropdown |
| `fh_wotd` | JSON object | Word of Day | `{ date, word, phonetic, partOfSpeech, definition, example }` |
| `fh_dadjoke` | JSON object | Dad Joke | `{ date, joke }` |

**IndexedDB:** `fh_bgImages` (object store `images`) — stores downloaded photo blobs for background slideshow
