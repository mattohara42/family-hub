# Family Hub — Feature Backlog

*Last updated: 2026-07-06*

Items are grouped by theme. Each entry notes the motivation and any known implementation approach.

---

## Security / Infrastructure

### Offline / PWA support — register service worker before go-live
`sw.js` and `manifest.json` already exist but the service worker is never registered. Add `navigator.serviceWorker.register('/sw.js')` to `family-hub.html` before deploying to production. Also bump `CACHE_VERSION` in `sw.js` on each deploy (or automate with a build timestamp) so users don't get stale app shell files. Dynamic data (Firebase, Google Calendar, weather, Gemini) will still require a network connection — only the app shell is cached.

### ~~Netlify Functions — API key proxies~~ ✅ Done
`netlify/functions/weather.js` and `netlify/functions/ai.js` proxy OWM and Gemini. Keys stored as Netlify env vars `OWM_KEY` / `GEMINI_KEY`. Client auto-detects whether to call direct or proxy based on whether a client-side key is present.

---

## Sharing & Sync

### ~~Shared family member list~~ ✅ Done
Family members are now stored in the Firestore `familyMembers` collection and sync in real time across all devices.

### ~~Shared budget items via Firebase~~ ✅ Done
Budget items are already in the Firestore `budget` collection and sync in real time.

### ~~Shared meal plans via Firebase~~ ✅ Done
Meal plans are now stored in the Firestore `mealPlan` collection and sync in real time across all family devices.

---

## Calendar

### ~~Swipe gestures for calendar navigation~~ ✅ Done
Touch left/right on the calendar card to advance month/week/day. Implemented via `touchstart`/`touchend` delta on `.cal-card .card-body` with a 50px threshold and vertical-scroll guard (`setupCalSwipe()`).

### ~~ICS URL calendar subscription~~ ✅ Done
Subscribe to any external calendar via a public ICS URL. Parses events inline (no CDN), polls every 4 hours, overlays events on the calendar with user-chosen color. Editable label, color, and weekdays-only toggle per subscription.

### ~~Countdown widgets~~ ✅ Done
Sidebar card showing "X days until [event]" for named target dates with emoji. Supports weekdays-only counting, event picker (pull from any subscribed/Google calendar), and inline editing of all fields.

### ~~Drag-and-drop event rescheduling~~ ✅ Done
Month-view event pills are `draggable`. Dropping on any day cell PATCHes the Google Calendar API, shifting the date by the delta while preserving time-of-day for timed events and the duration for multi-day all-day events.

### ~~Per-person event color coding~~ ✅ Done
Color picker in Settings → Family Members. `applyMemberColors()` runs after each calendar load, matching member names against event titles and stamping `ev.color`. All view renderers (month, week, day, agenda) read `ev.color` for pill background.

### ~~Create events from month view~~ ✅ Done
Clicking any day cell (or its date number) in month view opens the event editor directly. Cells get a pointer cursor and `can-add` class when signed in.

### Location field with Google Maps link
**Priority: Low**
Add a Location input to the event editor. Save it to the Google Calendar event's native `location` property (round-trips automatically via the API). In the event detail/pill view, render the location as a Google Maps link — a "view on map" link (`https://www.google.com/maps/search/?api=1&query=<encoded>`) and optionally a "directions" link (`https://www.google.com/maps/dir/?api=1&destination=<encoded>`).

*Implementation: new `<input id="evtEdLocation">` field in the editor; read/write in `openEventEditor()` / `saveCalEvent()` (`body.location`); populate from `ev.location`. Render the maps links wherever event details are shown (agenda view / event detail). No API key needed — plain maps.google.com URLs. Encode the location with `encodeURIComponent`.*

### Auto-advance End Time when Start Time moves past it
**Priority: Low**
In the event editor, when the Start Time (`evtEdStart`) is changed to a value at or after the current End Time (`evtEdEnd`), bump End Time to one hour after the new Start Time. Mirrors Google Calendar's behaviour and avoids invalid start-after-end ranges.

*Implementation: add an `onchange`/`input` handler on `#evtEdStart` that, when `evtEdEnd.value <= evtEdStart.value`, sets `evtEdEnd.value` to start + 1h (roll past midnight → clamp to 23:59 or leave, TBD). Only applies to timed events (the time section is hidden for all-day). See `toggleEvtEdAllDay()` / `saveCalEvent()` in `family-hub.js`.*

---

## Integrations

### Todoist integration
**Priority: Deferred** — not using Todoist.

### ~~Stock / portfolio widget~~ ✅ Done
Yahoo Finance, no API key. Tickers configured in Settings → 📊 Feeds. 5-min cache, color-coded % change.

### ~~News feed widget~~ ✅ Done
RSS/Atom via corsproxy.io, DOMParser. Feeds configured in Settings → 📊 Feeds. 30-min cache, interleaved round-robin headlines.

---

## To-Do

### ~~Chore chart with rewards~~ ✅ Done
`choreCard` widget with per-member progress bars, point badges, and configurable rewards. Firestore `chores` collection; points stored on `familyMembers` docs. Settings → ⭐ Chores to set reward name and threshold per member. Confetti fires when threshold is reached.

### Recurring to-do items
**Priority: Low**
Allow a to-do item to repeat daily, weekly, or monthly. On completion, the item re-appears at the next interval rather than being permanently removed.

### To-do subtasks
**Priority: Low**
Allow a to-do item to have child items (sub-tasks). Collapsible in the list view.

---

## Shopping List

### ~~Shopping list categories~~ ✅ Done
Items are tagged with a category (Produce, Dairy, Frozen, etc.) when added and grouped by aisle in the list view. Categories are collapsible and manageable in Settings → Shopping.

---

## Weather

### ~~Hourly forecast view~~ ✅ Done
A 5-day / Hourly toggle sits above the forecast. Hourly shows the next 8 × 3-hour slots (24 h). Preference persists via fh_wxForecastMode.

### ~~Geolocation auto-detect~~ ✅ Done
A 📍 button in the weather setup area uses `navigator.geolocation` + OWM reverse geocode to resolve the user's current location to a named city and add it automatically.

### Traffic / commute widget
**Priority: Low**
Show live commute time from home to a configured destination (e.g. work). Updates on a schedule and shows estimated drive time + traffic delay.

*Implementation: Google Maps Distance Matrix API (free tier up to 10,000 elements/month); requires a Maps API key (separate from OWM). Store origin/destination in Settings. Display as a small inline widget or sidebar card.*

---

## Smart Home

### Home Assistant integration
**Priority: Low**
Display and control smart home devices (lights, locks, thermostat, sensors) via Home Assistant's local REST API. Covers Nest thermostats, WiZ bulbs, and any other HA-connected device in one integration.

*Note: Matt does not currently have a Home Assistant instance. HA runs on a Raspberry Pi, NAS, or similar. Once set up, enable the REST API and generate a Long-Lived Access Token in HA → Profile.*

*Implementation: user provides HA base URL + token in Settings; poll `/api/states` for a user-configured list of entity IDs on a 2–3 min interval; POST to `/api/services/{domain}/{service}` to control devices. Render as a sidebar widget card with entity icons, current state, and toggle/slider controls. Token stored in localStorage only — never sent to a third party. Works on LAN only unless HA is exposed via Nabu Casa (~$7/mo) or VPN.*

### WiZ smart bulb control
**Priority: Low**
WiZ bulbs use a local UDP API that browsers cannot reach directly. The practical path is routing through Home Assistant (which has a native WiZ integration) — see Home Assistant integration below. Noting here for reference.

*Direct browser→WiZ is not feasible without a local proxy server. If Home Assistant is set up, WiZ lights would be exposed as HA entities and controllable through the HA integration at no extra effort.*

### Google Home / Nest thermostat integration
**Priority: Low**
Read and control Nest thermostats (current temp, target temp, humidity, HVAC mode) via the Smart Device Management (SDM) API.

*Prerequisites: (1) one-time $5 Device Access project registration at developers.home.google.com; (2) `https://www.googleapis.com/auth/sdm.service` scope added to OAuth consent screen; (3) Device Access project ID added to app config. Implementation: poll `smartdevicemanagement.googleapis.com/v1/enterprises/{projectId}/devices` every 2–3 min; PATCH to set temperature/mode. Render as a sidebar card with current temp, target, mode, humidity, and +/− controls.*

---

## Appearance / UX

### ~~System theme auto-detection~~ ✅ Done
Defaults to `prefers-color-scheme` when no theme is saved in localStorage. Nautical mode stays opt-in. A live `matchMedia` listener also updates the theme if the OS setting changes while the app is open and no manual preference is saved.

### ~~Drag-and-drop widget reordering~~ ✅ Done
HTML5 drag-and-drop via ⠿ grip handle on each card header. Order persisted in `fh_widget_order`.

### ~~Portrait / landscape orientation modes~~ ✅ Done
`body.portrait-mode` (forced) and `body.auto-portrait` (auto, toggled by `matchMedia orientation` listener) classes apply a single-column layout with sidebar cards wrapping horizontally below the calendar. Manual override select in Settings → Look & Feel persists to `fh_layoutMode`.

### PWA service worker / offline support
**Priority: Low**
Add a minimal service worker that caches the three app files and the last-fetched weather data. The app would remain usable when offline or on a slow connection, showing cached content.

*Note: Google Calendar and Firebase require network access; offline mode would be read-only.*

### ~~Per-theme `theme-color` meta tag~~ ✅ Done
Updated via `applyAppMode()` for all four themes.

### ~~Chromecast / AirPlay casting support~~ ✅ Done
TV mode (`fh_tvMode`) activated via `?tv=1` URL param or Settings → Look & Feel → 📺 TV / Display mode toggle. Hides all editing/controls chrome, enlarges text, suppresses hover effects, hides cursor after 4 s of inactivity. Escape exits.

---

## Meal Planning

### ~~Save / recall favourite meal plans~~ ✅ Done
Named templates saved in `fh_mealTemplates` (localStorage). Save Week captures the currently-viewed week (7 days Mon–Sun) as a named snapshot. Apply maps the template back onto the current week's Mon–Sun dates, prompting before overwriting existing meals. Managed in Settings → Meals.

### ~~Meal plan export to shopping list~~ ✅ Done
Per-meal "Add ingredients" button plus "🛒 Add week's ingredients to shopping" bulk button in the week view meal strip (`exportWeekMealsToShopping`).

---

## Notes
- Items without a priority estimate should be discussed before starting
- See `RETROSPECTIVE.md` for known technical gotchas relevant to each area
- See `FEATURES.md` for existing function names and localStorage keys to build on
