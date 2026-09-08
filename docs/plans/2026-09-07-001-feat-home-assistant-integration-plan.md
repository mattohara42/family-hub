---
title: Home Assistant Integration — Local Instance on the Panel Pi, Reached Over Tailscale HTTPS
type: feat
origin: BACKLOG.md § Smart Home → "Home Assistant integration"
date: 2026-09-07
status: planned
---

# Home Assistant Integration — Implementation Plan

**Scope:** Standard. Display and control a small, hand-picked set of Home Assistant entities from a sidebar widget. Read state, toggle lights and switches, lock and unlock locks. Everything else renders read-only.

**Depth:** 6 implementation units.

**Out of scope for v1:** thermostat setpoint control (Nest via HA `climate`), scenes and scripts, HA automations triggered from the hub, media players, camera streams, and the HA WebSocket API. Each is a follow-up once the plumbing is proven.

---

## Decisions Taken (2026-09-07, with Matt)

| Question | Decision | Why |
|---|---|---|
| Where does HA run? | Home Assistant **Container** (Docker) on the same Raspberry Pi that runs the kiosk browser | Only one Pi available. HA OS is an appliance image and cannot run a desktop browser, so a shared box means Raspberry Pi OS plus HA in Docker. |
| How does the hub reach HA over HTTPS? | **Tailscale Serve** on the Pi, giving a real cert on a `*.ts.net` name | The hub is served from Netlify over HTTPS and browsers hard-block HTTPS pages calling `http://` LAN addresses. Tailscale is free, keeps traffic direct between devices, and works from phones off the home network. |
| Where does the HA token live? | `localStorage` per device, **never** Firestore | See "Credential handling" below. |
| Where does the rest of the config live? | Firestore `settings/homeAssistant`, following the existing `saveFsSetting()` pattern | Base URL and the entity allowlist are shared family config with no secret in them. |

---

## The Constraint That Shapes Everything

The hub runs from `https://<site>.netlify.app`. A stock Home Assistant install answers on `http://homeassistant.local:8123`. Three separate mechanisms each block that call:

1. **Mixed content.** Chrome refuses `http://` subresource requests from an HTTPS page.
2. **Our own CSP.** `connect-src 'self' https: http://localhost:8888` in `family-hub.html` permits any `https:` origin plus the Netlify dev port, and nothing else on plain HTTP.
3. **HA's CORS.** Home Assistant rejects browser calls from another origin unless that origin is listed in `http.cors_allowed_origins`. A CORS rejection surfaces in JS as a bare `TypeError`, indistinguishable from "the host is down", which is why the error copy in U2 has to name both causes.

Tailscale Serve clears (1) and (2) for free: a `https://familypi.<tailnet>.ts.net` base URL is already permitted by the blanket `https:` in our `connect-src`, so **no CSP change is required for the production path**. (3) is a one-line addition to HA's `configuration.yaml`, covered in the setup guide.

The cost of the Tailscale choice: every device that controls HA has to be in the tailnet. The Pi panel and Matt's phone, realistically. A guest phone on the house wifi cannot use the smart-home widget. That is a deliberate trade, and it is also the security boundary that makes a full-control token on a wall panel tolerable.

### An untested shortcut worth five minutes on the real Pi

Because HA will run on the *same machine* as the kiosk browser, the panel could in principle call `http://localhost:8123` directly and skip the network entirely. Chrome treats `http://localhost` as a potentially trustworthy origin, so I *believe* it is exempt from mixed-content blocking even on an HTTPS page. I have not verified this, and Chrome's Private Network Access preflight (`Access-Control-Request-Private-Network`) may reject the request anyway depending on the Chromium version shipped with Raspberry Pi OS.

**Do not design around it.** The plan uses one configurable base URL, which is the `ts.net` name on every device including the Pi. `http://localhost:8123` is added to the dev CSP in U2 so the hypothesis can be tested cheaply against the mock server, and if it holds it becomes a documented fallback for "Tailscale is down but the house still needs lights", not the primary path.

---

## Credential handling

An HA long-lived access token is a house key. Home Assistant has no per-entity permission model, so any token can see and operate every entity its user can. Three rules follow:

1. **Create a dedicated non-admin HA user for the panel** (`wall-panel`) and generate the token as that user. A non-admin cannot edit HA's own configuration, so a compromised panel cannot rewrite automations or add users.
2. **The token is per-device and stays in `localStorage` under `fh_haToken`.** It is deliberately excluded from the Firestore settings sync. The Firestore rules are email-allowlisted to family accounts, so syncing it would not be reckless, but a per-device token is individually revocable from HA's profile page. Losing a phone then costs one token, not the house. Pasting a token once per device is a small price for that.
3. **The entity list is an allowlist, not a filter.** The widget only ever renders entities the config names. Nothing is discovered into the UI implicitly.

---

## Implementation Units

### U1 — State, config, persistence

```js
const HA_DEFAULTS = { baseUrl: '', entities: [] };   // entities: [{ id, name }]
let haConfig = { ...HA_DEFAULTS, ...lsGet('fh_haConfig', {}) };
let haToken  = localStorage.getItem('fh_haToken') || '';   // per-device, never synced
let haStates = {};                                          // entity_id → state object
```

- `haConfig` syncs through the existing single-doc pattern: `saveFsSetting('homeAssistant', 'fh_haConfig', haConfig)` on write, an `onSnapshot` on `settings/homeAssistant` in `attachFirestoreListeners()`, and an entry in the one-time localStorage migration list.
- `haToken` is read and written directly, with no Firestore path at all.
- `haNormalizeBaseUrl(url)` trims whitespace and any trailing slash, and rejects a bare hostname or an `http://` origin other than localhost with an explanatory message rather than saving something that can only fail later.

### U2 — Fetch layer and error taxonomy

`haFetch(path, opts)` mirrors what `calFetch()` does for Google: one place that attaches auth, enforces a timeout, and normalizes failure.

- `Authorization: Bearer ${haToken}`, `Content-Type: application/json`.
- `AbortController` at 10s. HA on a LAN answers in milliseconds; 10s already means something is wrong.
- Throws typed errors so the card and the settings panel can say something true:

| Condition | Message |
|---|---|
| No `baseUrl` or no token | "Not configured yet." Card shows a setup prompt, no request made. |
| `401` | "Home Assistant rejected the token. Generate a new one in HA → your profile → Security." |
| `404` on an entity | "Entity not found. Check the entity ID in HA → Developer Tools → States." |
| `TypeError` / abort | "Couldn't reach Home Assistant. Either it's offline (or Tailscale is down), or its `cors_allowed_origins` doesn't list this page." Both causes named, because the browser will not tell us which. |

Add `http://localhost:8123` to the `connect-src` in `family-hub.html`, alongside the existing `http://localhost:8888`, so the mock server (U6) is reachable in local dev. It grants nothing beyond the user's own machine, and it is the same precedent the Netlify dev port already set.

### U3 — Widget card and polling

- `#haCard` sidebar card, header `🏠 Home`, refresh button, matching the `#newsCard` / `#stockCard` shape.
- `refreshHaStates()` fetches `/api/states/<entity_id>` per allowlisted entity via `Promise.allSettled`, not the full `/api/states`. A handful of tiny requests beats one response carrying every entity in the house, and it isolates a single bad entity ID from blanking the card.
- Poll every 120s, plus once on `visibilitychange` back to visible. Skipped entirely when the widget is hidden or unconfigured.
- Rendering keys off the entity domain: `light`, `switch`, `fan`, `input_boolean` get a toggle; `lock` gets a Lock/Unlock button; everything else renders its state text read-only. `unavailable` and `unknown` render dimmed and disable the control.
- Registry wiring per the CLAUDE.md checklist: `WIDGET_DEFAULTS` (`homeassistant: false`, off by default since it is useless unconfigured), `WIDGET_PLACEMENT_DEFAULTS`, `WIDGET_ORDER`, `MOBILE_TABS` with a `menu` entry.

### U4 — Controls

`haCallService(domain, service, entityId)` POSTs to `/api/services/{domain}/{service}` with `{ entity_id }`.

- Optimistic UI: flip the row immediately, then re-fetch that one entity after 1s to confirm. HA state changes are not instant for every device (a Z-Wave lock takes seconds), so the row shows a pending state rather than snapping back if the first re-fetch still reads the old value. Second re-fetch at 5s, then give up and let the poll catch it.
- A failed call reverts the row and toasts through the existing `showToast()`.

### U5 — Settings panel

New `data-panel="homeassistant"` panel, plus a `{ tab: 'homeassistant', label: '🏠 Home Assistant' }` entry under the **Widgets** group in `SETTINGS_GROUPS`.

- Base URL field, token field (`type="password"`, with a "stored on this device only" note).
- **Test connection** button: calls `GET /api/`, reports the specific failure from U2's taxonomy on failure, and on success also fetches `/api/states` once to populate a `<datalist>` of every entity ID in the house. Typing `light.kitchen_ceiling_2` correctly from memory is otherwise miserable, and this is the cheapest possible fix for it: no new modal, one extra request, only on an explicit button press.
- Entity list editor: add by ID plus optional label, remove, following the `lc-list` / `lc-add-row` markup the news feeds panel uses.
- `saveSettings()` persists then `closeSettings()` before any re-render, per the existing rule.

### U6 — Mock server, tests, docs

- `tests/ha-mock.js`: a dependency-free Node HTTP server implementing `/api/`, `/api/states`, `/api/states/<id>`, and `/api/services/<domain>/<service>`, with CORS headers and flags to simulate a 401 and an unavailable entity. Run it, point a local hub at it, and the whole feature is exercisable with no Pi in the room.
- `tests/home-assistant.test.js`: golden tests for the pure helpers (`haNormalizeBaseUrl`, `haEntityDomain`, `haServiceForToggle`, `haFormatState`), mirrored into the test file per the existing "deliberate duplication" convention used by `event-shift.test.js` and `meal-image.test.js`.
- `family-hub-setup.md` gains a Home Assistant section (written first, since Matt needs it before any of this is testable against something real).
- `FEATURES.md` gains the function/state/anchor inventory. `BACKLOG.md` entry marked done, and the WiZ bulb entry updated to point at the shipped integration.

---

## Risks and open questions

**SD card wear.** HA's recorder writes to SQLite continuously. On a Pi booting from an SD card that is the likeliest hardware failure, and it takes the wall display down with it. Mitigation in the setup guide: boot from a USB SSD, or set `recorder: purge_keep_days: 3` and exclude chatty entities. Worth deciding before the Pi has a month of history on it.

**Coupling the panel to house infrastructure.** One Pi now runs both the family-visible display and the thing that controls the lights. A hung HA upgrade takes out the calendar; a browser memory leak takes out the lights. Acceptable to start, and the honest exit is a second Pi (or moving HA to a NAS) once it earns its keep. Flagging it now so it is a known trade rather than a surprise.

**Tailscale on every controlling device.** Guest phones cannot use the widget. If that turns out to matter, the answer is Nabu Casa, not poking a hole in the firewall.

**Pi resource headroom.** HA Container idles around 1GB RAM and Chromium in kiosk mode wants most of another. A 4GB Pi 4 should be fine, a 2GB one will thrash. Confirm the model before assuming.

**HA Container has no Supervisor.** No add-on store and no built-in backup. Tailscale gets installed natively on Raspberry Pi OS instead (which is simpler anyway), and backups become a periodic tar of the config volume. Noted in the setup guide.
