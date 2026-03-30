// tests/checks/ada.test.js
const { chromium } = require('playwright');
const check = require('../../server/scanner/checks/ada');

let browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });

async function pageWith(html) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  return page;
}

describe('ada check', () => {
  test('flags missing alt text on an image', async () => {
    const page = await pageWith('<html><body><img src="hero.jpg"></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    const imgIssue = issues.find(i => i.wcag && i.wcag.includes('image-alt'));
    expect(imgIssue).toBeDefined();
    expect(['critical', 'major']).toContain(imgIssue.sev);
  });

  test('flags unlabelled form input', async () => {
    const page = await pageWith('<html><body><form><input type="email"></form></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.length).toBeGreaterThan(0);
  });

  test('returns empty array for an accessible page', async () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <img src="x.jpg" alt="A descriptive alt text">
      <form><label for="email">Email</label><input id="email" type="email"></form>
    </body></html>`;
    const page = await pageWith(html);
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues).toHaveLength(0);
  });

  test('all issues have type ADA and valid severity', async () => {
    const page = await pageWith('<html><body><img src="x.jpg"></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    issues.forEach(i => {
      expect(i.type).toBe('ADA');
      expect(['critical', 'major', 'minor']).toContain(i.sev);
      expect(typeof i.title).toBe('string');
      expect(typeof i.desc).toBe('string');
    });
  });
});
