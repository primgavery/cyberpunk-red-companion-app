/* One check per bug that has actually bitten this app. Run: node tests/regression.js */
const fs = require('fs');
const { run, TEST_CHAR } = require('./lib');
const tc = fs.readFileSync(TEST_CHAR, 'utf8');

run('regression', [
  ['storage full is surfaced and served from memory, not silently dropped', async p => p.evaluate(() => {
    for (let i = 0; i < 200; i++) { try { localStorage.setItem('fill' + i, 'x'.repeat(100000)); } catch (e) { break; } }
    for (let j = 0; j < 5000; j++) { try { localStorage.setItem('fine' + j, 'y'.repeat(50)); } catch (e) { break; } }
    libSide = 'enemy'; libQty[0] = 20; addFromLibrary(0);
    const warned = document.getElementById('toast').classList.contains('show') && /not being saved/i.test(document.getElementById('toastMsg').textContent);
    const readBack = JSON.parse(store.get('cpred_combat') || '[]').length === 20;   // memory fallback is authoritative
    localStorage.clear();
    return warned && readBack;
  })],
  ['tap-to-edit initiative: Enter commits once, no DOM error', async p => {
    await p.evaluate(() => { libSide = 'enemy'; libQty[0] = 2; addFromLibrary(0); setMapMode('list'); renderCombat(); window.__n = 0; const o = setInit; setInit = (id, v) => { window.__n++; return o(id, v); }; });
    await p.locator('[onclick^="tapInit"]').first().click(); await p.keyboard.type('17'); await p.keyboard.press('Enter');
    return (await p.evaluate(() => window.__n)) === 1 && (await p.evaluate(() => combatants[0].init)) === 17;
  }],
  ['re-render while the init box is open does not throw (and keeps the typed value)', async p => {
    await p.evaluate(() => { combatants.length = 0; libSide = 'enemy'; libQty[0] = 2; addFromLibrary(0); setMapMode('list'); renderCombat(); });
    await p.locator('[onclick^="tapInit"]').first().click(); await p.keyboard.type('12');
    return p.evaluate(() => { try { combatants[1].hp -= 3; renderCombat(); } catch (e) { return false; } return combatants[0].init === 12; });
  }],
  ['skill-roll buttons survive apostrophes and cannot be injected through', async p => p.evaluate(() => {
    const skill = SKILL_CATS.flatMap(c => c.skills).find(s => s.expand); const stats = { int: 5, ref: 5, dex: 5, tech: 5, cool: 5, will: 5, luck: 5, move: 5, body: 5, emp: 5 };
    let ok = true; window.__pwn = 0;
    for (const name of ["Kerry's Axe", "x',1,1);window.__pwn=1;//", '"><img src=x onerror=window.__pwn=1>']) {
      const host = document.createElement('div'); host.innerHTML = csRenderSkillRow(skill, { [skill.id]: [{ name, level: 2 }] }, stats, {});
      document.body.appendChild(host);
      try { host.querySelector('.sk-roll').click(); } catch (e) { ok = false; }
      if (!(document.querySelector('.sk-result .skr-name') || {}).textContent?.includes(name)) ok = false;
    }
    return ok && !window.__pwn;
  })],
  ['calculator: = on half-typed / leading-zero input does not throw', async p => p.evaluate(() => {
    for (const e of ['5+', '08+1', '007', '(', '..']) { calcExpr = e; try { calcEquals(); } catch (x) { return false; } }
    calcExpr = '08+1'; calcEquals(); return calcExpr === '9';
  })],
  ['roster/save import tolerates null, numeric and junk entries', async p => p.evaluate(() => {
    for (const t of ['{"roster":[null,1,"x",{"name":5}]}', '{"app":"cpred_roster","roster":[null]}']) applyRosterImport(t, {});
    applyLoad(JSON.stringify({ combatants: [], roster: [null, { name: 'A' }], vehicles: [null, { name: 'V' }], architectures: [null, { name: 'N' }], gigs: [null, { name: 'G' }] }), {});
    renderRoster(); renderVehicleList(); renderArchitectureList(); renderGigsList();
    return roster.every(r => Array.isArray(r.weapons) && r.stats) && vehicles.every(v => Array.isArray(v.upgrades));
  })],
  ['map (grid size + painted floor) survives reload, backup and Save/Load', async p => {
    await p.evaluate(() => { gridLoadPreset(3); G.cols = 33; G.rows = 27; save(); });
    await p.reload(); await p.waitForTimeout(300);
    const afterReload = await p.evaluate(() => G.cols === 33 && G.rows === 27 && G.floorDeco.length > 0);
    const viaBackup = await p.evaluate(() => { const d = JSON.parse(JSON.stringify(buildBackupData())); G.cols = 20; G.rows = 20; G.floorDeco = []; applyBackupData(d); return G.cols === 33 && G.floorDeco.length > 0; });
    const viaSaveText = await p.evaluate(() => { openSaveLoad(); const t = document.getElementById('saveText').value; G.cols = 20; G.floorDeco = []; applyLoad(t, {}); return G.cols === 33 && G.floorDeco.length > 0; });
    const validated = await p.evaluate(() => { applyMapState({ cols: 9999, rows: -4, floorDeco: [null, { type: 5 }, { type: 'tile', x: 1, y: 1, w: 2, h: 2 }] }); return G.cols === 60 && G.rows === 27 && G.floorDeco.length === 1; });
    return afterReload && viaBackup && viaSaveText && validated;
  }],
  ['critical +5 bonus damage that drops a target to 0 HP raises the mortal-wound flag', async p => p.evaluate(() => {
    combatants.length = 0; libSide = 'ally'; libQty[1] = 1; libGun[1] = '0'; addFromLibrary(1); libSide = 'enemy'; libQty[0] = 1; addFromLibrary(0);
    const s = combatants.find(c => c.side === 'ally'), t = combatants.find(c => c.side === 'enemy'); t.trackDeath = true; t.hp = 10; t.hpMax = 30;
    openShoot(s.id); selectTarget(t.id); document.getElementById('shootRange').value = 3; onRangeInput();
    const real = randInt; randInt = () => 6;                      // all 6s: 2d6 = 12 vs SP 4 -> 8 to HP (10->2), double-6 crit -> +5 -> 0
    try { shoot.hit = true; shoot.shotsUsed = 1; rollApplyDamage(); } finally { randInt = real; }
    closeShoot();
    return t.hp === 0 && combatLog.some(e => /MORTALLY WOUNDED/.test(e.m));
  })],
  ['aimed leg shot that gets through armor actually halves MOVE on the map', async p => p.evaluate(() => {
    combatants.length = 0; libSide = 'ally'; libQty[1] = 1; libGun[1] = '0'; addFromLibrary(1); libSide = 'enemy'; libQty[0] = 1; addFromLibrary(0);
    const s = combatants.find(c => c.side === 'ally'), t = combatants.find(c => c.side === 'enemy'); t.npcMove = 8; t.hp = 30; t.hpMax = 30;
    const before = gridMoveStat(t);
    openShoot(s.id); selectTarget(t.id); document.getElementById('shootRange').value = 3; onRangeInput(); setAimType('leg');
    const real = randInt; randInt = () => 4;                      // 2d6 = 8 > SP 4 (gets through), no sixes so no crit injury muddies it
    try { shoot.hit = true; shoot.shotsUsed = 1; rollApplyDamage(); } finally { randInt = real; }
    closeShoot();
    return before === 8 && gridMoveStat(t) === 4 && t.conditions.some(c => /MOVE ½/.test(c.name));
  })],
  ['map canvas buffer is refitted when the layout changes after load (no vertically squashed tokens)', async p => {
    await p.evaluate(() => { gridLoadPreset(4); });
    await p.waitForTimeout(400);
    await p.evaluate(() => { const strip = document.getElementById('gridInitStrip'); strip.style.minHeight = (strip.offsetHeight + 90) + 'px'; });   // a late layout shift
    /* poll rather than sleep: under load the observer may take a few frames, but it must get there */
    return p.waitForFunction(() => { const c = document.getElementById('gridCanvas'), d = window.devicePixelRatio || 1;
      return Math.abs(c.width / d - c.offsetWidth) <= 1 && Math.abs(c.height / d - c.offsetHeight) <= 1; }, null, { timeout: 5000 }).then(() => true, () => false);
  }],
  ['movement reach is recomputed when another token steps onto a square (no stale "reachable" squares)', async p => p.evaluate(() => {
    combatants.length = 0; G.cols = 20; G.rows = 20;
    const mk = (n, x, y) => { const c = encBuildNpc({ template: 'Mook', name: n, weapons: ['Medium Pistol'] }, 'enemy', [], null, null); c.gridX = x; c.gridY = y; combatants.push(c); return c; };
    const a = mk('A', 5, 5), b = mk('B', 10, 10);
    const before = gridReach(a, 6).has('7,5'); b.gridX = 7; b.gridY = 5;
    const after = gridReach(a, 6).has('7,5');
    b.gridX = 10; b.gridY = 10; const freed = gridReach(a, 6).has('7,5');                 // and it comes back when they leave
    return before && !after && freed;
  })],
  ['no two elements share an id on any screen (getElementById would silently hit the wrong one)', async p => p.evaluate(t => {
    applyRosterImport(t, {}); importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[3].data)), { replace: true }); addRosterToCombat(roster[0].id, 'ally'); logAdd('x');
    const closeAll = () => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')), dups = new Set(), nav = i => document.querySelectorAll('nav button')[i];
    const scan = name => { const seen = new Map(); document.querySelectorAll('[id]').forEach(e => seen.set(e.id, (seen.get(e.id) || 0) + 1)); seen.forEach((n, id) => { if (n > 1) dups.add(id + ' x' + n + ' @' + name); }); };
    const steps = { map: () => {}, list: () => setMapMode('list'), dice: () => showView('dice', nav(1)), chars: () => showView('roster', nav(2)), docs: () => showView('docs', nav(3)), tools: () => openTools(),
      import: () => openEncounterImport(), rewards: () => openRewards(), picker: () => openThemePicker(), why: () => { const n = combatants.find(c => c.side === 'enemy' && !c.isCover); activeId = n.id; advInvalidate(); openAdvice(n.id); },
      shoot: () => { setMapMode('list'); openShoot(combatants.find(c => c.side === 'ally').id); }, sheet: () => { closeAll(); openCharSheet(roster[0].id); }, saveload: () => { closeAll(); openSaveLoad(); }, cloud: () => { closeAll(); openCloudSync(); } };
    for (const [n, f] of Object.entries(steps)) { try { f(); scan(n); } catch (e) { dups.add('THROW ' + n + ': ' + e.message); } }
    if (dups.size) console.log([...dups]); return dups.size === 0;
  }, tc)],
  ['full backup round-trips losslessly (modulo migration defaults)', async p => p.evaluate(t => {
    applyRosterImport(t, {}); addRosterToCombat(roster[0].id, 'ally'); libSide = 'enemy'; libQty[0] = 1; addFromLibrary(0);
    const d = JSON.parse(JSON.stringify(buildBackupData())); applyBackupData(JSON.parse(JSON.stringify(d))); const a = JSON.parse(JSON.stringify(buildBackupData()));
    return ['roster', 'vehicles', 'gigs', 'architectures', 'notes', 'map'].every(k => JSON.stringify(d[k]) === JSON.stringify(a[k]));
  }, tc)],
]);
