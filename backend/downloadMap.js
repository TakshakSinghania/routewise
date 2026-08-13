const axios = require('axios');
const fs = require('fs');
const path = require('path');

const MIN_LAT = 26.9000;
const MAX_LAT = 26.9400;
const MIN_LNG = 75.7900;
const MAX_LNG = 75.8400;

async function downloadOSM() {
  console.log('Downloading real road network from OpenStreetMap...');
  const query = `
    [out:json][timeout:60];
    (
      way["highway"]["highway"!~"footway|pedestrian|path|steps"](${MIN_LAT},${MIN_LNG},${MAX_LAT},${MAX_LNG});
    );
    (._;>;);
    out body;
  `;

  try {
    const response = await axios.post('https://overpass-api.de/api/interpreter', `data=${encodeURIComponent(query)}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RouteWiseApp/1.0 (Student Portfolio Project)'
      }
    });

    const elements = response.data.elements;
    console.log(`Downloaded ${elements.length} raw elements.`);

    const nodes = {};
    const edges = [];

    // First pass: store nodes
    elements.forEach(el => {
      if (el.type === 'node') {
        nodes[el.id] = { id: el.id.toString(), lat: el.lat, lng: el.lon };
      }
    });

    // Haversine distance in meters
    function haversineDist(lat1, lon1, lat2, lon2) {
      const R = 6371e3;
      const φ1 = lat1 * Math.PI/180;
      const φ2 = lat2 * Math.PI/180;
      const Δφ = (lat2-lat1) * Math.PI/180;
      const Δλ = (lon2-lon1) * Math.PI/180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // Second pass: store edges (roads)
    elements.forEach(el => {
      if (el.type === 'way' && el.nodes) {
        const isOneWay = el.tags && el.tags.oneway === 'yes';
        for (let i = 0; i < el.nodes.length - 1; i++) {
          const n1 = nodes[el.nodes[i]];
          const n2 = nodes[el.nodes[i+1]];
          
          if (n1 && n2) {
            const dist = haversineDist(n1.lat, n1.lng, n2.lat, n2.lng);
            edges.push({
              source: n1.id,
              target: n2.id,
              weight: dist,
              isOneWay: isOneWay
            });
          }
        }
      }
    });

    // Cleanup nodes that have no edges to save memory
    const activeNodes = new Set();
    edges.forEach(e => {
      activeNodes.add(e.source);
      activeNodes.add(e.target);
    });

    const finalNodes = [];
    Object.values(nodes).forEach(n => {
      if (activeNodes.has(n.id)) {
        finalNodes.push(n);
      }
    });

    const graphData = {
      nodes: finalNodes,
      edges: edges
    };

    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
    
    fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(graphData));
    console.log(`Success! Saved ${finalNodes.length} active road nodes and ${edges.length} road segments to map.json.`);

  } catch (err) {
    console.error('Failed to download OSM data:', err.message);
  }
}

downloadOSM();
