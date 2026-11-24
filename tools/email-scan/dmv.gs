/**
 * Family Hub email scan: NY DMV notices.
 *
 * NY DMV's registration and inspection reminders become one dated to-do each
 * on the Hub's shared To-Do list, assigned to TODO_ASSIGNEE. The 1st, 2nd,
 * 3rd and "expired" reminders for the same plate and deadline land on that
 * one to-do. A "Registration Renewal Processed" receipt checks the matching
 * registration to-do off. Inspections have no receipt, so those get checked
 * off by hand. Like the calendar side, a to-do you delete stays deleted.
 *
 * DMV mail is a fixed template (two of them: notifications@ before 2026,
 * eservices@ since), so it's read with patterns, not Gemini. A DMV email that
 * fits neither is counted as "unrecognized" in lastDmv, which is the sign the
 * template changed.
 *
 * To-dos are Firestore documents, written through the Firestore REST API with
 * the script owner's own Google sign-in. That sign-in is checked against the
 * Firebase project's IAM roles, not firestore.rules, so the owner must be an
 * owner or editor of the project. Off until FIREBASE_PROJECT_ID is set.
 *
 * The pure half (parsing, deciding) runs in Node for the tests.
 */

const DMV_QUERY       = 'from:dmv.ny.gov';
const DMV_MADE_DAYS   = 400;   // how long a to-do's key is remembered past its due date
const DMV_TODO_BY     = 'Email scan';
const FIRESTORE_URL   = 'https://firestore.googleapis.com/v1/';

/** "10/5/2026" or "10/05/2026" to "2026-10-05", else null. */
function dmvDate_(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const pad = n => String(n).padStart(2, '0');
  return m[3] + '-' + pad(m[1]) + '-' + pad(m[2]);
}

function dmvField_(body, name) {
  const m = new RegExp('^\\s*' + name + ':[ \\t]*(\\S[^\\n]*?)\\s*$', 'mi').exec(body);
  return m ? m[1] : null;
}

/**
 * What one DMV email says, or null when it isn't a notice this handles:
 *   { kind: 'registration' | 'inspection', plate, due, make, year }
 *   { kind: 'renewed', plate }   (a registration renewal receipt)
 * A notice whose plate or date can't be read is { kind: 'unrecognized' }.
 */
function parseDmv_(subject, body) {
  const text = String(body || '');
  const plate = (dmvField_(text, 'Plate') || '').split(/\s/)[0].toUpperCase() || null;

  if (/REGISTRATION RENEWAL PROCESSED/i.test(text)) {
    return plate ? { kind: 'renewed', plate } : { kind: 'unrecognized' };
  }

  let kind = null;
  let due = null;
  if (/registration shown below is (now )?(available for renewal|expired)/i.test(text)) {
    kind = 'registration';
    due = dmvDate_(dmvField_(text, 'Expires'));
  } else if (/annual New York State inspection/i.test(text)) {
    kind = 'inspection';
    const m = /inspection is due by (\d{1,2}\/\d{1,2}\/\d{4})/i.exec(text)
      || /inspection[^.]*?expired on (\d{1,2}\/\d{1,2}\/\d{4})/i.exec(text);
    due = m && dmvDate_(m[1]);
  } else {
    // Receipts for other transactions, plate replacements and so on.
    return /reminder|notification|expire/i.test(subject) ? { kind: 'unrecognized' } : null;
  }
  if (!plate || !due) return { kind: 'unrecognized' };
  return { kind, plate, due, make: dmvField_(text, 'Make'), year: dmvField_(text, 'Year') };
}

/** The to-do's Firestore document ID, which is also its dedupe key. */
function dmvKey_(n) {
  return 'dmv-' + n.kind + '-' + n.plate + '-' + n.due;
}

function dmvTitle_(n) {
  const car = [n.year, n.make].filter(Boolean).join(' ');
  const what = car ? car + ' (' + n.plate + ')' : n.plate;
  return (n.kind === 'registration' ? 'Renew registration: ' : 'Get inspected: ') + what;
}

/**
 * Turns parsed notices (oldest first) into Firestore writes.
 * made: [[key, due]] of to-dos created before, deleted or not.
 * Returns { creates: [notice], dones: [key], counts }.
 *
 * A reminder followed by a renewal receipt for the same plate in the same
 * batch is skipped rather than created and then checked off; that's what a
 * backfill over a renewal looks like.
 */
function decideDmv_(notices, made) {
  const known = {};
  made.forEach(e => { known[e[0]] = e; });
  const creates = [];
  const dones = [];
  const counts = {};
  const bump = k => { counts[k] = (counts[k] || 0) + 1; };

  notices.forEach((n, i) => {
    if (n.kind === 'unrecognized') return bump('unrecognized');
    if (n.kind === 'renewed') {
      // Only to-dos from earlier runs: a reminder in this batch before the receipt was never created.
      const open = Object.keys(known).filter(k => k.indexOf('dmv-registration-' + n.plate + '-') === 0);
      open.forEach(k => { if (dones.indexOf(k) < 0) dones.push(k); });
      return bump(open.length ? 'checked off' : 'renewed');
    }
    const key = dmvKey_(n);
    if (known[key]) return bump('repeat');
    const renewedLater = n.kind === 'registration'
      && notices.slice(i + 1).some(r => r.kind === 'renewed' && r.plate === n.plate);
    if (renewedLater) return bump('already renewed');
    known[key] = [key, n.due];
    creates.push(n);
    bump('new');
  });
  return { creates, dones, counts };
}

/** The made list plus new keys, minus keys whose due date is long past. */
function mergeDmvMade_(made, keys, today) {
  const out = {};
  made.filter(e => daysBetween_(e[1], today) <= DMV_MADE_DAYS).forEach(e => { out[e[0]] = e; });
  keys.forEach(e => { out[e[0]] = e; });
  return Object.keys(out).map(k => out[k]);
}

// ── Apps Script side ──

/**
 * One pass over recent DMV mail. Returns a summary line, or null when DMV
 * to-dos are off. Throws only for a failure the owner should hear about.
 */
function scanDmv_(days, now) {
  const p = props_();
  const project = (p.getProperty('FIREBASE_PROJECT_ID') || '').trim();
  if (!project) return null;
  const assignee = (p.getProperty('TODO_ASSIGNEE') || '').trim();
  const today = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const msgs = collectMessages_(days, { skipSeen: true, query: DMV_QUERY });
  const notices = [];
  msgs.forEach(m => {
    const n = parseDmv_(m.subject, m.body);
    if (n) notices.push(n);
    if (n && n.kind === 'unrecognized') console.warn('DMV email not understood: %s', m.subject);
  });
  let made = loadDmvMade_();
  const plan = decideDmv_(notices, made);

  const errors = [];
  plan.creates.forEach(n => {
    const res = firestoreCommit_(project, [dmvCreateWrite_(project, n, assignee)]);
    // ALREADY_EXISTS: made before this list existed, or by an earlier run that died. Either way it's there.
    if (res.ok || preconditionFailed_(res)) made = mergeDmvMade_(made, [[dmvKey_(n), n.due]], today);
    else errors.push(dmvTitle_(n) + ': ' + res.message);
  });
  plan.dones.forEach(key => {
    const res = firestoreCommit_(project, [dmvDoneWrite_(project, key)]);
    // NOT_FOUND: you deleted it, which is fine.
    if (!res.ok && !preconditionFailed_(res)) errors.push(key + ': ' + res.message);
  });
  saveDmvMade_(made);

  if (!errors.length) {
    const seen = loadSeen_();
    msgs.forEach(m => { seen[m.id] = Date.now(); });
    saveSeen_(seen);
  }
  const summary = msgs.length + ' DMV message(s). '
    + (Object.keys(plan.counts).map(k => k + ' ' + plan.counts[k]).join(', ') || 'nothing to do')
    + (errors.length ? '. Failed: ' + errors.join('; ') : '');
  p.setProperty('lastDmv', summary);
  console.log(summary);
  if (errors.length) throw new Error('DMV to-dos: ' + errors[0]);
  return summary;
}

/**
 * A create that found the document already there, or a check-off that found it
 * gone. Firestore names these ALREADY_EXISTS and NOT_FOUND; FAILED_PRECONDITION
 * is accepted too until probeFirestore() has confirmed which it sends.
 */
function preconditionFailed_(res) {
  return ['ALREADY_EXISTS', 'NOT_FOUND', 'FAILED_PRECONDITION'].indexOf(res.status) >= 0;
}

function firestoreDoc_(project, key) {
  return 'projects/' + project + '/databases/(default)/documents/todo/' + key;
}

/** A create that fails if the document exists, stamped with createdAt (the Hub orders the list by it). */
function dmvCreateWrite_(project, n, assignee) {
  const fields = {
    text:    { stringValue: dmvTitle_(n) },
    done:    { booleanValue: false },
    by:      { stringValue: DMV_TODO_BY },
    dueDate: { stringValue: n.due },
    source:  { stringValue: 'email-scan' },
  };
  if (assignee) fields.assignedTo = { stringValue: assignee };
  return {
    update: { name: firestoreDoc_(project, dmvKey_(n)), fields },
    currentDocument: { exists: false },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  };
}

/** Sets done on an existing document only; never brings a deleted one back. */
function dmvDoneWrite_(project, key) {
  return {
    update: { name: firestoreDoc_(project, key), fields: { done: { booleanValue: true } } },
    updateMask: { fieldPaths: ['done'] },
    currentDocument: { exists: true },
  };
}

/**
 * Firestore REST commit as the script's owner. x-goog-user-project bills the
 * call to the Firebase project, so the Apps Script's own hidden Cloud project
 * doesn't need the Firestore API turned on.
 * Returns { ok, status, message }; status is Firestore's code, e.g. ALREADY_EXISTS.
 */
function firestoreCommit_(project, writes) {
  const res = UrlFetchApp.fetch(FIRESTORE_URL + 'projects/' + project + '/databases/(default)/documents:commit', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': project },
    payload: JSON.stringify({ writes }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 200) return { ok: true, status: 'OK', message: '' };
  let err = {};
  try { err = JSON.parse(res.getContentText()).error || {}; } catch (e) { /* not JSON */ }
  return { ok: false, status: err.status || String(code), message: 'Firestore ' + code + ' ' + (err.message || res.getContentText().slice(0, 200)) };
}

/**
 * Run once from the editor after setting FIREBASE_PROJECT_ID, before trusting
 * the scan with real to-dos. Creates a document in a scratch collection,
 * tries to create it again, checks it off, and deletes it, logging each step.
 * Nothing touches the To-Do list.
 */
function probeFirestore() {
  const project = (props_().getProperty('FIREBASE_PROJECT_ID') || '').trim();
  if (!project) throw new Error('Set FIREBASE_PROJECT_ID in Script Properties first.');
  const name = 'projects/' + project + '/databases/(default)/documents/emailScanProbe/probe-' + Date.now();
  const create = { update: { name, fields: { done: { booleanValue: false } } }, currentDocument: { exists: false } };
  const step = (label, res, want) => console.log('%s: %s (%s)', label, res.ok ? 'OK' : res.status, res.ok === want ? 'as expected' : 'NOT expected: ' + res.message);
  step('Create', firestoreCommit_(project, [create]), true);
  step('Create again', firestoreCommit_(project, [create]), false);
  step('Check off', firestoreCommit_(project, [{ update: { name, fields: { done: { booleanValue: true } } },
    updateMask: { fieldPaths: ['done'] }, currentDocument: { exists: true } }]), true);
  step('Delete', firestoreCommit_(project, [{ delete: name }]), true);
}

function loadDmvMade_() {
  try {
    return JSON.parse(props_().getProperty('madeDmv') || '[]');
  } catch (e) {
    return [];
  }
}

function saveDmvMade_(made) {
  props_().setProperty('madeDmv', JSON.stringify(made));
}
