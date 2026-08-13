const express = require('express');
const fs = require('fs');
const path = require('path');
const { dijkstra, aStar } = require('../dsa/shortestPath');
const Graph = require('../dsa/graph');
const { nearestNeighbor, twoOpt, calculateTotalDistance, bruteForceTSP } = require('../dsa/tsp');
const Route = require('../models/Route');
const { downloadOSM } = require('../services/mapLoader');

const router = express.Router();

// Load all real city graphs ONCE on startup from cached map data
console.log("Loading all real city graphs from local cache...");
const cityGraphs = {};
let currentCityId = 'new_york';
let currentLocationName = "New York";
let currentBounds = [[40.705, -74.015], [40.725, -73.995]];

const dataDir = path.join(__dirname, '..', 'data');
if (fs.existsSync(dataDir)) {
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('map_') && f.endsWith('.json'));
  for (const file of files) {
    const cityId = file.replace('map_', '').replace('.json', '');
    try {
      const mapData = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      const graph = new Graph();
      
      mapData.nodes.forEach(node => {
        graph.addNode(node.id, node.lng, node.lat);
      });
      
      mapData.edges.forEach(edge => {
        graph.addEdge(edge.source, edge.target, edge.weight, edge.isOneWay);
      });
      
      cityGraphs[cityId] = {
        graph: graph,
        name: mapData.name,
        bounds: mapData.bounds,
        center: mapData.center
      };
      console.log(`Successfully loaded ${mapData.name} (${cityId}) with ${graph.getAllNodes().length} nodes.`);
    } catch (error) {
      console.error(`Failed to load ${file}:`, error.message);
    }
  }
} else {
  console.warn("Data directory not found. Please run downloadMultiMaps.js first.");
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

// Helper to snap a lat/lng point to the closest node in our static graph
function snapToGraph(point) {
  let closestId = null;
  let minDist = Infinity;
  const graph = cityGraphs[currentCityId].graph;
  graph.getAllNodes().forEach(node => {
    const d = haversineDist(point, { lat: node.y, lng: node.x });
    if (d < minDist) { minDist = d; closestId = node.id; }
  });
  console.log(`snapped (${point.lat}, ${point.lng}) to ${closestId} at distance ${minDist}m`);
  return closestId;
}

router.post('/snap', (req, res) => {
  const { lat, lng } = req.body;
  console.log("SNAP REQUEST:", req.body);
  if (!lat || !lng) return res.status(400).json({ error: "Missing coordinates" });
  
  const closestId = snapToGraph({ lat, lng });
  if (!closestId) return res.status(400).json({ error: "No nearby road found" });
  
  const graph = cityGraphs[currentCityId].graph;
  const node = graph.getNode(closestId);
  
  // If user clicked far away from our downloaded map area, reject the click
  const dist = haversineDist({ lat, lng }, { lat: node.y, lng: node.x });
  if (dist > 500) {
    return res.status(400).json({ error: `Location is outside the supported routing area (${currentLocationName}).` });
  }

  console.log("SNAPPED TO:", node.id, node.y, node.x);
  res.json({ lat: node.y, lng: node.x, id: node.id });
});

router.post('/set-city', (req, res) => {
  const { cityId } = req.body;
  if (!cityId || !cityGraphs[cityId]) {
    return res.status(400).json({ error: "City not found in local cache." });
  }

  currentCityId = cityId;
  currentLocationName = cityGraphs[cityId].name;
  currentBounds = cityGraphs[cityId].bounds;

  res.json({ 
    success: true, 
    bounds: currentBounds,
    name: currentLocationName,
    center: cityGraphs[cityId].center,
    nodesLoaded: cityGraphs[cityId].graph.getAllNodes().length
  });
});

router.post('/shortest-path', (req, res) => {
  const { start, end, algorithm } = req.body; 
  if (!start || !end) return res.status(400).json({ error: "Missing start or end point" });

  try {
    const startId = snapToGraph(start);
    const endId = snapToGraph(end);

    const graph = cityGraphs[currentCityId].graph;
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

router.post('/tsp', (req, res) => {
  const { stops } = req.body; 
  if (!stops || stops.length < 2) return res.status(400).json({ error: 'At least 2 stops required' });

  try {
    const startTime = performance.now();
    
    // Snap all stops
    const snappedIds = stops.map(stop => snapToGraph(stop));
    
    // Precompute shortest paths between all pairs
    const distanceMatrix = {}; 
    snappedIds.forEach(id => distanceMatrix[id] = {});

    const graph = cityGraphs[currentCityId].graph;

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
  if (!stops || stops.length > 10) return res.status(400).json({ error: 'Max 10 stops for benchmark' });

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
