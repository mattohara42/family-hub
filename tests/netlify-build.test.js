/**
 * Tests for config.js generation in netlify-build.js.
 *
 * Run with:  npm test   (Node's built-in test runner, no deps)
 *
 * What they protect: a fork sets its own Google/Firebase identity through
 * Netlify env vars, pasting the snippet Firebase Console shows. A bad or half
 * config must fail the build rather than deploy a hub that signs in against
 * one project and reads another.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { buildConfigJs } = require('../netlify-build.js');

const CLIENT_ID = 'abc-123.apps.googleusercontent.com';
const SNIPPET = `const firebaseConfig = {
  apiKey: "AIzaTest",
  authDomain: "demo.firebaseapp.com",
  projectId: "demo",
  appId: "1:42:web:ff",
};`;

/** Runs generated config.js the way a browser would and returns FH_CONFIG. */
const load = src => { const window = {}; vm.runInNewContext(src, { window }); return window.FH_CONFIG; };

test('no env vars keeps the committed config.js', () => {
  assert.equal(buildConfigJs({}), null);
});

test('Firebase Console snippet is accepted as pasted', () => {
  const cfg = load(buildConfigJs({ GOOGLE_CLIENT_ID: CLIENT_ID, FIREBASE_CONFIG: SNIPPET }));
  assert.equal(cfg.googleClientId, CLIENT_ID);
  assert.equal(cfg.firebase.projectId, 'demo');
  assert.equal(cfg.firebase.appId, '1:42:web:ff');
});

test('strict JSON is accepted too', () => {
  const cfg = load(buildConfigJs({
    GOOGLE_CLIENT_ID: CLIENT_ID,
    FIREBASE_CONFIG: '{"apiKey":"AIzaTest","projectId":"demo"}',
  }));
  assert.equal(cfg.firebase.apiKey, 'AIzaTest');
});

test('only one of the two vars set fails the build', () => {
  assert.throws(() => buildConfigJs({ GOOGLE_CLIENT_ID: CLIENT_ID }), /both/);
  assert.throws(() => buildConfigJs({ FIREBASE_CONFIG: SNIPPET }), /both/);
});

test('unparseable or incomplete Firebase config fails the build', () => {
  assert.throws(() => buildConfigJs({ GOOGLE_CLIENT_ID: CLIENT_ID, FIREBASE_CONFIG: '{ apiKey: ' }), /not a valid object/);
  assert.throws(() => buildConfigJs({ GOOGLE_CLIENT_ID: CLIENT_ID, FIREBASE_CONFIG: '{ apiKey: "x" }' }), /projectId/);
});
