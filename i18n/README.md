# Internationalization (i18n)

This module provides multi-language support for the Quality Assistant dashboard.

## Supported Languages

- English (`en`) - Default
- Spanish (`es`)
- French (`fr`)

## Usage

### Server-side

```js
const i18n = require('./i18n');

// Initialize with default locale
i18n.init('en');

// Change locale
i18n.setLocale('es');

// Translate a key
const title = i18n.t('dashboard.title'); // "Quality Assistant" or "Asistente de Calidad"

// With parameters
const timeAgo = i18n.t('timeAgo.minutesAgo', { count: 5 }); // "5m ago"
```

### Express Middleware

The i18n middleware automatically detects the user's preferred language from:
1. Query parameter: `?lang=es`
2. Accept-Language header
3. Cookie: `locale`
4. Default: English

### Client-side

Load translations via the `/api/locale` endpoint:

```js
fetch('/api/locale')
  .then(res => res.json())
  .then(data => {
    console.log('Current locale:', data.locale);
    console.log('Supported locales:', data.supportedLocales);
  });
```

## Adding New Languages

1. Create a new JSON file in `i18n/locales/` (e.g., `de.json` for German)
2. Copy the structure from `en.json` and translate all values
3. Add the locale code to `SUPPORTED_LOCALES` in `i18n/index.js`

## Translation Key Structure

```
dashboard.title          -> "Quality Assistant"
dashboard.sidebar.scans  -> "Scans"
severity.critical        -> "Critical"
```

## Placeholder Syntax

Use `{{variable}}` for dynamic values:

```json
{
  "timeAgo": {
    "minutesAgo": "{{count}}m ago"
  }
}
```

```js
t('timeAgo.minutesAgo', { count: 10 }); // "10m ago"
```
