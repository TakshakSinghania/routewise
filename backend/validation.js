// Input checks for the API routes (a trust boundary: request bodies come from anyone).

function isLatLng(p) {
  return p !== null && typeof p === 'object'
    && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

// Returns an error message, or null when `stops` is a valid list of min..max points.
function stopsError(stops, min, max) {
  if (!Array.isArray(stops)) return '`stops` must be an array of { lat, lng } points.';
  if (stops.length < min || stops.length > max) {
    return `Between ${min} and ${max} stops are required (got ${stops.length}).`;
  }
  const bad = stops.findIndex(s => !isLatLng(s));
  return bad === -1 ? null : `Stop ${bad} is not a valid { lat, lng } point.`;
}

const SAVED_ROUTE_FIELDS = ['name', 'algorithm', 'distance', 'stops', 'path'];
const MAX_SAVED_STOPS = 25;
const MAX_SAVED_PATH_POINTS = 2000; // a 25-stop tour is ~1,000-1,500 road points

// A saved route may contain only these fields, each type-checked (no client-chosen id or
// timestamps). Returns { error } or { route } holding just the accepted values.
function parseSavedRoute(body) {
  const unknown = Object.keys(body).filter(key => !SAVED_ROUTE_FIELDS.includes(key));
  if (unknown.length > 0) {
    return { error: `Unknown field(s): ${unknown.join(', ')}. Allowed: ${SAVED_ROUTE_FIELDS.join(', ')}.` };
  }
  const { name, algorithm, distance, stops, path } = body;
  if (name !== undefined && (typeof name !== 'string' || name.trim() === '' || name.length > 100)) {
    return { error: '`name` must be a non-empty string of at most 100 characters.' };
  }
  if (algorithm != null && !['Dijkstra', 'A*', 'TSP'].includes(algorithm)) {
    return { error: "`algorithm` must be 'Dijkstra', 'A*' or 'TSP'." };
  }
  if (distance != null && !(Number.isFinite(distance) && distance >= 0)) {
    return { error: '`distance` must be a number >= 0.' };
  }
  const invalidStops = stopsError(stops, 2, MAX_SAVED_STOPS);
  if (invalidStops) return { error: invalidStops };
  if (path != null && (!Array.isArray(path) || path.length > MAX_SAVED_PATH_POINTS || !path.every(isLatLng))) {
    return { error: `\`path\` must be an array of at most ${MAX_SAVED_PATH_POINTS} { lat, lng } points.` };
  }

  const point = ({ lat, lng }) => ({ lat, lng }); // drop any extra keys inside points
  const route = { stops: stops.map(point) };
  if (name !== undefined) route.name = name.trim();
  if (algorithm != null) route.algorithm = algorithm;
  if (distance != null) route.distance = distance;
  if (path != null) route.path = path.map(point);
  return { route };
}

module.exports = { isLatLng, stopsError, parseSavedRoute };
