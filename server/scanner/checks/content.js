// server/scanner/checks/content.js
async function check(page, _responseHeaders, pageUrl = '') {
  const path   = pageUrl ? new URL(pageUrl).pathname : '/';
  const issues = [];

  const { links, images } = await page.evaluate(() => ({
    links:  Array.from(document.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 60) })),
    images: Array.from(document.querySelectorAll('img[src]')).map(i => ({ src: i.src })),
  }));

  const checked = new Set();

  async function headCheck(url) {
    if (!url || checked.has(url)) return null;
    checked.add(url);
    if (/^(mailto:|tel:|javascript:)/i.test(url)) return null;
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      return res.status;
    } catch { return null; }
  }

  for (const link of links) {
    const status = await headCheck(link.href);
    if (status !== null && status >= 400) {
      issues.push({ sev: 'major', type: 'Content', title: 'Broken link', selector: `a[href="${link.href}"]`, page: path, wcag: null, desc: `Link "${link.text || link.href}" returns HTTP ${status}.` });
    }
  }

  for (const img of images) {
    const status = await headCheck(img.src);
    if (status !== null && status >= 400) {
      issues.push({ sev: 'major', type: 'Content', title: 'Broken image', selector: `img[src="${img.src}"]`, page: path, wcag: null, desc: `Image at "${img.src}" returns HTTP ${status}.` });
    }
  }

  return issues;
}

module.exports = check;
