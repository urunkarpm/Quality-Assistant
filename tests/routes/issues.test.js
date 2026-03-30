// tests/routes/issues.test.js
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const express = require('express');

let app, db;
beforeEach(() => {
  jest.resetModules();
  process.env.DB_PATH = ':memory:';
  db           = require('../../server/db');
  const router = require('../../server/routes/issues');
  app = express();
  app.use(express.json());
  app.use('/api/issues', router);
});

describe('GET /api/issues', () => {
  test('returns 400 when scanId is missing', async () => {
    expect((await request(app).get('/api/issues')).status).toBe(400);
  });

  test('returns issues for a valid scanId', async () => {
    const scanId = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'critical', type: 'ADA', title: 'Test issue', selector: null, page: '/', wcag: null, desc: 'Desc' });
    const res = await request(app).get(`/api/issues?scanId=${scanId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Test issue');
  });
});

describe('PATCH /api/issues/:id', () => {
  test('updates issue status to resolved', async () => {
    const scanId  = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'minor', type: 'SEO', title: 'T', selector: null, page: '/', wcag: null, desc: 'D' });
    const issueId = db.getIssues(scanId)[0].id;
    const res     = await request(app).patch(`/api/issues/${issueId}`).send({ status: 'resolved' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
  });

  test('returns 400 for an invalid status value', async () => {
    const scanId  = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'minor', type: 'SEO', title: 'T', selector: null, page: '/', wcag: null, desc: 'D' });
    const issueId = db.getIssues(scanId)[0].id;
    expect((await request(app).patch(`/api/issues/${issueId}`).send({ status: 'invalid' })).status).toBe(400);
  });

  test('returns 404 for a non-existent issue id', async () => {
    expect((await request(app).patch('/api/issues/9999').send({ status: 'resolved' })).status).toBe(404);
  });
});
