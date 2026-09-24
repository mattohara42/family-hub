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
│   │   │   ├── .cal-card  (#calViews → #calGrid / #weekView / #dayView / #agendaView)
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
├── ── SCHOOL DAY CYCLE ──     schoolDayNumberFor, scdAddHoliday/scdAddSubject (Week/Day view badge only, no LC_IDS entry) — settings UI lives in its own top-level 'school' tab, not 'calendar' (see below)
├── ── BUDGET ──               renderBudgetCard (context-sensitive), budgetDatesInRange, budgetEventsForDate (privacy-gated), toggleBudgetPrivacy
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

**Views:** Month · Week · Day · Agenda
**State:**
```js
let calView     = localStorage.getItem('fh_calView') || (isMobile ? 'agenda' : 'week'); // 'month'|'week'|'day'|'agenda'
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
- `changeCalPeriod(delta)` — navigates forward/back by period (the instant change; `slideCalPeriod()` wraps it with the swipe transition)
- `getWeekStart(date)` — returns the Sunday of a given week
- `loadAllCalendars()` — fetches Google Calendar events for all enabled cals
- `renderCalendarTabs()` — draws toggle rows in `#calendarCard` sidebar card

**Calendar header (3-zone grid):**
- Left: `🏠 Family Hub` app title
- Centre: `‹ [Month Label] ›` period navigator
- Right: Month / Week / Day view tabs

**Sidebar calendar card:** `#calendarCard` shows per-calendar checkbox toggles (swatch + name + checkbox). Hidden when no calendars loaded; shows "Sign in to see your calendars" placeholder when signed out.

**HTML anchors:** `#calViews` (wraps the four view containers), `#calGrid`, `#weekView`, `#dayView`, `#agendaView`, `#calMonthLabel`, `#calendarTabs` (inside `#calendarCard`), `#calendarStatus`

**Swipe / period slide:** `setupCalSwipe()` binds touch handlers to `#calViews`, the wrapper that holds all four view containers. A gesture locks to an axis after `CAL_SWIPE_AXIS_LOCK` px — vertical is handed straight back to the scroller, horizontal drags the wrapper at `CAL_SWIPE_DAMPING` (0.45) with a slight fade. Release past `CAL_SWIPE_THRESHOLD` (50px) or faster than `CAL_SWIPE_VELOCITY` (0.5 px/ms) calls `slideCalPeriod(delta, fromPx)`: it clones the active view into a `.cal-view-ghost` pinned over the wrapper, hands the drag offset to the ghost, re-renders the new period underneath via `changeCalPeriod()`, then runs both past each other in one transition. The two panes stay exactly `clientWidth + CAL_SLIDE_GUTTER` apart so they read as one filmstrip. `CAL_SLIDE_MS` (260) times the ghost teardown and must match `--cal-slide` in the CSS. Under `prefers-reduced-motion: reduce` (or while `calSliding` is already true) it falls through to a plain `changeCalPeriod()`. `calSwipeBlocked()` stands the gesture down inside a genuinely horizontally-scrollable ancestor — the week grid on a narrow screen owns that drag itself — which is why `#weekView` keeps `touch-action: pan-x`. `activeCalViewEl()` maps `calView` to the element that gets cloned and pushed.

**localStorage:** `fh_calView`, `fh_calIds` (array of calendar IDs), `fh_calMeta` (labels/colors)

**Other render-path integrations to know about when touching `renderWeekGrid()`/`renderDayGrid()`/`renderMonthGrid()`:**
- **School Day Cycle:** `renderWeekGrid()` appends a `.school-day-badge` (+ `.school-day-subjects` chips) into each day's header via `schoolDayNumberFor(dateKey)`/`schoolDaySubjectsForDayNumber(n)`; `renderDayGrid()` appends a `.school-day-section`. Month and Agenda don't show it — see the `SCHOOL DAY CYCLE` anchor-map entry near the top of this file for the full writeup. Inside `.school-day-section` (2026-09-24), the header and every subject sit on one `.school-day-line` — `.school-day-label` (flex-shrink:0) + a `.school-day-track` of `.school-day-item`s — instead of the old one-row-per-subject list, which was the tallest thing in Day view on a 2-3-subject day. `startMarqueeIfOverflowing(lineEl, trackEl)` measures `trackEl.scrollWidth - trackEl.clientWidth` a frame after render (needs real layout, so it's deferred past the synchronous `container.appendChild(wrap)` at the end of `renderDayGrid()`); only when that's positive does it set `--marquee-dist` and add `.school-day-scrolling`, which drives a `translateX` keyframe with `animation-delay: 1s` (family-hub.css) — a day that fits stays still, one that doesn't pauses a beat, then scrolls to reveal the rest and loops. `prefers-reduced-motion: reduce` swaps the animation for a plain scrollable overflow.
- **Budget:** all three views read `budgetEventsForDate(dateKey)` for their bill pills (Month's `.cal-event-budget`, Week's `.week-budget-strip`, Day's `.budget-day-section`) — see §12 Budget for the privacy-toggle gate that lives inside that one function.
- **Event pill member badges:** `.day-event-pill` is `flex-direction: column` (title above time), so `appendMemberBadges()` — which just appends siblings — would give each badge its own row below the time instead of sitting beside it. `appendPillMeta(pill, timeText, members)` (family-hub.js, next to `appendMemberBadges`) wraps time + badges in one `.evt-meta` flex row instead; called from both of `renderDayGrid()`'s pill builders (the all-day row passes `timeText: null`). Skips building the row entirely when there's neither a time nor any members, so an all-day pill with nobody assigned doesn't grow an empty row.

#### Event Details (read-only events)

Clicking any calendar event runs through **`onCalEventClick(ev)`**: ours opens the
event editor, anything read-only opens `#eventDetailsModal`. Feed events are worth
opening — the pill has no room for the broadcast network or streaming service a feed
puts in `DESCRIPTION`, the venue, or its link.

**Key functions:**
- `onCalEventClick(ev)` — the one dispatcher behind every event click in all four views and the multi-day overlay bar. Drag-to-reschedule stays gated on `isEventEditable(ev)`, so a read-only event is clickable but never draggable.
- `openEventDetails(ev)` / `closeEventDetails()` — read-only card: title, when, a `🔒 <calendar> · read-only` badge tinted with the calendar's colour, location, description, and an optional link. Needs **no** Google token (ICS subs work without one) and no-ops in `tvMode`. Description goes in via `textContent` (someone else's text) and the link renders only for `http(s)` URLs, so a feed can't smuggle a `javascript:` URI.
- `_evtDetailsWhen(ev)` — the when-line. Timed events format through `Date` (a feed's UTC start reads as local); all-day events anchor at noon and un-exclusive their `endDate`.
- `calLabelFor(calId)` — label for any calendar id: Google, ICS sub, local calendar (`LC_DEFS`), or holidays. Also used by the countdown event picker, which had its own copy of this lookup.

**HTML anchors:** `#eventDetailsModal`, `#evtDetailsTitle`, `#evtDetailsWhen`, `#evtDetailsSource`, `#evtDetailsWhere`, `#evtDetailsDesc`, `#evtDetailsLink`

**CSS:** `.evt-details-modal` / `.evt-details-head` / `.evt-details-when` / `.evt-details-source` / `.evt-details-where` / `.evt-details-desc` / `.evt-details-link`

**Gotcha:** this is why the unconditional `cursor: pointer` on `.cal-event`/`.week-event`/`.day-event-pill` (family-hub.css) is honest — every event pill really is clickable. Editable ones show `grab` instead, via `.cal-event[draggable="true"]`.

#### ICS Subscriptions (no-OAuth read-only calendars)

Subscribe to any public/secret `.ics` URL (Google, Outlook, school/sports feeds)
without signing into Google — events inject into the same `calEventCache` and
render in every calendar view, the countdown picker, and conflict detection.

**State:** `icsSubs` — Firestore collection `icsSubs` (`{id,url,label,color,weekdaysOnly}`, real-time sync across devices via `onSnapshot` in `attachFirestoreListeners()`; falls back to `lsGet('fh_icsSubs', [])` when `db` is unconfigured). `icsCache` = `lsGet('fh_icsCache', {})` (`{id:{fetchedAt,events}}`, 4 h TTL) — always local, it's just a fetch cache, not shared state.

**Key functions:**
- `parseIcs(text)` — VEVENT parser: summary/description/**location**/**url** (the last two feed the read-only details view), all-day vs timed, **TZID** (→ UTC via `tzWallToUTCISO`), **RRULE** + **EXDATE**, RFC line unfolding.
- `expandRecurrence(ev, winStart, winEnd)` — expands `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY` with `INTERVAL`/`COUNT`/`UNTIL`/`BYDAY`(weekly)/`EXDATE` across the load window (~2 mo back → ~14 mo forward). Non-recurring events pass through unchanged.
- `normalizeIcsUrl(url)` — trims and rewrites a leading `webcal://`/`webcals://` to `https://`. Sports, TV and school feeds are published with that scheme, `fetch()` can't speak it, and `ics.js` rejects any non-http(s) scheme, so without this a pasted webcal link died with the generic "could not fetch" status. Applied in `addIcsSub()` (so the stored record and the dedupe-by-URL check both use the normalized form) and again in `fetchIcsSub()` (for subs stored before it existed, or synced in from another device).
- `fetchIcsSub(sub)` — direct fetch of the normalized URL, falling back to the same-origin `/.netlify/functions/ics` proxy (keeps private feed URLs in your own infra; only on a Netlify deploy).
- `isEventEditable(ev)` — the single predicate behind every edit affordance (`!!eventId && !holiday && !readOnly`). Feed events set `readOnly: true` in `injectIcsEvent()`, so click-to-edit, drag-to-reschedule and the assistant's `findCalEvent()` all skip them while they still render normally.
- `loadIcsSubs()` — rebuilds each sub's `calEventCache` slice from scratch (no duplicate injection); `injectIcsEvent()` keys events by **local** date (no UTC day-shift).
- `addIcsSub()` / `removeIcsSub(id)` / `renderIcsSubList()` — Settings → Calendar UI.

**Gotcha — duplicate events:** `pushEventDeduped(arr, base)` (family-hub.js, above `loadAllCalendars()`) is the single gate every day's event array is written through — `cacheEvents()`'s two branches and both `injectIcsEvent()` branches all call it instead of `arr.push()`. Non-holiday events dedupe by `eventId` (only ever repeated by a genuine re-fetch of the same instance — an ICS feed re-injecting an occurrence, or two overlapping `loadAllCalendars()` calls racing into the same cache); holiday events dedupe by `summary` instead, because Google's public holiday calendar (`en.usa#holiday@group.v.calendar.google.com`) has a known history of listing the same holiday twice under two different event IDs post-migration, so an ID-based check wouldn't catch it. Add any new code path that writes into `calEventCache` through this helper too, not a raw `.push()`.

**HTML anchors:** `#icsSubList`, `#icsUrlInput`, `#icsLabelInput`, `#icsColorInput`, `#icsSubStatus` (Settings → Calendar → 📡 ICS Subscriptions)

**localStorage:** `fh_icsCache` (always); `fh_icsSubs` only as the no-Firebase fallback (migrated to Firestore on first sign-in, deduped by URL — see `runFirestoreMigrations()`)

**Server:** `netlify/functions/ics.js` proxies a single feed URL server-side (keyless; SSRF-guards loopback/private hosts).

**Gotchas:** A feed event is read-only and must stay that way: `parseIcs` stores the feed's `UID` as the event's `id`, so `eventId` is truthy and the pre-`readOnly` guards (`!ev.holiday && ev.eventId`) let it through — it opened the editor as "✏️ Edit Event" with a Delete button and was draggable, though no write could resolve to a real Google URL. Never read an event's wall clock by slicing its ISO string (`startDT.slice(11,16)`, `startDT.slice(0,10)`). ICS events are stored as UTC (`...Z`) because `parseIcs` normalizes `TZID` through `tzWallToUTCISO`, so a slice returns UTC, not local: an 8:15 PM game prefilled the event editor as 12:15 AM on the following day, while the calendar views rendered it correctly via `new Date(startDT).toLocaleTimeString()`. Use `_evtLocalTime(iso)` for times and `localDateKey(new Date(iso))` for dates — both handle all three shapes the cache holds (UTC `Z`, Google's offset, floating local). A feed URL pasted as `webcal://` works (see `normalizeIcsUrl`), but the failure status is still one message for every cause (bad URL, CORS, non-calendar response, 404), so diagnosing a rejected feed means `curl`ing it by hand. Recurrence is pragmatic — no `BYMONTHDAY`/nth-weekday/`RDATE`/`RECURRENCE-ID` overrides. `TZID` resolves via `Intl` (unknown zones fall back to floating/local). Local dev without Netlify can't use the proxy, so CORS-restricted feeds (e.g. Google's `.ics`) only load when deployed.

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
let appMode = localStorage.getItem('fh_mode') || 'auto'; // 'auto' | 'light' | 'dark' | 'nautical' | 'aurora' | 'colorblind'
let appFlavor = localStorage.getItem('fh_flavor') || 'basic'; // 'basic' | 'tactile' — design-system axis, orthogonal to appMode
```
**Auto mode (added 2026-09-17):** `'auto'` is the true default — before any explicit pick, the app already follows the device's `prefers-color-scheme`, and `'🌓 Auto'` in Settings → Look & Feel lets you opt back into that after picking something else. `resolveAppMode(mode)` maps `'auto'` to `'light'`/`'dark'` off `matchMedia('(prefers-color-scheme: light)')`; `applyAppMode()` applies classes off the *resolved* value while `appMode` itself keeps the logical `'auto'`. A `change` listener on that same media query reapplies whenever `appMode === 'auto'` — same pattern as the `'auto'` layout-orientation listener a bit further down the file. Auto only ever resolves to light/dark; Nautical/Aurora/Accessible stay manual-only picks, since they're not a day/night distinction.

**Key functions:**
- `resolveAppMode(mode)` — `'auto'` → live `'light'`/`'dark'`; anything else passes through unchanged
- `applyAppMode(mode)` — removes all mode classes, adds the one for `resolveAppMode(mode)`
- `setAppMode(mode)` — calls `applyAppMode`, saves to localStorage, updates button highlights (including the Aurora button, which `openSettings()`'s equivalent highlight block was missing before this pass)
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
- `applyWidgetPlacement()` — moves each card DOM node to `.sidebar`, `#bottomStrip`, or (under 640px, for shopping/todo/homeassistant only) its section wrapper in the mobile Lists sheet, in canonical order, then calls `applyWidgetVisibility()`. **Placement is desktop-only** otherwise: `.sidebar` itself is hidden on mobile (see §20); crossing the breakpoint re-distributes (resize handler).
- `applyWidgetVisibility()` — shows/hides each card; handles yearstrip special case (sidebar→`#yearCard`, bottom→`#yearStrip`). On mobile, if Home Assistant's widget was just disabled (locally or via settings sync) while its Lists-sheet section was open, it bounces the sheet to Shopping (see §20).

**Special case — Year at a Glance:**
- In **sidebar**: `#yearCard` (shows 2 months with ‹/› navigation)
- In **bottom**: `#yearStrip` (6-month horizontal strip, always inside `.cal-column`)

**Special case — Chore Chart:**
- In **sidebar**: per-member sections stacked vertically; add-row below card body
- In **bottom**: per-member sections tiled horizontally in a scrollable `.chore-members-row` flex container; add-row moves to the right side via CSS grid on `#choreCard`

**Drag-and-drop reordering:** `initWidgetDragDrop()` injects a `.widget-drag-handle` (⠿) into every card's `.card-header`, dragging a card onto another swaps their position in `widgetOrder` (`fh_widget_order`). Desktop-only in effect (`.sidebar`/`#bottomStrip` are), but the handle itself isn't gated by `isMobile` — it's hidden separately inside the mobile Lists sheet (`.mobile-sheet-body .widget-drag-handle`, family-hub.css) since a card's position there is fixed by `MOBILE_SHEET_SECTIONS` (§20), not draggable.

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
- `buildShoppingBody()` — formats the list into the message text (pending items only, if any are pending; otherwise everything)
- `sendToContact(phone)` — opens an `sms:` URL with `buildShoppingBody()`'s text pre-filled

**SMS popover:** `.sms-popover` uses a solid opaque background (`#1e2130` dark / `#f5f6fa` light / `#0e1e48` nautical) so it's readable over background photos.

**HTML anchors:** `#shopList`, `#shopInput`, `#shopEmpty`, `#smsPopover`, `#smsTriggerBtn`

**Mobile (2026-09-24):** `#smsTriggerBtn` goes icon-only inside the Lists sheet — its `.sms-btn-label` span ("SMS ▾") is hidden under `.mobile-sheet-body #smsTriggerBtn .sms-btn-label` (family-hub.css), leaving just 📱. The feature itself still works there (`sendToContact()`'s `sms:` link opens the phone's own Messages app, arguably the one place it works best), it just didn't need a full text button in an already-tight header row.

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

**Key functions:** `openSettings()`, `closeSettings()`, `saveSettings()`, `switchSettingsTab(tab)`, `renderSettingsNav()`
**Tabs:** driven by the `SETTINGS_GROUPS` registry (nav groups → `{tab, label, desktopOnly?}` items) — `renderSettingsNav()` builds the nav from it and filters out `desktopOnly` items when `isMobile`, so adding a tab needs no separate mobile-visibility code. Current groups:
- **General:** `look` (🎨 Look & Feel) · `screensaver` (🖼 Images, desktopOnly) · `family` (👨‍👩‍👧 Family) · `assistant` (🤖 Assistant)
- **Calendar:** `calendar` (📅 Calendar — Google Calendars, ICS subs, Countdowns, Birthdays, Medications, Trash & Recycling) · `school` (🏫 School — School Day Cycle + Hourly Class Schedule, see the `SCHOOL DAY CYCLE` anchor-map entry near the top of this file) · `events` (💡 Events) · `mow` (🌿 Mowing, desktopOnly)
- **Widgets:** `widgets` (🧩 Widget Layout, desktopOnly) · `weather` (🌤 Weather, desktopOnly) · `feeds` (📊 Feeds, desktopOnly) · `shopping` (🛒 Shopping) · `chores` (⭐ Chores, desktopOnly) · `meals` (🍽 Meals) · `homeassistant` (🏠 Home Assistant)
- **Advanced** *(gated)*: `eggs` (🥚 Easter Eggs) — hidden until unlocked

There is no dedicated `todo` or `budget` tab — To-Do and Budget have no Settings surface of their own (To-Do's only settings touchpoint is the assignee dropdown, populated from Family; Budget is managed entirely in its sidebar card, see §12).

**HTML anchor:** `#settingsModal`, `#settingsModalGear` (triple-click target in modal `<h2>`)
**Pattern:** Each tab has a `.settings-panel[data-panel="X"]` div; `switchSettingsTab` toggles `.active` on both the nav button and the matching panel — generic, keyed only by `data-panel`/`data-tab` matching `tab`
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
- `fetchMealImage(name)` — best-effort dish photo, four passes, returning `{ url, stock }` (or `null` for a blank name) and caching per lowercased name in `_mealImgCache`. **1.** exact name against TheMealDB (free, keyless) · **2.** name with leading adjectives/cooking methods stripped (`STRIP_WORD`) · **2b.** from the main food noun (`MEAL_MAIN_NOUN`) to the end, then the bare noun · **3.** a LoremFlickr food photo, which always returns something. A query is never spent twice across passes. `stock:true` marks a representative image (passes 2b and 3) — the UI shows `#mealStockLabel` and does **not** persist it; passes 1–2 are the actual dish, so they are persisted. Never throws: a failed lookup is a miss.
- `MEAL_MAIN_NOUN` — proteins and dish forms TheMealDB is worth asking about alone, with a trailing `(?:e?s)?` so plurals match ("Meatballs", "Potatoes"). Cookware (`skillet`, `sheet pan`) is deliberately absent, so a name like "Tuscan Skillet Supper" finds no noun and goes straight to the stock fallback.
- `persistMealImage(dateKey, mealType, url)` — writes an exact match onto the meal via `setMealInFs` so later opens are instant and survive reloads. `openMealDetail()` reads `meal.image` **first** and skips the lookup entirely when it's set.
- Emoji placeholder (`#mealDetailImgPlaceholder`) shows until `img.onload` fires, so it remains the final fallback if an image fails to load. Tests: `tests/meal-image.test.js`.
- `toggleMealAdjust()` — reveals/hides the Adjust section; seeds `_mealDetailIngredients` from the current meal and renders the chip editor
- `addAdjustPreset(label)` — appends a quick-adjust chip's text to the instruction input (de-duped)
- `adjustMeal()` — re-generates the current meal via `callMealAI` per the user's adjustment, replaces it via `setMealInFs` (optimistic local update), and re-opens the detail
- `deleteMealFromDetail()` — `removeMeal()` + close
- Actions: **Keep** (close, no change) · **Adjust** (edit ingredients directly, or regenerate the whole meal with AI) · **Delete**

**Adjust pane — direct ingredient editing** (no AI call; separate from the AI regenerate box below it):
- `_mealDetailIngredients[]` — working copy of the open meal's ingredients while the Adjust pane is shown
- `addMealDetailIngredient()` / `removeMealDetailIngredient(i)` / `renderMealDetailIngredientEdit()` — manage the chip list (`#mealDetailIngredientEdit`, class `.meal-ing-chip`, same pattern as the manual-entry chips)
- `saveMealDetailIngredients()` — persists `_mealDetailIngredients` onto the meal via `setMealInFs` and re-opens the detail
- `addMealDetailIngredientsToShopping()` / `addMealIngredients(idx)` — both call the shared `addIngredientsToShopping(ingredients, label)` helper (dedupes against local shopping items when `!db`)

**Meal remove buttons:**
- Week view: each meal chip has a `✕` remove button (`.meal-remove-btn`) revealed on hover
- Day view: each meal slot has an inline remove button (`.day-meal-remove-btn`)

**HTML anchors:** `#mealModal`, `#mealSuggestionsWrap`, `#mealGenerateBtn`, `#mealDetailModal`, `#mealDetailImg`, `#mealDetailImgPlaceholder`, `#mealAdjustSection`, `#mealAdjustChips`, `#mealAdjustInput`, `#mealDetailIngredientEdit`, `#mealDetailIngredientInput`

**Add-a-Meal modal tabs** (`#mealModal`): three ways to fill a slot, one shown at a time via `.event-tab` pills (reused from Event Discovery) — `selectMealModalTab('ai'|'manual'|'recipebox')` toggles `#mealTabAi` / `#mealTabManual` / `#mealTabRecipebox`. Defaults to `'ai'` each time `openMealModal()` opens.

**External:** TheMealDB `search.php?s=` (keyless) for dish photos — covered by CSP `connect-src https:` / `img-src https:`.

**localStorage:** `fh_mealPlan`, `fh_mealAiKey`, `fh_mealAiProvider`, `fh_mealDietPrefs`, `fh_mealPantry`, `fh_mealLoadingMsgs`, `fh_mealTemplates` — `fh_mealDietPrefs` (Firestore `settings/mealDietPrefs` doc) and `fh_mealTemplates` (Firestore `mealTemplates` collection) are no-Firebase fallbacks only; `saveMealTemplate()`/`deleteMealTemplate(id)` manage the templates collection.

**Manual meal entry** (in `#mealModal`, alongside the AI suggester): type a dish name (+ meal-type picker when opened from an "all" slot) and add ingredients one at a time into a chip list, then **✓ Add This Meal** calls `setMealInFs(dateKey, mealType, {name, description:'', ingredients})` directly — no AI call.
- `addManualIngredient()` / `removeManualIngredient(i)` / `renderManualIngredientList()` — manage `_manualMealIngredients[]`, the working list for the form (chips rendered into `#manualMealIngredientList`, class `.meal-ing-chip`)
- `saveManualMeal()` — reads `#manualMealName` + `_manualMealIngredients`, saves the meal, and (if `#manualMealSaveToBox` is checked) also calls `saveRecipeBoxItem()`

**Recipe Box** (`recipeBox` collection — individual reusable dishes, distinct from `mealTemplates` which save a whole *week*):
```js
let recipeBox = lsGet('fh_recipeBox', []);
// [{ id, name, ingredients: [...], createdAt: 'YYYY-MM-DD',
//    // optional — populated by URL import, absent on hand-typed recipes:
//    instructions: [...], description, image, sourceUrl, sourceName,
//    servings, totalTime /* minutes */, author, cuisine, paywalled }]
```
- `RECIPE_EXTRA_FIELDS` / `recipeExtras(src)` — the optional field list, and the picker that keeps only populated ones. **Firestore rejects `undefined`**, so every write of a recipe-shaped object goes through `recipeExtras()` rather than spreading raw parsed data
- `saveRecipeBoxItem(name, ingredients, extra)` / `deleteRecipeBoxItem(id)` — Firestore `recipeBox` collection when `db` exists, else `fh_recipeBox` localStorage fallback (same pattern as `mealTemplates`). `extra` is optional — hand-typed recipes omit it
- `recipeToMeal(r)` — recipe record → meal record, mapping `sourceUrl`→`recipeUrl` and `totalTime`→`prepTime` so the existing meal-detail popup renders imported content with no changes to its own field names
- `useRecipeBoxItem(id)` — applies a saved recipe straight to the date/meal-type the modal is open for, then closes the modal
- `renderRecipeBoxPicker()` — filters `recipeBox` by `#recipeBoxSearch` text, renders **+ Use** rows into `#recipeBoxPickList` (inside `#mealModal`); imported recipes get a `.recipe-src-badge` source chip
- `renderRecipeBoxList()` — management list (name + step/ingredient counts + **source ↗** link + delete) rendered into `#recipeBoxList` in Settings → Meals

**localStorage:** `fh_recipeBox` — Firestore `recipeBox` collection is authoritative when `db` exists; localStorage is the no-Firebase fallback only (same migration pattern as `fh_mealTemplates`).

**Import a recipe from a URL** (`schema.org/Recipe` JSON-LD) — in `#mealTabRecipebox`, below the picker. Generic: any site emitting Recipe JSON-LD works (NYT Cooking, AllRecipes, Serious Eats, food blogs). Not an NYT-specific integration; NYT Cooking is the motivating case.

**Backend:** `netlify/functions/recipe.js` — `GET /.netlify/functions/recipe?url=<encoded>`
- `200 → { ok:true, recipe }` · `422 → { ok:false, error:'no-recipe' }` (page fetched, no Recipe JSON-LD) · `4xx/5xx → { ok:false, error }`
- Server-side because browsers can't fetch cross-origin recipe pages. Sends a browser-like User-Agent (recipe sites 403 bot UAs), 15s `AbortController` timeout, 5MB cap, content-type check, and the same hostname SSRF guard as `ics.js`/`news.js`
- Parser handles every JSON-LD shape in the wild: `@type` as string *or* array, nesting under `@graph`/`mainEntity`, instructions as a string / string[] / `HowToStep[]` / `HowToSection` groups, `image` as string / array / `ImageObject`, ISO-8601 durations (`PT1H15M` → minutes), and `recipeYield` as string / number / array. A malformed JSON-LD block is skipped rather than failing the import
- Pure helpers exported on `_test` → `tests/recipe.test.js` (50 cases, no network; handler tests stub `global.fetch`)

**Client:** `importRecipeFromUrl()` → `renderRecipeImportPreview()` → `saveImportedRecipe()` (Recipe Box only) or `useImportedRecipe()` (saves **and** fills the open slot). `clearRecipeImport()` resets; `_pendingRecipeImport` holds the parsed recipe between fetch and save. Anchors: `#recipeImportUrl`, `#recipeImportBtn`, `#recipeImportStatus`, `#recipeImportPreview`.

**Instructions display:** `#mealDetailSteps` in the meal detail popup — a collapsed `<details>` with a numbered `<ol>`, shown only when `meal.instructions` is non-empty (AI-suggested meals have none). Collapsed by default so a long method doesn't push Keep/Adjust/Delete off a wall-panel screen.

**Why NYT Cooking works while paywalled:** it serves the complete Recipe JSON-LD unauthenticated even when `isAccessibleForFree: false` — the paywall gates the human-facing render, not the structured metadata (probe 2026-07-06). **This is undocumented page behavior, not a contract.** When it stops holding, the function returns `no-recipe` and the UI points at "Type It In"; `recipe.paywalled` is stored so a recipe's origin stays visible.

---

### 12. Budget

**Backend:** Firebase Firestore collection `budget` (ordered by `createdAt`) — real-time via `onSnapshot`

**Context-sensitive display:** `renderBudgetCard()` reads `calView` and `calViewDate` to show the right period:
- Month view → "Total Bills this Month" in `#budgetTotalCard` sidebar pill
- Week view → "Total Bills this Week" in `#budgetTotalCard` sidebar pill
- Day view → "Bills Today" (pill hidden; detail shown in `#budgetCard` only)
- Card hidden entirely when no items fall in the current period

**Per-device privacy toggle:** `budgetHidden` (`fh_budgetHidden`, default `false`) hides $ content — the sidebar card's bill list/totals/Add button, *and* every calendar view's bill pills (Month's `.cal-event-budget`, Week's `.week-budget-strip`, Day's `.budget-day-section`) — while leaving the sidebar card and its 👁/🙈 toggle button visible so it can be flipped back on without opening Settings. `budgetEventsForDate(dateKey)` is the single gate: it returns `[]` whenever `budgetHidden` is true, and every calendar render path reads budget-by-date through it, so gating lives in one place. `toggleBudgetPrivacy()` flips the flag, persists it to `localStorage` (not synced — per-device on purpose, same reasoning as the Home Assistant token), and calls `renderCurrentView()`, which re-renders the active calendar view and ends by calling `renderBudgetCard()` → `applyBudgetPrivacy()`, refreshing both surfaces from one call. Independent of `widgetVisibility.budget`, which controls whether the sidebar card exists on a device at all — a device can keep the card enabled and just toggle content visibility with this instead.

**Mobile control (2026-09-24):** the sidebar card's 👁/🙈 button doesn't exist on mobile (sidebar is unconditionally hidden under 640px — §20), so `budgetHidden` had no mobile control at all even though it gates Month's pills and Day's "Bills Due Today" section, both of which mobile can see. `#calBudgetPrivacyBtn` puts the same toggle in the calendar header (beside the 🏠 Lists icon in `.cal-title-zone`, 2026-09-24), shown only when `isMobile && budgetItems.length` — no point surfacing it for a household that hasn't entered any bills. `applyBudgetPrivacy()` sets its icon/title identically to the sidebar button and drives its visibility; the `resize` listener calls `applyBudgetPrivacy()` on every breakpoint crossing (alongside `applyWidgetPlacement()`) so it appears/disappears correctly without a page reload.

**State:**
```js
let budgetItems = []; // live from Firestore onSnapshot
let budgetHidden = lsGet('fh_budgetHidden', false); // per-device privacy toggle
```
**Key functions:**
- `budgetDatesInRange(item, startD, endD)` — returns `['YYYY-MM-DD', ...]`
- `budgetEventsForDate(dateKey)` — budget items due on one date; gates on `budgetHidden` (see above)
- `renderBudgetCard()` — context-sensitive; called from `renderCurrentView()`; ends with `applyBudgetPrivacy()`
- `applyBudgetPrivacy()` / `toggleBudgetPrivacy()` — the privacy toggle
- Firestore `onSnapshot` (collection `budget`) keeps `budgetItems[]` live

**HTML anchors:** `#budgetCard`, `#budgetTotalCard`, `#budgetTotalInner`, `#budgetCardLabel`, `#budgetPrivacyBtn`, `#budgetHiddenNotice`, `#budgetAddBtn`, `#calBudgetPrivacyBtn` (mobile-only privacy toggle, in the calendar header — §20)

**localStorage:** `fh_budgetItems` (fallback only, auto-migrated to Firestore on first Firebase-enabled run) · `fh_budgetHidden` (always local — per-device privacy toggle, never synced)

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

**Action vocabulary** (`[ACTION:...]`): `addShopping` · `addTodo` · `completeTodo` · `checkShopping` · `addEvent:YYYY-MM-DD|HH:MM|Title|Member` (Google Calendar `primary`; `allday` for no time; `Member` optional) · `editEvent` · `removeEvent` · `setMeal:YYYY-MM-DD|mealType|Name` · `addBudget:Name|Amount|frequency`. Handlers: `assistantAddShopping/AddTodo/CompleteTodo/CheckShopping/AddEvent/EditEvent/RemoveEvent/SetMeal/AddBudget`, plus `fuzzyTextMatch()`.

**Member routing:** `assistantAddEvent()` assigns a family member (writes `extendedProperties.private.fhMembers`, which drives `applyMemberColors()`). The `Member` arg is resolved via `resolveFamilyMember()` (strips possessives, longest-name-first partial match); if omitted, `detectMemberInTitle()` still picks up a member named in the title (e.g. "Jake's dentist" → Jake). The system prompt instructs the model to fill `Member` for person-specific events.

**HTML anchors:** `#assistantCard`, `#assistantCardTitle` (renamed by `applyAssistantName`), `#assistantMessages`, `#assistantInput`, `#assistantMicBtn`, `#assistantTtsBtn`, `.assistant-chip`
**localStorage:** `fh_assistantTTS` (bool — read replies aloud), `fh_assistantName` (string — display name)

**Mobile surface (added 2026-09-17):** `#assistantCard` is reparented into `#mobileSheetAssistant` under 640px via `MOBILE_SHEET_SECTIONS.assistant` (§20), with its own Lists-sheet tab (`#mobileListsAssistantTab`, hidden unless `widgetVisibility.assistant`). Its Settings tab (`SETTINGS_GROUPS`, tab `'assistant'`) is reachable on mobile too — no `desktopOnly` — so the Gemini API key can be set from a phone; in production `mealAiKey` blank routes through `/.netlify/functions/ai` anyway, so a phone-specific key isn't required for the chat itself to work. `initAssistantVoice()` needed no changes to become reachable — it already feature-detects `SpeechRecognition`/`webkitSpeechRecognition` and was already called unconditionally from the load listener. Two copy changes made the mic-blocked/mic-priming/network-error messages browser-neutral instead of hardcoding "Chrome" (now reachable from Android Chrome and iOS Safari too): `showMicDeniedHelp()` branches on `isIOSDevice()` (`/iPad|iPhone|iPod/.test(navigator.userAgent)`) for the right permission path, since iOS Safari has no in-page address-bar 🔒 icon. See the CLAUDE.md gotcha "Mobile SpeechRecognition is best-effort" — the deeper iOS behavioral quirks (interim results, no Permissions API) are unverified on a real device.

**Requires:** Gemini key for chat; Google sign-in for `addEvent` (degrades gracefully otherwise).

**On-screen keyboard (kiosk):** For keyboardless wall displays. Opt-in via Settings → Look (`oskEnabled`, `fh_osk`, default off); never shown on phones (`isMobile`). `initOnScreenKeyboard()` (called from the load listener) delegates `focusin`/`focusout` — focusing any `[data-osk]` field (`#assistantInput`, `#evtEdTitle`, `#evtEdDesc`, `#evtEdLocation`) calls `showOnScreenKeyboard()`, which builds/renders a fixed `.osk` panel appended to `<body>`. Keys type at the caret and dispatch real `input` events (so handlers like `geocodeEvtEdLocation()` fire); `⇧` is one-shot shift, `?123`/`ABC` toggle a symbols layer, `↵` fires the field's own Enter (send for the assistant, newline in a textarea), `⌫` backspaces, `⌨✕` dismisses. Keys `preventDefault` on mousedown to keep the field focused. Functions: `buildOnScreenKeyboard`, `renderOnScreenKeyboard`, `onOskKey`, `oskInsert`, `oskBackspace`, `oskEnter`, `showOnScreenKeyboard`, `hideOnScreenKeyboard`, `initOnScreenKeyboard`.

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
6. **Fairport Festivals** — the village's published festival season (curated table in the function, no API)
7. **Town of Pittsford** — the town's municipal calendar (concerts, movie nights, festivals), scraped from its Drupal page

Sources 6 and 7 both emit `source: 'towns'` and share the single "🎪 Town Events" tab; cards are told apart by `location.address` ("Fairport Village" / "Town of Pittsford"). `sourceStatus` keeps a separate entry per source so `sourceStats` still shows which one produced what.

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
- `fetchTicketmaster()`, `fetchOpenStreetMap()`, `fetchLibraryWeb()`, `fetchRedWings()`, `fetchCitySpark()`, `fetchFairport()`, `fetchPittsford()` — per-source fetchers
- `expandFairportSchedule()` / `addDaysISO()` — expand `FAIRPORT_SCHEDULE` (one-offs, `days` for multi-day runs) and `FAIRPORT_WEEKLY` (every 7 days between `start` and `end`) into one dated event per occurrence
- `parsePittsfordEvents(html)` — pull the event list out of the town page's `drupal-settings-json` blob and drop the municipal noise (pure; unit-tested)
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
- Fairport Festivals is a **hand-maintained table for one season** (currently 2026, transcribed from the FairportFestivals.com poster). It needs re-typing from the new poster each spring. Until then the 35-day window quietly returns nothing rather than showing stale dates. All events sit at the village center, with the real venue (Kennelly Park, Center Park) carried as text in `location.address`; the card shows that in place of the distance
- Pittsford: no iCal/feed — the Drupal `fullcalendar_view` page embeds the *whole* event list (~1400 items, 1.4 MB) as JSON in `drupal-settings-json`, so one fetch gets everything; cached 6 h. Their taxonomy is unreliable (the Food Truck Festival is tagged "Board Meeting"), so noise is filtered by colour for holidays/closures **only** (`#ac394b`, `#987b2a`) plus a title regex for the actual boards. Being a scrape it will break on a redesign — the failure is visible as `pittsford` in the response `warnings`
- Dateless events (OpenStreetMap POIs, some library events) show "Anytime" in modal; require date selection if added to calendar

---

### 19. Screensaver

**Overview:** Idle-triggered full-screen ambient display with two modes — a **photo slideshow** and **Pond Chimes** (SCREENSAVER_BACKLOG.md S1+S3+S5). After N minutes without pointer/key/touch activity, fades to a black overlay showing either the background photo pool (`bgPhotos` — same IndexedDB pool as the background slideshow) with slow Ken Burns pan/zoom, or the vendored Pond Chimes pond in a same-origin iframe. Both carry an optional drifting clock (burn-in protection) and an optional info line (current temp + next calendar event). A configurable night window switches to a dim clock-only mode. Doesn't activate when the tab is hidden, or — in photo mode only — when the photo pool is empty.

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
let saverMode      = lsGet('fh_saverMode', 'photos');       // 'photos' | 'pond'
let saverPondSound = lsGet('fh_saverPondSound', true);      // pond audio on/off
let saverPondTap   = lsGet('fh_saverPondTap', 'play');      // 'play' | 'wake'
let saverActive   = false;                          // runtime only
let lastWxData    = null;  // set by renderWeatherData(); reused for the temp line
```

**Key functions:**
- `resetSaverIdleTimer()` — (re)arms the idle timeout; no-op when disabled or already active
- `startScreensaver()` — activates overlay; guards: enabled, not active, tab visible, and (photo mode only) photos exist — else re-arms; computes night state before the first photo, then mounts the pond or the first photo per `saverMode`
- `stopScreensaver()` — fades out, clears timers + night class, hides the wake button, removes photo layers / the pond iframe after the fade, re-arms
- `startSaverPond()` / `stopSaverPond()` — create/destroy the `#saverPond` iframe (`pond/index.html`). Destroying it is what stops the pond's rAF loop, weather interval and audio graph; `lastWxData.lat/lon` are passed as query params so the pond skips its own geolocation prompt
- `applySaverPondSound(frame)` — same-origin reach into the pond's `initAudio()` / `Tone.getDestination().mute`; wrapped in try/catch so a refused autoplay leaves a silent pond, not a broken one
- `wireSaverPondWake(frame)` — attaches wake listeners inside the iframe document (its pointer events never reach the hub's window listeners): `'wake'` → pointerdown/touchstart/keydown/wheel; `'play'` → keydown only, so every pointer event belongs to the pond
- `updateSaverModeFields()` — Settings: shows the dwell row or the pond options per the selected mode
- `advanceSaverPhoto()` — appends the next photo `<img>` (random `kb0–kb3` Ken Burns class, inline `animationDuration` = dwell + 4s), crossfades, retires the previous layer, schedules itself; no-op during night
- `updateSaverOverlay()` — every 10s: time + date, temp (`lastWxData` + `WX_ICONS`), next event, night transitions (entering night drops photo layers + pauses cycling; exiting resumes), ±30/±20px drift
- `getNextCalendarEvent()` — soonest timed event later today across enabled calendars (skips holidays + `disabledCals`), else tomorrow's first event; returns display text or null
- `saverInNightWindow(d)` — HH:MM window test, handles midnight wrap
- `saverActivity(e)` — global listener (`pointerdown`/`pointermove` throttled 1/s/`keydown`/`touchstart`/`wheel`): wakes if active, else re-arms; `visibilitychange` stops when hidden

**Night mode:** `#screensaver.night` — photos hidden/dropped, the pond iframe destroyed and the wake button hidden, info hidden, clock forced visible at 35% opacity (even if the clock toggle is off). Leaving the window re-mounts whichever mode is selected.

**Pond Chimes mode:** the pond is vendored verbatim at `pond/` as a **git subtree** of `mattohara42/pond-chimes` (`git subtree pull --prefix=pond https://github.com/mattohara42/pond-chimes main --squash` to re-sync). It runs in a same-origin iframe so its globals and its `html, body` CSS reset stay in their own document — nothing in `pond/` is edited, and the two parent-side tweaks (audio, hiding the pond's own title card) reach in from the hub. Requires `frame-src 'self'` in the `family-hub.html` CSP **and** `X-Frame-Options = "SAMEORIGIN"` (not `DENY`) in `netlify.toml`. `pond/` is not in the service worker's `APP_SHELL` — the fetch handler runtime-caches it on first use, like the Tactile fonts.

**HTML anchors:** `#screensaver` (fixed overlay, `z-index: 20000` — above modals, below easter-egg layers), `#saverClock` / `#saverClockTime` / `#saverClockDate` / `#saverInfo` (`#saverInfoWx`, `#saverInfoEvent`), `#saverWakeBtn` (pond play-mode wake), `#saverPond` (created at runtime)

**CSS:** `/* ── Screensaver ── */` section — `.saver-img` (crossfade + `saverKb0–3` keyframes), `#screensaver.active`, `#screensaver.active.pond` (restores the cursor the slideshow hides), `#screensaver.night`, `#saverPond`, `#saverWakeBtn`, `#saverInfo`, tactile flavor uses `--font-display` for the clock

**Settings:** Screensaver/Background tab (General group) → Screensaver section: enable toggle, mode select (photos / pond), idle minutes (1–240), dwell seconds (5–600, photo mode), pond sound toggle + pond tap behavior (pond mode), clock toggle, weather & next event toggle, night dimming toggle + from/to times. Wired in `openSettings()` / `saveSettings()`; init armed from the `load` handler.

**localStorage:** `fh_saver`, `fh_saverIdleMin`, `fh_saverDwellSec`, `fh_saverClock`, `fh_saverInfo`, `fh_saverNight`, `fh_saverNightStart`, `fh_saverNightEnd`, `fh_saverMode`, `fh_saverPondSound`, `fh_saverPondTap`

**Mobile:** never activates under 640px — `resetSaverIdleTimer()`/`startScreensaver()` bail when `isMobile` (battery + OS lock screen); crossing the breakpoint re-arms/disarms via the resize handler. The Settings toggle governs desktop/kiosk only.

---

### 20. Mobile Layout (permanent Calendar + Lists sheet)

**Overview (redesigned 2026-09-16, replacing the old bottom-nav/tab-registry system):** Under 640px there is no bottom nav bar. `.sidebar` is unconditionally hidden and Calendar (`.cal-column`) is the only permanent surface — mirrors "mostly on Day/Agenda, want to glance at the week, want to add fast" over the old always-visible five-tab bar. One floating button remains, `#mobileAddFab` (bottom-right, calls `openEventEditor(null)` — quick-add defaulting to today); the Lists sheet opens from the 🏠 app icon in the calendar header instead of its own FAB (moved 2026-09-17 — a dedicated `#mobileListsBtn` FAB existed briefly first). The 💡 Find Events trigger is hidden from the calendar header on mobile and lives in the sheet's footer instead. The ⚙️ Settings gear (also hidden from the sidebar chrome, which is gone on mobile) is not in the sheet — it's `#calSettingsBtn`, its own header nav item pinned to the top-right corner of row 1 (added 2026-09-24, moved out of the sheet footer so Settings doesn't require opening the Lists drawer first).

**The app icon as the Lists trigger:** `.cal-app-emoji` is a real `<button onclick="openMobileLists()">` (`applyAppTitle()` in family-hub.js rebuilds it on every title/icon change, so both the static HTML and that template stay in sync). `openMobileLists()` no-ops when `!isMobile`, since `.mobile-sheet`'s CSS only exists under the 640px query — so the button is harmless if triggered on desktop. Desktop keeps the old borderless look (button chrome reset to `border:none;background:none;padding:0`); the 640px query re-adds a visible `border`/`background`/`border-radius` so it reads as an actual button rather than a decorative emoji. The icon already carried a 7-tap fireworks Easter egg (`setupEmojiFireworks()`, unconditional `addEventListener`, unrelated to the inline `onclick`) — both handlers fire on every click, harmlessly.

**Lists sheet — registry (single source of truth):**
```js
const MOBILE_SHEET_SECTIONS = { shopping: 'mobileSheetShop', todo: 'mobileSheetTodo', homeassistant: 'mobileSheetHome', assistant: 'mobileSheetAssistant' };
// widget key → id of the section wrapper (in the sheet markup) it's reparented into
```
`applyWidgetPlacement()` reparents the real card (`#shopCard`/`#todoCard`/`#haCard`/`#assistantCard`) into its section wrapper when `isMobile`, instead of `sidebar`/`bottomStrip` — no duplicated markup, so every existing render function (`addShop()`, `renderShopList()`, `sendAssistantMessage()`, etc.) keeps working unmodified regardless of which container holds the card. `setMobileListsSection(section)` toggles `.active` on the matching tab button and section wrapper; not persisted — the sheet always opens on Shopping (`mobileListsSection` starts `'shop'`). Home Assistant's tab (`#mobileListsHomeTab`) and Assistant's tab (`#mobileListsAssistantTab`) are each hidden unless their widget is on (`widgetVisibility.homeassistant` / `widgetVisibility.assistant`), same as their old nav-button gating; `applyWidgetVisibility()` also bounces the sheet to Shopping if the open section's widget gets disabled out from under it (added 2026-09-17 for Assistant, alongside the pre-existing Home Assistant case).

Secondary widgets (Chores, Word, Joke, Quotes, Countdown, News, Stock, Year-at-a-Glance) still have no mobile surface — unchanged from before this redesign; they're reachable only via Full Settings' configuration panels, not for day-to-day use on a phone. Assistant moved out of that group (2026-09-17) since voice input is meaningfully phone-first; its Settings tab followed (see §15) so the API key can be set from a phone too. Budget has no sheet section or Settings tab either, but it's no longer fully unreachable: `#calBudgetPrivacyBtn` in the calendar header exposes just its privacy toggle (see §12 "Mobile control") since the bill pills it gates render right there on Month/Day.

**Sheet cards lose their own title:** `.mobile-sheet-body .card-header h2 { display: none }` hides each reparented card's `<h2>` inside the sheet, since the active tab (`🛒 Shopping`, `✅ To-Do`, …) already names the list — showing it twice was the biggest single contributor to the sheet reading as "busy" (tabs row, then a repeated title row, then the list's own input row, then the sheet's footer). The header row's action buttons (SMS ▾, refresh, clear-done/-all) stay and get `justify-content: flex-end` in this context now that they're the row's only child. A future sheet section's card needs the same shape — title in the `h2`, actions in a sibling wrapper — to pick this up automatically. Two more header-row things follow suit (2026-09-24), cut for the same "busy" reason but each still functional, not removed: the `.widget-drag-handle` (⠿) has no meaning once a card's sheet position is fixed by `MOBILE_SHEET_SECTIONS`, so it's hidden entirely (see §6); Shopping's `#smsTriggerBtn` just goes icon-only, since `sendToContact()`'s `sms:` handoff to the phone's own Messages app still works fine without a text label (see §7).

**Key functions:**
- `openMobileLists()` / `closeMobileLists()` — show/hide `#mobileListsOverlay` (inline `style.display`, not a CSS class)
- `setMobileListsSection(section)` — switches which of Shopping/To-Do/Home/Assistant is showing inside the sheet
- `updateIsMobile()` + resize handler — `isMobile` (<640px); breakpoint crossings re-run `applyWidgetPlacement()` (moves cards between sidebar/bottomStrip/sheet), `applyBudgetPrivacy()` (shows/hides `#calBudgetPrivacyBtn` — §12), and `resetSaverIdleTimer()`

**View toggle:** Week is hidden under 640px (`#viewTab_week`) — Month/Day/Agenda stay. The prev/next period arrows (`.cal-month-nav button`) are also hidden — both redundant with `setupCalSwipe()`, which already pages the period on a swipe regardless of which view is active (the swipe follows the finger and lands with a slide — see §Swipe / period slide). One exception: in Week view on a narrow screen the week grid scrolls sideways and keeps the gesture, so swiping there scrolls rather than pages — Week is desktop-only on mobile anyway. First-ever load (`fh_calView` unset) defaults to `'agenda'` on mobile, `'week'` on desktop; a saved value always wins either way. Day/Agenda rows are also tightened for mobile (`.day-hour-row` min-height, `.agenda-event`/`.agenda-day-header` padding) — the desktop values were sized for a wall panel, not a phone. `.cal-view-tab` pills carry their own `var(--surface)` background + `1px solid var(--line)` border + `var(--text)` label color when unselected — chosen over a shared dark track so an unselected segment doesn't blend into the (now edge-to-edge) page background in either theme; the `@media (hover:none)` touch-hover-reset rule was updated to match (resets `border-color`, not the no-longer-used muted text color).

**Compact date headers:** Day shows `"Wed 9/16"` (`shortWeekdayNumericDate()`), Agenda shows `"9/16 – 10/15"` (`_numericMDFmt`, en dash) — both via small `Intl.DateTimeFormat` instances near the top of the Day View section in family-hub.js, replacing verbose `{weekday:'long', month:'long', ...}` labels that used to truncate under the view toggle. Month keeps its own `"September 2026"` format, unrelated to this pair.

**Edge-to-edge:** the 640px query zeroes `body` padding down to safe-area insets only (notch/home indicator stay — that's hardware, not decoration) and strips `.cal-card`'s border/radius/shadow with `!important` — needed because the nautical/aurora/tactile theme overrides target `.card.cal-card` with more classes in the selector, which otherwise outranks a plain `.cal-card` rule regardless of source order.

**Mobile type scale:** the `--text-xs/sm/base/md/lg` custom properties are overridden larger under the 640px query (e.g. `--text-xs` 0.70rem → 0.80rem) — one bump that reaches everything already using the tokens, instead of chasing individual font-size rules. `#settingsModal` gets its own larger bump on top (`.settings-panel` and its children forced to `1rem`/`line-height: var(--leading-normal)`, `!important` since most panel copy is inline-styled and nothing else beats that): `.settings-section-head` 1.05rem, `.settings-nav-item` 1.05rem, `.settings-nav-label` 0.8rem, the "⚙️ Settings" dialog title 1.4rem.

**Preferences filtering:** `SETTINGS_GROUPS` items (family-hub.js) can carry `desktopOnly: true` — `renderSettingsNav()` drops those under `isMobile` (and drops a group entirely if every item in it was dropped) so Preferences only lists things that do something from a phone. Marked `desktopOnly`: Images/screensaver (never runs under 640px), Mowing (purely an Assistant-feature config, and Mowing itself has no mobile surface), Widget Layout (placement is a desktop-only concept), Weather (dropped as a mobile destination — §above), Feeds and Chores (News/Stock/Chore Chart are sidebar-only widgets). Kept: Look & Feel, Family, Calendar, Events, Shopping, Home Assistant, Assistant (2026-09-17 — its card is now in the Lists sheet, so its API key needs to be settable from a phone), Meals (its output shows up in Day view's meal slots, which mobile can reach).

**Event editor on mobile:** `#eventEditorModal .modal` used a hardcoded `max-height: 90vh`, which is iOS Safari's *large* viewport (assumes the address bar is collapsed) — with the bar visible, the modal's own footer (Save/Delete) rendered below the fold with no way to scroll to it. The 640px override switches it to `90svh` (the guaranteed-visible small viewport) and adds safe-area-aware bottom padding; needs no `!important` since it matches the original rule's ID+class specificity and simply comes later in the file.

Two more mobile-only fixes in that same override block (2026-09-24): `#eventEditorModal` (the overlay) drops to `overflow-y: hidden` on mobile: the overlay scrolls per the base `.modal-overlay` rule, and `.modal` already scrolls internally via its own `max-height`/`overflow-y: auto`, so the two nested scroll containers meant a drag near the top/bottom of the modal's content could hand the gesture to the overlay instead, moving the whole card around the viewport rather than scrolling what's inside it. Separately, the paired date/time rows (`.evt-editor-time-row`) briefly switched to `flex-direction: column` (one field per line) to dodge iOS Safari's date/time picker not always respecting the CSS box it's given (the picker has its own minimum render width, and content bled into the neighboring field instead of wrapping); that was reverted the same day in favor of trimming width back from every layer around the pair instead (`#eventEditorModal` overlay padding 10px→6px, `.modal` side padding 12px→8px, `.evt-editor-time-row` gap 6px→4px, its input padding 6px→4px, and the field's `flex-basis`/`min-width` 150px→130px), since stacking fixed the overlap but cost too much vertical space. Narrowest-tested at 320px (iPhone SE) with ~144px per field and a 4px gap; if a real device still overlaps at that width, stacking is the fallback that guarantees no overlap.

**Settings modal width/overflow:** `#settingsModal .modal`'s `max-width` is `min(calc(100vw - 2rem), 860px)` (was `min(92vw, 860px)` — a fixed margin rather than a percentage one, per an explicit request). The horizontal overflow itself (long calendar names, the ICS URL row) was never a `box-sizing` problem — the universal `* { box-sizing: border-box }` reset already covers that — it was flex items defaulting to `min-width: auto` instead of `0` at two levels: `.settings-content` (so the whole content pane refused to shrink below its widest descendant) and `.lc-item-label` (so a long name pushed `.lc-item` — and the delete button beside it — wider than the modal). Both now get `min-width: 0`; `.lc-item-label` also gets `overflow:hidden;text-overflow:ellipsis;white-space:nowrap` so a long name truncates instead of overflowing. `#settingCalList`'s own rows (`.cal-row`/`.cal-label-input`) were already correctly built (`.cal-label-input` already had `flex:1;min-width:0`) — they just inherited the overflow from the un-shrinkable `.settings-content` ancestor above them.

**Day/Agenda typography tokens:** `--fs-title`/`--fs-item`/`--fs-meta` (family-hub.css `:root`) alias into the existing `--text-md/base/sm` ladder — a semantic layer for Day/Agenda markup, not a second competing scale. `renderDayGrid()`'s previously-inline styles (section headers, the budget Total row, to-do rows, the "+" add-a-day-event trigger, the "No all-day events" placeholder) now carry classes (`.day-section-header`, `.budget-day-total`, `.day-todo-row`/`.day-todo-text`/`.day-todo-assignee`, `.day-add-btn`, `.day-allday-empty`) built on those tokens instead of ad hoc `font-size` values. Currency (`.budget-day-amt`, `.budget-day-total-amt`) and clock-time text (`.day-time-label`, `.day-hour-label`, `.evt-time`, `.agenda-time`) get `font-variant-numeric: tabular-nums`. This pass covers Day + Agenda; the rest of the app (Budget/Countdown sidebar cards, Week view, etc.) still has its own ad hoc sizes and is a follow-up, not done here.

**Agenda event fills:** the agenda renderer sets `--event-color` inline on each `.agenda-event` from `ev.color` (dynamic per event/calendar, can't be a class); the class declares `--event-color: var(--muted)` as its own fallback for events with no color. That one property drives both `border-left: 3px solid var(--event-color)` and `background: color-mix(in srgb, var(--event-color) 32%, var(--surface-solid))` (bumped from 18%, which read as pastel — a dedicated "Candy" theme was tried as a fix first and reverted in favor of this one-line change), so an event reads the same color in Agenda as it does in Month and Day. Mixing against the theme's own `--surface-solid` (defined in every theme block) keeps text contrast in range without per-theme swatches — measured 5.58:1–14.65:1 over the 11 Google Calendar colors in dark/light/nautical/aurora/colorblind. The `.agenda-dot` element is gone. `.agenda-event` uses `margin-bottom` (not a parent `gap`) so adjacent fills stay visually separated, and hover/active use `filter: brightness()` instead of swapping `background`, so the tint stays visible. Superseded `agendaPastelClass()` and `--agenda-pastel-1..6`, a 6-swatch palette hashed from the event title — removed, along with its per-theme token blocks.

**Tactile/theming:** sheet/FAB chrome derives from tokens (`--line`, `--surface-solid/-hi`, `--accent`); Tactile mobile rules (`body.flavor-tactile .mobile-sheet`) use neutral tokens only (KTD-4-safe). Touch tap-target sizing lives inside `@media (hover: none)` per the CLAUDE.md invariant.

**HTML anchors:** `.mobile-fab` / `#mobileAddFab`, `.cal-app-emoji` (Lists trigger), `#mobileListsOverlay` / `.mobile-sheet` / `#mobileListsTabs` / `#mobileListsBody` (containing `#mobileSheetShop` / `#mobileSheetTodo` / `#mobileSheetHome` / `#mobileSheetAssistant`) / `.mobile-sheet-footer`, `#calBudgetPrivacyBtn` (calendar header — §12), `#calSettingsBtn` / `.cal-header-settings-btn` (calendar header, top-right of row 1)

**localStorage:** none specific to the mobile shell — `mobileListsSection` is in-memory only, always resets to Shopping. `fh_calView` is shared with desktop (see View toggle above).

---

### 21. Home Assistant

**Overview:** Shows and controls a hand-picked allowlist of Home Assistant entities (lights, switches, fans, locks, sensors, thermostats) from a sidebar card, over HA's REST API. Off by default; useless until configured.

**The constraint:** the hub is served over HTTPS, so it cannot call a plain `http://` LAN address (mixed content, and our own `connect-src`). Home Assistant needs a real HTTPS URL. The shipped setup uses Tailscale Serve (`https://<host>.<tailnet>.ts.net`), which the blanket `https:` in the CSP already permits. HA also rejects cross-origin browser calls unless the page's origin is in `http.cors_allowed_origins`. See `family-hub-setup.md` Step 6 and `docs/plans/2026-09-07-001-feat-home-assistant-integration-plan.md`.

**State:**
```js
const HA_DEFAULTS = { baseUrl: '', entities: [] };   // entities: [{ id, name }]
let haConfig  = { ...HA_DEFAULTS, ...lsGet('fh_haConfig', {}) };  // synced: Firestore settings/homeAssistant
let haToken   = localStorage.getItem('fh_haToken') || '';         // NEVER synced — per-device house key
let haStates  = {};        // entity_id → HA state object, or { error: '…' }
let haPending = {};        // entity_id → true while a service call settles
let haEntityIdSuggestions = [];   // filled by Test Connection, feeds the settings datalist
const HA_POLL_MS = 120000, HA_TIMEOUT_MS = 10000;
const HA_TOGGLE_DOMAINS = ['light', 'switch', 'fan', 'input_boolean'];
```

**Key functions:**
- `haFetch(path, opts)` — the `calFetch()` equivalent for HA: attaches the bearer token, 10s `AbortController`, and normalizes every failure into an error carrying `haKind` (`unconfigured` | `auth` | `notfound` | `timeout` | `unreachable` | `http`). A CORS rejection and a dead host are the same bare `TypeError` in the browser, so the `unreachable` copy names both causes on purpose
- `refreshHaStates()` — `GET /api/states/<id>` per allowlisted entity via `Promise.allSettled`, not the full `/api/states`. Smaller, and one bad entity ID can't blank the card. Per-entity 404s render on their own row; anything else becomes one banner
- `renderHaCard()` — rows into `#haBody`. Domain decides the control: toggle for `HA_TOGGLE_DOMAINS`, Lock/Unlock for `lock`, read-only otherwise. `unavailable` / `unknown` / errored rows dim and lose their control
- `haToggleEntity(id)` — `POST /api/services/{domain}/{service}` with `{ entity_id }`, then `haRecheckEntity()` (fire-and-forget, so the UI isn't blocked)
- `haRecheckEntity(id, prevState)` — re-reads at 1s and 4s before handing back to the poll. Z-Wave and Zigbee devices take seconds to report; snapping the row back would call a success a failure
- `startHaPolling()` / `initHomeAssistant()` — 120s interval, skipped while `document.hidden`, refreshed on return to visible. No timer at all when the widget is off or unconfigured
- `testHaConnection()` — validates the URL/token *currently in the boxes* (not the saved pair), then loads every entity ID into `#haEntityOptions` so the ID field autocompletes
- `addHaEntity()` / `removeHaEntity(i)` / `renderHaEntitySettings()` — the allowlist editor, writing through immediately like the news-feed editor
- Pure helpers, mirrored in `tests/home-assistant.test.js`: `haEntityDomain()`, `haServiceForToggle()`, `haActionLabel()`, `haFormatState()`, `haNormalizeBaseUrl()`

**Credential handling:** an HA long-lived token can operate every entity its user can see (HA has no per-entity permission model), so the setup guide creates a non-admin `Wall Panel` account for it. The token lives in `fh_haToken` on the device that pasted it and is excluded from the Firestore settings sync, which makes it individually revocable: a lost phone costs one token, not the house.

**Anchors:**
- HTML: `#haCard` (sidebar card, reparented into `#mobileSheetHome` on mobile — §20), `#haBody`, `#mobileListsHomeTab`, settings panel `data-panel="homeassistant"` (`#haBaseUrl`, `#haTokenInput`, `#haTestResult`, `#haEntityList`, `#haEntityId`, `#haEntityName`, `#haEntityOptions`)
- CSS: `/* ── Home Assistant Card ── */` — `.ha-row`, `.ha-icon`, `.ha-name`, `.ha-state`, `.ha-btn`, `.ha-row-dim`, `.ha-empty`, `.ha-error`, `.ha-test`
- JS: `// ── Home Assistant ──`
- Registries: `WIDGET_DEFAULTS.homeassistant` (false), `WIDGET_ORDER` (`haCard`), `MOBILE_SHEET_SECTIONS.homeassistant`, `SETTINGS_GROUPS` → Widgets
- Firestore: `settings/homeAssistant` (`{ value: haConfig }`)
- Mobile: the `🏠 Home` nav button is the one optional button in the bar; `applyWidgetVisibility()` hides it unless the widget is enabled

**Testing without hardware:** `node tests/ha-mock.js` starts a fake HA on `http://localhost:8123` (flags for `--reject-auth` and `--no-cors`). `http://localhost:8123` is in the dev CSP alongside the Netlify dev port. `node --test tests/home-assistant.test.js` covers the pure helpers.

---

## localStorage Key Index

| Key | Type | Feature | Notes |
|---|---|---|---|
| `fh_name` | string | Settings | Display name |
| `fh_mode` | string | Theme | `'light'` \| `'dark'` \| `'nautical'` \| `'aurora'` \| `'colorblind'` |
| `fh_flavor` | string | Flavor | `'basic'` \| `'tactile'` — design-system axis, orthogonal to theme |
| `fh_calView` | string | Calendar | `'month'` \| `'week'` \| `'day'` \| `'agenda'` — unset defaults to `'agenda'` on mobile, `'week'` on desktop (§20) |
| `fh_calIds` | JSON array | Calendar | Google Calendar IDs |
| `fh_calMeta` | JSON object | Calendar | `{ calId: { label, color } }` |
| `fh_wkey` | string | Weather | OpenWeatherMap API key |
| `fh_wlocations` | JSON array | Weather | Fallback only — synced via Firestore `settings/weatherLocations` doc otherwise. Array of city strings e.g. `["Boston, US", "London, GB"]` |
| `fh_wcity` | string | Weather | Legacy single city — kept in sync with `fh_wlocations[0]` |
| `fh_sunArc` | bool | Weather | Sun-path arc visibility (default true) |
| `fh_slideInterval` | string | Photos | Slideshow seconds |
| `fh_photosImportedAt` | string | Photos | Epoch ms of last photo import (staleness nudge) |
| `fh_widgets` | JSON object | Widgets | `{ shopping: bool, todo: bool, … }` |
| `fh_haConfig` | JSON object | Home Assistant | Fallback only — synced via Firestore `settings/homeAssistant` otherwise. `{ baseUrl, entities: [{ id, name }] }` |
| `fh_haToken` | string | Home Assistant | Long-lived access token. **Per-device, never synced** — see FEATURES §21 |
| `fh_widget_placement` | JSON object | Widgets | `{ shopping: 'sidebar'\|'bottom', … }` |
| `fh_mealPlan` | JSON object | Meals | `{ dateKey: { breakfast, lunch, dinner } }` |
| `fh_mealAiKey` | string | Meals | API key (Gemini or OpenAI) |
| `fh_mealAiProvider` | string | Meals | `'gemini'` \| `'openai'` |
| `fh_mealDietPrefs` | JSON array | Meals | Fallback only — synced via Firestore `settings/mealDietPrefs` doc otherwise. e.g. `['Vegetarian', 'Gluten-Free']` |
| `fh_mealPantry` | string | Meals | Default pantry text |
| `fh_mealLoadingMsgs` | JSON array | Meals | Custom loading messages |
| `fh_mealTemplates` | JSON array | Meals | Fallback only — migrated to Firestore `mealTemplates` collection on first Firebase-enabled run |
| `fh_budgetItems` | JSON array | Budget | Fallback only — migrated to Firestore on first Firebase-enabled run |
| `fh_budgetHidden` | boolean | Budget | Always local — per-device privacy toggle (hides $ content in the sidebar card and all calendar views), never synced |
| `fh_familyMembers` | JSON array | To-Do | `[{ name }]` — used to populate assignee dropdown |
| `fh_icsSubs` | JSON array | ICS Subscriptions | Fallback only — migrated to Firestore `icsSubs` collection (deduped by URL) on first Firebase-enabled run |
| `fh_icsCache` | JSON object | ICS Subscriptions | Always local — fetched-event cache, not shared state |
| `fh_birthdays` | JSON array | Life Admin | Fallback only — migrated to Firestore `birthdays` collection |
| `fh_medications` | JSON array | Life Admin | Fallback only — migrated to Firestore `medications` collection |
| `fh_school` | JSON array | Life Admin | Fallback only — migrated to Firestore `schoolPeriods` collection |
| `fh_trash` | JSON array | Life Admin | Fallback only — migrated to Firestore `trashPickups` collection |
| `fh_schoolDayCycle` | JSON object | School Day Cycle | `{ startDate, endDate, cycleLength }` — fallback only, synced via Firestore `settings/schoolDayCycle` doc otherwise (defaults come from `SCHOOL_CYCLE_DEFAULTS`) |
| `fh_schoolHolidays` | JSON array | School Day Cycle | Fallback only — migrated to Firestore `schoolHolidays` collection — `[{date, label}]`, weekdays skipped when computing Day N |
| `fh_schoolDaySubjects` | JSON array | School Day Cycle | Fallback only — migrated to Firestore `schoolDaySubjects` collection — `[{subject, dayNumbers, members}]`, per-kid subject assignments keyed to the cycle's Day N |
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
| `fh_osk` | bool | On-screen keyboard | Touch keyboard for keyboardless wall displays (default false; ignored on phones) |
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
| `fh_saverMode` | string | Screensaver | `'photos'` (default) or `'pond'` |
| `fh_saverPondSound` | bool | Screensaver | Pond audio on/off (default true) |
| `fh_saverPondTap` | string | Screensaver | Pond tap behavior: `'play'` (default) or `'wake'` |
| `fh_eventLocation` | string | Event Discovery | Default search location (default `'Rochester'`) |
| `fh_eventMaxDistance` | number | Event Discovery | Max distance in minutes driving time (default 120) |

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
| `schoolHolidays` | `date` | School Day Cycle non-school-day list |
| `schoolDaySubjects` | `createdAt` | School Day Cycle per-kid subject assignments |
| `countdowns` | `createdAt` | Countdown timers |
| `mealTemplates` | `createdAt` (display date string) | Meal Plan Templates |
| `newsFeeds` | `createdAt` | News Feed widget |
| `settings` | — (fixed doc id per key: `shopCategories`, `stockTickers`, `weatherLocations`, `mealDietPrefs`, `mowConfig`) | Single-value config synced whole via `saveFsSetting(fsKey, lsKey, value)` |

**IndexedDB:** `fh_bgImages` (object store `images`) — stores downloaded photo blobs for background slideshow
