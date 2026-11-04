const request = require('supertest');
const rateLimiter = require('../middleware/rateLimiter');

// --- The middleware on its own, with a controlled clock ---------------------------------

function send(limiter, req) {
  let status = 200;
  const res = { status(code) { status = code; return this; }, json() { return this; }, set() { return this; } };
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

// --- Client keys (S3) ---------------------------------------------------------------------

describe('client keys', () => {
  const { clientKey } = rateLimiter;

  test.each([
    ['IPv4 stays as is', '203.0.113.5', '203.0.113.5'],
    ['IPv4-mapped IPv6 counts as the IPv4 address', '::ffff:203.0.113.5', '203.0.113.5'],
    ['IPv4-mapped, uppercase', '::FFFF:203.0.113.5', '203.0.113.5'],
    ['IPv4-mapped, fully written out', '0:0:0:0:0:ffff:203.0.113.5', '203.0.113.5'],
    ['IPv4-mapped, hex form', '::ffff:cb00:7105', '203.0.113.5'],
    ['IPv6 grouped by /64', '2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['IPv6, other host in the same /64', '2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
    ['IPv6, uppercase', '2001:DB8:1:2::ABCD', '2001:db8:1:2::/64'],
    ['IPv6, expanded with leading zeros', '2001:0db8:0001:0002:0000:0000:0000:0001', '2001:db8:1:2::/64'],
    ['IPv6, compressed in the first half', '2001:db8::1', '2001:db8:0:0::/64'],
    ['IPv6 with a zone identifier', 'fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['IPv6, other zone identifier, same /64', 'fe80::2%en0', 'fe80:0:0:0::/64'],
    ['missing address', undefined, 'unknown'],
  ])('%s: %s -> %s', (_, ip, key) => expect(clientKey(ip)).toBe(key));

  test.each([
    ['neighbouring IPv4 addresses', '203.0.113.5', '203.0.113.6'],
    ['neighbouring IPv4-mapped addresses', '::ffff:203.0.113.5', '::ffff:203.0.113.6'],
    ['neighbouring /64 blocks', '2001:db8:1:2::1', '2001:db8:1:3::1'],
    ['different /48 prefixes', '2001:db8::1', '2001:db9::1'],
    ['::fffe: is not IPv4-mapped', '::fffe:203.0.113.5', '203.0.113.5'],
    ['an IPv4 address and an IPv6 address with the same digits', '1.2.3.4', '::102:304'],
    ['IPv4-mapped and an IPv6 host that only ends with ffff', '::ffff:1.2.3.4', '1:2:3:4::ffff:102:304'],
  ])('keeps apart %s', (_, a, b) => expect(clientKey(a)).not.toBe(clientKey(b)));
});

describe('shared and separate allowances', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(1_000_000));
  afterEach(() => jest.restoreAllMocks());

  test('an IPv4 client and its IPv4-mapped form share one allowance', () => {
    const limiter = rateLimiter(30, 10, (req) => req.cost);
    expect(send(limiter, { ip: '::ffff:203.0.113.5', cost: 30 })).toBe(200);
    expect(send(limiter, { ip: '203.0.113.5', cost: 1 })).toBe(429);
  });

  test('addresses in one IPv6 /64 share one allowance', () => {
    const limiter = rateLimiter(30, 10, (req) => req.cost);
    expect(send(limiter, { ip: '2001:db8:1:2::1', cost: 30 })).toBe(200);
    expect(send(limiter, { ip: '2001:DB8:1:2:abcd::99', cost: 1 })).toBe(429);
  });

  test('different IPv6 /64 blocks get separate allowances', () => {
    const limiter = rateLimiter(30, 10, (req) => req.cost);
    expect(send(limiter, { ip: '2001:db8:1:2::1', cost: 30 })).toBe(200);
    expect(send(limiter, { ip: '2001:db8:1:3::1', cost: 30 })).toBe(200);
  });

  test('concurrent requests from one client never exceed the allowance', () => {
    const limiter = rateLimiter(30, 10, () => 1);
    const statuses = Array.from({ length: 40 }, () => send(limiter, { ip: '203.0.113.9' }));
    expect(statuses.filter((s) => s === 200)).toHaveLength(30);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
  });
});

describe('idle-bucket cleanup (not a hard memory cap)', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  test('a bucket that has refilled completely is removed by the next sweep', () => {
    const limiter = rateLimiter(30, 10, () => 1);
    send(limiter, { ip: '203.0.113.20' });
    expect(limiter.clientCount()).toBe(1);
    jest.advanceTimersByTime(59_000);
    expect(limiter.clientCount()).toBe(1); // no sweep yet
    jest.advanceTimersByTime(1_000);
    expect(limiter.clientCount()).toBe(0);
  });

  test('a partly used bucket survives the sweep and stays limited (no allowance reset)', () => {
    const limiter = rateLimiter(10, 10 / 3600, () => 1); // the saved-routes write limit
    for (let i = 0; i < 10; i++) send(limiter, { ip: '203.0.113.21' });
    jest.advanceTimersByTime(60_000); // sweep runs; only ~0.17 tokens are back
    expect(limiter.clientCount()).toBe(1);
    expect(send(limiter, { ip: '203.0.113.21' })).toBe(429);
    jest.advanceTimersByTime(3_600_000); // fully refilled, then removed by a sweep
    expect(limiter.clientCount()).toBe(0);
    expect(send(limiter, { ip: '203.0.113.21' })).toBe(200);
  });

  test('refill still works across sweeps', () => {
    const limiter = rateLimiter(30, 10, (req) => req.cost);
    expect(send(limiter, { ip: '203.0.113.22', cost: 30 })).toBe(200);
    jest.advanceTimersByTime(1_000); // +10 tokens
    expect(send(limiter, { ip: '203.0.113.22', cost: 10 })).toBe(200);
    expect(send(limiter, { ip: '203.0.113.22', cost: 1 })).toBe(429);
  });

  test('entries from many distinct clients are released once they go idle', () => {
    const limiter = rateLimiter(30, 10, () => 1);
    for (let i = 0; i < 100_000; i++) send(limiter, { ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` });
    expect(limiter.clientCount()).toBe(100_000);
    jest.advanceTimersByTime(60_000);
    expect(limiter.clientCount()).toBe(0);
  });

  test('many addresses inside one IPv6 /64 use a single entry', () => {
    const limiter = rateLimiter(30, 10, () => 0);
    for (let i = 0; i < 100_000; i++) send(limiter, { ip: `2001:db8:1:2:0:0:${(i >> 16).toString(16)}:${(i & 0xffff).toString(16)}` });
    expect(limiter.clientCount()).toBe(1);
  });
});

describe('cleanup timer', () => {
  test('does not keep the process alive', () => {
    const { spawnSync } = require('child_process');
    const script = `require(${JSON.stringify(require.resolve('../middleware/rateLimiter'))})(30, 10);`;
    const started = Date.now();
    const result = spawnSync(process.execPath, ['-e', script], { timeout: 10_000 });
    expect(result.status).toBe(0);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('concurrent HTTP requests', () => {
  afterEach(() => jest.restoreAllMocks());

  test('40 parallel requests: exactly 30 pass the limiter', async () => {
    const app = freshApp();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now()); // no refill during the burst
    const statuses = await Promise.all(Array.from({ length: 40 }, () => request(app).post('/api/snap').send({})));
    expect(statuses.filter((r) => r.status === 429)).toHaveLength(10);
    expect(statuses.filter((r) => r.status === 400)).toHaveLength(30); // passed the limiter, then failed validation
  });
});
