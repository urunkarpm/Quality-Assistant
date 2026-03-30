# Quality Assistant Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/Express backend that crawls URLs with Playwright, runs six check categories (ADA, Visual, Content, SEO, Performance, Security), persists results in SQLite, and wires the existing static dashboard to live data.

**Architecture:** Single Express server serves both the static dashboard and REST API from one process. Playwright drives Chromium to crawl pages and run DOM-based checks. Results are stored in SQLite via better-sqlite3. The frontend polls the API while a scan runs and re-renders all components on completion.

**Tech Stack:** Node.js 18+, Express 4, Playwright, axe-core, better-sqlite3, Jest 29, supertest

---

## File Map

```
Quality Assistant/
├── package.json
├── jest.config.js
├── .gitignore
├── server/
│   ├── index.js                       # Express entry; serves dashboard + mounts routes
│   ├── db.js                          # SQLite singleton; all DB operations
│   ├── scanner/
│   │   ├── crawler.js                 # BFS crawler; same-origin, respects pageLimit
│   │   ├── runner.js                  # Orchestrates crawl + checks; exports computeScore, runScan
│   │   └── checks/
│   │       ├── security.js            # Pure function on response headers
│   │       ├── seo.js                 # DOM checks via page.evaluate
│   │       ├── perf.js                # Timing API via page.evaluate; injectable for tests
│   │       ├── visual.js              # Contrast ratios + font sizes via page.evaluate
│   │       ├── content.js             # HEAD requests on all links/images
│   │       └── ada.js                 # Injects axe-core; maps violations to issues
│   └── routes/
│       ├── scans.js                   # POST /api/scans, GET /api/scans, GET /api/scans/:id
│       └── issues.js                  # GET /api/issues?scanId=, PATCH /api/issues/:id
├── tests/
│   ├── db.test.js
│   ├── crawler.test.js
│   ├── runner.test.js
│   ├── checks/
│   │   ├── security.test.js
│   │   ├── seo.test.js
│   │   ├── perf.test.js
│   │   ├── visual.test.js
│   │   ├── content.test.js
│   │   └── ada.test.js
│   └── routes/
│       ├── scans.test.js
│       └── issues.test.js
└── dashboard/
    └── index.html                     # Modified: real API replaces hardcoded data
```

**Normalised issue shape** (all check modules return this):
```js
{
  sev:      'critical' | 'major' | 'minor',
  type:     'ADA' | 'Visual' | 'Content' | 'SEO' | 'Performance' | 'Security',
  title:    string,
  selector: string | null,
  page:     string,    // URL path where issue was found
  wcag:     string | null,
  desc:     string,
}
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `jest.config.js`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "quality-assistant",
  "version": "0.1.0",
  "scripts": {
    "start": "node server/index.js",
    "test":  "jest --runInBand"
  },
  "dependencies": {
    "axe-core":       "^4.9.1",
    "better-sqlite3": "^9.4.3",
    "express":        "^4.18.3",
    "playwright":     "^1.43.1"
  },
  "devDependencies": {
    "jest":      "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create jest.config.js**

```js
module.exports = {
  testEnvironment: 'node',
  testTimeout:     60000,
  testMatch:       ['**/tests/**/*.test.js'],
};
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
data/
*.db
```

- [ ] **Step 4: Create directory structure**

Run: `mkdir -p server/scanner/checks server/routes tests/checks tests/routes`
Expected: directories created silently.

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Install Playwright Chromium**

Run: `npx playwright install chromium`
Expected: Chromium browser downloaded, no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json jest.config.js .gitignore package-lock.json
git commit -m "chore: project scaffolding — deps, jest config, gitignore"
```

---

## Task 2: Database module

**Files:**
- Create: `server/db.js`
- Create: `tests/db.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/db.test.js`:

```js
// tests/db.test.js
describe('database', () => {
  let db;

  beforeEach(() => {
    jest.resetModules();
    process.env.DB_PATH = ':memory:';
    db = require('../server/db');
  });

  test('createScan returns an id and getScan retrieves it', () => {
    const id = db.createScan('https://example.com', 10);
    expect(typeof id).toBe('number');
    const scan = db.getScan(id);
    expect(scan.url).toBe('https://example.com');
    expect(scan.page_limit).toBe(10);
    expect(scan.status).toBe('running');
  });

  test('updateScan updates status, score, and pages_scanned', () => {
    const id = db.createScan('https://example.com', 5);
    db.updateScan(id, { status: 'complete', score: 78, pages_scanned: 3, finished_at: 1000 });
    const scan = db.getScan(id);
    expect(scan.status).toBe('complete');
    expect(scan.score).toBe(78);
    expect(scan.pages_scanned).toBe(3);
  });

  test('createIssue and getIssues round-trip', () => {
    const scanId = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'critical', type: 'ADA', title: 'Missing alt', selector: 'img', page: '/', wcag: 'image-alt (1.1.1)', desc: 'No alt text.' });
    const issues = db.getIssues(scanId);
    expect(issues).toHaveLength(1);
    expect(issues[0].sev).toBe('critical');
    expect(issues[0].status).toBe('open');
  });

  test('updateIssueStatus persists the new status', () => {
    const scanId = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'minor', type: 'SEO', title: 'No title', selector: null, page: '/', wcag: null, desc: 'Missing title.' });
    const issue = db.getIssues(scanId)[0];
    db.updateIssueStatus(issue.id, 'resolved');
    expect(db.getIssues(scanId)[0].status).toBe('resolved');
  });

  test('getScans returns all scans ordered by started_at desc', () => {
    db.createScan('https://a.com', 1);
    db.createScan('https://b.com', 5);
    const scans = db.getScans();
    expect(scans).toHaveLength(2);
    expect(scans[0].started_at).toBeGreaterThanOrEqual(scans[1].started_at);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/db.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../server/db'"

- [ ] **Step 3: Implement server/db.js**

Note: Use `db.prepare(sql).run()` instead of `db.exec()` to run DDL statements.

```js
// server/db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/quality.db');

if (dbPath !== ':memory:') {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);

// Create tables using prepare().run() for each statement
db.prepare(`CREATE TABLE IF NOT EXISTS scans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT    NOT NULL,
  page_limit    INTEGER NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'running',
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  score         INTEGER,
  pages_scanned INTEGER,
  error         TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS issues (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id   INTEGER NOT NULL REFERENCES scans(id),
  sev       TEXT    NOT NULL,
  type      TEXT    NOT NULL,
  title     TEXT    NOT NULL,
  selector  TEXT,
  page      TEXT    NOT NULL,
  wcag      TEXT,
  desc      TEXT    NOT NULL,
  status    TEXT    NOT NULL DEFAULT 'open'
)`).run();

function createScan(url, pageLimit) {
  return db.prepare(
    'INSERT INTO scans (url, page_limit, started_at) VALUES (?, ?, ?)'
  ).run(url, pageLimit, Math.floor(Date.now() / 1000)).lastInsertRowid;
}

function getScan(id) {
  return db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
}

function getScans() {
  return db.prepare('SELECT * FROM scans ORDER BY started_at DESC').all();
}

function updateScan(id, fields) {
  const keys = Object.keys(fields);
  const set  = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE scans SET ${set} WHERE id = ?`).run(...keys.map(k => fields[k]), id);
}

function createIssue(scanId, issue) {
  db.prepare(`
    INSERT INTO issues (scan_id, sev, type, title, selector, page, wcag, desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(scanId, issue.sev, issue.type, issue.title, issue.selector ?? null,
         issue.page, issue.wcag ?? null, issue.desc);
}

function getIssues(scanId) {
  return db.prepare('SELECT * FROM issues WHERE scan_id = ?').all(scanId);
}

function updateIssueStatus(id, status) {
  db.prepare('UPDATE issues SET status = ? WHERE id = ?').run(status, id);
}

module.exports = { createScan, getScan, getScans, updateScan, createIssue, getIssues, updateIssueStatus };
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/db.test.js --no-coverage`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/db.js tests/db.test.js
git commit -m "feat: add SQLite database module"
```

---

## Task 3: Security check module

**Files:**
- Create: `server/scanner/checks/security.js`
- Create: `tests/checks/security.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/checks/security.test.js`:

```js
// tests/checks/security.test.js
const check = require('../../server/scanner/checks/security');

describe('security check', () => {
  test('flags missing CSP as major', async () => {
    const issues = await check(null, {}, 'http://localhost/');
    expect(issues.find(i => i.title === 'Missing Content-Security-Policy header'))
      .toMatchObject({ sev: 'major', type: 'Security' });
  });

  test('flags missing HSTS as major', async () => {
    const issues = await check(null, {}, 'http://localhost/');
    expect(issues.find(i => i.title === 'Missing Strict-Transport-Security header'))
      .toMatchObject({ sev: 'major', type: 'Security' });
  });

  test('flags missing X-Frame-Options, X-Content-Type-Options, Referrer-Policy as minor', async () => {
    const issues = await check(null, {}, 'http://localhost/');
    ['Missing X-Frame-Options header', 'Missing X-Content-Type-Options header', 'Missing Referrer-Policy header']
      .forEach(title => expect(issues.find(i => i.title === title)).toMatchObject({ sev: 'minor', type: 'Security' }));
  });

  test('returns no issues when all security headers are present', async () => {
    const headers = {
      'content-security-policy':   "default-src 'self'",
      'strict-transport-security': 'max-age=31536000',
      'x-frame-options':           'DENY',
      'x-content-type-options':    'nosniff',
      'referrer-policy':           'no-referrer',
    };
    expect(await check(null, headers, 'http://localhost/')).toHaveLength(0);
  });

  test('all issues have required shape', async () => {
    const issues = await check(null, {}, 'http://localhost/');
    issues.forEach(i => {
      expect(i).toHaveProperty('sev');
      expect(i).toHaveProperty('type', 'Security');
      expect(i).toHaveProperty('title');
      expect(i).toHaveProperty('desc');
      expect(i).toHaveProperty('page', '/');
      expect(i).toHaveProperty('selector', null);
      expect(i).toHaveProperty('wcag', null);
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/checks/security.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../../server/scanner/checks/security'"

- [ ] **Step 3: Implement server/scanner/checks/security.js**

```js
// server/scanner/checks/security.js
async function check(_page, responseHeaders, pageUrl = '') {
  const path = pageUrl ? new URL(pageUrl).pathname : '/';
  const h = Object.fromEntries(
    Object.entries(responseHeaders).map(([k, v]) => [k.toLowerCase(), v])
  );

  const RULES = [
    { header: 'content-security-policy',   sev: 'major', title: 'Missing Content-Security-Policy header',   desc: 'No CSP header found. Without CSP the page is vulnerable to cross-site scripting (XSS) attacks.' },
    { header: 'strict-transport-security', sev: 'major', title: 'Missing Strict-Transport-Security header', desc: 'HSTS is absent. Browsers may allow insecure HTTP connections instead of enforcing HTTPS.' },
    { header: 'x-frame-options',           sev: 'minor', title: 'Missing X-Frame-Options header',           desc: 'X-Frame-Options is not set. The page may be embedded in an iframe by third parties (clickjacking risk).' },
    { header: 'x-content-type-options',    sev: 'minor', title: 'Missing X-Content-Type-Options header',    desc: 'X-Content-Type-Options: nosniff is absent. Browsers may MIME-sniff responses, enabling content-type attacks.' },
    { header: 'referrer-policy',           sev: 'minor', title: 'Missing Referrer-Policy header',           desc: 'No Referrer-Policy header. The full URL may be sent as a referrer to third-party requests, leaking sensitive paths.' },
  ];

  return RULES
    .filter(r => !h[r.header])
    .map(r => ({ sev: r.sev, type: 'Security', title: r.title, selector: null, page: path, wcag: null, desc: r.desc }));
}

module.exports = check;
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/checks/security.test.js --no-coverage`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/scanner/checks/security.js tests/checks/security.test.js
git commit -m "feat: add security header check module"
```

---

## Task 4: SEO check module

**Files:**
- Create: `server/scanner/checks/seo.js`
- Create: `tests/checks/seo.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/checks/seo.test.js`:

```js
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
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/checks/seo.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../../server/scanner/checks/seo'"

- [ ] **Step 3: Implement server/scanner/checks/seo.js**

```js
// server/scanner/checks/seo.js
async function check(page, _responseHeaders, pageUrl = '') {
  const path = pageUrl ? new URL(pageUrl).pathname : '/';

  const data = await page.evaluate(() => ({
    title:       document.title,
    description: document.querySelector('meta[name="description"]')?.content?.trim() || '',
    canonical:   !!document.querySelector('link[rel="canonical"]'),
    ogTitle:     !!document.querySelector('meta[property="og:title"]'),
    h1Count:     document.querySelectorAll('h1').length,
  }));

  const issues = [];
  if (!data.title)       issues.push({ sev: 'major', type: 'SEO', title: 'Missing page title',       selector: 'title',                      page: path, wcag: null, desc: 'The page has no <title> element. Search engines use the title to index and display the page in results.' });
  if (!data.description) issues.push({ sev: 'major', type: 'SEO', title: 'Missing meta description', selector: 'meta[name="description"]',    page: path, wcag: null, desc: 'No meta description found. Search engines show the description in results; missing it reduces click-through rate.' });
  if (!data.canonical)   issues.push({ sev: 'minor', type: 'SEO', title: 'Missing canonical link',   selector: 'link[rel="canonical"]',       page: path, wcag: null, desc: 'No canonical link element found. This can cause duplicate-content penalties in search engines.' });
  if (!data.ogTitle)     issues.push({ sev: 'minor', type: 'SEO', title: 'Missing Open Graph tags',  selector: 'meta[property="og:title"]',   page: path, wcag: null, desc: 'No og:title meta tag found. Open Graph tags control how the page appears when shared on social media.' });
  if (data.h1Count === 0)   issues.push({ sev: 'minor', type: 'SEO', title: 'Page has no H1 heading',        selector: 'h1', page: path, wcag: null, desc: 'No <h1> element found. A clear H1 helps search engines understand the primary topic of the page.' });
  else if (data.h1Count > 1) issues.push({ sev: 'minor', type: 'SEO', title: 'Multiple H1 headings on page', selector: 'h1', page: path, wcag: null, desc: `Page has ${data.h1Count} <h1> elements. More than one H1 confuses search engines about the page primary topic.` });

  return issues;
}

module.exports = check;
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/checks/seo.test.js --no-coverage`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/scanner/checks/seo.js tests/checks/seo.test.js
git commit -m "feat: add SEO check module"
```

---

## Task 5: Performance check module

**Files:**
- Create: `server/scanner/checks/perf.js`
- Create: `tests/checks/perf.test.js`

The check accepts an optional `_timing` argument for testability. In production the runner passes `null` so it collects real timings via `page.evaluate`.

- [ ] **Step 1: Write the failing test**

Create `tests/checks/perf.test.js`:

```js
// tests/checks/perf.test.js
const check = require('../../server/scanner/checks/perf');

describe('perf check', () => {
  test('returns critical for load time > 5s', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 5500, requestCount: 10, totalBytes: 500_000 });
    expect(issues.find(i => i.title === 'Very slow page load')).toMatchObject({ sev: 'critical', type: 'Performance' });
  });

  test('returns major for load time between 3s and 5s', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 3500, requestCount: 10, totalBytes: 500_000 });
    expect(issues.find(i => i.title === 'Slow page load')).toMatchObject({ sev: 'major', type: 'Performance' });
  });

  test('returns no load-time issue for pages under 3s', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 1000, requestCount: 10, totalBytes: 500_000 });
    expect(issues.find(i => i.title.includes('load'))).toBeUndefined();
  });

  test('returns minor for more than 100 requests', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 1000, requestCount: 120, totalBytes: 500_000 });
    expect(issues.find(i => i.title === 'Excessive number of HTTP requests')).toMatchObject({ sev: 'minor' });
  });

  test('returns major for page weight > 2MB', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 1000, requestCount: 10, totalBytes: 2_200_000 });
    expect(issues.find(i => i.title === 'Large page weight')).toMatchObject({ sev: 'major' });
  });

  test('returns no issues for a healthy page', async () => {
    const issues = await check(null, {}, 'http://localhost/', { loadTime: 800, requestCount: 30, totalBytes: 400_000 });
    expect(issues).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/checks/perf.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../../server/scanner/checks/perf'"

- [ ] **Step 3: Implement server/scanner/checks/perf.js**

```js
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
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/checks/perf.test.js --no-coverage`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/scanner/checks/perf.js tests/checks/perf.test.js
git commit -m "feat: add performance check module"
```

---

## Task 6: Visual check module

**Files:**
- Create: `server/scanner/checks/visual.js`
- Create: `tests/checks/visual.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/checks/visual.test.js`:

```js
// tests/checks/visual.test.js
const { chromium } = require('playwright');
const check = require('../../server/scanner/checks/visual');

let browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });

async function pageWith(html) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  return page;
}

describe('visual check', () => {
  test('flags low contrast text as major', async () => {
    const page = await pageWith('<html><body style="background:#fff"><p id="t" style="color:#aaa;font-size:16px">Low contrast</p></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.some(i => i.type === 'Visual' && i.sev === 'major' && i.title === 'Insufficient colour contrast')).toBe(true);
  });

  test('does not flag sufficient contrast', async () => {
    const page = await pageWith('<html><body style="background:#fff"><p style="color:#111;font-size:16px">Good contrast</p></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.filter(i => i.title === 'Insufficient colour contrast')).toHaveLength(0);
  });

  test('flags font size below 12px as minor', async () => {
    const page = await pageWith('<html><body><p style="font-size:9px;color:#000">Tiny</p></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Text too small to read')).toMatchObject({ sev: 'minor', type: 'Visual' });
  });

  test('flags image wider than viewport as minor', async () => {
    const page = await pageWith('<html><body><img id="wide" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" style="width:1400px;height:10px" alt="x"></body></html>');
    await page.setViewportSize({ width: 1280, height: 800 });
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    expect(issues.find(i => i.title === 'Image wider than viewport')).toMatchObject({ sev: 'minor', type: 'Visual' });
  });

  test('all issues have type Visual', async () => {
    const page = await pageWith('<html><body style="background:#fff"><p style="color:#ccc;font-size:8px">x</p></body></html>');
    const issues = await check(page, {}, 'http://localhost/');
    await page.close();
    issues.forEach(i => expect(i.type).toBe('Visual'));
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/checks/visual.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../../server/scanner/checks/visual'"

- [ ] **Step 3: Implement server/scanner/checks/visual.js**

```js
// server/scanner/checks/visual.js

function luminance(r, g, b) {
  return [r, g, b].reduce((acc, c, i) => {
    const s   = c / 255;
    const lin = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    return acc + lin * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}

function contrastRatio(fg, bg) {
  const l1 = luminance(...fg), l2 = luminance(...bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function parseRgb(str) {
  const m = str.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

async function check(page, _responseHeaders, pageUrl = '') {
  const path   = pageUrl ? new URL(pageUrl).pathname : '/';
  const issues = [];

  const { textElements, imgs, vpWidth } = await page.evaluate(() => {
    const tags   = ['P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'A', 'LABEL', 'TD', 'TH'];
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const textElements = Array.from(document.querySelectorAll(tags.join(','))).map(el => {
      if (!el.textContent.trim()) return null;
      const s = window.getComputedStyle(el);
      return {
        selector: el.id ? '#' + el.id : el.tagName.toLowerCase(),
        color:    s.color,
        bg:       s.backgroundColor !== 'rgba(0, 0, 0, 0)' ? s.backgroundColor : bodyBg,
        fontSize: parseFloat(s.fontSize),
      };
    }).filter(Boolean);
    const imgs = Array.from(document.querySelectorAll('img')).map(img => ({
      selector:    img.id ? '#' + img.id : 'img',
      offsetWidth: img.offsetWidth,
    }));
    return { textElements, imgs, vpWidth: window.innerWidth };
  });

  const seenContrast = new Set(), seenFont = new Set();
  for (const el of textElements) {
    const fg = parseRgb(el.color), bg = parseRgb(el.bg);
    if (fg && bg && !seenContrast.has(el.selector)) {
      const ratio = contrastRatio(fg, bg);
      if (ratio < 4.5) {
        seenContrast.add(el.selector);
        issues.push({ sev: 'major', type: 'Visual', title: 'Insufficient colour contrast', selector: el.selector, page: path, wcag: null, desc: `Text on "${el.selector}" has a contrast ratio of ${ratio.toFixed(2)}:1 (minimum 4.5:1 for normal text).` });
      }
    }
    if (el.fontSize < 12 && !seenFont.has(el.selector)) {
      seenFont.add(el.selector);
      issues.push({ sev: 'minor', type: 'Visual', title: 'Text too small to read', selector: el.selector, page: path, wcag: null, desc: `Text on "${el.selector}" is ${el.fontSize}px — below the 12px minimum for readability.` });
    }
  }

  for (const img of imgs) {
    if (img.offsetWidth > vpWidth) {
      issues.push({ sev: 'minor', type: 'Visual', title: 'Image wider than viewport', selector: img.selector, page: path, wcag: null, desc: `Image "${img.selector}" is ${img.offsetWidth}px wide, exceeding the ${vpWidth}px viewport. This causes horizontal scrolling on mobile.` });
    }
  }

  return issues;
}

module.exports = check;
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/checks/visual.test.js --no-coverage`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/scanner/checks/visual.js tests/checks/visual.test.js
git commit -m "feat: add visual check module (contrast, font size, image width)"
```

---

## Task 7: Content check module

**Files:**
- Create: `server/scanner/checks/content.js`
- Create: `tests/checks/content.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/checks/content.test.js`:

```js
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
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/checks/content.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../../server/scanner/checks/content'"

- [ ] **Step 3: Implement server/scanner/checks/content.js**

```js
// server/scanner/checks/content.js
async function check(page, _responseHeaders, pageUrl = '') {
  const path   = pageUrl ? new URL(pageUrl).pathname : '/';
  const issues = [];

  const { links, images } = await page.evaluate(() => ({
    links:  Array.from(document.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 60) })),
    images: Array.from(document.querySelectorAll('img[src]')).map(i => ({ src: i.src })),
  }));

  const checked = new Set();

  async function headCheck(url) {
    if (!url || checked.has(url)) return null;
    checked.add(url);
    if (/^(mailto:|tel:|javascript:)/i.test(url)) return null;
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      return res.status;
    } catch { return null; }
  }

  for (const link of links) {
    const status = await headCheck(link.href);
    if (status !== null && status >= 400) {
      issues.push({ sev: 'major', type: 'Content', title: 'Broken link', selector: `a[href="${link.href}"]`, page: path, wcag: null, desc: `Link "${link.text || link.href}" returns HTTP ${status}.` });
    }
  }

  for (const img of images) {
    const status = await headCheck(img.src);
    if (status !== null && status >= 400) {
      issues.push({ sev: 'major', type: 'Content', title: 'Broken image', selector: `img[src="${img.src}"]`, page: path, wcag: null, desc: `Image at "${img.src}" returns HTTP ${status}.` });
    }
  }

  return issues;
}

module.exports = check;
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/checks/content.test.js --no-coverage`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/scanner/checks/content.js tests/checks/content.test.js
git commit -m "feat: add content broken-link and broken-image check module"
```

---

## Task 8: ADA check module

**Files:**
- Create: `server/scanner/checks/ada.js`
- Create: `tests/checks/ada.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/checks/ada.test.js`:

```js
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
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/checks/ada.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../../server/scanner/checks/ada'"

- [ ] **Step 3: Implement server/scanner/checks/ada.js**

Note: `require.resolve('axe-core')` resolves to the Node.js entry point. The browser-runnable bundle lives next to it as `axe.min.js`.

```js
// server/scanner/checks/ada.js
const fs   = require('fs');
const path = require('path');

const axeSource = fs.readFileSync(
  path.join(path.dirname(require.resolve('axe-core')), 'axe.min.js'),
  'utf-8'
);

const SEV_MAP = { critical: 'critical', serious: 'critical', moderate: 'major', minor: 'minor' };

async function check(page, _responseHeaders, pageUrl = '') {
  const urlPath = pageUrl ? new URL(pageUrl).pathname : '/';

  await page.evaluate(axeSource);
  const results = await page.evaluate(() => window.axe.run());

  return results.violations.flatMap(v =>
    v.nodes.map(node => ({
      sev:      SEV_MAP[v.impact] || 'minor',
      type:     'ADA',
      title:    v.description,
      selector: node.target?.[0] ?? null,
      page:     urlPath,
      wcag:     `${v.id} (${v.tags.find(t => t.startsWith('wcag')) || 'best-practice'})`,
      desc:     `${v.help}. ${node.failureSummary || ''}`.trim(),
    }))
  );
}

module.exports = check;
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/checks/ada.test.js --no-coverage`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/scanner/checks/ada.js tests/checks/ada.test.js
git commit -m "feat: add ADA/axe-core accessibility check module"
```

---

## Task 9: Crawler

**Files:**
- Create: `server/scanner/crawler.js`
- Create: `tests/crawler.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/crawler.test.js`:

```js
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
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/crawler.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../server/scanner/crawler'"

- [ ] **Step 3: Implement server/scanner/crawler.js**

```js
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
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/crawler.test.js --no-coverage`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/scanner/crawler.js tests/crawler.test.js
git commit -m "feat: add same-origin BFS crawler"
```

---

## Task 10: Runner orchestrator

**Files:**
- Create: `server/scanner/runner.js`
- Create: `tests/runner.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/runner.test.js`:

```js
// tests/runner.test.js
const { computeScore } = require('../server/scanner/runner');

describe('computeScore', () => {
  test('returns 100 for no issues', () => {
    expect(computeScore([])).toBe(100);
  });

  test('deducts 10 per critical issue', () => {
    expect(computeScore([{ sev: 'critical' }, { sev: 'critical' }])).toBe(80);
  });

  test('deducts 4 per major issue', () => {
    expect(computeScore([{ sev: 'major' }, { sev: 'major' }, { sev: 'major' }])).toBe(88);
  });

  test('deducts 1 per minor issue', () => {
    expect(computeScore(Array(10).fill({ sev: 'minor' }))).toBe(90);
  });

  test('floors at 0', () => {
    expect(computeScore(Array(15).fill({ sev: 'critical' }))).toBe(0);
  });

  test('combines all severities correctly: 2 critical + 1 major + 2 minor = 74', () => {
    const issues = [{ sev: 'critical' }, { sev: 'critical' }, { sev: 'major' }, { sev: 'minor' }, { sev: 'minor' }];
    expect(computeScore(issues)).toBe(74);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/runner.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../server/scanner/runner'"

- [ ] **Step 3: Implement server/scanner/runner.js**

```js
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
      for (const fn of [adaCheck, visualCheck, contentCheck, seoCheck, securityCheck]) {
        const found = await fn(page, responseHeaders, pageUrl);
        for (const issue of found) {
          allIssues.push(issue);
          if (onIssue) onIssue(issue);
        }
      }
      // perf: null timing so it reads real navigation data from the page object
      for (const issue of await perfCheck(page, responseHeaders, pageUrl, null)) {
        allIssues.push(issue);
        if (onIssue) onIssue(issue);
      }
      await page.close();
    }

    return { issues: allIssues, pagesScanned: pages.length };
  } finally {
    await browser.close();
  }
}

module.exports = { computeScore, runScan };
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/runner.test.js --no-coverage`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/scanner/runner.js tests/runner.test.js
git commit -m "feat: add scanner runner and computeScore"
```

---

## Task 11: API routes

**Files:**
- Create: `server/routes/scans.js`
- Create: `server/routes/issues.js`
- Create: `tests/routes/scans.test.js`
- Create: `tests/routes/issues.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/routes/scans.test.js`:

```js
// tests/routes/scans.test.js
process.env.DB_PATH = ':memory:';

// Mock runner to prevent Playwright launching during route tests
jest.mock('../../server/scanner/runner', () => ({
  computeScore: jest.fn(() => 100),
  runScan:      jest.fn().mockResolvedValue({ issues: [], pagesScanned: 1 }),
}));

const request = require('supertest');
const express = require('express');

let app;
beforeEach(() => {
  jest.resetModules();
  process.env.DB_PATH = ':memory:';
  const router = require('../../server/routes/scans');
  app = express();
  app.use(express.json());
  app.use('/api/scans', router);
});

describe('GET /api/scans', () => {
  test('returns empty array when no scans exist', async () => {
    const res = await request(app).get('/api/scans');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/scans', () => {
  test('returns 400 when url is missing', async () => {
    expect((await request(app).post('/api/scans').send({ pageLimit: 5 })).status).toBe(400);
  });

  test('returns 400 for an invalid url', async () => {
    expect((await request(app).post('/api/scans').send({ url: 'not-a-url', pageLimit: 5 })).status).toBe(400);
  });

  test('returns 400 for missing pageLimit', async () => {
    expect((await request(app).post('/api/scans').send({ url: 'https://example.com' })).status).toBe(400);
  });

  test('returns 202 with scanId for a valid request', async () => {
    const res = await request(app).post('/api/scans').send({ url: 'https://example.com', pageLimit: 1 });
    expect(res.status).toBe(202);
    expect(typeof res.body.scanId).toBe('number');
  });
});

describe('GET /api/scans/:id', () => {
  test('returns 404 for an unknown id', async () => {
    expect((await request(app).get('/api/scans/9999')).status).toBe(404);
  });

  test('returns the scan record for a known id', async () => {
    const { scanId } = (await request(app).post('/api/scans').send({ url: 'https://example.com', pageLimit: 1 })).body;
    const res = await request(app).get(`/api/scans/${scanId}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://example.com');
  });
});
```

Create `tests/routes/issues.test.js`:

```js
// tests/routes/issues.test.js
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const express = require('express');

let app, db;
beforeEach(() => {
  jest.resetModules();
  process.env.DB_PATH = ':memory:';
  db           = require('../../server/db');
  const router = require('../../server/routes/issues');
  app = express();
  app.use(express.json());
  app.use('/api/issues', router);
});

describe('GET /api/issues', () => {
  test('returns 400 when scanId is missing', async () => {
    expect((await request(app).get('/api/issues')).status).toBe(400);
  });

  test('returns issues for a valid scanId', async () => {
    const scanId = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'critical', type: 'ADA', title: 'Test issue', selector: null, page: '/', wcag: null, desc: 'Desc' });
    const res = await request(app).get(`/api/issues?scanId=${scanId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Test issue');
  });
});

describe('PATCH /api/issues/:id', () => {
  test('updates issue status to resolved', async () => {
    const scanId  = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'minor', type: 'SEO', title: 'T', selector: null, page: '/', wcag: null, desc: 'D' });
    const issueId = db.getIssues(scanId)[0].id;
    const res     = await request(app).patch(`/api/issues/${issueId}`).send({ status: 'resolved' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
  });

  test('returns 400 for an invalid status value', async () => {
    const scanId  = db.createScan('https://example.com', 1);
    db.createIssue(scanId, { sev: 'minor', type: 'SEO', title: 'T', selector: null, page: '/', wcag: null, desc: 'D' });
    const issueId = db.getIssues(scanId)[0].id;
    expect((await request(app).patch(`/api/issues/${issueId}`).send({ status: 'invalid' })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest tests/routes/ --no-coverage`
Expected: FAIL — "Cannot find module '../../server/routes/scans'"

- [ ] **Step 3: Implement server/routes/scans.js**

```js
// server/routes/scans.js
const router = require('express').Router();
const { createScan, getScan, getScans, updateScan, createIssue } = require('../db');
const { runScan, computeScore } = require('../scanner/runner');

router.get('/', (_req, res) => res.json(getScans()));

router.get('/:id', (req, res) => {
  const scan = getScan(Number(req.params.id));
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
  res.json(scan);
});

router.post('/', (req, res) => {
  const { url, pageLimit } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'url is not a valid URL' }); }
  if (!pageLimit || !Number.isInteger(pageLimit) || pageLimit < 1) {
    return res.status(400).json({ error: 'pageLimit must be a positive integer' });
  }

  const scanId = createScan(url, pageLimit);

  runScan(url, pageLimit, issue => createIssue(scanId, issue))
    .then(({ issues, pagesScanned }) => {
      updateScan(scanId, { status: 'complete', score: computeScore(issues), pages_scanned: pagesScanned, finished_at: Math.floor(Date.now() / 1000) });
    })
    .catch(err => {
      updateScan(scanId, { status: 'failed', error: err.message, finished_at: Math.floor(Date.now() / 1000) });
    });

  res.status(202).json({ scanId });
});

module.exports = router;
```

- [ ] **Step 4: Implement server/routes/issues.js**

```js
// server/routes/issues.js
const router = require('express').Router();
const { getIssues, updateIssueStatus } = require('../db');

router.get('/', (req, res) => {
  const { scanId } = req.query;
  if (!scanId) return res.status(400).json({ error: 'scanId query parameter is required' });
  res.json(getIssues(Number(scanId)));
});

router.patch('/:id', (req, res) => {
  const { status } = req.body;
  if (!['open', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'status must be "open" or "resolved"' });
  }
  updateIssueStatus(Number(req.params.id), status);
  res.json({ id: Number(req.params.id), status });
});

module.exports = router;
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `npx jest tests/routes/ --no-coverage`
Expected: PASS — all route tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/routes/scans.js server/routes/issues.js tests/routes/scans.test.js tests/routes/issues.test.js
git commit -m "feat: add REST API routes for scans and issues"
```

---

## Task 12: Express server entry point

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Create server/index.js**

```js
// server/index.js
const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dashboard')));

app.use('/api/scans',  require('./routes/scans'));
app.use('/api/issues', require('./routes/issues'));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

// Only start listening when run directly, not when required by tests
if (require.main === module) {
  app.listen(PORT, () => console.log(`Quality Assistant running on http://localhost:${PORT}`));
}

module.exports = app;
```

- [ ] **Step 2: Run all tests to confirm nothing breaks**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 3: Verify the server starts**

Run: `node server/index.js`
Expected: `Quality Assistant running on http://localhost:3000`
Open `http://localhost:3000` — existing dashboard should load (with hardcoded data still).
Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add Express entry point serving dashboard and API"
```

---

## Task 13: Frontend wiring

**Files:**
- Modify: `dashboard/index.html`

Read the full file before making any edits. All changes stay inside `dashboard/index.html` — no new files.

- [ ] **Step 1: Replace the sidebar site-selector with a scan launcher**

Find the `.sidebar-site` div (contains a `<label>SITE</label>` and a `<select class="site-select">`). Replace the entire div with:

```html
<div class="sidebar-site">
  <label>SCAN URL</label>
  <input id="scan-url" type="url" placeholder="https://example.com"
    style="width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:8px 10px;color:#fff;font-family:var(--sans);font-size:12px;margin-bottom:8px;box-sizing:border-box;">
  <div style="display:flex;gap:6px;align-items:center;">
    <select id="scan-pages"
      style="flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:7px 8px;color:#fff;font-size:12px;font-family:var(--sans);appearance:none;">
      <option value="1">1 page</option>
      <option value="5" selected>5 pages</option>
      <option value="10">10 pages</option>
      <option value="25">25 pages</option>
      <option value="50">50 pages</option>
    </select>
    <button id="scan-btn" onclick="startScan()"
      style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:7px 12px;font-size:12px;font-weight:500;cursor:pointer;font-family:var(--sans);white-space:nowrap;">
      Run Scan
    </button>
  </div>
</div>
```

- [ ] **Step 2: Add a scan-status indicator to the topbar**

Find the `.topbar-actions` div. Add this span as its first child:

```html
<span id="scan-status" style="font-size:12px;color:var(--text2);font-family:var(--mono);display:none;margin-right:8px;"></span>
```

- [ ] **Step 3: Add data-view attributes to nav items and id to the content wrapper**

Update the nav items in the sidebar:

```html
<a class="nav-item active" data-view="dashboard" onclick="switchView('dashboard')">
  <span class="icon">◈</span> Dashboard
</a>
<a class="nav-item" data-view="issues" onclick="switchView('issues')">
  <span class="icon">⚑</span> Issues
  <span class="nav-badge">0</span>
</a>
<a class="nav-item" data-view="scans" onclick="switchView('scans')">
  <span class="icon">⊙</span> Scans
</a>
```

Add `id="dashboard-view"` to the `<div class="content">` element:
```html
<div class="content" id="dashboard-view">
```

- [ ] **Step 4: Wire the modal status button to toggleStatus()**

Find the modal status button and ensure its onclick calls `toggleStatus()`:
```html
<button id="modal-status-btn" class="btn btn-primary" onclick="toggleStatus()">Mark as Resolved</button>
```

- [ ] **Step 5: Add the scans history container after the dashboard content div**

Find the closing `</div>` of the `dashboard-view` div and add immediately after it:
```html
<div id="scans-view" style="display:none;padding:28px 32px;"></div>
```

- [ ] **Step 6: Replace the entire script block content**

Find the `<script>` tag near the bottom of the file. Replace all JS between `<script>` and `</script>` with:

```js
let ISSUES = [];
let activeSearch = '';
let activeSev    = 'all';
let activeIssue  = null;
let pollInterval = null;

// ── SCAN LAUNCHER ────────────────────────────────────────────────────────────

async function startScan() {
  const url       = document.getElementById('scan-url').value.trim();
  const pageLimit = parseInt(document.getElementById('scan-pages').value, 10);
  if (!url) { alert('Enter a URL to scan.'); return; }

  const btn = document.getElementById('scan-btn');
  btn.disabled = true; btn.textContent = 'Starting…';

  try {
    const res = await fetch('/api/scans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pageLimit }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const { scanId } = await res.json();
    startPolling(scanId, pageLimit);
  } catch (err) {
    alert('Failed to start scan: ' + err.message);
    btn.disabled = false; btn.textContent = 'Run Scan';
  }
}

function startPolling(scanId, pageLimit) {
  const statusEl = document.getElementById('scan-status');
  const btn      = document.getElementById('scan-btn');
  statusEl.style.display = 'inline';

  pollInterval = setInterval(async () => {
    const scan = await fetch(`/api/scans/${scanId}`).then(r => r.json());
    if (scan.status === 'running') {
      statusEl.textContent = `Scanning… ${scan.pages_scanned || 0}/${pageLimit} pages`;
    } else {
      clearInterval(pollInterval);
      statusEl.style.display = 'none';
      btn.disabled = false; btn.textContent = 'Run Scan';
      if (scan.status === 'complete') await loadScan(scanId);
      else alert('Scan failed: ' + (scan.error || 'unknown error'));
    }
  }, 2000);
}

// ── DATA LOADING ─────────────────────────────────────────────────────────────

async function loadScan(scanId) {
  const [scan, issues] = await Promise.all([
    fetch(`/api/scans/${scanId}`).then(r => r.json()),
    fetch(`/api/issues?scanId=${scanId}`).then(r => r.json()),
  ]);
  ISSUES = issues;
  renderScore(scan);
  renderStatCards();
  renderIssues();
  const el = document.querySelector('.page-subtitle');
  if (el) el.textContent = `${scan.url} · scanned ${new Date(scan.started_at * 1000).toLocaleString()}`;
  switchView('dashboard');
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function renderScore(scan) {
  const score = scan.score ?? 0;
  const fill  = document.querySelector('.score-circle .fill');
  if (fill) {
    const circ = 2 * Math.PI * 40;
    fill.style.strokeDasharray  = circ;
    fill.style.strokeDashoffset = circ * (1 - score / 100);
  }
  const numEl = document.querySelector('.score-label .num');
  if (numEl) numEl.textContent = score;

  const barsContainer = document.querySelector('.score-bars');
  if (barsContainer) {
    barsContainer.innerHTML = ['ADA', 'Visual', 'Content', 'SEO', 'Performance', 'Security'].map(type => {
      const t = ISSUES.filter(i => i.type === type);
      const s = Math.max(0, 100
        - t.filter(i => i.sev === 'critical').length * 10
        - t.filter(i => i.sev === 'major').length * 4
        - t.filter(i => i.sev === 'minor').length);
      return `<div class="bar-row"><span class="bar-label">${type}</span><div class="bar-track"><div class="bar-fill" style="width:${s}%"></div></div><span class="bar-val">${s}</span></div>`;
    }).join('');
  }
}

function renderStatCards() {
  const counts = { critical: 0, major: 0, minor: 0 };
  ISSUES.forEach(i => { if (counts[i.sev] !== undefined) counts[i.sev]++; });
  const resolved = ISSUES.filter(i => i.status === 'resolved').length;
  document.querySelectorAll('.stat-card').forEach((card, idx) => {
    const el = card.querySelector('.stat-num');
    if (el) el.textContent = ['critical','major','minor','pass'].map((k,i) => i === 3 ? resolved : counts[k])[idx];
  });
  const badge = document.querySelector('.nav-badge');
  if (badge) badge.textContent = counts.critical;
}

function renderIssues() {
  const tbody = document.getElementById('issue-tbody');
  if (!tbody) return;
  const filtered = ISSUES.filter(i =>
    (activeSev === 'all' || i.sev === activeSev) &&
    (!activeSearch || i.title.toLowerCase().includes(activeSearch) || (i.page && i.page.includes(activeSearch)))
  );
  tbody.innerHTML = filtered.map(issue => `
    <tr onclick="openModal(${issue.id})" style="cursor:pointer">
      <td><span class="sev-badge sev-${issue.sev}">${issue.sev}</span></td>
      <td>
        <span class="type-badge">${issue.type}</span>
        <span class="issue-title" style="display:block">${issue.title}</span>
        ${issue.selector ? `<span class="issue-selector">${issue.selector}</span>` : ''}
      </td>
      <td><span class="page-path">${issue.page}</span></td>
      <td><span class="status-${issue.status}"><span class="status-dot"></span><span class="status-text">${issue.status}</span></span></td>
    </tr>
  `).join('');
}

function filterSev(sev) {
  activeSev = sev;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.sev === sev));
  renderIssues();
}

function filterSearch(val) { activeSearch = val.toLowerCase(); renderIssues(); }

// ── MODAL ─────────────────────────────────────────────────────────────────────

function openModal(id) {
  activeIssue = ISSUES.find(i => i.id === id);
  if (!activeIssue) return;
  document.getElementById('modal-title').textContent    = activeIssue.title;
  document.getElementById('modal-selector').textContent = activeIssue.selector || '—';
  document.getElementById('modal-desc').textContent     = activeIssue.desc;
  const wcagEl = document.getElementById('modal-wcag');
  if (wcagEl) { wcagEl.style.display = activeIssue.wcag ? '' : 'none'; if (activeIssue.wcag) wcagEl.textContent = activeIssue.wcag; }
  const btn = document.getElementById('modal-status-btn');
  if (btn) btn.textContent = activeIssue.status === 'open' ? 'Mark as Resolved' : 'Reopen Issue';
  document.querySelector('.modal-overlay').classList.add('open');
}

function closeModal() {
  document.querySelector('.modal-overlay').classList.remove('open');
  activeIssue = null;
}

async function toggleStatus() {
  if (!activeIssue) return;
  const newStatus = activeIssue.status === 'open' ? 'resolved' : 'open';
  await fetch(`/api/issues/${activeIssue.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  });
  activeIssue.status = newStatus;
  const idx = ISSUES.findIndex(i => i.id === activeIssue.id);
  if (idx !== -1) ISSUES[idx].status = newStatus;
  document.getElementById('modal-status-btn').textContent = newStatus === 'open' ? 'Mark as Resolved' : 'Reopen Issue';
  renderIssues();
  renderStatCards();
}

// ── SCAN HISTORY ──────────────────────────────────────────────────────────────

async function renderHistory() {
  const scans = await fetch('/api/scans').then(r => r.json());
  const area  = document.getElementById('scans-view');
  if (!area) return;
  area.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Scan History</span>
        <span class="panel-count">${scans.length} scan${scans.length !== 1 ? 's' : ''}</span>
      </div>
      <table class="issue-table">
        <thead><tr><th>URL</th><th>Score</th><th>Pages</th><th>Date</th><th>Status</th><th></th></tr></thead>
        <tbody>${scans.map(s => `<tr>
          <td style="font-family:var(--mono);font-size:12px">${s.url}</td>
          <td><strong style="color:var(--accent)">${s.score ?? '—'}</strong></td>
          <td>${s.pages_scanned ?? '—'}</td>
          <td class="time-ago">${new Date(s.started_at * 1000).toLocaleString()}</td>
          <td>${s.status}</td>
          <td>${s.status === 'complete' ? `<button class="btn btn-ghost" onclick="loadScan(${s.id})">View</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

// ── VIEW SWITCHING ────────────────────────────────────────────────────────────

function switchView(view) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`[data-view="${view}"]`);
  if (nav) nav.classList.add('active');
  const dash  = document.getElementById('dashboard-view');
  const scans = document.getElementById('scans-view');
  if (view === 'scans') {
    if (dash)  dash.style.display  = 'none';
    if (scans) scans.style.display = '';
    renderHistory();
  } else {
    if (dash)  dash.style.display  = '';
    if (scans) scans.style.display = 'none';
  }
}
```

- [ ] **Step 7: Run all tests**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 8: Manual smoke test**

Run: `node server/index.js`

Open `http://localhost:3000`. Verify:
1. Dashboard loads with no console errors
2. Sidebar shows URL input + page selector + "Run Scan" button
3. Clicking "Scans" nav shows history view (empty initially)
4. Enter `https://example.com`, select 1 page, click "Run Scan"
5. Topbar shows "Scanning… 0/1 pages" while scan runs
6. On completion: score circle, stat cards, and issues table populate with real data
7. Clicking an issue opens the modal with real desc and WCAG info
8. "Mark as Resolved" persists across page reload

Stop with Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git add dashboard/index.html
git commit -m "feat: wire dashboard to live API — replace hardcoded data with real scan results"
```
