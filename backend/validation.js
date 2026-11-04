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

module.exports = { isLatLng, stopsError };
