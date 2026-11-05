const crypto = require('crypto');
const request = require('supertest');

const KEY = `test-admin-key-${'k'.repeat(32)}`; // a test value, not a real key

// A fresh app with its own rate limiters and its own in-memory database (NODE_ENV=test), loaded
// with the given environment variables (undefined = unset). By default the admin key is set.
async function freshApp(env = { ADMIN_API_KEY: KEY }) {
  const saved = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  let app;
  let sequelize;
  let Route;
  try {
    jest.isolateModules(() => {
      app = require('../index');
      sequelize = require('../db');
      Route = require('../models/Route');
    });
  } finally {
    process.env = saved;
  }
  await sequelize.sync();
  return { app, Route };
}

const STOPS = [{ lat: 40.7146, lng: -74.0085 }, { lat: 40.7105, lng: -74.0016 }];
const VALID = { name: 'Morning deliveries', algorithm: 'A*', distance: 1234.5, stops: STOPS, path: STOPS };

// Requests with the right key.
const save = (app, body) => request(app).post('/api/routes').set('Authorization', `Bearer ${KEY}`).send(body);
const list = (app, query = '') => request(app).get(`/api/routes${query}`).set('Authorization', `Bearer ${KEY}`);

function expectJsonError(res, status) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(typeof res.body.error).toBe('string');
  expect(JSON.stringify(res.body)).not.toMatch(/\\n\s+at |\.js:\d+|\/Users\/|node_modules|SQLITE|Sequelize/);
}

afterEach(() => jest.restoreAllMocks());

// Each save costs 3 general rate-limit tokens (1 + 2 stops) of the 30 per client, so the cases
// are split into groups that each get their own app.
describe('POST /api/routes: saving and mass assignment', () => {
  let app;
  beforeAll(async () => { ({ app } = await freshApp()); });

  test('saves a valid route and returns it', async () => {
    const res = await save(app, VALID);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Morning deliveries', algorithm: 'A*', distance: 1234.5, stops: STOPS, path: STOPS });
    expect(Number.isInteger(res.body.id)).toBe(true);
  });

  test.each([
    ['a client-chosen id', { id: 999 }],
    ['client-chosen timestamps', { createdAt: '1999-01-01', updatedAt: '1999-01-01' }],
    ['an unknown field', { isAdmin: true }],
  ])('rejects %s (mass assignment)', async (_, extra) => {
    const res = await save(app, { ...VALID, ...extra });
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
    expectJsonError(await save(app, { ...VALID, ...override }), 400);
  });
});

describe('POST /api/routes: size limits', () => {
  let app;
  beforeAll(async () => { ({ app } = await freshApp()); });

  test('rejects a path longer than 2,000 points', async () => {
    const path = Array.from({ length: 2001 }, (_, i) => ({ lat: 40.7, lng: -74 + i * 1e-6 }));
    const res = await save(app, { ...VALID, path });
    expectJsonError(res, 400);
    expect(res.body.error).toMatch(/2000/);
  });

  test('rejects a request body over 100 kB with a JSON 413', async () => {
    const path = Array.from({ length: 4000 }, (_, i) => ({ lat: 40.7, lng: -74 + i * 1e-6 }));
    expectJsonError(await save(app, { ...VALID, path }), 413);
  });
});

describe('POST /api/routes write rate limit', () => {
  test('rejected (invalid) saves do not use up the write allowance', async () => {
    const { app } = await freshApp();
    for (let i = 0; i < 10; i++) await save(app, { ...VALID, id: i }); // 10 x 400
    await new Promise((resolve) => setTimeout(resolve, 1100)); // let the general API limit refill
    expect((await save(app, VALID)).status).toBe(200);
  });

  test('allows 10 saves per hour per client, then refuses', async () => {
    const { app } = await freshApp();
    for (let i = 0; i < 10; i++) {
      expect((await save(app, VALID)).status).toBe(200);
    }
    await new Promise((resolve) => setTimeout(resolve, 1100)); // the general API limit refills; the write limit does not
    expectJsonError(await save(app, VALID), 429);
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
    const res = await list(app);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
    expect(res.body[0].name).toBe('route 119');
    expect(res.body[49].name).toBe('route 70');
  });

  test('returns up to 100 with ?limit=100 and pages with ?offset', async () => {
    const res = await list(app, '?limit=100&offset=100');
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.name)).toEqual(Array.from({ length: 20 }, (_, i) => `route ${19 - i}`));
  });

  test.each(['limit=101', 'limit=0', 'limit=abc', 'offset=-1', 'limit=5&limit=6'])('rejects ?%s', async (query) => {
    expectJsonError(await list(app, `?${query}`), 400);
  });
});

// --- Access: ADMIN_API_KEY ------------------------------------------------------------------

describe('saved routes are switched off while ADMIN_API_KEY is unset', () => {
  test.each([undefined, ''])('ADMIN_API_KEY %j: GET and POST answer 404 like an unknown path, even with a token', async (value) => {
    const { app, Route } = await freshApp({ ADMIN_API_KEY: value });
    for (const res of [
      await request(app).get('/api/routes'),
      await request(app).post('/api/routes').send(VALID),
      await save(app, VALID),
      await list(app),
    ]) {
      expectJsonError(res, 404);
      expect(res.body).toEqual({ error: 'Not found' });
    }
    expect(await Route.count()).toBe(0);
  });
});

describe('a bearer key is required', () => {
  test.each([
    ['no Authorization header', null],
    ['an empty header', ''],
    ['the Basic scheme', `Basic ${KEY}`],
    ['the scheme without a token', 'Bearer'],
    ['the key without a scheme', KEY],
    ['two spaces after Bearer', `Bearer  ${KEY}`],
    ['extra parts after the token', `Bearer ${KEY} extra`],
    ['a character not allowed in a token', `Bearer ${KEY}!`],
    ['a wrong key of the same length', `Bearer ${'x'.repeat(KEY.length)}`],
    ['the key minus its last character', `Bearer ${KEY.slice(0, -1)}`],
    ['the key plus one character', `Bearer ${KEY}x`],
    ['the key in upper case', `Bearer ${KEY.toUpperCase()}`],
  ])('%s: 401 for GET and POST, the same response every time, nothing saved', async (_, header) => {
    const { app, Route } = await freshApp();
    const withHeader = (req) => (header === null ? req : req.set('Authorization', header));
    for (const res of [await withHeader(request(app).get('/api/routes')), await withHeader(request(app).post('/api/routes')).send(VALID)]) {
      expectJsonError(res, 401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
      expect(res.headers['www-authenticate']).toBe('Bearer');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
    expect(await Route.count()).toBe(0);
  });

  test.each(['bearer', 'BEARER'])('the scheme is case-insensitive (%s)', async (scheme) => {
    const { app } = await freshApp();
    expect((await request(app).get('/api/routes').set('Authorization', `${scheme} ${KEY}`)).status).toBe(200);
  });

  test('a key made by the README command (32 random bytes, base64url) works', async () => {
    const key = crypto.randomBytes(32).toString('base64url');
    const { app } = await freshApp({ ADMIN_API_KEY: key });
    expect((await request(app).get('/api/routes').set('Authorization', `Bearer ${key}`)).status).toBe(200);
    expect((await request(app).get('/api/routes').set('Authorization', `Bearer ${KEY}`)).status).toBe(401);
  });

  test('the key is checked before the body: an invalid save without the key gets 401, not 400', async () => {
    const { app } = await freshApp();
    expectJsonError(await request(app).post('/api/routes').send({ ...VALID, id: 1 }), 401);
  });

  test('failed key checks do not use up the write allowance (10 saves per hour)', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now); // the limiters' clock only moves when the test moves it
    const { app } = await freshApp();
    for (let i = 0; i < 10; i++) {
      expectJsonError(await request(app).post('/api/routes').set('Authorization', 'Bearer wrong-key').send(VALID), 401);
    }
    now += 3000; // the general limit (30 tokens, 3 per save) refills; the write limit gains nothing
    for (let i = 0; i < 10; i++) expect((await save(app, VALID)).status).toBe(200);
    now += 3000;
    expectJsonError(await save(app, VALID), 429); // the 11th real save hits the write limit
  });

  test('the comparison is constant-time: SHA-256 digests compared with timingSafeEqual, also for a shorter token', async () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    const { app } = await freshApp();
    expect((await request(app).get('/api/routes').set('Authorization', 'Bearer short')).status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
    const [given, expected] = spy.mock.calls[0];
    expect([given.length, expected.length]).toEqual([32, 32]);
  });

  test.each([
    'k'.repeat(31),
    `${'k'.repeat(32)}!`,
    `${'k'.repeat(16)} ${'k'.repeat(16)}`,
    `${'k'.repeat(16)}=${'k'.repeat(16)}`,
  ])('an ADMIN_API_KEY that is too short or has other characters (%j) stops the app from starting', async (value) => {
    await expect(freshApp({ ADMIN_API_KEY: value })).rejects.toThrow(/ADMIN_API_KEY/);
  });

  test('the key never appears in responses or logs', async () => {
    const logged = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
      jest.spyOn(console, method).mockImplementation((...args) => { logged.push(args.map(String).join(' ')); });
    }
    const { app } = await freshApp();
    const responses = [
      await save(app, VALID),
      await list(app),
      await save(app, { ...VALID, id: 1 }),
      await request(app).get('/api/routes').set('Authorization', `Bearer ${KEY}x`),
    ];
    for (const res of responses) expect(JSON.stringify([res.headers, res.text])).not.toContain(KEY);
    expect(logged.join('\n')).not.toContain(KEY);
  });
});

// --- Capacity --------------------------------------------------------------------------------

describe('at most 1,000 saved routes', () => {
  test('saves sent at the same moment at the limit cannot go over it; nothing is deleted', async () => {
    const { app, Route } = await freshApp();
    await Route.bulkCreate(Array.from({ length: 998 }, (_, i) => ({ name: `route ${i}`, stops: STOPS })));
    const results = await Promise.all(Array.from({ length: 5 }, () => save(app, VALID)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 409, 409, 409]);
    for (const res of results.filter((r) => r.status === 409)) {
      expectJsonError(res, 409);
      expect(res.body.error).toBe('Saved-route limit reached (1000).');
    }
    expect(await Route.count()).toBe(1000);
    expect(await Route.count({ where: { name: 'route 0' } })).toBe(1); // the oldest route is kept

    // When full, listing still works and invalid saves still get their validation error.
    expect((await list(app, '?limit=1')).status).toBe(200);
    expectJsonError(await save(app, { ...VALID, id: 1 }), 400);
  });
});
