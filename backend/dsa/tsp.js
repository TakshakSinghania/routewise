/**
 * TSP Utilities
 */
const { dijkstraToMany } = require('./shortestPath');

// Nearest Neighbor Construction Heuristic
function nearestNeighbor(stops, distFn) {
  if (!stops || stops.length === 0) return [];
  if (stops.length === 1) return stops;
  if (stops.length === 2) return stops;

  const unvisited = new Set(stops);
  const route = [];
  
  // Always start from the first stop (Depot)
  let current = stops[0];
  route.push(current);
  unvisited.delete(current);

  while (unvisited.size > 0) {
    let nearest = null;
    let minDist = Infinity;

    for (const stop of unvisited) {
      const d = distFn(current, stop);
      if (d < minDist) {
        minDist = d;
        nearest = stop;
      }
    }

    route.push(nearest);
    current = nearest;
    unvisited.delete(nearest);
  }

  return route;
}

// 2-opt Local Search Improvement
function twoOpt(route, distFn) {
  if (!route || route.length <= 2) return { bestRoute: route, optimizationSteps: [] };

  let bestRoute = [...route];
  let bestDistance = calculateTotalDistance(bestRoute, distFn);
  let improved = true;
  let iterations = 0;
  const maxIterations = 1000; // Hard limit to prevent infinite loops
  const optimizationSteps = [];

  optimizationSteps.push({ route: [...bestRoute], distance: bestDistance });

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < bestRoute.length - 2; i++) {
      for (let k = i + 1; k < bestRoute.length; k++) {
        // Reverse the segment [i, k]
        const newRoute = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, k + 1).reverse(),
          ...bestRoute.slice(k + 1)
        ];
        // Compare whole tours, not just the two end edges: with one-way streets, reversing a
        // segment also changes the cost of every edge inside it.
        const newDistance = calculateTotalDistance(newRoute, distFn);

        // If the new cost is strictly less, accept the swap
        if (newDistance < bestDistance - 1e-6) { // use small epsilon for floating point safety
          bestRoute = newRoute;
          bestDistance = newDistance;
          improved = true;

          // Limit to 50 visualization steps
          if (optimizationSteps.length < 50) {
            optimizationSteps.push({ route: [...bestRoute], distance: bestDistance });
          }
          
          break; // Break outer loop to restart search on the improved route
        }
      }
      if (improved) break;
    }
  }

  return { bestRoute, optimizationSteps };
}

function calculateTotalDistance(route, distFn) {
  if (!route || route.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += distFn(route[i], route[i + 1]);
  }
  // Add return trip to start
  total += distFn(route[route.length - 1], route[0]);
  return total;
}

/**
 * Brute Force TSP for benchmarking (O(N!))
 */
function bruteForceTSP(stops, distanceFn) {
  let bestRoute = null;
  let minDistance = Infinity;

  const depot = stops[0];
  const others = stops.slice(1);

  function permute(arr, start) {
    if (start === arr.length) {
      const currentRoute = [depot, ...arr];
      const dist = calculateTotalDistance(currentRoute, distanceFn);
      if (dist < minDistance) {
        minDistance = dist;
        bestRoute = currentRoute.slice();
      }
      return;
    }

    for (let i = start; i < arr.length; i++) {
      // swap
      const temp = arr[start];
      arr[start] = arr[i];
      arr[i] = temp;
      
      permute(arr, start + 1);
      
      // backtrack
      arr[i] = arr[start];
      arr[start] = temp;
    }
  }

  permute(others, 0);
  return bestRoute || stops;
}

/**
 * Plans a closed delivery tour on a road graph: shortest road paths between every pair of
 * stops (Dijkstra), Nearest Neighbor + 2-opt over those distances, then the full road path.
 * Stops are handled by index, so two stops on the same road node are still both visited.
 * If any stop cannot reach another by road there is no valid tour: returns { error }.
 * Otherwise returns { order, legs: [{ from, to, distance, path }], distance, path, optimizationSteps }.
 */
function planTour(graph, stopIds) {
  // legs[i][j]: shortest road path from stop i to stop j; one search per stop covers a whole row.
  const legs = stopIds.map(from => dijkstraToMany(graph, from, stopIds));
  for (let i = 0; i < stopIds.length; i++) {
    for (let j = 0; j < stopIds.length; j++) {
      if (legs[i][j].distance < 0) return { error: `Stop ${j} cannot be reached from stop ${i} by road.` };
    }
  }

  const distFn = (a, b) => legs[a][b].distance;
  const indices = stopIds.map((_, i) => i);
  const { bestRoute: order, optimizationSteps } = twoOpt(nearestNeighbor(indices, distFn), distFn);

  // Join the legs of a closed route into one road path (each leg starts where the last ended).
  const joinLegs = (route) => route.flatMap((from, k) => {
    const { path } = legs[from][route[(k + 1) % route.length]];
    return k === route.length - 1 ? path : path.slice(0, -1);
  });
  const tourLegs = order.map((from, k) => {
    const to = order[(k + 1) % order.length];
    return { from, to, ...legs[from][to] };
  });

  return {
    order,
    legs: tourLegs,
    distance: tourLegs.reduce((sum, leg) => sum + leg.distance, 0),
    path: joinLegs(order),
    optimizationSteps: optimizationSteps.map(step => ({ distance: step.distance, path: joinLegs(step.route) })),
  };
}

module.exports = {
  nearestNeighbor,
  twoOpt,
  calculateTotalDistance,
  bruteForceTSP,
  planTour
};
