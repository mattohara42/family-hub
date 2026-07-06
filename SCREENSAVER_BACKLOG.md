# Screensaver / Ambient Mode — Backlog

*Idle-triggered full-screen photo screensaver for the wall-mounted display, with photos pulled from a variety of services. Constraints: three-file no-build architecture, CDN scripts only, CSP in `family-hub.html` must be extended per photo source (`img-src` currently includes `'self'`).*

Last updated: 2026-07-06

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

## S3 — Ambient info overlay ("Nest Hub" mode)

Optional overlay on the screensaver: large clock, current temp (reuse Open-Meteo data already in memory), and the next calendar event. Night hours (configurable) switch to a dim clock-only mode.

## S4 — Scheduling & TV-mode integration

- Auto-start screensaver on a schedule (e.g. 22:00–06:00) independent of idle.
- In TV mode, shorten the idle threshold (the display is rarely touched).
- Wake-on-event: pop out of the screensaver briefly when a calendar reminder or timer fires.

---

## Open questions

- Should the screensaver replace the existing *background* slideshow or coexist with it (same pool, two consumers)? Leaning: same pool, two consumers.
- Photo pool size cap for IndexedDB on the target device?

*(Resolved 2026-07-06: Google Photos is the only photo service in the stack — see S2.)*
