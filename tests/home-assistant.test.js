// Golden tests for the Home Assistant helpers in family-hub.js
// (no-build monolith has no harness). Run: node --test tests/home-assistant.test.js
// ponytail: deliberate duplication so the entity/service logic has a runnable check.
//
// The four definitions below are spliced verbatim from family-hub.js. If you change
// them there, change them here. What they protect: which service call flips an
// entity (getting this wrong unlocks a door instead of locking it), and refusing an
// http:// base URL the browser would silently never call.

const test = require('node:test');
const a = require('assert');

const HA_TOGGLE_DOMAINS = ['light', 'switch', 'fan', 'input_boolean'];

function haEntityDomain(entityId) {
  const s = String(entityId || '');
  const i = s.indexOf('.');
  return i > 0 ? s.slice(0, i) : '';
}

function haServiceForToggle(entityId, state) {
  const domain = haEntityDomain(entityId);
  if (HA_TOGGLE_DOMAINS.includes(domain)) {
    return { domain, service: state === 'on' ? 'turn_off' : 'turn_on' };
  }
  if (domain === 'lock') {
    return { domain: 'lock', service: state === 'locked' ? 'unlock' : 'lock' };
  }
  return null;
}

function haFormatState(entityId, st) {
  if (!st) return '—';
  if (st.error) return st.error;
  const raw = st.state;
  if (raw === 'unavailable' || raw === 'unknown') return raw;
  const unit = st.attributes && st.attributes.unit_of_measurement;
  if (unit) return `${raw} ${unit}`;
  const word = { on: 'On', off: 'Off', locked: 'Locked', unlocked: 'Unlocked',
                 open: 'Open', closed: 'Closed', home: 'Home', not_home: 'Away' }[raw] || raw;
  // Thermostats read better with the current temperature alongside the mode.
  // The friendly word comes first so an off thermostat isn't the only 'off' in
  // the card rendered lowercase.
  if (haEntityDomain(entityId) === 'climate') {
    const cur = st.attributes && st.attributes.current_temperature;
    return cur != null ? `${word} · ${cur}°` : word;
  }
  return word;
}

function haNormalizeBaseUrl(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return { url: '' };
  if (!/^https?:\/\//i.test(s)) {
    return { error: 'Include the scheme, e.g. https://familypi.tail1234.ts.net' };
  }
  let u;
  try { u = new URL(s); } catch { return { error: "That doesn't look like a valid URL." }; }
  const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol === 'http:' && !isLocal) {
    return { error: "Family Hub is served over HTTPS, so the browser won't let it call a plain http:// address. Use the Tailscale https://….ts.net URL (setup guide, Step 6d)." };
  }
  return { url: s };
}

// ── Tests ──

test('haEntityDomain splits on the first dot only', () => {
  a.equal(haEntityDomain('light.kitchen'), 'light');
  a.equal(haEntityDomain('sensor.outside.temp'), 'sensor');
  a.equal(haEntityDomain('nodots'), '');
  a.equal(haEntityDomain('.leading'), '');
  a.equal(haEntityDomain(''), '');
  a.equal(haEntityDomain(null), '');
});

test('toggle domains flip on their current state', () => {
  a.deepEqual(haServiceForToggle('light.kitchen', 'on'),  { domain: 'light',  service: 'turn_off' });
  a.deepEqual(haServiceForToggle('light.kitchen', 'off'), { domain: 'light',  service: 'turn_on'  });
  a.deepEqual(haServiceForToggle('switch.coffee', 'off'), { domain: 'switch', service: 'turn_on'  });
  a.deepEqual(haServiceForToggle('fan.bedroom',   'on'),  { domain: 'fan',    service: 'turn_off' });
});

test('locks use lock/unlock, and an unknown state locks rather than unlocks', () => {
  a.deepEqual(haServiceForToggle('lock.front_door', 'locked'),   { domain: 'lock', service: 'unlock' });
  a.deepEqual(haServiceForToggle('lock.front_door', 'unlocked'), { domain: 'lock', service: 'lock'   });
  // Anything we can't read resolves to locking. Failing safe matters more here
  // than round-tripping the button label.
  a.deepEqual(haServiceForToggle('lock.front_door', 'unknown'),  { domain: 'lock', service: 'lock'   });
  a.deepEqual(haServiceForToggle('lock.front_door', undefined),  { domain: 'lock', service: 'lock'   });
});

test('everything else is display-only', () => {
  a.equal(haServiceForToggle('sensor.outside_temp', '54'), null);
  a.equal(haServiceForToggle('climate.hallway', 'heat'),   null);
  a.equal(haServiceForToggle('binary_sensor.garage', 'off'), null);
  a.equal(haServiceForToggle('notanentity', 'on'), null);
});

test('haFormatState prefers units, then domain shape, then a friendly word', () => {
  a.equal(haFormatState('sensor.outside_temp', { state: '54', attributes: { unit_of_measurement: '°F' } }), '54 °F');
  a.equal(haFormatState('climate.hallway', { state: 'heat', attributes: { current_temperature: 68 } }), 'heat · 68°');
  a.equal(haFormatState('climate.hallway', { state: 'off', attributes: {} }), 'Off');
  a.equal(haFormatState('light.kitchen', { state: 'on' }),  'On');
  a.equal(haFormatState('lock.front_door', { state: 'locked' }), 'Locked');
  a.equal(haFormatState('light.x', { state: 'unavailable' }), 'unavailable');
  a.equal(haFormatState('light.x', { error: 'not found' }), 'not found');
  a.equal(haFormatState('light.x', null), '—');
  // A state we have no friendly word for passes through rather than vanishing
  a.equal(haFormatState('media_player.tv', { state: 'playing' }), 'playing');
});

test('a climate reading of 0 still renders (guards against a falsy check)', () => {
  a.equal(haFormatState('climate.hallway', { state: 'heat', attributes: { current_temperature: 0 } }), 'heat · 0°');
});

test('haNormalizeBaseUrl strips trailing slashes', () => {
  a.deepEqual(haNormalizeBaseUrl('https://pi.tail1234.ts.net/'),   { url: 'https://pi.tail1234.ts.net' });
  a.deepEqual(haNormalizeBaseUrl('  https://pi.ts.net///  '),      { url: 'https://pi.ts.net' });
  a.deepEqual(haNormalizeBaseUrl(''),                              { url: '' });
});

test('haNormalizeBaseUrl refuses what the browser would refuse anyway', () => {
  a.ok(haNormalizeBaseUrl('homeassistant.local:8123').error, 'bare host needs a scheme');
  a.ok(haNormalizeBaseUrl('http://homeassistant.local:8123').error, 'plain http on the LAN is unreachable from an HTTPS page');
  a.ok(haNormalizeBaseUrl('http://192.168.1.40:8123').error, 'so is a plain http IP');
  a.ok(haNormalizeBaseUrl('ftp://nope').error, 'non-http scheme');
});

test('haNormalizeBaseUrl allows http on localhost, for the mock server', () => {
  a.deepEqual(haNormalizeBaseUrl('http://localhost:8123'), { url: 'http://localhost:8123' });
  a.deepEqual(haNormalizeBaseUrl('http://127.0.0.1:8123'), { url: 'http://127.0.0.1:8123' });
});
