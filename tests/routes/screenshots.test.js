// tests/routes/screenshots.test.js
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const express = require('express');

let app, db;
beforeEach(() => {
  jest.resetModules();
  process.env.DB_PATH = ':memory:';
  db           = require('../../server/db');
  const router = require('../../server/routes/screenshots');
  app = express();
  app.use('/api/screenshots', router);
});

describe('GET /api/screenshots', () => {
  test('returns 400 when scanId is missing', async () => {
    expect((await request(app).get('/api/screenshots?page=/')).status).toBe(400);
  });

  test('returns 400 when page is missing', async () => {
    expect((await request(app).get('/api/screenshots?scanId=1')).status).toBe(400);
  });

  test('returns 404 when screenshot does not exist', async () => {
    expect((await request(app).get('/api/screenshots?scanId=999&page=/')).status).toBe(404);
  });

  test('returns data_url for a saved screenshot', async () => {
    const scanId = db.createScan('https://example.com', 1);
    const issueId = db.createIssue(scanId, { sev: 'minor', type: 'visual', title: 'Test', selector: 'body', page: 'https://example.com/', wcag: '', desc: 'Test issue' });
    db.saveIssueScreenshot(issueId, 'data:image/jpeg;base64,abc');
    const res = await request(app).get(`/api/screenshots?scanId=${scanId}&page=${encodeURIComponent('https://example.com/')}`);
    expect(res.status).toBe(200);
    expect(res.body.dataUrl).toBe('data:image/jpeg;base64,abc');
  });
});
