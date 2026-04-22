// server/scanner/crawler.js
async function crawl(browser, seedUrl, pageLimit, concurrency = 5) {
  const origin  = new URL(seedUrl).origin;
  const visited = new Set();
  const queue   = [seedUrl];
  const results = [];
  const inProgress = new Set();
  
  async function fetchPage(url) {
    const normalised = url.split('#')[0];
    if (visited.has(normalised)) return null;
    visited.add(normalised);
    
    const page = await browser.newPage();
    let responseHeaders = {};
    page.on('response', res => {
      if (res.request().isNavigationRequest()) responseHeaders = res.headers();
    });

    try {
      await page.goto(normalised, { waitUntil: 'networkidle', timeout: 30000 });
      return { url: normalised, page, responseHeaders };
    } catch (err) {
      console.warn(`[crawler] Skipping ${normalised}: ${err.message}`);
      await page.close().catch(() => {});
      return null;
    }
  }
  
  async function extractLinks(pageResult) {
    if (!pageResult) return;
    const { page, url: pageUrl } = pageResult;
    
    try {
      const links = await page.evaluate((origin) =>
        Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href.split('#')[0])
          .filter(h => h.startsWith(origin) && h !== ''),
        origin
      );
      
      for (const link of links) {
        if (!visited.has(link) && !queue.includes(link) && !inProgress.has(link)) {
          queue.push(link);
        }
      }
    } catch (err) {
      console.warn(`[crawler] Failed to extract links from ${pageUrl}: ${err.message}`);
    }
  }
  
  // Process pages with concurrency control
  while ((queue.length > 0 || inProgress.size > 0) && results.length < pageLimit) {
    // Fill up to concurrency limit
    while (inProgress.size < concurrency && queue.length > 0 && results.length < pageLimit) {
      const url = queue.shift();
      inProgress.add(url);
      
      fetchPage(url).then(async (pageResult) => {
        inProgress.delete(url);
        
        if (pageResult) {
          results.push(pageResult);
          await extractLinks(pageResult);
        }
      }).catch(err => {
        console.warn(`[crawler] Error processing ${url}: ${err.message}`);
        inProgress.delete(url);
      });
    }
    
    // Wait for at least one page to complete if we have pending requests
    if (inProgress.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

module.exports = { crawl };
