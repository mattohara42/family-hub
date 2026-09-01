// Golden test for fetchMealImage() — mirrors the copy in family-hub.js
// (no-build monolith has no harness). Run: node --test tests/meal-image.test.js
// ponytail: deliberate duplication so the photo-lookup passes have a runnable check.
//
// The two definitions below are spliced verbatim from family-hub.js. If you change them
// there, change them here — the pass order and the `stock` flag are what the meal detail
// popup keys on: only an exact match is persisted, anything representative gets labelled.

const test = require('node:test');
const a = require('assert');

let _mealImgCache = {};

const MEAL_MAIN_NOUN = /\b(chicken|beef|steak|meatloaf|meatball|pork|bacon|ham|sausage|lamb|turkey|duck|salmon|tuna|shrimp|prawn|cod|tilapia|scallop|crab|lobster|fish|lasagna|spaghetti|linguine|ravioli|gnocchi|pasta|noodle|risotto|paella|rice|pizza|burger|taco|burrito|enchilada|quesadilla|curry|chowder|stew|soup|chili|casserole|stir[-\s]?fry|salad|sandwich|wrap|omelette|omelet|frittata|pancake|waffle|tofu|chickpea|lentil|bean|potato|mushroom|eggplant|broccoli|cauliflower)(?:e?s)?\b/i;

async function fetchMealImage(name) {
  const key = (name || '').toLowerCase().trim();
  if (!key) return null;
  if (key in _mealImgCache) return _mealImgCache[key];

  // Helper: one TheMealDB lookup. Skips a query an earlier pass already spent.
  const tried = new Set();
  const dbLookup = async q => {
    const qk = (q || '').toLowerCase().trim();
    if (!qk || tried.has(qk)) return null;
    tried.add(qk);
    try {
      const r = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`);
      const d = await r.json();
      return d?.meals?.[0]?.strMealThumb || null;
    } catch { return null; }
  };

  // Pass 1: exact name
  let thumb = await dbLookup(name);

  // Pass 2: simplified name — strip leading adjectives / cooking methods iteratively and retry
  if (!thumb) {
    const STRIP_WORD = /^(creamy|spicy|crispy|crunchy|smoky|tangy|zesty|savory|sweet|sticky|juicy|tender|baked|grilled|roasted|pan[-\s]?fried|fried|braised|slow[-\s]?cooked|air[-\s]?fried|sautéed|steamed|poached|smoked|stuffed|glazed|marinated|easy|simple|classic|homemade|quick|healthy|hearty|loaded|one[-\s]?pan|one[-\s]?pot|sheet[-\s]?pan|garlic|herb|lemon|butter|[a-z]+-style)\s+/i;
    let simplified = name, prev;
    do { prev = simplified; simplified = simplified.replace(STRIP_WORD, ''); } while (simplified !== prev);
    simplified = simplified.trim();
    if (simplified && simplified.toLowerCase() !== key) {
      thumb = await dbLookup(simplified);
    }
  }

  // Pass 2b: main ingredient / dish noun. The adjective list above stops at the first
  // word it doesn't know, so cuisines and one-off modifiers ("Cajun", "Honey") used to
  // sink the whole retry. Search from the food noun to the end, then the noun alone:
  // "Creamy Tuscan Chicken Skillet" → "Chicken Skillet" → "Chicken". A noun match is a
  // photo of the right food but not of this dish, so it counts as representative.
  let representative = false;
  if (!thumb) {
    const m = name.match(MEAL_MAIN_NOUN);
    if (m) {
      thumb = await dbLookup(name.slice(m.index).trim());
      if (!thumb) thumb = await dbLookup(m[0]);
      representative = !!thumb;
    }
  }

  if (thumb) {
    const result = { url: thumb, stock: representative };
    _mealImgCache[key] = result;
    return result;
  }

  // Pass 3: LoremFlickr representative food photo — always returns an image
  const keywords = encodeURIComponent(name.replace(/\s+/g, ',').toLowerCase());
  const stockUrl = `https://loremflickr.com/600/400/${keywords},food/all`;
  const result = { url: stockUrl, stock: true };
  _mealImgCache[key] = result;
  return result;
}

// ── Harness ──────────────────────────────────────────────────
// Each case installs a fetch stub and records the queries TheMealDB was asked for.
let queries = [];
function stubDb(responder) {
  queries = [];
  _mealImgCache = {};
  global.fetch = async url => {
    const q = decodeURIComponent(new URL(url).searchParams.get('s'));
    queries.push(q);
    const meals = responder(q);
    return { json: async () => (meals ? { meals } : { meals: null }) };
  };
}
const THUMB = 'https://www.themealdb.com/images/media/meals/abc123.jpg';
const hit = name => [{ strMeal: name, strMealThumb: THUMB }];

// ── Pass 1: exact name matches ───────────────────────────────
test('exact TheMealDB match returns the thumb, not stock', async () => {
  stubDb(q => (q === 'Beef Wellington' ? hit(q) : null));
  const r = await fetchMealImage('Beef Wellington');
  a.deepStrictEqual(r, { url: THUMB, stock: false });
  a.deepStrictEqual(queries, ['Beef Wellington'], 'should not retry after a hit');
});

// ── Pass 2: adjective strip (still the actual dish → persisted, unlabelled) ──
test('strips leading adjectives and retries', async () => {
  stubDb(q => (q === 'Salmon' ? hit(q) : null));
  const r = await fetchMealImage('Pan-Fried Salmon');
  a.strictEqual(r.stock, false, 'the dish noun survives, so this is still an exact photo');
  a.deepStrictEqual(queries, ['Pan-Fried Salmon', 'Salmon']);
});

test('strips a run of adjectives iteratively', async () => {
  stubDb(q => (q === 'Pork Chops' ? hit(q) : null));
  const r = await fetchMealImage('Easy Garlic Butter Pork Chops');
  a.strictEqual(queries[1], 'Pork Chops');
  a.strictEqual(r.stock, false);
});

test('strips an X-style adjective', async () => {
  stubDb(q => (q === 'Meatballs' ? hit(q) : null));
  await fetchMealImage('Korean-style Meatballs');
  a.strictEqual(queries[1], 'Meatballs');
});

// ── Pass 2b: main food noun ──────────────────────────────────
// The adjective list stops at the first word it doesn't know, so these used to fall
// straight through to a random stock photo.
test('a cuisine word no longer sinks the retry', async () => {
  stubDb(q => (q === 'Chicken Skillet' ? hit(q) : null));
  const r = await fetchMealImage('Creamy Tuscan Chicken Skillet');
  a.strictEqual(r.url, THUMB);
  a.strictEqual(r.stock, true, 'a noun match is the right food, not this dish — label it');
  a.deepStrictEqual(queries, ['Creamy Tuscan Chicken Skillet', 'Tuscan Chicken Skillet', 'Chicken Skillet']);
});

test('falls back from noun-to-end to the bare noun', async () => {
  stubDb(q => (q === 'Salmon' ? hit(q) : null));
  const r = await fetchMealImage('Honey Garlic Salmon Bites');
  a.strictEqual(r.stock, true);
  a.deepStrictEqual(queries.slice(-2), ['Salmon Bites', 'Salmon']);
});

test('picks the food noun over trailing cookware', async () => {
  stubDb(q => (q === 'Shrimp Pasta' ? hit(q) : null));
  const r = await fetchMealImage('Cajun Shrimp Pasta');
  a.strictEqual(r.url, THUMB);
  a.strictEqual(queries[queries.length - 1], 'Shrimp Pasta');
});

test('a name with no known food noun skips straight to stock', async () => {
  stubDb(() => null);
  const r = await fetchMealImage('Tuscan Skillet Supper');
  a.strictEqual(r.stock, true);
  a.deepStrictEqual(queries, ['Tuscan Skillet Supper'], 'no noun to retry on');
});

test('never spends the same query twice across passes', async () => {
  stubDb(() => null);
  await fetchMealImage('Grilled Chicken');
  a.deepStrictEqual(queries, ['Grilled Chicken', 'Chicken'], 'pass 2b must not re-ask pass 2a\'s query');
});

test('skips the retry when simplification changes nothing', async () => {
  stubDb(() => null);
  await fetchMealImage('Lasagna');
  a.deepStrictEqual(queries, ['Lasagna'], 'no second lookup for an already-bare name');
});

test('matches plural food nouns', async () => {
  stubDb(q => (q === 'Meatballs' ? hit(q) : null));
  const r = await fetchMealImage('Swedish Meatballs in Gravy');
  a.strictEqual(r.url, THUMB);
  a.ok(queries.includes('Meatballs'), 'plural nouns are most of what AI names say');
});

test('matches an -es plural', async () => {
  stubDb(q => (q === 'Potatoes' ? hit(q) : null));
  await fetchMealImage('Crispy Roasted Potatoes');
  a.ok(queries.includes('Potatoes'));
});

// ── Pass 3: stock fallback ───────────────────────────────────
test('falls back to a labeled stock photo when nothing matches', async () => {
  stubDb(() => null);
  const r = await fetchMealImage('Creamy Tuscan Chicken Skillet');
  a.strictEqual(r.stock, true, 'must be flagged so the UI can label it');
  a.match(r.url, /^https:\/\/loremflickr\.com\/600\/400\//);
  a.ok(r.url.includes('food'), 'keywords should be food-scoped');
});

test('stock URL encodes multi-word names as comma keywords', async () => {
  stubDb(() => null);
  const r = await fetchMealImage('Sheet Pan Nachos');
  a.strictEqual(r.url, 'https://loremflickr.com/600/400/sheet%2Cpan%2Cnachos,food/all');
});

// ── Resilience ───────────────────────────────────────────────
test('a network failure degrades to stock rather than throwing', async () => {
  queries = [];
  _mealImgCache = {};
  global.fetch = async () => { throw new Error('offline'); };
  const r = await fetchMealImage('Beef Wellington');
  a.strictEqual(r.stock, true);
});

test('malformed JSON degrades to stock', async () => {
  queries = [];
  _mealImgCache = {};
  global.fetch = async () => ({ json: async () => ({}) });
  const r = await fetchMealImage('Beef Wellington');
  a.strictEqual(r.stock, true);
});

test('an empty or blank name returns null without fetching', async () => {
  stubDb(() => null);
  a.strictEqual(await fetchMealImage(''), null);
  a.strictEqual(await fetchMealImage('   '), null);
  a.strictEqual(await fetchMealImage(undefined), null);
  a.deepStrictEqual(queries, []);
});

// ── Cache ────────────────────────────────────────────────────
test('caches by lowercased name across differing capitalisation', async () => {
  stubDb(q => (q === 'Beef Wellington' ? hit(q) : null));
  await fetchMealImage('Beef Wellington');
  const r = await fetchMealImage('beef wellington');
  a.deepStrictEqual(r, { url: THUMB, stock: false });
  a.strictEqual(queries.length, 1, 'second open should not hit the network');
});

test('caches the stock fallback too, so a miss is not re-fetched', async () => {
  stubDb(() => null);
  await fetchMealImage('Creamy Tuscan Chicken Skillet');
  const before = queries.length;
  await fetchMealImage('Creamy Tuscan Chicken Skillet');
  a.strictEqual(queries.length, before);
});
