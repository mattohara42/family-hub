/**
 * Netlify Function: ICS feed proxy
 * Fetches a public .ics calendar feed server-side so private "secret address"
 * URLs stay within your own infrastructure instead of passing through a
 * third-party public CORS proxy. No API key needed.
 * Client calls: GET /.netlify/functions/ics?url=<url-encoded ICS link>
 */

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== 'GET') return text(405, 'Method not allowed');

  const target = event.queryStringParameters && event.queryStringParameters.url;
  if (!target) return text(400, 'Missing url parameter');

  let u;
  try { u = new URL(target); } catch { return text(400, 'Invalid url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return text(400, 'Only http/https URLs are allowed');
  }
  if (isPrivateHost(u.hostname)) {
    return text(400, 'Refusing to fetch a private/loopback host');
  }

  try {
    const r = await fetch(u.toString(), {
      headers: { 'User-Agent': 'FamilyHub-ICS/1.0', 'Accept': 'text/calendar, text/plain, */*' },
      redirect: 'follow',
    });
    const body = await r.text();
    return {
      statusCode: r.ok ? 200 : r.status,
      headers: { ...cors(), 'Content-Type': 'text/calendar; charset=utf-8' },
      body,
    };
  } catch (e) {
    return text(502, 'Fetch failed: ' + e.message);
  }
};

// Block SSRF to loopback / private ranges (best-effort; hostname only).
function isPrivateHost(h) {
  h = (h || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' || h === '::1') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function text(status, body) {
  return { statusCode: status, headers: { ...cors(), 'Content-Type': 'text/plain' }, body };
}
