/* Shared helpers for the headless-browser checks. Needs Playwright: `npm i playwright` (or any install that
   makes require('playwright') work).
   The app is served over a tiny local HTTP server, NOT opened as file://: that is how GitHub Pages serves it, and a file://
   page loses its localStorage on reload in about 1 reload in 5 under Chromium (the browser swaps storage areas), which made
   persistence tests flaky for a reason that cannot happen to real users. Set APP=<url or file URL> to test a different build. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const INDEX = path.resolve(__dirname, '..', 'index.html');
let _urlPromise = null;
function appUrl() {
  if (process.env.APP) return Promise.resolve(process.env.APP);
  if (!_urlPromise) _urlPromise = new Promise(resolve => {
    const srv = http.createServer((q, r) => {                      // re-read on every request so edits made mid-run are served
      if (q.url.split('?')[0] === '/' || q.url.split('?')[0] === '/index.html') { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(fs.readFileSync(INDEX)); }
      else { r.statusCode = 404; r.end('not found'); } });
    srv.listen(0, '127.0.0.1', () => { srv.unref(); resolve('http://127.0.0.1:' + srv.address().port + '/'); }); });
  return _urlPromise; }
const TEST_CHAR = path.resolve(__dirname, '..', 'test-character.json');

async function launch(opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 420, height: 900 } });
  if (opts.theme) await ctx.addInitScript(t => { try { if (!localStorage.getItem('cpred_theme')) localStorage.setItem('cpred_theme', t); } catch (e) {} }, opts.theme);   // seed only if unset: a first visit, not an override on every load
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]));
  page.on('dialog', d => d.accept());
  await page.goto(await appUrl());
  await page.waitForTimeout(300);
  return { browser, page, errors };
}

/* tiny assertion runner: each check is [name, async fn]; exits non-zero on any failure */
async function run(title, checks, opts = {}) {
  const { browser, page, errors } = await launch(opts);
  let failed = 0;
  for (const [name, fn] of checks) {
    const before = errors.length;
    try {
      const ok = await fn(page);
      const newErrs = errors.slice(before);
      if (ok === false || newErrs.length) { failed++; console.log('FAIL', name, newErrs.length ? JSON.stringify(newErrs) : ''); }
      else console.log('ok  ', name);
    } catch (e) { failed++; console.log('FAIL', name, '-', e.message.split('\n')[0]); }
  }
  await browser.close();
  console.log(failed ? `\n${title}: ${failed} FAILED` : `\n${title}: all passed`);
  process.exit(failed ? 1 : 0);
}
module.exports = { launch, run, appUrl, TEST_CHAR };
