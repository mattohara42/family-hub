/**
 * Netlify Function: Gemini AI proxy
 * Keeps the Gemini API key server-side (GEMINI_KEY env var).
 * Client calls: POST /.netlify/functions/ai
 * Body: { model?, contents, systemInstruction?, generationConfig? }
 *   or, for speech: { tts: true, model, input, response_format, generation_config }
 *
 * Only the hub's own pages may use it: the request's Origin must be this site
 * (production, a deploy preview, or `netlify dev`), and only DEFAULT_MODEL is
 * allowed. Origin can be forged outside a browser, so this stops casual reuse
 * of the URL, not a determined caller.
 */

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
// Keep in step with GEMINI_MODEL in family-hub.js; a mismatch is rejected loudly.
const DEFAULT_MODEL = 'gemini-2.5-flash';
// Text-to-speech goes through the newer Interactions API. Only these models,
// for the Assistant voice timing test (`{ tts: true, model, ...interaction }`).
const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, 'Method not allowed');
  }
  if (!isSameOrigin(event)) {
    return json(403, 'The AI proxy only answers requests from Family Hub itself');
  }

  const key = process.env.GEMINI_KEY;
  if (!key) {
    return json(500, 'GEMINI_KEY environment variable is not set');
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, 'Invalid JSON body');
  }

  if (payload.tts) {
    const { tts, ...interaction } = payload;
    if (!TTS_MODELS.includes(interaction.model)) {
      return json(400, `Speech model "${interaction.model}" isn't allowed by the AI proxy; see TTS_MODELS in netlify/functions/ai.js`);
    }
    try {
      const r = await fetch(INTERACTIONS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body:    JSON.stringify(interaction),
      });
      return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body: await r.text() };
    } catch (e) {
      return json(502, e.message);
    }
  }

  const { model = DEFAULT_MODEL, ...body } = payload;
  if (model !== DEFAULT_MODEL) {
    return json(400, `Model "${model}" isn't allowed by the AI proxy; update DEFAULT_MODEL in netlify/functions/ai.js`);
  }
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${key}`;

  try {
    const r    = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const text = await r.text();
    return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body: text };
  } catch (e) {
    return json(502, e.message);
  }
};

// Browsers send Origin on every POST, same-origin included. Comparing it to the
// Host the request arrived on covers production, deploy previews and custom
// domains without listing them.
function isSameOrigin(event) {
  const h = event.headers || {};
  try {
    return !!h.origin && !!h.host && new URL(h.origin).host === h.host;
  } catch {
    return false;
  }
}

// Same { error: { message } } shape Gemini uses, so the client shows the reason.
function json(status, message) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { message } }) };
}
