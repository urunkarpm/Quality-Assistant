// server/routes/issues.js
const router = require('express').Router();
const { getIssue, getIssues, updateIssueStatus } = require('../db');

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
  const id = Number(req.params.id);
  if (!getIssue(id)) {
    return res.status(404).json({ error: 'Issue not found' });
  }
  updateIssueStatus(id, status);
  res.json({ id, status });
});

module.exports = router;
