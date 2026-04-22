# Plugin System

Custom check modules can be placed in this directory. Each plugin should export a function with the following signature:

```js
// Example plugin: server/scanner/plugins/branding.js
async function brandingCheck(page, responseHeaders, url) {
  const issues = [];
  
  // Example: Check if company logo is present
  const hasLogo = await page.evaluate(() => {
    return !!document.querySelector('img[alt*="logo" i], .logo, [class*="logo"]');
  });
  
  if (!hasLogo) {
    issues.push({
      type: 'branding',
      sev: 'minor',
      title: 'Company logo not found',
      selector: 'body',
      url: url
    });
  }
  
  return issues;
}

module.exports = brandingCheck;
```

## Plugin Interface

- **Parameters:**
  - `page`: Playwright Page object
  - `responseHeaders`: Object containing HTTP response headers
  - `url`: Current page URL being checked

- **Returns:** Array of issue objects with:
  - `type`: Category name (e.g., 'branding', 'custom')
  - `sev`: Severity ('critical', 'major', 'minor')
  - `title`: Human-readable issue description
  - `selector`: CSS selector to highlight the problematic element
  - `url`: Page URL where issue was found
  - `description` (optional): Detailed explanation
  - `recommendation` (optional): Suggested fix

## Loading Plugins

Plugins are automatically loaded from the `server/scanner/plugins/` directory when the scanner starts. Each `.js` file (except config files) should export a single check function.
