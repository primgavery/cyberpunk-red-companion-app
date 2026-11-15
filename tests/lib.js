/* Shared helpers for the headless-browser checks. Needs Playwright: `npm i playwright` (or any install that
   makes require('playwright') work). The app is a single static file, so we just open it via file://. */
const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');
const TEST_CHAR = path.resolve(__dirname, '..', 'test-character.json');

async function launch(opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 420, height: 900 } });
  if (opts.theme) await ctx.addInitScript(t => { try { if (!localStorage.getItem('cpred_theme')) localStorage.setItem('cpred_theme', t); } catch (e) {} }, opts.theme);   // seed only if unset: a first visit, not an override on every load
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]));
  page.on('dialog', d => d.accept());
  await page.goto(APP);
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
module.exports = { launch, run, APP, TEST_CHAR };
