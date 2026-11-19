/* Turn advisor: the maths (checked against the app's real dice code), behaviour in controlled scenarios, safety
   (suggestions are always legal squares; the planner never changes state) and the UI.  Run: node tests/advisor.js */
const { run } = require('./lib');

/* Build a clean 20x20 world. npcs/foes are encounter-file entries plus x,y; covers are [name,hp,x,y,w,h]. */
const WORLD = `(spec) => {
  combatants.length = 0; G.cols = 20; G.rows = 20; G.floorDeco = []; theaterMode = false; roundNo = 1; activeId = null; advInvalidate();
  const put = (e, side) => { const c = encBuildNpc(e, side, [], null, null); c.gridX = e.x; c.gridY = e.y; if (e.hp0 != null) c.hp = e.hp0; combatants.push(c); return c; };
  const out = { me: put(spec.me, spec.me.side || 'enemy'), foes: (spec.foes || []).map(f => put(f, f.side || 'ally')) };
  (spec.covers || []).forEach(([n, hp, x, y, w, h]) => gridMkCover(n, hp, x, y, w, h));
  return out; }`;

run('advisor', [
  ['hit-chance model matches the app\'s real attack roller (Monte Carlo, ±1.2%)', async p => p.evaluate(() => {
    const trials = 120000, cases = [[0, 13], [6, 15], [8, 20], [-2, 17], [10, 25], [4, 9]]; let worst = 0;
    for (const [mod, dv] of cases) { let hit = 0; for (let i = 0; i < trials; i++) if (rollAttackRoll(mod).total > dv) hit++; worst = Math.max(worst, Math.abs(hit / trials - advHitProb(mod, dv))); }
    return worst < .012 || (console.log('worst error', worst), false);
  })],
  ['opposed (Evasion) hit chance matches the real roller too', async p => p.evaluate(() => {
    const trials = 100000; let hit = 0; for (let i = 0; i < trials; i++) if (rollAttackRoll(7).total > rollAttackRoll(5).total) hit++;
    return Math.abs(hit / trials - advHitProb(7, advD10Dist(5))) < .012;
  })],
  ['damage model matches the real dice + armor rule (expected HP lost, ±0.08)', async p => p.evaluate(() => {
    const trials = 150000; let tot = 0; const sp = 7, dmg = '3d6';
    for (let i = 0; i < trials; i++) tot += Math.max(0, rollDiceStr(dmg).sum - sp);
    return Math.abs(tot / trials - advDamage(advDiceDist(dmg), 0, 1, sp, 999).e) < .08;
  })],
  ['autofire model matches the real rule (2d6 x capped margin vs DV, ±0.15 HP)', async p => p.evaluate(() => {
    const trials = 150000, mod = 6, dv = 15, mult = 3, sp = 4; let tot = 0;
    for (let i = 0; i < trials; i++) { const a = rollAttackRoll(mod).total; if (a > dv) tot += Math.max(0, rollDiceStr('2d6').sum * Math.min(a - dv, mult) - sp); }
    let e = 0; advD10Dist(mod).forEach((pr, t) => { if (t > dv) e += pr * advDamage(advDiceDist('2d6'), 0, Math.min(t - dv, mult), sp, 999).e; });
    return Math.abs(tot / trials - e) < .15;
  })],

  ['suggestTurn never changes state (pure) and is deterministic', async p => p.evaluate(`(() => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Heavy Pistol'], x: 2, y: 10 }, foes: [{ template: 'Mook', weapons: ['SMG'], x: 14, y: 9 }], covers: [['Crate', 20, 7, 9, 2, 2]] });
    const before = JSON.stringify(combatants); const a = JSON.stringify(suggestTurn(w.me)), b = JSON.stringify(suggestTurn(w.me));
    return before === JSON.stringify(combatants) && a === b && a.length > 20; })()`)],
  ['not offered for player characters, cover, or the dead', async p => p.evaluate(`(() => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Medium Pistol'], x: 2, y: 2 }, foes: [{ template: 'Mook', x: 9, y: 2 }] });
    const r = [suggestTurn(w.foes[0]) !== null]; w.me.rosterId = 'x'; r.push(suggestTurn(w.me) === null); w.me.rosterId = null; w.me.hp = 0; r.push(suggestTurn(w.me) === null); w.me.hp = 5;
    const cv = combatants.find(c => c.isCover); r.push(cv ? suggestTurn(cv) === null : true); return r.every(Boolean); })()`)],

  ['in the open it closes to a legal square, targets the foe, and the DV it quotes is the real table value', async p => p.evaluate(`(() => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Heavy Pistol'], x: 2, y: 10 }, foes: [{ template: 'Mook', name: 'Foe', x: 16, y: 10 }] });
    const s = suggestTurn(w.me); const at = s.steps.find(x => x.type === 'attack'); const mv = s.steps.find(x => x.type === 'move');
    const dv = gridRangeDV('Pistol', at.rangeM, 'single');
    return s.mode === 'attack' && at.targetName === 'Foe' && at.dv === dv && (!mv || (mv.squares <= gridMoveBudget(w.me).remMove && !mv.run)); })()`)],
  ['a cautious shooter takes cover between itself and the enemy; an aggressive one does not bother and gets closer', async p => p.evaluate(`(() => {
    const mk = prof => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Heavy Pistol'], x: 2, y: 10, ai: { profile: prof } }, foes: [{ template: 'Mook', x: 14, y: 10 }], covers: [['Crate', 20, 7, 9, 2, 2], ['Crate', 20, 7, 12, 2, 1]] }); return { w, s: suggestTurn(w.me) }; };
    const c = mk('cautious'), a = mk('aggressive');
    const cm = c.s.steps.find(x => x.type === 'move'), am = a.s.steps.find(x => x.type === 'move');
    const cautiousCover = cm && advCoversAt(cm.to.x, cm.to.y).length > 0 && cm.cover;
    const distC = cm ? advDistM(cm.to.x, cm.to.y, c.w.foes[0]) : advDistM(2, 10, c.w.foes[0]);
    const distA = am ? advDistM(am.to.x, am.to.y, a.w.foes[0]) : advDistM(2, 10, a.w.foes[0]);
    return !!cautiousCover && distA <= distC; })()`)],
  ['low HP + retreat brief: it falls back (Run, no attack) to a square farther from the enemy; a berserker never does', async p => p.evaluate(`(() => {
    const mk = prof => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Medium Pistol'], x: 8, y: 10, hp0: 8, ai: { profile: prof, retreatAtHpPct: 50 } }, foes: [{ template: 'Mook', weapons: ['Assault Rifle'], x: 12, y: 10 }] }); return { w, s: suggestTurn(w.me) }; };
    const c = mk('cautious'), b = mk('berserker');
    const mv = c.s.steps.find(x => x.type === 'move');
    return c.s.mode === 'retreat' && mv && mv.run === true && !c.s.steps.some(x => x.type === 'attack') && advDistM(mv.to.x, mv.to.y, c.w.foes[0]) > advDistM(8, 10, c.w.foes[0]) && b.s.mode !== 'retreat'; })()`)],
  ['an empty gun means reload (and DO IT actually reloads it)', async p => p.evaluate(`(() => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Medium Pistol'], x: 3, y: 3 }, foes: [{ template: 'Mook', x: 9, y: 3 }] });
    w.me.weapons[0].ammo = 0; const s = suggestTurn(w.me); activeId = w.me.id; advInvalidate(); const ok1 = s.mode === 'reload' && s.steps[0].type === 'reload'; advDoIt(w.me.id);
    return ok1 && w.me.weapons[0].ammo > 0; })()`)],
  ['melee: reachable foe -> move adjacent and strike; far foe -> run toward it and say no strike is possible', async p => p.evaluate(`(() => {
    const near = (${WORLD})({ me: { template: 'Mook', weapons: ['Heavy Melee'], x: 3, y: 10 }, foes: [{ template: 'Mook', x: 7, y: 10 }] }); const a = suggestTurn(near.me);
    const at = a.steps.find(x => x.type === 'attack'), mv = a.steps.find(x => x.type === 'move');
    const okNear = a.mode === 'attack' && at.melee && mv && advAdjacentTo(mv.to.x, mv.to.y, near.foes[0]);
    const far = (${WORLD})({ me: { template: 'Mook', weapons: ['Heavy Melee'], x: 1, y: 1 }, foes: [{ template: 'Mook', x: 18, y: 18 }] }); const b = suggestTurn(far.me);
    return okNear && b.mode === 'advance' && b.steps.length === 1 && b.steps[0].run === true; })()`)],
  ['"hold cover until round N" keeps it in cover and still shoots', async p => p.evaluate(`(() => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Heavy Pistol'], x: 7, y: 10, ai: { profile: 'cautious', stayInCoverUntil: 'round 3' } }, foes: [{ template: 'Mook', x: 15, y: 10 }], covers: [['Crate', 20, 7, 11, 2, 1]] });   /* crate beside the shooter, not in the line of fire (solid cover blocks line of sight in this app) */
    const s = suggestTurn(w.me); const noMove = !s.steps.some(x => x.type === 'move'); roundNo = 3; advInvalidate(); const later = suggestTurn(w.me);
    return s.mode === 'attack' && noMove && /Hold position/.test(s.summary) && !/Hold position/.test(later.summary); })()`)],
  ['Theater of the Mind: no movement, range left to the GM, and it says so', async p => p.evaluate(`(() => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Medium Pistol'], x: 2, y: 2 }, foes: [{ template: 'Mook', x: 12, y: 2 }] });
    theaterMode = true; advInvalidate(); const s = suggestTurn(w.me); theaterMode = false;
    const at = s.steps.find(x => x.type === 'attack'); return s.mode === 'attack' && !s.steps.some(x => x.type === 'move') && at.rangeM === null && s.reasons.some(r => /No map positions/.test(r)); })()`)],

  ['randomised worlds: every suggested square is legal (in bounds, free, reachable within the budget, with line of sight / adjacency for the attack)', async p => p.evaluate(`(() => {
    let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296, ri = n => Math.floor(rnd() * n);
    const weps = ['Medium Pistol', 'Heavy Pistol', 'SMG', 'Assault Rifle', 'Shotgun', 'Sniper Rifle', 'Light Melee', 'Heavy Melee'], profs = ['', 'cautious', 'aggressive', 'sniper', 'flanker', 'coward', 'berserker', 'duelist'];
    const bad = []; let n = 0, moves = 0, attacks = 0;
    for (let k = 0; k < 120; k++) {
      const used = new Set(), cell = () => { for (;;) { const x = ri(20), y = ri(20); if (!used.has(x + ',' + y)) { used.add(x + ',' + y); return [x, y]; } } };
      const [mx, my] = cell(); const foes = []; for (let i = 0; i < 1 + ri(4); i++) { const [x, y] = cell(); foes.push({ template: ['Mook', 'LT'][ri(2)], weapons: [weps[ri(weps.length)]], x, y }); }
      const covers = []; for (let i = 0; i < ri(10); i++) { const [x, y] = cell(); covers.push(['Crate', 15, x, y, 1 + ri(2), 1 + ri(2)]); }
      const w = (${WORLD})({ me: { template: 'Mook', weapons: [weps[ri(weps.length)], weps[ri(weps.length)]], x: mx, y: my, hp0: 3 + ri(28), ai: { profile: profs[ri(profs.length)], retreatAtHpPct: ri(2) ? 40 : null } }, foes, covers });
      if (rnd() < .3) w.me.weapons.forEach(g => { if (g.mag != null) g.ammo = ri(3) ? g.ammo : 0; });
      let s; try { s = suggestTurn(w.me); } catch (e) { bad.push('THROW ' + e.message); continue; }
      n++; if (!s) continue;
      const mv = s.steps.find(x => x.type === 'move'), at = s.steps.find(x => x.type === 'attack');
      const b = gridMoveBudget(w.me), reach = mv && gridReach(w.me, Math.max(b.remMove, b.remTotal));
      if (mv) { moves++; const key = mv.to.x + ',' + mv.to.y;
        if (mv.to.x < 0 || mv.to.y < 0 || mv.to.x >= G.cols || mv.to.y >= G.rows) bad.push('OOB');
        else if (!reach.has(key)) bad.push('unreachable ' + key);
        else if (gridCellBlockedForChar(mv.to.x, mv.to.y, w.me.id)) bad.push('occupied ' + key);
        else if (reach.get(key) > (mv.run ? b.remTotal : b.remMove)) bad.push('over budget');
        else if (gridEnterableAt(mv.to.x, mv.to.y)) bad.push('perched on enterable'); }
      if (at) { attacks++; const t = find(at.targetId), g = w.me.weapons[at.weaponIdx], px = mv ? mv.to.x : w.me.gridX, py = mv ? mv.to.y : w.me.gridY;
        if (!t || t.hp <= 0 || t.side === w.me.side) bad.push('bad target');
        else if (g.melee ? !advAdjacentTo(px, py, t) : !gridLOS({ gridX: px, gridY: py }, t)) bad.push('no LOS/adjacency for ' + g.name);
        else if (!g.melee && gridRangeDV(g.rangeRow, advDistM(px, py, t), 'single') == null) bad.push('out of range');
        else if (g.jammed || g.reloading > 0 || (g.mag != null && !g.melee && g.ammo <= 0)) bad.push('unusable weapon'); }
    }
    if (bad.length) console.log(bad.slice(0, 6)); return !bad.length && n === 120 && moves > 10 && attacks > 30; })()`)],
  ['speed: a worst-case suggestion on a full-size scene stays well under 150 ms', async p => p.evaluate(`(() => { importEncounter(JSON.parse(JSON.stringify(EXAMPLE_ENCOUNTERS[2].data)), { replace: true }); gridAutoPlace();
    for (let i = 0; i < 10; i++) { const e = encBuildNpc({ template: 'Mook', weapons: ['Assault Rifle'] }, 'ally', [], null, null); e.gridX = 1 + i; e.gridY = 1; combatants.push(e); }
    let worst = 0; combatants.filter(c => !c.isCover && !c.rosterId).forEach(c => { const t0 = performance.now(); suggestTurn(c); worst = Math.max(worst, performance.now() - t0); }); return worst < 150 || (console.log('worst ms', worst), false); })()`)],

  ['DO IT: moves the token with the app\'s own bookkeeping (budget spent, cover assigned) and opens the attack screen locked on the suggested target at the right DV', async p => {
    await p.evaluate(`(() => { const w = (${WORLD})({ me: { template: 'Mook', name: 'Shooter', weapons: ['Heavy Pistol'], x: 2, y: 10, ai: { profile: 'cautious' } }, foes: [{ template: 'Mook', name: 'Target', x: 14, y: 10 }], covers: [['Crate', 20, 7, 9, 2, 2]] });
      activeId = w.me.id; window.__id = w.me.id; advInvalidate(); setMapMode('list'); renderCombat(); window.__s = suggestTurn(w.me); })()`);
    await p.locator('#turnAdvice .adv-go').click();
    return p.evaluate(`(() => { const me = find(window.__id), s = window.__s, mv = s.steps.find(x => x.type === 'move'), at = s.steps.find(x => x.type === 'attack');
      const moved = !mv || (me.gridX === mv.to.x && me.gridY === mv.to.y && (me._mvUsed || 0) === mv.squares);
      const cover = !mv || !mv.cover || me.behindCoverId !== null;
      const open = document.getElementById('shootModal').classList.contains('open') && shoot && shoot.shooterId === me.id && shoot.targetId === at.targetId;
      const dvOk = document.getElementById('shootDV').textContent.includes('DV ' + at.dv);
      return moved && cover && open && dvOk; })()`);
  }],
  ['after DO IT the strip says the turn is used; a fresh turn suggests again', async p => p.evaluate(`(() => { closeShoot(); renderTurnBar(); const done = /has used its turn/.test(document.getElementById('turnAdvice').innerHTML);
    roundNo++; advInvalidate(); renderTurnBar(); return done && /Suggested/.test(document.getElementById('turnAdvice').innerHTML); })()`)],
  ['strip shows only for NPCs, honours the Tools switch, and WHY? explains', async p => p.evaluate(`(() => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Medium Pistol'], x: 2, y: 2 }, foes: [{ template: 'Mook', x: 9, y: 2 }] });
    activeId = w.me.id; advInvalidate(); renderTurnBar(); const on = /Suggested/.test(document.getElementById('turnAdvice').innerHTML);
    w.me.rosterId = 'pc'; advInvalidate(); renderTurnBar(); const pc = document.getElementById('turnAdvice').innerHTML === ''; w.me.rosterId = null;
    advisorOn = false; renderTurnBar(); const off = document.getElementById('turnAdvice').innerHTML === ''; advisorOn = true; advInvalidate(); renderTurnBar();
    openAdvice(w.me.id); const why = /WHY/.test(document.getElementById('tempModalBody').innerHTML) && /to hit/.test(document.getElementById('tempModalBody').innerHTML); document.getElementById('tempModal').classList.remove('open');
    return on && pc && off && why; })()`)],
  ['map: destination marker is set and drawn, and the strip is not rebuilt on every frame', async p => p.evaluate(`(async () => { const w = (${WORLD})({ me: { template: 'Mook', weapons: ['Heavy Pistol'], x: 2, y: 10, ai: { profile: 'cautious' } }, foes: [{ template: 'Mook', x: 14, y: 10 }], covers: [['Crate', 20, 7, 9, 2, 2]] });
    activeId = w.me.id; advInvalidate(); setMapMode('map'); gridDraw(); await new Promise(r => setTimeout(r, 150));
    const hint = !!G.advHint; const el = document.getElementById('gridAdvice'); let muts = 0; const mo = new MutationObserver(m => { muts += m.length; }); mo.observe(el, { childList: true, subtree: true });
    for (let i = 0; i < 40; i++) gridDraw(); await new Promise(r => setTimeout(r, 50)); mo.disconnect();
    return hint && el.style.display !== 'none' && /Suggested/.test(el.innerHTML) && muts === 0 || (console.log({ hint, muts }), false); })()`)],
]);
