// tests/checks/perf.test.js
const check = require('../../server/scanner/checks/perf');

describe('perf check', () => {
  test('returns critical for load time > 5s', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 5500, requestCount: 10, totalBytes: 500_000 });
    expect(issues.find(i => i.title === 'Very slow page load')).toMatchObject({ sev: 'critical', type: 'Performance' });
  });

  test('returns major for load time between 3s and 5s', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 3500, requestCount: 10, totalBytes: 500_000 });
    expect(issues.find(i => i.title === 'Slow page load')).toMatchObject({ sev: 'major', type: 'Performance' });
  });

  test('returns no load-time issue for pages under 3s', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 1000, requestCount: 10, totalBytes: 500_000 });
    expect(issues.find(i => i.title.includes('load'))).toBeUndefined();
  });

  test('returns minor for more than 100 requests', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 1000, requestCount: 120, totalBytes: 500_000 });
    expect(issues.find(i => i.title === 'Excessive number of HTTP requests')).toMatchObject({ sev: 'minor' });
  });

  test('returns major for page weight > 2MB', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 1000, requestCount: 10, totalBytes: 2_200_000 });
    expect(issues.find(i => i.title === 'Large page weight')).toMatchObject({ sev: 'major' });
  });

  test('returns no issues for a healthy page', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 800, requestCount: 30, totalBytes: 400_000 });
    expect(issues).toHaveLength(0);
  });
});
