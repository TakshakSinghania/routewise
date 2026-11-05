// Smoke test for a running RouteWise backend (local or deployed). It only reads data:
// /set-city no longer changes server state, so it is safe to run against production.
// Usage: node scripts/smoke.mjs https://your-backend.onrender.com   (default http://localhost:5001)
// Requests are paced ~0.6 s apart to stay under the API rate limit (30-token burst, 10 tokens/s, 1 token + 1 per stop).
const base = (process.argv[2] || 'http://localhost:5001').replace(/\/$/, '');
const CITIES = ['new_york', 'london', 'tokyo', 'paris', 'seoul'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function call(path, body, raw) {
  await sleep(600);
  const res = await fetch(base + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, type: res.headers.get('content-type') || '' };
}

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function haversine(a, b) {
  const t = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * t / 2) ** 2
    + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin((b.lng - a.lng) * t / 2) ** 2;
  return 6371e3 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const polylineLength = pts => pts.slice(1).reduce((sum, p, i) => sum + haversine(pts[i], p), 0);
const near = ([[minLat, minLng], [maxLat, maxLng]], p, pad = 0.01) =>
  p.lat >= minLat - pad && p.lat <= maxLat + pad && p.lng >= minLng - pad && p.lng <= maxLng + pad;
// Four points inside a city's routing box: corners pulled 30% toward the centre.
const pointsIn = ([[minLat, minLng], [maxLat, maxLng]]) => [[0.3, 0.3], [0.3, 0.7], [0.7, 0.7], [0.7, 0.3]]
  .map(([a, b]) => ({ lat: minLat + a * (maxLat - minLat), lng: minLng + b * (maxLng - minLng) }));

console.log(`RouteWise smoke test against ${base}\n`);
const health = await call('/health');
check('GET /health', health.status === 200 && health.json?.status === 'ok', `HTTP ${health.status}`);

// CORS: the production frontend may call the API from a browser; other origins get a 403.
const FRONTEND = 'https://routewise-seven.vercel.app';
const preflight = (origin) => fetch(base + '/api/snap', {
  method: 'OPTIONS',
  headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
});
const corsOk = await preflight(FRONTEND);
check('CORS preflight from the production frontend', corsOk.status === 204
  && corsOk.headers.get('access-control-allow-origin') === FRONTEND, `HTTP ${corsOk.status}`);
const corsDenied = await preflight('https://example.invalid');
check('CORS preflight from another origin -> 403', corsDenied.status === 403
  && corsDenied.headers.get('access-control-allow-origin') === null, `HTTP ${corsDenied.status}`);

const meta = {};
for (const cityId of CITIES) {
  const city = await call('/api/set-city', { cityId });
  meta[cityId] = city.json;
  check(`${cityId}: set-city metadata`, city.status === 200 && city.json?.nodesLoaded > 0,
    `HTTP ${city.status}, ${city.json?.name}, ${city.json?.nodesLoaded} nodes`);
  if (city.status !== 200) continue;
  const stops = pointsIn(city.json.bounds);

  const snap = await call('/api/snap', { ...stops[0], cityId });
  check(`${cityId}: snap`, snap.status === 200 && near(city.json.bounds, snap.json), `HTTP ${snap.status}`);

  const dj = await call('/api/shortest-path', { start: stops[0], end: stops[2], algorithm: 'Dijkstra', cityId });
  const as = await call('/api/shortest-path', { start: stops[0], end: stops[2], algorithm: 'A*', cityId });
  check(`${cityId}: Dijkstra and A* agree`, dj.status === 200 && as.status === 200 && dj.json.distance > 0
    && Math.abs(dj.json.distance - as.json.distance) < 1e-6,
    `${dj.json?.distance?.toFixed(1)} m vs ${as.json?.distance?.toFixed(1)} m`);

  const tsp = await call('/api/tsp', { stops, cityId });
  const route = tsp.json?.route || [];
  const order = tsp.json?.order || [];
  const closes = route.length > 1 && route[0].lat === route.at(-1).lat && route[0].lng === route.at(-1).lng;
  const drawn = polylineLength(route);
  check(`${cityId}: 4-stop TSP is a closed road tour`, tsp.status === 200
    && [...order].sort((a, b) => a - b).join() === '0,1,2,3' && order[0] === 0 && closes
    && Math.abs(drawn - tsp.json.distance) < 0.5,
    `HTTP ${tsp.status}, order ${order.join('>')}, reported ${tsp.json?.distance?.toFixed(1)} m, drawn ${drawn.toFixed(1)} m`);
}

// Two visitors at once in different cities: each must stay in its own city.
if (meta.new_york && meta.paris) {
  const visitor = async (cityId) => {
    const [a, , c] = pointsIn(meta[cityId].bounds);
    const snap = await call('/api/snap', { ...a, cityId });
    const path = await call('/api/shortest-path', { start: a, end: c, cityId });
    return snap.status === 200 && path.status === 200 && path.json.path.every(p => near(meta[cityId].bounds, p));
  };
  const [ny, paris] = await Promise.all([visitor('new_york'), visitor('paris')]);
  check('concurrent visitors (New York + Paris) each stay in their own city', ny && paris, `NY ${ny}, Paris ${paris}`);
}

const bad = await call('/api/snap', '{"lat": 40.7,', true);
check('malformed JSON -> JSON 400', bad.status === 400 && bad.type.includes('json'), `HTTP ${bad.status}`);
const many = await call('/api/tsp', { stops: Array(26).fill({ lat: 40.715, lng: -74.005 }) });
check('26 TSP stops -> JSON 400', many.status === 400 && many.type.includes('json'), `HTTP ${many.status}`);
const unknown = await call('/api/snap', { lat: 40.715, lng: -74.005, cityId: 'atlantis' });
check('unknown cityId -> JSON 400', unknown.status === 400 && unknown.type.includes('json'), `HTTP ${unknown.status}`);
const bench = await call('/api/benchmark', { stops: pointsIn(meta.new_york?.bounds ?? [[40.705, -74.015], [40.725, -73.995]]) });
check('benchmark (4 stops)', bench.status === 200 && bench.json?.exact?.distance > 0, `HTTP ${bench.status}`);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
