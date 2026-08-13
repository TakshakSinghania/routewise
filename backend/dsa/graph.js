/**
 * Graph implementation using an Adjacency List.
 * Optimized for sparse graphs like road networks.
 * 
 * Space Complexity: O(V + E) where V is vertices, E is edges.
 */
class Graph {
  constructor() {
    this.nodes = new Map(); // id -> { id, x, y }
    this.adjacencyList = new Map(); // id -> [{ node, weight }]
  }

  addNode(id, x, y) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, x, y });
      this.adjacencyList.set(id, []);
    }
  }

  addEdge(node1, node2, weight = 1, isDirected = false) {
    if (this.nodes.has(node1) && this.nodes.has(node2)) {
      this.adjacencyList.get(node1).push({ node: node2, weight });
      if (!isDirected) {
        this.adjacencyList.get(node2).push({ node: node1, weight });
      }
    }
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  getNeighbors(id) {
    return this.adjacencyList.get(id) || [];
  }

  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  // Helper to generate a realistic large static grid graph centered around a location
  static generateStaticCityGraph(rows = 100, cols = 100, centerLat = 40.7128, centerLng = -74.0060) {
    const graph = new Graph();
    const latStep = 0.002; // approx 200m
    const lngStep = 0.002;

    const startLat = centerLat - (rows / 2) * latStep;
    const startLng = centerLng - (cols / 2) * lngStep;

    // 1. Add nodes
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lat = startLat + r * latStep;
        const lng = startLng + c * lngStep;
        graph.addNode(`${r},${c}`, lng, lat);
      }
    }

    // 2. Haversine distance helper for edge weights
    const haversine = (p1, p2) => {
      const R = 6371e3;
      const φ1 = p1.lat * Math.PI/180;
      const φ2 = p2.lat * Math.PI/180;
      const Δφ = (p2.lat-p1.lat) * Math.PI/180;
      const Δλ = (p2.lng-p1.lng) * Math.PI/180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
      return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    };

    // 3. Connect nodes with some missing edges to simulate obstacles/rivers
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `${r},${c}`;
        const node = graph.getNode(id);
        
        const tryAddEdge = (r2, c2) => {
          // 10% chance a road is blocked/missing to create realistic maze-like routes
          if (Math.random() < 0.1) return; 
          
          const targetId = `${r2},${c2}`;
          const target = graph.getNode(targetId);
          if (target) {
            const dist = haversine({lat: node.y, lng: node.x}, {lat: target.y, lng: target.x});
            graph.addEdge(id, targetId, dist, true); // directed to allow one-ways if needed, but we do bidirectional manually below for simplicity, wait it adds edge both ways if we just iterate normally, so let's just make it directed and do it systematically
          }
        };

        if (r > 0) tryAddEdge(r - 1, c);
        if (r < rows - 1) tryAddEdge(r + 1, c);
        if (c > 0) tryAddEdge(r, c - 1);
        if (c < cols - 1) tryAddEdge(r, c + 1);
      }
    }
    return graph;
  }
}

module.exports = Graph;
