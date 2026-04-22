// server/scanner/utils.js
/**
 * Common utilities for scanner checks
 */

/**
 * Creates a standardized issue object
 * @param {Object} options - Issue properties
 * @param {'critical'|'major'|'minor'} options.sev - Severity level
 * @param {string} options.type - Issue type/category
 * @param {string} options.title - Brief issue title
 * @param {string|null} options.selector - CSS selector for the issue element
 * @param {string} options.page - Page URL where issue was found
 * @param {string|null} options.wcag - WCAG reference if applicable
 * @param {string} options.desc - Detailed description
 * @returns {Object} Standardized issue object
 */
function createIssue({ sev, type, title, selector = null, page, wcag = null, desc }) {
  return { sev, type, title, selector, page, wcag, desc };
}

/**
 * Normalizes a URL by removing hash fragments
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  return url.split('#')[0];
}

/**
 * Checks if a URL is an external resource that shouldn't be validated
 * @param {string} url - URL to check
 * @returns {boolean} True if URL should be skipped
 */
function isSkippableUrl(url) {
  if (!url) return true;
  return /^(mailto:|tel:|javascript:|data:)/i.test(url);
}

/**
 * Performs a HEAD request to check URL status
 * @param {string} url - URL to check
 * @param {Set<string>} checked - Set of already checked URLs to avoid duplicates
 * @param {number} timeout - Request timeout in ms
 * @param {number} maxRedirects - Maximum redirect hops to follow
 * @returns {Promise<{status: number|null, hops: number}>} Status code and redirect count
 */
async function checkUrlStatus(url, checked = new Set(), timeout = 8000, maxRedirects = 10) {
  if (!url || checked.has(url)) {
    return { status: null, hops: 0 };
  }
  
  checked.add(url);
  
  if (isSkippableUrl(url)) {
    return { status: null, hops: 0 };
  }
  
  let current = url;
  let hops = 0;
  
  try {
    while (hops <= maxRedirects) {
      const response = await fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeout)
      });
      
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        current = new URL(location, current).href;
        hops++;
      } else {
        return { status: response.status, hops };
      }
    }
    return { status: null, hops };
  } catch {
    return { status: null, hops: 0 };
  }
}

/**
 * Parses an RGB color string into an array of [r, g, b] values
 * @param {string} str - RGB color string (e.g., "rgb(255, 0, 0)")
 * @returns {number[]|null} Array of RGB values or null if parsing fails
 */
function parseRgb(str) {
  const match = str.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+)?\s*\)/);
  return match ? [+match[1], +match[2], +match[3]] : null;
}

/**
 * Calculates relative luminance of an RGB color
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} Luminance value
 */
function luminance(r, g, b) {
  return [r, g, b].reduce((acc, c, i) => {
    const s = c / 255;
    const linear = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    return acc + linear * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}

/**
 * Calculates contrast ratio between two RGB colors
 * @param {number[]} fg - Foreground RGB array
 * @param {number[]} bg - Background RGB array
 * @returns {number} Contrast ratio
 */
function contrastRatio(fg, bg) {
  const l1 = luminance(...fg);
  const l2 = luminance(...bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Gets a CSS selector for an element
 * @param {Element} el - DOM element
 * @returns {string} CSS selector
 */
function getSelector(el) {
  if (el.id) return '#' + el.id;
  return el.tagName.toLowerCase();
}

module.exports = {
  createIssue,
  normalizeUrl,
  isSkippableUrl,
  checkUrlStatus,
  parseRgb,
  luminance,
  contrastRatio,
  getSelector
};
