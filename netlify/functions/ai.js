/**
 * Netlify Function: Gemini AI proxy
 * Keeps the Gemini API key server-side (GEMINI_KEY env var).
 * Client calls: POST /.netlify/functions/ai
 * Body: { model?, contents, systemInstruction?, generationConfig? }
 */

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_KEY;
  if (!key) {
    return json(500, { error: 'GEMINI_KEY environment variable is not set' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { model = DEFAULT_MODEL, ...body } = payload;
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${key}`;

  try {
    const r    = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const text = await r.text();
    return { statusCode: r.status, headers: { ...cors(), 'Content-Type': 'application/json' }, body: text };
  } catch (e) {
    return json(502, { error: e.message });
  }
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function json(status, obj) {
  return { statusCode: status, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}
