/**
 * Smallest runnable check for the Town of Pittsford source: `node events.pittsford.test.js`
 * Fails if their page stops embedding drupalSettings, or if the taxonomy colours
 * / titles change enough that the noise filter stops separating board meetings
 * and closures from real community events.
 */
const assert = require('assert');

const SKIP_COLORS = ['#ac394b', '#987b2a'];
const SKIP_TITLE = /board|meeting|closure|closed|cancell?ed|committee|public hearing|holiday|deadline/i;

(async () => {
  const r = await fetch('https://www.townofpittsfordny.gov/calendar', {
    headers: { 'User-Agent': 'FamilyHub/1.0 (event discovery)' }
  });
  assert.ok(r.ok, `calendar page fetch failed: HTTP ${r.status}`);

  const html = await r.text();
  const m = html.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'drupalSettings JSON block missing — page markup changed');

  const view = JSON.parse(m[1]).fullCalendarView?.[0];
  const raw = JSON.parse(view?.calendar_options || '{}').events || [];
  assert.ok(raw.length > 100, `expected the full event list, got ${raw.length}`);

  const noise = raw.filter(e => SKIP_COLORS.includes(e.backgroundColor) || SKIP_TITLE.test(e.title));
  const kept = raw.filter(e => !noise.includes(e));
  assert.ok(noise.length > raw.length * 0.5, `noise filter matched only ${noise.length}/${raw.length} — taxonomy changed?`);
  assert.ok(kept.length > 20, `only ${kept.length} real events survived — filter too aggressive?`);
  assert.ok(kept.every(e => e.start && e.title), 'kept events must have start + title');

  console.log(`ok: ${raw.length} on page → ${noise.length} filtered, ${kept.length} community events`);
})();
