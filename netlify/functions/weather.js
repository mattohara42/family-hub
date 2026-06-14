/**
 * Netlify Function: weather proxy
 * Keeps the OWM API key server-side (OWM_KEY env var).
 * Client calls: /.netlify/functions/weather?endpoint=<name>&<owm-params>
 * Supported endpoints: weather | forecast | air_pollution | reverse
 */

const OWM_URLS = {
  weather:       'https://api.openweathermap.org/data/2.5/weather',
  forecast:      'https://api.openweathermap.org/data/2.5/forecast',
  air_pollution: 'https://api.openweathermap.org/data/2.5/air_pollution',
  reverse:       'https://api.openweathermap.org/geo/1.0/reverse',
};

exports.handler = async (event) => {
  // CORS pre-flight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  const key = process.env.OWM_KEY;
  if (!key) {
    return json(500, { error: 'OWM_KEY environment variable is not set' });
  }

  const qs     = event.queryStringParameters || {};
  const { endpoint, ...rest } = qs;

  if (!OWM_URLS[endpoint]) {
    return json(400, { error: `Unknown endpoint "${endpoint}". Valid: ${Object.keys(OWM_URLS).join(', ')}` });
  }

  const params = new URLSearchParams({ ...rest, appid: key });
  const url    = `${OWM_URLS[endpoint]}?${params}`;

  try {
    const r    = await fetch(url);
    const body = await r.text();
    return { statusCode: r.status, headers: { ...cors(), 'Content-Type': 'application/json' }, body };
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
