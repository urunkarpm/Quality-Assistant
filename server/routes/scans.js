// server/routes/scans.js
const router = require('express').Router();
const { createScan, getScan, getScans, updateScan, createIssue, saveScreenshot } = require('../db');
const { runScan, computeScore } = require('../scanner/runner');

let scanRunning = false;
const scanLogs = new Map(); // scanId -> string[]

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
  if (!pageLimit || !Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 50) {
    return res.status(400).json({ error: 'pageLimit must be a positive integer' });
  }

  if (scanRunning) return res.status(409).json({ error: 'A scan is already in progress. Please wait for it to complete.' });
  scanRunning = true;

  const scanId = createScan(url, pageLimit);
  scanLogs.set(scanId, []);

  runScan(
    url,
    pageLimit,
    issue => createIssue(scanId, issue),
    (pageUrl, dataUrl) => saveScreenshot(scanId, pageUrl, dataUrl),
    msg => { const log = scanLogs.get(scanId); if (log) log.push(msg); }
  )
    .then(({ issues, pagesScanned }) => {
      updateScan(scanId, { status: 'complete', score: computeScore(issues), pages_scanned: pagesScanned, finished_at: Math.floor(Date.now() / 1000) });
    })
    .catch(err => {
      updateScan(scanId, { status: 'failed', error: err.message, finished_at: Math.floor(Date.now() / 1000) });
    })
    .finally(() => { scanRunning = false; });

  res.status(202).json({ scanId });
});

router.get('/:id/progress', (req, res) => {
  const scanId = Number(req.params.id);
  const log = scanLogs.get(scanId) ?? [];
  res.json({ log });
});

module.exports = router;
