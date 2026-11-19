# Notes toward enemies that act on their own

Not implemented. This records what the code already offers, what is missing, and a build order that keeps the
risk (and the bugs) small. It is written from reading the code and exercising it headlessly, not from a prototype.

## What already exists (reusable as-is)

| Need | Existing piece | Notes |
|---|---|---|
| Whose turn is it | `turnOrder()`, `activeId`, `nextTurn()`, `actsThisTurn()` | `nextTurn` also ticks reload/conditions/burning via `endOfTurnUpkeep` |
| Where can I go | `gridReach(c, squares)` → `Map("x,y" → steps)` (BFS, 8-neighbour, respects blocked cells) | cached; `gridMoveStat(c)` / `gridMoveBudget(c)` give MOVE (halved by leg hits) and what is left this turn |
| Can I see them | `gridLOS(a, b)`, `gridCoverBetween(cv, from, to)`, `gridInCover(c)` | sampled ray against non-enterable living cover |
| How far / what DV | `combatGridDist(a, b)` (metres, 2 m/cell), `gridRangeDV(rangeRow, m, mode)` | `null` = out of range for that weapon |
| What can I shoot with | `c.weapons[]` (`ammo`, `mag`, `rof`, `reloading`, `jammed`, `rangeRow`, `autoMult`) | |
| Resolve the damage | `resolveDamage(target, dmg, loc, armorMode, ablate, ignoreBelow, opts)` | pure state mutation + log; no DOM |
| Cover seeking | `gridAutoAssignCover` (+ `behindCoverId`) | already used for placement |

## What is missing

1. **A headless attack.** `rollAttack()` / `rollApplyDamage()` read the modal's inputs and keep progress in the global
   `shoot`. There is no function that means "attacker A shoots target B with weapon W in mode M" and returns an
   outcome. This is the one real prerequisite. Extract it from `rollAttack` (hit/dodge/tie logic, ammo spend, wound
   penalty, CN/skill bonus, aim penalty, autofire margin, crit) and have the modal call it too, so there is a single
   implementation. `tests/fuzz-attacks.js` already exercises every mode through the modal and would catch drift.
2. **A behaviour description per enemy.** Today the only per-NPC free text is `note`.
3. **A turn hook.** `nextTurn()` just advances; nothing runs when an enemy becomes active.

## Suggested build order

**Phase 1 — advisor, no automation (safe, useful immediately). ✅ Built — see [TURN-ADVISOR.md](TURN-ADVISOR.md).**
When an enemy becomes active, show a one-line recommendation on its card: *"Move to (7,4) (cover), shoot Test Runner
(DV 15)."* The player/GM clicks to accept — accepting just calls the existing move (`G` drag logic) and opens
the existing attack modal pre-filled (`openShoot(id,{targetId,range,fromMap:true})` already supports pre-filling).
Nothing is resolved without a human; mistakes are suggestions, not state corruption.

**Phase 2 — behaviour profiles + the headless attack.**
Extract the headless attack (above). Add an optional `ai` block to combatants:

```jsonc
"ai": {
  "profile": "cautious",            // named preset: aggressive | cautious | flanker | sniper | coward | berserker
  "stayInCoverUntil": "flanked",    // or a round number
  "retreatAtHpPct": 50,
  "focus": "highestThreat",         // | nearest | lowestHp | lowestArmor | player:<name>
  "preferRange": [6, 25],           // metres
  "reloadWhenEmpty": true
}
```

The decision loop per enemy turn is small and deterministic: *pick target → pick position (best score of reachable
cells: has LOS, inside preferred range, in/behind cover, not adjacent to many foes) → move → pick weapon/mode (autofire
only if ≥10 rounds and DV reasonable; reload if empty) → attack → end turn.* Keep the scoring a plain function of
`(combatant, foes, reachable cells)` so it can be unit-tested in the same page-evaluate style as the rest.

Encounters generated in chat (see the README workflow) would carry these `ai` blocks as JSON, which is the natural
import format.

**Phase 3 — auto-run with a brake.**
A "Run enemy turn" button first (one enemy, shows each step with a Confirm), then "Run all enemies" only once Phase 2
has been through some real sessions.

## Hazards to design around

- **Re-render re-entrancy.** Every setter re-renders the whole combat list. An AI loop that moves, attacks and
  advances in one tick must not call `renderCombat()` from inside another render or a blur handler — that exact
  pattern already crashed the app once (see `tapInit`, `docs/ARCHITECTURE.md` Gotcha 3). Batch state changes, render once.
- **Everything in `combatants` is not a combatant.** Cover objects and vehicles are in the same array. Filter with
  `!c.isCover` before choosing targets/actors, and remember `behindCoverId` links people to vehicles as *seats*.
- **Dead vs. down.** `hp ≤ 0` combatants with `trackDeath` still take turns for death saves; an AI must not treat
  them as "skipped" the way `turnOrder` consumers might.
- **Map placement may be absent** (Theater of the Mind, unplaced tokens): `gridX == null`. The helpers return
  permissive defaults (`gridLOS` → true, `combatGridDist` → null). An AI needs an explicit no-map mode that works
  from the DV the human types in, or it must refuse to act.
- **Rules ambiguities in `docs/RULES-NOTES.md`** (tie-breaking, ablation at equality) become *visible* the moment an
  AI starts shooting for you. Settle them first.
- **Undo** (`pushUndo`) covers combatants/notes/round/log only. Take a snapshot before an enemy-turn run so a bad
  one can be rolled back with one tap.
