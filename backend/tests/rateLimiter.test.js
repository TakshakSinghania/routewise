const request = require('supertest');
const rateLimiter = require('../middleware/rateLimiter');

// --- The middleware on its own, with a controlled clock ---------------------------------

function send(limiter, req) {
  let status = 200;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  limiter({ ip: '198.51.100.1', body: {}, ...req }, res, () => {});
  return status;
}

describe('weighted token bucket', () => {
  let now;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  const weighted = () => rateLimiter(30, 10, (req) => req.cost);

  test('a request uses as many tokens as its cost', () => {
    const limiter = weighted();
    expect(send(limiter, { cost: 26 })).toBe(200); // 4 tokens left
    expect(send(limiter, { cost: 5 })).toBe(429);
    expect(send(limiter, { cost: 4 })).toBe(200);
  });

  test('tokens refill over time', () => {
    const limiter = weighted();
    expect(send(limiter, { cost: 30 })).toBe(200);
    expect(send(limiter, { cost: 10 })).toBe(429);
    now += 1000; // 10 tokens per second
    expect(send(limiter, { cost: 10 })).toBe(200);
  });

  test('a cost above the bucket size is capped, so the request can still pass on a full bucket', () => {
    expect(send(weighted(), { cost: 1000 })).toBe(200);
  });

  test('clients are limited separately', () => {
    const limiter = weighted();
    expect(send(limiter, { cost: 30 })).toBe(200);
    expect(send(limiter, { cost: 1 })).toBe(429);
    expect(send(limiter, { cost: 1, ip: '198.51.100.2' })).toBe(200);
  });

  test('two limiters keep separate buckets', () => {
    const a = weighted();
    const b = weighted();
    expect(send(a, { cost: 30 })).toBe(200);
    expect(send(b, { cost: 30 })).toBe(200);
  });
});

// --- The real app ------------------------------------------------------------------------

// A fresh copy of the app (and its limiter) with the given environment variables set while it loads.
function freshApp(env = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  let app;
  jest.isolateModules(() => { app = require('../index'); });
  process.env = saved;
  return app;
}

const NY_STOPS = Array.from({ length: 25 }, (_, i) => ({ lat: 40.707 + (i % 5) * 0.0035, lng: -74.012 + Math.floor(i / 5) * 0.0035 }));
const realDateNow = Date.now;

describe('API rate limiting', () => {
  // Tests that expect a second request to be refused freeze the limiter's clock (Date.now), so a
  // slow machine cannot refill the bucket between the two requests. `now` only moves when a test
  // moves it. afterEach puts the real clock back, also when a test fails.
  let now;
  const freezeClock = () => {
    now = realDateNow();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  };
  afterEach(() => jest.restoreAllMocks());

  test('the audit UI flow (8 clicked stops, then a 7-leg shortest path) is not rate limited', async () => {
    const app = freshApp();
    const stops = NY_STOPS.slice(0, 8);
    const statuses = [];
    for (const stop of stops) statuses.push((await request(app).post('/api/snap').send(stop)).status);
    for (let i = 0; i < 7; i++) {
      statuses.push((await request(app).post('/api/shortest-path').send({ start: stops[i], end: stops[i + 1] })).status);
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(0);
  });

  test('a 25-stop TSP is allowed, but costs enough that an immediate second one is limited', async () => {
    const app = freshApp();
    freezeClock();
    expect((await request(app).post('/api/tsp').send({ stops: NY_STOPS })).status).toBe(200);
    expect((await request(app).post('/api/tsp').send({ stops: NY_STOPS })).status).toBe(429);
  });

  test('the allowance refills with time: 2.2 s later the 26 tokens are back', async () => {
    const app = freshApp();
    freezeClock();
    expect((await request(app).post('/api/tsp').send({ stops: NY_STOPS })).status).toBe(200); // 4 tokens left
    now += 2100; // +21 tokens = 25, one short of the 26 needed
    expect((await request(app).post('/api/tsp').send({ stops: NY_STOPS })).status).toBe(429);
    now += 100; // +1 token = 26
    expect((await request(app).post('/api/tsp').send({ stops: NY_STOPS })).status).toBe(200);
  });

  test('X-Forwarded-For is ignored by default, so faking it does not get a fresh allowance', async () => {
    const app = freshApp();
    freezeClock();
    await request(app).post('/api/tsp').send({ stops: NY_STOPS }); // uses 26 of 30 tokens
    const res = await request(app).post('/api/tsp').set('X-Forwarded-For', '203.0.113.9').send({ stops: NY_STOPS });
    expect(res.status).toBe(429);
  });

  test('with TRUST_PROXY_HOPS=1, clients behind the proxy are limited separately', async () => {
    const app = freshApp({ TRUST_PROXY_HOPS: '1' });
    freezeClock();
    const asClient = (ip) => request(app).post('/api/tsp').set('X-Forwarded-For', ip).send({ stops: NY_STOPS });
    expect((await asClient('203.0.113.1')).status).toBe(200);
    expect((await asClient('203.0.113.1')).status).toBe(429);
    expect((await asClient('203.0.113.2')).status).toBe(200);
  });

  test('the real clock is back after the frozen-clock tests', () => {
    expect(Date.now).toBe(realDateNow);
  });
});
