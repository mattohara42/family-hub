/**
 * Contrast test for the theme tokens in hub-theme.css.
 *
 * Run with:  npm test   (Node's built-in test runner, no deps)
 *
 * What it protects: every look (each theme, Tactile included, in dark, light
 * and Accessible) keeps text at 4.5:1 and bars, charts and focus rings at
 * 3:1 against what they sit on, and hub-theme.css stays tokens only. Other
 * apps may copy hub-theme.css and tools/theme-check.js and run the same
 * checks, so a palette change that breaks contrast fails here first. When a
 * check fails, nudge the token it names (or the --*-keep that builds it) by
 * the smallest step that passes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const T = require('../tools/theme-check.js');

const css = fs.readFileSync(path.join(__dirname, '..', 'hub-theme.css'), 'utf8');
const report = (failures) => failures.map((f) => `${f.combo}: ${f.what} is ${f.worst.toFixed(2)}, needs ${f.need}${f.note ? ` (${f.note})` : ''}`);

test('every look passes contrast', () => {
  const looks = T.looks(css);
  const names = looks.map((l) => l.name);
  for (const theme of ['tactile', 'glass', 'paper']) for (const mode of ['dark', 'light', 'accessible']) {
    assert.ok(names.includes(`${theme}-${mode}`), `${theme}-${mode} is checked`);
  }
  assert.deepEqual(report(T.check(css, looks).failures), []);
});

test('the check has teeth: the old Glass dark gray fails', () => {
  const old = css.replace('body.theme-glass:not(.colorblind-mode) { --muted: #c9cbd4; }', 'body.theme-glass:not(.colorblind-mode) { --muted: #7b7f96; }');
  assert.notEqual(old, css, 'the Glass gray rule moved; update this test');
  const failures = T.check(old, T.looks(old)).failures.filter((f) => f.combo === 'glass-dark');
  assert.ok(failures.some((f) => f.what === '--muted on well'));
});

test('the check has teeth: --muted as the event fill fails in dark looks', () => {
  // The fill once was --muted itself, which dark looks lighten for gray text.
  const old = css.replace('--event-fallback: color-mix(in srgb, var(--muted) 65%, #000);', '--event-fallback: var(--muted);');
  assert.notEqual(old, css, 'the --event-fallback rule moved; update this test');
  const failing = new Set(T.check(old, T.looks(old)).failures.filter((f) => f.what === '#fff on token:--event-fallback').map((f) => f.combo));
  for (const combo of ['tactile-dark', 'glass-dark', 'glass-accessible', 'tactile-accessible', 'paper-dark']) assert.ok(failing.has(combo), combo);
});

test('light looks keep --muted as the event fill', () => {
  // body.light-mode resets the darkened fill: light grays already carry white text.
  for (const look of T.looks(css).filter((l) => l.classes.has('light-mode'))) {
    const env = T.computed(T.tokenBlocks(css), look);
    assert.equal(env['--event-fallback'], env['--muted'], look.name);
  }
});

test('every shared token resolves to a color in every look', () => {
  const names = ['--bg', '--text', '--muted', '--ink', '--ink-soft', '--accent', '--surface-solid', '--status-ok',
    '--status-watch', '--status-over', '--status-ink', '--track', '--link', '--focus', '--chart', '--event-fallback'];
  const blocks = T.tokenBlocks(css);
  for (const combo of T.looks(css)) {
    const env = T.computed(blocks, combo);
    for (const n of names) assert.ok(T.parseColor(env[n] || ''), `${combo.name}: ${n} is "${env[n]}"`);
  }
});

test('hub-theme.css is tokens only', () => {
  assert.deepEqual(T.lint(css), []);
  assert.deepEqual(T.lint('@import "x.css"; body { color: red; --x: url(https://a.example/b.png) !important; } @media all { :root { --y: #fff; } }'), [
    '!important', 'url(https://a.example/b.png)', 'at-rule @import', '"body" sets color', 'at-rule @media',
  ]);
});

test('colors parse the way a browser reads them', () => {
  assert.equal(T.hex(T.parseColor('color-mix(in srgb, #000000 25%, #ffffff)')), '#bfbfbf');
  const glow = T.parseColor('color-mix(in srgb, #4a6cf7 13%, transparent)');
  assert.equal(T.hex(glow), '#4a6cf7');
  assert.ok(Math.abs(glow[3] - 0.13) < 1e-9);
  // percentages over 100% are scaled down; under 100% also lower the alpha
  assert.deepEqual(T.parseColor('color-mix(in srgb, #ff0000 60%, #0000ff 60%)').map((v) => +v.toFixed(3)), [0.5, 0, 0.5, 1]);
  assert.equal(+T.parseColor('color-mix(in srgb, #ff0000 20%, #0000ff 30%)')[3].toFixed(3), 0.5);
  assert.equal(T.parseColor('color-mix(in srgb, #ff0000 120%, #0000ff)'), null);
  assert.equal(T.hex(T.parseColor('rgb(100% 0% 50%)')), '#ff0080');
  assert.equal(T.saturateAmount('blur(12px) saturate(180%)'), 1.8);
  assert.equal(T.saturateAmount('saturate(1.8)'), 1.8);
  assert.equal(T.ratio([1, 1, 1], [0, 0, 0]).toFixed(1), '21.0');
});

test('the cascade resolves the way a browser does', () => {
  // a var() resolves where it is declared: an alias on :root keeps :root's
  // value even when body overrides the token (CLAUDE.md, gotchas)
  const blocks = T.tokenBlocks(':root { --text: #ffffff; --alias: var(--text); } body.light-mode { --text: #000000; }');
  const env = T.computed(blocks, { classes: new Set(['light-mode']) });
  assert.equal(env['--text'], '#000000');
  assert.equal(env['--alias'], '#ffffff');
  // a later block wins at equal specificity, a more specific one wins regardless
  const order = T.tokenBlocks('body.a.b { --x: #111111; } body.a { --x: #222222; } body.b { --x: #333333; }');
  assert.equal(T.computed(order, { classes: new Set(['a', 'b']) })['--x'], '#111111');
  assert.equal(T.computed(order, { classes: new Set(['a']) })['--x'], '#222222');
  // a comment opener inside a string is not a comment
  const str = T.tokenBlocks(':root { --q: "/*"; } body { --x: #444444; } /* */');
  assert.equal(T.computed(str, { classes: new Set() })['--x'], '#444444');
});

test('the checker fails closed on CSS it cannot model', () => {
  assert.throws(() => T.tokenBlocks('html body.a { --x: #fff; }'), /can't model the selector/);
  assert.throws(() => T.tokenBlocks('body:is(.a) { --x: #fff; }'), /can't model the selector/);
  assert.throws(() => T.tokenBlocks('body[data-x^="1"] { --x: #fff; }'), /can't model the selector/);
  assert.throws(() => T.tokenBlocks('html.dark { --x: #fff; }'), /can't model the selector/);
  assert.throws(() => T.tokenBlocks('@media all { body { --x: #fff; } }'), /aren't modelled/);
  assert.throws(() => T.tokenBlocks('@import "x.css"; body { --x: #fff; }'), /"@import "x.css"" isn't modelled/);
  // lint() and tokenBlocks() agree: no statement is modelled, @charset included
  assert.throws(() => T.tokenBlocks('@charset "utf-8"; body { --x: #fff; }'), /isn't modelled/);
  assert.ok(T.lint('@charset "utf-8"; body { --x: #fff; }').some((p) => /@charset/.test(p)));
  // a bare CR ends a string in a browser, so it can't hide a rule here
  assert.throws(() => T.tokenBlocks(":root { --f: 'A\rB'/*\n} body { --x: #000; } */; }"), /line break inside a string/);
  assert.match(T.lint(":root { --f: 'A\rB'/* } body { color: red } */; }")[0], /line break inside a string/);
  // an escaped quote doesn't end a string, and an unquoted url( hides no comment
  assert.ok(T.lint(':root { --q: "\\"/*"; } body { color: red } :root { --z: "*/"; }').includes('"body" sets color'));
  assert.ok(T.lint('@font-face { font-family: url(/*); } body { color: red } :root { --z: 1 */; }').includes('"body" sets color'));
  // an escape outside a string doesn't start one; a spaced or commented !important still counts
  assert.ok(T.lint(':root { --a: \\" x" /* "; } body { color: red } :root { --b: 1 */; }').includes('"body" sets color'));
  assert.ok(T.lint('body { --a: #fff ! important; --b: #000 !/**/important; }').includes('!important'));
  assert.throws(() => T.colorsIn('linear-gradient(red, #fff)'), /can't read "red"/);
  assert.throws(() => T.colorsIn('linear-gradient(hsl(0 0% 0%), #fff)'), /can't read/);
  // single quotes or none on an attribute value both parse
  const q = T.tokenBlocks(":root[data-t='dark'] { --x: #111111; } :root[data-t=light] { --x: #222222; }");
  assert.equal(T.computed(q, { classes: new Set(), attrs: { 'data-t': 'light' } })['--x'], '#222222');
});

test('long var() chains resolve quickly', () => {
  let chain = ':root { --a0: #fff;';
  for (let i = 1; i <= 40; i++) chain += ` --a${i}: var(--a${i - 1}) var(--a${i - 1});`;
  chain += ' }';
  const start = Date.now();
  const env = T.computed(T.tokenBlocks(chain), { classes: new Set() });
  assert.ok(Date.now() - start < 1000);
  assert.equal(env['--a40'], null, 'a value past the size cap is invalid');
});
