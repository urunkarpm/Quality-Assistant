// tests/checks/content.test.js
const http = require('http');
const { chromium } = require('playwright');
const check = require('../../server/scanner/checks/content');

let browser, server, port;

beforeAll(async () => {
  browser = await chromium.launch();
  server  = http.createServer((req, res) => {
    if      (req.url === '/ok')     { res.writeHead(200); res.end('ok'); }
    else if (req.url === '/broken') { res.writeHead(404); res.end(); }
    else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><body></body></html>'); }
  });
  await new Promise(r => server.listen(0, r));
  port = server.address().port;
});

afterAll(async () => {
  await browser.close();
  await new Promise(r => server.close(r));
});

describe('content check', () => {
  test('flags 404 anchor link as major', async () => {
    const page = await browser.newPage();
    await page.setContent(`<html><body><a href="http://localhost:${port}/broken">Bad link</a></body></html>`);
    const issues = await check(page, {}, `http://localhost:${port}/`);
    await page.close();
    expect(issues.find(i => i.title === 'Broken link')).toMatchObject({ sev: 'major', type: 'Content' });
  });

  test('does not flag a working link', async () => {
    const page = await browser.newPage();
    await page.setContent(`<html><body><a href="http://localhost:${port}/ok">Good</a></body></html>`);
    const issues = await check(page, {}, `http://localhost:${port}/`);
    await page.close();
    expect(issues.filter(i => i.title === 'Broken link')).toHaveLength(0);
  });

  test('flags 404 image src as major', async () => {
    const page = await browser.newPage();
    await page.setContent(`<html><body><img src="http://localhost:${port}/broken" alt="x"></body></html>`);
    const issues = await check(page, {}, `http://localhost:${port}/`);
    await page.close();
    expect(issues.find(i => i.title === 'Broken image')).toMatchObject({ sev: 'major', type: 'Content' });
  });

  test('skips mailto: and tel: links', async () => {
    const page = await browser.newPage();
    await page.setContent('<html><body><a href="mailto:a@b.com">Email</a><a href="tel:123">Phone</a></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues).toHaveLength(0);
  });

  test('all issues have type Content', async () => {
    const page = await browser.newPage();
    await page.setContent(`<html><body><a href="http://localhost:${port}/broken">x</a></body></html>`);
    const issues = await check(page, {}, `http://localhost:${port}/`);
    await page.close();
    issues.forEach(i => expect(i.type).toBe('Content'));
  });
});
