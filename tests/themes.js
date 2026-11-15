/* Themes: application, persistence, no flash on load, and an accessibility contrast audit over every screen.
   Run: node tests/themes.js   (takes ~40 s: it renders 15 screens in each of 4 themes) */
const fs = require('fs');
const { launch, TEST_CHAR } = require('./lib');
const { AUDIT_FN } = require('./contrast-lib');
const tc = fs.readFileSync(TEST_CHAR, 'utf8');
/* the whitelist is parsed out of the real <head> script, so a theme added to THEMES but forgotten there is caught */
const THEMES = (fs.readFileSync(require('path').resolve(__dirname, '..', 'index.html'), 'utf8').match(/\[("slate"[^\]]*)\]\.indexOf\(__t\)/) || ['', ''])[1].split(',').map(x => x.replace(/"/g, '').trim()).filter(Boolean);

/* One entry per screen/modal. Each runs inside the page after the encounter below is loaded. */
const SCREENS = {
  map: () => {},
  list: () => setMapMode('list'),
  card_open: () => { setMapMode('list'); combatants.filter(c => !c.isCover).slice(0, 2).forEach(c => expandedIds.add(c.id)); renderCombat(); },
  dice: () => { showView('dice', document.querySelectorAll('nav button')[1]); randInt = m => Math.min(m, 7); rollTheDie(10); rollTheDie(20); },
  log: () => { setDiceMode('log'); showView('dice', document.querySelectorAll('nav button')[1]); },
  chars: () => showView('roster', document.querySelectorAll('nav button')[2]),
  tools: () => openTools(),
  import: () => openEncounterImport(),
  rewards: () => { combatants.filter(c => c.side === 'enemy' && !c.isCover).slice(0, 2).forEach(c => c.hp = 0); openRewards(); },
  theme_picker: () => openThemePicker(),
  shoot: () => { setMapMode('list'); const s = combatants.find(c => c.side === 'ally'); openShoot(s.id); selectTarget(combatants.find(c => c.side === 'enemy' && !c.isCover && c.hp > 0).id); document.getElementById('shootRange').value = 8; onRangeInput(); },
  sheet_roles: () => openCharSheet(roster[0].id),
  sheet_stats: () => { openCharSheet(roster[0].id); csShowPage('stats'); },
  sheet_inventory: () => { openCharSheet(roster[0].id); csShowPage('inventory'); },
  sheet_archive: () => { openCharSheet(roster[0].id); csShowPage('archive'); },
};

let failed = 0;
const check = (name, ok, extra) => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

(async () => {
  /* ---- 1. every theme applies; persists; picker works ---- */
  {
    const { browser, page, errors } = await launch({ theme: 'slate' });
    check('default is Slate and the modern UI layer is on', await page.evaluate(() => currentTheme() === 'slate' && document.documentElement.dataset.ui === 'modern'));
    for (const t of THEMES) {
      const r = await page.evaluate(t => { setTheme(t); const cs = getComputedStyle(document.documentElement);
        return { theme: currentTheme(), ui: document.documentElement.dataset.ui, stored: store.get('cpred_theme'), ring: themeVar('--ally-ring'), bg: cs.getPropertyValue('--bg').trim(), meta: document.querySelector('meta[name=theme-color]').content }; }, t);
      check(`setTheme('${t}') sets attributes, storage, canvas colours and the browser theme-color`,
        r.theme === t && r.stored === t && r.ui === (t === 'neon' ? 'classic' : 'modern') && /^#|rgb/.test(r.ring) && r.meta.toLowerCase() === r.bg.toLowerCase(), JSON.stringify(r));
    }
    const registry = await page.evaluate(() => THEMES.map(t => t.id));
    check('the THEMES registry matches the whitelist in the <head> pre-paint script (they must stay in sync)',
      JSON.stringify(registry) === JSON.stringify(THEMES), JSON.stringify(registry));
    for (const t of THEMES) {
      await page.evaluate(t => setTheme(t), t); await page.reload(); await page.waitForTimeout(250);
      check(`'${t}' survives a reload (stored, whitelisted, applied before paint)`, await page.evaluate(t => currentTheme() === t && document.documentElement.dataset.theme === t, t));
    }
    await page.evaluate(() => openThemePicker());
    await page.locator('#tempModal .theme-card', { hasText: 'Ember' }).click();
    check('picking a theme in the UI applies it and marks it selected', await page.evaluate(() => currentTheme() === 'ember' && document.querySelector('.theme-card.on .tc-name').textContent.startsWith('Ember')));
    await page.evaluate(() => { localStorage.setItem('cpred_theme', 'not-a-theme'); }); await page.reload(); await page.waitForTimeout(300);
    check('an unknown stored theme falls back to Slate (never an unstyled mix)', await page.evaluate(() => currentTheme() === 'slate' && document.documentElement.dataset.ui === 'modern'));
    check('no page errors while switching themes', errors.length === 0, errors.join(' | '));
    await browser.close();
  }

  /* ---- 2. theme is applied before first paint (no flash of the wrong theme) ---- */
  {
    const { chromium } = require('playwright'); const { APP } = require('./lib');
    const browser = await chromium.launch(); const ctx = await browser.newContext();
    await ctx.addInitScript(() => { try { localStorage.setItem('cpred_theme', 'paper'); } catch (e) {}
      document.addEventListener('readystatechange', () => { if (!window.__seen && document.documentElement.dataset.theme) window.__seen = document.documentElement.dataset.theme + '@' + document.readyState; }); });
    const page = await ctx.newPage(); await page.goto(APP);
    const seen = await page.evaluate(() => window.__seen);
    check('the theme attribute is already set while the page is still loading', /^paper@(loading|interactive)$/.test(seen || ''), String(seen));
    await browser.close();
  }

  /* ---- 3. contrast audit: modern themes must clear WCAG AA (4.5:1) everywhere; Neon (the original) must clear 3:1 ---- */
  for (const t of THEMES) {
    const { browser, page, errors } = await launch({ theme: t, viewport: { width: 390, height: 844 } });
    await page.evaluate(tcText => { applyRosterImport(tcText, {}); importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[3].data)), { replace: true }); addRosterToCombat(roster[0].id, 'ally');
      const e = combatants.filter(c => c.side === 'enemy' && !c.isCover); e[0].hp = 12; e[1].hp = 0; save(); }, tc);
    let total = 0; const bad = [];
    const floor = t === 'neon' ? 3 : 4.5;
    for (const [name, fn] of Object.entries(SCREENS)) {
      await page.evaluate(`(()=>{ document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open')); (${fn.toString()})(); })()`);
      await page.waitForTimeout(250);
      const rows = await page.evaluate(AUDIT_FN);
      total += rows.length;
      rows.filter(r => r.ratio < (r.large ? Math.min(floor, 3) : floor)).forEach(r => bad.push(`${name}: ${r.ratio} ${r.sel} "${r.text}"`));
    }
    check(`contrast: ${t} — ${total} text elements, none below ${floor}:1`, bad.length === 0 && total > 250, bad.slice(0, 6).join(' ; '));
    check(`no page errors rendering every screen in ${t}`, errors.length === 0, errors.join(' | '));
    await browser.close();
  }

  console.log(failed ? `\nthemes: ${failed} FAILED` : '\nthemes: all passed');
  process.exit(failed ? 1 : 0);
})();
