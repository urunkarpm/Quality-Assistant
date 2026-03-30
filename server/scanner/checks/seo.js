// server/scanner/checks/seo.js
async function check(page, _responseHeaders, pageUrl = '') {
  const path = pageUrl ? new URL(pageUrl).pathname : '/';

  const data = await page.evaluate(() => ({
    title:       document.title,
    description: document.querySelector('meta[name="description"]')?.content?.trim() || '',
    canonical:   !!document.querySelector('link[rel="canonical"]'),
    ogTitle:     !!document.querySelector('meta[property="og:title"]'),
    h1Count:     document.querySelectorAll('h1').length,
  }));

  const issues = [];
  if (!data.title)       issues.push({ sev: 'major', type: 'SEO', title: 'Missing page title',       selector: 'title',                      page: path, wcag: null, desc: 'The page has no <title> element. Search engines use the title to index and display the page in results.' });
  if (!data.description) issues.push({ sev: 'major', type: 'SEO', title: 'Missing meta description', selector: 'meta[name="description"]',    page: path, wcag: null, desc: 'No meta description found. Search engines show the description in results; missing it reduces click-through rate.' });
  if (!data.canonical)   issues.push({ sev: 'minor', type: 'SEO', title: 'Missing canonical link',   selector: 'link[rel="canonical"]',       page: path, wcag: null, desc: 'No canonical link element found. This can cause duplicate-content penalties in search engines.' });
  if (!data.ogTitle)     issues.push({ sev: 'minor', type: 'SEO', title: 'Missing Open Graph tags',  selector: 'meta[property="og:title"]',   page: path, wcag: null, desc: 'No og:title meta tag found. Open Graph tags control how the page appears when shared on social media.' });
  if (data.h1Count === 0)   issues.push({ sev: 'minor', type: 'SEO', title: 'Page has no H1 heading',        selector: 'h1', page: path, wcag: null, desc: 'No <h1> element found. A clear H1 helps search engines understand the primary topic of the page.' });
  else if (data.h1Count > 1) issues.push({ sev: 'minor', type: 'SEO', title: 'Multiple H1 headings on page', selector: 'h1', page: path, wcag: null, desc: `Page has ${data.h1Count} <h1> elements. More than one H1 confuses search engines about the page primary topic.` });

  return issues;
}

module.exports = check;
