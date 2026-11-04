const request = require('supertest');
const app = require('../index');

// Each Jest test file gets a fresh rate-limit bucket (30 tokens, 10/s); this file stays under it.
const NY = { lat: 40.7146, lng: -74.0085 };
const NY_2 = { lat: 40.7105, lng: -74.0016 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

function expectJsonError(res, status) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(typeof res.body.error).toBe('string');
  // No stack frames ("    at fn (file.js:12:3)") or server paths leak to the client.
  expect(JSON.stringify(res.body)).not.toMatch(/\\n\s+at |\.js:\d+|\/Users\/|node_modules/);
}

describe('API input validation and JSON errors', () => {
  test('malformed JSON body returns a JSON 400, not an HTML stack trace', async () => {
    const res = await request(app).post('/api/snap').set('Content-Type', 'application/json').send('{"lat": 40.7,');
    expectJsonError(res, 400);
  });

  test('POST without any JSON body returns a JSON 400, not a 500', async () => {
    expectJsonError(await request(app).post('/api/tsp'), 400);
  });

  test('unknown API route returns a JSON 404', async () => {
    expectJsonError(await request(app).post('/api/does-not-exist').send({}), 404);
  });

  test('POST /api/snap rejects coordinates sent as strings', async () => {
    expectJsonError(await request(app).post('/api/snap').send({ lat: '40.7146', lng: '-74.0085' }), 400);
  });

  test('POST /api/shortest-path rejects an unknown algorithm', async () => {
    expectJsonError(await request(app).post('/api/shortest-path').send({ start: NY, end: NY_2, algorithm: 'BFS' }), 400);
  });

  test('POST /api/shortest-path rejects points far outside the routing area', async () => {
    const res = await request(app).post('/api/shortest-path').send({ start: PARIS, end: NY_2 });
    expectJsonError(res, 400);
    expect(res.body.error).toMatch(/outside the supported routing area/);
  });

  test('POST /api/tsp rejects more than 25 stops before doing any routing', async () => {
    const stops = Array.from({ length: 26 }, (_, i) => ({ lat: 40.707 + (i % 6) * 0.003, lng: -74.013 + Math.floor(i / 6) * 0.004 }));
    // 26 stops cost 27 of the 30 rate-limit tokens, so use a fresh app whose bucket is still full.
    let freshApp;
    jest.isolateModules(() => { freshApp = require('../index'); });
    const res = await request(freshApp).post('/api/tsp').send({ stops });
    expectJsonError(res, 400);
    expect(res.body.error).toMatch(/25/);
  });

  test('POST /api/tsp rejects a stop without valid coordinates', async () => {
    expectJsonError(await request(app).post('/api/tsp').send({ stops: [NY, { lat: 'x' }, NY_2] }), 400);
  });

  test('POST /api/benchmark rejects non-point stops with a JSON 400', async () => {
    expectJsonError(await request(app).post('/api/benchmark').send({ stops: [1, 2, 3] }), 400);
  });

  test('POST /api/benchmark rejects fewer than 2 stops', async () => {
    expectJsonError(await request(app).post('/api/benchmark').send({ stops: [NY] }), 400);
  });

  test('POST /api/set-city rejects inherited object keys such as "constructor"', async () => {
    expectJsonError(await request(app).post('/api/set-city').send({ cityId: 'constructor' }), 400);
  });
});
