// Example plugin: Check for company branding elements
async function brandingCheck(page, responseHeaders, url) {
  const issues = [];
  
  // Check if company logo is present
  const hasLogo = await page.evaluate(() => {
    return !!document.querySelector('img[alt*="logo" i], .logo, [class*="logo"], img[src*="logo" i]');
  });
  
  if (!hasLogo) {
    issues.push({
      type: 'branding',
      sev: 'minor',
      title: 'Company logo not found',
      description: 'No recognizable logo element was detected on this page.',
      recommendation: 'Add a company logo in the header or navigation area.',
      selector: 'body',
      url: url
    });
  }
  
  // Check for consistent brand colors (example: look for primary brand color)
  const hasBrandColor = await page.evaluate(() => {
    const allColors = [];
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      const color = style.color;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        allColors.push(bg);
      }
      if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'rgb(0, 0, 0)') {
        allColors.push(color);
      }
    });
    // Simple heuristic: check if there's any non-gray color
    return allColors.some(c => !c.includes('128') && !c.includes('160') && !c.includes('#80') && !c.includes('#99'));
  });
  
  if (!hasBrandColor && url.includes('home')) {
    issues.push({
      type: 'branding',
      sev: 'minor',
      title: 'Limited brand color usage',
      description: 'The page appears to use mostly neutral colors without distinctive brand colors.',
      recommendation: 'Incorporate your brand\'s primary colors in key elements like buttons, headers, or accents.',
      selector: 'body',
      url: url
    });
  }
  
  return issues;
}

module.exports = brandingCheck;
