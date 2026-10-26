/**
 * Tests for the Gemini proxy's guards in netlify/functions/ai.js.
 *
 * Run with:  npm test   (Node's built-in test runner — no deps)
 *
 * No network: global fetch is stubbed. What they protect: the function holds
 * the family's Gemini key, so it must refuse requests from other sites and
 * models other than the one the hub uses, and pass Gemini's reply through.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/ai.js');

const SITE = 'familial.netlify.app';
const post = (headers, body = { contents: [] }) =>
  handler({ httpMethod: 'POST', headers, body: JSON.stringify(body) });
const message = res => JSON.parse(res.body).error?.message;

let fetched;
test.beforeEach(() => {
  process.env.GEMINI_KEY = 'k';
  fetched = [];
  global.fetch = async (url, opts) => {
    fetched.push({ url, body: JSON.parse(opts.body) });
    return { status: 200, text: async () => '{"candidates":[]}' };
  };
});

test('same-origin request is proxied to Gemini without the model field', async () => {
  const res = await post({ origin: `https://${SITE}`, host: SITE }, { model: 'gemini-2.5-flash', contents: [1] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '{"candidates":[]}');
  assert.equal(fetched.length, 1);
  assert.match(fetched[0].url, /gemini-2\.5-flash:generateContent\?key=k$/);
  assert.deepEqual(fetched[0].body, { contents: [1] });
});

test('deploy previews and netlify dev count as same-origin', async () => {
  const preview = 'deploy-preview-71--familial.netlify.app';
  assert.equal((await post({ origin: `https://${preview}`, host: preview })).statusCode, 200);
  assert.equal((await post({ origin: 'http://localhost:8888', host: 'localhost:8888' })).statusCode, 200);
});

test('other origins, and requests with no Origin, are refused before Gemini is called', async () => {
  for (const headers of [{ origin: 'https://evil.example', host: SITE }, { host: SITE }, { origin: 'not a url', host: SITE }]) {
    const res = await post(headers);
    assert.equal(res.statusCode, 403);
    assert.match(message(res), /only answers requests from Family Hub/);
  }
  assert.equal(fetched.length, 0);
});

test('a model other than the default is refused with a fix-it message', async () => {
  const res = await post({ origin: `https://${SITE}`, host: SITE }, { model: 'gemini-2.5-pro', contents: [] });
  assert.equal(res.statusCode, 400);
  assert.match(message(res), /DEFAULT_MODEL/);
  assert.equal(fetched.length, 0);
});

test('errors use Gemini\'s { error: { message } } shape', async () => {
  delete process.env.GEMINI_KEY;
  const res = await post({ origin: `https://${SITE}`, host: SITE });
  assert.equal(res.statusCode, 500);
  assert.equal(message(res), 'GEMINI_KEY environment variable is not set');
  assert.equal((await handler({ httpMethod: 'GET', headers: {} })).statusCode, 405);
});
