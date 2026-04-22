// server/scanner/runner.js
const { chromium }  = require('playwright');
const { crawl }     = require('./crawler');
const fs            = require('fs');
const path          = require('path');

// Built-in checks
const adaCheck      = require('./checks/ada');
const visualCheck   = require('./checks/visual');
const contentCheck  = require('./checks/content');
const seoCheck      = require('./checks/seo');
const perfCheck     = require('./checks/perf');
const securityCheck = require('./checks/security');

// Load plugins dynamically
function loadPlugins() {
  const pluginsDir = path.join(__dirname, 'plugins');
  const plugins = [];
  
  if (!fs.existsSync(pluginsDir)) {
    return plugins;
  }
  
  const files = fs.readdirSync(pluginsDir);
  for (const file of files) {
    if (file.endsWith('.js') && !file.startsWith('.')) {
      try {
        const pluginPath = path.join(pluginsDir, file);
        const checkFn = require(pluginPath);
        if (typeof checkFn === 'function') {
          const name = path.basename(file, '.js');
          plugins.push({ fn: checkFn, name: `Plugin: ${name}` });
          console.log(`[runner] Loaded plugin: ${name}`);
        }
      } catch (err) {
        console.warn(`[runner] Failed to load plugin ${file}: ${err.message}`);
      }
    }
  }
  
  return plugins;
}

function computeScore(issues) {
  const c = issues.filter(i => i.sev === 'critical').length;
  const m = issues.filter(i => i.sev === 'major').length;
  const n = issues.filter(i => i.sev === 'minor').length;
  return Math.max(0, 100 - c * 10 - m * 4 - n);
}

const SEV_COLOR = { critical: '#ef4444', major: '#f97316', minor: '#eab308' };
const PADDING = 56; // px around element in cropped shot

async function captureElementScreenshot(page, selector, sev) {
  try {
    const locator = page.locator(selector).first();
    const bbox    = await locator.boundingBox();
    if (!bbox || (bbox.width === 0 && bbox.height === 0)) return null;

    const color = SEV_COLOR[sev] || '#eab308';

    // Inject highlight overlay
    await page.evaluate(({ sel, col }) => {
      window.__qaBox = document.createElement('div');
      try {
        const el   = document.querySelector(sel);
        if (!el) return;
        const r    = el.getBoundingClientRect();
        const box  = window.__qaBox;
        box.style.cssText = [
          'position:fixed',
          `left:${r.left - 3}px`, `top:${r.top - 3}px`,
          `width:${r.width + 6}px`, `height:${r.height + 6}px`,
          `outline:3px solid ${col}`,
          `background:${col}1a`,
          'z-index:2147483647',
          'pointer-events:none',
          'box-sizing:border-box',
          'border-radius:2px',
        ].join(';');
        document.documentElement.appendChild(box);
      } catch {}
    }, { sel: selector, col: color });

    const vp      = page.viewportSize();
    const vpW     = vp ? vp.width  : 1280;
    const vpH     = vp ? vp.height : 800;
    const x       = Math.max(0, bbox.x - PADDING);
    const y       = Math.max(0, bbox.y - PADDING);
    const width   = Math.min(vpW - x, bbox.width  + PADDING * 2);
    const height  = Math.min(vpH - y, bbox.height + PADDING * 2);

    const buf = await page.screenshot({ clip: { x, y, width, height }, type: 'jpeg', quality: 85 });

    // Remove overlay
    await page.evaluate(() => { if (window.__qaBox) { window.__qaBox.remove(); window.__qaBox = null; } });

    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function runChecksForPage(page, responseHeaders, pageUrl, checks, onProgress) {
  const pageIssues = [];
  const allIssues = [];
  
  // Run all checks in parallel
  const checkPromises = checks.map(async ({ fn, name }) => {
    if (onProgress) onProgress(`[${pageUrl}] Checking ${name}…`);
    try {
      const found = await fn(page, responseHeaders, pageUrl);
      if (onProgress) onProgress(`[${pageUrl}] ${name} — ${found.length} issue${found.length !== 1 ? 's' : ''}`);
      return { name, issues: found };
    } catch (err) {
      console.warn(`[runner] ${fn.name || name} failed on ${pageUrl}: ${err.message}`);
      if (onProgress) onProgress(`[${pageUrl}] ${name} — error`);
      return { name, issues: [] };
    }
  });
  
  const results = await Promise.all(checkPromises);
  
  for (const { name, issues } of results) {
    for (const issue of issues) {
      allIssues.push(issue);
      pageIssues.push({ issue, id: null }); // id will be set by caller
    }
  }
  
  return { allIssues, pageIssues };
}

async function runScan(url, pageLimit, opts, onIssue, onIssueScreenshot, onProgress) {
  const browser   = await chromium.launch({ headless: !opts?.headed });
  const allIssues = [];
  const concurrency = opts?.concurrency || 3; // Number of pages to scan concurrently
  
  const checks = [
    { fn: adaCheck,      name: 'ADA / WCAG' },
    { fn: visualCheck,   name: 'Visual' },
    { fn: contentCheck,  name: 'Content' },
    { fn: seoCheck,      name: 'SEO' },
    { fn: securityCheck, name: 'Security' },
    { fn: perfCheck,     name: 'Performance' },
  ];
  
  // Load custom plugins
  const plugins = loadPlugins();
  checks.push(...plugins);

  try {
    if (onProgress) onProgress(`Crawling ${url}…`);
    const pages = await crawl(browser, url, pageLimit);
    if (onProgress) onProgress(`Found ${pages.length} page${pages.length !== 1 ? 's' : ''}`);

    // Process pages with configurable concurrency
    const pagesScanned = pages.length;
    
    // Parallel page processing
    const processPage = async ({ url: pageUrl, page, responseHeaders }) => {
      try {
        const { allIssues: pageAllIssues, pageIssues } = await runChecksForPage(
          page, responseHeaders, pageUrl, checks, onProgress
        );
        
        // Register issues and get IDs
        for (const item of pageIssues) {
          item.id = onIssue ? onIssue(item.issue) : null;
        }
        
        // Capture per-issue cropped screenshots (deduplicate by selector)
        if (onIssueScreenshot) {
          const cache = new Map(); // selector -> dataUrl
          let captured = 0;
          if (onProgress) onProgress(`[${pageUrl}] Capturing element screenshots…`);
          for (const { issue, id } of pageIssues) {
            if (!id || !issue.selector) continue;
            let dataUrl = cache.get(issue.selector);
            if (dataUrl === undefined) {
              dataUrl = await captureElementScreenshot(page, issue.selector, issue.sev);
              cache.set(issue.selector, dataUrl);
            }
            if (dataUrl) {
              onIssueScreenshot(id, dataUrl);
              captured++;
            }
          }
          if (onProgress) onProgress(`[${pageUrl}] ${captured} element screenshot${captured !== 1 ? 's' : ''} saved`);
        }
        
        return pageAllIssues;
      } finally {
        await page.close();
      }
    };
    
    // Process pages with concurrency limit
    const pageBatches = [];
    for (let i = 0; i < pages.length; i += concurrency) {
      pageBatches.push(pages.slice(i, i + concurrency));
    }
    
    for (const batch of pageBatches) {
      const batchResults = await Promise.all(batch.map(processPage));
      for (const issues of batchResults) {
        allIssues.push(...issues);
      }
    }

    return { issues: allIssues, pagesScanned };
  } finally {
    await browser.close();
  }
}

module.exports = { computeScore, runScan, loadPlugins };
