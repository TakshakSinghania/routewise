const MinHeap = require('../dsa/heap');
const Graph = require('../dsa/graph');
const { dijkstra, aStar } = require('../dsa/shortestPath');
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
