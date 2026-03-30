// tests/db.test.js
describe('database', () => {
  let db;

  beforeEach(() => {
    jest.resetModules();
    process.env.DB_PATH = ':memory:';
    db = require('../server/db');
  });

  test('createScan returns an id and getScan retrieves it', () => {
    const id = db.createScan('https://example.com', 10);
    expect(typeof id).toBe('number');
    const scan = db.getScan(id);
    expect(scan.url).toBe('https://example.com');
    expect(scan.page_limit).toBe(10);
    expect(scan.status).toBe('running');
  });

  test('updateScan updates status, score, and pages_scanned', () => {
    const id = db.createScan('https://example.com', 5);
    db.updateScan(id, { status: 'complete', score: 78, pages_scanned: 3, finished_at: 1000 });
    const scan = db.getScan(id);
    expect(scan.status).toBe('complete');
    expect(scan.score).toBe(78);
    expect(scan.pages_scanned).toBe(3);
  });

  test('createIssue and getIssues round-trip', () => {
    const scanId = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'critical', type: 'ADA', title: 'Missing alt', selector: 'img', page: '/', wcag: 'image-alt (1.1.1)', desc: 'No alt text.' });
    const issues = db.getIssues(scanId);
    expect(issues).toHaveLength(1);
    expect(issues[0].sev).toBe('critical');
    expect(issues[0].status).toBe('open');
  });

  test('updateIssueStatus persists the new status', () => {
    const scanId = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'minor', type: 'SEO', title: 'No title', selector: null, page: '/', wcag: null, desc: 'Missing title.' });
    const issue = db.getIssues(scanId)[0];
    db.updateIssueStatus(issue.id, 'resolved');
    expect(db.getIssues(scanId)[0].status).toBe('resolved');
  });

  test('getScans returns all scans ordered by started_at desc', () => {
    db.createScan('https://a.com', 1);
    db.createScan('https://b.com', 5);
    const scans = db.getScans();
    expect(scans).toHaveLength(2);
    expect(scans[0].started_at).toBeGreaterThanOrEqual(scans[1].started_at);
  });
});
