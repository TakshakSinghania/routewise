const fs = require('fs');
const path = require('path');
const Graph = require('../dsa/graph');

const DEFAULT_CITY_ID = 'new_york';

// Load all real city graphs ONCE on startup from cached map data
console.log("Loading all real city graphs from local cache...");
const cityGraphs = {};

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

      // Stops snap only to the main road network: nodes that can reach, and be reached from,
      // every other one. One-way stubs outside it (mostly roads cut off at the map edge) stay
      // in the graph for routing and display, but a stop there could make a leg impossible.
      const mainNetwork = graph.largestStronglyConnectedComponent();

      cityGraphs[cityId] = {
        graph: graph,
        routableNodes: graph.getAllNodes().filter(node => mainNetwork.has(node.id)),
        name: mapData.name,
        bounds: mapData.bounds,
        center: mapData.center
      };
      console.log(`Successfully loaded ${mapData.name} (${cityId}) with ${graph.getAllNodes().length} nodes (${mainNetwork.size} routable as stops).`);
    } catch (error) {
      console.error(`Failed to load ${file}:`, error.message);
    }
  }
} else {
  console.warn("Data directory not found. Please run downloadMultiMaps.js first.");
}

// The city a request asked for (no cityId means New York); undefined for unknown ids.
// Own-property check so ids like "constructor" don't resolve to Object.prototype members.
function getCity(cityId = DEFAULT_CITY_ID) {
  return typeof cityId === 'string' && Object.hasOwn(cityGraphs, cityId) ? cityGraphs[cityId] : undefined;
}

module.exports = { cityGraphs, getCity };
