# Screensaver / Ambient Mode — Backlog

*Idle-triggered full-screen photo screensaver for the wall-mounted display, with photos pulled from a variety of services. Constraints: three-file no-build architecture, CDN scripts only, CSP in `family-hub.html` must be extended per photo source (`img-src` currently includes `'self'`).*

Last updated: 2026-10-28

---

## Existing groundwork (reuse, don't rebuild)

- **Background photo slideshow** — `bgPhotos[]` object URLs from IndexedDB blobs, `startSlideshow()`, `slideInterval` / `fh_slideInterval`, Google Photos Picker import (requires `Authorization: Bearer ${googleToken}` when downloading — see Photos Picker 403 gotcha in CLAUDE.md).
- **TV mode** (`fh_tvMode`, `?tv=1`) — the display-oriented mode the screensaver should cooperate with.
- **Netlify function proxy pattern** — `netlify/functions/ics.js` shows how to proxy CORS-restricted feeds; some photo services will need the same.

---

## ✅ DONE — S1: Core screensaver (idle → full-screen slideshow)  (shipped 2026-07-06)

**Shipped:** idle-triggered full-screen slideshow of the `bgPhotos` pool with Ken Burns pan/zoom (4 keyframe variants, duration = dwell + 4s), 1.5s crossfades, and an optional clock overlay (time + date) that drifts ±30px every 10s for burn-in protection. Any interaction (`pointerdown`/`pointermove` throttled/`keydown`/`touchstart`/`wheel`) wakes it instantly — the overlay swallows the waking tap. Doesn't start with an empty photo pool or hidden tab; stops on `visibilitychange`. Settings in Look & Feel → Screensaver (enable, idle minutes 1–240, dwell seconds 5–600, clock toggle). Keys: `fh_saver`, `fh_saverIdleMin`, `fh_saverDwellSec`, `fh_saverClock`. Full function/anchor map in FEATURES.md §19.

## ✅ DONE — S2 (primary path): screensaver-grade Google Photos pipeline  (shipped 2026-07-06)

**Shipped:**
- **Bigger pool:** imports are now *additive* — Picker picks and local uploads join the existing pool instead of replacing it; `BG_MAX_PHOTOS = 200` cap with oldest-first eviction (`evictBgOverflow()`, auto-increment ids = import order). Picker `mediaItems` fetch paginates (`nextPageToken`) instead of truncating at 100.
- **Re-pick UX:** every import stamps `fh_photosImportedAt`; Settings shows "✓ N image(s) in the pool · updated X days ago" with an accent-colored re-pick prompt past 30 days.
- **Quality:** downloads at `=w2560-h1440` (was `=w2048`), 4 concurrent download workers.

**Secondary (optional, still open):** a single generic adapter interface so a future source can slot in without rework —

```js
// { id, label, configured(): bool, listPhotos(): Promise<{url, caption?}[]> }
```

with keyless ambient fallbacks (Bing image of the day, NASA APOD) as the only other planned implementations, for days when the local pool is empty. Any remote source either gets its host added to the CSP `img-src` or is routed through a Netlify proxy function (the `ics.js` pattern). iCloud/Immich/Unsplash adapters: dropped — not in the family's stack.

## ✅ DONE — S3: Ambient info overlay ("Nest Hub" mode)  (shipped 2026-07-06)

**Shipped:** optional info line under the clock — current temp (reuses the in-memory Open-Meteo payload via the new `lastWxData` global) and the next calendar event (`getNextCalendarEvent()`: soonest timed event later today across enabled calendars, else tomorrow's first event; skips holidays and disabled calendars). Configurable night window (default 22:00–06:30, handles midnight wrap) switches to a dim clock-only mode: photo layers are dropped (no overnight 2.5K decodes), cycling pauses, info hides, clock dims to 35% and shows even if the clock toggle is off; photos resume when the window ends. Settings: "Weather & next event" toggle, "Night dimming" toggle + from/to time inputs. Keys: `fh_saverInfo`, `fh_saverNight`, `fh_saverNightStart`, `fh_saverNightEnd`.

## ✅ DONE — S5: Pond Chimes as an alternative screensaver  (shipped 2026-08-25)

**Shipped:** a **mode** setting — the screensaver shows either the photo slideshow or [Pond Chimes](https://github.com/mattohara42/pond-chimes), the self-playing ambient pond.

- **Vendored, not forked.** `pond/` is a **git subtree** of `mattohara42/pond-chimes` (MIT), kept byte-identical so upstream work (M8 discoveries and beyond) comes back with one `git subtree pull`. Re-sync: `git subtree pull --prefix=pond https://github.com/mattohara42/pond-chimes main --squash`.
- **Same-origin iframe.** Keeps the pond's globals and its `html, body { height:100% }` reset in their own document. Created on start, destroyed on stop — that's what stops its rAF loop, its 10-min weather interval and its audio graph.
- **Two parent-side hooks, so the vendored file stays untouched:** `initAudio()` / `Tone.getDestination().mute` for sound, and hiding the pond's standalone `#title` card.
- **Shared location.** `lastWxData.lat/lon` go in as `?lat=&lon=`, so the pond skips its geolocation prompt and shows the same weather the hub does.
- **Tap behavior is a setting.** Pointer events inside the iframe never reach the hub's window listeners, so wake is explicit: `'play'` (default) leaves every tap to the pond and wakes on a keypress or the faint corner **Wake** button; `'wake'` restores slideshow behavior where any tap wakes.
- **Night window applies:** the pond is torn down overnight along with the photo layers.
- **Two infrastructure changes it needs:** CSP `frame-src 'none'` → `'self'` (`family-hub.html`), and `X-Frame-Options` `DENY` → `SAMEORIGIN` (`netlify.toml`) — cross-origin framing is still refused.

Keys: `fh_saverMode`, `fh_saverPondSound`, `fh_saverPondTap`. Full map in FEATURES.md §19.

**Still open:**
- **Pond is silent on the wall panel (investigated 2026-10-28, unresolved).** Fixed along the way, all Pi-side (`family-hub-setup.md` step 10c): sound was going to the USB mic instead of HDMI; Chromium now runs with `--autoplay-policy=no-user-gesture-required`; the uPerfect monitor mutes on silence, so an inaudible hum now keeps it awake. With those in place the Assistant's voice plays fine, but the pond was still silent at the last test. What's known:
  - The hub side works: in desktop Chromium the pond's Tone context runs unmuted and taps produce sound (peak ~0.1 of full scale). On the Pi, `wpctl status` showed a live Chromium stream going to HDMI at volume 1.0 while the pond was silent.
  - Chromium's own audio on the Pi 3 was unreliable: a 1-second Web Audio beep was inaudible while a 10-second one played, and in a ping test (`~/pingtest.html` on the Pi) quiet pings came out in bursts with gaps (3, pause, 3, pause, 2) while loud ones were all heard. The same pings played through `pw-play` were all heard.
  - Those tests ran *before* the permanent hum (a weaker temporary hum didn't help the pond). The monitor muting on quiet signals could explain the gaps too, so **the first thing to try is the pond again with the hum service running.** If it's still silent, next suspects are Chromium dropouts on the Pi 3's CPU (try a bigger PipeWire buffer: `pulse.min.quantum = 1024/48000` in `~/.config/pipewire/pipewire-pulse.conf.d/`), then making the pond louder from the parent.
- **Hub bug: a tap can't restart blocked pond audio.** `applySaverPondSound()` calls the pond's `initAudio()` on mount, which sets the pond's `audioReady = true` before `Tone.start()` is known to have succeeded. If the browser blocks autoplay, every later tap in the pond skips `initAudio()`, so the pond stays silent until the screensaver closes. Hidden on the panel by the autoplay flag, but real on any other browser. Fix from the hub side without touching `pond/`: in `wireSaverPondWake()`, add a `pointerdown` listener on the iframe document that calls `w.Tone.getContext().resume()`.
- **Upstream embed API.** Mute currently works by reaching into the pond's `Tone` instance. A small PR to pond-chimes adding `?mute=1` / a `postMessage` control surface would make that a supported seam rather than a same-origin trick.
- **Quiet hours for sound specifically** — right now the only options are night-window teardown or the sound toggle.

## S4 — Scheduling & TV-mode integration

- Auto-start screensaver on a schedule (e.g. 22:00–06:00) independent of idle.
- In TV mode, shorten the idle threshold (the display is rarely touched).
- Wake-on-event: pop out of the screensaver briefly when a calendar reminder or timer fires.

---

## Open questions

- Should the screensaver replace the existing *background* slideshow or coexist with it (same pool, two consumers)? Leaning: same pool, two consumers.
- Photo pool size cap for IndexedDB on the target device?

*(Resolved 2026-07-06: Google Photos is the only photo service in the stack — see S2.)*
