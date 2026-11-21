/**
 * Tests for the email scan Apps Script (tools/email-scan/Code.gs).
 *
 * Run with:  npm test   (Node's built-in test runner, no deps)
 *
 * Code.gs only defines functions and constants at load time, so it runs in a
 * Node vm with small fakes for the Apps Script services it touches. Real
 * Gmail, Calendar and Gemini calls are exercised by the rollout in
 * docs/plans/2026-11-21-001-feat-email-scan-plan.md, not here.
 *
 * What they protect: the scan only ever reads the mail it means to, never
 * sends ParentSquare's per-user sign-in links to Gemini, and hands messages
 * over oldest first so a newer email's correction wins.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '../tools/email-scan/Code.gs'), 'utf8');

const b64url = s => Buffer.from(s, 'utf8').toString('base64url');

/** A fresh script context. `messages` maps id to a Gmail API message. */
function load({ props = {}, messages = {}, listPages } = {}) {
  const store = { ...props };
  const queries = [];
  const ctx = {
    console: { log() {}, warn() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in store ? store[k] : null),
      setProperty: (k, v) => { store[k] = String(v); },
      getProperties: () => ({ ...store }),
    }) },
    Utilities: {
      base64DecodeWebSafe: s => Buffer.from(s, 'base64url'),
      newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    },
    Gmail: { Users: { Messages: {
      list: (_me, opts) => {
        queries.push(opts.q);
        if (listPages) return listPages(opts.pageToken);
        return { messages: Object.keys(messages).map(id => ({ id })) };
      },
      get: (_me, id) => messages[id],
    } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, store, queries };
}

function gmailMessage({ id, subject, sentMs, text, html }) {
  const parts = [];
  if (text) parts.push({ mimeType: 'text/plain', body: { data: b64url(text) } });
  if (html) parts.push({ mimeType: 'text/html', body: { data: b64url(html) } });
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

test('collectMessages_ with skipSeen false (backfill) rereads seen mail', () => {
  const messages = { s: gmailMessage({ id: 's', subject: 'Digest', sentMs: 1, text: 'x' }) };
  const { ctx } = load({ messages, props: { seenIds: JSON.stringify({ s: Date.now() }) } });
  assert.equal(ctx.collectMessages_(60, { skipSeen: false }).length, 1);
});

test('listMessageIds_ follows page tokens', () => {
  const pages = { undefined: { messages: [{ id: '1' }], nextPageToken: 'p2' }, p2: { messages: [{ id: '2' }] } };
  const { ctx } = load({ listPages: tok => pages[tok] });
  assert.deepEqual(Array.from(ctx.listMessageIds_('q')), ['1', '2']);
});

test('run() before U3 marks nothing as seen', () => {
  const messages = { n: gmailMessage({ id: 'n', subject: 'Digest', sentMs: 1, text: 'x' }) };
  const { ctx, store } = load({ messages });
  ctx.run();
  assert.equal(store.seenIds, undefined);
  assert.ok(store.lastRun);
});
