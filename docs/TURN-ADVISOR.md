# Turn advisor (move & attack suggestions)

When it is an **NPC's turn** (any combatant that isn't linked to a roster character, on either side) the app shows a one-line
suggestion: *"Move 4 squares SW behind Dumpster (steel), then shoot Test Runner with the SMG (autofire) (DV 13, 8 m)."*
**DO IT** performs the move through the app's normal rules and opens the normal attack screen pre-filled; **WHY?** shows the
reasoning. Nothing is ever resolved automatically — you still roll the dice and apply the result.

Switch it off with **🛠 Tools → Turn suggestions for NPCs**. Player characters never get suggestions (they are yours to play).

## Where it shows

| Place | What |
|---|---|
| List mode | A strip under the sticky turn bar (`#turnAdvice`) |
| Map mode | A strip above the HUD (`#gridAdvice`); the destination is drawn on the map as a dashed path and ring |
| WHY? | A panel with the steps, the numbers, the brief it read, and the next-best alternatives |
| After DO IT | The strip says "has used its turn — press END TURN" until the round or turn changes (↻ re-suggests) |

## How it decides

`suggestTurn(c)` in `index.html` (search `TURN ADVISOR`) is a **pure function**: it reads state and returns a plan; it changes
nothing, and the same state always gives the same plan. `tests/advisor.js` enforces both.

### 1. What is possible
- **Foes** = living, non-cover combatants on the other side.
- **Weapons** = those not jammed, not reloading, and (if ranged) with ammo. If none are usable but a gun is just empty →
  the plan is **Reload** (it uses the Action).
- **Squares** it can reach come from the map's own `gridReach` (8-way flood, blocked by solid cover and other tokens), limited by
  the per-turn budget: **MOVE squares to walk and still attack, 2× MOVE to Run** (Run uses the Action, so a Run plan never attacks).
  Squares inside chairs/vehicles are never suggested.
- **No map** (Theater of the Mind, or anyone unplaced): no movement is suggested and range is left to you (DV 13 is assumed
  only to rank options, and the panel says so).

### 2. How good is an attack
For every (target, weapon, square) it computes, **exactly** (no sampling):
- **Hit chance** = P(attack total > DV) using the real roller's distribution — d10 with exploding natural 10/1 — plus the
  attacker's CN (or skill bonus), weapon bonus, excellent quality, and the −2 wounded penalty. **Ties go to the defender**, as in
  `rollAttack`. DV comes from the app's range tables (`gridRangeDV`) at the real distance; out of range = not an option.
- **Melee** is always opposed by the target's Evasion (`dodgeValueOf`), as in the app, and needs an adjacent square.
- **Damage** = the weapon's exact dice distribution minus the target's SP (half for melee), summed over its ROF, plus a bonus for
  a likely kill. **Autofire** (needs 10 rounds) is evaluated with the real "2d6 × margin, capped" rule and chosen when it beats single shots.

These models are validated in `tests/advisor.js` against Monte-Carlo runs of the app's actual `rollAttackRoll` / `rollDiceStr`.

### 3. How good is a square (position)
Added to the attack value, in "HP-equivalents":
- **Cover**: standing next to living cover (the same adjacency rule `gridAutoAssignCover` uses, so the app will really treat it as
  cover) — bonus; more if that cover also screens it from another enemy. Solid cover on the *line to the target* blocks the shot in
  this app, so cover is only ever *beside* the shooter.
- **Exposure**: −0.7 for each other nearby enemy that could see the square. **Ranged shooter next to an enemy**: −1.6.
- **Preferred range** from the brief: penalty for being outside it. Small penalty per square travelled.

### 4. Which target
The highest total wins, then the NPC's `ai.focus` adds a bonus: *nearest*, *lowest hp / weakest*, *highest threat / biggest*. With no
focus: a mild preference for the wounded (flanker: strongly; duelist: the most dangerous).

### 5. The brief changes the plan (`ai` block, see [ENCOUNTER-FORMAT.md](ENCOUNTER-FORMAT.md))
| Key | Effect |
|---|---|
| `profile` aggressive / berserker / duelist | Cover counts ~¼; prefers being close |
| `profile` cautious / sniper / coward | Cover counts ~1.4×; sniper also likes distance |
| `profile` flanker | Prefers the weakest target |
| `retreatAtHpPct` (coward: 75) | At or below that HP: **fall back** — Run to the square that breaks line of sight / gains distance / has cover, no attack. A **berserker never retreats**. If there is nowhere better to run, it fights on and says so |
| `stayInCoverUntil` `"round N"` / `"flanked"` | While true and it is already beside cover, **hold position** and shoot from there. "Flanked" = the cover no longer protects it from the nearest enemy |
| `preferRange` [min,max] metres | See position scoring |

If nothing can be attacked from any square it can reach, it **advances**: Run toward the nearest enemy (and says no shot is possible this turn).

## Applying a suggestion
`advDoIt(id)`:
1. **Move** (`advApplyMove`): re-checks that the square is still free and reachable, then does what a drag does — adds the squares to the
   movement budget, sets the position, runs `gridAutoAssignCover()` (so `behindCoverId` is set by the app's own rule), logs "➜ X moves N squares".
2. **Attack**: `openShoot(id,{targetId,wi,range,fromMap:true})` so the target and range are locked from the map and the DV shown is the one
   the advisor used; autofire switches the modal to autofire. In Theater of the Mind it opens the screen and selects the target.
3. **Reload** calls the normal `reloadWeapon`.
The `_advDone` stamp on the combatant (round|id) is what makes the strip say "used its turn".

## Known limits (deliberate; it is a prompt for a human, not an oracle)
- Body shots only; no aimed head/leg shots, no critical-injury value, no special ammo effects.
- Blast/shell/suppressive fire and grenades are not planned; a rocket launcher is scored as one shot.
- Ranged DV is used even if the target `canDodge` (the app lets the shooter choose Evasion in the attack screen).
- No multi-turn planning, no flanking geometry, no knowledge of allies' plans, no vehicle moves or mounted weapons.
- Line of sight is the map's sampled ray (`gridLOS`), not exact geometry.
- It does not know about things only you know (the GM's secret plans) — the brief's `notes` are shown but not interpreted.

## Changing it
- Weights live in the plan loop of `suggestTurn` (cover `2.6/1.2`, exposure `.7`, adjacency `1.6`, focus bonuses in `advFocusBonus`). Change one, run
  `node tests/advisor.js`; the scenario tests assert behaviour ("cautious takes cover, aggressive gets closer"), not exact numbers.
- A new `ai.profile` word: add it to `AI_PROFILES` (this also puts it in the Claude brief) and give it a branch in `suggestTurn` (search `profile`).
- Debug a suggestion in the console: `suggestTurn(find(activeId))` — it returns `{mode, summary, steps, reasons}`.
