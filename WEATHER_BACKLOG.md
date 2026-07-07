# Weather Widget — Backlog

*High-effort enhancements for the Weather widget, ordered by priority. Constraints: OpenWeatherMap **free tier v2.5** only, three-file no-build architecture, CDN scripts only.*

Last updated: 2026-07-06

---

## Already Shipped (for reference)

Current conditions · feels-like · today hi/lo · rain % · animated condition icons · condition-based card tint · activity tags · compass/wind direction · humidity + visibility ticker · 5-day / hourly toggle · hourly precip bars · air quality index (AQI) · sunrise/sunset times.

**Key files:** `loadWeatherByCity()`, `renderWeatherData()`, `renderWeatherTicker()` in `family-hub.js`; `.wx-*` rules in `family-hub.css`; `#weatherCard` in `family-hub.html`.

---

## ✅ RESOLVED — Dead Alert Slot

*(Was: the ticker read `cur.alerts` from the free `/weather` endpoint, which never returns alerts.)* Fixed by **H1** below — `data.alerts` is now populated from the NWS API.

---

## ✅ DONE — H4: Sun-Path Arc  (shipped 2026-06-04)

**Shipped:** An SVG arc in the weather card showing the sun's current position between sunrise and sunset, with sunrise/sunset end labels, a daylight-remaining readout, and a golden-hour state. Optional — toggled in **Preferences → Weather → "Sun-path arc"** (on by default).

**States (all verified in-browser):**
- **Daytime** — golden progress arc from sunrise to a glowing, pulsing sun dot at its real position; dimmed remaining track; "☀️ Xh Ym of daylight left".
- **Golden hour** — within 1h of sunrise/sunset the sun dot tints warm orange + 🌇 emoji.
- **Night** — dotted track only, no sun dot; 🌙 "Sunrise in Xh Ym" (pre-dawn) / "Sunset was Xh Ym ago" (post-dusk).

**Implementation:**
- `renderSunArc(data)` in `family-hub.js` — pure local compute, no extra API call. Respects `sunArcEnabled`.
- Data: added `sunriseTs` / `sunsetTs` (raw epochs) + `tzOffset` to the weather data object in `loadWeatherByCity()`; called from `renderWeatherData()`.
- Setting: `sunArcEnabled` state, `fh_sunArc` localStorage key, toggle in the Weather settings panel wired through `openSettings()` / `saveSettings()`.
- CSS: `.wx-sun-*` section with `wxSunPulse` glow animation and light/nautical theme variants.
- HTML: `#wxSunArc` container between the hi/lo row and details.

---

## ✅ DONE — H1: Real Severe-Weather Alerts  (shipped 2026-06-04)

**Shipped:** Live warnings from the U.S. National Weather Service (`api.weather.gov` — free, keyless), shown in the weather ticker, replacing the old dead slot.

**Implementation:**
- `fetchNwsAlerts(lat, lon)` in `family-hub.js` — `GET /alerts/active?point={lat},{lon}` (the point-query path; no separate `/points` lookup needed). Returns `[{ event, headline, severity }]`, sorted by severity (Extreme→Unknown). Never throws — returns `[]` on any failure.
- Wired into `loadWeatherByCity()` alongside the AQI/geo fetch (independent, so it can't break them); result stored as `data.alerts`.
- `renderWeatherTicker()` renders alert segments first, **bold and colored by severity** (Extreme/Severe red, Moderate orange, Minor/Unknown yellow).

**Notes:** US-only — non-US points return `[]` and degrade silently. NWS asks for a `User-Agent`, but browsers forbid setting that header; requests still succeed and the API sends permissive CORS. Alerts ride the existing 30-min weather cache.

**Verified:** CORS/endpoint 200; real NWS data parsed (13 TX alerts, "Flash Flood Warning"/Severe, correct severity sort); ticker shows bold colored ⚠️ segments; alert-free location degrades silently; no console errors.

**Possible follow-up:** a more prominent alert banner (above the card) for Extreme/Severe, beyond the scrolling ticker.

---

## ✅ DONE — H3: 24-Hour Temperature Curve  (shipped 2026-06-06)

**What:** SVG smooth cubic-bezier temperature curve for the next ~48h, as a third forecast mode alongside 5-day and Hourly.

**Implementation:** `renderTempCurve(slots)` — pure SVG, no dependency. Smooth bezier curve + gradient fill + blue precip bars. Labels at slot 0, noon/midnight boundaries, and last slot. `tempSlots` added to weather data object; **Curve** button in toggle strip. CSS `.wx-curve-*` with light/nautical theme variants.

---

## ✅ DONE — H2: Precipitation Radar Map

Leaflet radar panel in the weather card, using **RainViewer** tiles (keyless) instead of the originally-planned OWM tiles — `api.rainviewer.com/public/weather-maps.json` + `tilecache.rainviewer.com` overlay on a base map (`family-hub.js:4478+`, `renderRadarPanel()`).

---

## ✅ DONE — H5: Geolocation Auto-Detect

📍 button uses `navigator.geolocation.getCurrentPosition()` → keyless reverse geocode via **BigDataCloud** (`REVERSE_GEOCODE_BASE`, not OWM) → adds the resolved city to `weatherLocations[]`; handles permission-denied (`family-hub.js:3890+`).

---

## Priority 6 — H6: Weather-Reactive Dashboard Background

**What:** When no background photo is set, tie `#bgPhoto`'s gradient/animation to current conditions (sunny warm gradient, rainy cool gradient, etc.).

**Approach:** Extend the existing card-tint map to a full-viewport gradient applied to `#bgPhoto` when `bgPhotos.length === 0`. Touches global background, not just the card — coordinate with photo slideshow logic.

**Acceptance:** Background reflects conditions only when no photo is active; photo mode is unaffected.

---

## ✅ DONE — Bonus: Moon Phase  (shipped 2026-06-06)

**Implementation:** `getMoonPhase(date)` — synodic-month formula anchored to a known new moon (2000-01-06). Returns `{ emoji, name }` for one of 8 phases (🌑🌒🌓🌔🌕🌖🌗🌘). No API call, no dependency. Appended to the weather ticker after sunrise/sunset on every render.

---

## Notes & Constraints

- **No paid endpoints.** One Call API (UV index, native alerts, minutely precip) is excluded — it now requires a separate paid subscription.
- **No build step.** Any library must be a CDN `<script>`/`<link>` and respect the CSP in `family-hub.html`.
- **Three themes.** Every visual feature must look correct in dark, light, and nautical modes.
- **Card layout discipline.** New panels must not cause layout shift or break the sidebar/bottom-strip flex sizing.
