/**
 * Unit tests for the Town of Pittsford scrape (netlify/functions/events.js).
 *
 * Run with:  npm test
 *
 * The fixture below is a trimmed copy of the real drupal-settings-json blob on
 * https://www.townofpittsfordny.gov/calendar — same shape, one event of each
 * kind the filter has to tell apart. No network.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { stripHtml, parsePittsfordEvents } = require('../netlify/functions/events.js')._test;

// Far enough out that these never fall behind "today" and get filtered as past.
const YEAR = new Date().getFullYear() + 1;

const EVENTS = [
  // A real community event, correctly tagged Special Event (green).
  { title: 'Food Truck and Music Festival', id: '0-0', eid: '101',
    url: '/event/food-truck-and-music-festival', des: '<p>Live music &amp; food trucks.</p>',
    start: `${YEAR}-09-19T12:00:00`, end: `${YEAR}-09-19T17:00:00`, backgroundColor: '#5f7d3b' },
  // A real event MIStagged as Board Meeting (blue) — the reason board meetings
  // must be filtered by title, not by taxonomy colour.
  { title: '9/11 Remembrance Ceremony', id: '1-0', eid: '102',
    url: '/event/911-remembrance', des: '', start: `${YEAR}-09-11T20:00:00`, backgroundColor: '#015883' },
  // Actual municipal noise: a board meeting, a holiday, a library closure.
  { title: 'Planning Board', id: '2-0', eid: '103', url: '/event/planning-board',
    des: '', start: `${YEAR}-09-14T18:30:00`, backgroundColor: '#015883' },
  { title: 'Martin Luther King Jr. Day', id: '3-0', eid: '104', url: '/event/mlk',
    des: '', start: `${YEAR}-01-19T08:00:00`, backgroundColor: '#ac394b' },
  { title: 'Library Staff Training - LIBRARY CLOSED', id: '4-0', eid: '105', url: '/event/training',
    des: '', start: `${YEAR}-10-15T09:00:00`, backgroundColor: '#987b2a' },
  // Past — dropped regardless of tagging.
  { title: 'Summer Concert Series', id: '5-0', eid: '106', url: '/event/concert',
    des: '', start: '2020-06-05T18:30:00', backgroundColor: '#5f7d3b' }
];

const fixture = `<html><head>
<script type="application/json" data-drupal-selector="drupal-settings-json">${
  JSON.stringify({ fullCalendarView: [{ calendar_options: JSON.stringify({ events: EVENTS }) }] })
}</script></head><body></body></html>`;

test('parsePittsfordEvents keeps community events and drops municipal noise', () => {
  const out = parsePittsfordEvents(fixture, 'Pittsford', 'NY');
  const titles = out.map(e => e.title);

  assert.deepEqual(titles, ['9/11 Remembrance Ceremony', 'Food Truck and Music Festival'],
    'expected only the two upcoming community events, soonest first');

  // The mistagged festival must survive: a colour-only board filter would eat it.
  assert.ok(titles.includes('9/11 Remembrance Ceremony'));
});

test('parsePittsfordEvents normalizes a kept event into the shared card shape', () => {
  const fest = parsePittsfordEvents(fixture, 'Pittsford', 'NY')
    .find(e => e.title === 'Food Truck and Music Festival');

  assert.equal(fest.source, 'towns');            // shares the tab with Fairport
  assert.equal(fest.location.address, 'Town of Pittsford');  // what tells them apart
  assert.equal(fest.date, `${YEAR}-09-19`);
  assert.equal(fest.time, '12:00');
  assert.equal(fest.duration, 300);              // 12:00 → 17:00
  assert.equal(fest.type, 'concert');  // first keyword wins: 'Music' before 'Food Truck'
  assert.equal(fest.sourceUrl, 'https://www.townofpittsfordny.gov/event/food-truck-and-music-festival');
  assert.equal(fest.description, 'Live music & food trucks.');
});

test('parsePittsfordEvents throws when the page stops embedding drupalSettings', () => {
  assert.throws(() => parsePittsfordEvents('<html><body>redesigned</body></html>', 'Pittsford', 'NY'),
    /drupalSettings JSON not found/);
});

test('stripHtml unwraps tags and the entities Drupal double-encodes', () => {
  assert.equal(stripHtml('<h3>Fun &amp; Games</h3>\n<p>&#039;tis&nbsp;here</p>'), "Fun & Games 'tis here");
  assert.equal(stripHtml(undefined), '');
});
