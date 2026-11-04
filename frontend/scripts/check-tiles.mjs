// Integration check (needs internet, not part of `npm test`): fetch one real tile from
// TILE_URL and make sure it is map imagery, not a placeholder. Run: npm run check:tiles
import { TILE_URL } from '../src/tiles.js';

// Lower Manhattan at zoom 14, inside the New York routing area.
const url = TILE_URL.replace('{s}', 'a').replace('{z}', '14').replace('{x}', '4824').replace('{y}', '6159').replace('{r}', '');
const res = await fetch(url, { headers: { 'User-Agent': 'RouteWise-tile-check/1.0 (+https://github.com/TakshakSinghania/routewise)' } });
const bytes = (await res.arrayBuffer()).byteLength;
const type = res.headers.get('content-type') || '';

// CARTO's "API KEY REQUIRED" placeholder is 2,513 bytes; a real tile of this area is ~40 KB.
const ok = res.ok && type.startsWith('image/png') && bytes > 10_000;
console.log(`${ok ? 'OK  ' : 'FAIL'} HTTP ${res.status} ${type} ${bytes} B  ${url}`);
process.exit(ok ? 0 : 1);
