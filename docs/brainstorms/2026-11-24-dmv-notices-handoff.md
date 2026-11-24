# DMV Notices in the Email Scan: Research and Handoff

**Date:** 2026-11-24
**Status:** Researched, not designed. The next session starts by asking the owner the open questions below.
**Goal:** Put NY DMV deadlines (vehicle inspection due, registration expiring) on the Hub's calendar from the DMV's own reminder emails, using the existing email scan.

---

## Where the email scan stands

Read FEATURES.md §23 first: it is current, and the code has moved well past the first plan (`docs/plans/2026-11-21-001-feat-email-scan-plan.md`). In short:

- `tools/email-scan/` is a Google Apps Script in the owner's Google account, not Hub code. A merged change does nothing until it's pasted into the Apps Script editor.
- `Code.gs` handles school mail from ParentSquare, sending it to Gemini and writing to the "From Email" calendar. `dedupe.gs` holds the pure rules. `deliveries.gs` handles package mail: its own Gmail search, one Gemini call per message, and its own "Deliveries" calendar.
- The owner shows both calendars in the Hub as ICS subscriptions through each calendar's secret iCal address.
- Gemini has been the main source of operational trouble. The scan is on its own model pin (`gemini-3.6-flash`) and pauses 12 seconds between calls for the free tier. Some calls never answered and killed the 6-minute run, which is why `inFlight`, `killedOn` and `KILL_LIMIT` exist (#159 to #162).
- The backfill has run (owner, 2026-11-24).

## Inbox survey (2026-11-24, read-only, three years)

All DMV mail is templated and machine-written. That shapes the recommendation below.

| Sender | Subjects | Period seen | Use |
|---|---|---|---|
| `eservices@messages.dmv.ny.gov` | "Reminder — Registration Renewal Available", "Reminder — Vehicle Inspection", "Notification — Registration Expired", "Notification — Inspection Expired" | 2026 on (current format) | **Core input** |
| `notifications@messages.dmv.ny.gov` | "1st / 2nd / Final Registration Reminder for …", "1st / 2nd / Final Inspection Reminder for plate number …" | 2024 to late 2025 (older format) | Same fields; parse it too, or ignore it as history |
| `noreply@dmv.ny.gov` | "Confirmation - DMV Transaction Completed" (body: "REGISTRATION RENEWAL PROCESSED"), "NYSDMV Transaction Status" | When a renewal is done online | **Resolution signal** for a registration |
| `no-reply@setmore.com`, `noreply@qless.com` | DMV office appointment booked, reminder, review | Occasional | Real appointments with a time. Open question |
| `carfax@carcare.no-reply.carfax.com` | "Safety Inspection Due", "Emissions Inspection Overdue" | Monthly-ish | Third-party duplicate of the DMV's own reminder. Recommend skipping |

**Body fields (both DMV formats):**
- Inspection: "The required annual New York State inspection is due by MM/DD/YYYY for the registration listed below."
- Registration: "Expires: M/D/YYYY", preceded by "is available for renewal." or "is now expired."
- Then `Plate:`, `Class:`, `Make:` (abbreviated, e.g. "VOLKS", "CHRYS"), `Year:`, and for registrations `ZIP Code:` and `County of Residence:`.

The same plate can come with a different Make and Year over time (a plate moved to a new car), so key on the plate and take Make and Year from the latest email.

**Cadence** (dmv.ny.gov, "Get email and text reminders"): three reminders per registration, inspection or ID card, at 75 to 90, 45 to 60 and 30 to 45 days before expiry. The current format adds an "Expired" notice afterwards. Reminders go to the primary registrant, and enrollment is through MyDMV (also automatic after an online renewal).

**Not seen:** no driver's license or ID card reminders in three years, and no DMV email confirming that an inspection passed. Inspections resolve silently: next year's reminder simply carries a new due date.

**Two vehicles** appear in the reminders. Plate numbers are personal and stay out of this repo, the script source, event titles and test fixtures.

## Recommendation: rules, not Gemini

Unlike ParentSquare posts, DMV mail is fully templated, so a dozen lines of matching (the "due by"/"Expires:" date, Plate, Make, Year, plus the subject saying which kind) extract everything. Skipping Gemini avoids the rate limits, the slow calls and the killed runs that took four PRs to tame. It also keeps the DMV feature working if the model or the key breaks. Parsing a template is reliable as long as the template holds, so a DMV email that matches the sender but not the pattern should be logged as a failure (`lastError`), never silently ignored.

Suggested shape, mirroring `deliveries.gs`:

- `dmv.gs`: `DMV_QUERY` (`from:messages.dmv.ny.gov OR from:noreply@dmv.ny.gov`, over a short window like deliveries), `parseDmv_(subject, body)` returning `{ kind: 'inspection' | 'registration', status: 'reminder' | 'expired' | 'renewed', dueDate, plate, make, year }`, and pure decide/write rules.
- One all-day event per vehicle and deadline, keyed by kind, plate and due date (private tags only, as `fhKeys` works for deliveries). The second and third reminders only touch the existing event. An expired notice retitles it (for example "Overdue: …"). A renewal confirmation resolves it.
- Title from the make, never the plate: "Inspection due: VW" or "Registration expires: Audi". The description gets the generic renewal or inspection page with the tracking parameters stripped, plus the source email link.
- On/off through `ADD_KINDS` (a `dmv` entry), like `delivery`.
- Tests in `tests/email-scan.test.js` with invented fixtures in both formats (no real plates), following the existing vm-plus-fakes pattern.
- Docs: FEATURES.md §23 (a DMV paragraph like the Deliveries one), the setup guide section, and CLAUDE.md only if something architectural changes.

## Open questions for the owner (ask before writing code)

1. **Which calendar?** "From Email", "Deliveries", or a new one ("Car"/"Vehicles")? A new one means another ICS subscription in the Hub (FEATURES.md §23, "Showing it in the Hub").
2. **Lead time.** An event on the due date is visible only as the date approaches, and the first reminder comes 75 to 90 days ahead. Options: the event on the due date only; a second "renew this week" event some days before; or a multi-day bar from a chosen lead time up to the due date.
3. **What a renewal does.** The confirmation email names the transaction but maybe not the plate. Check one confirmation body to see what it carries before deciding between deleting, retitling ("Renewed") or leaving the event.
4. **Inspections.** DMV never confirms a pass. Leave the event until its date passes? Offer a manual "done" (edit the title, which locks it via `fhSig`)?
5. **DMV office appointments** (Setmore, Qless): add them? They have a real time and place, but they're bookings the owner made, so they may already be on a calendar.
6. **The older format.** Parse it (it only matters for a backfill), or ignore anything from `notifications@`?
7. **Carfax:** confirm it should be skipped.

## Constraints to keep (from CLAUDE.md and §23)

- Gmail stays read-only (`gmail.readonly`). The script never labels, moves or sends mail.
- Personal details (plates, names, calendar IDs) go in Script Properties or private event tags, never in source or the repo.
- Strip links before any text goes to Gemini (not needed if DMV skips Gemini, but keep it in mind if a fallback is added).
- `seenIds` is shared across school, deliveries and DMV, and a message is marked only after its writes succeed.
- Run `npm test`. Update FEATURES.md §23 and the setup guide in the same PR.
