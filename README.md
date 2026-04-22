# Quality Assistant

A local website quality auditing tool that crawls any URL and automatically checks for accessibility, visual, content, SEO, performance, and security issues — then presents them in a clean dashboard with per-issue screenshots.

---

## How It Works

Quality Assistant runs entirely on your machine. When you submit a URL, a Node.js/Express server launches a headless Chromium browser (via Playwright), crawls the site, and runs seven independent check modules against every page found. Results are saved to a local SQLite database and streamed back to the dashboard in real time.

### Architecture

```
Browser (dashboard) ──► Express server (port 3000)
                              │
                    ┌─────────┴──────────┐
                    │    SQLite DB       │
                    │  (scans + issues)  │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Playwright crawl  │
                    │  + 7 check modules │
                    └────────────────────┘
```

### Check Modules

| Module | What it checks |
|---|---|
| **ADA / WCAG** | Injects axe-core; covers alt text, form labels, focus visibility, ARIA, heading order |
| **Visual** | Contrast ratios on body text & headings, oversized images, font sizes < 12px |
| **Content** | HEAD requests on all links and images; flags 404s, 5xx errors, and redirect chains |
| **SEO** | `<title>`, meta description, canonical tag, Open Graph tags, `<h1>` count |
| **Performance** | Page load time, total request count, page weight |
| **Security** | HTTP response headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| **Links** | Full link report for the page with optional screenshot |

### Severity & Scoring

Each issue is classified as **critical**, **major**, or **minor**. After a scan completes, a quality score (0–100) is computed:

```
score = max(0, 100 − (critical × 10) − (major × 4) − (minor × 1))
```

---

## Requirements

- **Node.js** v18 or newer
- **npm** v9 or newer

---

## Getting Started

### Option 1: Web Installer (Recommended for Windows)

The easiest way to install Quality Assistant on Windows is using the standalone web installer. It automates the entire setup process — installing Python, Visual C++ Build Tools, npm dependencies, and Playwright browser.

1. Start the **installer server**:
   ```bash
   npm run install:server
   ```
2. Open **http://localhost:3001/install** in your browser
3. Click the **Install Now** button
4. Follow the on-screen instructions

The installer will automatically download and run the appropriate setup script for your operating system. Once complete, you can start the application with `npm start`.

---

### Option 2: Manual Installation

**1. Clone the repository**

```bash
git clone https://github.com/urunkarpm/Quality-Assistant.git
cd Quality-Assistant
```

**2. Install dependencies**

**Windows** — run this single command in PowerShell as Administrator (installs Python, C++ build tools, npm packages, and Playwright):

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

**macOS / Linux:**

```bash
npm install
npx playwright install chromium
```

> **Note:** On macOS/Linux, you may need to install system dependencies for Playwright. See the [Playwright documentation](https://playwright.dev/docs/browsers) for details.

**3. Start the server**

```bash
npm start
```

The server starts on **http://localhost:3000**. Open that URL in your browser.

---

## Using the Dashboard

### Running a Scan

1. In the left sidebar, enter the full URL you want to audit (e.g. `https://example.com`).
2. Select the maximum number of pages to crawl (1, 5, 10, 25, or 50).
3. Toggle **Headed mode** if you want to watch the browser while it scans.
4. Click **Run Scan**.

The topbar shows live progress ("Scanning… N pages checked"). When complete, the dashboard automatically populates with results.

### Reading Results

- **Score circle** — your overall quality score out of 100.
- **Stat cards** — total issues broken down by severity (critical / major / minor).
- **Category bars** — issue count per check module.
- **Issue table** — every issue found, with:
  - Severity badge (critical / major / minor)
  - Category and rule title
  - The page URL where it was found
  - A cropped screenshot highlighting the affected element (where available)
  - WCAG reference (for accessibility issues)

### Filtering & Resolving Issues

- Use the **severity filter** buttons above the table to show only critical, major, or minor issues.
- Use the **category filter** to focus on a single check module (ADA, SEO, etc.).
- Click **Mark as Resolved** on any issue to track your fix progress. Resolved issues persist across page refreshes.

### Scan History

Click **Scans** in the left sidebar to see all previous scans. Click **View** next to any past scan to reload its results into the dashboard.

### Starting a New Scan

Click **New Scan** in the topbar to clear the current results and return to the input form.

---

## Project Structure

```
Quality Assistant/
├── server/
│   ├── index.js              # Express entry point
│   ├── db.js                 # SQLite setup (tables created on first run)
│   ├── scanner/
│   │   ├── crawler.js        # Playwright crawl; follows same-origin links
│   │   ├── runner.js         # Orchestrates crawl + all check modules
│   │   └── checks/
│   │       ├── ada.js
│   │       ├── visual.js
│   │       ├── content.js
│   │       ├── seo.js
│   │       ├── perf.js
│   │       ├── security.js
│   │       ├── links.js
│   │       └── compare.js
│   └── routes/
│       ├── scans.js          # POST/GET /api/scans
│       └── issues.js         # GET/PATCH /api/issues
└── dashboard/
    └── index.html            # Single-file frontend
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/scans` | Start a scan. Body: `{ url, pageLimit }` → returns `{ scanId }` |
| `GET` | `/api/scans` | List all past scans |
| `GET` | `/api/scans/:id` | Get scan status, score, and page count |
| `GET` | `/api/issues?scanId=` | Get all issues for a scan |
| `PATCH` | `/api/issues/:id` | Toggle issue status. Body: `{ status: "resolved" \| "open" }` |

---

## Running Tests

```bash
npm test
```

Tests use Jest and Supertest against a real in-memory SQLite database — no mocking.
