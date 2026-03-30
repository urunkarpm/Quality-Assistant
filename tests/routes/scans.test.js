// tests/routes/scans.test.js
process.env.DB_PATH = ':memory:';

// Mock runner to prevent Playwright launching during route tests
jest.mock('../../server/scanner/runner', () => ({
  computeScore: jest.fn(() => 100),
  runScan:      jest.fn().mockResolvedValue({ issues: [], pagesScanned: 1 }),
}));

const request = require('supertest');
const express = require('express');

let app;
beforeEach(() => {
  jest.resetModules();
  process.env.DB_PATH = ':memory:';
  const router = require('../../server/routes/scans');
  app = express();
  app.use(express.json());
  app.use('/api/scans', router);
});

describe('GET /api/scans', () => {
  test('returns empty array when no scans exist', async () => {
    const res = await request(app).get('/api/scans');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/scans', () => {
  test('returns 400 when url is missing', async () => {
    expect((await request(app).post('/api/scans').send({ pageLimit: 5 })).status).toBe(400);
  });

  test('returns 400 for an invalid url', async () => {
    expect((await request(app).post('/api/scans').send({ url: 'not-a-url', pageLimit: 5 })).status).toBe(400);
  });

  test('returns 400 for missing pageLimit', async () => {
    expect((await request(app).post('/api/scans').send({ url: 'https://example.com' })).status).toBe(400);
  });

  test('returns 202 with scanId for a valid request', async () => {
    const res = await request(app).post('/api/scans').send({ url: 'https://example.com', pageLimit: 1 });
    expect(res.status).toBe(202);
    expect(typeof res.body.scanId).toBe('number');
  });
});

describe('GET /api/scans/:id', () => {
  test('returns 404 for an unknown id', async () => {
    expect((await request(app).get('/api/scans/9999')).status).toBe(404);
  });

  test('returns the scan record for a known id', async () => {
    const { scanId } = (await request(app).post('/api/scans').send({ url: 'https://example.com', pageLimit: 1 })).body;
    const res = await request(app).get(`/api/scans/${scanId}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://example.com');
  });
});
