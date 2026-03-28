# Quality Assistant — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Scope:** v1.0 — single-user, local, Chrome extension + dashboard

---

## Overview

Quality Assistant is a browser extension + local web dashboard that helps QA professionals test web apps for ADA/WCAG accessibility violations and general UI issues. It supports both automated scanning (via axe-core) and manual issue logging, with all data stored locally in a SQLite database served through a Node.js backend.

---

## Users

Mixed technical and non-technical QA testers. Single user for v1 — no authentication, no teams.

---

## Architecture

Three local pieces, no cloud:

| Piece | Technology | Role |
|-------|-----------|------|
| Chrome Extension (MV3) | Vanilla JS, axe-core | Scans pages, logs issues, captures screenshots |
| Local Server | Node.js + Express + SQLite | Stores data, serves dashboard, exposes REST API |
| Dashboard | Vanilla HTML/CSS/JS | Displays issues, filters, ADA score, detail modal |

The extension communicates with the server via REST. The dashboard is served by the server at `localhost:3000` and polls for updates every 5 seconds.

---

## Extension

### Components

- **Popup** — toolbar UI with: current page info, Run ADA Scan button, Log Issue button, Screenshot button, live stats (issue count, ADA score, link to dashboard)
- **Content Script** — injected into active tab; runs axe-core, captures element selectors, enables the element picker
- **Background Service Worker** — routes data between content script and local server; checks server health on startup

### Features

| Feature | Description |
|---------|-------------|
| ADA Auto-Scan | Runs axe-core on the active tab; finds WCAG 2.1 AA violations; results POSTed to server |
| Basic Checks (custom) | Content script runs 5 custom checkers (see below) independently of axe-core |
| Element Picker | Click any element on the page to capture its CSS selector for a manual issue |
| Manual Issue Logging | Form in a slide-in panel: title, type (ADA/Visual/Functional/Content), severity (Critical/Major/Minor), auto-captured selector and screenshot |
| Annotated Screenshots | Before capturing, content script injects a highlight overlay (coloured borders + numbered badges) over all affected elements; `captureVisibleTab` captures with overlays visible; overlays removed immediately after |
| Live Score Badge | Popup shows current page's ADA score and open issue count |
| Server Health Check | Background worker pings `/health` on startup and every 30 seconds thereafter; disables scan/log buttons if server is offline and re-enables when it comes back |

### Basic Checks (Custom Content Script Checkers)

These run alongside axe-core whenever a scan is triggered. Each checker returns a list of affected elements and a severity.

| Check | How it works | Severity |
|-------|-------------|----------|
| **Heading hierarchy** | Walks all `h1`–`h6` elements in DOM order; flags any skip in level (e.g. h1 → h3) and pages with more than one h1 | Major |
| **Missing alt text** | Queries all `<img>` elements; flags any missing or empty `alt` attribute (supplements axe-core with richer context) | Critical |
| **Double spaces** | Walks all visible text nodes via TreeWalker; flags any occurrence of two or more consecutive space characters | Minor |
| **UI overlap** | For every pair of elements in a defined set (buttons, inputs, links, images), compares `getBoundingClientRect()` values; flags pairs whose bounding boxes intersect | Major |
| **Broken links** | Content script collects all `<a href>` URLs on the page; sends list to background service worker; worker performs `HEAD` requests for each (bypasses CORS); flags any that return 4xx or 5xx or timeout after 5s | Major |

### Annotated Screenshot System

Every scan (auto and manual) produces an **annotated screenshot** stored alongside the issue:

1. Content script collects all affected elements from the current scan pass.
2. A temporary overlay `<div>` is injected at the top of `<body>` with `pointer-events: none; position: fixed; inset: 0; z-index: 999999`.
3. For each affected element, a coloured highlight box is drawn at its `getBoundingClientRect()` position:
   - Critical → red border + red semi-transparent fill
   - Major → amber border + amber fill
   - Minor → blue border + blue fill
4. Each highlight box includes a numbered badge (1, 2, 3…) in its top-left corner.
5. A legend strip is injected at the bottom of the overlay listing issue numbers and titles.
6. `chrome.tabs.captureVisibleTab` captures the visible viewport with overlays present.
7. The overlay is removed immediately after capture.
8. The base64 screenshot is attached to the scan result POSTed to the server.
9. Individual issues also store a zoomed crop of their specific highlight (cropped client-side using an offscreen `<canvas>`).

The dashboard issue detail modal shows both: the full annotated page screenshot (scrollable) and the individual element crop.

---

## Server

**Stack:** Node.js, Express, better-sqlite3
**Runs at:** `localhost:3000`
**Start command:** `npm start`

### REST API

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/` | Serve the dashboard HTML |
| GET | `/health` | Extension health check |
| POST | `/api/scans` | Ingest axe-core results; bulk-upsert violations |
| GET | `/api/issues` | List issues; supports `?site=`, `?type=`, `?status=` |
| POST | `/api/issues` | Create a single manual issue |
| PATCH | `/api/issues/:id` | Update status, notes, or severity |
| GET | `/api/score/:site` | Return ADA score + POUR breakdown for a site |

### ADA Score Formula

Score is computed per-site as: `100 - (critical × 10 + major × 3 + minor × 1)`, clamped to 0–100. Only open issues count; resolved issues do not affect the score. POUR sub-scores use the same formula applied to violations tagged to each WCAG principle.

### Deduplication

Automated issues are deduplicated by `(page_url, wcag_rule, selector)`. Re-scanning a page updates existing auto issues rather than creating duplicates. Manual issues are always created as new records.

---

## Data Model (SQLite — `qa.db`)

### `issues`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| site | TEXT | Hostname, e.g. `app.example.com` |
| page_url | TEXT | Full URL of tested page |
| type | TEXT | `ADA`, `Visual`, `Functional`, `Content` |
| severity | TEXT | `critical`, `major`, `minor` |
| title | TEXT | Short description |
| description | TEXT | Full description / axe help text |
| selector | TEXT | CSS selector of affected element |
| wcag_rule | TEXT | Nullable — only set for ADA auto issues |
| screenshot_annotated | TEXT | Base64 — full page annotated screenshot with all issue highlights visible |
| screenshot_crop | TEXT | Base64 — zoomed crop of just the affected element |
| notes | TEXT | QA notes added via dashboard |
| status | TEXT | `open` or `resolved` |
| source | TEXT | `auto` (axe-core) or `manual` |
| created_at | DATETIME | Default: now |

### `scans`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| site | TEXT | Hostname |
| page_url | TEXT | Full URL scanned |
| ada_score | INTEGER | 0–100 computed score |
| issues_found | INTEGER | Count of violations found |
| screenshot_annotated | TEXT | Base64 — full page annotated screenshot for this scan run |
| scanned_at | DATETIME | Default: now |

---

## Dashboard

**Served at:** `localhost:3000`
**Tech:** Vanilla HTML/CSS/JS (already prototyped)
**Design:** Light-mode, Fraunces serif headings, IBM Plex Mono for technical data, amber/red/blue severity system

### Views

**Dashboard (home)**
- ADA score gauge with POUR criteria bars (Perceivable, Operable, Understandable, Robust)
- Stat cards: Critical / Major / Minor / Resolved counts
- Issue table with filters (type, status) and search
- Issue detail modal: screenshot, WCAG rule chip, CSS selector, description, notes textarea, resolve/reopen toggle

**Issue list** — same as dashboard table, standalone view
**Pages** — list of tested pages with per-page issue counts and ADA scores
**Scans** — history of automated scan runs
**ADA Report** — POUR breakdown and WCAG rule summary

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Server not running | Extension popup shows red badge + "Server offline" warning; Scan and Log Issue buttons disabled |
| axe-core scan fails | Popup shows "Scan failed — try reloading the page"; no partial data written |
| Screenshot capture fails | Issue saved without screenshot; modal shows "Screenshot unavailable" |
| Duplicate scan | Server deduplicates by (page_url + wcag_rule + selector); updates existing record |
| DB write failure | Server returns 500; extension shows toast: "Issue could not be saved — check server logs" |
| Broken link check timeout | Any link that doesn't respond within 5s is flagged as broken with a "timeout" note in the description |
| Overlay capture on dynamic page | Overlay uses `position: fixed` so it stays in viewport during capture even if page scrolls; for elements off-screen, the check is noted but no crop is produced |
| Double space in invisible text | TreeWalker filters nodes where `offsetParent === null` or `visibility: hidden`; only visible text is checked |

---

## Testing

| Layer | Tool | Coverage |
|-------|------|----------|
| Unit | Vitest | Express routes with in-memory SQLite: issue creation, deduplication, ADA score calculation, input validation |
| Integration | Playwright | Extension loaded in Chromium: scan → server → dashboard end-to-end |
| Visual | Playwright snapshots | Dashboard states: empty, loaded, modal open |
| Manual | Checklist | Known-accessible page → 0 critical; scan with missing alt text → issue appears; manual log → dashboard updates; resolve toggle; server kill → extension warning |

---

## Project Structure

```
quality-assistant/
├── extension/
│   ├── manifest.json
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── content/
│   │   ├── content.js       # scan orchestrator + element picker
│   │   ├── checkers/
│   │   │   ├── headings.js      # heading hierarchy checker
│   │   │   ├── alt-text.js      # missing alt text checker
│   │   │   ├── double-spaces.js # double space in text nodes
│   │   │   ├── overlap.js       # UI overlap detection
│   │   │   └── broken-links.js  # link URL collector (sends to worker)
│   │   ├── overlay.js       # annotated screenshot overlay system
│   │   └── panel.js         # log issue slide-in panel
│   ├── background/
│   │   └── worker.js        # service worker
│   └── vendor/
│       └── axe.min.js
├── server/
│   ├── index.js             # Express app entry
│   ├── routes/
│   │   ├── issues.js
│   │   ├── scans.js
│   │   └── score.js
│   ├── db/
│   │   ├── database.js      # better-sqlite3 init + migrations
│   │   └── schema.sql
│   └── package.json
├── dashboard/
│   └── index.html           # already prototyped
├── tests/
│   ├── unit/
│   └── integration/
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-03-26-quality-assistant-design.md
```

---

## Out of Scope (v1)

- Multi-user / team collaboration
- Report export (PDF/CSV)
- Bug tracker integrations (Jira, GitHub Issues)
- Firefox support
- Cloud storage or sync
- CI/CD integration
