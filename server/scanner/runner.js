// server/scanner/runner.js
const { chromium }  = require('playwright');
const { crawl }     = require('./crawler');
const adaCheck      = require('./checks/ada');
const visualCheck   = require('./checks/visual');
const contentCheck  = require('./checks/content');
const seoCheck      = require('./checks/seo');
const perfCheck     = require('./checks/perf');
const securityCheck = require('./checks/security');

function computeScore(issues) {
  const c = issues.filter(i => i.sev === 'critical').length;
  const m = issues.filter(i => i.sev === 'major').length;
  const n = issues.filter(i => i.sev === 'minor').length;
  return Math.max(0, 100 - c * 10 - m * 4 - n);
}

async function runScan(url, pageLimit, onIssue, onScreenshot, onProgress) {
  const browser   = await chromium.launch();
  const allIssues = [];

  const checks = [
    { fn: adaCheck,      name: 'ADA / WCAG' },
    { fn: visualCheck,   name: 'Visual' },
    { fn: contentCheck,  name: 'Content' },
    { fn: seoCheck,      name: 'SEO' },
    { fn: securityCheck, name: 'Security' },
    { fn: perfCheck,     name: 'Performance' },
  ];

  try {
    if (onProgress) onProgress(`Crawling ${url}…`);
    const pages = await crawl(browser, url, pageLimit);
    if (onProgress) onProgress(`Found ${pages.length} page${pages.length !== 1 ? 's' : ''}`);

    for (const { url: pageUrl, page, responseHeaders } of pages) {
      try {
        for (const { fn, name } of checks) {
          if (onProgress) onProgress(`[${pageUrl}] Checking ${name}…`);
          try {
            const found = await fn(page, responseHeaders, pageUrl);
            for (const issue of found) {
              allIssues.push(issue);
              if (onIssue) onIssue(issue);
            }
            if (onProgress) onProgress(`[${pageUrl}] ${name} — ${found.length} issue${found.length !== 1 ? 's' : ''}`);
          } catch (err) {
            console.warn(`[runner] ${fn.name} failed on ${pageUrl}: ${err.message}`);
            if (onProgress) onProgress(`[${pageUrl}] ${name} — error`);
          }
        }
        if (onScreenshot) {
          if (onProgress) onProgress(`[${pageUrl}] Capturing screenshot…`);
          try {
            const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
            onScreenshot(pageUrl, `data:image/jpeg;base64,${buf.toString('base64')}`);
            if (onProgress) onProgress(`[${pageUrl}] Screenshot saved`);
          } catch (err) {
            console.warn(`[runner] screenshot failed on ${pageUrl}: ${err.message}`);
          }
        }
      } finally {
        await page.close();
      }
    }

    return { issues: allIssues, pagesScanned: pages.length };
  } finally {
    await browser.close();
  }
}

module.exports = { computeScore, runScan };
