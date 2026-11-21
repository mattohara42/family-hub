# Email to Calendar: Requirements

**Date:** 2026-11-21 (revised same day after an inbox survey)
**Status:** Direction chosen, ready for planning
**Goal:** Get school dates, sports schedule changes and (later) package deliveries onto the Hub without anyone retyping them from email.

---

## What changed in this revision

The first draft designed a general email classifier: an Apps Script, Gmail filters, a Gemini call per message, two new Firestore collections, a new widget with a mobile tab, and a review queue. A read-only survey of 60 days of the owner's inbox showed that was built for a harder problem than the real one. The senders are few and fixed, sports already publish calendar feeds, and the actual hard part is deduplicating dates that are repeated week after week. The Firestore handoff (the first draft's least certain step) and the new widget are dropped.

## Inbox survey (2026-11-21, 60 days, read-only)

| Category | Source | Shape | Has a feed or calendar link? |
|---|---|---|---|
| School | ParentSquare: a daily digest most days, plus "Library tomorrow" reminders and attendance notices | Important dates (conferences, half days, early dismissal, breaks) are buried in teachers' free-text weekly posts, often as an "Upcoming Dates" list. The same date repeats across several posts | No. No `.ics` attachments, no add-to-calendar links |
| Sports | LeagueApps (Little League): weekly practice/game reminders, plus "event changed" and "game cancelled" notices | Structured, consistent templates | **Yes.** LeagueApps offers a subscribe link from the schedule view (or app: My Account, member, Subscribe to Calendar), covering one month back and six months forward |
| Sports | TeamSnap (crew, new this month) | Structured | **Yes.** Schedule, Sync Calendar / Export gives an iCal link, including an all-teams schedule |
| Deliveries | About six orders across Zappos, adidas, Newegg, Harry's, Barnes & Noble; almost nothing from Amazon | Three to four emails per order (confirmed, shipped, out for delivery, delivered). Carrier tracking numbers appear in plain text (e.g. a UPS `1Z…`) | n/a |

No district-wide calendar feed turned up in a web search; the district site has a calendar page but no subscribe link was found.

## Decision

Three parts, in this order.

### 1. Sports: subscribe, don't parse

Add the LeagueApps and TeamSnap iCal links as ICS subscriptions in the Hub (Settings, existing `icsSubs`). No code. For LeagueApps, use the per-player link (app: My Account, the player under Members, Subscribe to Calendar), which carries only that player's team; a league-wide schedule link would need filtering the Hub can't do. **Done for Little League, 2026-11-21.** This covers practices, games, time changes and cancellations, which were the sports cases the email scan was meant to catch. Subscribing in the Hub rather than in Google Calendar avoids Google's slow feed polling (TeamSnap warns of up to 24 hours there), since the Hub fetches the feed itself on load. Feeds that block CORS go through the existing `netlify/functions/ics.js` proxy.

### 2. School: a ParentSquare-only Apps Script writing to a "From Email" calendar

A Google Apps Script in the owner's Google account, on a time trigger twice a day (about 7am and 5pm).

- **Input:** new ParentSquare mail only (`from:parentsquare.com`), plus anything the owner tags by hand with a `Hub` label. No keyword classification. The hand label is the escape hatch for one-off mail from anywhere else.
- **Extraction:** Gemini (free tier, accepted by the owner), with the email's sent date in the prompt so "Tuesday" and "the 4th" resolve. Structured output: a list of `{ date, endDate?, time?, allDay, title, kind: no-school | half-day | early-dismissal | conference | event }`. Routine noise (attendance, library-day reminders) is excluded by prompt and by subject filter.
- **Dedupe (the core of the design):** before writing, look up events already on the "From Email" calendar on that date. If one has a matching `kind` or a similar title, skip it, or update its description with the newer source if the time changed. Every created event stores the source Gmail message ID and an `fhKey` (date + kind + normalized title) in its description or extended properties, so reruns are idempotent.
- **Output:** events on a dedicated **"From Email" Google calendar**, created by the script with `CalendarApp`. Each event description carries a link back to the email and the AI's confidence. The Hub already shows any Google calendar, so the Hub needs no code change; the owner gives the calendar its own color.
- **Review is by exception.** Correct events are left alone; wrong ones are edited or deleted in the Hub like any other event. Deleting the whole calendar removes everything the feature ever added. While trust is being built, the calendar can be hidden in the Hub so suggestions don't show on the wall until checked.
- **Where the code lives:** source in the repo (`tools/email-scan/Code.gs` + `appsscript.json`), pasted into the Apps Script editor. The Gemini key lives in Script Properties. The Netlify `ai` proxy can't be used because it only answers same-origin requests.

This keeps Gmail access off every Hub device (the wall panel's token never gains a mail scope) and needs no Google verification, since it is the owner's own script.

### 3. Deliveries: phase 2, rules only

Deferred until parts 1 and 2 are in use. If built, the same script recognizes shipping emails from the merchants above and pulls tracking numbers by pattern (UPS `1Z…`, USPS 20 to 22 digits, FedEx 12 or 15 digits), mapping each to the carrier's public tracking page. No Gemini needed. Where deliveries show (a small all-day event, a list, or something else) is decided then.

## Rejected options

| Option | Why not |
|---|---|
| Hub scans Gmail from the wall panel | Everything would stay in one codebase, but the panel's token would gain read access to the owner's mail on a device in a shared room |
| Netlify scheduled function | Needs a long-lived Gmail refresh token stored server-side; breaks the in-memory-token invariant |
| Apps Script + Firestore + new review widget (first draft) | Most moving parts; the Firestore write from Apps Script was unverified and would bypass `firestore.rules`; a review UI is heavy for a few items a week |
| Parse sports emails | The platforms publish feeds that update themselves |

## Risks and notes

- **Silent failure.** Apps Script emails the owner when a timed run throws, but a run that "succeeds" with no output (a retired Gemini model, a changed digest format) goes unnoticed. The script should write a small heartbeat (last run, items found) somewhere visible. The simplest option is the description of the "From Email" calendar itself; decide in planning.
- **Gemini model pin.** The script becomes a third place the model name is pinned, alongside `GEMINI_MODEL` and `DEFAULT_MODEL`. Add it to CLAUDE.md's "Gemini model deprecated" gotcha when the script lands.
- **Free-tier privacy.** Accepted. Input is limited to school mail and hand-labeled messages.
- **Date accuracy.** Relative dates are the main failure mode. Sent-date context plus review-by-exception covers it; low confidence is shown in the event description.
- **Personal data in this repo.** The script source must not hard-code names, addresses or order numbers; sender filters and the calendar ID go in Script Properties.

## Out of scope

Other family members' inboxes, auto-patching existing events from change emails, a Hub review widget, carrier tracking APIs, and attachments (the weekly agenda PDFs).
