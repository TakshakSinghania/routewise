const request = require('supertest');
const app = require('../index');

describe('Routewise API Endpoints', () => {
  test('GET /health returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('POST /api/set-city switches active city metadata', async () => {
    const res = await request(app)
      .post('/api/set-city')
      .send({ cityId: 'london' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.name).toBe('London');
    expect(res.body.nodesLoaded).toBeGreaterThan(0);
  });

  test('POST /api/set-city returns 400 for unknown city', async () => {
    const res = await request(app)
      .post('/api/set-city')
      .send({ cityId: 'unknown_city_xyz' });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('City not found in local cache.');
  });

  test('POST /api/snap rejects missing coordinates', async () => {
    const res = await request(app)
      .post('/api/snap')
      .send({});
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing coordinates');
  });

  test('POST /api/benchmark calculates approximation vs exact TSP for sample stops', async () => {
    const stops = [
      { lat: 51.5074, lng: -0.1278 },
      { lat: 51.5155, lng: -0.1419 },
      { lat: 51.5200, lng: -0.0900 }
    ];

    const res = await request(app)
      .post('/api/benchmark')
      .send({ stops });

    expect(res.status).toBe(200);
    expect(res.body.stopsCount).toBe(3);
    expect(res.body.approximation).toHaveProperty('timeMs');
    expect(res.body.approximation).toHaveProperty('distance');
    expect(res.body.exact).toHaveProperty('timeMs');
    expect(res.body.exact).toHaveProperty('distance');
  });
});
