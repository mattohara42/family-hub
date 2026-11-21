# Email Scan (Inbox to Calendar) — Requirements

**Date:** 2026-11-21
**Status:** Decisions made, one feasibility test outstanding (Firestore handoff, below) before planning
**Goal:** Twice a day, find calendar-worthy things in the owner's Gmail (parent-teacher conferences, school notices, one-off sports changes) and package deliveries, and surface them in the Hub for review, with carrier tracking links for deliveries.

---

## Decisions (owner answers, 2026-11-21)

| Question | Decision |
|---|---|
| Where the scan runs | **Google Apps Script in the owner's Google account**, on a time trigger (about 7am and 5pm). Not the wall panel, not a Netlify scheduled function |
| Whose inbox | **Owner's only** |
| Deliveries | **Separate Deliveries list** with tracking links, optionally a small pill on the expected day. Not calendar events |
| AI extraction | **Gemini free tier is acceptable**, knowing Google may use the submitted snippets to improve its products |
| Handoff to the Hub | **Firestore**, written by the script, read live by the Hub. Gated on a feasibility test first |
| Auto vs review | **Review first.** Every found event lands in a queue with Add / Edit / Dismiss. Per-category auto-add is a later option |
| Approved events go to | **A dedicated "From Email" Google calendar** (easy to hide, recolor, or bulk-delete) |
| Placement | **Sidebar card + a tab in the mobile Lists sheet**, so suggestions can be approved from a phone |

## Why Apps Script

The Hub's Google token is the in-memory GIS token: it exists only while a browser is open and lasts about an hour, so the Hub itself can't run a scan on a schedule without a device. A Netlify scheduled function would need a long-lived Gmail refresh token stored server-side, which breaks the "token is in-memory only" invariant and puts an inbox-reading credential on Netlify.

Apps Script runs on Google's servers as the owner. The Hub never holds a Gmail credential, nothing needs to be on, and because it is the owner's own personal script the restricted `gmail.readonly` scope needs no Google verification. The Hub's own OAuth scopes do not change.

Costs of this choice: the script lives in the owner's Google account, not the Netlify deploy, so its source is kept in the repo (proposed `tools/email-scan/`) and updating it means pasting a new version into the Apps Script editor. Apps Script quotas (6-minute run limit, UrlFetch daily limits) are far above what two runs a day need.

## Pipeline

1. **Narrow first, in Gmail.** Gmail filters (set up once by the owner) apply a `Hub/Scan` label to likely mail: the school's domain, carriers, Amazon and other retailers, league/team senders, and subject keywords like "conference", "shipped", "out for delivery", "rescheduled", "cancelled". The script reads only `label:Hub/Scan newer_than:2d`. This keeps what is sent to Gemini small and puts the owner in control of what is looked at.
2. **Dedupe** on Gmail message ID. A message already processed (present in Firestore, in any state including dismissed) is skipped.
3. **Deliveries without AI where possible.** Tracking numbers are recognized by pattern and mapped to the carrier's public tracking URL (UPS `1Z…`, USPS 20 to 22 digits, FedEx 12 or 15 digits, Amazon `TBA…`). Amazon emails often carry no tracking number, so those link to the order page. Status words ("shipped", "out for delivery", "delivered") update an existing delivery for the same tracking number or order rather than creating a new one.
4. **Events via Gemini.** Plain-text body (HTML stripped, truncated to a few KB) plus the email's sent date goes to Gemini with a structured-output schema: `kind` (event / change / none), `title`, `start`, `end`, `allDay`, `location`, `notes`, `confidence`, and for `change` a short description of what moved. The sent date matters because emails say "next Tuesday" and "the 14th".
5. **Write to Firestore**, then remove the `Hub/Scan` label (or add `Hub/Scanned`) so the mail isn't reconsidered.

## Data (Firestore)

The current `firestore.rules` wildcard (`/{document=**}`, allowed emails only) already covers new collections, so no rule change is needed for the Hub to read them.

- **`emailSuggestions`**: `{ messageId, kind, title, start, end, allDay, location, notes, confidence, changeSummary?, from, subject, gmailLink, status: 'new' | 'added' | 'dismissed', createdAt }`
- **`deliveries`**: `{ key (tracking number or order id), carrier, trackingUrl, merchant, item?, status: 'ordered' | 'shipped' | 'out' | 'delivered', expected?, gmailLink, updatedAt }`. Delivered items drop off the list after a few days.

Sparse fields go through a `recipeExtras()`-style filter, since Firestore rejects `undefined`.

## Hub side

- **Email widget** (new widget key, in `WIDGET_DEFAULTS` / `WIDGET_PLACEMENT_DEFAULTS` / `WIDGET_ORDER`, and `MOBILE_SHEET_SECTIONS` with a Lists sheet tab). Two sections: Suggestions (count badge) and Deliveries.
- **Add** opens the existing event editor prefilled, targeting the "From Email" calendar, so edits use the normal save path and `calFetch()`. Saving marks the suggestion `added`. **Dismiss** marks it `dismissed`.
- **`change` suggestions** show the summary and a link to the email. The Hub does not try to find and patch the existing event automatically in v1; the owner edits it by hand. Matching emails to existing events is where extraction is least reliable.
- Every card links back to the source email (`https://mail.google.com/mail/u/0/#all/<messageId>`).
- Optional: a small 📦 pill on a delivery's expected day, routed through the same pattern as bill pills.

## Feasibility test (do this before planning)

**Hypothesis:** an Apps Script owned by the owner can write to this project's Firestore over the REST API (`firestore.googleapis.com/v1/projects/<id>/databases/(default)/documents/...`) using `ScriptApp.getOAuthToken()`, with the `https://www.googleapis.com/auth/datastore` scope declared in `appsscript.json`.

My understanding (not yet verified here) is that a request authorized with a Google OAuth token is checked against Cloud IAM, not against `firestore.rules`, so it succeeds because the owner holds a project role, and the email allowlist in the rules never comes into play. If that's right, it also means the script's access isn't limited by the rules, which is acceptable for a script only the owner runs.

**Test:** a ten-line script that writes one doc to `emailScanTest`, run once from the Apps Script editor; confirm the doc appears in the Firebase console and the Hub can read it. Then delete the collection.

**If it fails:** fall back to a Netlify function the script POSTs to with a shared secret, which writes with a Firebase service-account key (env var). That works with certainty but adds two secrets to Netlify.

## Risks and notes

- **Free-tier privacy.** Accepted by the owner. The `Hub/Scan` label narrowing limits what is sent.
- **Date accuracy.** Relative dates and missing time zones are the main failure mode. Review-first covers it; low-confidence suggestions should say so on the card.
- **Gemini model pin.** The script will call Gemini directly with its own key stored in Script Properties (not the Netlify proxy, which only answers same-origin requests). That makes a third place the model name is pinned, alongside `GEMINI_MODEL` and `DEFAULT_MODEL`; CLAUDE.md's "Gemini model deprecated" gotcha should list it.
- **Sports schedules.** Where a league or app (TeamSnap, GameChanger, league sites) offers an ICS feed, subscribe to it with the existing ICS support instead; it updates itself when games move. Email scanning is for the one-off notices that have no feed.

## Out of scope for v1

Other family members' inboxes, auto-add, automatic patching of existing events, carrier APIs for live tracking status, and attachments (PDF schedules, flyers).
