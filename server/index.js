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
