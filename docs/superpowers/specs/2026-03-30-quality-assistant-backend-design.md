# Quality Assistant — Backend & Full-Stack Design

**Date:** 2026-03-30
**Status:** Approved

## Overview

Transform the existing static `dashboard/index.html` prototype into a fully functional website quality auditing tool. A Node.js/Express backend will crawl user-supplied URLs using Playwright, run six categories of checks, persist results in SQLite, and serve them to the existing dashboard UI.

---

## Architecture

Single monolith: Express serves the static dashboard AND the REST API from one process (`npm start`).

```
Quality Assistant/
├── server/
│   ├── index.js              # Express entry point; serves dashboard + mounts API routes
│   ├── db.js                 # SQLite setup via better-sqlite3; creates tables on first run
│   ├── scanner/
│   │   ├── crawler.js        # Playwright crawl: follows same-origin links up to user's page limit
│   │   ├── runner.js         # Orchestrates crawl + all check modules → normalised issue list
│   │   └── checks/
│   │       ├── ada.js        # Injects axe-core; maps violations to critical/major/minor by impact
│   │       ├── visual.js     # Contrast ratios, oversized/missing images, font sizes < 12px
│   │       ├── content.js    # HEAD requests on all <a> and <img> hrefs; flags 404s/broken images
│   │       ├── seo.js        # title, meta description, canonical, OG tags, robots meta, h1 count
│   │       ├── perf.js       # Playwright timing API: load time > 3s, total requests, page weight > 2MB
│   │       └── security.js   # HTTP response headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
│   └── routes/
│       ├── scans.js          # POST /api/scans (start scan), GET /api/scans (history), GET /api/scans/:id (status + score)
│       └── issues.js         # GET /api/issues?scanId= (all issues for a scan)
└── dashboard/
    └── index.html            # Modified: real API calls replace hardcoded data
```

**Data flow:**
1. User enters URL + page limit → `POST /api/scans` → returns `{ scanId }`
2. Scan runs async: crawler visits pages with Playwright → each page runs all 6 check modules
3. Issues normalised and saved to SQLite as they are found; scan status updated to `complete`
4. Frontend polls `GET /api/scans/:id` every 2 seconds until `status === 'complete'`
5. On complete, frontend fetches `GET /api/issues?scanId=` and re-renders all UI components

---

## Scanner Checks

Each check module signature: `async function check(page, responseHeaders) → Issue[]`

Normalised issue shape:
```js
{
  sev:      'critical' | 'major' | 'minor',
  type:     'ADA' | 'Visual' | 'Content' | 'SEO' | 'Performance' | 'Security',
  title:    string,
  selector: string | null,
  page:     string,   // URL path
  wcag:     string | null,
  desc:     string,
}
```

| Module | What it checks |
|--------|---------------|
| **ADA** | Injects axe-core into each page; maps axe `impact` (critical→critical, serious→critical, moderate→major, minor→minor) to issue severity; covers alt text, form labels, focus visibility, lang attribute, ARIA, heading order |
| **Visual** | Contrast ratio on body text and headings (< 4.5:1 = major), images wider than viewport (minor), font-size < 12px (minor) |
| **Content** | HEAD requests for all `<a href>` and `<img src>` on each page; 404/5xx = major; redirect chains > 2 hops = minor |
| **SEO** | Missing `<title>` = major; missing/empty meta description = major; missing canonical = minor; missing OG tags = minor; `<h1>` count ≠ 1 = minor |
| **Performance** | Load time > 3s = major, > 5s = critical; total requests > 100 = minor; page weight > 2MB = major |
| **Security** | Missing CSP = major; missing HSTS = major; missing X-Frame-Options = minor; missing X-Content-Type-Options = minor; missing Referrer-Policy = minor |

---

## Database Schema

**`scans`**
```sql
id             INTEGER PRIMARY KEY AUTOINCREMENT
url            TEXT NOT NULL          -- seed URL entered by user
page_limit     INTEGER NOT NULL       -- max pages to crawl
status         TEXT NOT NULL          -- 'running' | 'complete' | 'failed'
started_at     INTEGER NOT NULL       -- unix timestamp (seconds)
finished_at    INTEGER                -- null until complete
score          INTEGER                -- 0–100, null until complete
pages_scanned  INTEGER                -- null until complete
error          TEXT                   -- null unless status = 'failed'
```

**`issues`**
```sql
id        INTEGER PRIMARY KEY AUTOINCREMENT
scan_id   INTEGER NOT NULL REFERENCES scans(id)
sev       TEXT NOT NULL    -- 'critical' | 'major' | 'minor'
type      TEXT NOT NULL    -- 'ADA' | 'Visual' | 'Content' | 'SEO' | 'Performance' | 'Security'
title     TEXT NOT NULL
selector  TEXT             -- nullable
page      TEXT NOT NULL    -- URL path where issue was found
wcag      TEXT             -- nullable; WCAG rule reference
desc      TEXT NOT NULL
status    TEXT NOT NULL DEFAULT 'open'   -- 'open' | 'resolved'
```

**Score formula:** `max(0, 100 − (critical × 10) − (major × 4) − (minor × 1))`

---

## Frontend Changes

All changes confined to `dashboard/index.html`. No new files.

### Scan launcher
- Replace hardcoded site selector in sidebar with: URL text input + page-count `<select>` (options: 1, 5, 10, 25, 50) + "Run Scan" button
- On submit: `POST /api/scans` → store returned `scanId` → begin polling

### Live scan status
- Topbar shows "Scanning… N/M pages" while `status === 'running'`
- Frontend polls `GET /api/scans/:id` every 2 seconds
- On `status === 'complete'`: fetch issues and re-render all components

### Data binding
- Replace `const ISSUES = [...]` with `async function loadScan(scanId)`
- Fetches `GET /api/issues?scanId=` → re-renders issue table, score circle, stat cards, category bars
- Category bars expand from 4 to 6 categories: ADA, Visual, Content, SEO, Performance, Security

### Scan history (Scans nav item)
- `GET /api/scans` returns list of past scans (url, started_at, score, pages_scanned, status)
- Displayed as a table; "View" button calls `loadScan(id)` to restore any past scan

### Resolve/reopen
- "Mark as Resolved" button calls `PATCH /api/issues/:id` to toggle status in DB (persisted)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/scans` | Body: `{ url, pageLimit }` → starts scan async, returns `{ scanId }` |
| `GET` | `/api/scans` | Returns array of all scans (history) |
| `GET` | `/api/scans/:id` | Returns scan record including status, score, pages_scanned |
| `GET` | `/api/issues` | Query: `?scanId=` → returns all issues for that scan |
| `PATCH` | `/api/issues/:id` | Body: `{ status }` → toggles open/resolved in DB |

---

## Out of Scope

- Authentication / multi-user
- Scheduled/recurring scans
- Email notifications
- Screenshot capture (placeholder UI remains)
- Deployment / Docker
