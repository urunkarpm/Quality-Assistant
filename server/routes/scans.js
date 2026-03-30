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
