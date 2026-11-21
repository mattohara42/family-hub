/**
 * Family Hub email scan (Google Apps Script).
 *
 * Twice a day, reads new ParentSquare mail (plus anything hand-labeled "Hub"),
 * asks Gemini for dated school items, and writes the ones not already there to
 * a "From Email" Google calendar, which the Hub shows like any other calendar.
 * Plan: docs/plans/2026-11-21-001-feat-email-scan-plan.md
 *
 * This file is the source of truth. The copy in the Apps Script editor is a
 * paste of it, so a merged change does nothing until it is pasted in again.
 *
 * One-time setup, in the Apps Script editor:
 *   1. Paste Code.gs (and later dedupe.gs). Turn on "Show appsscript.json" in
 *      Project Settings and paste appsscript.json over it.
 *   2. Project Settings > Script Properties: add GEMINI_KEY (an AI Studio key).
 *   3. Run setup() and approve the consent screen.
 *   4. In the Hub, give the "From Email" calendar its own color.
 * Optional: create a Gmail label named "Hub" by hand. Anything you tag with it
 * gets scanned too.
 *
 * Nothing personal belongs in this file (names, addresses, calendar IDs). Those
 * live in Script Properties.
 */

const CALENDAR_NAME = 'From Email';

// Third place the model is pinned. Keep in step with GEMINI_MODEL in
// family-hub.js and DEFAULT_MODEL in netlify/functions/ai.js.
const GEMINI_MODEL = 'gemini-2.5-flash';

// Daily run times in the script's time zone (appsscript.json). Apps Script
// fires within about 15 minutes of nearMinute.
const RUN_HOURS  = [6, 16];
const RUN_MINUTE = 45;

const BASE_SOURCES          = ['from:parentsquare.com', 'label:Hub'];
const BASE_QUERY            = '(' + BASE_SOURCES.join(' OR ') + ')';
const DEFAULT_SKIP_SUBJECTS = 'Attendance Notification|Library (Tomorrow|Monday)';

const RUN_WINDOW_DAYS      = 3;    // lets a skipped trigger catch up
const BACKFILL_WINDOW_DAYS = 60;
const SEEN_TTL_DAYS        = 10;   // longer than the run window, so nothing is read twice
const MAX_MESSAGES         = 200;  // per pass; far above real volume
const MAX_BODY_CHARS       = 8000;

function props_() {
  return PropertiesService.getScriptProperties();
}

/**
 * Run once from the editor (safe to rerun). Creates the calendar, seeds the
 * default properties, installs the two daily triggers, and touches Gmail and
 * Calendar so the consent prompt happens now rather than at 6:45am.
 */
function setup() {
  const p = props_();

  const cal = ensureCalendar_();
  p.setProperty('CALENDAR_ID', cal.getId());
  if (!p.getProperty('SKIP_SUBJECTS')) p.setProperty('SKIP_SUBJECTS', DEFAULT_SKIP_SUBJECTS);

  installTriggers_();

  const probe = Gmail.Users.Messages.list('me', { q: BASE_QUERY + ' newer_than:7d', maxResults: 5 });
  const recent = (probe.messages || []).length;

  console.log('Calendar: "%s"', cal.getName());
  console.log('Triggers: daily at about %s', RUN_HOURS.map(h => h + ':' + RUN_MINUTE).join(' and '));
  console.log('Gmail: %s matching message(s) in the last 7 days (capped at 5)', recent);
  if (!p.getProperty('GEMINI_KEY')) {
    console.warn('GEMINI_KEY is not set. Add it under Project Settings > Script Properties before the first run.');
  }
}

/** The off switch: removes the daily triggers. The calendar and its events stay. */
function teardown() {
  const removed = removeTriggers_();
  console.log('Removed %s trigger(s). Run setup() to turn the scan back on.', removed);
}

/**
 * The scheduled entry point. Until extraction lands (U3) this only reports
 * what it would scan, and deliberately does not mark anything as seen: a
 * message marked seen before it was extracted would be skipped for good.
 */
function run() {
  props_().setProperty('lastRun', new Date().toISOString());
  const msgs = collectMessages_(RUN_WINDOW_DAYS, { skipSeen: true });
  console.log('run(): %s new message(s) to scan. Extraction arrives in U3; nothing marked seen.', msgs.length);
  msgs.forEach(m => console.log('  %s  %s', m.sentAt.toISOString().slice(0, 10), m.subject));
}

/** One-time pass over the last 60 days, used during rollout. Ignores seenIds. */
function backfill() {
  const msgs = collectMessages_(BACKFILL_WINDOW_DAYS, { skipSeen: false });
  console.log('backfill(): %s message(s) in %s days. Extraction arrives in U3.', msgs.length, BACKFILL_WINDOW_DAYS);
}

/**
 * Run from the editor to see exactly what the scan would send to Gemini:
 * each message's subject, date and the start of its cleaned text.
 */
function previewIntake() {
  const msgs = collectMessages_(RUN_WINDOW_DAYS, { skipSeen: false });
  console.log('%s message(s) in the last %s days (seen or not):', msgs.length, RUN_WINDOW_DAYS);
  msgs.forEach(m => {
    console.log('--- %s | %s | %s chars\n%s', m.sentAt.toISOString(), m.subject, m.body.length, m.body.slice(0, 600));
  });
}

/** Prints the scan's state for a quick look from the editor. */
function status() {
  const p = props_().getProperties();
  const cal = p.CALENDAR_ID ? CalendarApp.getCalendarById(p.CALENDAR_ID) : null;
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'run');

  console.log('Calendar:      %s', cal ? '"' + cal.getName() + '"' : 'missing (run setup())');
  console.log('Triggers:      %s', triggers.length);
  console.log('GEMINI_KEY:    %s', p.GEMINI_KEY ? 'set' : 'NOT SET');
  console.log('Model:         %s', GEMINI_MODEL);
  ['SKIP_SUBJECTS', 'EXTRA_QUERY', 'lastRun', 'lastNew', 'lastError'].forEach(k => {
    console.log('%s %s', (k + ':').padEnd(14), p[k] || '(none)');
  });
}

// ── Intake ──

/**
 * New mail to scan, oldest first (so when two emails disagree, the newer one
 * is applied last and wins). Each item: { id, threadId, subject, sentAt, body, link }.
 */
function collectMessages_(days, opts) {
  const p = props_();
  const q = buildQuery_(days, p.getProperty('EXTRA_QUERY'));
  const skip = skipPattern_(p.getProperty('SKIP_SUBJECTS'));
  const seen = opts.skipSeen ? loadSeen_() : {};

  const out = [];
  listMessageIds_(q).forEach(id => {
    if (seen[id]) return;
    const msg = Gmail.Users.Messages.get('me', id, { format: 'full' });
    const subject = header_(msg.payload, 'Subject');
    if (skip && skip.test(subject)) return;
    out.push({
      id,
      threadId: msg.threadId,
      subject,
      sentAt:   new Date(Number(msg.internalDate)),
      body:     messageText_(msg.payload),
      link:     'https://mail.google.com/mail/u/0/#all/' + msg.threadId,
    });
  });
  return out.sort((a, b) => a.sentAt - b.sentAt);
}

/** Gmail search string. EXTRA_QUERY adds sources, e.g. "from:school.org". */
function buildQuery_(days, extra) {
  const sources = BASE_SOURCES.concat(extra && extra.trim() ? [extra.trim()] : []);
  return '(' + sources.join(' OR ') + ') newer_than:' + days + 'd';
}

function skipPattern_(src) {
  return src && src.trim() ? new RegExp(src.trim(), 'i') : null;
}

function listMessageIds_(q) {
  const ids = [];
  let pageToken;
  do {
    const res = Gmail.Users.Messages.list('me', { q, maxResults: 100, pageToken });
    (res.messages || []).forEach(m => ids.push(m.id));
    pageToken = res.nextPageToken;
  } while (pageToken && ids.length < MAX_MESSAGES);
  return ids.slice(0, MAX_MESSAGES);
}

function header_(payload, name) {
  const h = (payload.headers || []).find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

/** Plain text of a message: its text/plain part, else its HTML with tags stripped. */
function messageText_(payload) {
  const plain = findPart_(payload, 'text/plain');
  if (plain) return cleanBody_(decodePart_(plain));
  const html = findPart_(payload, 'text/html');
  return html ? cleanBody_(htmlToText_(decodePart_(html))) : '';
}

/** Depth-first search of a MIME tree for the first part of a type with data. */
function findPart_(part, mimeType) {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body && part.body.data) return part.body.data;
  for (const child of part.parts || []) {
    const found = findPart_(child, mimeType);
    if (found) return found;
  }
  return null;
}

function decodePart_(data) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(data)).getDataAsString('UTF-8');
}

function htmlToText_(html) {
  return String(html)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

/**
 * Text sent to Gemini. Links are removed entirely: they carry no dates, and
 * ParentSquare's carry per-user sign-in tokens that have no business leaving
 * the mailbox. The unsubscribe footer goes too.
 */
function cleanBody_(text) {
  return String(text || '')
    .replace(/To see the post and comment, please visit the following link:?/gi, '')
    .replace(/You received this email because[\s\S]*$/i, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(#39|#x27|apos);/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_BODY_CHARS);
}

// ── Seen messages ──
// A JSON map of Gmail message ID to the time it was first handled, kept in
// Script Properties and pruned after SEEN_TTL_DAYS. Marking happens in U3,
// only after a message's extraction succeeded.

function loadSeen_() {
  try {
    return JSON.parse(props_().getProperty('seenIds') || '{}');
  } catch (e) {
    return {};
  }
}

function pruneSeen_(seen, nowMs) {
  const cutoff = nowMs - SEEN_TTL_DAYS * 86400000;
  const kept = {};
  Object.keys(seen).forEach(id => { if (seen[id] >= cutoff) kept[id] = seen[id]; });
  return kept;
}

function saveSeen_(seen) {
  props_().setProperty('seenIds', JSON.stringify(pruneSeen_(seen, Date.now())));
}

// ── Helpers ──

/** Finds the scan's calendar by stored ID, then by name, else creates it. */
function ensureCalendar_() {
  const id = props_().getProperty('CALENDAR_ID');
  const byId = id && CalendarApp.getCalendarById(id);
  if (byId) return byId;

  const byName = CalendarApp.getOwnedCalendarsByName(CALENDAR_NAME)[0];
  if (byName) return byName;

  return CalendarApp.createCalendar(CALENDAR_NAME, {
    summary:  'School dates found in email by the Family Hub email scan. Fix or delete anything wrong; deleting this calendar removes everything the scan added.',
    timeZone: Session.getScriptTimeZone(),
  });
}

/** Replaces the daily triggers, so rerunning setup() never doubles them. */
function installTriggers_() {
  removeTriggers_();
  RUN_HOURS.forEach(h => {
    ScriptApp.newTrigger('run').timeBased().everyDays(1).atHour(h).nearMinute(RUN_MINUTE).create();
  });
}

function removeTriggers_() {
  const mine = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'run');
  mine.forEach(t => ScriptApp.deleteTrigger(t));
  return mine.length;
}
