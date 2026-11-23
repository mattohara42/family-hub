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
 *   1. Paste Code.gs and dedupe.gs (add a script file named "dedupe"). Turn on
 *      "Show appsscript.json" in Project Settings and paste appsscript.json over it.
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
// On its own pin, not the Hub's (FEATURES.md §23). 3.6 because 3.7/3.8 were
// overloaded on 2026-11-22 (503s, calls queued past the 6-minute limit).
const GEMINI_MODEL = 'gemini-3.6-flash';

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

const GEMINI_URL      = 'https://generativelanguage.googleapis.com/v1beta/models/';
const GEMINI_PAUSE_MS = 12000;           // between calls: 6.5s drew 429s on gemini-3.6-flash's free tier (about 5 a minute)
// Apps Script kills a run at 6 minutes. A message can take 30s+ on a thinking
// model, so stop starting new ones early enough to leave room for a slow one.
const TIME_BUDGET_MS  = 3.5 * 60 * 1000;
// A Gemini call can't be timed out in Apps Script, and one that never answers
// kills the run mid-call. A message gets this many killed runs, then it's skipped.
const KILL_LIMIT      = 2;

// Heartbeat alarms (accepted 2026-11-21). A run that trips one throws, and
// Google emails the owner about a failed trigger run.
const QUIET_DAYS        = 7;       // no ParentSquare mail at all for this long...
const QUIET_OFF_MONTHS  = [6, 7];  // ...outside July and August (0-based months)
const ZERO_STREAK_LIMIT = 10;      // digests in a row with nothing extracted

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

  const cal = ensureCalendar_(CALENDAR_NAME, 'CALENDAR_ID',
    'School dates found in email by the Family Hub email scan. Fix or delete anything wrong; deleting this calendar removes everything the scan added.');
  p.setProperty('CALENDAR_ID', cal.getId());
  const firstDeliveries = !p.getProperty('DELIVERY_CALENDAR_ID');
  const dcal = ensureCalendar_(DELIVERY_CALENDAR_NAME, 'DELIVERY_CALENDAR_ID',
    'Package deliveries found in email by the Family Hub email scan, on the day each is expected.');
  p.setProperty('DELIVERY_CALENDAR_ID', dcal.getId());
  if (!p.getProperty('SKIP_SUBJECTS')) p.setProperty('SKIP_SUBJECTS', DEFAULT_SKIP_SUBJECTS);
  const kinds = p.getProperty('ADD_KINDS');
  if (!kinds) p.setProperty('ADD_KINDS', KINDS.concat(['delivery']).join(', '));
  // A list saved before deliveries existed gets them once, the first time
  // setup() makes the calendar. Remove "delivery" afterwards to turn them off.
  else if (firstDeliveries && !wantsDeliveries_(kinds)) p.setProperty('ADD_KINDS', kinds + ', delivery');

  installTriggers_();

  const probe = Gmail.Users.Messages.list('me', { q: BASE_QUERY + ' newer_than:7d', maxResults: 5 });
  const recent = (probe.messages || []).length;

  console.log('Calendar: "%s"', cal.getName());
  console.log('Deliveries: "%s" (%s)', dcal.getName(), wantsDeliveries_(p.getProperty('ADD_KINDS')) ? 'on' : 'off');
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

/** The scheduled entry point: scans the last few days of new mail. */
function run() {
  scan_(RUN_WINDOW_DAYS, new Date());
}

/**
 * One-time pass over the last 60 days, used during rollout. A run stops
 * after about 4 minutes; run it again until it reports nothing left.
 * To redo a backfill from scratch, delete the calendar's events and run
 * resetSeen() first.
 */
function backfill() {
  scan_(BACKFILL_WINDOW_DAYS, new Date());
}

/**
 * Forgets which messages were handled and which events the scan made, so the
 * next backfill() rereads everything and re-adds what's missing, including
 * events you deleted.
 */
function resetSeen() {
  props_().deleteProperty('seenIds');
  props_().deleteProperty('zeroStreak');
  props_().deleteProperty('madeEvents');
  props_().deleteProperty('madeDeliveries');
  props_().deleteProperty('killedOn');
  props_().deleteProperty('inFlight');
  console.log('Seen messages and remembered events cleared.');
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
  console.log('Seen:          %s message(s)', Object.keys(loadSeen_()).length);
  console.log('Adding:        %s', wantedKinds_(p.ADD_KINDS).join(', '));
  const dcal = p.DELIVERY_CALENDAR_ID ? CalendarApp.getCalendarById(p.DELIVERY_CALENDAR_ID) : null;
  console.log('Deliveries:    %s', !wantsDeliveries_(p.ADD_KINDS) ? 'off (add "delivery" to ADD_KINDS)'
    : dcal ? 'on, "' + dcal.getName() + '"' : 'calendar missing (run setup())');
  console.log('Remembered:    %s event(s) made by the scan', loadMade_().length);
  ['SKIP_SUBJECTS', 'EXTRA_QUERY', 'lastRun', 'lastNew', 'lastResult', 'lastError', 'zeroStreak'].forEach(k => {
    console.log('%s %s', (k + ':').padEnd(14), p[k] || '(none)');
  });
}

// ── Scan ──

/**
 * One pass: read new mail, extract, write. A message is marked seen only
 * after its extraction and writes succeeded, so a failure is retried next run.
 */
function scan_(days, now) {
  const started = Date.now();
  const p = props_();
  const key = p.getProperty('GEMINI_KEY');
  if (!key) throw new Error('GEMINI_KEY is not set (Project Settings > Script Properties).');
  const cal = CalendarApp.getCalendarById(p.getProperty('CALENDAR_ID') || '');
  if (!cal) throw new Error('The "' + CALENDAR_NAME + '" calendar is missing. Run setup().');

  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const seen = loadSeen_();
  // inFlight is still set only if the last run was killed during that message's call.
  const killed = JSON.parse(p.getProperty('killedOn') || '{}');
  const stuck = p.getProperty('inFlight');
  if (stuck) {
    killed[stuck] = (killed[stuck] || 0) + 1;
    p.setProperty('killedOn', JSON.stringify(killed));
    p.deleteProperty('inFlight');
  }
  const kinds = wantedKinds_(p.getProperty('ADD_KINDS'));
  // Anything on the calendar now was made by the scan, so remember it too:
  // that covers events from before this list existed.
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + MAX_DAYS_AHEAD);
  const onCal = cal.getEvents(new Date(now.getFullYear(), now.getMonth(), now.getDate()), horizon)
    .filter(ev => ev.getTag('fhKind')).map(toExisting_);
  let made = mergeMade_(loadMade_(), onCal, today);
  let zeroStreak = Number(p.getProperty('zeroStreak') || 0);
  const dcal = deliveryCalendar_(p);
  let dMade = loadDeliveryMade_();

  // School mail, then shipping mail that isn't also school mail, oldest first.
  const school = collectMessages_(days, { skipSeen: true });
  const ids = {};
  school.forEach(m => { ids[m.id] = true; });
  const shipping = dcal
    ? collectMessages_(Math.min(days, DELIVERY_WINDOW_DAYS), { skipSeen: true, query: deliveryQuery_(p) })
      .filter(m => !ids[m.id]).map(m => ({ ...m, delivery: true }))
    : [];
  const kills = m => killed[m.id] || 0;
  const all = school.concat(shipping).sort((a, b) => a.sentAt - b.sentAt);
  const skipped = all.filter(m => kills(m) >= KILL_LIMIT);
  // A message that killed a run goes last, so everything else is done first.
  const msgs = all.filter(m => kills(m) < KILL_LIMIT).sort((a, b) => kills(a) - kills(b));
  const counts = {};
  const errors = [];
  skipped.forEach(m => {
    seen[m.id] = Date.now();
    delete killed[m.id];
    errors.push(m.subject + ': skipped, ' + KILL_LIMIT + ' runs ran out of time waiting for Gemini on it');
  });
  let handled = 0;
  let left = 0;

  for (let i = 0; i < msgs.length; i++) {
    if (Date.now() - started > TIME_BUDGET_MS) { left = msgs.length - i; break; }
    const m = msgs[i];
    try {
      if (i > 0) Utilities.sleep(GEMINI_PAUSE_MS);
      const t0 = Date.now();
      console.log('Reading: %s', m.subject); // so a run killed mid-call names the message
      p.setProperty('inFlight', m.id);
      if (m.delivery) {
        const d = extractDelivery_(m, key, tz);
        const result = d ? applyDelivery_(dcal, d, m, today, dMade.map(e => e[0])) : 'not one';
        if (['create', 'update', 'touch'].indexOf(result) >= 0) dMade = mergeDeliveryMade_(dMade, deliveryKeys_(d), today);
        counts['delivery ' + result] = (counts['delivery ' + result] || 0) + 1;
        seen[m.id] = Date.now();
        saveSeen_(seen);
        saveDeliveryMade_(dMade);
        handled++;
        console.log('%s: delivery %s in %ss', m.subject, result, Math.round((Date.now() - t0) / 1000));
        continue;
      }
      const items = extractItems_(m, key, tz);
      items.forEach(item => {
        const result = kinds.indexOf(item.kind) < 0 ? 'kind off' : applyItem_(cal, item, m, today, madeEntries_(made));
        if (result === 'create') made = mergeMade_(made, [{ ...item, baseTitle: item.title }], today);
        counts[result] = (counts[result] || 0) + 1;
      });
      if (/digest/i.test(m.subject)) zeroStreak = items.length ? 0 : zeroStreak + 1;
      seen[m.id] = Date.now();
      saveSeen_(seen); // now, not after the loop: a run killed at 6 minutes keeps what it finished
      saveMade_(made);
      handled++;
      console.log('%s: %s item(s) in %ss', m.subject, items.length, Math.round((Date.now() - t0) / 1000));
    } catch (e) {
      errors.push(m.subject + ': ' + e.message);
    }
    p.deleteProperty('inFlight');
  }

  saveSeen_(seen);
  p.setProperty('killedOn', JSON.stringify(killed));
  const summary = msgs.length + ' message(s), ' + handled + ' handled, ' + errors.length + ' failed'
    + (left ? ', ' + left + ' left for the next run' : '')
    + '. Items: ' + (Object.keys(counts).map(k => k + ' ' + counts[k]).join(', ') || 'none');
  p.setProperties({
    lastRun:    now.toISOString(),
    lastNew:    String(counts.create || 0),
    lastResult: summary,
    lastError:  errors[0] || '',
    zeroStreak: String(zeroStreak),
  });
  console.log(summary);
  errors.forEach(e => console.warn(e));

  const alarms = heartbeatAlarms_({ msgs: msgs.length, handled, errors, zeroStreak, now });
  if (alarms.length) throw new Error(alarms.join(' '));
}

/**
 * The quiet failures that wouldn't otherwise throw. Returned as messages;
 * scan_ throws with them so Google's failed-run email reaches the owner.
 */
function heartbeatAlarms_(r) {
  const alarms = [];
  if (r.errors.length && r.handled === 0) {
    alarms.push('Every message failed this run. First error: ' + r.errors[0]);
  }
  if (r.zeroStreak >= ZERO_STREAK_LIMIT) {
    alarms.push(r.zeroStreak + ' digests in a row produced no dates. Check the model (' + GEMINI_MODEL
      + ') and the prompt; previewIntake() shows what Gemini receives.');
  }
  if (QUIET_OFF_MONTHS.indexOf(r.now.getMonth()) < 0) {
    const res = Gmail.Users.Messages.list('me', { q: 'from:parentsquare.com newer_than:' + QUIET_DAYS + 'd', maxResults: 1 });
    if (!(res.messages || []).length) {
      alarms.push('No ParentSquare mail at all in ' + QUIET_DAYS + ' days. Has the school\'s email address or your subscription changed?');
    }
  }
  return alarms;
}

// ── Extraction ──

function extractItems_(m, key, tz) {
  const sentLocal = Utilities.formatDate(m.sentAt, tz, 'EEEE, yyyy-MM-dd');
  return parseGeminiItems_(geminiCall_(key, geminiRequest_(buildPrompt_(m.subject, sentLocal, tz, m.body))));
}

/** One generateContent call; returns the response body, or throws with the status. */
function geminiCall_(key, request) {
  const res = UrlFetchApp.fetch(GEMINI_URL + GEMINI_MODEL + ':generateContent', {
    method:             'post',
    contentType:        'application/json',
    headers:            { 'x-goog-api-key': key },   // a header, so the key never appears in a URL or log
    payload:            JSON.stringify(request),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error('Gemini HTTP ' + code + quotaNote_(res.getContentText()) + ': ' + res.getContentText().slice(0, 200));
  return res.getContentText();
}

// ── Calendar writes ──
// Every event the scan writes carries private tags: fhKind, fhDate, fhTitle
// (the item title before the display prefix), fhStart, fhEnd, fhEndDate, and
// fhSig (a fingerprint of title and times; see signature_ in dedupe.gs).

/** Applies one item and returns what happened: create | touch | update | locked | past | far. */
function applyItem_(cal, item, m, today, made) {
  const existing = cal.getEventsForDay(eventTimes_(item).start)
    .filter(ev => ev.getTag('fhKind'))
    .map(toExisting_);
  const decision = decideItem_(item, existing, today, made);

  if (decision.action === 'create') {
    createEvent_(cal, item, newDescription_(item, m.link));
  } else if (decision.action === 'touch') {
    const ev = decision.target.ev;
    ev.setDescription(addSource_(ev.getDescription(), m.link));
  } else if (decision.action === 'update') {
    updateEvent_(cal, decision.target, item, m);
  }
  return decision.action;
}

function toExisting_(ev) {
  return {
    ev,
    date:       ev.getTag('fhDate') || null,
    kind:       ev.getTag('fhKind'),
    baseTitle:  ev.getTag('fhTitle') || '',
    startTime:  ev.getTag('fhStart') || null,
    endTime:    ev.getTag('fhEnd') || null,
    endDate:    ev.getTag('fhEndDate') || null,
    storedSig:  ev.getTag('fhSig') || '',
    currentSig: eventSig_(ev),
  };
}

function createEvent_(cal, item, description) {
  const t = eventTimes_(item);
  const title = displayTitle_(item);
  const ev = t.allDay
    ? cal.createAllDayEvent(title, t.start, t.end, { description })
    : cal.createEvent(title, t.start, t.end, { description });
  tagEvent_(ev, item);
  return ev;
}

/** The newer email wins: new title and times, with a note of what changed. */
function updateEvent_(cal, target, item, m) {
  const ev = target.ev;
  const t = eventTimes_(item);
  const description = (ev.getDescription() || '') + '\nChanged from ' + slotLabel_(target) + ', per ' + m.link;

  if (ev.isAllDayEvent() !== t.allDay) {
    // Calendar can't turn an all-day event into a timed one in place.
    ev.deleteEvent();
    createEvent_(cal, item, description);
    return;
  }
  ev.setTitle(displayTitle_(item));
  if (t.allDay) ev.setAllDayDates(t.start, t.end);
  else ev.setTime(t.start, t.end);
  ev.setDescription(description);
  tagEvent_(ev, item);
}

/**
 * Tags are written last, and fhSig is read back from the event Calendar
 * actually stored, so a rounding or time zone quirk can't make a fresh
 * event look hand-edited.
 */
function tagEvent_(ev, item) {
  ev.setTag('fhKind', item.kind);
  ev.setTag('fhDate', item.date);
  ev.setTag('fhTitle', item.title || '');
  ev.setTag('fhStart', item.startTime || '');
  ev.setTag('fhEnd', item.endTime || '');
  ev.setTag('fhEndDate', item.endDate || '');
  ev.setTag('fhSig', eventSig_(ev));
}

function eventSig_(ev) {
  const allDay = ev.isAllDayEvent();
  const start = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
  const end = allDay ? ev.getAllDayEndDate() : ev.getEndTime();
  return signature_(ev.getTitle(), start.getTime(), end.getTime(), allDay);
}

/**
 * " (GenerateRequestsPerDayPerProjectPerModel-FreeTier)" for a quota 429, so
 * a daily cap reads differently from a per-minute one. The id sits past the
 * 200 characters of body the error keeps.
 */
function quotaNote_(text) {
  try {
    const ids = (JSON.parse(text).error.details || [])
      .flatMap(d => d.violations || []).map(v => v.quotaId).filter(Boolean);
    return ids.length ? ' (' + ids.join(', ') + ')' : '';
  } catch (e) {
    return '';
  }
}

// ── Intake ──

/**
 * New mail to scan, oldest first (so when two emails disagree, the newer one
 * is applied last and wins). Each item: { id, threadId, subject, sentAt, body, link }.
 */
function collectMessages_(days, opts) {
  const p = props_();
  const q = opts.query ? opts.query + ' newer_than:' + days + 'd' : buildQuery_(days, p.getProperty('EXTRA_QUERY'));
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

// The advanced Gmail service returns body.data already decoded, as a byte
// array; only the raw REST API hands back a base64url string. Accept both.
function decodePart_(data) {
  const bytes = typeof data === 'string' ? Utilities.base64DecodeWebSafe(data) : data;
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
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
// Script Properties and pruned after SEEN_TTL_DAYS. scan_() marks a message
// only after its extraction and calendar writes succeeded.

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

/** Events the scan has created, as [date, endDate, kind, title] (see mergeMade_). */
function loadMade_() {
  try {
    return JSON.parse(props_().getProperty('madeEvents') || '[]');
  } catch (e) {
    return [];
  }
}

function saveMade_(made) {
  props_().setProperty('madeEvents', JSON.stringify(made));
}

// ── Helpers ──

/** Finds one of the scan's calendars by stored ID, then by name, else creates it. */
function ensureCalendar_(name, idProp, summary) {
  const id = props_().getProperty(idProp);
  const byId = id && CalendarApp.getCalendarById(id);
  if (byId) return byId;

  const byName = CalendarApp.getOwnedCalendarsByName(name)[0];
  if (byName) return byName;

  return CalendarApp.createCalendar(name, { summary, timeZone: Session.getScriptTimeZone() });
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
