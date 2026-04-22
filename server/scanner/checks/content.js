// server/scanner/checks/content.js
const { checkUrlStatus, createIssue } = require('../utils');

async function check(page, _responseHeaders, pageUrl = '') {
  const path = pageUrl || '/';
  const issues = [];

  const { links, images } = await page.evaluate(() => ({
    links: Array.from(document.querySelectorAll('a[href]')).map(a => ({ 
      href: a.href, 
      text: a.textContent.trim().slice(0, 60) 
    })),
    images: Array.from(document.querySelectorAll('img[src]')).map(i => ({ src: i.src })),
  }));

  const checkedLinks = new Set();
  const checkedImages = new Set();

  for (const link of links) {
    const { status, hops } = await checkUrlStatus(link.href, checkedLinks);
    
    if (status !== null && status >= 400) {
      issues.push(createIssue({
        sev: 'major',
        type: 'Content',
        title: 'Broken link',
        selector: `a[href="${link.href}"]`,
        page: path,
        desc: `Link "${link.text || link.href}" returns HTTP ${status}.`
      }));
    }
    
    if (hops > 2) {
      issues.push(createIssue({
        sev: 'minor',
        type: 'Content',
        title: 'Excessive redirect chain',
        selector: `a[href="${link.href}"]`,
        page: path,
        desc: `Link "${link.text || link.href}" requires ${hops} redirects (max 2).`
      }));
    }
  }

  for (const img of images) {
    const { status, hops } = await checkUrlStatus(img.src, checkedImages);
    
    if (status !== null && status >= 400) {
      issues.push(createIssue({
        sev: 'major',
        type: 'Content',
        title: 'Broken image',
        selector: `img[src="${img.src}"]`,
        page: path,
        desc: `Image at "${img.src}" returns HTTP ${status}.`
      }));
    }
    
    if (hops > 2) {
      issues.push(createIssue({
        sev: 'minor',
        type: 'Content',
        title: 'Excessive redirect chain',
        selector: `img[src="${img.src}"]`,
        page: path,
        desc: `Image at "${img.src}" requires ${hops} redirects (max 2).`
      }));
    }
  }

  return issues;
}

module.exports = check;
