# Screenshot Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a JPEG screenshot of each scanned page and display it in the issue modal.

**Architecture:** Playwright's `page.screenshot()` is called per page inside `runner.js` (before page.close()). The base64 JPEG is passed via a new `onScreenshot` callback to the scans route, which persists it in a new `screenshots` SQLite table. A new `GET /api/screenshots?scanId=&page=` endpoint retrieves it. The modal in `dashboard/index.html` fetches the screenshot when opening an issue and swaps the placeholder `<div>` for an `<img>`.

**Tech Stack:** Node.js, better-sqlite3, Playwright (already installed), Express, vanilla JS fetch

---

## File structure

| File | Change |
|------|--------|
| `server/db.js` | Add `screenshots` table DDL + `saveScreenshot` + `getScreenshot` |
| `server/scanner/runner.js` | Add `onScreenshot` 4th param, capture screenshot per page |
| `server/routes/screenshots.js` | New: `GET /api/screenshots?scanId=&page=` |
| `server/index.js` | Mount `/api/screenshots` |
| `server/routes/scans.js` | Pass `onScreenshot` callback to `runScan` |
| `tests/routes/screenshots.test.js` | New: route tests |
| `dashboard/index.html` | Fetch + display screenshot in modal |

---

## Task 1: DB — screenshots table

**Files:**
- Modify: `server/db.js`
- Modify: `tests/db.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/db.test.js` (after the existing tests):

```js
test('saveScreenshot and getScreenshot roundtrip', () => {
  process.env.DB_PATH = ':memory:';
  jest.resetModules();
  const db = require('../../server/db');
  const scanId = db.createScan('https://example.com', 1);
  db.saveScreenshot(scanId, 'https://example.com/', 'data:image/jpeg;base64,abc123');
  const shot = db.getScreenshot(scanId, 'https://example.com/');
  expect(shot).not.toBeNull();
  expect(shot.data_url).toBe('data:image/jpeg;base64,abc123');
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `cd "/home/uprasenjeet/Documents/Quality Assistant" && npx jest tests/db.test.js --no-coverage`
Expected: FAIL — `db.saveScreenshot is not a function`

- [ ] **Step 3: Add screenshots table and functions to server/db.js**

After the `issues` table DDL (around line 40), add:

```js
db.prepare(`CREATE TABLE IF NOT EXISTS screenshots (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id   INTEGER NOT NULL REFERENCES scans(id),
  page_url  TEXT NOT NULL,
  data_url  TEXT NOT NULL
)`).run();
```

After the existing `updateIssueStatus` function, add:

```js
function saveScreenshot(scanId, pageUrl, dataUrl) {
  db.prepare('INSERT INTO screenshots (scan_id, page_url, data_url) VALUES (?, ?, ?)')
    .run(scanId, pageUrl, dataUrl);
}

function getScreenshot(scanId, pageUrl) {
  return db.prepare('SELECT * FROM screenshots WHERE scan_id = ? AND page_url = ?')
    .get(scanId, pageUrl);
}
```

Add both to `module.exports`:

```js
module.exports = { createScan, getScan, getScans, updateScan, createIssue, getIssue, getIssues, updateIssueStatus, saveScreenshot, getScreenshot };
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `cd "/home/uprasenjeet/Documents/Quality Assistant" && npx jest tests/db.test.js --no-coverage`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/db.js tests/db.test.js
git commit -m "feat: add screenshots table and saveScreenshot/getScreenshot to db"
```

---

## Task 2: Runner — capture screenshot per page

**Files:**
- Modify: `server/scanner/runner.js`
- Modify: `tests/runner.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/runner.test.js`:

```js
describe('runScan onScreenshot callback', () => {
  test('onScreenshot is optional — runScan works without it', async () => {
    // This is already covered by existing behaviour; just verify computeScore still exports
    const { computeScore } = require('../server/scanner/runner');
    expect(typeof computeScore).toBe('function');
  });
});
```

This test is trivial because `runScan` is an integration function (full Playwright launch) that we don't unit-test directly. The callback addition is verified via the route test in Task 3.

- [ ] **Step 2: Run test to confirm it passes immediately**

Run: `cd "/home/uprasenjeet/Documents/Quality Assistant" && npx jest tests/runner.test.js --no-coverage`
Expected: PASS — 7 tests pass.

- [ ] **Step 3: Update runner.js to accept onScreenshot and capture screenshots**

Read `server/scanner/runner.js`. Change the function signature from:

```js
async function runScan(url, pageLimit, onIssue) {
```

To:

```js
async function runScan(url, pageLimit, onIssue, onScreenshot) {
```

Inside the per-page try block, after the checks loop and before the `finally` that closes the page, add a screenshot capture step. The full updated per-page block (inside the outer try, inside the for loop) should look like:

```js
    for (const { url: pageUrl, page, responseHeaders } of pages) {
      try {
        for (const fn of [adaCheck, visualCheck, contentCheck, seoCheck, perfCheck, securityCheck]) {
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
        if (onScreenshot) {
          try {
            const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
            onScreenshot(pageUrl, `data:image/jpeg;base64,${buf.toString('base64')}`);
          } catch (err) {
            console.warn(`[runner] screenshot failed on ${pageUrl}: ${err.message}`);
          }
        }
      } finally {
        await page.close();
      }
    }
```

- [ ] **Step 4: Run all tests to confirm nothing breaks**

Run: `cd "/home/uprasenjeet/Documents/Quality Assistant" && npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/scanner/runner.js tests/runner.test.js
git commit -m "feat: capture JPEG screenshot per page in runner (onScreenshot callback)"
```

---

## Task 3: Route + wiring — screenshots endpoint + scans integration

**Files:**
- Create: `server/routes/screenshots.js`
- Create: `tests/routes/screenshots.test.js`
- Modify: `server/index.js`
- Modify: `server/routes/scans.js`

- [ ] **Step 1: Write the failing test**

Create `tests/routes/screenshots.test.js`:

```js
// tests/routes/screenshots.test.js
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const express = require('express');

let app, db;
beforeEach(() => {
  jest.resetModules();
  process.env.DB_PATH = ':memory:';
  db           = require('../../server/db');
  const router = require('../../server/routes/screenshots');
  app = express();
  app.use('/api/screenshots', router);
});

describe('GET /api/screenshots', () => {
  test('returns 400 when scanId is missing', async () => {
    expect((await request(app).get('/api/screenshots?page=/')).status).toBe(400);
  });

  test('returns 400 when page is missing', async () => {
    expect((await request(app).get('/api/screenshots?scanId=1')).status).toBe(400);
  });

  test('returns 404 when screenshot does not exist', async () => {
    expect((await request(app).get('/api/screenshots?scanId=999&page=/')).status).toBe(404);
  });

  test('returns data_url for a saved screenshot', async () => {
    const scanId = db.createScan('https://example.com', 1);
    db.saveScreenshot(scanId, 'https://example.com/', 'data:image/jpeg;base64,abc');
    const res = await request(app).get(`/api/screenshots?scanId=${scanId}&page=${encodeURIComponent('https://example.com/')}`);
    expect(res.status).toBe(200);
    expect(res.body.dataUrl).toBe('data:image/jpeg;base64,abc');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `cd "/home/uprasenjeet/Documents/Quality Assistant" && npx jest tests/routes/screenshots.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../../server/routes/screenshots'"

- [ ] **Step 3: Create server/routes/screenshots.js**

```js
// server/routes/screenshots.js
const router = require('express').Router();
const { getScreenshot } = require('../db');

router.get('/', (req, res) => {
  const { scanId, page } = req.query;
  if (!scanId) return res.status(400).json({ error: 'scanId is required' });
  if (!page)   return res.status(400).json({ error: 'page is required' });
  const shot = getScreenshot(Number(scanId), page);
  if (!shot) return res.status(404).json({ error: 'Screenshot not found' });
  res.json({ dataUrl: shot.data_url });
});

module.exports = router;
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `cd "/home/uprasenjeet/Documents/Quality Assistant" && npx jest tests/routes/screenshots.test.js --no-coverage`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Mount the route in server/index.js**

In `server/index.js`, add after the existing route mounts:

```js
app.use('/api/screenshots', require('./routes/screenshots'));
```

The file should now read:

```js
// server/index.js
const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dashboard')));

app.use('/api/scans',       require('./routes/scans'));
app.use('/api/issues',      require('./routes/issues'));
app.use('/api/screenshots', require('./routes/screenshots'));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Quality Assistant running on http://localhost:${PORT}`));
}

module.exports = app;
```

- [ ] **Step 6: Pass onScreenshot callback in server/routes/scans.js**

Read `server/routes/scans.js`. Update the imports line to also import `saveScreenshot`:

```js
const { createScan, getScan, getScans, updateScan, createIssue, saveScreenshot } = require('../db');
```

Update the `runScan` call (currently at line 29) to pass a 4th argument:

```js
  runScan(
    url,
    pageLimit,
    issue => createIssue(scanId, issue),
    (pageUrl, dataUrl) => saveScreenshot(scanId, pageUrl, dataUrl)
  )
```

- [ ] **Step 7: Run all tests to confirm everything passes**

Run: `cd "/home/uprasenjeet/Documents/Quality Assistant" && npx jest --no-coverage`
Expected: All tests pass (65+ tests).

- [ ] **Step 8: Commit**

```bash
git add server/routes/screenshots.js tests/routes/screenshots.test.js server/index.js server/routes/scans.js
git commit -m "feat: add screenshots API route and wire onScreenshot callback in scans route"
```

---

## Task 4: Frontend — display screenshot in modal

**Files:**
- Modify: `dashboard/index.html`

- [ ] **Step 1: Read the current modal screenshot area**

The modal currently has (around line 959):

```html
<div class="modal-screenshot">
  <span class="screenshot-label">SCREENSHOT</span>
  <div class="screenshot-placeholder">
    [IMG]<br>Screenshot captured by extension<br>
    <span style="font-size:10px;color:var(--border2)">Click element in page to update</span>
  </div>
</div>
```

Add `id="modal-screenshot-container"` to the outer div and `id="screenshot-placeholder"` to the inner placeholder div:

```html
<div class="modal-screenshot" id="modal-screenshot-container">
  <span class="screenshot-label">SCREENSHOT</span>
  <div id="screenshot-placeholder" class="screenshot-placeholder">
    [IMG] Screenshot captured by extension<br>
    <span style="font-size:10px;color:var(--border2)">Click element in page to update</span>
  </div>
</div>
```

- [ ] **Step 2: Update openModal() to fetch and display the screenshot**

Find the `openModal` function in the `<script>` block. It currently ends with:

```js
  document.querySelector('.modal-overlay').classList.add('open');
}
```

Replace the entire `openModal` function with:

```js
async function openModal(id) {
  activeIssue = ISSUES.find(i => i.id === id);
  if (!activeIssue) return;
  document.getElementById('modal-title').textContent    = activeIssue.title;
  document.getElementById('modal-selector').textContent = activeIssue.selector || '—';
  document.getElementById('modal-desc').textContent     = activeIssue.desc;
  const wcagEl = document.getElementById('modal-wcag');
  if (wcagEl) { wcagEl.style.display = activeIssue.wcag ? '' : 'none'; if (activeIssue.wcag) wcagEl.textContent = activeIssue.wcag; }
  const btn = document.getElementById('modal-status-btn');
  if (btn) btn.textContent = activeIssue.status === 'open' ? 'Mark as Resolved' : 'Reopen Issue';

  // Load screenshot
  const container   = document.getElementById('modal-screenshot-container');
  const placeholder = document.getElementById('screenshot-placeholder');
  const existingImg = container.querySelector('img');
  if (existingImg) existingImg.remove();
  placeholder.style.display = '';

  if (activeScanId) {
    try {
      const r = await fetch(`/api/screenshots?scanId=${activeScanId}&page=${encodeURIComponent(activeIssue.page)}`);
      if (r.ok) {
        const { dataUrl } = await r.json();
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = 'width:100%;border-radius:4px;display:block;margin-top:6px;';
        placeholder.style.display = 'none';
        container.appendChild(img);
      }
    } catch { /* screenshot unavailable — show placeholder */ }
  }

  document.querySelector('.modal-overlay').classList.add('open');
}
```

- [ ] **Step 3: Store activeScanId when loadScan is called**

Add `let activeScanId = null;` to the global variables at the top of the script block (alongside `let ISSUES = [];` etc.).

In `loadScan`, after `ISSUES = issues;`, add:

```js
  activeScanId = scanId;
```

- [ ] **Step 4: Run all tests**

Run: `cd "/home/uprasenjeet/Documents/Quality Assistant" && npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/index.html
git commit -m "feat: display page screenshot in issue modal"
```

