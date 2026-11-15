/* Drives the real attack modal for every weapon x fire mode x aim type x several ranges and checks that nothing
   throws and no NaN/undefined/negative value leaks into combatant state or the modal HTML.
   Run: node tests/fuzz-attacks.js */
const { launch } = require('./lib');
(async () => {
  const { browser, page, errors } = await launch();
  const res = await page.evaluate(() => {
    const problems = [], N = { attacks: 0, damage: 0, area: 0, crits: 0 };
    const bad = v => (typeof v === 'number' && !isFinite(v)) || v === undefined;
    for (let wi = 0; wi < WEAPONS.length; wi++) for (const fm of ['single', 'auto', 'suppress', 'blast', 'shell']) for (const aim of ['normal', 'head', 'leg', 'held']) for (let rep = 0; rep < 4; rep++) {
      const tag = `${WEAPONS[wi].name}/${fm}/${aim}`;
      try {
        combatants = []; libQty = {}; libGun = {};
        libSide = 'ally'; libQty[1] = 1; libGun[1] = String(wi); addFromLibrary(1);
        libSide = 'enemy'; libQty[2] = 2; addFromLibrary(2);
        const s = combatants.find(c => c.side === 'ally'), t = combatants.filter(c => c.side === 'enemy');
        openShoot(s.id);
        if (![...document.querySelectorAll('#fireModeSec button')].some(b => (b.getAttribute('onclick') || '').includes("'" + fm + "'"))) continue;
        setFireMode(fm);
        if (isMultiMode()) shoot.multiIds = t.map(x => x.id); else selectTarget(t[0].id);
        if (fm !== 'suppress') { const r = document.getElementById('shootRange'); if (r) { r.value = [3, 8, 20, 40][rep]; onRangeInput(); } }
        if (!isMultiMode()) setAimType(aim);
        N.attacks++; rollAttack();
        const onclicks = [...document.getElementById('shootDmg').querySelectorAll('button')].map(b => b.getAttribute('onclick') || '');
        if (onclicks.some(x => x.includes('rollApplyArea'))) { N.area++; rollApplyArea(); }
        else if (onclicks.some(x => x.includes('rollApplyDamage'))) { N.damage++; rollApplyDamage(); if (/CRITICAL/.test(document.getElementById('shootDmg').innerHTML)) N.crits++; }
        const html = document.getElementById('shootBody').innerHTML;
        const m = html.match(/.{0,30}(NaN|undefined|\[object).{0,30}/); if (m) problems.push('HTML ' + tag + ': ' + m[0]);
        combatants.forEach(c => { for (const k of ['hp', 'head', 'body', 'hpMax']) if (bad(c[k]) || c[k] < 0) problems.push(`STATE ${tag} ${c.name}.${k}=${c[k]}`);
          (c.weapons || []).forEach(w => { if (w.ammo != null && (bad(w.ammo) || w.ammo < 0)) problems.push(`AMMO ${tag} ${w.name}=${w.ammo}`); }); });
        closeShoot();
      } catch (e) { problems.push('EXC ' + tag + ': ' + e.message); }
    }
    return { problems: [...new Set(problems)].slice(0, 40), N };
  });
  console.log(JSON.stringify(res.N)); res.problems.forEach(p => console.log('PROBLEM', p)); errors.forEach(e => console.log('PAGEERROR', e));
  await browser.close();
  process.exit(res.problems.length || errors.length ? 1 : 0);
})();
