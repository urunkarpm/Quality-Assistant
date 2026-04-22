// i18n internationalization module
const fs = require('fs');
const path = require('path');

const SUPPORTED_LOCALES = ['en', 'es', 'fr'];
const DEFAULT_LOCALE = 'en';

let translations = {};
let currentLocale = DEFAULT_LOCALE;

function loadTranslations(locale) {
  const filePath = path.join(__dirname, 'locales', `${locale}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`[i18n] Translation file not found for locale: ${locale}`);
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`[i18n] Error loading translation file ${locale}:`, err.message);
    return {};
  }
}

function init(locale = DEFAULT_LOCALE) {
  setLocale(locale);
}

function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    console.warn(`[i18n] Unsupported locale: ${locale}, falling back to ${DEFAULT_LOCALE}`);
    locale = DEFAULT_LOCALE;
  }
  currentLocale = locale;
  translations = loadTranslations(locale);
  return currentLocale;
}

function getLocale() {
  return currentLocale;
}

function getSupportedLocales() {
  return SUPPORTED_LOCALES;
}

function t(key, params = {}) {
  const keys = key.split('.');
  let value = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to English
      if (currentLocale !== DEFAULT_LOCALE) {
        const enTranslations = loadTranslations(DEFAULT_LOCALE);
        let fallbackValue = enTranslations;
        for (const fk of keys) {
          if (fallbackValue && typeof fallbackValue === 'object' && fk in fallbackValue) {
            fallbackValue = fallbackValue[fk];
          } else {
            return key; // Key not found in any locale
          }
        }
        value = fallbackValue;
      } else {
        return key; // Key not found
      }
    }
  }
  
  if (typeof value !== 'string') {
    return key;
  }
  
  // Replace placeholders like {{count}}
  return value.replace(/\{\{(\w+)\}\}/g, (match, paramName) => {
    return params[paramName] !== undefined ? params[paramName] : match;
  });
}

// Express middleware for i18n
function i18nMiddleware(req, res, next) {
  // Check for locale in query param, header, or cookie
  const requestedLocale = 
    req.query.lang || 
    req.headers['accept-language']?.split(',')[0]?.split('-')[0] ||
    req.cookies?.locale ||
    DEFAULT_LOCALE;
  
  setLocale(requestedLocale);
  
  // Make translation function available in request
  req.t = t;
  req.locale = currentLocale;
  
  // Make available in response locals for templates
  res.locals.t = t;
  res.locals.locale = currentLocale;
  res.locals.supportedLocales = SUPPORTED_LOCALES;
  
  next();
}

module.exports = {
  init,
  setLocale,
  getLocale,
  getSupportedLocales,
  t,
  i18nMiddleware,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE
};
