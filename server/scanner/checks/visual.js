// server/scanner/checks/visual.js

function luminance(r, g, b) {
  return [r, g, b].reduce((acc, c, i) => {
    const s   = c / 255;
    const lin = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    return acc + lin * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}

function contrastRatio(fg, bg) {
  const l1 = luminance(...fg), l2 = luminance(...bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function parseRgb(str) {
  const m = str.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+)?\s*\)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

async function check(page, _responseHeaders, pageUrl = '') {
  const path = pageUrl || '/';
  const issues = [];

  const { textElements, imgs, vpWidth } = await page.evaluate(() => {
    const tags   = ['P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'A', 'LABEL', 'TD', 'TH'];
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const textElements = Array.from(document.querySelectorAll(tags.join(','))).map(el => {
      if (!el.textContent.trim()) return null;
      const s = window.getComputedStyle(el);
      return {
        selector: el.id ? '#' + el.id : el.tagName.toLowerCase(),
        color:    s.color,
        bg:       s.backgroundColor !== 'rgba(0, 0, 0, 0)' ? s.backgroundColor : bodyBg,
        fontSize: parseFloat(s.fontSize),
      };
    }).filter(Boolean);
    const imgs = Array.from(document.querySelectorAll('img')).map(img => ({
      selector:    img.id ? '#' + img.id : 'img',
      offsetWidth: img.offsetWidth,
    }));
    return { textElements, imgs, vpWidth: window.innerWidth };
  });

  const seenContrast = new Set(), seenFont = new Set();
  for (const el of textElements) {
    const fg = parseRgb(el.color), bg = parseRgb(el.bg);
    if (fg && bg && !seenContrast.has(el.selector)) {
      const ratio = contrastRatio(fg, bg);
      if (ratio < 4.5) {
        seenContrast.add(el.selector);
        issues.push({ sev: 'major', type: 'Visual', title: 'Insufficient colour contrast', selector: el.selector, page: path, wcag: null, desc: `Text on "${el.selector}" has a contrast ratio of ${ratio.toFixed(2)}:1 (minimum 4.5:1 for normal text).` });
      }
    }
    if (el.fontSize < 12 && !seenFont.has(el.selector)) {
      seenFont.add(el.selector);
      issues.push({ sev: 'minor', type: 'Visual', title: 'Text too small to read', selector: el.selector, page: path, wcag: null, desc: `Text on "${el.selector}" is ${el.fontSize}px — below the 12px minimum for readability.` });
    }
  }

  for (const img of imgs) {
    if (img.offsetWidth > vpWidth) {
      issues.push({ sev: 'minor', type: 'Visual', title: 'Image wider than viewport', selector: img.selector, page: path, wcag: null, desc: `Image "${img.selector}" is ${img.offsetWidth}px wide, exceeding the ${vpWidth}px viewport. This causes horizontal scrolling on mobile.` });
    }
  }

  return issues;
}

module.exports = check;
