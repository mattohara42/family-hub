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
 *   1. Paste Code.gs (and later dedupe.gs). Turn on "Show appsscript.json" in
 *      Project Settings and paste appsscript.json over it.
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
const GEMINI_MODEL = 'gemini-2.5-flash';

// Daily run times in the script's time zone (appsscript.json). Apps Script
// fires within about 15 minutes of nearMinute.
const RUN_HOURS  = [6, 16];
const RUN_MINUTE = 45;

const BASE_QUERY            = '(from:parentsquare.com OR label:Hub)';
const DEFAULT_SKIP_SUBJECTS = 'Attendance Notification|Library (Tomorrow|Monday)';

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

  const cal = ensureCalendar_();
  p.setProperty('CALENDAR_ID', cal.getId());
  if (!p.getProperty('SKIP_SUBJECTS')) p.setProperty('SKIP_SUBJECTS', DEFAULT_SKIP_SUBJECTS);

  installTriggers_();

  const probe = Gmail.Users.Messages.list('me', { q: BASE_QUERY + ' newer_than:7d', maxResults: 5 });
  const recent = (probe.messages || []).length;

  console.log('Calendar: "%s"', cal.getName());
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

/** The scheduled entry point. Intake, extraction and dedupe arrive in U2 to U4. */
function run() {
  props_().setProperty('lastRun', new Date().toISOString());
  console.log('run(): not implemented yet (U2).');
}

/** One-time pass over the last 60 days, used during rollout. Arrives with U2. */
function backfill() {
  console.log('backfill(): not implemented yet (U2).');
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
  ['SKIP_SUBJECTS', 'EXTRA_QUERY', 'lastRun', 'lastNew', 'lastError'].forEach(k => {
    console.log('%s %s', (k + ':').padEnd(14), p[k] || '(none)');
  });
}

// ── Helpers ──

/** Finds the scan's calendar by stored ID, then by name, else creates it. */
function ensureCalendar_() {
  const id = props_().getProperty('CALENDAR_ID');
  const byId = id && CalendarApp.getCalendarById(id);
  if (byId) return byId;

  const byName = CalendarApp.getOwnedCalendarsByName(CALENDAR_NAME)[0];
  if (byName) return byName;

  return CalendarApp.createCalendar(CALENDAR_NAME, {
    summary:  'School dates found in email by the Family Hub email scan. Fix or delete anything wrong; deleting this calendar removes everything the scan added.',
    timeZone: Session.getScriptTimeZone(),
  });
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
