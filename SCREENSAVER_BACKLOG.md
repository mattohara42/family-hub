# Screensaver / Ambient Mode — Backlog

*Idle-triggered full-screen photo screensaver for the wall-mounted display, with photos pulled from a variety of services. Constraints: three-file no-build architecture, CDN scripts only, CSP in `family-hub.html` must be extended per photo source (`img-src` currently includes `'self'`).*

Last updated: 2026-07-06

---

## Existing groundwork (reuse, don't rebuild)

- **Background photo slideshow** — `bgPhotos[]` object URLs from IndexedDB blobs, `startSlideshow()`, `slideInterval` / `fh_slideInterval`, Google Photos Picker import (requires `Authorization: Bearer ${googleToken}` when downloading — see Photos Picker 403 gotcha in CLAUDE.md).
- **TV mode** (`fh_tvMode`, `?tv=1`) — the display-oriented mode the screensaver should cooperate with.
- **Netlify function proxy pattern** — `netlify/functions/ics.js` shows how to proxy CORS-restricted feeds; some photo services will need the same.

---

## S1 — Core screensaver (idle → full-screen slideshow)

After N minutes without pointer/touch/key activity, fade to a full-screen photo layer; any interaction wakes back to the dashboard instantly.

- Idle timer reset on `pointerdown` / `pointermove` (throttled) / `keydown` / `touchstart`; pause when `document.hidden`.
- Full-viewport overlay (`#screensaver`, `position: fixed`, `z-index` above everything, opacity fade in/out) cycling the merged photo pool.
- Settings → new "Screensaver" panel: enable toggle, idle minutes, per-photo dwell seconds, clock overlay on/off.
- State: `fh_saver` (bool), `fh_saverIdleMin`, `fh_saverDwellSec`. Follow the Adding-a-Feature checklist (openSettings/saveSettings wiring, FEATURES.md).
- Burn-in protection for the wall display: slow Ken Burns pan/zoom on each photo and drift the clock position a few px per cycle.

## S2 — Photo source adapters (the "variety of services" part)

One small adapter interface so sources are pluggable:

```js
// { id, label, configured(): bool, listPhotos(): Promise<{url, caption?}[]> }
```

Merged pool cached in IndexedDB (reuse the bg-photo store pattern) with a per-source refresh timestamp. Suggested order:

| Priority | Source | Method | Notes |
|---|---|---|---|
| 1 | Local / already-imported photos | IndexedDB | Free — this is `bgPhotos` today |
| 2 | Google Photos (Picker) | Existing OAuth flow | Picker sessions are user-initiated; periodic re-pick, can't auto-sync an album. Needs Bearer header on download |
| 3 | iCloud Shared Album | Public web-album JSON (`sharedstreams` endpoint) | Keyless, but CORS-blocked → Netlify proxy function like `ics.js` |
| 4 | Immich / self-hosted | REST + API key | Best "family photo server" answer; key in Settings, never committed |
| 5 | Ambient art fallbacks | Bing image of the day (keyless), NASA APOD, Unsplash (key) | For households with no photo source configured |

Each enabled source adds its host to the CSP `img-src` (or is routed through the proxy so everything stays same-origin).

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
- Is Immich actually in the family's stack, or should priority 4 be a generic WebDAV/URL-list adapter instead?
