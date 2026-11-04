const request = require('supertest');
const app = require('../index');

// Two visitors share one server. Visitor B switches to London; visitor A keeps routing in New York.
// Each Jest test file gets a fresh rate-limit bucket (30 tokens, 10/s); this file stays under it.
const NY_BOX = [[40.705, -74.015], [40.725, -73.995]];
const LONDON_BOX = [[51.495, -0.13], [51.515, -0.11]];
const NY_A = { lat: 40.7146, lng: -74.0085 };
const NY_B = { lat: 40.7105, lng: -74.0016 };
const LONDON_A = { lat: 51.5045, lng: -0.1215 };

// Road nodes can sit slightly outside the box (OSM ways crossing its edge), so allow ~1 km.
const near = ([[minLat, minLng], [maxLat, maxLng]], p, pad = 0.01) =>
  p.lat >= minLat - pad && p.lat <= maxLat + pad && p.lng >= minLng - pad && p.lng <= maxLng + pad;

describe('city selection is per request, not shared between visitors', () => {
  beforeAll(async () => {
    const res = await request(app).post('/api/set-city').send({ cityId: 'london' }); // visitor B
    expect(res.status).toBe(200);
  });

  test('visitor A can still snap in New York', async () => {
    const res = await request(app).post('/api/snap').send({ ...NY_A, cityId: 'new_york' });
    expect(res.status).toBe(200);
    expect(near(NY_BOX, res.body)).toBe(true);
  });

  test('visitor A gets a New York shortest path', async () => {
    const res = await request(app).post('/api/shortest-path').send({ start: NY_A, end: NY_B, algorithm: 'A*', cityId: 'new_york' });
    expect(res.status).toBe(200);
    expect(res.body.distance).toBeGreaterThan(0);
    expect(res.body.path.every(p => near(NY_BOX, p))).toBe(true);
  });

  test('visitor A gets a New York TSP tour', async () => {
    const res = await request(app).post('/api/tsp').send({ stops: [NY_A, NY_B, { lat: 40.7164, lng: -73.9998 }], cityId: 'new_york' });
    expect(res.status).toBe(200);
    expect(res.body.route.every(p => near(NY_BOX, p))).toBe(true);
  });

  test('visitor B snaps in London', async () => {
    const res = await request(app).post('/api/snap').send({ ...LONDON_A, cityId: 'london' });
    expect(res.status).toBe(200);
    expect(near(LONDON_BOX, res.body)).toBe(true);
  });

  test('a request without cityId uses New York, whatever other visitors chose', async () => {
    const res = await request(app).post('/api/snap').send(NY_A);
    expect(res.status).toBe(200);
    expect(near(NY_BOX, res.body)).toBe(true);
  });

  test('New York coordinates with cityId london are outside the London area', async () => {
    const res = await request(app).post('/api/snap').send({ ...NY_A, cityId: 'london' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/London/);
  });

  test('an unknown cityId is rejected with a JSON 400', async () => {
    const res = await request(app).post('/api/snap').send({ ...LONDON_A, cityId: 'atlantis' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cityId/);
  });
});
