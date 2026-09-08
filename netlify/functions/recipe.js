/**
 * Netlify Function: schema.org/Recipe importer
 *
 * Fetches a recipe page server-side (browsers can't fetch cross-origin recipe
 * sites) and returns the page's `schema.org/Recipe` JSON-LD normalized into the
 * shape the hub's Recipe Box stores.
 *
 * Client calls: GET /.netlify/functions/recipe?url=<url-encoded recipe link>
 *   200 → { ok: true, recipe: {...} }
 *   422 → { ok: false, error: 'no-recipe' }   (page fetched, no Recipe JSON-LD)
 *   4xx/5xx → { ok: false, error: '...' }
 *
 * Generic by design: works for any site that emits Recipe JSON-LD (NYT Cooking,
 * AllRecipes, Serious Eats, food blogs). NYT Cooking is the motivating case —
 * it serves the full JSON-LD (title, ingredients, instructions) unauthenticated
 * even when `isAccessibleForFree` is false, because the paywall gates the
 * human-facing render rather than the structured metadata. That is undocumented
 * page behavior, not a contract: when it stops being true this returns
 * `no-recipe` and the client falls back to manual entry.
 */

const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES        = 5 * 1024 * 1024;   // recipe pages are ~1MB; refuse absurd ones
const MAX_INGREDIENTS  = 200;
const MAX_STEPS        = 200;

// Pretty names for sources we expect to see often; anything else falls back to
// the bare hostname.
const SOURCE_NAMES = {
  'cooking.nytimes.com': 'NYT Cooking',
  'www.allrecipes.com':  'AllRecipes',
  'allrecipes.com':      'AllRecipes',
  'www.seriouseats.com': 'Serious Eats',
  'seriouseats.com':     'Serious Eats',
  'www.epicurious.com':  'Epicurious',
  'epicurious.com':      'Epicurious',
  'www.bonappetit.com':  'Bon Appétit',
  'bonappetit.com':      'Bon Appétit',
  'www.simplyrecipes.com': 'Simply Recipes',
  'simplyrecipes.com':   'Simply Recipes',
  'www.foodnetwork.com': 'Food Network',
  'www.food.com':        'Food.com',
  'www.delish.com':      'Delish',
  'www.kingarthurbaking.com': 'King Arthur Baking',
  'www.budgetbytes.com': 'Budget Bytes',
  'smittenkitchen.com':  'Smitten Kitchen',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== 'GET')     return json(405, { ok: false, error: 'Method not allowed' });

  const target = (event.queryStringParameters || {}).url;
  if (!target) return json(400, { ok: false, error: 'Missing url parameter' });

  let u;
  try { u = new URL(target); } catch { return json(400, { ok: false, error: 'Invalid url' }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return json(400, { ok: false, error: 'Only http/https URLs are allowed' });
  }
  if (isPrivateHost(u.hostname)) {
    return json(403, { ok: false, error: 'Refusing to fetch a private/loopback host' });
  }

  let html, finalUrl = u.toString();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    let r;
    try {
      r = await fetch(u.toString(), {
        headers: {
          // Recipe sites commonly 403 a bot-looking UA; ask as a browser would.
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: ctl.signal,
      });
    } finally { clearTimeout(timer); }

    if (r.url) finalUrl = r.url;
    if (!r.ok) return json(r.status === 404 ? 404 : 502, { ok: false, error: `Source returned HTTP ${r.status}` });

    const ctype = (r.headers.get('content-type') || '').toLowerCase();
    if (ctype && !/html|xml|text\/plain/.test(ctype)) {
      return json(415, { ok: false, error: `That link is ${ctype.split(';')[0]}, not a web page` });
    }

    const len = Number(r.headers.get('content-length') || 0);
    if (len && len > MAX_BYTES) return json(413, { ok: false, error: 'Page too large' });

    html = await r.text();
    if (html.length > MAX_BYTES) html = html.slice(0, MAX_BYTES);
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Source timed out' : 'Fetch failed: ' + e.message;
    return json(502, { ok: false, error: msg });
  }

  const raw = findRecipeNode(html);
  if (!raw) return json(422, { ok: false, error: 'no-recipe' });

  const recipe = normalizeRecipe(raw, finalUrl);
  if (!recipe.name && !recipe.ingredients.length) {
    return json(422, { ok: false, error: 'no-recipe' });
  }

  return json(200, { ok: true, recipe });
};

// ── JSON-LD extraction ─────────────────────────────────────────

/** Pull the contents of every <script type="application/ld+json"> block. */
function extractLdJsonBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/**
 * Yield every object reachable inside a JSON-LD value, descending through
 * arrays and the container properties sites actually use (`@graph` on
 * WordPress/Yoast, `mainEntity` on NYT and others).
 */
function walkNodes(value, seen, depth) {
  seen = seen || new Set();
  depth = depth || 0;
  const out = [];
  if (depth > 12 || value == null) return out;

  if (Array.isArray(value)) {
    for (const v of value) out.push(...walkNodes(v, seen, depth + 1));
    return out;
  }
  if (typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);

  out.push(value);
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    if (key in value) out.push(...walkNodes(value[key], seen, depth + 1));
  }
  return out;
}

/** True when a JSON-LD node's `@type` includes Recipe (type may be a string or array). */
function isRecipeNode(node) {
  if (!node || typeof node !== 'object') return false;
  const t = node['@type'];
  const list = Array.isArray(t) ? t : [t];
  return list.some(x => typeof x === 'string' && x.trim().toLowerCase() === 'recipe');
}

/** Scan all JSON-LD in a page and return the first Recipe node, or null. */
function findRecipeNode(html) {
  for (const block of extractLdJsonBlocks(html)) {
    let parsed;
    try {
      parsed = JSON.parse(block.trim());
    } catch {
      continue;   // a malformed block on the page shouldn't kill the import
    }
    for (const node of walkNodes(parsed)) {
      if (isRecipeNode(node)) return node;
    }
  }
  return null;
}

// ── Field normalization ────────────────────────────────────────

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', frac12: '½', frac14: '¼', frac34: '¾',
  deg: '°', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç',
};

/** Strip tags, decode entities, collapse whitespace. JSON-LD text often carries both. */
function cleanText(s) {
  if (s == null) return '';
  let out = String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ');
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)));
  out = out.replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)));
  out = out.replace(/&([a-z][a-z0-9]*);/gi, (full, name) => {
    const k = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : full;
  });
  return out.replace(/\s+/g, ' ').trim();
}

function safeCodePoint(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
  try { return String.fromCodePoint(n); } catch { return ''; }
}

/** Normalize a string | string[] | object-with-.name/.text field to a clean string. */
function firstString(v, depth) {
  depth = depth || 0;
  if (v == null || depth > 5) return '';
  if (typeof v === 'string' || typeof v === 'number') return cleanText(v);
  if (Array.isArray(v)) {
    for (const x of v) { const s = firstString(x, depth + 1); if (s) return s; }
    return '';
  }
  if (typeof v === 'object') return firstString(v.name || v.text || v['@value'], depth + 1);
  return '';
}

/** Ingredients: `recipeIngredient` (or legacy `ingredients`), as a clean string[]. */
function normalizeIngredients(node) {
  const src = node.recipeIngredient != null ? node.recipeIngredient : node.ingredients;
  const list = Array.isArray(src) ? src : (src == null ? [] : [src]);
  const out = [];
  for (const item of list) {
    const s = firstString(item);
    if (s) out.push(s);
    if (out.length >= MAX_INGREDIENTS) break;
  }
  return out;
}

/**
 * Instructions → flat string[] of steps. Handles every shape in the wild:
 * a single string (possibly HTML or newline-separated), an array of strings, an
 * array of HowToStep objects, and HowToSection groups holding `itemListElement`.
 */
function normalizeInstructions(v, depth) {
  depth = depth || 0;
  if (v == null || depth > 5) return [];

  if (typeof v === 'string') {
    // One blob: prefer explicit breaks, else split paragraphs/newlines.
    const withBreaks = v.replace(/<\/(?:p|li|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
    return withBreaks.split(/\n+/).map(cleanText).filter(Boolean);
  }
  if (Array.isArray(v)) {
    const out = [];
    for (const item of v) out.push(...normalizeInstructions(item, depth + 1));
    return out;
  }
  if (typeof v === 'object') {
    // A section groups steps; a step carries its own text.
    if (v.itemListElement) {
      const name = cleanText(v.name);
      const steps = normalizeInstructions(v.itemListElement, depth + 1);
      return name && steps.length ? [name + ':', ...steps] : steps;
    }
    const s = cleanText(v.text || v.name || v['@value'] || '');
    return s ? [s] : [];
  }
  return [];
}

/** Image: string | string[] | ImageObject | ImageObject[] → one absolute https-ish URL. */
function normalizeImage(v, depth) {
  depth = depth || 0;
  if (v == null || depth > 5) return '';
  if (typeof v === 'string') {
    const s = v.trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }
  if (Array.isArray(v)) {
    for (const x of v) { const s = normalizeImage(x, depth + 1); if (s) return s; }
    return '';
  }
  if (typeof v === 'object') return normalizeImage(v.url || v.contentUrl || v['@id'], depth + 1);
  return '';
}

/** ISO-8601 duration ("PT1H30M", "P1DT2H") → whole minutes, or 0 when unparseable. */
function isoDurationToMinutes(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
    .exec(String(v).trim());
  if (!m) return 0;
  const [, d, h, min, s] = m;
  const total = (Number(d || 0) * 1440) + (Number(h || 0) * 60) + Number(min || 0) + (Number(s || 0) / 60);
  return total > 0 ? Math.round(total) : 0;
}

/** Yield: "4 servings" | 4 | ["4","4 servings"] → the most descriptive string. */
function normalizeYield(v) {
  if (v == null) return '';
  if (Array.isArray(v)) {
    // Sites emit ["4", "4 servings"]; prefer the one with words.
    const strings = v.map(x => firstString(x)).filter(Boolean);
    const worded = strings.find(s => /[a-z]/i.test(s));
    return worded || strings[0] || '';
  }
  return firstString(v);
}

/** Human-readable source label: publisher name, known host, else bare hostname. */
function sourceNameFor(node, pageUrl) {
  const pub = firstString(node.publisher) || firstString(node.sourceOrganization);
  if (pub) return pub;
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    if (SOURCE_NAMES[host]) return SOURCE_NAMES[host];
    return host.replace(/^www\./, '');
  } catch { return ''; }
}

/** Recipe JSON-LD node → the flat record the Recipe Box stores. */
function normalizeRecipe(node, pageUrl) {
  const instructions = normalizeInstructions(node.recipeInstructions).slice(0, MAX_STEPS);
  const totalTime = isoDurationToMinutes(node.totalTime)
    || (isoDurationToMinutes(node.prepTime) + isoDurationToMinutes(node.cookTime));

  return {
    name:         firstString(node.name) || firstString(node.headline),
    ingredients:  normalizeIngredients(node),
    instructions,
    description:  firstString(node.description),
    image:        normalizeImage(node.image),
    servings:     normalizeYield(node.recipeYield),
    totalTime,                                   // minutes; 0 when unknown
    author:       firstString(node.author),
    cuisine:      firstString(node.recipeCuisine),
    sourceUrl:    pageUrl,
    sourceName:   sourceNameFor(node, pageUrl),
    // Surfaced so the client can note the recipe came from behind a paywall.
    paywalled:    node.isAccessibleForFree === false || node.isAccessibleForFree === 'False',
  };
}

// ── Shared plumbing (mirrors ics.js / news.js) ─────────────────

/** Block SSRF to loopback / private ranges (best-effort; hostname only). */
function isPrivateHost(h) {
  h = (h || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '::' || h === '[::1]') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;          // link-local + cloud metadata
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

// Pure helpers, exposed for tests/recipe.test.js (no network).
exports._test = {
  extractLdJsonBlocks,
  walkNodes,
  isRecipeNode,
  findRecipeNode,
  cleanText,
  firstString,
  normalizeIngredients,
  normalizeInstructions,
  normalizeImage,
  isoDurationToMinutes,
  normalizeYield,
  sourceNameFor,
  normalizeRecipe,
  isPrivateHost,
};
