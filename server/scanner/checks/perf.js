// server/scanner/checks/perf.js
async function check(page, _responseHeaders, pageUrl = '', _timing = null) {
  const path = pageUrl ? new URL(pageUrl).pathname : '/';

  let timing = _timing;
  if (!timing && page) {
    timing = await page.evaluate(() => {
      const nav       = performance.getEntriesByType('navigation')[0] || {};
      const resources = performance.getEntriesByType('resource');
      return {
        loadTime:     (nav.loadEventEnd || 0) - (nav.startTime || 0),
        requestCount: resources.length,
        totalBytes:   resources.reduce((s, r) => s + (r.transferSize || 0), 0),
      };
    });
  }

  if (!timing) return [];
  const issues = [];

  if (timing.loadTime > 5000) {
    issues.push({ sev: 'critical', type: 'Performance', title: 'Very slow page load', selector: null, page: path, wcag: null, desc: `Page took ${(timing.loadTime / 1000).toFixed(1)}s to load (threshold: 5s). This severely impacts user experience and Core Web Vitals scores.` });
  } else if (timing.loadTime > 3000) {
    issues.push({ sev: 'major',    type: 'Performance', title: 'Slow page load',      selector: null, page: path, wcag: null, desc: `Page took ${(timing.loadTime / 1000).toFixed(1)}s to load (threshold: 3s). Users expect pages to load in under 3 seconds.` });
  }
  if (timing.requestCount > 100) {
    issues.push({ sev: 'minor', type: 'Performance', title: 'Excessive number of HTTP requests', selector: null, page: path, wcag: null, desc: `Page made ${timing.requestCount} HTTP requests. Bundling and caching assets can reduce this significantly.` });
  }
  if (timing.totalBytes > 2_000_000) {
    issues.push({ sev: 'major', type: 'Performance', title: 'Large page weight', selector: null, page: path, wcag: null, desc: `Page transferred ${(timing.totalBytes / 1_000_000).toFixed(1)}MB (threshold: 2MB). Large pages are slow on mobile connections.` });
  }

  return issues;
}

module.exports = check;
