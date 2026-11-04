const request = require('supertest');

// A fresh app with its own rate limiters and its own in-memory database (NODE_ENV=test).
async function freshApp() {
  let app;
  let sequelize;
  let Route;
  jest.isolateModules(() => {
    app = require('../index');
    sequelize = require('../db');
    Route = require('../models/Route');
  });
  await sequelize.sync();
  return { app, Route };
}

const STOPS = [{ lat: 40.7146, lng: -74.0085 }, { lat: 40.7105, lng: -74.0016 }];
const VALID = { name: 'Morning deliveries', algorithm: 'A*', distance: 1234.5, stops: STOPS, path: STOPS };

function expectJsonError(res, status) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(typeof res.body.error).toBe('string');
  expect(JSON.stringify(res.body)).not.toMatch(/\\n\s+at |\.js:\d+|\/Users\/|node_modules|SQLITE|Sequelize/);
}

// Each save costs 3 general rate-limit tokens (1 + 2 stops) of the 30 per client, so the cases
// are split into groups that each get their own app.
describe('POST /api/routes: saving and mass assignment', () => {
  let app;
  beforeAll(async () => { ({ app } = await freshApp()); });

  test('saves a valid route and returns it', async () => {
    const res = await request(app).post('/api/routes').send(VALID);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Morning deliveries', algorithm: 'A*', distance: 1234.5, stops: STOPS, path: STOPS });
    expect(Number.isInteger(res.body.id)).toBe(true);
  });

  test.each([
    ['a client-chosen id', { id: 999 }],
    ['client-chosen timestamps', { createdAt: '1999-01-01', updatedAt: '1999-01-01' }],
    ['an unknown field', { isAdmin: true }],
  ])('rejects %s (mass assignment)', async (_, extra) => {
    const res = await request(app).post('/api/routes').send({ ...VALID, ...extra });
    expectJsonError(res, 400);
    expect(res.body.error).toMatch(new RegExp(Object.keys(extra)[0]));
  });
});

describe('POST /api/routes: field types', () => {
  let app;
  beforeAll(async () => { ({ app } = await freshApp()); });

  test.each([
    ['name that is not a string', { name: 42 }],
    ['empty name', { name: '   ' }],
    ['name over 100 characters', { name: 'x'.repeat(101) }],
    ['unknown algorithm', { algorithm: 'BFS' }],
    ['non-numeric distance', { distance: 'abc' }],
    ['negative distance', { distance: -1 }],
    ['stops that are not points', { stops: [1, 2] }],
    ['a single stop', { stops: [STOPS[0]] }],
    ['a path with an invalid point', { path: [STOPS[0], { lat: 'x', lng: 0 }] }],
  ])('rejects a %s', async (_, override) => {
    expectJsonError(await request(app).post('/api/routes').send({ ...VALID, ...override }), 400);
  });
});

describe('POST /api/routes: size limits', () => {
  let app;
  beforeAll(async () => { ({ app } = await freshApp()); });

  test('rejects a path longer than 2,000 points', async () => {
    const path = Array.from({ length: 2001 }, (_, i) => ({ lat: 40.7, lng: -74 + i * 1e-6 }));
    const res = await request(app).post('/api/routes').send({ ...VALID, path });
    expectJsonError(res, 400);
    expect(res.body.error).toMatch(/2000/);
  });

  test('rejects a request body over 100 kB with a JSON 413', async () => {
    const path = Array.from({ length: 4000 }, (_, i) => ({ lat: 40.7, lng: -74 + i * 1e-6 }));
    expectJsonError(await request(app).post('/api/routes').send({ ...VALID, path }), 413);
  });
});

describe('POST /api/routes write rate limit', () => {
  test('rejected (invalid) saves do not use up the write allowance', async () => {
    const { app } = await freshApp();
    for (let i = 0; i < 10; i++) await request(app).post('/api/routes').send({ ...VALID, id: i }); // 10 x 400
    await new Promise((resolve) => setTimeout(resolve, 1100)); // let the general API limit refill
    expect((await request(app).post('/api/routes').send(VALID)).status).toBe(200);
  });

  test('allows 10 saves per hour per client, then refuses', async () => {
    const { app } = await freshApp();
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post('/api/routes').send(VALID)).status).toBe(200);
    }
    await new Promise((resolve) => setTimeout(resolve, 1100)); // the general API limit refills; the write limit does not
    expectJsonError(await request(app).post('/api/routes').send(VALID), 429);
  });
});

describe('GET /api/routes pagination', () => {
  let app;
  beforeAll(async () => {
    let Route;
    ({ app, Route } = await freshApp());
    // 120 saved routes, oldest first (seeded directly through the model, not the rate-limited API).
    await Route.bulkCreate(Array.from({ length: 120 }, (_, i) => ({
      name: `route ${i}`, stops: STOPS, createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
    })));
  });

  test('returns the newest 50 by default', async () => {
    const res = await request(app).get('/api/routes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
    expect(res.body[0].name).toBe('route 119');
    expect(res.body[49].name).toBe('route 70');
  });

  test('returns up to 100 with ?limit=100 and pages with ?offset', async () => {
    const res = await request(app).get('/api/routes?limit=100&offset=100');
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.name)).toEqual(Array.from({ length: 20 }, (_, i) => `route ${19 - i}`));
  });

  test.each(['limit=101', 'limit=0', 'limit=abc', 'offset=-1', 'limit=5&limit=6'])('rejects ?%s', async (query) => {
    expectJsonError(await request(app).get(`/api/routes?${query}`), 400);
  });
});
