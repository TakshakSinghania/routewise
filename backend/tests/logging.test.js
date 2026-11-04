const util = require('util');
const request = require('supertest');
const app = require('../index');

// Captures everything the server writes through console.* while a test's requests run.
function captureConsole() {
  const lines = [];
  const spies = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
    jest.spyOn(console, method).mockImplementation((...args) => { lines.push(util.format(...args)); }));
  return { text: () => lines.join('\n'), restore: () => spies.forEach((spy) => spy.mockRestore()) };
}

// Distinctive New York coordinates, so any appearance in the logs is unambiguous.
const A = { lat: 40.71463, lng: -74.00851 };
const B = { lat: 40.71052, lng: -74.00163 };
const C = { lat: 40.71641, lng: -73.99983 };
const D = { lat: 40.70921, lng: -74.00692 };
const asText = (...points) => points.flatMap((p) => [String(p.lat), String(p.lng)]);

describe('routing requests do not log user locations', () => {
  let logs;
  beforeEach(() => { logs = captureConsole(); });
  afterEach(() => logs.restore());

  function expectNotLogged(fragments) {
    const text = logs.text();
    for (const fragment of fragments) expect(text).not.toContain(fragment);
    expect(text).not.toMatch(/SNAP|cityId|new_york/); // no raw request bodies
  }

  test('POST /api/snap', async () => {
    const res = await request(app).post('/api/snap').send({ ...A, cityId: 'new_york' });
    expect(res.status).toBe(200);
    expectNotLogged([...asText(A, res.body), res.body.id]);
  });

  test.each(['Dijkstra', 'A*'])('POST /api/shortest-path (%s)', async (algorithm) => {
    const res = await request(app).post('/api/shortest-path').send({ start: A, end: B, algorithm, cityId: 'new_york' });
    expect(res.status).toBe(200);
    expectNotLogged(asText(A, B, res.body.path[0], res.body.path[res.body.path.length - 1]));
  });

  test('POST /api/tsp', async () => {
    const res = await request(app).post('/api/tsp').send({ stops: [A, B, C, D], cityId: 'new_york' });
    expect(res.status).toBe(200);
    expectNotLogged(asText(A, B, C, D, res.body.route[0]));
  });

  test('a rejected request does not log its body either', async () => {
    const res = await request(app).post('/api/shortest-path').send({ start: A, end: B, algorithm: 'BFS', cityId: 'new_york' });
    expect(res.status).toBe(400);
    expectNotLogged(asText(A, B));
  });
});
