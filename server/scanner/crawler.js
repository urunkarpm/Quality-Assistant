// server/scanner/crawler.js
async function crawl(browser, seedUrl, pageLimit) {
  const origin  = new URL(seedUrl).origin;
  const visited = new Set();
  const queue   = [seedUrl];
  const results = [];

  while (queue.length > 0 && results.length < pageLimit) {
    const url        = queue.shift();
    const normalised = url.split('#')[0];
    if (visited.has(normalised)) continue;
    visited.add(normalised);

    const page = await browser.newPage();
    let responseHeaders = {};
    page.on('response', res => {
      if (res.url() === normalised) responseHeaders = res.headers();
    });

    try {
      await page.goto(normalised, { waitUntil: 'networkidle', timeout: 30000 });
    } catch {
      await page.close();
      continue;
    }

    results.push({ url: normalised, page, responseHeaders });

    if (results.length < pageLimit) {
      const links = await page.evaluate((origin) =>
        Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href.split('#')[0])
          .filter(h => h.startsWith(origin) && h !== ''),
        origin
      );
      for (const link of links) {
        if (!visited.has(link)) queue.push(link);
      }
    }
  }

  return results;
}

module.exports = { crawl };
