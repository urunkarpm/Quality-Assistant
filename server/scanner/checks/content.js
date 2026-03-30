// server/scanner/checks/content.js
async function check(page, _responseHeaders, pageUrl = '') {
  const path   = pageUrl ? new URL(pageUrl).pathname : '/';
  const issues = [];

  const { links, images } = await page.evaluate(() => ({
    links:  Array.from(document.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 60) })),
    images: Array.from(document.querySelectorAll('img[src]')).map(i => ({ src: i.src })),
  }));

  const checkedLinks = new Set();
  const checkedImages = new Set();

  async function headCheck(url, checked) {
    if (!url || checked.has(url)) return { status: null, hops: 0 };
    checked.add(url);
    if (/^(mailto:|tel:|javascript:)/i.test(url)) return { status: null, hops: 0 };
    let current = url;
    let hops = 0;
    try {
      while (hops <= 10) {
        const res = await fetch(current, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000) });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) break;
          current = new URL(loc, current).href;
          hops++;
        } else {
          return { status: res.status, hops };
        }
      }
      return { status: null, hops };
    } catch { return { status: null, hops: 0 }; }
  }

  for (const link of links) {
    const { status, hops } = await headCheck(link.href, checkedLinks);
    if (status !== null && status >= 400) {
      issues.push({ sev: 'major', type: 'Content', title: 'Broken link', selector: `a[href="${link.href}"]`, page: path, wcag: null, desc: `Link "${link.text || link.href}" returns HTTP ${status}.` });
    }
    if (hops > 2) {
      issues.push({ sev: 'minor', type: 'Content', title: 'Excessive redirect chain', selector: `a[href="${link.href}"]`, page: path, wcag: null, desc: `Link "${link.text || link.href}" requires ${hops} redirects (max 2).` });
    }
  }

  for (const img of images) {
    const { status, hops } = await headCheck(img.src, checkedImages);
    if (status !== null && status >= 400) {
      issues.push({ sev: 'major', type: 'Content', title: 'Broken image', selector: `img[src="${img.src}"]`, page: path, wcag: null, desc: `Image at "${img.src}" returns HTTP ${status}.` });
    }
    if (hops > 2) {
      issues.push({ sev: 'minor', type: 'Content', title: 'Excessive redirect chain', selector: `img[src="${img.src}"]`, page: path, wcag: null, desc: `Image at "${img.src}" requires ${hops} redirects (max 2).` });
    }
  }

  return issues;
}

module.exports = check;
