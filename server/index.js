// server/index.js
const express = require('express');
const path    = require('path');
const i18n    = require('../i18n');

const app  = express();
const PORT = process.env.PORT || 3000;

// Initialize i18n with default locale
i18n.init(process.env.DEFAULT_LOCALE || 'en');

app.use(express.json());
app.use(i18n.i18nMiddleware);
app.use(express.static(path.join(__dirname, '../dashboard')));

// API routes
app.use('/api/scans',       require('./routes/scans'));
app.use('/api/issues',      require('./routes/issues'));
app.use('/api/screenshots', require('./routes/screenshots'));

// Locale API endpoint
app.get('/api/locale', (req, res) => {
  res.json({
    locale: req.locale,
    supportedLocales: i18n.getSupportedLocales(),
    translations: {} // Client loads translations separately
  });
});

// Serve localized dashboard
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

// Only start listening when run directly, not when required by tests
if (require.main === module) {
  // Mark any scans that were left "running" (from a previous crashed session) as failed
  require('./db').markStaleScans();

  app.listen(PORT, () => console.log(`Quality Assistant running on http://localhost:${PORT}`));
}

module.exports = app;
