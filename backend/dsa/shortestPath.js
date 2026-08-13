const MinHeap = require('./heap');

/**
 * Dijkstra's Algorithm
 * Finds the shortest path from startNode to endNode.
 */
function dijkstra(graph, startNode, endNode) {
  const startTime = performance.now();
  const distances = new Map();
  const previous = new Map();
  const pq = new MinHeap(el => el.priority);
  const visited = new Set();
  
  let nodesVisited = 0;
  const exploredNodes = [];

  for (const node of graph.getAllNodes()) {
    distances.set(node.id, Infinity);
    previous.set(node.id, null);
  }

  distances.set(startNode, 0);
  pq.push({ id: startNode, priority: 0 });

  while (!pq.isEmpty()) {
    const current = pq.pop();

    if (visited.has(current.id)) continue;
    visited.add(current.id);
    nodesVisited++;
    
    // Track exploration sequence for visualization (cap at 1500 to prevent payload bloat)
    if (exploredNodes.length < 1500) {
      exploredNodes.push(current.id);
    }

    if (current.id === endNode) break;

    const neighbors = graph.getNeighbors(current.id);
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.node)) continue;

      const candidateDistance = distances.get(current.id) + neighbor.weight;
      if (candidateDistance < distances.get(neighbor.node)) {
        distances.set(neighbor.node, candidateDistance);
        previous.set(neighbor.node, current.id);
        pq.push({ id: neighbor.node, priority: candidateDistance });
      }
    }
  }

  const computationTime = performance.now() - startTime;
  return reconstructPath(previous, endNode, nodesVisited, distances.get(endNode), computationTime, exploredNodes);
}

/**
 * Haversine distance heuristic for A*
 */
function heuristic(nodeA, nodeB) {
  const R = 6371e3; // metres
  const φ1 = nodeA.y * Math.PI/180;
  const φ2 = nodeB.y * Math.PI/180;
  const Δφ = (nodeB.y - nodeA.y) * Math.PI/180;
  const Δλ = (nodeB.x - nodeA.x) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

/**
 * A* Search Algorithm
 */
function aStar(graph, startNode, endNode) {
  const startTime = performance.now();
  const distances = new Map(); // g-score
  const previous = new Map();
  const pq = new MinHeap(el => el.priority); // priority is f-score
  const visited = new Set();
  
  let nodesVisited = 0;
  const exploredNodes = [];
  const targetNodeData = graph.getNode(endNode);

  for (const node of graph.getAllNodes()) {
    distances.set(node.id, Infinity);
    previous.set(node.id, null);
  }

  distances.set(startNode, 0);
  pq.push({ id: startNode, priority: 0 });

  while (!pq.isEmpty()) {
    const current = pq.pop();

    if (visited.has(current.id)) continue;
    visited.add(current.id);
    nodesVisited++;

    if (exploredNodes.length < 1500) {
      exploredNodes.push(current.id);
    }

    if (current.id === endNode) break;

    const neighbors = graph.getNeighbors(current.id);

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.node)) continue;

      const gScore = distances.get(current.id) + neighbor.weight;
      if (gScore < distances.get(neighbor.node)) {
        distances.set(neighbor.node, gScore);
        previous.set(neighbor.node, current.id);
        
        const neighborNodeData = graph.getNode(neighbor.node);
        const hScore = heuristic(neighborNodeData, targetNodeData);
        const fScore = gScore + hScore;
        
        pq.push({ id: neighbor.node, priority: fScore });
      }
    }
  }

  const computationTime = performance.now() - startTime;
  return reconstructPath(previous, endNode, nodesVisited, distances.get(endNode), computationTime, exploredNodes);
}

function reconstructPath(previous, endNode, nodesVisited, totalDistance, computationTime, exploredNodes) {
  const path = [];
  let current = endNode;
  
  if (previous.get(current) !== null || totalDistance === 0) {
    while (current !== null) {
      path.unshift(current);
      current = previous.get(current);
    }
  }

  return {
    path: path.length > 1 || totalDistance === 0 ? path : [], 
    distance: totalDistance === Infinity ? -1 : totalDistance,
    nodesVisited,
    computationTime,
    exploredNodes
  };
}

module.exports = {
  dijkstra,
  aStar,
  heuristic
};
