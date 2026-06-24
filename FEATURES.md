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
├── ── EASTER EGGS ──          checkAssistantEasterEgg, checkCalendarEasterEggs, buildVogonPoetry, triggerHadouken, handleSettingsGearClick
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
- `renderWeatherTicker(data)` — scrolling ticker; shows severe-weather **alerts first** (bold, severity-colored), then precip/humidity/wind/visibility/sunrise/sunset/AQI.
- `fetchNwsAlerts(lat, lon)` — active severe-weather alerts from NWS `api.weather.gov` (free, keyless, **US-only**); returns `[{ event, headline, severity }]` sorted by severity; `[]` on failure/non-US. Stored as `data.alerts`.
- `renderWeatherNav()` — draws prev/next buttons and dot indicators in `#wxLocNav`
- `prevWeatherLocation()` / `nextWeatherLocation()` — wrapping navigation
- `fetchWeather()` — reads from `#cityInput` first-time setup form
- `addWeatherLocation(city)` / `removeWeatherLocation(i)` — manage `weatherLocations` array
- `renderWeatherLocationsList()` — renders location list in Settings → Weather
- `saveWeatherLocations()` — persists to `fh_wlocations` and syncs legacy `fh_wcity`

**HTML anchors:** `#weatherDisplay`, `#weatherSetup`, `#wTemp`, `#wDesc`, `#wIcon`, `#wHigh`, `#wLow`, `#wRain`, `#wForecast`, `#wxSunArc`, `#wxLocNav`, `#wxLocDots`, `#weatherCity`, `#wxLocationsList`, `#sunArcToggle` (Settings → Weather)

**localStorage:** `fh_wkey`, `fh_wlocations` (array), `fh_wcity` (legacy, kept in sync with first location), `fh_sunArc` (bool — sun-path arc visibility)

**Migration:** On first run, any existing `fh_wcity` value is auto-migrated into `fh_wlocations[0]`.

**External:** NWS `api.weather.gov/alerts/active?point=` (keyless) for severe-weather alerts — covered by CSP `connect-src https:`. US-only; browsers can't set the `User-Agent` NWS requests, but calls still succeed with permissive CORS.

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
const WIDGET_DEFAULTS = { shopping: true, todo: true, budget: true, chores: true, wotd: true, quote: true, dadjoke: true, yearstrip: true, assistant: true, countdown: true, news: false, stock: false };
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
- `applyWidgetPlacement()` — moves each card DOM node to `.sidebar` or `#bottomStrip` in canonical order, then calls `applyWidgetVisibility()`
- `applyWidgetVisibility()` — shows/hides each card; handles yearstrip special case (sidebar→`#yearCard`, bottom→`#yearStrip`)

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
let mealDietPrefs  = lsGet('fh_mealDietPrefs', []);
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
`checkAssistantEasterEgg(text)` — called in `sendAssistantMessage()` before the Gemini API call. Returns a canned response string or `null`. Covers 40+ triggers: LOTR, Hitchhiker's Guide, Dune, Hobbit, BSG, Star Trek, Star Wars, Seinfeld, Friends, 80s/90s movies, video game cheats (IDDQD, IDKFA), and more. See `EASTEREGGS_BACKLOG.md` for the full list.

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
| `fh_assistantName` | string | Assistant | Display name (default `'Family Assistant'`) |
| `fh_assistantTTS` | bool | Assistant | Read replies aloud via TTS (default off) |
| `fh_tvMode` | bool | TV Mode | TV / Display Mode on/off (default false) |
| `fh_eggCategories` | JSON object | Easter Eggs | `{ phrases, calendar, ui, weather }` — all true by default |
| `fh_eventLocation` | string | Event Discovery | Default search location (default `'Rochester'`) |
| `fh_eventMaxDistance` | number | Event Discovery | Max distance in minutes driving time (default 120) |
| `fh_mobileTab` | string | Mobile (U1) | Current mobile tab `'cal'` \| `'todo'` \| `'shop'` \| `'weather'` \| menu items |
| `fh_mobileTabDate` | string | Mobile (U3) | YYYY-MM-DD of last mobile tab switch (for time-based defaults) |

**Firestore collections:**

| Collection | Ordered by | Used by |
|---|---|---|
| `shopping` | `createdAt` | Shopping list |
| `todo` | `createdAt` | To-Do list |
| `budget` | `createdAt` | Budget |
| `mealPlan` | — (doc per date key) | Meal Planning |
| `familyMembers` | `createdAt` | To-Do assignees, Chore Chart members + points |
| `chores` | `createdAt` | Chore Chart |

**IndexedDB:** `fh_bgImages` (object store `images`) — stores downloaded photo blobs for background slideshow
