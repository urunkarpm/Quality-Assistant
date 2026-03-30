// tests/crawler.test.js
const http = require('http');
const { chromium } = require('playwright');
const { crawl } = require('../server/scanner/crawler');

let browser, server, port;

beforeAll(async () => {
  browser = await chromium.launch();
  server  = http.createServer();
  await new Promise(r => server.listen(0, r));
  port = server.address().port;

  server.on('request', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html', 'x-test': 'yes' });
    if (req.url === '/') {
      res.end(`<html><body>
        <a href="http://localhost:${port}/b">B</a>
        <a href="http://localhost:${port}/c">C</a>
        <a href="https://external.com">External</a>
      </body></html>`);
    } else if (req.url === '/b') {
      res.end('<html><body><p>Page B</p></body></html>');
    } else if (req.url === '/c') {
      res.end('<html><body><p>Page C</p></body></html>');
    } else {
      res.writeHead(404); res.end();
    }
  });
});

afterAll(async () => {
  await browser.close();
  await new Promise(r => server.close(r));
});

describe('crawler', () => {
  test('returns seed URL as the only result when pageLimit is 1', async () => {
    const pages = await crawl(browser, `http://localhost:${port}/`, 1);
    expect(pages).toHaveLength(1);
    expect(pages[0].url).toBe(`http://localhost:${port}/`);
    await Promise.all(pages.map(p => p.page.close()));
  });

  test('follows same-origin links up to pageLimit', async () => {
    const pages = await crawl(browser, `http://localhost:${port}/`, 3);
    const urls  = pages.map(p => p.url);
    expect(urls).toContain(`http://localhost:${port}/`);
    expect(urls).toContain(`http://localhost:${port}/b`);
    expect(urls).toContain(`http://localhost:${port}/c`);
    expect(pages).toHaveLength(3);
    await Promise.all(pages.map(p => p.page.close()));
  });

  test('does not follow external links', async () => {
    const pages = await crawl(browser, `http://localhost:${port}/`, 10);
    expect(pages.every(p => p.url.startsWith(`http://localhost:${port}`))).toBe(true);
    await Promise.all(pages.map(p => p.page.close()));
  });

  test('each result has url, page object, and responseHeaders', async () => {
    const pages = await crawl(browser, `http://localhost:${port}/`, 1);
    expect(pages[0]).toHaveProperty('url');
    expect(pages[0]).toHaveProperty('page');
    expect(pages[0]).toHaveProperty('responseHeaders');
    expect(pages[0].responseHeaders['x-test']).toBe('yes');
    await pages[0].page.close();
  });
});
