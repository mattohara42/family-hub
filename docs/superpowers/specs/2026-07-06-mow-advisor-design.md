# Outdoor Task Advisor (Lawn Mowing) — Design

*Status: Backlogged (spec complete, not scheduled). Created 2026-07-06.*

## Summary

An assistant-delivered feature that recommends the ideal day and time to mow
the lawn by scoring the weather forecast against the family calendar. On demand,
the Family Assistant answers "when should I mow this week?" using a deterministic
scoring engine, explains its reasoning (including fallbacks), and — on
confirmation — creates the mow event on the calendar assigned to a chosen family
member.

Motivating examples the design must satisfy:
- Saturday is preferred, but if it rains all weekend, recommend Friday.
- If Friday and Saturday are rained out but there's an event Sunday afternoon,
  recommend Sunday morning.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Delivery surface | **Assistant** (not a standalone card) |
| Proactivity (v1) | **On-demand** — assistant answers when asked; no auto-push. Proactive nudging deferred to the Daily Briefing feature (ASSISTANT_BACKLOG Priority 5). |
| Scoring sophistication | **Full comfort scoring** — AM/PM resolution, wet-grass dry-out rule, daylight + free-window checks, plus temp/wind comfort weighting and ranking. |
| Architecture | **Approach A** — deterministic JS scorer + inject the result into the assistant context. LLM explains, does not score. |
| Event creation | Assistant can **create the mow event and assign a family member**. |
| Task scope (v1) | **Lawn mowing only.** Scorer written task-agnostic so more tasks are config, not code. |

Rejected alternatives: pure-LLM scoring (inconsistent, untestable, contradicts
full comfort scoring); standalone card (that's the deferred proactive surface —
a natural later add on the same engine).

## Components

Three units, each independently testable.

### 1. `scoreMowWindows(forecast, events, config)` — pure function
The brain. No I/O, no DOM. Fully unit-testable with fixtures.
- **Input:** hourly forecast array (precip %, temp, wind, per hour, ~5 days,
  with per-day sunrise/sunset), calendar events (already-loaded cache), a config
  object.
- **Output:** ranked array of candidate windows:
  `[{ start, end, score, timeOfDay, reasons[], conflict, blockedReason }]`.

### 2. Data adapters (thin)
- `getMowForecast()` — next ~5 days of hourly precip/temp/wind for the **primary
  weather location**. Extends the existing Open-Meteo fetch to retain the fuller
  hourly arrays already requested at `family-hub.js` (`hourly:
  temperature_2m,weather_code,precipitation_probability,visibility` and `daily:
  … sunrise,sunset`). No new API; the current build trims these to a short strip
  and a 5-day daily outlook — we keep more of the hourly series.
- Calendar free/busy comes from the already-loaded event cache — no new fetch.

### 3. Assistant integration
- `buildAssistantContext()` gains an **"Outdoor task advisor"** section that
  calls the scorer and injects the top 2–3 windows + the recommended pick, in the
  same style as the existing weather/meals context injection.
- A quick-prompt chip ("When should I mow this week?") added to
  `ASSISTANT_QUICK_PROMPTS`.
- `assistantAddEvent()` extended to accept an optional member (see Event
  Creation).

## Data flow

```
getMowForecast() + event cache
        │
        ▼
scoreMowWindows()  →  ranked windows
        │
        ▼
injected into buildAssistantContext()  ("Outdoor task advisor" section)
        │
        ▼
user asks "when should I mow?"  →  Gemini explains pick + fallback reasoning
        │
        ▼ (optional) user confirms "add it, assign to Matt"
[ACTION:addEvent:DATE|TIME|Mow the lawn|Matt]
        │
        ▼
assistantAddEvent(..., member)  →  Google Calendar POST (with fhMembers)
        │
        ▼
loadAllCalendars() → applyMemberColors() → view refresh
```

## Scoring model

For each of the next ~5 days, build candidate windows from daylight hours
(sunrise→sunset), chunked into slots long enough to fit `mowDuration`. Each slot
is tagged morning/afternoon/evening for natural phrasing.

### Hard filters (any one disqualifies a slot)
- **Raining** — hourly rain-chance in the slot ≥ `rainThreshold` (default 40%).
- **Wet grass / dry-out** — measurable rain within the prior `dryOutHours`
  (default 8h). Can't mow wet grass even under clear skies. This is the rule a
  naive version misses.
- **No free block** — a calendar conflict leaves less than `mowDuration`
  (default 60 min) of continuous free time in the slot.
- **After dark** — slot falls outside daylight.

### Comfort score (0–100, higher = better) over survivors
- **Preferred day bonus** — large boost for the favorite day (default Saturday).
- **Sooner-is-better** — mild decay per day out, so a perfect day far off doesn't
  beat a good day now. Also naturally handles the forecast horizon.
- **Temperature comfort** — peak near an ideal band (default 60–78°F), penalized
  as it gets hot/cold.
- **Wind** — light penalty above `windComfort` (default 15 mph).
- **Dry margin** — bonus for more hours since the last rain.
- **Time-of-day** — slight morning preference (cooler; matches the "Sunday
  morning" example).

The assistant receives the ranked list plus a one-line rationale per top pick,
enabling replies like: *"Saturday's rained out and Sunday afternoon you've got
the birthday party — so Sunday 9am is your window: dry since Friday night, 72°
and light wind."*

## Event creation & family-member assignment

Extend `assistantAddEvent()` (`family-hub.js`), which today posts only
`summary/start/end`:
- Add an optional `member` parameter that sets
  `extendedProperties.private.fhMembers` (same field the editor writes), so the
  created event carries the assignee and picks up that person's color via
  `applyMemberColors()`.
- Action tag grows `addEvent:DATE|TIME|Title` → `addEvent:DATE|TIME|Title|Member`
  (member optional, backward-compatible — omitting it behaves as today).
- Validate the member name against `familyMembers` via the existing
  `fuzzyTextMatch()`; on no match, still create the event but note the name
  wasn't a known member rather than silently dropping it.
- Use the recommended slot's start time and `mowDuration` for the end (not a
  blind 1-hour default).
- Visible chat confirmation: *"✓ Added 'Mow the lawn' Sat 9:00–10:00am, assigned
  to Matt."*
- Requires Google sign-in; degrades with the existing "sign in to add events"
  message.

This member extension is general-purpose and also advances the assistant-CRUD
backlog item (ASSISTANT_BACKLOG Priority 3).

## Config

`MOW_CONFIG` defaults object; ships working with zero setup. Minimal user-facing
surface to avoid a settings explosion.
- **User-facing (Settings):** preferred day (default Saturday), mow duration
  (default 60 min), default assignee (optional).
- **Hard-coded constants (editable in source):** rain threshold, dry-out hours,
  temp band, wind comfort, scoring weights.
- Persisted under one key: `fh_mowConfig`.

## Edge cases & error handling

- **No viable window** — say so honestly and name the blocker (e.g. "every dry
  slot in the next 5 days has a conflict; the soonest free dry window is beyond
  the forecast") rather than forcing a bad pick.
- **Beyond forecast horizon** — sooner-is-better decay handles "next Saturday is
  too far to see"; the assistant notes when a recommendation is limited by
  forecast range.
- **No hourly data / weather cache empty** — degrade to day-level (daily
  rain-chance) with a note that AM/PM precision isn't available, instead of
  failing.
- **Signed out of Google** — recommendation still works (read-only); only event
  *creation* requires sign-in.
- **No family members configured** — assignment is skipped with a note;
  recommendation is unaffected.

## Testing

The scorer is a pure function → assert-based self-check with fixture forecasts +
events (no framework, matching the deterministic tests the assistant actions
already use). Key behaviors:
- Rains Saturday → picks Friday.
- Rain Fri + Sat, event Sunday afternoon → picks Sunday morning.
- Wet-grass rule blocks a clear-but-recently-rained slot.
- Conflict shorter than `mowDuration` disqualifies the slot.
- Preferred-day bonus breaks ties.
- Empty/near-empty forecast → day-level degrade, no crash.

## Out of scope (v1)

- Proactive auto-push (deferred to Daily Briefing).
- Standalone sidebar card (later add on the same engine).
- Multiple/other outdoor tasks (engine is task-agnostic; only lawn mowing ships).
- Task-management UI.

## Key touch points in `family-hub.js`

- `buildAssistantContext()` — add advisor section.
- `ASSISTANT_QUICK_PROMPTS` — add discovery chip.
- Open-Meteo fetch (~`family-hub.js:4043`) — retain fuller hourly arrays.
- `assistantAddEvent()` (~`family-hub.js:7498`) — add member param + fhMembers.
- `executeAssistantActions()` action parsing — extended `addEvent` arity.
- System prompt ACTIONS section — teach member arg + advisor guidance.
- New: `scoreMowWindows()`, `getMowForecast()`, `MOW_CONFIG`.
