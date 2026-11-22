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
const SRC = ['dedupe.gs', 'Code.gs'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');

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
function fakeCalendar() {
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
    getId: () => 'cal-from-email',
    getName: () => 'From Email',
    createAllDayEvent: (t, s, e, o) => make(t, s, e, true, o),
    createEvent: (t, s, e, o) => make(t, s, e, false, o),
    getEventsForDay: d => {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      return events.filter(ev => ev.start < end && ev.end > start);
    },
  };
}

/** A Gemini generateContent response body carrying these items. */
const geminiReply = items => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] } }] });

/**
 * A fresh script context. `messages` maps id to a Gmail API message.
 * `gemini` is a function (prompt) => { code, body } or a list of item arrays,
 * one per call.
 */
function load({ props = {}, messages = {}, listPages, gemini = [], quietMail } = {}) {
  const store = { ...props };
  const queries = [];
  const prompts = [];
  const cal = fakeCalendar();
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
    CalendarApp: { getCalendarById: id => (id === 'cal-from-email' ? cal : null) },
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
        if (listPages) return listPages(opts.pageToken);
        return { messages: Object.keys(messages).map(id => ({ id })) };
      },
      get: (_me, id) => messages[id],
    } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, store, queries, prompts, cal };
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

test('resetSeen() clears seen messages and the empty-digest streak', () => {
  const { ctx, store } = load({ props: { seenIds: '{"a":1}', zeroStreak: '4' } });
  ctx.resetSeen();
  assert.equal(store.seenIds, undefined);
  assert.equal(store.zeroStreak, undefined);
});

// ── The model pin ──

test('the Gemini model is the same in the Hub, the proxy and the email scan', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const pin = (src, name) => (src.match(new RegExp('const ' + name + "\\s*=\\s*'([^']+)'")) || [])[1];
  const hub = pin(read('family-hub.js'), 'GEMINI_MODEL');
  assert.ok(hub, 'GEMINI_MODEL not found in family-hub.js');
  assert.equal(pin(read('netlify/functions/ai.js'), 'DEFAULT_MODEL'), hub);
  assert.equal(pin(read('tools/email-scan/Code.gs'), 'GEMINI_MODEL'), hub);
});
