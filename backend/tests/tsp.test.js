const request = require('supertest');
const app = require('../index');
const Graph = require('../dsa/graph');
const { aStar, dijkstra, dijkstraToMany } = require('../dsa/shortestPath');
const { planTour, nearestNeighbor, twoOpt, calculateTotalDistance } = require('../dsa/tsp');
const { cityGraphs } = require('../services/cityGraphs');

// Same Haversine formula the map importer used for edge weights.
function haversine(a, b) {
  const R = 6371e3;
  const φ1 = a.lat * Math.PI / 180;
  const φ2 = b.lat * Math.PI / 180;
  const Δφ = (b.lat - a.lat) * Math.PI / 180;
  const Δλ = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const polylineLength = (pts) => pts.slice(1).reduce((sum, p, i) => sum + haversine(pts[i], p), 0);

// Deterministic random numbers so a failing tour can be reproduced.
function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Cheapest directed edge from -> to, or undefined if the road does not exist.
function edgeWeight(graph, from, to) {
  const weights = graph.getNeighbors(from).filter(e => e.node === to).map(e => e.weight);
  return weights.length > 0 ? Math.min(...weights) : undefined;
}

function expectValidTour(graph, stopIds, tour) {
  const n = stopIds.length;
  expect(tour.error).toBeUndefined();

  // 1. Every requested stop is visited exactly once, starting at the depot (stop 0).
  expect([...tour.order].sort((a, b) => a - b)).toEqual([...Array(n).keys()]);
  expect(tour.order[0]).toBe(0);

  // 2. n legs chain through that order and the last one returns to the depot.
  expect(tour.legs).toHaveLength(n);
  tour.legs.forEach((leg, k) => {
    expect(leg.from).toBe(tour.order[k]);
    expect(leg.to).toBe(tour.order[(k + 1) % n]);

    // 3. Each leg is a real directed road path between its two stops, and it is the shortest one.
    expect(leg.path[0]).toBe(stopIds[leg.from]);
    expect(leg.path[leg.path.length - 1]).toBe(stopIds[leg.to]);
    let walked = 0;
    for (let i = 0; i + 1 < leg.path.length; i++) {
      const w = edgeWeight(graph, leg.path[i], leg.path[i + 1]);
      expect(w).toBeDefined();
      walked += w;
    }
    expect(leg.distance).toBeGreaterThanOrEqual(0);
    expect(leg.distance).toBeCloseTo(walked, 6);
    expect(leg.distance).toBeCloseTo(aStar(graph, stopIds[leg.from], stopIds[leg.to]).distance, 6);
  });

  // 4. The reported distance is the sum of the actual road legs.
  expect(tour.distance).toBeCloseTo(tour.legs.reduce((sum, leg) => sum + leg.distance, 0), 6);

  // 5. The full road path starts and ends at the depot.
  expect(tour.path[0]).toBe(stopIds[0]);
  expect(tour.path[tour.path.length - 1]).toBe(stopIds[0]);
}

describe('planTour on the real city graphs', () => {
  Object.keys(cityGraphs).sort().forEach((cityId, cityIndex) => {
    test(`${cityId}: tours of 2-7 random stops visit each stop once over real road legs`, () => {
      const { graph, routableNodes } = cityGraphs[cityId];
      const random = rng(1000 + cityIndex);
      for (let n = 2; n <= 7; n++) {
        const stopIds = Array.from({ length: n }, () => routableNodes[Math.floor(random() * routableNodes.length)].id);
        expectValidTour(graph, stopIds, planTour(graph, stopIds));
      }
    });
  });

  test('two requested stops on the same road node are both visited', () => {
    const { graph, routableNodes } = cityGraphs.new_york;
    const [a, b, c] = [routableNodes[10].id, routableNodes[500].id, routableNodes[2000].id];
    const stopIds = [a, b, b, c];
    expectValidTour(graph, stopIds, planTour(graph, stopIds));
  });
});

describe('dijkstraToMany on the real city graphs', () => {
  test('gives the same distances as one dijkstra() per pair, along valid road paths', () => {
    const random = rng(2024);
    for (const cityId of Object.keys(cityGraphs).sort()) {
      const { graph, routableNodes } = cityGraphs[cityId];
      const ids = Array.from({ length: 6 }, () => routableNodes[Math.floor(random() * routableNodes.length)].id);
      for (const start of ids) {
        dijkstraToMany(graph, start, ids).forEach((result, i) => {
          // Distances must agree; paths may legitimately differ when two routes cost the same.
          expect(result.distance).toBeCloseTo(dijkstra(graph, start, ids[i]).distance, 6);
          expect(result.path[0]).toBe(start);
          expect(result.path[result.path.length - 1]).toBe(ids[i]);
          let walked = 0;
          for (let k = 0; k + 1 < result.path.length; k++) {
            const w = edgeWeight(graph, result.path[k], result.path[k + 1]);
            expect(w).toBeDefined();
            walked += w;
          }
          expect(result.distance).toBeCloseTo(walked, 6);
        });
      }
    }
  });
});

describe('2-opt on real one-way road distances', () => {
  test('never returns a longer tour than Nearest Neighbor gave it, and every step improves', () => {
    const random = rng(4242);
    const worse = [];
    for (const cityId of Object.keys(cityGraphs).sort()) {
      const { graph, routableNodes } = cityGraphs[cityId];
      for (let t = 0; t < 6; t++) {
        const ids = Array.from({ length: 7 }, () => routableNodes[Math.floor(random() * routableNodes.length)].id);
        const M = ids.map((a, i) => ids.map((b, j) => (i === j ? 0 : dijkstra(graph, a, b).distance)));
        const dist = (a, b) => M[a][b];
        const nn = nearestNeighbor(ids.map((_, i) => i), dist);
        const { bestRoute, optimizationSteps } = twoOpt(nn, dist);
        const [before, after] = [calculateTotalDistance(nn, dist), calculateTotalDistance(bestRoute, dist)];
        const stepsImprove = optimizationSteps.every((s, i) => i === 0 || s.distance < optimizationSteps[i - 1].distance);
        if (after > before + 1e-6 || !stepsImprove) worse.push(`${cityId} tour ${t}: ${before.toFixed(1)} m -> ${after.toFixed(1)} m`);
      }
    }
    expect(worse).toEqual([]);
  });
});

describe('planTour guard', () => {
  test('returns an error, not a route, when a stop cannot be reached by road', () => {
    const g = new Graph();
    ['A', 'B', 'C', 'D'].forEach((id, i) => g.addNode(id, i, 0));
    g.addEdge('A', 'B', 1, false);
    g.addEdge('B', 'C', 1, false);
    g.addEdge('C', 'D', 1, true); // D is a one-way dead end: reachable, but no way back

    const tour = planTour(g, ['A', 'D', 'B']);
    expect(tour.error).toMatch(/cannot be reached/);
    expect(tour.path).toBeUndefined();
  });
});

// Stops found during the audit whose tour used a leg that does not exist on the road network.
const REGRESSION_TOURS = [
  // used to report 2,283.6 m while drawing a 2,959.4 m line
  ['new_york', [{ lat: 40.7146, lng: -74.0085 }, { lat: 40.7105, lng: -74.0016 }, { lat: 40.7092, lng: -74.0069 }, { lat: 40.7164, lng: -73.9998 }]],
  // used to report 2,015.7 m while drawing a 3,588.8 m line
  ['london', [{ lat: 51.5112, lng: -0.1196 }, { lat: 51.4986, lng: -0.1182 }, { lat: 51.5123, lng: -0.1229 }, { lat: 51.5114, lng: -0.1277 }]],
];

describe('POST /api/tsp regression', () => {
  test.each(REGRESSION_TOURS)('%s: the tour returned is a real closed road route', async (cityId, stops) => {
    const res = await request(app).post('/api/tsp').send({ stops, cityId });
    expect(res.status).toBe(200);

    // Every requested stop exactly once, depot first.
    expect(res.body.order).toEqual(expect.any(Array));
    expect([...res.body.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(res.body.order[0]).toBe(0);

    // Starts and ends at the depot's road position.
    const depot = (await request(app).post('/api/snap').send({ ...stops[0], cityId })).body;
    const route = res.body.route;
    expect(route[0]).toEqual({ lat: depot.lat, lng: depot.lng });
    expect(route[route.length - 1]).toEqual({ lat: depot.lat, lng: depot.lng });

    // Road edges are straight segments weighted by their Haversine length, so the drawn line must be
    // exactly as long as the reported distance. A skipped or faked leg makes them differ.
    expect(res.body.distance).toBeGreaterThan(0);
    expect(polylineLength(route)).toBeCloseTo(res.body.distance, 1);
  });
});
