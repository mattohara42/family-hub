// Golden test for computeEventShift() — mirrors the copy in family-hub.js
// (no-build monolith has no harness). Run: node tests/event-shift.test.js
// ponytail: deliberate duplication so the date/time-move logic has a runnable check.

// Pinned before any Date exists: the function reads an event's local clock time,
// so every expectation below is zone-relative. Eastern matches the fixtures'
// -04:00 offsets and makes the UTC-'Z' (ICS feed) case predictable.
process.env.TZ = 'America/New_York';

function _fmtLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

// Local HH:MM for an event's ISO start. Never slice it out of the string:
// calEventCache holds UTC 'Z' (ICS), offset (Google) and floating-local forms,
// and only the last two read correctly by position.
function _localTime(iso) {
  return iso ? _fmtLocal(new Date(iso)).slice(11, 16) : '';
}

// ev: { allDay, date:'YYYY-MM-DD', startDT, endDT }  (startDT/endDT ISO for timed)
// Returns { start, end } in Google Calendar API shape, or null if nothing to change.
function computeEventShift(ev, newDate, newTime, tz) {
  tz = tz || 'America/Detroit';
  newDate = (newDate || '').trim();
  newTime = (newTime || '').trim();
  if (!newDate && !newTime) return null;

  if (ev.allDay) {
    const date = newDate || ev.date;               // time is meaningless for all-day
    const next = new Date(date + 'T00:00:00'); next.setDate(next.getDate() + 1);
    return { start: { date }, end: { date: _fmtLocal(next).slice(0, 10) } };
  }

  const date = newDate || ev.date;
  const timePart = newTime || _localTime(ev.startDT) || '09:00';
  const durMs = (ev.startDT && ev.endDT)
    ? Math.max(0, new Date(ev.endDT) - new Date(ev.startDT))
    : 3600000;
  const startLocal = `${date}T${timePart}:00`;
  const endD = new Date(new Date(startLocal).getTime() + durMs);
  return { start: { dateTime: startLocal, timeZone: tz }, end: { dateTime: _fmtLocal(endD), timeZone: tz } };
}

// ── Tests ──
const a = require('assert');
const timed = { allDay: false, date: '2026-07-11', startDT: '2026-07-11T16:00:00-04:00', endDT: '2026-07-11T18:00:00-04:00' }; // 2h duration

// change time only → same date, new start, duration preserved (2h)
{
  const r = computeEventShift(timed, '', '17:00');
  a.equal(r.start.dateTime, '2026-07-11T17:00:00', 'time-only start');
  a.equal(r.end.dateTime,   '2026-07-11T19:00:00', 'time-only end preserves 2h');
}
// change date only → keep clock time (16:00), preserve duration
{
  const r = computeEventShift(timed, '2026-07-13', '');
  a.equal(r.start.dateTime, '2026-07-13T16:00:00', 'date-only start keeps time');
  a.equal(r.end.dateTime,   '2026-07-13T18:00:00', 'date-only end');
}
// change both
{
  const r = computeEventShift(timed, '2026-07-12', '09:30');
  a.equal(r.start.dateTime, '2026-07-12T09:30:00');
  a.equal(r.end.dateTime,   '2026-07-12T11:30:00');
}
// time change crossing midnight preserves duration
{
  const late = { allDay: false, date: '2026-07-11', startDT: '2026-07-11T23:00:00-04:00', endDT: '2026-07-12T00:30:00-04:00' }; // 1.5h
  const r = computeEventShift(late, '', '23:30');
  a.equal(r.start.dateTime, '2026-07-11T23:30:00');
  a.equal(r.end.dateTime,   '2026-07-12T01:00:00', 'crosses midnight');
}
// all-day move → date + exclusive end (next day)
{
  const allday = { allDay: true, date: '2026-07-11' };
  const r = computeEventShift(allday, '2026-07-15', '');
  a.deepEqual(r.start, { date: '2026-07-15' });
  a.deepEqual(r.end,   { date: '2026-07-16' }, 'all-day end is exclusive next day');
}
// ICS feed shape: parseIcs normalizes TZID to a UTC 'Z' ISO, so an 8:15 PM ET
// game is stored as 00:15Z the next day. A date-only move must carry the LOCAL
// clock time (20:15), not the UTC one (00:15) — the bug that showed an 8:15 PM
// Bills game as 12:15 AM in the event editor.
{
  const ics = { allDay: false, date: '2026-09-21', startDT: '2026-09-22T00:15:00Z', endDT: '2026-09-22T03:15:00Z' }; // 3h
  const r = computeEventShift(ics, '2026-09-28', '');
  a.equal(r.start.dateTime, '2026-09-28T20:15:00', 'UTC-Z start keeps its local clock time');
  a.equal(r.end.dateTime,   '2026-09-28T23:15:00', 'UTC-Z end preserves 3h');
}
// nothing to change → null
a.equal(computeEventShift(timed, '', ''), null, 'no change → null');

console.log('event-shift tests passed');
