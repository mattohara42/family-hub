# Family Hub — Feature Backlog

*Last updated: 2026-06-02*

Items are grouped by theme. Each entry notes the motivation and any known implementation approach.

---

## Security / Infrastructure

### Netlify Functions — API key proxies
**Priority: Medium**
Move sensitive API keys off the client by adding serverless proxy functions.

- `netlify/functions/weather.js` — proxies OpenWeatherMap; key stored as Netlify env var `OWM_KEY`
- `netlify/functions/ai.js` — proxies Gemini and OpenAI; keys stored as `GEMINI_KEY` / `OPENAI_KEY`
- Client calls `/api/weather?city=X` and `/api/ai` instead of external APIs directly
- Users no longer need to paste their own AI key in Settings → Meals
- Add basic rate limiting in the functions to prevent quota abuse

*Note: Firebase config and Google Client ID are public by design — no need to proxy these.*

---

## Sharing & Sync

### Shared family member list
**Priority: Medium**
The family members list (used for to-do assignment) is stored per-device. A single Firestore `config/familyMembers` document would mean set-it-once across all devices. Currently every device must add members manually in Settings → General.

### ~~Shared budget items via Firebase~~ ✅ Done
Budget items are already in the Firestore `budget` collection and sync in real time.

### ~~Shared meal plans via Firebase~~ ✅ Done
Meal plans are now stored in the Firestore `mealPlan` collection and sync in real time across all family devices.

---

## Calendar

### Swipe gestures for calendar navigation
**Priority: Medium**
On mobile, swipe left/right on the calendar card to go to the next/previous period (month, week, or day). Currently requires tapping the ‹/› nav buttons.

*Implementation: `touchstart` / `touchend` delta on `.cal-card .card-body`; threshold ~50px.*

### Create events from month view
**Priority: Low**
Tapping a day cell in month view currently opens the day view. Add the option to open the event editor directly from month view without switching views first.

---

## To-Do

### Recurring to-do items
**Priority: Low**
Allow a to-do item to repeat daily, weekly, or monthly. On completion, the item re-appears at the next interval rather than being permanently removed.

### To-do subtasks
**Priority: Low**
Allow a to-do item to have child items (sub-tasks). Collapsible in the list view.

---

## Shopping List

### Shopping list categories
**Priority: Low**
Allow items to be tagged with a category (Produce, Dairy, Frozen, etc.) and grouped by aisle in the list view. Makes in-store use faster.

---

## Weather

### Hourly forecast view
**Priority: Low**
The current weather widget shows a 5-day forecast. Add a toggle to switch to an hourly view for the next 24 hours. OWM free tier provides 3-hour slots, which is sufficient.

---

## Appearance / UX

### System theme auto-detection
**Priority: Low**
Respect `prefers-color-scheme: dark` as the default when no theme is saved in localStorage (instead of always defaulting to Dark mode). Nautical mode stays opt-in.

### PWA service worker / offline support
**Priority: Low**
Add a minimal service worker that caches the three app files and the last-fetched weather data. The app would remain usable when offline or on a slow connection, showing cached content.

*Note: Google Calendar and Firebase require network access; offline mode would be read-only.*

### Per-theme `theme-color` meta tag update
**Priority: Low**
The `<meta name="theme-color">` tag is currently hardcoded to `#0f1117` (dark theme). Update it via JS when `setAppMode()` is called so the browser chrome matches the active theme.

---

## Meal Planning

### Save / recall favourite meal plans
**Priority: Low**
Allow users to save the current week's meal plan as a named template ("Summer Rotation", "Busy Week", etc.) and restore it later.

### Meal plan export to shopping list
**Priority: Medium (partially implemented)**
The "Add ingredients" button already exists per-meal. Add a "Add all this week's ingredients" bulk action from the week view meal strip.

---

## Notes
- Items without a priority estimate should be discussed before starting
- See `RETROSPECTIVE.md` for known technical gotchas relevant to each area
- See `FEATURES.md` for existing function names and localStorage keys to build on
