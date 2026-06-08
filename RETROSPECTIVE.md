# Family Hub — Project Retrospective
### A "How to Use Claude" Case Study

*Last updated: 2026-06-07 · Built with Claude Sonnet 4.6 via Claude Code / FleetView*

---

## What We Set Out to Build

A family dashboard — one screen on the living room TV that shows the calendar, weather, shopping list, to-dos, meals, and more. No apps to open, no subscriptions. Always on.

**Constraints we chose:**
- No build step (no npm, no webpack, no framework)
- Three files only (`family-hub.html`, `family-hub.css`, `family-hub.js`)
- Free APIs only
- Must run on a TV browser from a local server or Netlify

**Time to first working version:** ~2 hours  
**Time to current state:** ~8 sessions over 8 days

---

## The Visual Evolution

### Stage 1 — The Starting Point (Session 1, Day 1)

The first ask was simple: *"build a family dashboard."* Here's roughly what came out:

```
┌─────────────────────────────────────────────────┐
│  🏠 Family Hub                      [⚙ Settings]│
├─────────────────────────────────────────────────┤
│                                                  │
│  📍 Dallas, TX     72°F ⛅  Feels 69°           │
│  Partly cloudy · High 78° · Low 61° · Rain 10%  │
│                                                  │
├─────────────────────────────────────────────────┤
│                                                  │
│   ◀  June 2026  ▶        Month  Week  Day  Agenda│
│   Su  Mo  Tu  We  Th  Fr  Sa                    │
│    1   2   3   4   5   6   7                    │
│    8   9  10  11  12  13  14                    │
│   15  16  17  18  19  20  21                    │
│   22  23  24  25  26  27  28                    │
│   29  30                                        │
│                                                  │
├──────────────────────┬──────────────────────────┤
│  🛒 Shopping List    │  ✅ To-Do                │
│  • Milk              │  • Call dentist           │
│  • Eggs              │  • Pay electric bill      │
│  • ✓ Bread           │  • ✓ Pick up dry cleaning │
└──────────────────────┴──────────────────────────┘
```

**Stack at this point:** Single HTML file, inline CSS, inline JS. Firebase for the shopping/to-do lists. OpenWeatherMap for weather.

---

### Stage 2 — Layout Redesign (Session 2, Day 2)

The prompt: *"This feels cramped. Can we redesign it so the calendar takes up the full screen and everything else is in a sidebar?"*

Three files, full sidebar, scrollable widgets. The calendar now fills all remaining vertical space.

```
┌─────────┬───────────────────────────────────────┐
│ SIDEBAR │  📅 Family Hub    ◀ June 2026 ▶        │
│─────────│  M   W   D   Agenda                   │
│🌤 Weather  Su  Mo  Tu  We  Th  Fr  Sa            │
│ 72° ⛅ │   1   2   3   4   5   6   7            │
│ H:78 L:61│  8   9  10 [11] 12  13  14            │
│ 🚴 Ride? │  15  16  17  18  19  20  21            │
│─────────│  22  23  24  25  26  27  28            │
│🛒 Shopping  29  30                               │
│ • Milk   │                                       │
│ • Eggs   │                                       │
│ ✓ Bread  │                                       │
│─────────│                                       │
│✅ To-Do  │                                       │
│ • Dentist│                                       │
│ • Bills  │                                       │
│─────────│                                       │
│💰 Budget │                                       │
│$1,240/mo │                                       │
└─────────┴───────────────────────────────────────┘
```

**What changed:**
- Split into 3 files — CSS and JS now live independently
- Full-height calendar with flex layout
- Scrollable sidebar that doesn't affect calendar
- Weather activity tags (🚴 Great for a bike ride, 🧥 Bundle up)
- Budget tracker added
- Three themes: Light, Dark, ⚓ Nautical

**The Nautical theme** was an experiment. The prompt was literally: *"can we add a fun third theme that's naval / nautical themed?"* Claude designed the whole thing — navy background, brass-gold accents, diagonal stripe texture, animated wave footer, rope-pattern card dividers, ghosted anchor watermark.

```
╔═════════════════════════════════════════════════╗
║  ⚓ Family Hub (Nautical theme)                  ║
╠═════════════════════════════════════════════════╣
║ ┊brass border┊   calendar in navy blue          ║
║ ┊           ┊                                    ║
║ ┊  🌤 72°  ┊    [11] today's cell glows gold    ║
║ ┊          ┊                                     ║
║ ┊ 🛒 Shop  ┊                                     ║
╚═════════════════════════════════════════════════╝
≋≋≋≋≋ animated wave footer ≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
```

---

### Stage 3 — Meal Planning + Week View (Session 3)

Prompt: *"Add meal planning to the calendar week view."*

```
WEEK VIEW — June 8–14
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ Sun  │ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │
│  8   │  9   │ 10   │ 11   │ 12   │ 13   │ 14   │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│• Den-│• Pay │      │      │      │      │      │
│  tist│  bill│      │      │      │      │      │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│🍽    │🍳    │      │🥗    │      │      │🍕    │
│Pizza │Eggs  │      │Salad │      │      │Tacos │
│+ Plan│+ Plan│+Plan │+Plan │+Plan │+Plan │+Plan │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┘
```

The AI meal suggestions used Gemini — you describe what's in your pantry, it suggests meals per slot. Click a suggestion to plan it. Click a planned meal to get:

```
┌─────────────────────────────────────────┐
│  🍕 Margherita Pizza                    │
│  ────────────────────────────────────── │
│  [photo from TheMealDB]                 │
│  Classic Italian · 45 min               │
│                                         │
│  Adjust: [Make it vegetarian]           │
│           [Gluten free]                 │
│           [Swap ingredients]            │
│           [____________] → Apply        │
│                                         │
│  [Keep Plan]  [Adjust ✨]  [Delete 🗑] │
└─────────────────────────────────────────┘
```

---

### Stage 4 — Weather Deep Dive (Sessions 4–5)

Multiple targeted weather improvements, each its own prompt:

**Sun-path arc** (*"show where the sun is in the sky right now"*):
```
     ☀️ ← current position
   ·   ·
 ·       ·              ← golden arc from sunrise to now
─────────────────────   ← horizon
6:42 AM         8:14 PM
☀️ 2h 14m of daylight left
```

**24-hour temperature curve** (*"add a temperature graph view"*):
```
  82°         78°
      ·   ·       ·
  ·               ·   · 74°
────┬───┬───┬───┬───┬─────
  Now  8   12   4   8   12
       AM  PM  PM  PM  AM
  ▓ = rain probability bars
```

**NWS severe weather alerts** (*"add real weather alerts"*) — colored ticker:
```
⚠ Flash Flood Warning · 💧 Humidity 78% · 💨 Wind 12 mph NW · 🌕 Full Moon · 🌅 Sunrise 6:42 AM ···
```

**Precipitation radar** (*"add a radar map"*):
```
┌─────────────────────────┐
│  [OpenStreetMap tiles]  │  ← zoom 7, centered on location
│  + OWM precip overlay   │  ← blue/green rain blobs
│  5-day  Hourly  Curve  [Radar] │
└─────────────────────────┘
```

---

### Stage 5 — Family Assistant (Sessions 5–6)

*"Add an AI assistant that knows our family data."*

```
┌─────────────────────────────────────┐
│  🤖 Family Assistant           🔇🗑 │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ Hi! What's on this week?      │  │← user
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ You've got soccer Tuesday at  │  │← AI (knows real calendar)
│  │ 6pm, dentist Thursday, and    │  │
│  │ pizza planned for Friday! 🍕  │  │
│  └───────────────────────────────┘  │
│                                     │
│  [What's for dinner?] [Add milk] →  │  ← quick-prompt ticker
│                                     │
│  [🎤]  Type a message...     [Send] │
└─────────────────────────────────────┘
```

The assistant can **take actions** — not just chat. It recognizes phrases like:
- *"Add milk to the shopping list"* → writes to Firestore
- *"Plan tacos for Friday dinner"* → updates meal plan
- *"Remind me to call the dentist"* → adds to to-do
- *"Add a $60 internet bill monthly"* → creates budget entry
- *"Schedule soccer practice Tuesday at 6"* → creates Google Calendar event

Voice input (mic → auto-send) and voice output (text-to-speech) both work. The assistant is truly hands-free.

---

### Stage 6 — Polish + New Theme (Session 7–8)

*"Create a lighter version of the Nautical theme with yellow highlights."*

```
NAUTICAL (original)          NAUTICAL LIGHT (new)
─────────────────────        ─────────────────────
bg:      #0c1a3a (dark navy) bg:      #1a2e52 (slate)
accent:  #c8a96e (brass)     accent:  #f0c040 (bright yellow)
surface: 86% opacity         surface: 60% opacity (airier)
stripes: 20% white           stripes: 10% white (subtler)
anchor:  white @ 22%         anchor:  gold @ 14%
```

---

## Full Feature Inventory (Current State)

| Category | Feature |
|---|---|
| **Calendar** | Month / Week / Day / Agenda views |
| | Google Calendar sync (OAuth) |
| | Multi-calendar with color toggles |
| | Holiday overlay |
| | Bill and meal plan injected into calendar |
| **Weather** | Multi-location with nav |
| | Current conditions, hi/lo, feels-like, wind, humidity |
| | Activity tags (🚴🧥⛄) |
| | 5-day forecast |
| | Hourly forecast |
| | 48h temperature curve |
| | Precipitation radar map (Leaflet + OWM) |
| | Sun-path arc with golden-hour state |
| | NWS severe-weather alerts |
| | Moon phase |
| | Scrolling info ticker |
| | Toggleable ticker / activity strip (Settings) |
| **Meals** | AI suggestions per meal slot (Gemini) |
| | Week and day view strips |
| | Meal detail popup (photo, adjust, delete) |
| | AI-powered "adjust" (vegetarian, GF, swap, etc.) |
| | Add ingredients to shopping list |
| **Lists** | Firebase shopping list (shared, real-time) |
| | Firebase to-do list (shared, real-time) |
| | SMS shopping list to named contacts |
| **Budget** | Recurring bill tracker |
| | Context-sensitive sidebar pill (month / week / day) |
| **Assistant** | Gemini-powered chat |
| | Knows calendar, weather, meals, shopping, to-dos, budget |
| | 7 write actions (shopping, todo, event, meal, budget, etc.) |
| | Voice input (mic) + voice output (TTS) |
| | Scrolling quick-prompt ticker |
| **Appearance** | Dark / Light / Nautical / Nautical Light themes |
| | Widget placement (sidebar or bottom strip) |
| | Background photo slideshow (Google Photos) |
| | Favicon |
| **Other** | Word of the Day |
| | Dad Joke of the Day |
| | Year at a Glance |

---

## How We Used Claude — The Patterns That Worked

This section is the seminar part.

---

### Pattern 1: Start with a clear constraint

> *"Build a family dashboard. No build step, no npm, three files only."*

Giving Claude a tight constraint upfront avoids scope creep and produces a coherent architecture. Without the "three files" constraint, Claude would likely have reached for React or Next.js. The constraint was the right call — it kept the project maintainable.

**Lesson:** Tell Claude what you *don't* want as clearly as what you do want.

---

### Pattern 2: One feature per prompt

Every feature in this project came from a single, focused prompt:

> *"Add meal planning to the week view."*  
> *"Show where the sun is in the sky right now."*  
> *"Add a precipitation radar map."*  
> *"Create a lighter Nautical theme with yellow highlights."*

Multi-feature prompts produce muddier results. When we asked for several things at once, Claude sometimes missed one or handled them inconsistently.

**Lesson:** Resist the urge to batch. One thing at a time gets better results.

---

### Pattern 3: Let Claude make aesthetic decisions

The Nautical theme, the sun-path arc design, the temperature curve bezier smoothing, the rope-pattern card dividers — none of these were specified. The prompts were just:

> *"Add a naval / nautical themed option."*  
> *"Show the sun's position."*  
> *"Add a temperature graph."*

Claude made all the visual design choices. They were consistently good. The instinct to micromanage the design ("make it blue, use a 3px border, put the label on the left") often produces worse results than letting Claude decide and then reacting.

**Lesson:** Give Claude the *what* and let it figure out the *how*. Iterate visually if needed.

---

### Pattern 4: React, don't pre-specify

Rather than writing a detailed spec upfront, the workflow was:

1. Prompt for a feature
2. Look at what was built
3. React: *"Make the meal items bigger."* / *"Move the to-dos to the top."* / *"The map is black and broken into two pieces."*

This is faster than writing requirements. Claude is good at interpretation; let it build, then steer.

**Lesson:** Treat Claude like a contractor who shows you a prototype. React to what you see.

---

### Pattern 5: Name things the same way every time

The codebase has a consistent naming convention:
- JS sections: `// ── Feature Name ──`
- CSS sections: `/* ── Feature Name ── */`
- localStorage keys: `fh_featureName`
- State vars: `let featureName = lsGet('fh_featureName', default)`

When Claude knows the pattern, it follows it automatically. Every new feature got correct naming without being asked.

**Lesson:** Establish a convention early and document it in `CLAUDE.md`. Claude will follow it.

---

### Pattern 6: Document what Claude needs to remember

The `CLAUDE.md` file is a ~100-line document that Claude reads at the start of every session. It captures:
- Architecture constraints
- Known gotchas (e.g. *"budgetDatesInRange() returns strings, not Date objects"*)
- File structure
- How to find things quickly

Without this, every new session would require re-explaining everything. With it, Claude picks up exactly where the last session left off.

**Lesson:** `CLAUDE.md` is not documentation for humans — it's memory for Claude. Write it that way.

---

### Pattern 7: Ask Claude to investigate before building

For the precipitation radar map:
> *"What's involved in adding a precipitation radar map?"*

Claude gave a full breakdown — dependencies, CSP changes, layout challenges, timing issues — before writing a line of code. This prevented surprises.

**Lesson:** For complex features, ask "what's involved?" first. It's a cheap way to surface hidden complexity.

---

### Pattern 8: Use Claude to debug Claude's own output

When the radar map rendered black and split:
> *"The map is broken into two pieces and it's black."*

Claude diagnosed both bugs (CSP blocking Leaflet CSS; `invalidateSize()` timing issue) and fixed them in one pass. Claude knows its own common failure modes.

**Lesson:** When something breaks, just describe what you see. Don't try to diagnose it yourself first.

---

## What Surprised Us

**How far a "no build step" app can go.**
The final app includes Firebase, Google OAuth, Leaflet maps, Gemini AI, Web Speech API, SVG graphics, real-time sync, and four visual themes — all without a single npm package or build command.

**How well Claude handles visual design.**
We expected to do a lot of visual tweaking. In practice, Claude's first attempt at the Nautical theme, the sun arc, and the temperature curve were all shipped nearly as-is.

**How important the context file is.**
Sessions without a good `CLAUDE.md` were noticeably worse. Sessions with a well-maintained one felt like talking to someone who had been working on the project for weeks.

**How useful "what's involved?" is.**
We didn't always ask this, and the sessions where we skipped it and jumped straight to building had more course-corrections.

---

## What Didn't Work

**Multi-feature prompts.** When asked to do several things at once, Claude would sometimes skip one or do it partially. Breaking into separate prompts was always better.

**Asking Claude to guess at external APIs.** Claude had confident-sounding but wrong information about the eHungry.com API (there isn't one) and the Google Photos Library API (deprecated). Anything involving a third-party API should be verified independently.

**Screenshots for verification.** We learned to use DOM/JS inspection instead of screenshots for verifying code changes. Screenshots are ~1,000 tokens each; a DOM query is ~50.

**Letting context get full before compacting.** A `/compact` with 20% context remaining produces a much better summary than one at 5%.

---

## Numbers

| Metric | Value |
|---|---|
| Sessions | ~8 |
| Days | 8 |
| Files | 3 (+ docs) |
| Lines of code (approx) | ~6,000 JS · ~3,000 CSS · ~900 HTML |
| External APIs | 6 (OWM, NWS, Firebase, Google Calendar, Gemini, TheMealDB) |
| Themes | 4 |
| Features shipped | 35+ |
| npm packages | 0 |
| Build step | None |

---

## The Spin-off

Midway through the project, a family member saw the dashboard and asked if something similar could be built for her cupcake bakery. We forked the codebase in one session and started **Dolce Dash** — a bakery operations dashboard with a public order form, order queue, and ingredient calculator.

**Time to fork and set up:** ~20 minutes.

This is the compounding value of a clean, documented codebase: the second project starts at a much higher baseline than the first.

---

## Honest Assessment — Weak Points

### Architecture

**1. One massive JS file with global state**
`family-hub.js` is ~6,000 lines of `let` globals. Any function can mutate any variable. There's no isolation between features — a throwing widget can affect others. Works now, but reasoning about interactions gets harder as the codebase grows.

**2. Zero automated tests**
Every change is verified by eye. Regressions are only caught when noticed. The budget date bug (returning strings, not Date objects) lived undetected until the calendar broke visibly.

**3. No offline support**
No service worker. No caching strategy beyond in-memory weather. If the internet drops, most features break silently — a real gap for an always-on dashboard.

**4. External free tier dependency risk**
The app leans on: OWM, NWS, TheMealDB, Gemini, Firebase, Google Calendar, Google Photos. Any could change pricing or availability with no fallback strategy.

**5. No data backup**
Firestore is the source of truth for shopping, to-dos, budget, and meals. If the Firebase project were suspended or deleted, that data is gone permanently.

**6. Remaining rough edges**
- Radar map has fragile init timing (Leaflet sizing)
- Meal photo hit rate is low (TheMealDB only matches ~300 known dishes)
- Assistant history resets on every page reload

---

## Honest Assessment — Accessibility

**Overall rating: ⚠️ Low** — built for sighted mouse/touch users in a known household. Not usable by someone relying on a screen reader or keyboard navigation.

| Issue | Impact |
|---|---|
| No ARIA labels on custom controls | Screen readers can't identify buttons, tabs, calendar cells |
| Focus not trapped in modals | Keyboard users tab behind open modals |
| Color used alone for meaning | Calendar event types, NWS alert severity invisible to colorblind users |
| `prefers-reduced-motion` partially respected | Nautical wave, sun-dot pulse, ticker scroll never stop |
| Emoji used as icons with no text alternative | Screen reader announces "sun behind small cloud" not "weather" |
| No semantic HTML (`<nav>`, `<main>`, `<section>`) | Screen readers can't jump between landmarks |
| No skip navigation link | Keyboard users tab through entire sidebar on every page load |
| Contrast unverified on Nautical themes | Muted text on dark navy may fail WCAG AA (4.5:1) |

**For a private family TV:** acceptable risk.
**For any public-facing use:** needs significant remediation before launch.

---

## Honest Assessment — Security

**Overall rating: ⚠️ Medium** — low real-world risk for a private household app, but genuine issues that matter before any public deployment.

| Issue | Severity | Notes |
|---|---|---|
| API keys in client-side JS | 🟡 Medium | OWM + Gemini keys visible in DevTools. Someone could exhaust your free quota. Fix: serverless proxy — but breaks the no-build-step constraint. |
| Firestore rules — unverified | 🔴 High | Never confirmed the rules are set correctly. If still at default `allow all`, anyone with the project ID can read/write your family data. **Check this now.** |
| `'unsafe-inline'` in CSP | 🟡 Medium | Required by inline `onclick` handlers. Undermines XSS protection the CSP is supposed to provide. |
| XSS surface area | 🟡 Medium | `innerHTML` used extensively. The `esc()` helper is good but must be applied consistently — any missed call is a vector. |
| OAuth token in global scope | 🟡 Medium | Correct that it's in-memory only (not localStorage). But `let googleToken` is accessible to any injected script. |
| Dolce Dash order form — no rate limiting | 🔴 High (for launch) | Honeypot blocks dumb bots. A human or smart bot can still spam orders. Add reCAPTCHA before going live. |

**Most urgent action:** Verify Firestore security rules before sharing the Dolce Dash order form with anyone.

---

## Summary Scorecard

| Dimension | Rating | Biggest Issue |
|---|---|---|
| **Feature depth** | ✅ Excellent | 35+ features, 0 npm packages |
| **Architecture** | ✅ Good | Global state in one file is the ceiling |
| **Maintainability** | ✅ Good | CLAUDE.md + grep patterns work well |
| **Visual design** | ✅ Excellent | 4 themes, all cohesive |
| **Accessibility** | ⚠️ Low | No ARIA, no focus trapping, color-only meaning |
| **Security** | ⚠️ Medium | API keys exposed, Firestore rules unverified |
| **Reliability** | ✅ Good | Graceful degradation throughout |
| **Extensibility** | ✅ Good | Dolce Dash fork proved it — 20 minutes |
