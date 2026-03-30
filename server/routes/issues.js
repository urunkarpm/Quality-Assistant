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
