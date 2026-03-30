// server/scanner/checks/ada.js
const fs   = require('fs');
const path = require('path');

const axeSource = fs.readFileSync(
  path.join(path.dirname(require.resolve('axe-core')), 'axe.min.js'),
  'utf-8'
);

const SEV_MAP = { critical: 'critical', serious: 'critical', moderate: 'major', minor: 'minor' };

async function check(page, _responseHeaders, pageUrl = '') {
  const urlPath = pageUrl ? new URL(pageUrl).pathname : '/';

  await page.evaluate(axeSource);
  const results = await page.evaluate(() => window.axe.run());

  return results.violations
    .filter(v => v.tags.some(t => t.startsWith('wcag')))
    .flatMap(v =>
      v.nodes.map(node => ({
        sev:      SEV_MAP[v.impact] || 'minor',
        type:     'ADA',
        title:    v.description,
        selector: node.target?.[0] ?? null,
        page:     urlPath,
        wcag:     `${v.id} (${v.tags.find(t => t.startsWith('wcag')) || 'best-practice'})`,
        desc:     `${v.help}. ${node.failureSummary || ''}`.trim(),
      }))
    );
}

module.exports = check;
