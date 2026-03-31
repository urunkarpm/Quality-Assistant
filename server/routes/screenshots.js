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
