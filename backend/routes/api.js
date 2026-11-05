const crypto = require('crypto');
const express = require('express');
const { dijkstra, aStar } = require('../dsa/shortestPath');
const { nearestNeighbor, twoOpt, calculateTotalDistance, bruteForceTSP, planTour } = require('../dsa/tsp');
const Route = require('../models/Route');
const { downloadOSM } = require('../services/mapLoader');
const { isLatLng, stopsError, parseSavedRoute } = require('../validation');
const { getCity } = require('../services/cityGraphs');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

const MAX_SNAP_DISTANCE_M = 500; // clicks further than this from any road are outside the routing area
const MAX_TSP_STOPS = 25; // TSP runs stops^2 Dijkstra searches on the event loop (25 stops ≈ 0.4 s)
const MAX_BENCHMARK_STOPS = 10; // brute force is O(n!)
const DEFAULT_ROUTES_PAGE = 50;
const MAX_ROUTES_PAGE = 100;

// Saved routes are stored on disk, so writes get their own, much slower allowance:
// 10 per client per hour, on top of the general API limit.
const writeLimiter = rateLimiter(10, 10 / 3600);

// Saved routes are for the operator only: they need ADMIN_API_KEY as a bearer token, and are
// switched off (404, like any unknown path) while it is unset. Never put the key in frontend code.
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
if (ADMIN_API_KEY && !/^[A-Za-z0-9\-._~+/]{32,}=*$/.test(ADMIN_API_KEY)) {
  throw new Error('ADMIN_API_KEY must be at least 32 characters of A-Z a-z 0-9 - . _ ~ + / (optionally ending in =).');
}
const BEARER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i; // RFC 6750 token; the scheme is case-insensitive
const sha256 = (text) => crypto.createHash('sha256').update(text).digest();
const adminKeyHash = sha256(ADMIN_API_KEY);

// A missing, malformed or wrong key all get the same 401. Both sides are hashed to 32 bytes, so
// the constant-time comparison reveals nothing about the key, not even its length.
function requireAdminKey(req, res, next) {
  if (!ADMIN_API_KEY) return next('router'); // switched off: falls through to the app's 404
  const token = BEARER.exec(req.get('Authorization') || '')?.[1];
  if (token !== undefined && crypto.timingSafeEqual(sha256(token), adminKeyHash)) return next();
  res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'Unauthorized' });
}

const MAX_SAVED_ROUTES = 1000; // at most ~100 kB each (the body limit), so about 100 MB when full

// Saves run one at a time, so the count check and the insert cannot interleave and go over the limit.
// shortcut: per process; several server processes sharing one database would need a transaction.
let saveQueue = Promise.resolve();
function saveRoute(fields) {
  const result = saveQueue.then(async () => {
    if (await Route.count() >= MAX_SAVED_ROUTES) return null;
    // `fields` limits the insert to the validated columns (no client-chosen id or timestamps).
    return Route.create(fields, { fields: Object.keys(fields) });
  });
  saveQueue = result.catch(() => {}); // a failed save must not block the ones after it
  return result;
}

// Each request names its own city (body.cityId, default New York); nothing is shared between visitors.
function withCity(req, res, next) {
  req.city = getCity(req.body.cityId);
  if (!req.city) return res.status(400).json({ error: "Unknown cityId." });
  next();
}

// Haversine distance in meters for snapping
function haversineDist(p1, p2) {
  const R = 6371e3;
  const φ1 = p1.lat * Math.PI/180;
  const φ2 = p2.lat * Math.PI/180;
  const Δφ = (p2.lat-p1.lat) * Math.PI/180;
  const Δλ = (p2.lng-p1.lng) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Helper to snap a lat/lng point to the closest routable node of a city (its main road
// network, so every stop can reach every other one). Returns { id, distance } in meters.
function snapToGraph(city, point) {
  let closestId = null;
  let minDist = Infinity;
  city.routableNodes.forEach(node => {
    const d = haversineDist(point, { lat: node.y, lng: node.x });
    if (d < minDist) { minDist = d; closestId = node.id; }
  });
  return { id: closestId, distance: minDist };
}

const outsideAreaError = (city) => `Location is outside the supported routing area (${city.name}).`;

router.post('/snap', withCity, (req, res) => {
  const { lat, lng } = req.body;
  if (!isLatLng(req.body)) return res.status(400).json({ error: "Missing or invalid coordinates" });

  const graph = req.city.graph;
  const snapped = snapToGraph(req.city, { lat, lng });
  if (!snapped.id) return res.status(400).json({ error: "No nearby road found" });

  const node = graph.getNode(snapped.id);

  // If user clicked far away from our downloaded map area, reject the click
  if (snapped.distance > MAX_SNAP_DISTANCE_M) {
    return res.status(400).json({ error: outsideAreaError(req.city) });
  }

  res.json({ lat: node.y, lng: node.x, id: node.id });
});

// Read-only: returns a city's metadata. The client sends cityId with each routing request.
router.post('/set-city', (req, res) => {
  const { cityId } = req.body;
  const city = cityId === undefined ? undefined : getCity(cityId);
  if (!city) {
    return res.status(400).json({ error: "City not found in local cache." });
  }

  res.json({
    success: true,
    bounds: city.bounds,
    name: city.name,
    center: city.center,
    nodesLoaded: city.graph.getAllNodes().length
  });
});

router.post('/shortest-path', withCity, (req, res) => {
  const { start, end, algorithm = 'Dijkstra' } = req.body;
  if (!isLatLng(start) || !isLatLng(end)) return res.status(400).json({ error: "Missing or invalid start or end point" });
  if (algorithm !== 'Dijkstra' && algorithm !== 'A*') {
    return res.status(400).json({ error: "algorithm must be 'Dijkstra' or 'A*'" });
  }

  try {
    const graph = req.city.graph;
    const startSnap = snapToGraph(req.city, start);
    const endSnap = snapToGraph(req.city, end);
    if (startSnap.distance > MAX_SNAP_DISTANCE_M || endSnap.distance > MAX_SNAP_DISTANCE_M) {
      return res.status(400).json({ error: outsideAreaError(req.city) });
    }
    const startId = startSnap.id;
    const endId = endSnap.id;

    let result = algorithm === 'A*' ? aStar(graph, startId, endId) : dijkstra(graph, startId, endId);
    
    if (result.distance === -1) {
      return res.status(400).json({ error: "No path could be found." });
    }

    res.json({
      path: result.path.map(id => ({ lat: graph.getNode(id).y, lng: graph.getNode(id).x })),
      exploredNodes: (result.exploredNodes || []).map(id => ({ lat: graph.getNode(id).y, lng: graph.getNode(id).x })),
      nodesVisited: result.nodesVisited,
      distance: result.distance, 
      timeMs: result.computationTime
    });
  } catch (error) {
    console.error("Pathfinding Error:", error.message);
    res.status(500).json({ error: "Failed to compute shortest path." });
  }
});

router.post('/tsp', withCity, (req, res) => {
  const { stops } = req.body;
  const invalid = stopsError(stops, 2, MAX_TSP_STOPS);
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const startTime = performance.now();
    const graph = req.city.graph;

    // Snap all stops
    const snapped = stops.map(stop => snapToGraph(req.city, stop));
    const far = snapped.findIndex(s => s.distance > MAX_SNAP_DISTANCE_M);
    if (far !== -1) return res.status(400).json({ error: `Stop ${far}: ${outsideAreaError(req.city)}` });

    // All-pairs road distances, Nearest Neighbor + 2-opt, full road path (see dsa/tsp.js)
    const tour = planTour(graph, snapped.map(s => s.id));
    if (tour.error) return res.status(422).json({ error: tour.error });

    const toCoords = ids => ids.map(id => ({ lat: graph.getNode(id).y, lng: graph.getNode(id).x }));

    res.json({
      route: toCoords(tour.path),
      optimizationSteps: tour.optimizationSteps.map(step => ({ distance: step.distance, route: toCoords(step.path) })),
      distance: tour.distance,
      order: tour.order, // indexes into `stops`, in visiting order, starting with the depot (0)
      timeMs: performance.now() - startTime
    });

  } catch (error) {
    console.error("TSP Error:", error.message);
    res.status(500).json({ error: "Failed to optimize route." });
  }
});

router.post('/benchmark', (req, res) => {
  const { stops } = req.body;
  const invalid = stopsError(stops, 2, MAX_BENCHMARK_STOPS);
  if (invalid) return res.status(400).json({ error: invalid });

  // Helper: straight line dist for fast benchmarking so we don't spam Overpass API
  const distFn = (p1, p2) => haversineDist(p1, p2);

  const t1 = process.hrtime();
  const nnRoute = nearestNeighbor(stops, distFn);
  const { bestRoute: optRoute } = twoOpt(nnRoute, distFn);
  const d1 = process.hrtime(t1);

  const t2 = process.hrtime();
  const exactRoute = bruteForceTSP(stops, distFn);
  const d2 = process.hrtime(t2);

  res.json({
    stopsCount: stops.length,
    approximation: { 
      timeMs: (d1[0] * 1e9 + d1[1]) / 1e6, 
      distance: calculateTotalDistance(optRoute, distFn) 
    },
    exact: { 
      timeMs: (d2[0] * 1e9 + d2[1]) / 1e6, 
      distance: calculateTotalDistance(exactRoute, distFn) 
    }
  });
});

// Save route (admin key required). The key and validation run before the write limit, so
// rejected requests do not use up the allowance.
router.post('/routes', requireAdminKey, (req, res, next) => {
  const parsed = parseSavedRoute(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  req.savedRoute = parsed.route;
  next();
}, writeLimiter, async (req, res, next) => {
  try {
    const route = await saveRoute(req.savedRoute);
    if (!route) return res.status(409).json({ error: `Saved-route limit reached (${MAX_SAVED_ROUTES}).` });
    res.json(route);
  } catch (error) {
    next(error); // generic JSON 500, without database details
  }
});

// List saved routes (admin key required), newest first: ?limit= (1-100, default 50) and ?offset= (default 0).
router.get('/routes', requireAdminKey, async (req, res, next) => {
  const limit = req.query.limit === undefined ? DEFAULT_ROUTES_PAGE : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROUTES_PAGE || !Number.isInteger(offset) || offset < 0) {
    return res.status(400).json({ error: `limit must be an integer from 1 to ${MAX_ROUTES_PAGE}, offset an integer >= 0.` });
  }
  try {
    const routes = await Route.findAll({ order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, offset });
    res.json(routes);
  } catch (error) {
    next(error);
  }
});

// Temporary aid for measuring TRUST_PROXY_HOPS (README "Deploying"): shows the caller how its own
// request reaches the app, without turning proxy trust on. Exists only with PROXY_DIAGNOSTICS=1 and
// the admin key. chain = [socket address, ...X-Forwarded-For from right to left]; Express counts
// hops the same way, so chain[n] is what req.ip would be with TRUST_PROXY_HOPS=n.
if (process.env.PROXY_DIAGNOSTICS === '1') {
  router.get('/debug/proxy', requireAdminKey, (req, res) => {
    const forwardedFor = req.get('X-Forwarded-For') ?? null;
    res.json({
      socket: req.socket.remoteAddress,
      xForwardedFor: forwardedFor,
      cfConnectingIp: req.get('CF-Connecting-IP') ?? null,
      xForwardedProto: req.get('X-Forwarded-Proto') ?? null,
      reqIp: req.ip,
      trustProxy: req.app.get('trust proxy'),
      chain: [req.socket.remoteAddress, ...(forwardedFor ?? '').split(',').map((a) => a.trim()).filter(Boolean).reverse()],
    });
  });
}

module.exports = router;
