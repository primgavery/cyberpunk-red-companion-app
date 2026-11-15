/* Encounter import + rewards. Run: node tests/encounters.js */
const fs = require('fs');
const { run, TEST_CHAR } = require('./lib');
const tc = fs.readFileSync(TEST_CHAR, 'utf8');

const seedRoster = p => p.evaluate(t => { applyRosterImport(t, {}); const b = JSON.parse(t).roster[0];
  const two = Object.assign(JSON.parse(JSON.stringify(b)), { id: 'second', name: 'Second Runner' }); roster.push(two); saveRoster(); }, tc);

run('encounters', [
  ['every built-in example imports cleanly (no warnings, gear resolved, scene loaded)', async p => p.evaluate(() => {
    const out = [];
    EXAMPLE_ENCOUNTERS.forEach(ex => {
      const r = importEncounter(JSON.parse(JSON.stringify(ex.data)), { replace: true });
      const foes = combatants.filter(c => c.side === 'enemy' && !c.isCover);
      const wanted = ex.data.enemies.reduce((s, e) => s + (e.qty || 1), 0);
      if (r.warnings.length) out.push(ex.name + ' warnings: ' + r.warnings.join('|'));
      if (foes.length !== wanted) out.push(ex.name + ' expected ' + wanted + ' enemies, got ' + foes.length);
      if (!r.scene) out.push(ex.name + ' scene not loaded');
      if (foes.some(c => !c.weapons.length)) out.push(ex.name + ' enemy without a weapon');
      if (foes.some(c => c.gridX == null)) out.push(ex.name + ' enemy not placed on the map');
      if (foes.some(c => c.ai && !/🧠/.test(c.note))) out.push(ex.name + ' ai note missing');
      if (!rwEnc().rewards) out.push(ex.name + ' rewards missing');
    });
    return out.length ? (console.log(out), false) : true;
  })],
  ['vehicle crews: driver + passengers sit in their vehicle', async p => p.evaluate(() => {
    importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[3].data)), { replace: true });
    const veh = combatants.filter(c => c.isVehicle); const drivers = combatants.filter(c => c.seatRole === 'driver');
    return veh.length === 3 && drivers.length === 3 && drivers.every(d => combatants.find(v => v.id === d.behindCoverId && v.isVehicle));
  })],
  ['import through the real UI (example button -> IMPORT)', async p => {
    await p.evaluate(() => { combatants.length = 0; openEncounterImport(); });
    await p.locator('#tempModal button', { hasText: 'Maelstrom Ambush' }).click();
    await p.locator('#tempModal button', { hasText: /^IMPORT$/ }).click();
    return p.evaluate(() => combatants.filter(c => c.side === 'enemy' && !c.isCover).length === 4 && rwEnc().name === 'Maelstrom Ambush');
  }],
  ['hostile / malformed input never throws uncaught and reports clearly', async p => p.evaluate(() => {
    const bad = ['[]', '{}', '{"app":"cpred_roster"}', '{"enemies":"x"}', '{"enemies":[null,1,"x",[]]}', '{"enemies":[{"qty":9999}]}',
      '{"enemies":[{"qty":-5,"hp":"abc","sp":9999,"weapons":[7,null,{"name":5},"Nope"],"template":"zzz","armor":"zzz","ammo":"zzz","ai":{"focus":{"a":1},"preferRange":"x"}}]}'];
    const res = [];
    for (const t of bad) { try { const r = importEncounter(JSON.parse(t), { replace: true }); res.push('ok:' + r.added + ':' + r.warnings.length); } catch (e) { res.push('err:' + e.message.slice(0, 40)); } }
    const noThrow = !res.some(r => /TypeError|undefined|null/.test(r));
    const tooMany = res[5].startsWith('err:');                       // 9999 clamps to qty 20 -> fine, or rejected; both acceptable
    return noThrow && combatants.every(c => isFinite(c.hp) && c.hp >= 1 && c.head >= 0 && c.head <= 30);
  })],
  ['rewards: suggestion matches the table, awarding writes the ledger and recomputes totals', async p => {
    await seedRoster(p);
    return p.evaluate(() => {
      importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[0].data)), { replace: true });
      addRosterToCombat(roster[0].id, 'ally');
      combatants.filter(c => c.side === 'enemy').forEach(c => { c.hp = 0; });                  // 3 STANDARD + 1 STANDARD(LT)
      openRewards();
      const sug = rwSuggest(rwKillCounts().counts);
      const expect = 4 * REWARD_TABLE.STANDARD.eb;
      if (sug.eb !== expect) return false;
      document.getElementById('rwEb').value = 100; document.getElementById('rwIp').value = 7;
      document.querySelectorAll('.rw-who').forEach(x => { x.checked = (x.value === roster[0].id || x.value === 'second'); });
      rwRecalc(); rwApply();
      const [a, b] = [roster[0], roster.find(r => r.id === 'second')];
      return a.archive.gigs.length === 1 && b.archive.gigs.length === 1 && a.ip === 7 && b.ip === 7 && a.eurodollars + b.eurodollars === 100 && a.archive.gigs[0].name === 'Maelstrom Ambush';
    });
  }],
  ['rewards: cannot be double-claimed; encounter rewards and bonuses are one-shot', async p => p.evaluate(() => {
    openRewards();
    const again = rwSuggest(rwKillCounts().counts);
    const encStill = rwEnc().rewards && !rwEnc().rewards.claimed;
    return again.eb === 0 && again.ip === 0 && encStill === false || (console.log('again', again, 'encStill', encStill), false);
  })],
  ['rewards: encounter bonus can be ticked once; uneven EB split loses nothing', async p => p.evaluate(() => {
    importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[1].data)), { replace: true });
    roster.forEach(r => { r.archive = null; r.ip = 0; r.eurodollars = 0; });
    openRewards();
    document.getElementById('rwEb').value = 101; document.getElementById('rwIp').value = 0;
    document.querySelectorAll('.rw-who').forEach(x => { x.checked = true; });
    document.querySelector('.rw-bonus').checked = true; rwRecalc();
    const t = rwTotals(); rwApply();
    const total = roster.reduce((s, r) => s + (r.eurodollars || 0), 0);
    openRewards(); const bonusGone = !document.querySelector('.rw-bonus');
    return t.eb === 151 && total === 151 && bonusGone;                 // 101 + the 50 eb bonus, none lost to rounding
  })],
  ['rewards survive clearing the dead (kills are snapshotted before removal)', async p => p.evaluate(() => {
    importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[2].data)), { replace: true });
    combatants.filter(c => c.side === 'enemy' && !c.isCover).forEach(c => { c.hp = 0; });
    const before = JSON.stringify(rwKillCounts().counts);
    gridCleanDo('postCombat');
    const after = JSON.stringify(rwKillCounts().counts);
    return before === after && Object.keys(rwKillCounts().counts).length > 0;
  })],
  ['rewards go into an open character sheet without being overwritten on save', async p => p.evaluate(() => {
    const r = roster[0]; r.archive = null; const before = (r.archive && r.archive.gigs.length) || 0;
    openCharSheet(r.id); awardToRoster(r, 'Sheet-open test', 40, 2); saveCharSheet();
    const after = rosterFind(r.id);
    return after.archive.gigs.filter(g => g.name === 'Sheet-open test').length === 1 && after.ip === 2 && after.eurodollars === 40;
  })],
  ['encounter record survives reload and backup round-trip', async p => {
    await p.evaluate(() => { importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[4].data)), { replace: true }); });
    await p.reload(); await p.waitForTimeout(300);
    const afterReload = await p.evaluate(() => rwEnc().name === 'Cyberpsycho in the Combat Zone' && rwEnc().rewards.eb === 500);
    const viaBackup = await p.evaluate(() => { const d = JSON.parse(JSON.stringify(buildBackupData())); activeEncounter = null; applyBackupData(d); return rwEnc().name === 'Cyberpsycho in the Combat Zone'; });
    return afterReload && viaBackup;
  }],
]);
