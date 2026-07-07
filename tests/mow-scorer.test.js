// Golden test for the Outdoor Task Advisor scorer.
// Run: node tests/mow-scorer.test.js
//
// The three-file no-build architecture has no test harness and family-hub.js
// can't be required in Node (it's a browser script), so this file carries its
// own copy of scoreMowWindows(). Keep it in sync with the version in
// family-hub.js — these asserts ARE the spec's worked examples.
// ponytail: deliberate duplication of one pure function so the algorithm has a
// runnable check; if the two drift, this test is the source of truth for intent.

const MOW_CONFIG = {
  preferredDay: 6, mowDuration: 60, rainThreshold: 40, dryOutHours: 8,
  tempIdeal: [60, 78], windComfort: 15, horizonDays: 7,
};
const _MOW_HR = 3600000, _MOW_DAY = 86400000, _MOW_MIN = 60000;

function scoreMowWindows(forecast, events, config, now) {
  const cfg = { ...MOW_CONFIG, ...(config || {}) };
  now = now || Date.now();
  const hours = (forecast.hours || []).slice().sort((a, b) => a.ts - b.ts);
  const days  = forecast.days || [];
  const durMs = cfg.mowDuration * _MOW_MIN;
  if (!hours.length || !days.length) return { windows: [], degraded: true, reason: 'no hourly forecast' };

  const maxPopOver = (a, b) => hours.filter(h => h.ts >= a - _MOW_HR && h.ts <= b).reduce((m, h) => Math.max(m, h.popPct), 0);
  const tempAt = ts => { let best = null; for (const h of hours) if (!best || Math.abs(h.ts - ts) < Math.abs(best.ts - ts)) best = h; return best ? best.tempF : 70; };
  const windAt = ts => { let best = null; for (const h of hours) if (!best || Math.abs(h.ts - ts) < Math.abs(best.ts - ts)) best = h; return best ? best.windMph : 0; };
  const hoursSinceRain = ts => {
    let last = null;
    for (const h of hours) if (h.ts < ts && h.popPct >= cfg.rainThreshold) last = h.ts;
    return last === null ? Infinity : (ts - last) / _MOW_HR;
  };
  const overlapsEvent = (a, b) => events.some(e => e.start < b && e.end > a);

  const windows = [];
  for (const day of days.slice(0, cfg.horizonDays)) {
    if (!day.sunrise || !day.sunset) continue;
    let t = Math.ceil(day.sunrise / _MOW_HR) * _MOW_HR;
    for (; t + durMs <= day.sunset; t += _MOW_HR) {
      if (t < now) continue;
      const start = t, end = t + durMs;
      if (maxPopOver(start, end) >= cfg.rainThreshold) continue;
      if (hoursSinceRain(start) < cfg.dryOutHours) continue;
      if (overlapsEvent(start, end)) continue;
      const reasons = [];
      let score = 50;
      const dow = new Date(start).getDay();
      const diff = Math.abs(dow - cfg.preferredDay);
      const preferredDist = Math.min(diff, 7 - diff);
      score += [30, 22, 14, 6][preferredDist] || 0;
      if (preferredDist === 0) reasons.push('preferred day');
      score -= Math.max(0, (start - now) / _MOW_DAY) * 0.2;
      const temp = tempAt(start);
      if (temp >= cfg.tempIdeal[0] && temp <= cfg.tempIdeal[1]) { score += 10; reasons.push(`${Math.round(temp)}°`); }
      else score -= Math.min(20, Math.round(Math.abs(temp - (cfg.tempIdeal[0] + cfg.tempIdeal[1]) / 2) / 2));
      const wind = windAt(start);
      if (wind > cfg.windComfort) { score -= Math.min(10, wind - cfg.windComfort); reasons.push('breezy'); }
      const hr = new Date(start).getHours();
      const timeOfDay = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
      if (timeOfDay === 'morning') { score += 3; reasons.push('morning'); }
      windows.push({ startTs: start, endTs: end, date: day.date, timeOfDay, score: Math.round(score), reasons });
    }
  }
  windows.sort((a, b) => b.score - a.score || a.startTs - b.startTs);
  return { windows, degraded: false };
}

// ── Tests: the spec's worked examples ──
const a = require('assert');
const DAY_MS = 86400000;
const startDay = new Date('2026-07-06T00:00:00').getTime();   // Monday
const MON = new Date('2026-07-06T06:00:00').getTime();        // "now" = Monday 6am

// Days: d0 Mon … d5 Sat … d6 Sun. Hourly 5:00–21:00, sunrise 6, sunset 20.
function buildForecast(n, popFn, temp = 72, wind = 5) {
  const hours = [], days = [];
  for (let d = 0; d < n; d++) {
    const o = new Date(startDay + d * DAY_MS);
    const y = o.getFullYear(), m = String(o.getMonth() + 1).padStart(2, '0'), dd = String(o.getDate()).padStart(2, '0');
    days.push({ date: `${y}-${m}-${dd}`, sunrise: new Date(`${y}-${m}-${dd}T06:00:00`).getTime(), sunset: new Date(`${y}-${m}-${dd}T20:00:00`).getTime() });
    for (let h = 5; h <= 21; h++) hours.push({ ts: new Date(`${y}-${m}-${dd}T${String(h).padStart(2, '0')}:00:00`).getTime(), tempF: temp, popPct: popFn(d, h), windMph: wind });
  }
  return { hours, days };
}
const dateOf = d => { const o = new Date(startDay + d * DAY_MS); return `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, '0')}-${String(o.getDate()).padStart(2, '0')}`; };

// T1: all dry → prefers Saturday
a.equal(new Date(scoreMowWindows(buildForecast(7, () => 0), [], {}, MON).windows[0].startTs).getDay(), 6, 'T1 all-dry → Saturday');

// T2: rain all weekend (Sat+Sun) → Friday
a.equal(new Date(scoreMowWindows(buildForecast(7, d => (d === 5 || d === 6) ? 90 : 0), [], {}, MON).windows[0].startTs).getDay(), 5, 'T2 rainy weekend → Friday');

// T3: rain Fri+Sat, Sunday afternoon booked → Sunday morning
{
  const f = buildForecast(7, d => (d === 4 || d === 5) ? 90 : 0);
  const events = [{ start: new Date(`${dateOf(6)}T13:00:00`).getTime(), end: new Date(`${dateOf(6)}T18:00:00`).getTime() }];
  const top = scoreMowWindows(f, events, {}, MON).windows[0];
  a.equal(new Date(top.startTs).getDay(), 0, 'T3 → Sunday');
  a.equal(top.timeOfDay, 'morning', 'T3 → Sunday morning');
}

// T4: wet-grass — overnight rain blocks early slots within dryOutHours
{
  const f = buildForecast(3, () => 0);
  f.hours.push({ ts: new Date(`${dateOf(1)}T03:00:00`).getTime(), tempF: 72, popPct: 90, windMph: 5 });  // 3am Tue rain
  const tue = scoreMowWindows(f, [], {}, MON).windows.filter(w => w.date === dateOf(1));
  a.ok(Math.min(...tue.map(w => new Date(w.startTs).getHours())) >= 11, 'T4 wet-grass blocks pre-11am Tue');
}

// T5: a short conflict still disqualifies the overlapping window
{
  const f = buildForecast(2, () => 0);
  const events = [{ start: new Date(`${dateOf(0)}T08:00:00`).getTime(), end: new Date(`${dateOf(0)}T08:30:00`).getTime() }];
  const eight = scoreMowWindows(f, events, {}, MON).windows.find(w => w.date === dateOf(0) && new Date(w.startTs).getHours() === 8);
  a.equal(eight, undefined, 'T5 short conflict disqualifies overlapping slot');
}

// T6: empty forecast degrades gracefully
{
  const r = scoreMowWindows({ hours: [], days: [] }, [], {}, MON);
  a.equal(r.degraded, true, 'T6 empty → degraded');
  a.deepEqual(r.windows, [], 'T6 empty → no windows');
}

console.log('all mow scorer tests passed');
