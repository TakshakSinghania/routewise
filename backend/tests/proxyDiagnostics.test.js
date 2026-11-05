const express = require('express');
const request = require('supertest');

const KEY = `test-admin-key-${'k'.repeat(32)}`; // a test value, not a real key

// A fresh copy of the app, loaded with the given environment variables (undefined = unset).
function freshApp(env) {
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

const ON = { ADMIN_API_KEY: KEY, PROXY_DIAGNOSTICS: '1', TRUST_PROXY_HOPS: undefined };
const diagnose = (app, xff) => {
  const req = request(app).get('/api/debug/proxy').set('Authorization', `Bearer ${KEY}`);
  return xff === undefined ? req : req.set('X-Forwarded-For', xff);
};

describe('switched off unless PROXY_DIAGNOSTICS=1 and ADMIN_API_KEY is set', () => {
  test.each([
    ['PROXY_DIAGNOSTICS unset', { ...ON, PROXY_DIAGNOSTICS: undefined }],
    ['PROXY_DIAGNOSTICS=0', { ...ON, PROXY_DIAGNOSTICS: '0' }],
    ['PROXY_DIAGNOSTICS=true', { ...ON, PROXY_DIAGNOSTICS: 'true' }],
    ['no ADMIN_API_KEY', { ...ON, ADMIN_API_KEY: undefined }],
  ])('%s: 404 like an unknown path', async (_, env) => {
    const res = await diagnose(freshApp(env));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('PROXY_DIAGNOSTICS=1 with ADMIN_API_KEY', () => {
  let app;
  beforeAll(() => { app = freshApp(ON); });

  test.each([[null], ['Bearer wrong-key']])('needs the bearer key (Authorization: %s)', async (header) => {
    const req = request(app).get('/api/debug/proxy');
    const res = await (header === null ? req : req.set('Authorization', header));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('shows the caller how its own request reaches the app', async () => {
    const res = await diagnose(app, '203.0.113.7, 198.51.100.1')
      .set('CF-Connecting-IP', '203.0.113.7').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
    const { socket } = res.body;
    expect(typeof socket).toBe('string');
    expect(res.body).toEqual({
      socket,
      xForwardedFor: '203.0.113.7, 198.51.100.1',
      cfConnectingIp: '203.0.113.7',
      xForwardedProto: 'https',
      reqIp: socket, // proxy trust is off, so Express uses the socket address
      trustProxy: false,
      chain: [socket, '198.51.100.1', '203.0.113.7'],
    });
  });

  test('without forwarding headers: nulls, and a chain of just the socket address', async () => {
    const res = await diagnose(app);
    expect(res.body).toMatchObject({ xForwardedFor: null, cfConnectingIp: null, xForwardedProto: null, chain: [res.body.socket] });
  });

  test('changes nothing else: proxy trust stays off', () => {
    expect(app.get('trust proxy')).toBe(false);
  });
});

// chain[n] (or its last entry, if shorter) must be exactly what Express would use as req.ip with
// TRUST_PROXY_HOPS=n, so the measurement can name n without ever turning proxy trust on.
describe('chain matches Express with trust proxy set to 1, 2 and 3 hops', () => {
  let app;
  beforeAll(() => { app = freshApp(ON); });

  async function reqIpWithHops(hops, xff) {
    const reference = express();
    reference.set('trust proxy', hops); // what index.js does with TRUST_PROXY_HOPS
    reference.get('/', (req, res) => res.json({ ip: req.ip }));
    const req = request(reference).get('/');
    return (await (xff === undefined ? req : req.set('X-Forwarded-For', xff))).body.ip;
  }

  test.each([
    undefined,
    '203.0.113.7',
    '203.0.113.7, 198.51.100.1',
    '10.0.0.1,198.51.100.1 ,  203.0.113.7',
    '203.0.113.7,,198.51.100.1',
    '2001:db8::1, 198.51.100.1',
  ])('X-Forwarded-For %j', async (xff) => {
    const { chain } = (await diagnose(app, xff)).body;
    for (const hops of [1, 2, 3]) {
      expect(chain[Math.min(hops, chain.length - 1)]).toBe(await reqIpWithHops(hops, xff));
    }
  });
});
