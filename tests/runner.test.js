// tests/runner.test.js
const { computeScore } = require('../server/scanner/runner');

describe('computeScore', () => {
  test('returns 100 for no issues', () => {
    expect(computeScore([])).toBe(100);
  });

  test('deducts 10 per critical issue', () => {
    expect(computeScore([{ sev: 'critical' }, { sev: 'critical' }])).toBe(80);
  });

  test('deducts 4 per major issue', () => {
    expect(computeScore([{ sev: 'major' }, { sev: 'major' }, { sev: 'major' }])).toBe(88);
  });

  test('deducts 1 per minor issue', () => {
    expect(computeScore(Array(10).fill({ sev: 'minor' }))).toBe(90);
  });

  test('floors at 0', () => {
    expect(computeScore(Array(15).fill({ sev: 'critical' }))).toBe(0);
  });

  test('combines all severities correctly: 2 critical + 1 major + 2 minor = 74', () => {
    const issues = [{ sev: 'critical' }, { sev: 'critical' }, { sev: 'major' }, { sev: 'minor' }, { sev: 'minor' }];
    expect(computeScore(issues)).toBe(74);
  });
});

describe('runScan onScreenshot callback', () => {
  test('onScreenshot is optional — runScan signature accepts 6 params (with new options)', () => {
    const { runScan } = require('../server/scanner/runner');
    // Updated signature: runScan(url, pageLimit, opts, onIssue, onIssueScreenshot, onProgress)
    expect(runScan.length).toBe(6);
  });
});
