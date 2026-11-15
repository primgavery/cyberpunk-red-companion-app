/* Screenshot tour of the main screens at phone size, for comparing looks before/after a styling change.
     node tests/visual-tour.js <label> [theme]        -> tests/.shots/<label>_1_map.png ... _7_sheet.png
     APP=file:///path/to/other/index.html node tests/visual-tour.js base     (tour a different build, e.g. `git show HEAD:index.html > /tmp/orig.html`)
   Then:  python3 tests/imgdiff.py base after        (percentage of differing pixels per screen)
   Deterministic: dice are stubbed and the encounter is fixed, so identical code gives identical pixels. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { APP, TEST_CHAR } = require('./lib');
const label = process.argv[2] || 'shot', theme = process.argv[3] || '';
const out = path.resolve(__dirname, '.shots'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  if (theme) await ctx.addInitScript(t => { try { if (!localStorage.getItem('cpred_theme')) localStorage.setItem('cpred_theme', t); } catch (e) {} }, theme);   // as a returning user (no setTheme call)
  const p = await ctx.newPage(); p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.env.APP || APP); await p.waitForTimeout(400);
  await p.evaluate(t => { applyRosterImport(t, {}); importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[0].data)), { replace: true }); addRosterToCombat(roster[0].id, 'ally');
    const e = combatants.filter(c => c.side === 'enemy' && !c.isCover); e[0].hp = 12; e[1].hp = 0; combatants.forEach((c, i) => { if (!c.isCover) c.init = 10 - i; }); save(); renderCombat(); }, fs.readFileSync(TEST_CHAR, 'utf8'));
  const shot = async n => { await p.waitForTimeout(700); await p.screenshot({ path: path.join(out, `${label}_${n}.png`) }); };
  await shot('1_map');
  await p.evaluate(() => setMapMode('list')); await shot('2_cards');
  await p.evaluate(() => { const a = combatants.find(c => c.side === 'ally'); expandedIds.add(a.id); renderCombat(); scrollTo(0, 0); }); await shot('3_card_open');
  await p.click('nav button:has-text("DICE")'); await p.evaluate(() => { randInt = m => Math.min(m, 7); rollTheDie(10); rollTheDie(6); rollTheDie(20); }); await shot('4_dice');
  await p.click('nav button:has-text("CHARS")'); await shot('5_chars');
  await p.evaluate(() => openTools()); await shot('6_tools');
  await p.evaluate(() => { document.getElementById('tempModal').classList.remove('open'); openCharSheet(roster[0].id); }); await shot('7_sheet');
  console.log(`saved 7 screenshots to ${out} as ${label}_*.png` + (errs.length ? '  PAGE ERRORS: ' + errs.join(' | ') : ''));
  await browser.close();
})();
