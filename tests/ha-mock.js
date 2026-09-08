#!/usr/bin/env node
// A fake Home Assistant, so the hub's Home Assistant widget can be built and
// exercised with no Raspberry Pi in the room. Implements only the four REST
// endpoints family-hub.js actually calls, with the CORS headers a real HA sends
// once you've listed an origin in `cors_allowed_origins`.
//
//   node tests/ha-mock.js                    # http://localhost:8123, token 'dev-token'
//   node tests/ha-mock.js --port 9123
//   node tests/ha-mock.js --token secret123
//   node tests/ha-mock.js --reject-auth      # every request 401s (token-rejected path)
//   node tests/ha-mock.js --no-cors          # omit CORS headers (the failure that
//                                            #   looks identical to "host is down")
//
// Then serve the hub (python3 -m http.server 8080), open
// http://localhost:8080/family-hub.html, and point Settings → Home Assistant at
// http://localhost:8123. The CSP in family-hub.html allows that port in dev.

const http = require('http');

const argv  = process.argv.slice(2);
const flag  = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? fallback : argv[i + 1];
};
const has   = name => argv.includes('--' + name);

const PORT        = Number(flag('port', 8123));
const TOKEN       = flag('token', 'dev-token');
const REJECT_AUTH = has('reject-auth');
const SEND_CORS   = !has('no-cors');

// Entity IDs and shapes match what a real HA returns closely enough for the UI.
const states = {
  'light.kitchen':        { state: 'on',        attributes: { friendly_name: 'Kitchen',        brightness: 200 } },
  'light.living_room':    { state: 'off',       attributes: { friendly_name: 'Living Room' } },
  'switch.coffee_maker':  { state: 'off',       attributes: { friendly_name: 'Coffee Maker' } },
  'fan.bedroom':          { state: 'on',        attributes: { friendly_name: 'Bedroom Fan' } },
  'lock.front_door':      { state: 'locked',    attributes: { friendly_name: 'Front Door' } },
  'climate.hallway':      { state: 'heat',      attributes: { friendly_name: 'Hallway', current_temperature: 68, temperature: 70 } },
  'sensor.outside_temp':  { state: '54',        attributes: { friendly_name: 'Outside', unit_of_measurement: '°F' } },
  'binary_sensor.garage': { state: 'off',       attributes: { friendly_name: 'Garage Door', device_class: 'door' } },
  'light.broken_bulb':    { state: 'unavailable', attributes: { friendly_name: 'Broken Bulb' } },
};

// Which service does what, per domain. Mirrors real HA behaviour for the
// handful of domains the widget can operate.
const SERVICE_RESULT = {
  turn_on: 'on', turn_off: 'off', lock: 'locked', unlock: 'unlocked',
};

function withEntityId(id) {
  return { entity_id: id, last_changed: new Date().toISOString(), ...states[id] };
}

const server = http.createServer((req, res) => {
  const send = (code, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (SEND_CORS) {
      headers['Access-Control-Allow-Origin']  = req.headers.origin || '*';
      headers['Access-Control-Allow-Headers'] = 'authorization, content-type';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    }
    res.writeHead(code, headers);
    res.end(JSON.stringify(body));
  };

  if (req.method === 'OPTIONS') return send(204, {});

  const auth = req.headers.authorization || '';
  if (REJECT_AUTH || auth !== `Bearer ${TOKEN}`) {
    return send(401, { message: 'Unauthorized' });
  }

  const url = req.url.replace(/\?.*$/, '');

  if (url === '/api/' || url === '/api') return send(200, { message: 'API running.' });

  if (url === '/api/states') {
    return send(200, Object.keys(states).map(withEntityId));
  }

  const one = url.match(/^\/api\/states\/(.+)$/);
  if (one) {
    const id = decodeURIComponent(one[1]);
    if (!states[id]) return send(404, { message: 'Entity not found.' });
    return send(200, withEntityId(id));
  }

  const svc = url.match(/^\/api\/services\/([^/]+)\/([^/]+)$/);
  if (svc && req.method === 'POST') {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      let id;
      try { id = JSON.parse(raw || '{}').entity_id; } catch { id = null; }
      const next = SERVICE_RESULT[svc[2]];
      if (!id || !states[id] || !next) return send(400, { message: 'Bad service call.' });
      if (states[id].state === 'unavailable') return send(200, []);   // real HA accepts and does nothing
      states[id].state = next;
      send(200, [withEntityId(id)]);
    });
    return;
  }

  send(404, { message: 'Not found.' });
});

server.listen(PORT, () => {
  console.log(`Mock Home Assistant on http://localhost:${PORT}`);
  console.log(`  token:  ${REJECT_AUTH ? '(every request will 401)' : TOKEN}`);
  console.log(`  CORS:   ${SEND_CORS ? 'sent' : 'suppressed'}`);
  console.log(`  entities: ${Object.keys(states).join(', ')}`);
});
