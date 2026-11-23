/**
 * Tests for the email scan Apps Script (tools/email-scan/*.gs).
 *
 * Run with:  npm test   (Node's built-in test runner, no deps)
 *
 * The .gs files only define functions and constants at load time, so they
 * run in a Node vm with small fakes for the Apps Script services they touch
 * (Gmail, Calendar, UrlFetch for Gemini, Properties). Real Google calls are
 * exercised by the rollout in docs/plans/2026-11-21-001-feat-email-scan-plan.md.
 *
 * What they protect: the scan only reads the mail it means to, never sends
 * ParentSquare's per-user sign-in links to Gemini, puts each school date on
 * the calendar once however many emails repeat it, lets a newer email's
 * correction win, never overwrites an event someone fixed by hand, and
 * throws (so Google emails the owner) when it has quietly stopped working.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '../tools/email-scan');
const SRC = ['dedupe.gs', 'deliveries.gs', 'Code.gs'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');

const b64url = s => Buffer.from(s, 'utf8').toString('base64url');
// What the advanced Gmail service really returns for body.data: Java's signed bytes.
const gmailBytes = s => Array.from(Buffer.from(s, 'utf8'), b => (b > 127 ? b - 256 : b));

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

/** "YYYY-MM-DD" n days from today, in local time (the script's time zone here). */
function daysFromNow(n) {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** A fake Calendar with just the calls the script makes. */
function fakeCalendar(id = 'cal-from-email', name = 'From Email') {
  const events = [];
  const make = (title, start, end, allDay, opts) => {
    const ev = {
      title, start, end, allDay, description: (opts && opts.description) || '', tags: {},
      getTitle() { return this.title; },
      setTitle(t) { this.title = t; },
      isAllDayEvent() { return this.allDay; },
      getAllDayStartDate() { return new Date(this.start); },
      getAllDayEndDate() { return new Date(this.end); },
      getStartTime() { return new Date(this.start); },
      getEndTime() { return new Date(this.end); },
      setAllDayDates(s, e) { this.start = s; this.end = e; },
      setTime(s, e) { this.start = s; this.end = e; },
      getDescription() { return this.description; },
      setDescription(d) { this.description = d; },
      getTag(k) { return k in this.tags ? this.tags[k] : null; },
      setTag(k, v) { this.tags[k] = String(v); },
      deleteEvent() { events.splice(events.indexOf(this), 1); },
    };
    events.push(ev);
    return ev;
  };
  return {
    events,
    getId: () => id,
    getName: () => name,
    createAllDayEvent: (t, s, e, o) => make(t, s, e, true, o),
    createEvent: (t, s, e, o) => make(t, s, e, false, o),
    getEvents: (start, end) => events.filter(ev => ev.start < end && ev.end > start),
    getEventsForDay: d => {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      return events.filter(ev => ev.start < end && ev.end > start);
    },
  };
}

/** A Gemini generateContent response body carrying these items. */
// An array is a school reply ({ items }); an object is sent as-is (a delivery reply).
const geminiReply = x => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(Array.isArray(x) ? { items: x } : x) }] } }] });

/**
 * A fresh script context. `messages` maps id to a Gmail API message.
 * `gemini` is a function (prompt) => { code, body } or a list of item arrays,
 * one per call.
 */
function load({ props = {}, messages = {}, shipping = {}, listPages, gemini = [], quietMail } = {}) {
  const store = { ...props };
  const queries = [];
  const prompts = [];
  const cal = fakeCalendar();
  const dcal = fakeCalendar('cal-deliveries', 'Deliveries');
  const triggers = [];
  const geminiQueue = Array.isArray(gemini) ? gemini.slice() : null;
  const ctx = {
    console: { log() {}, warn() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in store ? store[k] : null),
      setProperty: (k, v) => { store[k] = String(v); },
      setProperties: o => { Object.keys(o).forEach(k => { store[k] = String(o[k]); }); },
      deleteProperty: k => { delete store[k]; },
      getProperties: () => ({ ...store }),
    }) },
    Utilities: {
      base64DecodeWebSafe: s => {
        if (typeof s !== 'string') throw new Error('Could not decode string.'); // as Apps Script does
        return Buffer.from(s, 'base64url');
      },
      newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
      sleep() {},
      formatDate: (d, _tz, fmt) => fmt === 'yyyy-MM-dd' ? ymd(d)
        : d.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + ymd(d),
    },
    Session: { getScriptTimeZone: () => 'America/New_York' },
    CalendarApp: {
      getCalendarById: id => ({ 'cal-from-email': cal, 'cal-deliveries': dcal })[id] || null,
      getOwnedCalendarsByName: () => [],
      createCalendar: name => (name === 'Deliveries' ? dcal : cal),
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => { triggers.splice(triggers.indexOf(t), 1); },
      newTrigger: fn => {
        const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, nearMinute: () => b,
          create: () => { triggers.push({ getHandlerFunction: () => fn }); } };
        return b;
      },
    },
    UrlFetchApp: { fetch: (_url, opts) => {
      const prompt = JSON.parse(opts.payload).contents[0].parts[0].text;
      prompts.push(prompt);
      const r = geminiQueue ? { code: 200, body: geminiReply(geminiQueue.shift() || []) } : gemini(prompt);
      return { getResponseCode: () => r.code, getContentText: () => r.body };
    } },
    Gmail: { Users: { Messages: {
      list: (_me, opts) => {
        queries.push(opts.q);
        if (/^from:parentsquare\.com newer_than:\d+d$/.test(opts.q) && quietMail !== undefined) {
          return { messages: quietMail ? [{ id: 'q' }] : [] };
        }
        if (/out for delivery/.test(opts.q)) return { messages: Object.keys(shipping).map(id => ({ id })) };
        if (listPages) return listPages(opts.pageToken);
        return { messages: Object.keys(messages).map(id => ({ id })) };
      },
      get: (_me, id) => messages[id] || shipping[id],
    } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, store, queries, prompts, cal, dcal };
}

const READY = { GEMINI_KEY: 'test-key', CALENDAR_ID: 'cal-from-email' };

function gmailMessage({ id, subject, sentMs, text, html }) {
  const parts = [];
  if (text) parts.push({ mimeType: 'text/plain', body: { data: gmailBytes(text) } });
  if (html) parts.push({ mimeType: 'text/html', body: { data: gmailBytes(html) } });
  return {
    id,
    threadId: 't' + id,
    internalDate: String(sentMs),
    payload: {
      mimeType: 'multipart/alternative',
      headers: [{ name: 'Subject', value: subject }],
      parts: [{ mimeType: 'multipart/related', parts }],
    },
  };
}

// An invented digest in ParentSquare's shape: a post, a tokenized link, a footer.
const DIGEST = [
  'Daily digest created for A Parent',
  '1. Upcoming Dates',
  'Posted by A Teacher on Friday',
  '- **Friday, Dec 4th:&nbsp;** Parent-Teacher Conferences - NO school',
  "It&#39;s a half day &amp; early dismissal at 2:10pm",
  'To see the post and comment, please visit the following link: https://www.parentsquare.com/feeds/1?s=eyJhbGciOiJIUzI1NiJ9.SECRET',
  '',
  '',
  '',
  'You received this email because you are a ParentSquare user. Unsubscribe https://www.parentsquare.com/x',
].join('\n');

test('cleanBody_ drops links, the link prompt and the footer', () => {
  const { ctx } = load();
  const out = ctx.cleanBody_(DIGEST);
  assert.doesNotMatch(out, /https?:/);
  assert.doesNotMatch(out, /SECRET/);
  assert.doesNotMatch(out, /To see the post/);
  assert.doesNotMatch(out, /You received this email/);
  assert.match(out, /Parent-Teacher Conferences/);
});

test('cleanBody_ decodes entities and collapses blank runs', () => {
  const { ctx } = load();
  const out = ctx.cleanBody_(DIGEST);
  assert.match(out, /Dec 4th: \*\*/);
  assert.match(out, /It's a half day & early dismissal/);
  assert.doesNotMatch(out, /\n{3,}/);
});

test('cleanBody_ truncates to MAX_BODY_CHARS', () => {
  const { ctx } = load();
  assert.equal(ctx.cleanBody_('x'.repeat(20000)).length, vm.runInContext('MAX_BODY_CHARS', ctx));
});

test('messageText_ prefers text/plain inside nested parts', () => {
  const { ctx } = load();
  const msg = gmailMessage({ id: 'a', subject: 's', sentMs: 0, text: 'plain wins', html: '<p>html loses</p>' });
  assert.equal(ctx.messageText_(msg.payload), 'plain wins');
});

test('messageText_ reads Gmail byte arrays (with non-ASCII) and base64url strings', () => {
  const { ctx } = load();
  const bytes = { mimeType: 'text/plain', body: { data: gmailBytes('No school – Dec 4 ✓') } };
  assert.equal(ctx.messageText_(bytes), 'No school – Dec 4 ✓');
  const str = { mimeType: 'text/plain', body: { data: b64url('plain string') } };
  assert.equal(ctx.messageText_(str), 'plain string');
});

test('messageText_ falls back to HTML with tags and styles stripped', () => {
  const { ctx } = load();
  const msg = gmailMessage({
    id: 'a', subject: 's', sentMs: 0,
    html: '<style>p{color:red}</style><p>No school</p><p>Dec 4<br>conferences</p>',
  });
  assert.equal(ctx.messageText_(msg.payload), 'No school\nDec 4\nconferences');
});

test('buildQuery_ ORs EXTRA_QUERY into the sources', () => {
  const { ctx } = load();
  assert.equal(ctx.buildQuery_(3, ''), '(from:parentsquare.com OR label:Hub) newer_than:3d');
  assert.equal(ctx.buildQuery_(60, ' from:school.org '),
    '(from:parentsquare.com OR label:Hub OR from:school.org) newer_than:60d');
});

test('pruneSeen_ drops IDs older than SEEN_TTL_DAYS', () => {
  const { ctx } = load();
  const now = Date.UTC(2026, 10, 21);
  const day = 86400000;
  const kept = ctx.pruneSeen_({ fresh: now - 2 * day, edge: now - 10 * day, old: now - 11 * day }, now);
  assert.deepEqual(Object.keys(kept).sort(), ['edge', 'fresh']);
});

test('collectMessages_ skips seen IDs and skipped subjects, oldest first', () => {
  const messages = {
    n: gmailMessage({ id: 'n', subject: 'Nov 20 Digest', sentMs: 3000, text: 'newer' }),
    o: gmailMessage({ id: 'o', subject: 'Nov 18 Digest', sentMs: 1000, text: 'older' }),
    s: gmailMessage({ id: 's', subject: 'Nov 19 Digest', sentMs: 2000, text: 'already seen' }),
    a: gmailMessage({ id: 'a', subject: 'Attendance Notification', sentMs: 2500, text: 'absent' }),
    l: gmailMessage({ id: 'l', subject: 'Library Tomorrow', sentMs: 2600, text: 'books' }),
  };
  const { ctx, queries } = load({
    messages,
    props: { seenIds: JSON.stringify({ s: Date.now() }), SKIP_SUBJECTS: 'Attendance Notification|Library (Tomorrow|Monday)' },
  });
  const out = ctx.collectMessages_(3, { skipSeen: true });
  assert.deepEqual(Array.from(out, m => m.id), ['o', 'n']);
  assert.equal(out[0].body, 'older');
  assert.equal(out[0].link, 'https://mail.google.com/mail/u/0/#all/to');
  assert.equal(queries[0], '(from:parentsquare.com OR label:Hub) newer_than:3d');
});

test('collectMessages_ with skipSeen false (previewIntake) rereads seen mail', () => {
  const messages = { s: gmailMessage({ id: 's', subject: 'Digest', sentMs: 1, text: 'x' }) };
  const { ctx } = load({ messages, props: { seenIds: JSON.stringify({ s: Date.now() }) } });
  assert.equal(ctx.collectMessages_(60, { skipSeen: false }).length, 1);
});

test('listMessageIds_ follows page tokens', () => {
  const pages = { undefined: { messages: [{ id: '1' }], nextPageToken: 'p2' }, p2: { messages: [{ id: '2' }] } };
  const { ctx } = load({ listPages: tok => pages[tok] });
  assert.deepEqual(Array.from(ctx.listMessageIds_('q')), ['1', '2']);
});


// ── dedupe.gs: pure rules ──

const item = o => ({ endDate: null, startTime: null, endTime: null, title: '', confidence: 0.9, ...o });
const existingFrom = (ctx, it, extra = {}) => ({
  kind: it.kind, baseTitle: it.title, startTime: it.startTime, endTime: it.endTime, endDate: it.endDate,
  storedSig: 'sig', currentSig: 'sig', ...extra,
});

test('titleTokens_ reads "third", "3rd" and "3" the same and drops filler words', () => {
  const { ctx } = load();
  assert.deepEqual(Array.from(ctx.titleTokens_('The Third Grade Musical!')), ['3', 'grade', 'musical']);
  assert.deepEqual(Array.from(ctx.titleTokens_('3rd grade musical')), ['3', 'grade', 'musical']);
});

test('decideItem_: a second half day on the same date is a repeat, however it is worded', () => {
  const { ctx } = load();
  const today = daysFromNow(0), d = daysFromNow(10);
  const first = item({ date: d, kind: 'half-day', title: 'Parent Teacher Conferences' });
  const second = item({ date: d, kind: 'half-day', title: 'HALF DAY!' });
  assert.equal(ctx.decideItem_(second, [existingFrom(ctx, first)], today).action, 'touch');
});

test('decideItem_: a different day-level kind on the same date is new', () => {
  const { ctx } = load();
  const d = daysFromNow(10);
  const half = item({ date: d, kind: 'half-day' });
  const conf = item({ date: d, kind: 'conference' });
  assert.equal(ctx.decideItem_(conf, [existingFrom(ctx, half)], daysFromNow(0)).action, 'create');
});

test('decideItem_: events match on title overlap, not on date alone', () => {
  const { ctx } = load();
  const d = daysFromNow(10), today = daysFromNow(0);
  const musical = item({ date: d, kind: 'event', title: '3rd grade musical' });
  const same = item({ date: d, kind: 'event', title: 'Third Grade Musical performance' });
  const other = item({ date: d, kind: 'event', title: 'Book fair' });
  assert.equal(ctx.decideItem_(same, [existingFrom(ctx, musical)], today).action, 'touch');
  assert.equal(ctx.decideItem_(other, [existingFrom(ctx, musical)], today).action, 'create');
});

test('decideItem_: a changed time is an update; a hand-edited event is locked', () => {
  const { ctx } = load();
  const d = daysFromNow(3), today = daysFromNow(0);
  const was = item({ date: d, kind: 'early-dismissal', startTime: '14:10' });
  const now = item({ date: d, kind: 'early-dismissal', startTime: '13:30' });
  assert.equal(ctx.decideItem_(now, [existingFrom(ctx, was)], today).action, 'update');
  const edited = existingFrom(ctx, was, { currentSig: 'different' });
  assert.equal(ctx.decideItem_(now, [edited], today).action, 'locked');
});

test('decideItem_: one day inside a break already on the calendar does not shrink it', () => {
  const { ctx } = load();
  const brk = item({ date: daysFromNow(5), endDate: daysFromNow(7), kind: 'no-school', title: 'Thanksgiving break' });
  const oneDay = item({ date: daysFromNow(6), kind: 'no-school' });
  const existing = existingFrom(ctx, brk, { date: brk.date });
  assert.equal(ctx.decideItem_(oneDay, [existing], daysFromNow(0)).action, 'touch');
});

test('decideItem_: something the scan made before but is no longer on the calendar was removed', () => {
  const { ctx } = load();
  const today = daysFromNow(0);
  const brk = item({ date: daysFromNow(10), endDate: daysFromNow(14), kind: 'no-school', title: 'Winter break' });
  const made = [{ date: brk.date, endDate: brk.endDate, kind: 'no-school', baseTitle: 'Winter break' }];
  assert.equal(ctx.decideItem_(brk, [], today, made).action, 'removed');
  // One day inside the removed break counts too; a different kind that day does not.
  assert.equal(ctx.decideItem_(item({ date: daysFromNow(12), kind: 'no-school' }), [], today, made).action, 'removed');
  assert.equal(ctx.decideItem_(item({ date: daysFromNow(12), kind: 'conference' }), [], today, made).action, 'create');
  assert.equal(ctx.decideItem_(item({ date: daysFromNow(15), kind: 'no-school' }), [], today, made).action, 'create');
});

test('wantedKinds_: blank means every kind; unknown names are ignored', () => {
  const { ctx } = load();
  assert.deepEqual(Array.from(ctx.wantedKinds_('')), ['no-school', 'half-day', 'early-dismissal', 'conference', 'event']);
  assert.deepEqual(Array.from(ctx.wantedKinds_(' no-school ,half-day, nope')), ['no-school', 'half-day']);
});

test('decideItem_: past dates and misread years are dropped', () => {
  const { ctx } = load();
  const today = daysFromNow(0);
  assert.equal(ctx.decideItem_(item({ date: daysFromNow(-1), kind: 'no-school' }), [], today).action, 'past');
  assert.equal(ctx.decideItem_(item({ date: daysFromNow(-2), endDate: daysFromNow(1), kind: 'no-school' }), [], today).action, 'create');
  assert.equal(ctx.decideItem_(item({ date: daysFromNow(500), kind: 'no-school' }), [], today).action, 'far');
});

test('sanitizeItems_ keeps only well-formed items', () => {
  const { ctx } = load();
  const out = ctx.sanitizeItems_({ items: [
    { date: '2026-12-04', kind: 'no-school', title: '', confidence: 2 },
    { date: 'Dec 4', kind: 'no-school', title: 'x', confidence: 1 },
    { date: '2026-12-04', kind: 'party', title: 'x', confidence: 1 },
    { date: '2026-12-04', kind: 'event', title: '  ', confidence: 1 },
    { date: '2026-12-05', kind: 'event', title: 'Concert', startTime: '18:00', endTime: '17:00', endDate: '2026-12-01', confidence: 0.7 },
  ] });
  assert.equal(out.length, 2);
  assert.equal(out[0].confidence, 1);
  assert.equal(out[1].endTime, null);
  assert.equal(out[1].endDate, null);
  assert.equal(ctx.sanitizeItems_({}).length, 0);
});

test('displayTitle_ labels day-level kinds and flags low confidence', () => {
  const { ctx } = load();
  assert.equal(ctx.displayTitle_(item({ kind: 'half-day', title: 'Parent teacher conferences' })), 'Half day: Parent teacher conferences');
  assert.equal(ctx.displayTitle_(item({ kind: 'half-day', title: 'HALF DAY' })), 'Half day');
  assert.equal(ctx.displayTitle_(item({ kind: 'early-dismissal', startTime: '14:10' })), 'Early dismissal 2:10 PM');
  assert.equal(ctx.displayTitle_(item({ kind: 'event', title: 'Book fair', confidence: 0.4 })), 'Book fair (check)');
});

test('addSource_ adds a link once and stops at three', () => {
  const { ctx } = load();
  const link = n => 'https://mail.google.com/mail/u/0/#all/t' + n;
  let d = 'Added\nSource: ' + link(1);
  d = ctx.addSource_(d, link(1));
  assert.equal(d, 'Added\nSource: ' + link(1));
  d = ctx.addSource_(ctx.addSource_(ctx.addSource_(d, link(2)), link(3)), link(4));
  assert.doesNotMatch(d, /t4/);
  assert.equal((d.match(/^Source: /gm) || []).length, 3);
});

test('parseGeminiItems_ throws when Gemini gives no answer at all', () => {
  const { ctx } = load();
  assert.throws(() => ctx.parseGeminiItems_(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] })), /SAFETY/);
  assert.equal(ctx.parseGeminiItems_(geminiReply([])).length, 0);
});

// ── Code.gs: full scans against the fakes ──

const digest = (id, daysAgo, text) => gmailMessage({
  id, subject: 'Daily Digest ' + id, sentMs: Date.now() - daysAgo * 86400000, text,
});

test('scan: a date repeated in two digests lands once, with both sources', () => {
  const d = daysFromNow(12);
  const { ctx, cal, store } = load({
    props: READY,
    messages: { a: digest('a', 2, 'first mention'), b: digest('b', 1, 'second mention') },
    gemini: [
      [{ date: d, kind: 'half-day', title: 'Parent Teacher Conferences', confidence: 0.9 }],
      [{ date: d, kind: 'half-day', title: 'HALF DAY! Conferences', confidence: 0.9 }],
    ],
  });
  ctx.run();
  assert.equal(cal.events.length, 1);
  assert.equal(cal.events[0].title, 'Half day: Parent Teacher Conferences');
  assert.equal((cal.events[0].description.match(/^Source: /gm) || []).length, 2);
  assert.deepEqual(Object.keys(JSON.parse(store.seenIds)).sort(), ['a', 'b']);
  assert.equal(store.lastNew, '1');
});

test('scan: each message is marked seen as soon as it is handled', () => {
  // Apps Script kills a run at 6 minutes without running anything after the
  // loop, so progress must already be saved when the next message starts.
  const seenAtCall = [];
  let st;
  const { ctx, store } = load({
    props: READY,
    messages: { a: digest('a', 2, 'one'), b: digest('b', 1, 'two') },
    gemini: () => {
      seenAtCall.push(Object.keys(JSON.parse((st && st.seenIds) || '{}')));
      return { code: 200, body: geminiReply([]) };
    },
  });
  st = store;
  ctx.run();
  assert.deepEqual(seenAtCall, [[], ['a']]); // 'a' is older, so it goes first
});

test('scan: the prompt carries the sent date and no links', () => {
  const { ctx, prompts } = load({
    props: READY,
    messages: { a: digest('a', 1, 'See https://www.parentsquare.com/feeds/1?s=TOKEN for details') },
    gemini: [[]],
  });
  ctx.run();
  assert.match(prompts[0], /sent on \w+day, \d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(prompts[0], /TOKEN|https?:/);
});

test('scan: a newer email moving the dismissal time updates the event', () => {
  const d = daysFromNow(4);
  const { ctx, cal } = load({
    props: READY,
    messages: { a: digest('a', 2, 'old'), b: digest('b', 1, 'new') },
    gemini: [
      [{ date: d, kind: 'early-dismissal', startTime: '14:10', title: '', confidence: 0.9 }],
      [{ date: d, kind: 'early-dismissal', startTime: '13:30', title: '', confidence: 0.9 }],
    ],
  });
  ctx.run();
  assert.equal(cal.events.length, 1);
  assert.equal(cal.events[0].title, 'Early dismissal 1:30 PM');
  assert.match(cal.events[0].description, /Changed from 2:10 PM/);
  assert.equal(cal.events[0].tags.fhStart, '13:30');
});

test('scan: an event someone edited by hand is left alone and not duplicated', () => {
  const d = daysFromNow(4);
  const first = load({
    props: READY,
    messages: { a: digest('a', 2, 'old') },
    gemini: [[{ date: d, kind: 'early-dismissal', startTime: '14:10', title: '', confidence: 0.9 }]],
  });
  first.ctx.run();
  first.cal.events[0].title = 'Early dismissal, Grandma picking up';   // the owner's edit

  // Same calendar, a later email with a different time.
  first.store.seenIds = JSON.stringify({ a: Date.now() });
  const later = digest('b', 1, 'new');
  first.ctx.Gmail.Users.Messages.get = (_me, id) => ({ a: digest('a', 2, 'old'), b: later })[id];
  first.ctx.Gmail.Users.Messages.list = (_me, opts) => ({ messages: [{ id: 'a' }, { id: 'b' }] });
  first.ctx.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 200,
    getContentText: () => geminiReply([{ date: d, kind: 'early-dismissal', startTime: '13:30', title: '', confidence: 0.9 }]),
  });
  first.ctx.run();
  assert.equal(first.cal.events.length, 1);
  assert.equal(first.cal.events[0].title, 'Early dismissal, Grandma picking up');
  assert.equal(first.cal.events[0].tags.fhStart, '14:10');
});

test('scan: a second run does not send seen mail to Gemini again', () => {
  const { ctx, prompts } = load({ props: READY, messages: { a: digest('a', 1, 'x') }, gemini: [[], []] });
  ctx.run();
  ctx.run();
  assert.equal(prompts.length, 1);
});

test('scan: a timed event and a multi-day break get the right shapes', () => {
  const d = daysFromNow(6), end = daysFromNow(8);
  const { ctx, cal } = load({
    props: READY,
    messages: { a: digest('a', 1, 'x') },
    gemini: [[
      { date: d, kind: 'event', title: 'Winter concert', startTime: '18:30', confidence: 0.8 },
      { date: d, endDate: end, kind: 'no-school', title: 'Thanksgiving break', confidence: 0.95 },
    ]],
  });
  ctx.run();
  const concert = cal.events.find(e => /concert/.test(e.title));
  const brk = cal.events.find(e => /break/.test(e.title));
  assert.equal(concert.allDay, false);
  assert.equal(concert.end - concert.start, 3600000);
  assert.equal(brk.allDay, true);
  assert.equal(brk.title, 'No school: Thanksgiving break');
  assert.equal(ymd(new Date(brk.end - 1)), end);   // all-day end is exclusive
});

test('scan: a later mention of one day of the break leaves the break whole', () => {
  const start = daysFromNow(6), mid = daysFromNow(7), end = daysFromNow(8);
  const { ctx, cal } = load({
    props: READY,
    messages: { a: digest('a', 2, 'x'), b: digest('b', 1, 'y') },
    gemini: [
      [{ date: start, endDate: end, kind: 'no-school', title: 'Thanksgiving break', confidence: 0.95 }],
      [{ date: mid, kind: 'no-school', title: 'No school', confidence: 0.9 }],
    ],
  });
  ctx.run();
  assert.equal(cal.events.length, 1);
  assert.equal(ymd(new Date(cal.events[0].end - 1)), end);
});

test('scan: when every message fails it throws and marks nothing seen', () => {
  const { ctx, store } = load({
    props: READY,
    messages: { a: digest('a', 1, 'x') },
    gemini: () => ({ code: 500, body: 'internal' }),
  });
  assert.throws(() => ctx.run(), /Every message failed.*Gemini HTTP 500/);
  assert.deepEqual(JSON.parse(store.seenIds), {});
  assert.match(store.lastError, /HTTP 500/);
});

test('scan: refuses to run without a key or a calendar', () => {
  assert.throws(() => load({ props: { CALENDAR_ID: 'cal-from-email' } }).ctx.run(), /GEMINI_KEY/);
  assert.throws(() => load({ props: { GEMINI_KEY: 'k' } }).ctx.run(), /Run setup/);
});

test('heartbeat: ten empty digests in a row raise the alarm', () => {
  const { ctx } = load({ props: { ...READY, zeroStreak: '9' }, messages: { a: digest('a', 1, 'x') }, gemini: [[]] });
  assert.throws(() => ctx.run(), /10 digests in a row/);
});

test('heartbeat: a week with no ParentSquare mail alarms, except in July and August', () => {
  const { ctx } = load({ quietMail: false });
  const r = { msgs: 0, handled: 0, errors: [], zeroStreak: 0 };
  assert.match(ctx.heartbeatAlarms_({ ...r, now: new Date(2026, 10, 21) }).join(' '), /No ParentSquare mail/);
  assert.equal(ctx.heartbeatAlarms_({ ...r, now: new Date(2026, 6, 15) }).length, 0);
  const ok = load({ quietMail: true });
  assert.equal(ok.ctx.heartbeatAlarms_({ ...r, now: new Date(2026, 10, 21) }).length, 0);
});

test('scan: a quota 429 names the quota that ran out', () => {
  const body = JSON.stringify({ error: { code: 429, message: 'You exceeded your current quota, ' + 'x'.repeat(300),
    details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } });
  const { ctx, store } = load({ props: READY, messages: { a: digest('a', 1, 'x') }, gemini: () => ({ code: 429, body }) });
  assert.throws(() => ctx.run(), /Every message failed/);
  assert.match(store.lastError, /HTTP 429 \(GenerateRequestsPerDayPerProjectPerModel-FreeTier\)/);
});

test('scan: an event you delete is not added back by a later email', () => {
  const d = daysFromNow(9);
  const conf = { date: d, kind: 'conference', title: '', confidence: 0.9 };
  const messages = { a: digest('a', 3, 'first') };
  const { ctx, cal } = load({ props: READY, messages, gemini: [[conf], [conf]] });
  ctx.run();
  assert.equal(cal.events.length, 1);
  cal.events[0].deleteEvent();            // the owner deletes it in the Hub
  messages.b = digest('b', 1, 'reminder');
  ctx.run();
  assert.equal(cal.events.length, 0);
});

test('scan: events already on the calendar before the list existed are remembered', () => {
  const d = daysFromNow(9);
  const half = { date: d, kind: 'half-day', title: '', confidence: 0.9 };
  const messages = { a: digest('a', 3, 'first') };
  const { ctx, cal, store } = load({ props: READY, messages, gemini: [[half], [], [half]] });
  ctx.run();
  delete store.madeEvents;                // as if made by the version before this list
  messages.b = digest('b', 2, 'nothing new');
  ctx.run();
  cal.events[0].deleteEvent();
  messages.c = digest('c', 1, 'reminder');
  ctx.run();
  assert.equal(cal.events.length, 0);
});

test('scan: ADD_KINDS leaves out the kinds you turned off', () => {
  const d = daysFromNow(9);
  const { ctx, cal, store } = load({
    props: { ...READY, ADD_KINDS: 'no-school, early-dismissal' },
    messages: { a: digest('a', 1, 'x') },
    gemini: [[
      { date: d, kind: 'no-school', title: '', confidence: 0.9 },
      { date: d, kind: 'event', title: 'Book fair', confidence: 0.9 },
    ]],
  });
  ctx.run();
  assert.deepEqual(cal.events.map(e => e.tags.fhKind), ['no-school']);
  assert.match(store.lastResult, /kind off 1/);
});

test('resetSeen() clears seen messages, the empty-digest streak and remembered events', () => {
  const { ctx, store } = load({ props: { seenIds: '{"a":1}', zeroStreak: '4', madeEvents: '[]' } });
  ctx.resetSeen();
  assert.equal(store.seenIds, undefined);
  assert.equal(store.zeroStreak, undefined);
  assert.equal(store.madeEvents, undefined);
});

// ── deliveries.gs ──

const READY_D = { ...READY, DELIVERY_CALENDAR_ID: 'cal-deliveries' };
const UPS = '1Z999AA10123456784';
const shipMail = (id, daysAgo, text) => gmailMessage({ id, subject: 'Update on your order', sentMs: Date.now() - daysAgo * 86400000, text });
const ship = o => ({ isShipment: true, merchant: 'Zappos', status: 'shipped', arrivalDate: null, items: null,
  orderNumber: null, trackingNumber: null, carrier: null, ...o });

test('sanitizeDelivery_: no shipment, no event; numbers only if the email prints them', () => {
  const { ctx } = load();
  assert.equal(ctx.sanitizeDelivery_({ isShipment: false }, ''), null);
  assert.equal(ctx.sanitizeDelivery_(ship({ status: 'teleported' }), ''), null);
  const d = ctx.sanitizeDelivery_(ship({ orderNumber: '#11-2233', trackingNumber: '1Z 999 AA1 0123456784' }),
    'Order 11-2233 shipped. UPS tracking 1Z999AA10123456784');
  assert.equal(d.orderNumber, '11-2233');
  assert.equal(d.trackingNumber, UPS);
  const guessed = ctx.sanitizeDelivery_(ship({ trackingNumber: '1Z000000000000000000' }), 'Your order shipped');
  assert.equal(guessed.trackingNumber, null);
});

test('trackingUrl_: links a number only when it has the carrier\'s shape', () => {
  const { ctx } = load();
  assert.match(ctx.trackingUrl_(null, UPS), /ups\.com\/track\?tracknum=1Z999/);
  assert.equal(ctx.trackingUrl_(null, '123456789012'), null);           // 12 digits could be anything
  assert.match(ctx.trackingUrl_('fedex', '123456789012'), /fedex\.com/);
  assert.equal(ctx.trackingUrl_('ups', '123456789012'), null);
});

test('decideDelivery_: an email with no shared number joins the one open package from that store', () => {
  const { ctx } = load();
  const today = daysFromNow(0);
  const open = { keys: ['o:zappos:1'], merchant: 'zappos', status: 'shipped', date: daysFromNow(3), storedSig: 's', currentSig: 's' };
  const other = { ...open, keys: ['o:zappos:2'] };
  const ofd = ctx.sanitizeDelivery_(ship({ status: 'out-for-delivery', arrivalDate: daysFromNow(3) }), '');
  assert.equal(ctx.decideDelivery_(ofd, [open], [], today).action, 'update');
  assert.equal(ctx.decideDelivery_(ofd, [open, other], [], today).action, 'create');   // which one? neither
  const newOrder = ctx.sanitizeDelivery_(ship({ orderNumber: '333', arrivalDate: daysFromNow(5) }), 'order 333');
  assert.equal(ctx.decideDelivery_(newOrder, [open], [], today).action, 'create');      // its own order number
});

test('scan: shipped, out for delivery and delivered land on one event', () => {
  const shipping = { a: shipMail('a', 3, 'Order 11-2233 shipped. UPS tracking ' + UPS) };
  const { ctx, dcal } = load({
    props: READY_D, shipping, quietMail: true,
    gemini: [
      ship({ orderNumber: '11-2233', trackingNumber: UPS, carrier: 'ups', arrivalDate: daysFromNow(2), items: 'running shoes' }),
      ship({ merchant: 'UPS', status: 'out-for-delivery', trackingNumber: UPS, carrier: 'ups', arrivalDate: daysFromNow(2) }),
      ship({ status: 'delivered', orderNumber: '11-2233', arrivalDate: daysFromNow(2) }),
    ],
  });
  ctx.run();
  assert.equal(dcal.events.length, 1);
  assert.equal(dcal.events[0].title, '📦 Zappos arriving (running shoes)');
  assert.match(dcal.events[0].description, /Tracking: https:\/\/www\.ups\.com\/track\?tracknum=1Z999AA10123456784/);
  assert.equal(ymd(dcal.events[0].start), daysFromNow(2));

  shipping.b = shipMail('b', 2, 'UPS: out for delivery today ' + UPS);
  ctx.run();
  shipping.c = shipMail('c', 1, 'Your order 11-2233 was delivered');
  ctx.run();
  assert.equal(dcal.events.length, 1);
  assert.equal(dcal.events[0].title, '📦 Zappos delivered ✓ (running shoes)');   // the carrier's email kept the store's name
  assert.equal((dcal.events[0].description.match(/^Source: /gm) || []).length, 3);
});

test('scan: a delivery you delete is not added back by the next email about it', () => {
  const shipping = { a: shipMail('a', 2, 'Order 7788 shipped') };
  const { ctx, dcal } = load({
    props: READY_D, shipping, quietMail: true,
    gemini: [ship({ orderNumber: '7788', arrivalDate: daysFromNow(4) }), ship({ orderNumber: '7788', status: 'delayed', arrivalDate: daysFromNow(6) })],
  });
  ctx.run();
  dcal.events[0].deleteEvent();
  shipping.b = shipMail('b', 1, 'Order 7788 is delayed');
  ctx.run();
  assert.equal(dcal.events.length, 0);
});

test('scan: an ad about delivery adds nothing and is not read again', () => {
  const { ctx, dcal, store } = load({
    quietMail: true, props: READY_D, shipping: { a: shipMail('a', 1, 'Free delivery on everything this weekend!') },
    gemini: [{ isShipment: false }],
  });
  ctx.run();
  assert.equal(dcal.events.length, 0);
  assert.ok(JSON.parse(store.seenIds).a);
  assert.match(store.lastResult, /delivery not one 1/);
});

test('scan: deliveries are skipped without "delivery" in ADD_KINDS, and look back 7 days even in backfill', () => {
  const off = load({ props: { ...READY_D, ADD_KINDS: 'no-school' }, quietMail: true });
  off.ctx.run();
  assert.ok(!off.queries.some(q => /out for delivery/.test(q)));
  const on = load({ props: READY_D, quietMail: true });
  on.ctx.backfill();
  assert.ok(on.queries.some(q => /out for delivery.*newer_than:7d$/.test(q)));
  assert.ok(on.queries.some(q => /parentsquare.*newer_than:60d$/.test(q)));
});

test('setup(): makes the Deliveries calendar and adds "delivery" to a list saved before it existed, once', () => {
  const { ctx, store } = load({ props: { ADD_KINDS: 'no-school, half-day' } });
  ctx.setup();
  assert.equal(store.DELIVERY_CALENDAR_ID, 'cal-deliveries');
  assert.equal(store.ADD_KINDS, 'no-school, half-day, delivery');
  store.ADD_KINDS = 'no-school';            // turned off afterwards: setup leaves it off
  ctx.setup();
  assert.equal(store.ADD_KINDS, 'no-school');
});

// ── The model pin ──

// The Hub and its proxy must agree (the proxy rejects any other model). The
// email scan may differ: it runs on its own key, and in 2026-11 its new key
// could no longer use gemini-2.5-flash while the Hub's older key still could,
// and the Hub can't move to a 3.x model until its reply caps allow for thinking
// (FEATURES.md §23, Model pin).
test('the Hub and the proxy pin the same Gemini model; the email scan pins one too', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const pin = (src, name) => (src.match(new RegExp('const ' + name + "\\s*=\\s*'([^']+)'")) || [])[1];
  const hub = pin(read('family-hub.js'), 'GEMINI_MODEL');
  assert.ok(hub, 'GEMINI_MODEL not found in family-hub.js');
  assert.equal(pin(read('netlify/functions/ai.js'), 'DEFAULT_MODEL'), hub);
  assert.match(pin(read('tools/email-scan/Code.gs'), 'GEMINI_MODEL') || '', /^gemini-/);
});
