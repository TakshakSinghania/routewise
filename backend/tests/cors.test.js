const request = require('supertest');

// A fresh copy of the app (own rate limiters, unsynced in-memory test database), loaded with the
// given environment variables (undefined = unset). The environment is restored afterwards.
function freshApp(env = {}) {
  const saved = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    let app;
    jest.isolateModules(() => { app = require('../index'); });
    return app;
  } finally {
    process.env = saved;
  }
}

const PROD = 'https://routewise-seven.vercel.app';
const DEFAULTS = [PROD, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];
const NY = { lat: 40.7146, lng: -74.0085, cityId: 'new_york' };
const STOPS_25 = Array.from({ length: 25 }, (_, i) => ({ lat: 40.707 + (i % 5) * 0.0035, lng: -74.012 + Math.floor(i / 5) * 0.0035 }));

const preflight = (app, origin) => request(app).options('/api/snap')
  .set('Origin', origin).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type');
const post = (app, origin) => request(app).post('/api/snap').set('Origin', origin).send(NY);

async function expectAllowed(app, origin) {
  const pre = await preflight(app, origin);
  expect(pre.status).toBe(204);
  expect(pre.headers['access-control-allow-origin']).toBe(origin);
  expect(pre.headers['access-control-allow-methods']).toMatch(/POST/);
  expect(pre.headers['access-control-allow-headers']).toMatch(/content-type/i);
  expect(pre.headers.vary).toMatch(/Origin/);
  const res = await post(app, origin);
  expect(res.status).toBe(200);
  expect(res.headers['access-control-allow-origin']).toBe(origin);
  expect(res.headers.vary).toMatch(/Origin/);
}

async function expectRejected(app, origin) {
  for (const res of [await preflight(app, origin), await post(app, origin)]) {
    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Origin not allowed' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff'); // security headers still set
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
  }
}

describe('CORS_ORIGINS unset: built-in list of our own frontends', () => {
  let app;
  beforeAll(() => { app = freshApp({ CORS_ORIGINS: undefined }); });

  test.each(DEFAULTS)('allows %s (preflight and request)', (origin) => expectAllowed(app, origin));

  test.each([
    'https://evil.example',
    'https://routewise-seven.vercel.app.evil.example',
    'http://routewise-seven.vercel.app',
    'https://routewise-seven.vercel.app:8443',
    'HTTPS://ROUTEWISE-SEVEN.VERCEL.APP',
    'https://localhost:5173',
    'http://localhost:5174',
    'null',
  ])('rejects %s with a JSON 403 and no CORS headers', (origin) => expectRejected(app, origin));

  test('requests without an Origin header (curl, health checks, the smoke test) work as before', async () => {
    const res = await request(app).post('/api/snap').send(NY);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers.vary).toMatch(/Origin/); // so a cache never reuses this response for a browser
  });
});

test('rejected origins are refused before rate limiting, so they use no tokens', async () => {
  const app = freshApp({ CORS_ORIGINS: undefined });
  for (let i = 0; i < 3; i++) { // 3 x 26 tokens would empty the 30-token bucket twice over
    expect((await request(app).post('/api/tsp').set('Origin', 'https://evil.example').send({ stops: STOPS_25, cityId: 'new_york' })).status).toBe(403);
  }
  expect((await request(app).post('/api/tsp').set('Origin', PROD).send({ stops: STOPS_25, cityId: 'new_york' })).status).toBe(200);
});

describe('CORS_ORIGINS set', () => {
  test('replaces the built-in list (entries are trimmed)', async () => {
    const app = freshApp({ CORS_ORIGINS: ' https://a.example ,https://b.example:8443 ' });
    await expectAllowed(app, 'https://a.example');
    await expectAllowed(app, 'https://b.example:8443');
    await expectRejected(app, PROD);
    await expectRejected(app, 'http://localhost:5173');
  });

  test.each(['', ' ', ','])('an empty value (%j) uses the built-in list', async (value) => {
    const app = freshApp({ CORS_ORIGINS: value });
    await expectAllowed(app, PROD);
    await expectRejected(app, 'https://evil.example');
  });

  test.each([
    '*',
    'null',
    'a.example',
    'https://a.example/',
    'https://a.example/path',
    'https://A.example',
    'https://a.example:443',
    'ftp://a.example',
    'https://a.example, *',
  ])('a value that is not a list of exact origins (%j) stops the app from starting', (value) => {
    expect(() => freshApp({ CORS_ORIGINS: value })).toThrow(/CORS_ORIGINS/);
  });
});
