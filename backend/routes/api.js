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

// Save route. Unauthenticated: anyone can save and list routes (see README).
// Validation runs before the write limit, so rejected requests do not use up the allowance.
router.post('/routes', (req, res, next) => {
  const parsed = parseSavedRoute(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  req.savedRoute = parsed.route;
  next();
}, writeLimiter, async (req, res, next) => {
  try {
    // `fields` limits the insert to the validated columns (no client-chosen id or timestamps).
    const route = await Route.create(req.savedRoute, { fields: Object.keys(req.savedRoute) });
    res.json(route);
  } catch (error) {
    next(error); // generic JSON 500, without database details
  }
});

// List saved routes, newest first: ?limit= (1-100, default 50) and ?offset= (default 0).
router.get('/routes', async (req, res, next) => {
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

module.exports = router;
