/**
 * Unit tests for pure helpers in netlify/functions/events.js.
 *
 * Run with:  npm test   (uses Node's built-in test runner — no deps)
 *
 * Only pure, deterministic helpers are tested here (no network). They are
 * exposed via the `_test` export on the function module.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeEventType,
  calculateDistance,
  icalUnescape,
  icalToLocal,
  parseICal,
  dateToEastern
} = require('../netlify/functions/events.js')._test;

test('normalizeEventType maps Ticketmaster segments to canonical types', () => {
  assert.equal(normalizeEventType('Music'), 'concert');
  assert.equal(normalizeEventType('Sports'), 'sports');
  assert.equal(normalizeEventType('Theater'), 'show');
  assert.equal(normalizeEventType('Comedy'), 'comedy');
  // TM's segment is "Arts & Theatre" (British spelling) — matcher handles
  // both "theater" and "theatre", so it maps to 'show'.
  assert.equal(normalizeEventType('Arts & Theatre'), 'show');
  assert.equal(normalizeEventType(undefined), 'activity'); // missing → safe default
  assert.equal(normalizeEventType('Something Unknown'), 'activity');
});

test('calculateDistance returns 0 for the same point and a sane Haversine value', () => {
  assert.equal(calculateDistance(43.16, -77.61, 43.16, -77.61), 0);
  // Rochester, NY → Toronto, ON is ~96 miles
  const d = calculateDistance(43.16, -77.61, 43.68, -79.41);
  assert.ok(d > 90 && d < 105, `expected ~96mi, got ${d}`);
});

test('icalUnescape unescapes iCal text', () => {
  assert.equal(icalUnescape('Stories\\, songs\\; fun'), 'Stories, songs; fun');
  assert.equal(icalUnescape('Line1\\nLine2'), 'Line1 Line2');
  assert.equal(icalUnescape(''), '');
});

test('icalToLocal converts UTC DTSTART to Eastern and handles all-day', () => {
  // All-day (date only) → no time
  assert.deepEqual(icalToLocal('20260520'), { date: '2026-05-20', time: null });
  // 18:00 UTC in May (EDT, UTC-4) → 14:00 Eastern
  assert.deepEqual(icalToLocal('20260520T180000Z'), { date: '2026-05-20', time: '14:00' });
  // Local time (no Z) is taken as-is
  assert.deepEqual(icalToLocal('20260520T140000'), { date: '2026-05-20', time: '14:00' });
});

test('parseICal extracts VEVENT fields and unfolds wrapped lines', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Pajama Storytime',
    'DTSTART;TZID=America/New_York:20260520T180000',
    'DESCRIPTION:Drop-in storytime featuring stories\\, songs\\, and ',
    ' fingerplays for all ages',
    'URL:https://calendar.libraryweb.org/event/123',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const events = parseICal(ics);
  assert.equal(events.length, 1);
  assert.equal(events[0].SUMMARY, 'Pajama Storytime');
  assert.equal(events[0].DTSTART, '20260520T180000');           // params stripped from key
  assert.match(events[0].DESCRIPTION, /stories.*fingerplays for all ages/); // line unfolded
  assert.equal(events[0].URL, 'https://calendar.libraryweb.org/event/123');
});

test('dateToEastern converts a UTC Date to Eastern date/time', () => {
  // 2026-07-20T01:00Z is 9:00 PM EDT on 2026-07-19
  assert.deepEqual(dateToEastern(new Date('2026-07-20T01:00:00Z')), {
    date: '2026-07-19',
    time: '21:00'
  });
});
