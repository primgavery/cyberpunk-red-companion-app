/* The Claude brief, the DOCS tab and the campaign log.
   The important property: everything the brief TELLS Claude is accepted by the importer — so what Claude writes ports in.
   Run: node tests/brief.js */
const fs = require('fs');
const { run, TEST_CHAR } = require('./lib');
const tc = fs.readFileSync(TEST_CHAR, 'utf8');
const imp = `(d, replace) => importEncounter(JSON.parse(JSON.stringify(d)), { replace: replace !== false })`;

run('brief', [
  ['every weapon, armor, template, ammo type and scene the brief lists is accepted by the importer with no warnings', async p => p.evaluate(`(() => { const imp = ${imp}; const bad = [];
    const D = docsData();
    WEAPONS.forEach(w => { const r = imp({ enemies: [{ template: 'Mook', weapons: [w.name] }] }); if (r.warnings.length || !combatants.some(c => c.weapons.some(x => x.name === w.name))) bad.push('weapon ' + w.name); });
    ARMOR_CATALOG.forEach(a => { const r = imp({ enemies: [{ template: 'Mook', armor: a.name }] }); const c = combatants.find(x => x.side === 'enemy' && !x.isCover); if (r.warnings.length || c.body !== a.sp) bad.push('armor ' + a.name); });
    NPC_LIB.filter(n => !n.vehicle).forEach(n => { const r = imp({ enemies: [{ template: n.name }] }); const c = combatants.find(x => x.side === 'enemy' && !x.isCover); if (r.warnings.length || c.hpMax !== n.hp) bad.push('template ' + n.name); });
    Object.keys(AMMO).forEach(k => { const r = imp({ enemies: [{ template: 'Mook', weapons: ['Assault Rifle'], ammo: k }] }); if (r.warnings.length) bad.push('ammo ' + k); });
    GRID_PRESETS.forEach(pr => { const r = imp({ scene: pr.name, enemies: [{ template: 'Mook' }] }); if (r.warnings.length || r.scene !== pr.name) bad.push('scene ' + pr.name); });
    ['tier STANDARD', 'tier MINI BOSS', 'tier BOSS'].forEach(t => { const r = imp({ enemies: [{ tier: t.split(' ').slice(1).join(' ') }] }); if (r.warnings.length) bad.push(t); });
    const text = buildClaudeBrief({ party: true, log: true, example: true });
    [...WEAPONS.map(w => w.name), ...ARMOR_CATALOG.map(a => a.name), ...GRID_PRESETS.map(g => g.name), ...NPC_LIB.filter(n => !n.vehicle).map(n => n.name), ...Object.keys(AMMO)]
      .forEach(n => { if (!text.includes(n)) bad.push('brief does not mention ' + n); });
    if (bad.length) console.log(bad.slice(0, 8)); return !bad.length && D.wp.length === WEAPONS.length; })()`)],
  ['every documented field is accepted and takes effect (a kitchen-sink encounter built from the field table imports clean)', async p => p.evaluate(`(() => { const imp = ${imp};
    const r = imp(encKitchenSink()); const foes = combatants.filter(c => c.side === 'enemy' && !c.isCover && c.name.startsWith('Maelstrom Booster'));
    const c = foes[0], ally = combatants.find(x => x.name === 'Friendly LT'), enc = rwEnc();
    const checks = { noWarnings: r.warnings.length === 0, qty: foes.length === 2, hp: c.hpMax === 35, armorWins: c.body === 7 && c.head === 7, cn: c.cn === 12, dodge: c.canDodge === true, move: c.npcMove === 7, init: c.init === 3,
      weapons: c.weapons.length === 2, ammo: c.weapons.filter(w => !w.melee).every(w => w.ammoType === 'ap'), vehicle: combatants.some(x => x.isVehicle) && c.behindCoverId !== null && c.seatRole === 'driver',
      ai: c.ai && c.ai.profile === 'cautious' && /🧠 Cautious/.test(c.note), note: /stolen shard/.test(c.note), tier: c.tier === 'MINI BOSS', ally: ally && ally.side === 'ally' && ally.weapons[0].name === 'Shotgun',
      rewards: enc.rewards.eb === 100 && enc.rewards.bonuses.length === 1, scene: r.scene === 'Alleyway', summary: enc.summary.length > 5 };
    const failed = Object.keys(checks).filter(k => !checks[k]); if (failed.length) console.log('not honoured:', failed, r.warnings); return !failed.length; })()`)],
  ['the worked example and the "Shape" skeleton inside the brief parse and import', async p => p.evaluate(`(() => { const imp = ${imp}; const text = buildClaudeBrief({ example: true });
    const blocks = [...text.matchAll(/\`\`\`json\\n([\\s\\S]*?)\`\`\`/g)].map(m => m[1]); const out = [];
    blocks.forEach(b => { try { const r = imp(JSON.parse(b)); out.push(r.warnings.length ? 'warn:' + r.warnings[0] : 'ok'); } catch (e) { out.push('ERR ' + e.message); } });
    return blocks.length === 2 && out.every(x => x === 'ok') || (console.log(out), false); })()`)],
  ['brief options work: party, log depth and example are included/omitted; nothing sensitive leaks', async p => {
    await p.evaluate(t => { applyRosterImport(t, {}); sessionLog = []; for (let i = 1; i <= 12; i++) logAdd('Entry number ' + i); localStorage.setItem('cpred_gist_token', 'ghp_SECRET123'); }, tc);
    return p.evaluate(() => { const all = buildClaudeBrief({ party: true, log: true, logN: 10, example: true }), none = buildClaudeBrief({ party: false, log: false, example: false });
      const has = s => all.includes(s);
      return has('## My party') && has('Test Runner') && has('Entry number 12') && has('Entry number 3') && !has('Entry number 2\n') && !has('Entry number 1\n') && has('## A complete example') &&
        !none.includes('## My party') && !none.includes('The story so far') && !none.includes('A complete example') &&
        !all.includes('ghp_SECRET123') && !all.includes('cpred_gist') && briefTokens(all) > 1000 && briefTokens(all) < 14000; });
  }],

  ['DOCS tab: opens from the nav, shows the brief and log, COPY BRIEF puts exactly the generated brief on the clipboard', async p => {
    await p.evaluate(() => { window.__clip = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__clip = t; return Promise.resolve(); } }, configurable: true }); });
    await p.locator('nav button', { hasText: 'DOCS' }).click();
    const shown = await p.evaluate(() => document.getElementById('docs').classList.contains('active') && !!document.getElementById('briefText') && !!document.getElementById('clogInput') && document.querySelectorAll('nav button').length === 4);
    await p.locator('#docs button', { hasText: 'COPY BRIEF' }).click(); await p.waitForTimeout(150);
    return shown && await p.evaluate(() => window.__clip === buildClaudeBrief() && /tokens/.test(document.getElementById('briefSize').textContent) && /copied/i.test(document.getElementById('briefMsg').textContent));
  }],
  ['DOCS tab: toggles change the preview, persist across reload; DOWNLOAD saves a .md file', async p => {
    await p.locator('#docs label', { hasText: 'Include my party' }).locator('input').uncheck();
    const off = await p.evaluate(() => !document.getElementById('briefText').value.includes('## My party') && JSON.parse(localStorage.getItem('cpred_briefopts')).party === false);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#docs button', { hasText: 'DOWNLOAD' }).click()]);
    await p.reload(); await p.waitForTimeout(300); await p.locator('nav button', { hasText: 'DOCS' }).click();
    const kept = await p.evaluate(() => briefOpts.party === false && !document.querySelector('#docs .docs-opt input').checked);
    await p.evaluate(() => docsSetOpt('party', true));
    return off && kept && dl.suggestedFilename() === 'cpred-claude-brief.md';
  }],
  ['reference tables on the tab are generated from the live catalogs (weapon count matches)', async p => p.evaluate(() => {
    const t = [...document.querySelectorAll('#docs details.docs-ref')].find(d => d.textContent.startsWith('Weapons'));
    return t && t.querySelectorAll('tbody tr').length === WEAPONS.length && document.querySelectorAll('#docs details.docs-ref').length >= 9; })],

  ['campaign log: add by typing + Enter, persists across reload, newest first, HTML is shown as text', async p => {
    await p.evaluate(() => { sessionLog = []; saveSessionLog(); renderDocs(); });
    await p.locator('#clogInput').fill('Met Rache at the Afterlife'); await p.locator('#clogInput').press('Enter');
    await p.locator('#clogInput').fill('<img src=x onerror="window.__pwn=1"> second'); await p.locator('#clogInput').press('Enter');
    const before = await p.evaluate(() => ({ n: sessionLog.length, first: document.querySelector('#clogList .log-text').textContent, pwn: window.__pwn || 0, imgs: document.querySelectorAll('#clogList img').length }));
    await p.reload(); await p.waitForTimeout(300); await p.locator('nav button', { hasText: 'DOCS' }).click();
    const after = await p.evaluate(() => ({ n: sessionLog.length, texts: [...document.querySelectorAll('#clogList .log-text')].map(x => x.textContent) }));
    return before.n === 2 && before.first.startsWith('<img') && before.pwn === 0 && before.imgs === 0 && after.n === 2 && after.texts[1] === 'Met Rache at the Afterlife';
  }],
  ['campaign log: edit, delete, quick-add chips (Session numbering), 600-char cap', async p => {
    await p.locator('#clogList .log-acts button[aria-label="Edit entry"]').last().click();
    await p.locator('#clogEditText').fill('Met Rache — she owes us'); await p.locator('#clogList button', { hasText: 'SAVE' }).click();
    const edited = await p.evaluate(() => sessionLog[0].text === 'Met Rache — she owes us');
    await p.locator('.log-chips button', { hasText: 'Session' }).click();
    const chip = await p.evaluate(() => document.getElementById('clogInput').value === 'Session 1 — '); await p.locator('#clogInput').type('night one'); await p.locator('#clogInput').press('Enter');
    const kind = await p.evaluate(() => sessionLog[sessionLog.length - 1].kind === 'session' && document.querySelector('#clogList .k-session'));
    await p.locator('.log-chips button', { hasText: 'Session' }).click();
    const second = await p.evaluate(() => document.getElementById('clogInput').value === 'Session 2 — ');
    await p.locator('#clogInput').fill(''); await p.locator('#clogList .log-acts button[aria-label="Delete entry"]').first().click();
    const deleted = await p.evaluate(() => sessionLog.length === 2 && !sessionLog.some(e => /night one/.test(e.text)));
    const cap = await p.evaluate(() => logAdd('x'.repeat(5000)).text.length === 600 && logAdd('   ') === null);
    return edited && chip && !!kind && second && deleted && cap;
  }],
  ['recap: composes who fell (grouped), who is hurt and what was paid — and survives clearing the dead', async p => {
    await p.evaluate(t => { showModal('x', ''); sessionLog = []; importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[0].data)), { replace: true }); addRosterToCombat(roster[0].id, 'ally'); roundNo = 3;
      const pc = combatants.find(c => c.rosterId); pc.hp = 12; combatants.filter(c => c.side === 'enemy' && !c.isCover).forEach(c => { c.hp = 0; }); }, tc);
    const text = await p.evaluate(() => { gridCleanDo('postCombat'); return logCompose(); });
    return /^Maelstrom Ambush — 3 rounds\./.test(text) && /Defeated: Maelstrom Booster ×3, Maelstrom Reaver\./.test(text) && /Party: Test Runner 12\/30 HP\./.test(text);
  }],
  ['paying rewards writes an encounter recap into the log automatically (with the payout), and "Recap this fight" prefills the box', async p => {
    const r = await p.evaluate(() => { sessionLog = []; openRewards(); document.querySelectorAll('.rw-who').forEach(x => { x.checked = true; }); rwApply();
      const e = sessionLog[sessionLog.length - 1]; return { kind: e && e.kind, text: e && e.text }; });
    await p.locator('nav button', { hasText: 'DOCS' }).click(); await p.locator('.log-chips button', { hasText: 'Recap this fight' }).click();
    const box = await p.evaluate(() => document.getElementById('clogInput').value);
    return r.kind === 'encounter' && /Paid: /.test(r.text) && /Maelstrom Ambush/.test(r.text) && box.startsWith('Maelstrom Ambush');
  }],
  ['log travels with backups; loading a save merges instead of discarding newer entries', async p => p.evaluate(() => {
    sessionLog = []; logAdd('old one'); const snap = JSON.parse(JSON.stringify(buildBackupData())); logAdd('written after the backup');
    const save = JSON.parse(JSON.stringify(buildBackupData())); save.sessionLog = save.sessionLog.slice(0, 1).concat([{ id: 'extra', at: '2020-01-01T00:00:00Z', kind: 'note', text: 'only in the file' }]);
    applyLoad(JSON.stringify(save), {});
    const merged = sessionLog.map(e => e.text); applyBackupData(snap);
    return merged.includes('old one') && merged.includes('written after the backup') && merged.includes('only in the file') && sessionLog.length === 1 && 'sessionLog' in snap; })],
  ['no page errors anywhere in this flow', async p => true],
]);
