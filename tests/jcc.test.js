/**
 * Unit tests for the JCC month-view scrape and the CollectorFest iCal feed
 * (netlify/functions/events.js).
 *
 * Run with:  npm test
 *
 * The fixtures are trimmed copies of the real responses (2026-11-21): the
 * Modern Events Calendar `mec_monthly_view_load_month` AJAX reply from
 * jccrochester.org, and collectorfestmonthly.com's All-in-One Event Calendar
 * export. No network.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJccMonth, selectJccEvents, parseCollectorFest } = require('../netlify/functions/events.js')._test;

const TODAY = '2026-11-21';

const article = ({ id, slug, title, time, place = '' }) => `<article class="mec-event-article "><div class="mec-event-image"></div><div class="mec-monthly-contents" style="width: 100%">${
  time ? `<div class="mec-event-time mec-color"><i class="mec-sl-clock-o"></i> ${time}</div>` : ''
}<h4 class="mec-event-title"><a class="mec-color-hover" data-event-id="${id}" href="https://jccrochester.org/events/${slug}/" target="_self" rel="noopener">${title}</a><span class="event-color" style="background: #2e5ba2"></span></h4><div class="mec-event-detail">
                        <div class="mec-event-loc-place">${place}</div>
                    </div></div><div style="clear:both"></div></article>`;

const day = (cell, ...articles) =>
  `<div class="mec-calendar-events-sec" id="mec-calendar-events-sec-330-${cell}" data-mec-cell="${cell}" ><h6 class="mec-table-side-title">Events for November</h6><h3 class="mec-color mec-table-side-day"> 30th</h3>${articles.join('')}</div>`;

const toddler = { id: '501', slug: 'toddler-time', title: 'Toddler Time Tuesdays: Craft + GYM', time: '9:30 AM - 11:00 AM' };
const family = {
  events_side:
    day('20261117', article(toddler)) +  // past: dropped
    day('20261124', article(toddler)) +
    day('20261201', article(toddler)) +
    day('20261130', article({ id: '502', slug: 'cut-from-away', title: 'Cut From Away &#8212; Stories and Songs', time: '7:00 PM - 9:00 PM', place: 'JCC Hart Theater' })) +
    day('20261205', article({ id: '503', slug: 'connection-lab', title: 'UPDATE &#8211; Family Connection Lab', time: '1:00 PM - 2:30 PM' })) +
    day('20261206', article({ id: '504', slug: 'open-gym', title: 'Open Gym (No Pickleball)', time: '12:00 PM - 2:00 PM' }))
};
// Jewish Life: one holiday event, plus a weekly Hebrew course that has to go.
// The course also appears twice on the same date, as it would where two
// months' grids overlap, and that must not count as two dates.
const hebrew = { id: '601', slug: 'hebrew-beginner', title: 'Hebrew: Beginner', time: '6:00 PM - 7:00 PM' };
const jewishLife = {
  events_side:
    day('20261206', article({ id: '602', slug: 'together-in-light', title: 'Together in Light', time: '3:00 PM - 5:00 PM' })) +
    day('20261124', article(hebrew)) + day('20261201', article(hebrew)) + day('20261201', article(hebrew))
};

test('parseJccMonth reads date, time, duration, place and decodes the URL', () => {
  const occ = parseJccMonth(family);
  assert.equal(occ.length, 6);
  const show = occ.find(o => o.id === '502');
  assert.deepEqual(
    { date: show.date, time: show.time, duration: show.duration, place: show.place, url: show.url },
    { date: '2026-11-30', time: '19:00', duration: 120, place: 'JCC Hart Theater', url: 'https://jccrochester.org/events/cut-from-away/' }
  );
  assert.equal(show.title, 'Cut From Away — Stories and Songs', 'numeric entities decoded');
  assert.equal(occ.find(o => o.id === '503').title, 'Family Connection Lab', '"UPDATE –" prefix dropped');
});

test('parseJccMonth throws when the payload shape changes', () => {
  assert.throws(() => parseJccMonth({ month: '<div></div>' }), /events_side/);
});

test('selectJccEvents keeps family programs once, drops gym and Jewish Life courses', () => {
  const out = selectJccEvents(parseJccMonth(family), parseJccMonth(jewishLife), 'Rochester', 'NY', TODAY);
  assert.deepEqual(out.map(e => e.title), [
    'Toddler Time Tuesdays: Craft + GYM',      // a kid program: "GYM" in the title isn't a gym rental
    'Cut From Away — Stories and Songs',
    'Family Connection Lab',
    'Together in Light'                         // a one-off Jewish Life event survives
  ]);
  const tt = out[0];
  assert.equal(tt.date, '2026-11-24', 'collapsed to the next upcoming session, not the past one');
  assert.match(tt.description, /2 dates coming up/);
  assert.ok(out.every(e => e.source === 'jcc' && e.location.lat && e.location.lon));
  assert.equal(out[1].description, 'Louis S. Wolk JCC · JCC Hart Theater.');
});

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:ai1ec-10001@collectorfestmonthly.com',
  'DTSTART;TZID=America/New_York:20231217T100000',
  'DTEND;TZID=America/New_York:20231217T140000',
  'SUMMARY:December 17\\, 2023',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:ai1ec-10442@collectorfestmonthly.com',
  'DESCRIPTION:FREE admission.\\nA GIFT @ noon.\\nThanks for buying/selling/trad',
  ' ing only with dealers who are set up.',
  'DTSTART;TZID=America/New_York:20261213T100000',
  'DTEND;TZID=America/New_York:20261213T140000',
  'LOCATION:Louis S. Wolk JCC of Greater Rochester @ 1200 Edgewood Ave\\, Roche',
  ' ster\\, NY 14618',
  'SUMMARY:December 13\\, 2026',
  'URL:https://collectorfestmonthly.com/event/october-18-2026-2-2/',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

test('parseCollectorFest names the show and keeps only upcoming dates', () => {
  const out = parseCollectorFest(ICS, 'Rochester', 'NY', TODAY);
  assert.equal(out.length, 1);
  const [e] = out;
  assert.equal(e.title, 'CollectorFest Monthly card show');
  assert.equal(e.source, 'jcc');
  assert.equal(e.date, '2026-12-13');
  assert.equal(e.time, '10:00');
  assert.equal(e.duration, 240);
  assert.equal(e.id, 'cf_ai1ec-10442');
  assert.match(e.description, /FREE admission\. A GIFT @ noon\. Thanks for buying\/selling\/trading/);
});
