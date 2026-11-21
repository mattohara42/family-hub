---
title: School Dates from Email: ParentSquare Apps Script Writing to a "From Email" Calendar
type: feat
origin: docs/brainstorms/2026-11-21-email-scan-requirements.md
date: 2026-11-21
status: built, awaiting rollout
---

# School Dates from Email: Implementation Plan

**Scope:** Small. A Google Apps Script in the owner's account reads new ParentSquare mail (and anything hand-labeled `Hub`) twice a day, asks Gemini for dated school items, removes repeats, and writes the rest to a dedicated "From Email" Google calendar. The Hub shows that calendar like any other and needs no code change.

**Depth:** 6 implementation units. Units 1 to 4 are the script, 5 is its tests, 6 is docs.

**Out of scope:** deliveries (phase 2 in the brainstorm), other family members' inboxes, a Hub review widget, PDF attachments (the weekly agenda), and patching events on any calendar other than "From Email".

**Already done (no code):** Little League is subscribed in the Hub through its per-player LeagueApps feed. TeamSnap (crew) is the same kind of subscription, still to add.

---

## Decisions Taken

| Question | Decision | Why |
|---|---|---|
| Where it runs | Apps Script in the owner's Google account, time-triggered | Keeps Gmail access off every Hub device; no stored refresh token; no Google verification for a personal script |
| Input | `from:parentsquare.com OR label:Hub`, skipping message IDs already processed | The survey showed school mail comes from one platform. The `Hub` label is the hand-picked escape hatch for anything else |
| Output | Events on a "From Email" calendar via `CalendarApp` | The Hub already renders any Google calendar; bulk undo is "delete the calendar" |
| Review | By exception. Correct events stay; wrong ones get fixed or deleted in the Hub | A queue UI is heavy for a few items a week |
| AI | Gemini free tier, called directly with a key in Script Properties | The Netlify `ai` proxy only answers same-origin requests. Free-tier privacy accepted by the owner |

### Dedupe and heartbeat rules (accepted by the owner, 2026-11-21)

**Dedupe rule (U3).** Every event the script writes carries two private tags (`CalendarEvent.setTag`): `fhKind` and `fhKey`. Before writing an item, the script lists "From Email" events on the item's start date and treats it as a repeat when either:

1. the kind is one of the **day-level kinds** (`no-school`, `half-day`, `early-dismissal`, `conference`) and an event on that date already has the same `fhKind`. A date can only have one "half day", however many posts mention it; or
2. the kind is `event` and the normalized titles overlap enough (lowercase, punctuation and stop words dropped, token Jaccard of 0.5 or more), e.g. "3rd grade musical" and "Third Grade Musical performance".

On a repeat with the **same time**, the script does nothing except append the new source link to the description (capped at three links). On a repeat with a **different time** (an early dismissal moved from 2:10 to 1:30), the newer email wins: the event is updated and its description records "Changed from 2:10 PM, per <link>". An event the owner has edited by hand (the script stores `fhSig`, a hash of title+time at write time, and sees a mismatch) is never touched again.

**Heartbeat (U4).** No Hub change. The script uses Google's own failure emails as the alarm: a time-triggered run that throws sends the owner an email. Besides real errors, the script throws on purpose when something has gone quiet that shouldn't have:

- no ParentSquare mail at all in 7 days, outside July and August, or
- Gemini returned zero items for 10 digests in a row (a broken prompt, schema or model looks exactly like this).

Each run also records `lastRun`, `lastNew` and `lastError` in Script Properties, visible from the Apps Script editor.

---

## Implementation Units

### U1: Project skeleton and one-time setup

**Done 2026-11-21.** Exercised against fake Google services only; not yet run in a real Apps Script project.

- `tools/email-scan/appsscript.json`: `timeZone: "America/New_York"`, `runtimeVersion: "V8"`, the Advanced Gmail service, and explicit `oauthScopes`: `gmail.readonly`, `calendar`, `script.external_request`, `script.scriptapp`. Listing them keeps the consent screen honest about exactly what the script can do.
- **Read-only Gmail (changed from the first draft).** The draft labeled each handled thread `Hub/Scanned`, which needs a scope that can modify mail, and the built-in `GmailApp` service asks for full mail access (`https://mail.google.com/`) regardless. Instead the script reads mail through the Advanced Gmail service under `gmail.readonly` and remembers processed message IDs in Script Properties (U2). The script never changes your mailbox. The optional `Hub` label is created by hand in Gmail.
- `tools/email-scan/Code.gs`: `setup()`, `teardown()` (the off switch: removes the triggers, keeps the calendar), `run()`, `backfill()` and `status()`. `run()` and `backfill()` are stubs until U2.
- `setup()` (run once from the editor) finds or creates the "From Email" calendar, stores its ID, seeds `SKIP_SUBJECTS`, installs two daily triggers (about 6:45am and 4:45pm, so results are in before the morning rush and before dinner), and makes one Gmail call so the consent prompt happens then. Idempotent: rerunning it replaces the triggers instead of doubling them.
- `GEMINI_MODEL` is a constant in `Code.gs` (changed from the first draft's Script Property), so a grep for the model name finds all three pins in the repo. U5 adds a test that fails if they drift apart.
- Script Properties (set by hand, never in source): `GEMINI_KEY`, optional `EXTRA_QUERY` (more senders later), optional `SKIP_SUBJECTS` (seeded with `Attendance Notification|Library (Tomorrow|Monday)`).
- **Nothing personal goes in the source**: no names, addresses, school IDs or calendar IDs. The repo is the source of truth; the editor copy is a paste of it.

### U2: Intake

**Done 2026-11-21.** Covered by `tests/email-scan.test.js` against fake services; not yet run against real Gmail. Until U3 lands, `run()` only lists what it would scan and marks nothing as seen, so pasting U2 early loses no mail. `previewIntake()` prints the cleaned text of the last three days' messages, for checking exactly what Gemini will receive. Cleaning removes every link, not only boilerplate: ParentSquare's links carry per-user sign-in tokens, which should not leave the mailbox.

- Query: `(from:parentsquare.com OR label:Hub) newer_than:3d`, then skip any message ID in the `seenIds` Script Property (a JSON map of ID to first-seen time, pruned after 10 days; a few hundred bytes at this volume). The three-day window lets a skipped trigger catch up.
- Per message: skip `SKIP_SUBJECTS`; take the plain-text part of the message, strip ParentSquare's link and unsubscribe boilerplate, truncate to 8 KB. Keep the sent date and the Gmail permalink.
- After the message is fully handled (U3 succeeded, even if it found nothing), add its ID to `seenIds`. A message that failed extraction is left out and retried on the next run.
- `backfill()` runs the same pipeline over `newer_than:60d` once, pausing between Gemini calls to stay under the free tier's per-minute limit. Used once during rollout (below).

### U3: Extraction and dedupe

**Done 2026-11-21**, with U4 and U5 in the same pass; tested against fakes only. The pure rules live in `dedupe.gs`, and the Gmail, Calendar and Gemini calls are in `Code.gs`. Additions beyond the plan:

- **One day of a break doesn't shrink the break.** If the calendar holds "No school, Nov 25 to 27" and a later email says only "no school Nov 26", that is a repeat, not an update. The first draft of the rule would have cut the break down to one day. Each event stores its start date in an `fhDate` tag for this check.
- `fhSig` is read back from the event Calendar actually saved, not computed from what the script asked for. If the two ever differ, the event would look hand-edited and would just be left alone. That's the safe way to fail.
- Items more than 400 days out are dropped as a misread year.
- The Gemini key goes in a request header, so it never appears in a URL or a log. The prompt says the email text is data, not instructions. Gemini's output is also forced into a fixed shape and only ever lands on the review calendar, so a hostile email could at worst add an odd event there.
- `backfill()` pauses 6.5 seconds between Gemini calls (the free tier allows about 10 a minute) and stops itself after 4.5 minutes, because Apps Script ends a run at 6. Rerun it until it reports nothing left. `resetSeen()` clears the memory of handled messages, for redoing a backfill from scratch.

- Gemini `generateContent` with `responseMimeType: application/json` and a `responseSchema` of:
  `items: [{ date, endDate?, startTime?, endTime?, kind, title, confidence }]`, `kind` in `no-school | half-day | early-dismissal | conference | event`.
- The prompt carries the email's sent date and the time zone, asks only for items dated after the sent date, and tells Gemini to ignore recurring routine (library days, weekly specials) and anything that isn't a date a parent needs to plan around.
- Items whose date is already past at run time are dropped.
- Dedupe per the rule above. Writes:
  - day-level kinds and items with no time become all-day events; ranges (`endDate`) become multi-day all-day events;
  - timed items become timed events;
  - title is the item title, prefixed by a short marker for day-level kinds (e.g. "Half day: …") so the Hub's pill reads well;
  - description: source link(s), confidence, and "Added by the email scan" so anyone looking at the event on the wall knows where it came from.
- Low confidence (under 0.6) still writes, with "(check)" appended to the title. Review by exception only works if doubtful items are visibly doubtful.

### U4: Heartbeat and error handling

- Per the heartbeat rule above. "Digests in a row" counts only messages whose subject contains "Digest", because a standalone post with no dates is normal. The count is kept in the `zeroStreak` property. Both thresholds are constants at the top of `Code.gs`; tune them after the backfill. `run()` wraps the whole pass; any caught per-message error is recorded and the message is left for retry, but a run that hit errors on every message throws at the end so Google's failure email fires.
- `status()` (written in U1) prints the Script Properties summary for a quick look from the editor.

### U5: Tests

The dedupe rule and the title normalizer are the logic most likely to be subtly wrong, and they don't need Google to run. Done: 34 tests in `tests/email-scan.test.js`, covering the cases below plus full `run()` passes against fake Gmail, Calendar and Gemini. Put them in `tools/email-scan/dedupe.gs` written as plain functions (no Apps Script services), and load that file into Node with `vm` from `tests/email-scan.test.js` so `npm test` covers:

- same day-level kind on the same date is a repeat; a different kind on the same date is not;
- title overlap thresholds ("3rd grade musical" vs "Third Grade Musical performance" is a repeat; "Musical" vs "Book fair" is not);
- a changed time is reported as an update, not a repeat or a new event;
- a hand-edited event (`fhSig` mismatch) is never updated;
- past-dated items are dropped;
- `GEMINI_MODEL` in `Code.gs`, `GEMINI_MODEL` in `family-hub.js` and `DEFAULT_MODEL` in `netlify/functions/ai.js` are the same string.

Gmail, Calendar and Gemini calls are not mocked; they are exercised by the rollout below.

### U6: Docs

**Done 2026-11-21.** FEATURES.md §23, a "School Dates from Email" section in the setup guide's Feature Configuration Reference, and two CLAUDE.md rows (the three-way model pin, and "runs outside the deploy").

- `family-hub-setup.md`: a new optional step: create the Apps Script project, paste the three files, set Script Properties, run `setup()`, authorize, color the "From Email" calendar in the Hub.
- `FEATURES.md`: a short section (what it reads, where it writes, the tags, how to turn it off).
- `CLAUDE.md` gotchas: add the script to the "Gemini model deprecated" row (third place the model is pinned, and it lives in Script Properties, not the deploy), and a row noting the script runs outside the deploy, so a merged change does nothing until it's pasted in.

---

## Rollout

1. Run `setup()`, then hide "From Email" in the Hub.
2. Run `backfill()` once over 60 days. Compare the calendar against what the survey found (the upcoming conference days, the half day, the early dismissal, Thanksgiving break). Every one should appear exactly once.
3. Fix the prompt or the dedupe thresholds if needed, delete the calendar's events, run `resetSeen()`, repeat step 2.
4. Unhide the calendar in the Hub. Let the triggers run for two weeks, then decide whether to keep review-by-exception or move on to phase 2 (deliveries).

## Risks

- **Gemini model retirement** silently zeroes the output. Covered by the "zero items for 10 digests" alarm.
- **ParentSquare changes its digest format.** The body goes to Gemini as text, so moderate changes don't matter; a switch to link-only digests would show up as the same zero-items alarm.
- **Duplicates slip through** when two posts phrase the same event very differently. Review by exception catches it; tune the Jaccard threshold from the backfill results rather than guessing now.
- **Free-tier rate limits** only matter for `backfill()`, which paces itself.
