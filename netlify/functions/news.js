/**
 * Netlify Function: RSS/Atom feed proxy
 * Server-side fetch avoids browser CORS (feeds like BBC/AP send no
 * Access-Control-Allow-Origin) and removes the dependency on flaky public
 * CORS proxies (corsproxy.io now 403s unauthenticated requests).
 *
 * Client calls: /.netlify/functions/news?url=<encoded feed url>
 * Returns the raw feed body (XML) with CORS headers.
 */

exports.handler = async (event) => {
  // CORS pre-flight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  const target = (event.queryStringParameters || {}).url;
  if (!target) {
    return json(400, { error: 'Missing "url" query parameter' });
  }

  let u;
  try {
    u = new URL(target);
  } catch {
    return json(400, { error: 'Invalid url' });
  }

  // SSRF guard: only public https/http feeds, never internal hosts.
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return json(400, { error: 'Only http(s) URLs are allowed' });
  }
  if (isBlockedHost(u.hostname)) {
    return json(403, { error: 'Host not allowed' });
  }

  try {
    const r = await fetch(u.toString(), {
      headers: { 'User-Agent': 'FamilyHub/1.0 (+netlify)', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      redirect: 'follow',
    });
    const body = await r.text();
    return {
      statusCode: r.status,
      headers: { ...cors(), 'Content-Type': 'application/xml; charset=utf-8' },
      body,
    };
  } catch (e) {
    return json(502, { error: e.message });
  }
};

/** Block localhost, link-local, and private/internal ranges (SSRF mitigation). */
function isBlockedHost(host) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  // IPv6 loopback / unspecified
  if (h === '::1' || h === '::') return true;
  // IPv4 private + loopback + link-local + cloud metadata (169.254.169.254)
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;        // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function json(status, obj) {
  return { statusCode: status, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}
