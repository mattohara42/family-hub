---
name: verify
description: Build/launch/drive recipe for verifying Pond Chimes changes end-to-end in a headless browser.
---

# Verifying Pond Chimes

Single static HTML file, no build step. Surface = browser canvas + Tone.js audio.

## Launch

```bash
python3 -m http.server 8791 --bind 127.0.0.1 &   # from repo root
npm install playwright-core                        # in scratchpad, not the repo
```

Drive with playwright-core + the pre-installed Chromium at
`executablePath: '/opt/pw-browsers/chromium'` (do NOT `playwright install`).

## Capturing audio evidence headless

You can't hear anything, but every voice goes through
`triggerAttackRelease`. After page load, wrap the prototypes and read back
`window.__triggers`:

```js
await page.evaluate(() => {
  window.__triggers = [];
  const wrap = (cls, name) => {
    const orig = cls.prototype.triggerAttackRelease;
    cls.prototype.triggerAttackRelease = function (...args) {
      window.__triggers.push(name + ':' + JSON.stringify(args[0]));
      return orig.apply(this, args);
    };
  };
  wrap(Tone.PolySynth, 'poly');  // fish, lilies, dragonflies, hummingbird, frogs
});
```

Every voice is a `PolySynth` now, so distinguish them by register: frogs are
the only ones in the D2–B2 bass octave, fish are D3–F#5 single notes, lily
swells are note arrays, dragonfly shimmer is D5–E6 (3-note runs), hummingbird
trill is D6–B6 (8 alternating notes). Frog croak = two-pulse bass pair; hop
landing = one bass note.

First `page.mouse.click(...)` counts as the user gesture that starts audio;
check `Tone.getContext().state === 'running'`.

## Finding moving creatures to tap

Top-level script consts (fish, frogs, hum…) are NOT on `window` — you can't
read positions via evaluate. Instead `getContext('2d')` (returns the live
context) + `getImageData`, and scan for signature colors: dragonfly body
`#7fd4c1`, hummingbird head `#c77fd4` / body `#8a5fb0`. Static targets can be
computed from PAD_SPOTS fractions (frogs sit ~10px above pad center).

## Gotchas

- Headless software raster runs ~11fps at 1280×800; the 0.05s dt cap means
  pond-time runs ~2× slower than wall-clock, so long idle timers (hummingbird
  spawn 20–40s) take up to ~80s real. Use a small viewport (640×400) to get
  fps up and timers near real-time.
- Idle events fire constantly (fish every 4–9s, croaks, dragonfly dips) —
  splice `__triggers` before each step or taps drown in ambient noise.
