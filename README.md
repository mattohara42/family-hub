# Pond Chimes

An ambient, self-playing pond that sings when you tap the fish. A screensaver with a voice.

Single HTML file, no build step — Tone.js + Canvas. Open `index.html` in a browser (or serve the folder statically) and tap the pond to wake it.

## How it plays

Everything is locked to D major pentatonic, so any combination of taps sounds intentional.

- **Fish** — drift on lazy paths; tap one and it darts, a ripple expands, and a kalimba-style pluck plays. Pitch comes from the fish's Y position at tap time (higher on screen = higher note).
- **Lily flowers** — tap to open or close. Each toggle plays a soft chord swell, and every open flower holds its chord tone in a low drone under the pond.
- **Frogs** — sit on lily pads; tap one and it hops to a free pad, landing with a splash and a plucked bass-guitar note that rings on a moment (pitch from the landing pad's height). Left alone they croak softly now and then.
- **Dragonflies** — skim across the surface; tap one and it dashes away with a quick high shimmer arp. They occasionally dip to the water with a tiny ripple and a single sparkle note.
- **Hummingbird** — a rare visitor. Every minute or so it flies in from the edge to hover at a lily flower with a soft tremolo trill (the pond's highest register). Tap it and it startles away with a brighter trill.
- **Lily pads** spread across the right side of the pond — the still water, away from the shore — staggered so they barely overlap. Several carry water-lily flowers (tap one to open/close it).
- **Shore** — the left side is a stony bank: a packed bed of small stones with big smooth boulders resting on top as the shoreline; the open water begins to their right. The stone line is uneven — thicker in places, tighter in others — and wraps a little along the bottom. The rocks cast shade on the water, and on a hot day (from the live temperature) the fish drift over to loiter in the cool. Rocks are permanent — they poke up through the winter ice.
- **Water plants** — tall, wide-leaf clumps (think pickerelweed / canna), varied in height and colour, rise up among the rocks to break up the frame — with a few more standing out in the open water on the right. They sway with the wind, take on the season's colour, and die back with the lily pads in deep winter.
- **Water flow** — a gentle current runs the way the real pond does: the surface drifts down toward the pump intake at the bottom-right, which dimples the far corner. The caustic light and any drifting petals or leaves ride the current. Kept subtle, so the pond still feels calm.
- **Bare water** — still ripples, with a very quiet note so every touch answers.
- **Idle mode** — left alone, fish surface and sing, frogs croak and occasionally wander to a new pad, dragonflies dip, and the hummingbird drops by. The pond self-plays as gentle ambient background.
- **Day/night** — the water colour follows the real local clock. It keeps its moonlit identity: deep teal-black at night with faint star reflections, brightening only to a soft overcast teal by day, with a warm low-sun rake across the surface at dawn and dusk. No network needed — it reads the device clock, so it works offline.
- **Weather** — if a location is available, the pond quietly pulls current conditions and lets the real sky bleed in: cloud cover greys the water and hides the sun and stars, rain stipples the surface with dimples, wind roughens it and stirs the fish, and snow drifts down. It's a soft overlay on the day/night sky, not a mode switch. Silent by design — weather only touches the visuals.
- **Seasons** — the pond also drifts through the year on the real calendar date. A gentle tint warms or cools the water, the lily pads take on the season's colour (fresh green in spring, lush in summer, olive-brown in autumn, dull in winter), blossom petals fall in spring and leaves in autumn, and the cold quiets the dragonflies and frogs. In spring a little school of **baby fish** appears among the adults (tap near them and they scatter). As winter closes in the pond winds down for the season: the lily pads die back, the frogs settle in to hibernate, and the dragonflies vanish — until only the fish are left, drifting slow and dim beneath a translucent **sheet of ice** that freezes over the surface. Everything eases back to life as it warms. Hemisphere-aware and always gradual, so the pond's identity holds year-round.

- **Discoveries** — rare creatures the pond reveals only under the right real-world conditions, each with its own voice:
  - **Fireflies** drift and blink on a warm summer night.
  - A **painted turtle** climbs the shore rocks to bask on a hot day.
  - A **great blue heron** glides in at dawn and stands stock-still (the fish scatter when it lands and lifts off), with a lonely flute call.
  - A **mallard** paddles across on an overcast or rainy day, dabbling and leaving a wake.
  - A **cardinal** — a bright red spot on a cold winter day, perching on the shore and whistling.
  - **Bats** flit over the water at dusk with faint high ticks.
  - A **rainbow koi** — a patience reward: a big, shimmering fish that surfaces only after the pond's been running a long while, leaping with a warm chord.
  - **Swallows** swoop low and skim the surface on a windy day.
  - A **swan** glides serenely across a still, foggy morning.
  - A **shooting star** streaks across a clear night, mirrored on the water.
  - A **rabbit** (light brown) visits the water's edge at dawn or dusk.
  - A **kingfisher** — a rare flash of blue that perches over the water and plunge-dives.

  The first time you see one, a soft "field guide" card fades its name in (remembered afterwards, so it stays special). More will keep joining the roster.

Audio starts on the first tap (browser autoplay rules); until then the pond is silent but alive.

## Birthdays

On a family birthday, that person's favourite animal comes to the pond all day, with a "Happy birthday, NAME!" card — a private little surprise. The list lives in the `BIRTHDAYS` array near the discoveries in `index.html` (name, month, day, and which animal). Current visitors: a bunny family, a duck family, a breaching narwhal, the blue heron, and a flamingo. Because it reads the real device clock, no setup is needed — it just happens on the day.

## Seeing the discoveries on demand (hidden)

Discoveries wait for their real-world moment (a summer night, a hot afternoon), which is lovely on a wall panel but hard to demo. There's a hidden way to summon them: **press and hold on the stony left shore** (about a second). Each hold summons the next discovery right away — regardless of the weather or season — and replays its card, cycling through the whole roster. It's the test-and-re-show tool; a normal short tap on the shore does nothing special.

## Weather setup (optional)

Weather is off until it knows where the pond is. It looks, in order:

1. **URL** — `index.html?lat=42.36&lon=-71.06` (easiest for a kiosk / wall panel).
2. **Baked in** — set `FIXED_LOCATION = { lat: …, lon: … }` near the top of the weather block in `index.html`.
3. **Browser geolocation** — prompts once; needs `https` (or `localhost`).

If none resolve — or there's no network — the pond simply runs on the day/night cycle alone. Conditions come from [Open-Meteo](https://open-meteo.com/) (free, no API key), refreshed every 10 minutes.

## Status

**v1.0.0** — the first tagged release, covering everything below. The pond is complete and playable; the deferred items are polish, not missing pieces.

**M3** — the full pond ensemble: fish (melody) + lily pads (harmony) + frogs (bass) + dragonflies (sparkle) + hummingbird (rare treat), with self-playing idle behavior for each, per the approved mockup and concept doc.

**M4** — a day/night cycle driven by the real local clock, in the moonlit palette range.

**M5** — live outdoor weather (cloud cover, rain, wind, snow) via Open-Meteo (no API key), overlaid on the day/night sky and degrading gracefully to time-of-day only when there's no location or network.

**M6** — seasons on the real calendar date (hemisphere-aware): seasonal water tint, lily-pad colour, drifting spring petals / autumn leaves, cold-quieted dragonflies and frogs, a spring school of baby fish, and a winter ice sheet with the fish drifting slow beneath it. Completes the "pond mirrors the world outside" trio with day/night and weather.

**M7** — pond layout & flow: lily pads spread across the right side (staggered, low overlap, several flowering); a left-side stony shore (a bed of small stones with big boulders on top, uneven and wrapping a little along the bottom) that casts shade the fish loiter in on a hot day (live temperature); tall, varied wide-leaf water plants along the shore and a few in the open water; and a gentle drift toward the bottom-right pump intake that the caustics and drifting foliage ride. Adds real pond-edge character.

**M8 (in progress)** — discoveries: twelve (so far) rare creatures revealed by real-world conditions, each with its own voice — fireflies (summer night), painted turtle (hot day), great blue heron (dawn), mallard (overcast/rain), cardinal (winter day), bats (dusk), rainbow koi (patience/long uptime), swallows (windy), swan (still foggy morning), shooting star (clear night), rabbit (dawn/dusk) and kingfisher (a rare diving flash) — with a first-sighting "field guide" card remembered in `localStorage`. A hidden press-and-hold on the shore summons and cycles them on demand for testing / re-showing. The registry makes adding more easy.

Deferred: feeding mechanic, more discoveries, settings UI, optional weather/season sound.

## Notes

- `vendor/Tone.js` is the Tone.js v15.1.22 UMD build, vendored so the toy works with no CDN dependency (kiosk-friendly).
- Sibling projects: The Grid Sings, Chord Garden.

## License

Pond Chimes is released under the [MIT License](LICENSE) — use it, change it, ship it, just keep the copyright notice.

Bundled third-party code: `vendor/Tone.js` is [Tone.js](https://tonejs.github.io/) by Yotam Mann, also MIT licensed — its notice is kept alongside it in `vendor/Tone.js.LICENSE.txt`.
