// tests/checks/seo.test.js
const { chromium } = require('playwright');
const check = require('../../server/scanner/checks/seo');

let browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });

async function pageWith(html) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  return page;
}

describe('seo check', () => {
  test('flags missing title as major', async () => {
    const page = await pageWith('<html><head></head><body><h1>Hello</h1></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Missing page title')).toMatchObject({ sev: 'major' });
  });

  test('flags missing meta description as major', async () => {
    const page = await pageWith('<html><head><title>T</title></head><body><h1>H</h1></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Missing meta description')).toMatchObject({ sev: 'major' });
  });

  test('flags missing canonical as minor', async () => {
    const page = await pageWith('<html><head><title>T</title><meta name="description" content="d"></head><body><h1>H</h1></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Missing canonical link')).toMatchObject({ sev: 'minor' });
  });

  test('flags missing OG title as minor', async () => {
    const page = await pageWith('<html><head><title>T</title><meta name="description" content="d"></head><body><h1>H</h1></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Missing Open Graph tags')).toMatchObject({ sev: 'minor' });
  });

  test('flags zero h1 elements as minor', async () => {
    const page = await pageWith('<html><head><title>T</title><meta name="description" content="d"></head><body><p>No h1</p></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Page has no H1 heading')).toMatchObject({ sev: 'minor' });
  });

  test('flags multiple h1 elements as minor', async () => {
    const page = await pageWith('<html><head><title>T</title><meta name="description" content="d"></head><body><h1>A</h1><h1>B</h1></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Multiple H1 headings on page')).toMatchObject({ sev: 'minor' });
  });

  test('returns no issues for a fully optimised page', async () => {
    const html = `<html><head>
      <title>Good page</title>
      <meta name="description" content="A good description.">
      <link rel="canonical" href="http://localhost/">
      <meta property="og:title" content="Good page">
    </head><body><h1>One heading</h1></body></html>`;
    const page = await pageWith(html);
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues).toHaveLength(0);
  });
});
