const express = require('express');
const { dijkstra, aStar } = require('../dsa/shortestPath');
const { nearestNeighbor, twoOpt, calculateTotalDistance, bruteForceTSP } = require('../dsa/tsp');
const Route = require('../models/Route');
const { downloadOSM } = require('../services/mapLoader');
const { isLatLng, stopsError } = require('../validation');
const { getCity } = require('../services/cityGraphs');

const router = express.Router();

const MAX_SNAP_DISTANCE_M = 500; // clicks further than this from any road are outside the routing area
const MAX_TSP_STOPS = 25; // TSP runs stops^2 Dijkstra searches on the event loop (25 stops ≈ 0.4 s)
const MAX_BENCHMARK_STOPS = 10; // brute force is O(n!)

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

// Helper to snap a lat/lng point to the closest node in our static graph.
// Returns { id, distance } where distance is in meters.
function snapToGraph(graph, point) {
  let closestId = null;
  let minDist = Infinity;
  graph.getAllNodes().forEach(node => {
    const d = haversineDist(point, { lat: node.y, lng: node.x });
    if (d < minDist) { minDist = d; closestId = node.id; }
  });
  console.log(`snapped (${point.lat}, ${point.lng}) to ${closestId} at distance ${minDist}m`);
  return { id: closestId, distance: minDist };
}

const outsideAreaError = (city) => `Location is outside the supported routing area (${city.name}).`;

router.post('/snap', withCity, (req, res) => {
  const { lat, lng } = req.body;
  console.log("SNAP REQUEST:", req.body);
  if (!isLatLng(req.body)) return res.status(400).json({ error: "Missing or invalid coordinates" });

  const graph = req.city.graph;
  const snapped = snapToGraph(graph, { lat, lng });
  if (!snapped.id) return res.status(400).json({ error: "No nearby road found" });

  const node = graph.getNode(snapped.id);

  // If user clicked far away from our downloaded map area, reject the click
  if (snapped.distance > MAX_SNAP_DISTANCE_M) {
    return res.status(400).json({ error: outsideAreaError(req.city) });
  }

  console.log("SNAPPED TO:", node.id, node.y, node.x);
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
    const startSnap = snapToGraph(graph, start);
    const endSnap = snapToGraph(graph, end);
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
    const snapped = stops.map(stop => snapToGraph(graph, stop));
    const far = snapped.findIndex(s => s.distance > MAX_SNAP_DISTANCE_M);
    if (far !== -1) return res.status(400).json({ error: `Stop ${far}: ${outsideAreaError(req.city)}` });
    const snappedIds = snapped.map(s => s.id);

    // Precompute shortest paths between all pairs
    const distanceMatrix = {};
    snappedIds.forEach(id => distanceMatrix[id] = {});

    for (let i = 0; i < snappedIds.length; i++) {
      for (let j = 0; j < snappedIds.length; j++) {
        if (i === j) {
          distanceMatrix[snappedIds[i]][snappedIds[j]] = { distance: 0, path: [snappedIds[i]] };
        } else if (!distanceMatrix[snappedIds[i]][snappedIds[j]]) {
          const res = dijkstra(graph, snappedIds[i], snappedIds[j]);
          distanceMatrix[snappedIds[i]][snappedIds[j]] = { distance: res.distance, path: res.path };
        }
      }
    }

    // TSP optimization
    const distFn = (a, b) => distanceMatrix[a][b].distance;
    const nnRoute = nearestNeighbor(snappedIds, distFn);
    const { bestRoute: optimizedIds, optimizationSteps } = twoOpt(nnRoute, distFn);
    
    // Reconstruct full road route
    let fullDetailedPath = [];
    let totalDistance = 0;

    for (let i = 0; i < optimizedIds.length - 1; i++) {
      const seg = distanceMatrix[optimizedIds[i]][optimizedIds[i+1]];
      totalDistance += seg.distance;
      fullDetailedPath = fullDetailedPath.concat(seg.path.slice(0, -1)); 
    }
    const lastSeg = distanceMatrix[optimizedIds[optimizedIds.length - 1]][optimizedIds[0]];
    totalDistance += lastSeg.distance;
    fullDetailedPath = fullDetailedPath.concat(lastSeg.path);

    const finalCoords = fullDetailedPath.map(id => ({
      lat: graph.getNode(id).y,
      lng: graph.getNode(id).x
    }));

    const timeMs = performance.now() - startTime;
    
    res.json({
      route: finalCoords,
      optimizationSteps: optimizationSteps.map(step => {
        let fullStepPath = [];
        for (let i = 0; i < step.route.length - 1; i++) {
          const seg = distanceMatrix[step.route[i]][step.route[i+1]];
          fullStepPath = fullStepPath.concat(seg.path.slice(0, -1));
        }
        const lastSeg = distanceMatrix[step.route[step.route.length - 1]][step.route[0]];
        fullStepPath = fullStepPath.concat(lastSeg.path);

        return {
          distance: step.distance,
          route: fullStepPath.map(id => ({ lat: graph.getNode(id).y, lng: graph.getNode(id).x }))
        };
      }),
      distance: totalDistance,
      timeMs: timeMs
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

// Save route
router.post('/routes', async (req, res) => {
  try {
    const route = await Route.create(req.body);
    res.json(route);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/routes', async (req, res) => {
  try {
    const routes = await Route.findAll({ order: [['createdAt', 'DESC']] });
    res.json(routes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
