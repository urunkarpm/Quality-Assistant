// tests/checks/security.test.js
const check = require('../../server/scanner/checks/security');

describe('security check', () => {
  test('flags missing CSP as major', async () => {
    const issues = await check(null, {}, 'http://localhost/');
    expect(issues.find(i => i.title === 'Missing Content-Security-Policy header'))
      .toMatchObject({ sev: 'major', type: 'Security' });
  });

  test('flags missing HSTS as major', async () => {
    const issues = await check(null, {}, 'http://localhost/');
    expect(issues.find(i => i.title === 'Missing Strict-Transport-Security header'))
      .toMatchObject({ sev: 'major', type: 'Security' });
  });

  test('flags missing X-Frame-Options, X-Content-Type-Options, Referrer-Policy as minor', async () => {
    const issues = await check(null, {}, 'http://localhost/');
    ['Missing X-Frame-Options header', 'Missing X-Content-Type-Options header', 'Missing Referrer-Policy header']
      .forEach(title => expect(issues.find(i => i.title === title)).toMatchObject({ sev: 'minor', type: 'Security' }));
  });

  test('returns no issues when all security headers are present', async () => {
    const headers = {
      'content-security-policy':   "default-src 'self'",
      'strict-transport-security': 'max-age=31536000',
      'x-frame-options':           'DENY',
      'x-content-type-options':    'nosniff',
      'referrer-policy':           'no-referrer',
    };
    expect(await check(null, headers, 'http://localhost/')).toHaveLength(0);
  });

  test('all issues have required shape', async () => {
    const issues = await check(null, {}, 'http://localhost/');
    issues.forEach(i => {
      expect(i).toHaveProperty('sev');
      expect(i).toHaveProperty('type', 'Security');
      expect(i).toHaveProperty('title');
      expect(i).toHaveProperty('desc');
      expect(i).toHaveProperty('page', '/');
      expect(i).toHaveProperty('selector', null);
      expect(i).toHaveProperty('wcag', null);
    });
  });
});
