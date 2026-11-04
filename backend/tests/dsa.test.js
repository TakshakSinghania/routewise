const MinHeap = require('../dsa/heap');
const Graph = require('../dsa/graph');
const { dijkstra, aStar, dijkstraToMany } = require('../dsa/shortestPath');
const { nearestNeighbor, twoOpt, calculateTotalDistance, bruteForceTSP } = require('../dsa/tsp');

describe('MinHeap', () => {
  test('should push and pop correctly maintaining min-heap property', () => {
    const heap = new MinHeap((el) => el.val);
    heap.push({ val: 10 });
    heap.push({ val: 5 });
    heap.push({ val: 20 });
    heap.push({ val: 1 });

    expect(heap.pop().val).toBe(1);
    expect(heap.pop().val).toBe(5);
    expect(heap.pop().val).toBe(10);
    expect(heap.pop().val).toBe(20);
    expect(heap.isEmpty()).toBe(true);
  });
});

describe('Graph and Pathfinding', () => {
  let graph;

  beforeEach(() => {
    // 3x3 Grid graph
    graph = Graph.generateGridGraph(3, 3);
  });

  test('Dijkstra should find shortest path in grid', () => {
    const result = dijkstra(graph, '0,0', '2,2');
    expect(result.distance).toBe(4);
    // Shortest path is length 4 (e.g. 0,0 -> 0,1 -> 0,2 -> 1,2 -> 2,2)
    expect(result.path.length).toBe(5); // 5 nodes in a path of length 4
  });

  test('A* should find shortest path in grid and explore fewer or equal nodes than Dijkstra', () => {
    const dijkstraResult = dijkstra(graph, '0,0', '2,2');
    const aStarResult = aStar(graph, '0,0', '2,2');
    
    expect(aStarResult.distance).toBe(4);
    expect(aStarResult.path.length).toBe(5);
    // A* typically explores fewer nodes in a grid with Euclidean heuristic
    expect(aStarResult.exploredNodes.length).toBeLessThanOrEqual(dijkstraResult.exploredNodes.length);
  });
});

describe('dijkstraToMany (one search, several targets)', () => {
  // Checks a returned path on its own terms: right endpoints, real directed edges, and edge
  // weights adding up to the distance. It never requires one particular node sequence, because
  // equal-cost alternatives are equally correct.
  function expectValidPath(graph, start, target, { distance, path }) {
    expect(path[0]).toBe(start);
    expect(path[path.length - 1]).toBe(target);
    let walked = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const edges = graph.getNeighbors(path[i]).filter(e => e.node === path[i + 1]);
      expect(edges.length).toBeGreaterThan(0);
      walked += Math.min(...edges.map(e => e.weight));
    }
    expect(distance).toBeCloseTo(walked, 9);
  }

  function oneWayGraph() {
    const g = new Graph();
    ['A', 'B', 'C', 'D', 'E'].forEach((id, i) => g.addNode(id, i, 0));
    g.addEdge('A', 'B', 1, false);
    g.addEdge('B', 'C', 2, false);
    g.addEdge('C', 'D', 4, true); // D: reachable, but a dead end
    g.addEdge('E', 'A', 1, true); // E: can leave, but cannot be reached
    return g;
  }

  test('returns distance and path for every reachable target, in target order', () => {
    const g = oneWayGraph();
    const [b, d, c] = dijkstraToMany(g, 'A', ['B', 'D', 'C']);
    expect(b.distance).toBe(1);
    expect(d.distance).toBe(7);
    expect(c.distance).toBe(3);
    expectValidPath(g, 'A', 'B', b);
    expectValidPath(g, 'A', 'D', d);
    expectValidPath(g, 'A', 'C', c);
  });

  test('an unreachable target gets distance -1 and an empty path, like dijkstra()', () => {
    const g = oneWayGraph();
    const [e, c] = dijkstraToMany(g, 'A', ['E', 'C']);
    expect(e).toEqual({ distance: -1, path: [] });
    expect(dijkstra(g, 'A', 'E').distance).toBe(-1);
    expect(c.distance).toBe(3); // other targets in the same call are unaffected

    const fromDeadEnd = dijkstraToMany(g, 'D', ['A', 'B']);
    expect(fromDeadEnd).toEqual([{ distance: -1, path: [] }, { distance: -1, path: [] }]);
  });

  test('the start itself and repeated targets are handled', () => {
    const g = oneWayGraph();
    const result = dijkstraToMany(g, 'A', ['A', 'C', 'C', 'A']);
    expect(result[0]).toEqual({ distance: 0, path: ['A'] });
    expect(result[3]).toEqual({ distance: 0, path: ['A'] });
    expect(result[1].distance).toBe(3);
    expect(result[2].distance).toBe(3);
  });

  test('with two equally short routes, either valid path is accepted', () => {
    // S -> X -> T and S -> Y -> T both cost 2.
    const g = new Graph();
    ['S', 'X', 'Y', 'T'].forEach((id, i) => g.addNode(id, i, 0));
    g.addEdge('S', 'X', 1, false);
    g.addEdge('X', 'T', 1, false);
    g.addEdge('S', 'Y', 1, false);
    g.addEdge('Y', 'T', 1, false);
    const [t] = dijkstraToMany(g, 'S', ['T']);
    expect(t.distance).toBe(2);
    expect([['S', 'X', 'T'], ['S', 'Y', 'T']]).toContainEqual(t.path);
    expectValidPath(g, 'S', 'T', t);
  });

  test('matches dijkstra() for every pair on a grid full of equal-cost routes', () => {
    const g = Graph.generateGridGraph(4, 4);
    const ids = g.getAllNodes().map(n => n.id);
    for (const start of ids) {
      dijkstraToMany(g, start, ids).forEach((result, i) => {
        expect(result.distance).toBe(dijkstra(g, start, ids[i]).distance);
        expectValidPath(g, start, ids[i], result);
      });
    }
  });
});

describe('Graph.largestStronglyConnectedComponent', () => {
  test('keeps the two-way core and leaves out one-way stubs and isolated parts', () => {
    const g = new Graph();
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((id, i) => g.addNode(id, i, 0));
    g.addEdge('A', 'B', 1, false);
    g.addEdge('B', 'C', 1, false);
    g.addEdge('C', 'D', 1, true); // D: one-way dead end (reachable, no way back)
    g.addEdge('E', 'A', 1, true); // E: one-way entry (can leave, cannot be reached)
    g.addEdge('G', 'H', 1, false); // G-H: a smaller separate component; F: isolated

    expect([...g.largestStronglyConnectedComponent()].sort()).toEqual(['A', 'B', 'C']);
    expect(g.getAllNodes()).toHaveLength(8); // the graph itself is not modified
  });

  test('a fully connected grid is one component', () => {
    expect(Graph.generateGridGraph(3, 3).largestStronglyConnectedComponent().size).toBe(9);
  });

  test('handles a 200,000-node one-way cycle without recursion overflow', () => {
    const g = new Graph();
    const n = 200000;
    for (let i = 0; i < n; i++) g.addNode(i, 0, 0);
    for (let i = 0; i < n; i++) g.addEdge(i, (i + 1) % n, 1, true);
    expect(g.largestStronglyConnectedComponent().size).toBe(n);
  });
});

describe('TSP Approximation', () => {
  // Simple Euclidean distance for testing
  const dist = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

  test('Nearest Neighbor should construct a valid route', () => {
    const stops = [
      { id: 'depot', x: 0, y: 0 },
      { id: 'A', x: 0, y: 10 },
      { id: 'B', x: 10, y: 10 },
      { id: 'C', x: 10, y: 0 }
    ];

    const route = nearestNeighbor(stops, dist);
    expect(route.length).toBe(4);
    // Depot -> A -> B -> C
    expect(route.map(r => r.id)).toEqual(['depot', 'A', 'B', 'C']);
  });

  test('2-opt removes a crossing in a symmetric tour', () => {
    const stops = [
      { id: 'depot', x: 0, y: 0 },
      { id: 'B', x: 10, y: 10 },
      { id: 'A', x: 0, y: 10 },
      { id: 'C', x: 10, y: 0 }
    ];
    // depot -> B -> A -> C crosses itself (~48.3); the square perimeter is 40.
    const { bestRoute } = twoOpt(stops, dist);
    expect(calculateTotalDistance(bestRoute, dist)).toBeCloseTo(40);
    expect(bestRoute[0].id).toBe('depot');
  });

  test('2-opt never makes a one-way (asymmetric) tour longer', () => {
    // Reversing stops [1, 2] makes the two end edges 2 shorter (0->2 + 1->3 = 6 vs 0->1 + 2->3 = 8),
    // but the middle edge flips from 1->2 = 2 to 2->1 = 8. Judging by the end edges alone turned 15 into 19.
    const M = [[0, 4, 2, 8], [4, 0, 2, 4], [8, 8, 0, 4], [5, 5, 3, 0]];
    const oneWay = (a, b) => M[a][b];
    const { bestRoute, optimizationSteps } = twoOpt([0, 1, 2, 3], oneWay);
    expect(calculateTotalDistance(bestRoute, oneWay)).toBeLessThanOrEqual(15);
    expect(bestRoute[0]).toBe(0);
    expect(optimizationSteps.at(-1).distance).toBe(calculateTotalDistance(bestRoute, oneWay));
  });

  test('Brute force should find optimal route', () => {
    const stops = [
      { id: 'depot', x: 0, y: 0 },
      { id: 'A', x: 0, y: 10 },
      { id: 'C', x: 10, y: 0 },
      { id: 'B', x: 10, y: 10 }
    ];

    const route = bruteForceTSP(stops, dist);
    // Optimal is a square perimeter: depot -> A -> B -> C -> depot (or reverse)
    const expectedDist = 10 + 10 + 10 + 10;
    expect(calculateTotalDistance(route, dist)).toBeCloseTo(expectedDist);
  });
});
