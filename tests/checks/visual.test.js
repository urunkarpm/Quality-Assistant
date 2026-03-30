// tests/checks/visual.test.js
const { chromium } = require('playwright');
const check = require('../../server/scanner/checks/visual');

let browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });

async function pageWith(html) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  return page;
}

describe('visual check', () => {
  test('flags low contrast text as major', async () => {
    const page = await pageWith('<html><body style="background:#fff"><p id="t" style="color:#aaa;font-size:16px">Low contrast</p></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.some(i => i.type === 'Visual' && i.sev === 'major' && i.title === 'Insufficient colour contrast')).toBe(true);
  });

  test('does not flag sufficient contrast', async () => {
    const page = await pageWith('<html><body style="background:#fff"><p style="color:#111;font-size:16px">Good contrast</p></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.filter(i => i.title === 'Insufficient colour contrast')).toHaveLength(0);
  });

  test('flags font size below 12px as minor', async () => {
    const page = await pageWith('<html><body><p style="font-size:9px;color:#000">Tiny</p></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Text too small to read')).toMatchObject({ sev: 'minor', type: 'Visual' });
  });

  test('flags image wider than viewport as minor', async () => {
    const page = await pageWith('<html><body><img id="wide" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" style="width:1400px;height:10px" alt="x"></body></html>');
    await page.setViewportSize({ width: 1280, height: 800 });
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Image wider than viewport')).toMatchObject({ sev: 'minor', type: 'Visual' });
  });

  test('all issues have type Visual', async () => {
    const page = await pageWith('<html><body style="background:#fff"><p style="color:#ccc;font-size:8px">x</p></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    issues.forEach(i => expect(i.type).toBe('Visual'));
  });
});
