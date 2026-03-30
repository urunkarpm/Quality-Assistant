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

async function runScan(url, pageLimit, onIssue) {
  const browser   = await chromium.launch();
  const allIssues = [];

  try {
    const pages = await crawl(browser, url, pageLimit);

    for (const { url: pageUrl, page, responseHeaders } of pages) {
      try {
        for (const fn of [adaCheck, visualCheck, contentCheck, seoCheck, securityCheck, perfCheck]) {
          try {
            const found = await fn(page, responseHeaders, pageUrl);
            for (const issue of found) {
              allIssues.push(issue);
              if (onIssue) onIssue(issue);
            }
          } catch (err) {
            console.warn(`[runner] ${fn.name} failed on ${pageUrl}: ${err.message}`);
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
