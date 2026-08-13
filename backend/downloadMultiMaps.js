const fs = require('fs');
const path = require('path');
const { downloadOSM } = require('./services/mapLoader');

const CITIES = {
  'Seoul': { minLat: 37.556, minLng: 126.968, maxLat: 37.576, maxLng: 126.988 }
};

const delay = ms => new Promise(res => setTimeout(res, ms));

async function downloadAll() {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }

  for (const [cityName, bounds] of Object.entries(CITIES)) {
    console.log(`\n--- Starting download for ${cityName} ---`);
    try {
      const graphData = await downloadOSM(bounds.minLat, bounds.minLng, bounds.maxLat, bounds.maxLng);
      const filename = `map_${cityName.toLowerCase().replace(' ', '_')}.json`;
      
      const payload = {
        name: cityName,
        bounds: [[bounds.minLat, bounds.minLng], [bounds.maxLat, bounds.maxLng]],
        center: [
          (bounds.minLat + bounds.maxLat) / 2, 
          (bounds.minLng + bounds.maxLng) / 2
        ],
        ...graphData
      };
      
      fs.writeFileSync(path.join(dir, filename), JSON.stringify(payload));
      console.log(`Successfully saved ${cityName} to ${filename}`);
      
      // Delay to avoid overwhelming the free Overpass API rate limit
      console.log("Waiting 5 seconds before next download...");
      await delay(5000);
    } catch (err) {
      console.error(`Failed to download ${cityName}:`, err.message);
    }
  }
  
  console.log("\nAll cities downloaded!");
}

downloadAll();
