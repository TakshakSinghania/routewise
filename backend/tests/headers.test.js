const request = require('supertest');
const rateLimiter = require('../middleware/rateLimiter');

// A fresh copy of the app with its own rate limiters (and an unsynced in-memory test database),
// loaded with the given environment variables.
function freshApp(env = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    let app;
    jest.isolateModules(() => { app = require('../index'); });
    return app;
  } finally {
    process.env = saved;
  }
}

const KEY = `test-admin-key-${'k'.repeat(32)}`; // a test value, not a real key

const UNCONDITIONAL = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};
const HSTS = 'max-age=31536000; includeSubDomains';

function expectSecurityHeaders(res) {
  for (const [name, value] of Object.entries(UNCONDITIONAL)) expect(res.headers[name]).toBe(value);
  expect(res.headers['x-powered-by']).toBeUndefined();
}

const NY = { lat: 40.7146, lng: -74.0085 };
const STOPS_25 = Array.from({ length: 25 }, (_, i) => ({ lat: 40.707 + (i % 5) * 0.0035, lng: -74.012 + Math.floor(i / 5) * 0.0035 }));

afterEach(() => jest.restoreAllMocks());

describe('security headers on every kind of response', () => {
  let app;
  beforeAll(() => { app = freshApp({ ADMIN_API_KEY: KEY }); });

  test.each([
    ['200 GET /health', (a) => request(a).get('/health'), 200],
    ['401 missing bearer key', (a) => request(a).get('/api/routes'), 401],
    ['200 POST /api/snap', (a) => request(a).post('/api/snap').send({ ...NY, cityId: 'new_york' }), 200],
    ['400 validation error', (a) => request(a).post('/api/benchmark').send({ stops: [1, 2] }), 400],
    ['400 malformed JSON', (a) => request(a).post('/api/snap').set('Content-Type', 'application/json').send('{"lat":'), 400],
    ['413 oversized body', (a) => request(a).post('/api/snap').set('Content-Type', 'application/json').send(JSON.stringify({ pad: 'x'.repeat(120 * 1024) })), 413],
    ['404 unknown route', (a) => request(a).get('/api/does-not-exist'), 404],
    ['204 CORS preflight', (a) => request(a).options('/api/snap').set('Origin', 'https://routewise-seven.vercel.app').set('Access-Control-Request-Method', 'POST'), 204],
    ['403 CORS origin not allowed', (a) => request(a).post('/api/snap').set('Origin', 'https://example.com').send({ ...NY, cityId: 'new_york' }), 403],
  ])('%s', async (_, send, status) => {
    const res = await send(app);
    expect(res.status).toBe(status);
    expectSecurityHeaders(res);
    expect(res.headers['strict-transport-security']).toBeUndefined(); // plain HTTP
  });

  test('500 internal error (saved routes table missing in the unsynced test database)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {}); // the 5xx handler logs the error
    const res = await request(app).get('/api/routes').set('Authorization', `Bearer ${KEY}`);
    expect(res.status).toBe(500);
    expectSecurityHeaders(res);
  });
});

describe('429 responses', () => {
  test('carry the security headers and Retry-After', async () => {
    const app = freshApp();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now); // frozen clock: no refill between the requests
    expect((await request(app).post('/api/tsp').send({ stops: STOPS_25, cityId: 'new_york' })).status).toBe(200); // 26 of 30 tokens
    const res = await request(app).post('/api/tsp').send({ stops: STOPS_25, cityId: 'new_york' });
    expect(res.status).toBe(429);
    expectSecurityHeaders(res);
    expect(res.headers['retry-after']).toBe('3'); // 22 tokens short at 10 per second = 2.2 s
  });

  test('Retry-After for a 10-per-hour bucket (the saved-routes write limit) is 360 s', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const limiter = rateLimiter(10, 10 / 3600);
    const headers = {};
    let status = 200;
    const res = { status(code) { status = code; return this; }, json() { return this; }, set(name, value) { headers[name] = value; return this; } };
    for (let i = 0; i < 10; i++) limiter({ ip: '198.51.100.7', body: {} }, res, () => {});
    expect(status).toBe(200);
    limiter({ ip: '198.51.100.7', body: {} }, res, () => {});
    expect(status).toBe(429);
    expect(headers['Retry-After']).toBe('360');
  });
});

describe('HSTS only for HTTPS', () => {
  let app;
  beforeAll(() => { app = freshApp(); });

  test('sent when X-Forwarded-Proto is exactly "https" (TLS ends at the proxy)', async () => {
    const res = await request(app).get('/health').set('X-Forwarded-Proto', 'https');
    expect(res.headers['strict-transport-security']).toBe(HSTS);
    expectSecurityHeaders(res);
  });

  test.each(['http', 'HTTPS', 'https,http', 'https, https', 'wss'])('not sent for X-Forwarded-Proto %j', async (value) => {
    const res = await request(app).get('/health').set('X-Forwarded-Proto', value);
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  test('not sent on plain HTTP without the header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  test('the header is used for nothing else: proxy trust stays off', () => {
    expect(app.get('trust proxy')).toBe(false);
  });
});
