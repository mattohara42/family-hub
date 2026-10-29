# Family Assistant — Backlog

*Expansion ideas for the Family Assistant widget. Constraints: Gemini API (via the Meals API key), three-file no-build architecture, CDN only. The `[ACTION:type:value]` tag system is the primary extension mechanism — the model appends tags to its reply; `extractAssistantActions()` parses them and `executeAssistantActions()` runs them.*

Last updated: 2026-10-28

---

## Already Shipped (for reference)

Gemini-powered chat · live family-data context (calendar 7d, pending to-dos, shopping, budget/bills, weather location) · two actions (`addShopping`, `addTodo`) · voice **input** (SpeechRecognition → auto-send) · markdown-lite formatting · in-memory history.

**Key functions:** `buildAssistantContext()`, `sendAssistantMessage()`, `extractAssistantActions()`, `executeAssistantActions()`, `renderAssistantMessages()`, `initAssistantVoice()` in `family-hub.js`.

---

## ✅ DONE — Quick-Prompt Chips  (shipped 2026-06-04)

Clickable starter prompts in the empty chat state to lower friction. Tapping a chip fills the input and sends. Implemented via the `ASSISTANT_QUICK_PROMPTS` constant, `useQuickPrompt()`, and the empty-state render in `renderAssistantMessages()` (themed `.assistant-chip` CSS). Verified: 5 chips render, click sends the prompt, clearing the chat restores them.

**Important:** the chip list (`ASSISTANT_QUICK_PROMPTS`) is **meant to grow as new capabilities ship.** Whenever an expansion below lands (e.g. calendar events, meal planning), add a representative prompt so users discover the new power. Treat updating this list as part of every assistant feature's checklist.

---

## ✅ DONE — Expand Action Vocabulary  (shipped 2026-06-04)

Grew the `[ACTION:...]` vocabulary from 2 to **7 actions**. Multi-arg actions use a `|` delimiter, parsed in `executeAssistantActions()` (now async).

**Shipped actions** (each returns a visible confirmation appended to the reply):
- `addShopping` · `addTodo` (existing)
- **`completeTodo`** — fuzzy-match a pending to-do and mark it done
- **`checkShopping`** — fuzzy-match a shopping item and check it off (Firestore query or local scan)
- **`addEvent:YYYY-MM-DD|HH:MM|Title`** — creates a Google Calendar event on `primary` (or all-day via `allday`); refreshes the view; degrades gracefully when signed out
- **`setMeal:YYYY-MM-DD|mealType|Name`** — plans a meal via `setMealInFs`
- **`addBudget:Name|Amount|frequency`** — adds a recurring bill (sensible day defaults per frequency)

**Implementation:** per-action handlers `assistant*()` + `fuzzyTextMatch()` in `family-hub.js`; system-prompt ACTIONS section teaches all tags + relative-date→YYYY-MM-DD resolution; two new discovery chips added to `ASSISTANT_QUICK_PROMPTS` ("Plan pizza for Friday dinner", "Add a $60 internet bill monthly").

**Verified:** all handlers tested deterministically (success + not-found + bad-input paths); fuzzy matching; live end-to-end through Gemini confirmed the model emits new tags and they execute with a visible confirmation. All test data (incl. a real calendar event) cleaned up.

**Follow-ups not included:** `removeItem` (delete from a list) and editing existing events/bills — candidates for a future pass.

---

## ✅ DONE — Richer Context  (shipped 2026-06-06)

**What:** Fed the model richer real-time data so its answers sharpen.

**Added to `buildAssistantContext()`:**
- **Real weather conditions** — from `weatherCache`: temp, feels-like, hi/lo, precip %, wind, AQI, and any active NWS alerts. Degrades to city name only if cache is empty.
- **This week's meal plan** — from `mealPlan` for the next 7 days (breakfast/lunch/dinner per day).
- **Family members** — names from the `familyMembers` array, listed at the top of context.
- **Event times** — calendar events now include `at HH:MM` start times; all-day events still listed without time. Events are sorted (all-day first, then chronological).

**Guidelines added** so the model knows to use these data sources for weather questions, meal plan questions, and family member queries.

**Acceptance:** Assistant answers "is it going to rain at the game?", "what's for dinner this week?", and "who's free Saturday?" using real data.

---

## ✅ DONE — Voice Output (TTS)  (shipped 2026-06-04)

**Shipped:** Replies are read aloud via the Web `speechSynthesis` API (zero dependency), pairing with the existing mic input for hands-free use.

**Implementation:**
- `assistantTTS` state + `fh_assistantTTS` localStorage key, **default off**.
- A **🔇/🔊 toggle button** in the assistant card header (`#assistantTtsBtn` → `toggleAssistantTTS()` / `updateAssistantTtsBtn()`) — auto-hidden if the browser lacks `speechSynthesis`.
- `speakAssistant(text)` strips markdown (`**`) and emoji/symbols, then speaks (en-US, rate 1.0). Hooked after the reply renders in `sendAssistantMessage()`.
- **Interruptible:** `speechSynthesis.cancel()` runs on a new send, on clear chat, and at the start of each utterance.

**Verified:** default off; toggle flips icon + persists; text cleaning correct (`**Great**, … ✓ … 🛒` → `Great, … …`); off-state is a true no-op; no new console errors.

**Note:** uses the browser's default system voice (no voice picker). A future tweak could add voice/rate selection.

---

## Open: Spoken replies are slow on the wall panel  (found 2026-10-28)

On the Pi 3B+ panel, replies are read by Piper (voice `en_US-ryan-low`) through speech-dispatcher, set up in `family-hub-setup.md` step 10c. It sounds good, but there's a long pause before Ryan starts.

**Fixed 2026-10-29: pauses between sentences.** speech-dispatcher's generic module was cutting each reply at punctuation and running Piper once per piece, reloading the voice each time. `GenericMaxChunkLength 5000` + `GenericDelimiters "|"` in `piper.conf` make it one Piper run per reply, and the gaps went away.

**Still open: the pause before Ryan starts.** Piper on a Pi 3 makes speech at roughly real time (real-time factor ~0.9 for "low" voices) and spends ~2.6 to 4.7 s loading the voice on every run (slower when the Pi is swapping). The whole reply is written to a file before it plays, because streaming lost the start of every reply. So the wait is roughly the voice load plus the length of the reply.

**Options:**
- **Keep Piper loaded:** run Piper as a long-lived process (e.g. its HTTP server) so each reply skips the voice load, with speech-dispatcher's command calling it. Saves a few seconds, but keeps Piper in memory full time on a 1 GB Pi that's already swapping.
- **Pi 4/5:** several times faster and more memory, which shrinks the wait and would allow a "medium" voice.
- **Cloud voice (Gemini TTS):** speed independent of the Pi, but needs hub code, an allowed model in `netlify/functions/ai.js`, and plays through Chromium's own audio, which was unreliable on this Pi (see the Pond Chimes item in `SCREENSAVER_BACKLOG.md`).

---

## ✅ DONE — Full Event CRUD from the Assistant  (shipped 2026-07-07)

`editEvent` and `removeEvent` action tags in `executeAssistantActions()`:
- **`editEvent:query|date|time|title`** — `findCalEvent()` fuzzy-matches the soonest upcoming event by title; `computeEventShift()` recomputes start/end preserving duration on a date/time move (golden test `tests/event-shift.test.js`); PATCHes only the provided fields.
- **`removeEvent:query|date`** — fuzzy-match + DELETE the instance, with a named confirmation.
- `addEvent` already gained the Member field (mow advisor work).

Acts on the soonest match and names it in the confirmation so the user can correct. Timed + all-day handled; **series-scope editing deferred** (v1 edits the single instance). Verified: finder + shift helper (golden + in-app); Google PATCH/DELETE + Gemini tag-emission exercised on the deployed app.

*Deferred follow-ups:* "this event vs all events" scope for recurring series; description/location edits; discovery chips for edit/remove.

**Acceptance:** From chat, the user can reschedule, retitle, relocate, or delete an existing event and see it reflected on the calendar with a confirmation.

---

## ✅ DONE — Outdoor Task Advisor (Lawn Mowing)  (shipped 2026-07-07)

Deterministic `scoreMowWindows()` (golden test: `tests/mow-scorer.test.js`) + `getMowForecast()` (keyless Open-Meteo hourly) + `getMowBusyIntervals()` feed a 30-min-cached recommendation injected into `buildAssistantContext()` as "Best times to mow". `addEvent` action gained an optional Member (→ `fhMembers`) so the assistant can schedule the mow assigned to someone. Settings → Calendar → 🌿 Mowing (preferred day / duration / default assignee, `fh_mowConfig`). Verified end-to-end against a live forecast; Google POST + Gemini round-trip exercised on the deployed app. Design: `docs/superpowers/specs/2026-07-06-mow-advisor-design.md`.

**What:** On demand, the assistant recommends the ideal day/time to mow the lawn by scoring the weather forecast against the family calendar (e.g. "prefer Saturday; if it rains all weekend, Friday; if Fri+Sat rain but Sunday afternoon is booked, Sunday morning"), explains its reasoning, and can create the mow event assigned to a family member.

**Design decisions:** assistant delivery (not a card); on-demand v1 (proactive push deferred to Daily Briefing, P5); full comfort scoring; deterministic JS scorer feeding the assistant context (LLM explains, does not score); v1 is lawn-mowing only (engine written task-agnostic).

**Core pieces:** pure `scoreMowWindows(forecast, events, config)` (hard filters: rain / wet-grass dry-out / free-window / daylight; comfort score: preferred-day, sooner-is-better, temp, wind, dry-margin, time-of-day) · `getMowForecast()` retaining fuller Open-Meteo hourly arrays · advisor section in `buildAssistantContext()` · discovery chip · `assistantAddEvent()` extended with an optional member (`fhMembers`) — shares the member work with Priority 3.

**Depends on / relates to:** the member-assignment extension overlaps Priority 3 (Full Event CRUD); build them together or CRUD first.

**Full design:** `docs/superpowers/specs/2026-07-06-mow-advisor-design.md` — spec complete, not scheduled. Ready to hand to writing-plans when picked up.

---

## Priority 4 — Conversation Persistence

**What:** Save `assistantHistory` to `localStorage` (`fh_assistantHistory`) so the conversation survives reloads. Cap length (e.g. last ~20 turns) to bound storage. Clear button already exists.

**Acceptance:** Reloading the page restores recent conversation; clear wipes both memory and storage.

---

## ✅ DONE — Daily Briefing / Proactive Mode  (shipped 2026-07-07)

The briefing banner already existed (on-demand via the `#briefingPill`). Made it **proactive**: `maybeAutoBriefing()` opens it once per calendar day (6s after load, re-checked hourly so a long-open kiosk shows a fresh one each morning), keyed by `fh_briefingAutoShown` so it respects dismissal and never re-pops the same day. Also folded a fresh mow recommendation into the briefing context (`refreshMowReco()` in `loadDailyBriefing()`), so the Outdoor Task Advisor is now proactive too. Needs a client Gemini key (same as the existing generator). Gating verified; live generation exercised on the deployed app.

---

## Notes & Constraints

- **One AI key.** The assistant shares the Meals Gemini key (`mealAiKey`). No second provider to manage.
- **No build step.** Any helper must be inline; respect the CSP.
- **Three themes.** Chips, toggles, and any new UI must look correct in dark, light, and nautical modes.
- **Side-effects are visible.** Any action that writes/deletes must surface a confirmation in the chat.
- **Keep quick-prompts current.** Every shipped capability should add/refresh a chip in `ASSISTANT_QUICK_PROMPTS`.
