// server/scanner/checks/security.js
async function check(_page, responseHeaders, pageUrl = '') {
  const path = pageUrl ? new URL(pageUrl).pathname : '/';
  const h = Object.fromEntries(
    Object.entries(responseHeaders).map(([k, v]) => [k.toLowerCase(), v])
  );

  const RULES = [
    { header: 'content-security-policy',   sev: 'major', title: 'Missing Content-Security-Policy header',   desc: 'No CSP header found. Without CSP the page is vulnerable to cross-site scripting (XSS) attacks.' },
    { header: 'strict-transport-security', sev: 'major', title: 'Missing Strict-Transport-Security header', desc: 'HSTS is absent. Browsers may allow insecure HTTP connections instead of enforcing HTTPS.' },
    { header: 'x-frame-options',           sev: 'minor', title: 'Missing X-Frame-Options header',           desc: 'X-Frame-Options is not set. The page may be embedded in an iframe by third parties (clickjacking risk).' },
    { header: 'x-content-type-options',    sev: 'minor', title: 'Missing X-Content-Type-Options header',    desc: 'X-Content-Type-Options: nosniff is absent. Browsers may MIME-sniff responses, enabling content-type attacks.' },
    { header: 'referrer-policy',           sev: 'minor', title: 'Missing Referrer-Policy header',           desc: 'No Referrer-Policy header. The full URL may be sent as a referrer to third-party requests, leaking sensitive paths.' },
  ];

  return RULES
    .filter(r => !h[r.header])
    .map(r => ({ sev: r.sev, type: 'Security', title: r.title, selector: null, page: path, wcag: null, desc: r.desc }));
}

module.exports = check;
