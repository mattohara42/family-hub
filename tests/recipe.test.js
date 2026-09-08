/**
 * Unit tests for the pure JSON-LD helpers in netlify/functions/recipe.js.
 *
 * Run with:  npm test   (Node's built-in test runner — no deps)
 *
 * No network: every case runs against fixture HTML/JSON-LD shaped like what the
 * real sites emit. The NYT fixture mirrors the structure recorded by the
 * 2026-07-06 feasibility probe in MEALS_BACKLOG.md — notably a paywalled
 * (`isAccessibleForFree: false`) page that still carries complete ingredients
 * and HowToStep instructions.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractLdJsonBlocks,
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
} = require('../netlify/functions/recipe.js')._test;

// ── Fixtures ───────────────────────────────────────────────────

/** NYT Cooking shape: single Recipe node, HowToStep instructions, paywalled. */
const NYT_RECIPE = {
  '@context': 'http://schema.org',
  '@type': 'Recipe',
  name: 'Simple Roast Chicken',
  description: 'A very simple roast chicken &mdash; salt, pepper, heat.',
  author: { '@type': 'Person', name: 'Mark Bittman' },
  publisher: { '@type': 'Organization', name: 'NYT Cooking' },
  image: ['https://static01.nyt.com/images/roast-chicken.jpg'],
  recipeYield: '4 servings',
  totalTime: 'PT1H15M',
  recipeCuisine: 'American',
  isAccessibleForFree: false,
  recipeIngredient: [
    '1 whole chicken, about 3 pounds',
    'Salt &amp; freshly ground black pepper',
    '2 tablespoons olive oil',
  ],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Heat the oven to 450 degrees.' },
    { '@type': 'HowToStep', text: 'Season the chicken   generously inside and out.' },
    { '@type': 'HowToStep', text: 'Roast until juices run clear, 50 to 60 minutes.' },
  ],
};

const nytPage = (recipe = NYT_RECIPE) => `<!doctype html>
<html><head>
<script type="application/ld+json">${JSON.stringify({ '@type': 'WebPage', name: 'Cooking' })}</script>
<script type="application/ld+json">${JSON.stringify(recipe)}</script>
</head><body><p>Subscribe to read.</p></body></html>`;

// ── extractLdJsonBlocks ────────────────────────────────────────

test('extractLdJsonBlocks finds every ld+json block on the page', () => {
  assert.equal(extractLdJsonBlocks(nytPage()).length, 2);
});

test('extractLdJsonBlocks tolerates attribute order, extra attrs and single quotes', () => {
  const html = `<script data-rh="true" type='application/ld+json' id="x">{"a":1}</script>`;
  assert.deepEqual(extractLdJsonBlocks(html).map(s => s.trim()), ['{"a":1}']);
});

test('extractLdJsonBlocks ignores non-JSON-LD scripts', () => {
  const html = `<script type="text/javascript">var recipe = {"@type":"Recipe"};</script>`;
  assert.deepEqual(extractLdJsonBlocks(html), []);
});

// ── Recipe node discovery ──────────────────────────────────────

test('isRecipeNode accepts a string @type and an array @type', () => {
  assert.equal(isRecipeNode({ '@type': 'Recipe' }), true);
  assert.equal(isRecipeNode({ '@type': ['NewsArticle', 'Recipe'] }), true);
  assert.equal(isRecipeNode({ '@type': 'recipe' }), true);      // case-insensitive
  assert.equal(isRecipeNode({ '@type': 'Article' }), false);
  assert.equal(isRecipeNode(null), false);
  assert.equal(isRecipeNode({}), false);
});

test('findRecipeNode pulls the Recipe out of a page with several blocks', () => {
  const node = findRecipeNode(nytPage());
  assert.ok(node);
  assert.equal(node.name, 'Simple Roast Chicken');
});

test('findRecipeNode descends into a top-level array', () => {
  const html = `<script type="application/ld+json">${JSON.stringify(
    [{ '@type': 'BreadcrumbList' }, { '@type': 'Recipe', name: 'Array Recipe' }]
  )}</script>`;
  assert.equal(findRecipeNode(html).name, 'Array Recipe');
});

test('findRecipeNode descends into @graph (Yoast/WordPress shape)', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'WebSite' }, { '@type': ['Recipe'], name: 'Graph Recipe' }],
  })}</script>`;
  assert.equal(findRecipeNode(html).name, 'Graph Recipe');
});

test('findRecipeNode descends into mainEntity', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'WebPage', mainEntity: { '@type': 'Recipe', name: 'Nested Recipe' },
  })}</script>`;
  assert.equal(findRecipeNode(html).name, 'Nested Recipe');
});

test('findRecipeNode skips a malformed block and keeps scanning', () => {
  const html = `<script type="application/ld+json">{ this is not json, }</script>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Survivor' })}</script>`;
  assert.equal(findRecipeNode(html).name, 'Survivor');
});

test('findRecipeNode returns null when the page has no Recipe', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Article', name: 'Not food' })}</script>`;
  assert.equal(findRecipeNode(html), null);
  assert.equal(findRecipeNode('<html><body>nothing here</body></html>'), null);
});

// ── Text cleaning ──────────────────────────────────────────────

test('cleanText strips tags, decodes entities and collapses whitespace', () => {
  assert.equal(cleanText('<p>Salt &amp; pepper</p>'), 'Salt & pepper');
  assert.equal(cleanText('a   b\n\nc'), 'a b c');
  assert.equal(cleanText('Bittman&rsquo;s &frac12; cup'), 'Bittman’s ½ cup');
  assert.equal(cleanText('&#189; teaspoon'), '½ teaspoon');
  assert.equal(cleanText('&#x2153; cup'), '⅓ cup');
  assert.equal(cleanText(null), '');
});

test('cleanText leaves an unknown entity alone rather than mangling it', () => {
  assert.equal(cleanText('a &bogus; b'), 'a &bogus; b');
});

test('firstString unwraps arrays and name/text objects', () => {
  assert.equal(firstString('plain'), 'plain');
  assert.equal(firstString({ '@type': 'Person', name: 'Mark Bittman' }), 'Mark Bittman');
  assert.equal(firstString([{ name: '' }, { name: 'Second' }]), 'Second');
  assert.equal(firstString(undefined), '');
});

// ── Ingredients ────────────────────────────────────────────────

test('normalizeIngredients cleans entities and preserves order', () => {
  assert.deepEqual(normalizeIngredients(NYT_RECIPE), [
    '1 whole chicken, about 3 pounds',
    'Salt & freshly ground black pepper',
    '2 tablespoons olive oil',
  ]);
});

test('normalizeIngredients falls back to the legacy `ingredients` key', () => {
  assert.deepEqual(normalizeIngredients({ ingredients: ['flour', 'water'] }), ['flour', 'water']);
});

test('normalizeIngredients handles a missing field and a lone string', () => {
  assert.deepEqual(normalizeIngredients({}), []);
  assert.deepEqual(normalizeIngredients({ recipeIngredient: 'just one' }), ['just one']);
});

// ── Instructions ───────────────────────────────────────────────

test('normalizeInstructions reads HowToStep objects', () => {
  assert.deepEqual(normalizeInstructions(NYT_RECIPE.recipeInstructions), [
    'Heat the oven to 450 degrees.',
    'Season the chicken generously inside and out.',
    'Roast until juices run clear, 50 to 60 minutes.',
  ]);
});

test('normalizeInstructions reads a plain array of strings', () => {
  assert.deepEqual(normalizeInstructions(['Chop.', 'Cook.']), ['Chop.', 'Cook.']);
});

test('normalizeInstructions splits a single HTML blob into steps', () => {
  assert.deepEqual(
    normalizeInstructions('<p>Heat the pan.</p><p>Add butter.</p>'),
    ['Heat the pan.', 'Add butter.']
  );
  assert.deepEqual(normalizeInstructions('Step one.<br/>Step two.'), ['Step one.', 'Step two.']);
});

test('normalizeInstructions flattens HowToSection groups and keeps the section label', () => {
  const sectioned = [
    {
      '@type': 'HowToSection',
      name: 'For the sauce',
      itemListElement: [
        { '@type': 'HowToStep', text: 'Simmer the tomatoes.' },
        { '@type': 'HowToStep', text: 'Season to taste.' },
      ],
    },
    { '@type': 'HowToStep', text: 'Assemble and serve.' },
  ];
  assert.deepEqual(normalizeInstructions(sectioned), [
    'For the sauce:',
    'Simmer the tomatoes.',
    'Season to taste.',
    'Assemble and serve.',
  ]);
});

test('normalizeInstructions drops empty steps and handles a missing field', () => {
  assert.deepEqual(normalizeInstructions(['', '   ', 'Real step.']), ['Real step.']);
  assert.deepEqual(normalizeInstructions(undefined), []);
});

// ── Image / duration / yield ───────────────────────────────────

test('normalizeImage accepts a string, an array and an ImageObject', () => {
  assert.equal(normalizeImage('https://x.test/a.jpg'), 'https://x.test/a.jpg');
  assert.equal(normalizeImage(['https://x.test/a.jpg', 'https://x.test/b.jpg']), 'https://x.test/a.jpg');
  assert.equal(normalizeImage({ '@type': 'ImageObject', url: 'https://x.test/c.jpg' }), 'https://x.test/c.jpg');
});

test('normalizeImage rejects non-absolute URLs so the <img> never gets junk', () => {
  assert.equal(normalizeImage('/relative/a.jpg'), '');
  assert.equal(normalizeImage('javascript:alert(1)'), '');
  assert.equal(normalizeImage(undefined), '');
});

test('isoDurationToMinutes parses ISO-8601 durations', () => {
  assert.equal(isoDurationToMinutes('PT30M'), 30);
  assert.equal(isoDurationToMinutes('PT1H15M'), 75);
  assert.equal(isoDurationToMinutes('PT2H'), 120);
  assert.equal(isoDurationToMinutes('P1DT2H'), 1560);
  assert.equal(isoDurationToMinutes('PT90S'), 2);       // rounds to whole minutes
  assert.equal(isoDurationToMinutes('not a duration'), 0);
  assert.equal(isoDurationToMinutes(undefined), 0);
});

test('normalizeYield prefers the descriptive variant', () => {
  assert.equal(normalizeYield('4 servings'), '4 servings');
  assert.equal(normalizeYield(['4', '4 servings']), '4 servings');
  assert.equal(normalizeYield(6), '6');
  assert.equal(normalizeYield(undefined), '');
});

// ── Source naming ──────────────────────────────────────────────

test('sourceNameFor prefers the publisher, then a known host, then the bare host', () => {
  assert.equal(sourceNameFor(NYT_RECIPE, 'https://cooking.nytimes.com/recipes/1'), 'NYT Cooking');
  assert.equal(sourceNameFor({}, 'https://cooking.nytimes.com/recipes/1'), 'NYT Cooking');
  assert.equal(sourceNameFor({}, 'https://www.seriouseats.com/x'), 'Serious Eats');
  assert.equal(sourceNameFor({}, 'https://www.some-food-blog.test/x'), 'some-food-blog.test');
});

// ── Full normalization ─────────────────────────────────────────

test('normalizeRecipe produces the flat record the Recipe Box stores', () => {
  const r = normalizeRecipe(NYT_RECIPE, 'https://cooking.nytimes.com/recipes/1015819-simple-roast-chicken');
  assert.equal(r.name, 'Simple Roast Chicken');
  assert.equal(r.ingredients.length, 3);
  assert.equal(r.instructions.length, 3);
  assert.equal(r.description, 'A very simple roast chicken — salt, pepper, heat.');
  assert.equal(r.image, 'https://static01.nyt.com/images/roast-chicken.jpg');
  assert.equal(r.servings, '4 servings');
  assert.equal(r.totalTime, 75);
  assert.equal(r.author, 'Mark Bittman');
  assert.equal(r.cuisine, 'American');
  assert.equal(r.sourceName, 'NYT Cooking');
  assert.equal(r.sourceUrl, 'https://cooking.nytimes.com/recipes/1015819-simple-roast-chicken');
  assert.equal(r.paywalled, true);
});

test('normalizeRecipe sums prep+cook when totalTime is absent', () => {
  const r = normalizeRecipe({ '@type': 'Recipe', name: 'X', prepTime: 'PT20M', cookTime: 'PT40M' }, 'https://x.test/r');
  assert.equal(r.totalTime, 60);
});

test('normalizeRecipe never returns undefined fields (Firestore rejects them)', () => {
  const r = normalizeRecipe({ '@type': 'Recipe', name: 'Bare' }, 'https://x.test/r');
  for (const [k, v] of Object.entries(r)) {
    assert.notEqual(v, undefined, `field ${k} is undefined`);
  }
  assert.deepEqual(r.ingredients, []);
  assert.deepEqual(r.instructions, []);
  assert.equal(r.totalTime, 0);
  assert.equal(r.paywalled, false);
});

test('normalizeRecipe round-trips from raw page HTML', () => {
  const r = normalizeRecipe(findRecipeNode(nytPage()), 'https://cooking.nytimes.com/recipes/1');
  assert.equal(r.name, 'Simple Roast Chicken');
  assert.deepEqual(r.ingredients[1], 'Salt & freshly ground black pepper');
});

// ── SSRF guard ─────────────────────────────────────────────────

test('isPrivateHost blocks loopback, private ranges and cloud metadata', () => {
  for (const h of ['localhost', 'foo.localhost', 'thing.internal', 'nas.local', '::1', '0.0.0.0',
                   '127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '172.31.255.255',
                   '169.254.169.254']) {
    assert.equal(isPrivateHost(h), true, `${h} should be blocked`);
  }
});

test('isPrivateHost allows real public hosts', () => {
  for (const h of ['cooking.nytimes.com', 'www.allrecipes.com', '8.8.8.8', '172.32.0.1', '192.169.1.1']) {
    assert.equal(isPrivateHost(h), false, `${h} should be allowed`);
  }
});

// ── Handler path (network stubbed) ─────────────────────────────
//
// Exercises the full request path — URL validation, content-type and size
// guards, parse, and response shape — with `fetch` replaced by a stub, so these
// stay offline and deterministic.

const { handler } = require('../netlify/functions/recipe.js');

/** Run the handler with global fetch stubbed to return `res`. */
async function withFetch(res, run) {
  const original = global.fetch;
  global.fetch = async () => (typeof res === 'function' ? res() : res);
  try { return await run(); } finally { global.fetch = original; }
}

const htmlResponse = (body, extra = {}) => ({
  ok: true, status: 200, url: 'https://cooking.nytimes.com/recipes/1',
  headers: { get: k => ({ 'content-type': 'text/html; charset=utf-8' }[k.toLowerCase()] ?? null) },
  text: async () => body,
  ...extra,
});

const call = (params, method = 'GET') =>
  handler({ httpMethod: method, queryStringParameters: params });

test('handler returns the normalized recipe for a page with Recipe JSON-LD', async () => {
  const res = await withFetch(htmlResponse(nytPage()), () =>
    call({ url: 'https://cooking.nytimes.com/recipes/1' }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.recipe.name, 'Simple Roast Chicken');
  assert.equal(body.recipe.ingredients.length, 3);
  assert.equal(body.recipe.instructions.length, 3);
  assert.equal(body.recipe.sourceName, 'NYT Cooking');
  assert.equal(body.recipe.paywalled, true);
  assert.match(res.headers['Content-Type'], /application\/json/);
});

test('handler answers 422 no-recipe when the page has no Recipe JSON-LD', async () => {
  const res = await withFetch(htmlResponse('<html><body>Subscribe.</body></html>'), () =>
    call({ url: 'https://cooking.nytimes.com/recipes/1' }));
  assert.equal(res.statusCode, 422);
  assert.equal(JSON.parse(res.body).error, 'no-recipe');
});

test('handler answers 422 when a Recipe node carries neither name nor ingredients', async () => {
  const empty = `<script type="application/ld+json">{"@type":"Recipe","recipeYield":"4"}</script>`;
  const res = await withFetch(htmlResponse(empty), () => call({ url: 'https://x.test/r' }));
  assert.equal(res.statusCode, 422);
  assert.equal(JSON.parse(res.body).error, 'no-recipe');
});

test('handler validates the url parameter before making any request', async () => {
  const noFetch = () => { throw new Error('should not fetch'); };
  const original = global.fetch;
  global.fetch = noFetch;
  try {
    assert.equal((await call({})).statusCode, 400);                                 // missing
    assert.equal((await call({ url: 'not a url' })).statusCode, 400);               // unparseable
    assert.equal((await call({ url: 'file:///etc/passwd' })).statusCode, 400);      // wrong scheme
    assert.equal((await call({ url: 'http://169.254.169.254/latest/' })).statusCode, 403); // SSRF
    assert.equal((await call({ url: 'http://localhost:8080/x' })).statusCode, 403);
  } finally { global.fetch = original; }
});

test('handler rejects a non-GET method and answers CORS pre-flight', async () => {
  assert.equal((await call({ url: 'https://x.test/r' }, 'POST')).statusCode, 405);
  const pre = await call({}, 'OPTIONS');
  assert.equal(pre.statusCode, 204);
  assert.equal(pre.headers['Access-Control-Allow-Origin'], '*');
});

test('handler surfaces an upstream error status rather than pretending to parse', async () => {
  const fail = { ok: false, status: 403, url: 'https://x.test/r', headers: { get: () => null }, text: async () => '' };
  const res = await withFetch(fail, () => call({ url: 'https://x.test/r' }));
  assert.equal(res.statusCode, 502);
  assert.match(JSON.parse(res.body).error, /HTTP 403/);

  const missing = { ...fail, status: 404 };
  assert.equal((await withFetch(missing, () => call({ url: 'https://x.test/r' }))).statusCode, 404);
});

test('handler refuses a non-HTML content type', async () => {
  const pdf = htmlResponse('%PDF-1.4', {
    headers: { get: k => ({ 'content-type': 'application/pdf' }[k.toLowerCase()] ?? null) },
  });
  const res = await withFetch(pdf, () => call({ url: 'https://x.test/r.pdf' }));
  assert.equal(res.statusCode, 415);
  assert.match(JSON.parse(res.body).error, /application\/pdf/);
});

test('handler refuses an over-large page by content-length', async () => {
  const big = htmlResponse('x', {
    headers: { get: k => ({ 'content-type': 'text/html', 'content-length': String(50 * 1024 * 1024) }[k.toLowerCase()] ?? null) },
  });
  assert.equal((await withFetch(big, () => call({ url: 'https://x.test/r' }))).statusCode, 413);
});

test('handler reports a network failure as 502 instead of throwing', async () => {
  const res = await withFetch(() => { throw new Error('ECONNRESET'); }, () =>
    call({ url: 'https://x.test/r' }));
  assert.equal(res.statusCode, 502);
  assert.match(JSON.parse(res.body).error, /ECONNRESET/);
});

test('handler records the post-redirect URL as the source', async () => {
  const redirected = htmlResponse(nytPage(), { url: 'https://cooking.nytimes.com/recipes/1015819-simple-roast-chicken' });
  const res = await withFetch(redirected, () => call({ url: 'https://nyti.ms/short' }));
  assert.equal(JSON.parse(res.body).recipe.sourceUrl,
    'https://cooking.nytimes.com/recipes/1015819-simple-roast-chicken');
});
