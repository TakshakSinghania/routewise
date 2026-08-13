/**
 * TSP Utilities
 */

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
  let improved = true;
  let iterations = 0;
  const maxIterations = 1000; // Hard limit to prevent infinite loops
  const optimizationSteps = [];
  
  optimizationSteps.push({ route: [...bestRoute], distance: calculateTotalDistance(bestRoute, distFn) });

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < bestRoute.length - 2; i++) {
      for (let k = i + 1; k < bestRoute.length; k++) {
        const currentDist = 
          distFn(bestRoute[i - 1], bestRoute[i]) + 
          distFn(bestRoute[k], k === bestRoute.length - 1 ? bestRoute[0] : bestRoute[k + 1]);
        
        const newDist = 
          distFn(bestRoute[i - 1], bestRoute[k]) + 
          distFn(bestRoute[i], k === bestRoute.length - 1 ? bestRoute[0] : bestRoute[k + 1]);

        // If the new cost is strictly less, accept the swap
        if (newDist < currentDist - 1e-6) { // use small epsilon for floating point safety
          // Reverse the segment [i, k]
          const newRoute = [
            ...bestRoute.slice(0, i),
            ...bestRoute.slice(i, k + 1).reverse(),
            ...bestRoute.slice(k + 1)
          ];
          bestRoute = newRoute;
          improved = true;
          
          // Limit to 50 visualization steps
          if (optimizationSteps.length < 50) {
            optimizationSteps.push({ route: [...bestRoute], distance: calculateTotalDistance(bestRoute, distFn) });
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

module.exports = {
  nearestNeighbor,
  twoOpt,
  calculateTotalDistance,
  bruteForceTSP
};
