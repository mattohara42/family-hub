/**
 * Contrast check for hub-theme.css, read straight from the CSS.
 *
 * Other apps may copy hub-theme.css and this file unchanged and run the same
 * checks with their own on top. tests/theme-contrast.test.js runs it here.
 *
 * It resolves every token for one theme and colors combination the way a
 * browser does (cascade order and specificity, html then body then an
 * optional scoped element, var() computed where it is declared, color-mix in
 * srgb), then measures text at 4.5:1 and bars, ticks, charts and focus rings
 * at 3:1 against everything they are drawn on. Translucent Glass cards are
 * composited over each color in the scene, before and after the card's
 * saturate() filter, computed both in gamma sRGB and in linear light, and the
 * worst case counts. A gradient surface counts each opaque stop, plus each
 * translucent stop (Tactile's accent glow) at full strength over each opaque
 * stop: the glow is centred above the card, so it is strongest at the title.
 *
 * It fails closed: a rule that sets tokens but whose selector it can't read,
 * tokens inside an @-rule, or a color syntax it doesn't know all throw, so a
 * check can't pass by being skipped.
 *
 * What it doesn't model: a background photo (has-bg), the calendar's cells
 * (--col-bg, --today-bg, --week-bg), the colors between two gradient stops
 * (an sRGB blend can be a little darker than both), classes on <html> (the
 * looks are body classes), and Safari (only Chromium was compared).
 *
 * Plain color syntax only: #hex, rgb()/rgba(), transparent and
 * color-mix(in srgb, ...).
 */
'use strict';

// ── colors ──────────────────────────────────────────────────────────

function splitTop(s, sep) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** "#rrggbb", "rgb(...)", "transparent" or "color-mix(in srgb, ...)" → [r, g, b, a] in 0..1, else null. */
function parseColor(input) {
  const s = String(input).trim();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  m = s.match(/^rgba?\((.*)\)$/s);
  if (m) {
    const p = m[1].trim().split(/[\s,/]+/).filter(Boolean);
    if (p.length < 3 || p.length > 4) return null;
    const ch = (v) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / 255);
    const a = p.length > 3 ? (p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
    const out = [ch(p[0]), ch(p[1]), ch(p[2]), a];
    return out.every((v) => Number.isFinite(v)) ? out.map((v) => Math.min(1, Math.max(0, v))) : null;
  }
  m = s.match(/^color-mix\(\s*in\s+srgb\s*,(.*)\)$/s);
  if (m) {
    const args = splitTop(m[1], ',');
    if (args.length !== 2) return null;
    const arg = (x) => {
      const t = x.trim();
      const pm = t.match(/\s(-?[\d.]+)%\s*$/);
      return pm ? [parseColor(t.slice(0, pm.index)), parseFloat(pm[1]) / 100] : [parseColor(t), null];
    };
    const [ca, pa0] = arg(args[0]);
    const [cb, pb0] = arg(args[1]);
    if (!ca || !cb) return null;
    if ([pa0, pb0].some((p) => p !== null && (p < 0 || p > 1))) return null;
    let pa = pa0; let pb = pb0;
    if (pa === null && pb === null) { pa = 0.5; pb = 0.5; } else if (pa === null) pa = 1 - pb; else if (pb === null) pb = 1 - pa;
    // The spec: percentages are scaled to add up to 100%, and if they added
    // up to less, the result's alpha is multiplied by their sum.
    const sum = pa + pb;
    if (sum === 0) return null;
    const scale = Math.min(1, sum);
    pa /= sum; pb /= sum;
    const alpha = ca[3] * pa + cb[3] * pb;
    if (alpha === 0) return [0, 0, 0, 0];
    const rgb = [0, 1, 2].map((i) => (ca[i] * ca[3] * pa + cb[i] * cb[3] * pb) / alpha);
    return [...rgb, alpha * scale];
  }
  return null;
}

/** Paint fg [r,g,b,a] over an opaque bg [r,g,b]. */
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => { const x = Math.min(1, Math.max(0, v)); return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055; };

/** CSS saturate() matrix (Filter Effects spec), in gamma sRGB or in linear light. */
function saturate(c, s, linear) {
  const m = [[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]];
  const v = linear ? c.map(toLin) : c;
  const out = m.map((row) => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])));
  return linear ? out.map(toSrgb) : out;
}

/** The saturate() amount in a filter value ("saturate(180%)" or "saturate(1.8)"), or null. */
function saturateAmount(filter) {
  const m = (filter || '').match(/saturate\(\s*([\d.]+)(%?)\s*\)/);
  return m ? parseFloat(m[1]) / (m[2] ? 100 : 1) : null;
}

const lum = (c) => { const [r, g, b] = c.slice(0, 3).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

// ── CSS ─────────────────────────────────────────────────────────────

/** Drops comments, leaving strings alone (a "/*" inside a string is not a comment). */
function stripComments(css) {
  let out = ''; let quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) { out += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) throw new Error('theme-check: an unclosed comment');
      i = end + 1; out += ' '; continue;
    }
    out += c;
  }
  return out;
}

/** Top-level rules as [selector or at-rule prelude, body]. */
function* rules(css) {
  const text = stripComments(css);
  let i = 0;
  while (i < text.length) {
    const j = text.indexOf('{', i);
    if (j < 0) break;
    const sel = text.slice(i, j).trim();
    let depth = 1; let k = j + 1;
    while (k < text.length && depth) { if (text[k] === '{') depth++; else if (text[k] === '}') depth--; k++; }
    yield [sel, text.slice(j + 1, k - 1)];
    i = k;
  }
}

const ATTR = /\[([\w-]+)=(["']?)([^"'\]]*)\2\]/g;
const ROOT = /^(:root|html|body)((?:\[[\w-]+=(["']?)[^"'\]]*\3\]|\.[\w-]+|:not\(\.[\w-]+\))*)(?:\s+(\.[\w-]+))?$/;

/** A selector the model understands, or null. */
function parseSelector(sel) {
  const m = sel.trim().match(ROOT);
  if (!m) return null;
  const [, head, quals, , scope] = m;
  const attrs = Object.fromEntries([...quals.matchAll(ATTR)].map((x) => [x[1], x[3]]));
  const bare = quals.replace(ATTR, '');
  const nots = new Set([...bare.matchAll(/:not\(\.([\w-]+)\)/g)].map((x) => x[1]));
  const classes = new Set([...bare.replace(/:not\(\.[\w-]+\)/g, '').matchAll(/\.([\w-]+)/g)].map((x) => x[1]));
  // The looks are body classes; a class on :root or html isn't modelled.
  if (head !== 'body' && (classes.size || nots.size)) return null;
  const specClasses = Object.keys(attrs).length + classes.size + nots.size + (head === ':root' ? 1 : 0) + (scope ? 1 : 0);
  return { level: head === 'body' ? 1 : 0, attrs, classes, nots, scope: scope || null, spec: [specClasses, head === ':root' ? 0 : 1] };
}

const SETS_TOKEN = /(^|[;{\s])--[\w-]+\s*:/;

/**
 * Every rule on :root, html or body (optionally one descendant class) that
 * sets custom properties, in order. Throws on tokens it can't place.
 */
function tokenBlocks(css) {
  const blocks = []; let order = 0;
  for (const [sel, body] of rules(css)) {
    if (sel.startsWith('@') || sel.includes(';')) {
      if (sel !== '@font-face' && SETS_TOKEN.test(body)) throw new Error(`theme-check: tokens inside "${sel.slice(0, 60)}" aren't modelled`);
      continue;
    }
    const decls = {};
    for (const part of splitTop(body, ';')) {
      const m = part.match(/^\s*(--[\w-]+)\s*:([\s\S]*)$/);
      if (m) decls[m[1]] = m[2].trim().replace(/\s+/g, ' ');
    }
    if (!Object.keys(decls).length) continue;
    for (const one of splitTop(sel, ',')) {
      const p = parseSelector(one);
      if (!p) throw new Error(`theme-check: can't model the selector "${one.trim()}"`);
      blocks.push({ ...p, decls, order: ++order });
    }
  }
  return blocks;
}

const matches = (b, combo) =>
  Object.entries(b.attrs).every(([k, v]) => (combo.attrs || {})[k] === v)
  && [...b.classes].every((c) => combo.classes.has(c))
  && ![...b.nots].some((c) => combo.classes.has(c));

const VAR = /var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g;
const MAX_VALUE = 2048; // a resolved value longer than this is treated as invalid

/** Computed custom properties on body (or on a scoped descendant such as '.sheet'). */
function computed(blocks, combo, scope = null) {
  let env = {};
  const levels = [[0, null], [1, null]];
  if (scope) levels.push([2, scope]);
  for (const [depth, sc] of levels) {
    const raw = {};
    blocks
      .filter((b) => matches(b, combo) && (sc ? b.scope === sc : b.scope === null && b.level === depth))
      .sort((a, b) => a.spec[0] - b.spec[0] || a.spec[1] - b.spec[1] || a.order - b.order)
      .forEach((b) => Object.assign(raw, b.decls));
    const inherited = env;
    const memo = new Map();
    const resolving = new Set();
    const resolve = (name) => {
      if (!(name in raw)) return inherited[name] ?? null;
      if (memo.has(name)) return memo.get(name);
      if (resolving.has(name)) return null; // a cycle: invalid, as in a browser
      resolving.add(name);
      let val = raw[name];
      // Each pass resolves one level of fallbacks; referenced tokens come back resolved.
      for (let pass = 0; pass < 64 && val !== null && val.includes('var('); pass++) {
        // A var() of an invalid token with no fallback makes the whole value
        // invalid, as in a browser.
        let invalid = false;
        val = val.replace(VAR, (_, n, fb) => {
          const r = resolve(n);
          if (r !== null) return r;
          if (fb === undefined) invalid = true;
          return (fb || '').trim();
        });
        if (invalid || val.length > MAX_VALUE) val = null;
      }
      resolving.delete(name);
      memo.set(name, val);
      return val;
    };
    const next = { ...inherited };
    for (const name of Object.keys(raw)) next[name] = resolve(name);
    env = next;
  }
  return env;
}

// ── surfaces ────────────────────────────────────────────────────────

const GRADIENT_WORDS = /\b(?:repeating-)?(?:linear|radial|conic)-gradient\(|\b(?:at|to|top|bottom|left|right|center|circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner|from|none)\b|-?[\d.]+(?:%|deg|turn|rad|grad|px|em|rem|vw|vh)?/g;

/** Colors inside a background value (hex, rgb[a], color-mix, transparent), parsed. Throws on syntax it doesn't know. */
function colorsIn(value) {
  const found = []; const s = value || '';
  const re = /color-mix\(|rgba?\(|#[0-9a-f]{3,8}\b|\btransparent\b/gi; let m;
  let rest = '';
  let last = 0;
  while ((m = re.exec(s))) {
    let end = m.index + m[0].length;
    if (m[0].endsWith('(')) {
      let depth = 1;
      while (end < s.length && depth) { if (s[end] === '(') depth++; else if (s[end] === ')') depth--; end++; }
    }
    const c = parseColor(s.slice(m.index, end));
    if (!c) throw new Error(`theme-check: can't read the color "${s.slice(m.index, end)}"`);
    found.push(c);
    rest += s.slice(last, m.index) + ' ';
    last = end;
    re.lastIndex = end;
  }
  rest += s.slice(last);
  const unknown = rest.replace(GRADIENT_WORDS, ' ').replace(/[\s,()/]+/g, ' ').trim();
  if (unknown) throw new Error(`theme-check: can't read "${unknown.slice(0, 40)}" in "${s.slice(0, 80)}"`);
  return found;
}

/** Points a background can show behind text: see the header comment. */
function surfacePoints(value, backdrop) {
  const plain = parseColor(value);
  if (plain) return plain[3] < 1 ? backdrop.map((p) => over(plain, p)) : [plain.slice(0, 3)];
  const stops = colorsIn(value);
  const opaque = stops.filter((c) => c[3] >= 1).map((c) => c.slice(0, 3));
  const base = opaque.length ? opaque : backdrop;
  const glows = stops.filter((c) => c[3] > 0 && c[3] < 1);
  return [...base, ...glows.flatMap((g) => base.map((b) => over(g, b)))];
}

/** Everything the shared checks need, for one combination. */
function surfaces(blocks, combo) {
  const env = computed(blocks, combo);
  const color = (n) => (env[n] ? parseColor(env[n]) : null);
  const bgc = color('--bg');
  if (!bgc) throw new Error(`theme-check: ${combo.name}: --bg is "${env['--bg']}"`);
  const bg = bgc.slice(0, 3);
  const page = [bg, ...colorsIn(env['--scene']).filter((c) => c[3] >= 1).map((c) => c.slice(0, 3))];
  const sat = saturateAmount(env['--card-blur']);
  const backdrop = sat !== null
    ? [...page, ...page.flatMap((p) => [saturate(p, sat, false), saturate(p, sat, true)])]
    : page;
  const card = surfacePoints(env['--card-bg'], backdrop);
  const layer = (n, under) => surfacePoints(env[n], under);
  return {
    env, color, page, card,
    well: layer('--well-bg', card),
    track: layer('--track', card),
    modal: surfacePoints(env['--modal-bg'], page),
  };
}

// ── checks ──────────────────────────────────────────────────────────

/**
 * The shared tokens' checks. Each is [kind, foreground token, surface name].
 * kind 'text' needs 4.5:1, 'graphic' 3:1. A surface name is one of the
 * surfaces() lists, or 'token:--x' for a token used as a fill (a translucent
 * one is laid over the card).
 */
const STATUSES = ['--status-ok', '--status-watch', '--status-over'];
const SHARED_CHECKS = [
  ...['--ink', '--ink-soft', '--muted', '--link'].flatMap((t) => [['text', t, 'page'], ['text', t, 'card']]),
  ['text', '--muted', 'well'],
  ...STATUSES.map((t) => ['text', t, 'card']),
  ...STATUSES.map((t) => ['text', '--status-ink', `token:${t}`]),
  ['text', '--control-active-ink', 'token:--control-active-bg'],
  ['text', '--ink', 'modal'], ['text', '--muted', 'modal'],
  ...[...STATUSES, '--ink', '--chart'].map((t) => ['graphic', t, 'track']),
  ['graphic', '--chart', 'card'],
  ...['page', 'card', 'modal'].map((s) => ['graphic', '--focus', s]),
];

/**
 * Run checks for each combination. combos: [{ name, classes: Set, attrs? }].
 * extra(s, where, combo) lets a caller add its own surfaces: it returns an
 * array of points, or undefined for the built-in ones. Returns
 * { rows, failures } where each row is { combo, kind, what, worst, need, ok }.
 */
function check(css, combos, checks = SHARED_CHECKS, extra = () => undefined) {
  const blocks = tokenBlocks(css);
  const rows = [];
  for (const combo of combos) {
    const s = surfaces(blocks, combo);
    for (const [kind, fgTok, where] of checks) {
      const fg = s.color(fgTok);
      let under = extra(s, where, combo);
      if (!under && where.startsWith('token:')) {
        const v = s.env[where.slice(6)];
        under = v && (parseColor(v) || /gradient\(/.test(v)) ? surfacePoints(v, s.card) : null;
      }
      if (!under) under = s[where];
      if (!fg || !under || !under.length) {
        rows.push({ combo: combo.name, kind, what: `${fgTok} on ${where}`, worst: 0, need: 0, ok: false, note: 'not a color' });
        continue;
      }
      const need = kind === 'text' ? 4.5 : 3;
      const worst = Math.min(...under.map((u) => ratio(over(fg, u), u)));
      rows.push({ combo: combo.name, kind, what: `${fgTok} on ${where}`, worst, need, ok: worst >= need });
    }
  }
  return { rows, failures: rows.filter((r) => !r.ok) };
}

const MODES = { '': 'dark', 'light-mode': 'light', 'colorblind-mode': 'accessible' };

/**
 * Every look the CSS defines: Tactile (no class) plus each theme-* class it
 * mentions, crossed with modes ('' is dark, 'light-mode', 'colorblind-mode').
 * Derived from the CSS, so a new theme is checked without editing this file.
 */
function looks(css, modes = Object.keys(MODES)) {
  const themes = new Set(['']);
  for (const b of tokenBlocks(css)) for (const c of [...b.classes, ...b.nots]) if (c.startsWith('theme-')) themes.add(c);
  return [...themes].flatMap((theme) => modes.map((mode) => ({
    name: `${theme ? theme.slice(6) : 'tactile'}-${MODES[mode] || mode}`,
    classes: new Set([theme, mode].filter(Boolean)),
  })));
}

/**
 * Tokens-only lint for a theme file: what this repo promises to keep out of
 * it. An early warning here, not a security boundary (an app that copies the
 * file runs its own, stricter gate). Returns a list of problems.
 */
function lint(css) {
  const problems = [];
  let text;
  try { text = stripComments(css); } catch (e) { return [e.message]; }
  if (/!important/i.test(text)) problems.push('!important');
  for (const m of text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gs)) {
    if (!/^fonts\/[a-z0-9-]+\.woff2$/.test(m[2]) && !m[2].startsWith('data:image/svg+xml,')) problems.push(`url(${m[2].slice(0, 40)})`);
  }
  for (const [prelude, body] of rules(text)) {
    // statements such as @import end in ";" and run into the next selector
    const parts = prelude.split(';');
    const sel = parts.pop().trim();
    for (const st of parts) if (st.trim()) problems.push(st.trim().startsWith('@') ? `at-rule ${st.trim().split(/\s/)[0]}` : `stray text "${st.trim().slice(0, 30)}"`);
    if (sel.startsWith('@')) {
      if (sel !== '@font-face') problems.push(`at-rule ${sel.split(/\s/)[0]}`);
      continue;
    }
    for (const part of splitTop(body, ';')) {
      const d = part.trim();
      if (d && !d.startsWith('--')) problems.push(`"${sel}" sets ${d.split(':')[0].trim()}`);
    }
  }
  return problems;
}

module.exports = {
  parseColor, ratio, over, hex, saturate, saturateAmount, tokenBlocks, computed, colorsIn, surfaces, surfacePoints,
  check, looks, lint, SHARED_CHECKS,
};
