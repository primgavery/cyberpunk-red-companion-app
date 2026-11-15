/* Random-click monkey: seeds a realistic encounter, then clicks/edits thousands of visible controls and reports every
   uncaught JS error together with the control that was last touched. Deterministic per seed.
   Run: node tests/monkey.js [seed=1] [clicks=1500]   (exit 1 if any error) */
const fs = require('fs');
const { chromium } = require('playwright');
const { APP, TEST_CHAR } = require('./lib');
let s = parseInt(process.argv[2] || '1'); const N = parseInt(process.argv[3] || '1500');
const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true })).newPage();
  const errs = new Map(); let last = '(start)';
  page.on('pageerror', e => { const k = e.message.split('\n')[0] + '  <=  ' + last; errs.set(k, (errs.get(k) || 0) + 1); });
  page.on('dialog', async d => { try { await (d.type() === 'prompt' ? d.accept('5') : d.accept()); } catch (e) {} });
  await page.route('**/*', r => /^(file|data|blob):/.test(r.request().url()) ? r.continue() : r.abort());   // offline: no gist calls
  await page.goto(APP); await page.waitForTimeout(300);
  await page.evaluate(t => { applyRosterImport(t, {}); addRosterToCombat(roster[0].id, 'ally'); libSide = 'enemy'; libQty[0] = 3; libGun[0] = '0'; addFromLibrary(0); libQty[6] = 1; addFromLibrary(6); combatants.forEach((c, i) => c.init = i); save(); renderCombat(); }, fs.readFileSync(TEST_CHAR, 'utf8'));
  for (let i = 0; i < N; i++) {
    const r = rnd();
    const info = await page.evaluate(r => {
      const vis = el => { const b = el.getBoundingClientRect(), cs = getComputedStyle(el); return b.width > 2 && b.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; };
      let els = [...document.querySelectorAll('button,[onclick],.tools-row,summary,select,input[type=checkbox],input[type=number],.target-row')].filter(vis);
      const open = [...document.querySelectorAll('.modal.open,.overlay.open,[class*="modal"].open')].filter(vis);
      if (open.length && Math.random() < 0.8) { const inner = els.filter(e => open.some(m => m.contains(e))); if (inner.length) els = inner; }
      els = els.filter(e => !/downloadFullBackup|Full backup|New encounter|clearEncounter/.test((e.getAttribute('onclick') || '') + e.textContent));
      if (!els.length) { document.querySelectorAll('.open').forEach(m => m.classList.remove('open')); return null; }
      const e = els[Math.floor(r * els.length)]; e.setAttribute('data-monkey', '1'); const b = e.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, tag: e.tagName, type: e.type || '', label: (e.getAttribute('onclick') || e.textContent || e.tagName).trim().slice(0, 60) };
    }, r);
    if (!info) continue; last = info.label;
    try {
      if (info.tag === 'INPUT' && info.type === 'number') { await page.mouse.click(info.x, info.y); await page.keyboard.type(String(Math.floor(rnd() * 30) - 3)); await page.keyboard.press('Tab'); }
      else if (info.tag === 'SELECT') await page.evaluate(() => { const e = document.querySelector('[data-monkey]'); if (e && e.options.length) { e.selectedIndex = Math.floor(Math.random() * e.options.length); e.dispatchEvent(new Event('change', { bubbles: true })); } });
      else await page.mouse.click(info.x, info.y, { timeout: 1000 });
    } catch (e) {}
    await page.evaluate(() => { const e = document.querySelector('[data-monkey]'); if (e) e.removeAttribute('data-monkey'); });
    if (i % 250 === 249) await page.evaluate(() => { if (!combatants.some(c => !c.isCover && c.hp > 0)) { libSide = 'enemy'; libQty[0] = 2; addFromLibrary(0); } });
  }
  console.log(`monkey seed=${process.argv[2] || 1} clicks=${N} distinct errors=${errs.size}`);
  [...errs].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`${v}x ${k}`));
  await browser.close(); process.exit(errs.size ? 1 : 0);
})();
