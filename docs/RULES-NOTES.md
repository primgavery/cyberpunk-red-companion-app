# Rules implementation notes

What the code actually does, and the places where it makes a **judgement call you may want to confirm against
your rulebook / house rules**. Nothing here is a crash — these are behaviours. Items marked ❓ are ones I could
not settle from the code alone; I left them unchanged rather than guess.

## Attack resolution

| Behaviour | Where | Notes |
|---|---|---|
| Attack roll = `1d10 + CN (or skill) + weapon bonus + situational`, d10 explodes: natural 10 adds another d10, natural 1 subtracts one | `rollAttackRoll` | Fumble Recovery (Solo CA) turns a natural 1 into a plain 1 |
| Hit requires `total > DV`. **Ties miss** ("tie, defender wins") — for both fixed DV and an opposed dodge | `rollAttack` | ❓ The Cyberpunk RED core rules read to me as *meets or beats* for DV checks. This was written deliberately (UI says "tie, defender wins"), so confirm which you play. One-character change: `>` → `>=` in `rollAttack` (and `rollSmartSecond`, `rollSuppressDefender`) |
| Wounded penalty −2 when `0 < HP ≤ ceil(maxHP / 2)` (attacker and dodger) | 8 places use the same expression | ❓ "Seriously Wounded" is usually *below* half. At exactly half this applies the penalty. Consistent everywhere, so it looks intentional |
| Aimed shots (head / leg / held item) take −8 and only apply to single shots | `rollAttack` | Head ×2 after armor (×3 with *Cracked Skull*); leg → MOVE ½ (now a real condition); held item → target drops it (log only) |
| Cover objects are ordinary targets (`isCover`, ▨). On the map, cover lying between shooter and foe is offered as a target (`gridCoverShields`); in list mode the player picks it. **Nothing is auto-redirected** — whoever runs the attack chooses to shoot the cover | `openShoot`, `gridShotTargets` | Destroyed cover (`hp ≤ 0`) stops shielding. A character with `behindCoverId` set is shown as sheltered and is protected from blasts unless the cover is destroyed (`applyAreaDamage`). Vehicle weak-point (−8) doubles damage that gets past SP |
| Smart rounds: miss by ≤ 4 → one extra roll of `1d10+10` | `rollSmartSecond` | |
| Poor-quality weapons jam on a natural 1 (still resolves the attack) | `rollAttack` | Unjam costs an Action |
| Autofire: needs 10 rounds in the clip; damage `2d6 × min(margin, weapon cap)`; only a double 6 crits | `rollAttack`, `rollApplyDamage` | Melee attacks against an *object* (cover) auto-hit (`autoHits`) |

## Damage and armor (`resolveDamage` — the only place this math lives)

1. `effSP` = SP, or ½ SP rounded **down** for melee, or 0 for armor-ignoring ammo (unless SP ≥ `ignoreBelow`).
2. `past = max(0, dmg − effSP)`; head ×2 (×3 cracked skull) → `hpLost`. Rubber/non-lethal never takes a target below 1 HP.
3. Armor ablates (−1, −2 for AP) when `dmg ≥ effSP` **and** SP > 0. ❓ That means damage **exactly equal** to SP
   (zero HP damage) still ablates the armor. If your table ablates only when damage *exceeds* SP, change
   `penetrates=bypassed||(dmg>=effSP)` to `>`.
4. Critical: two or more 6s on the damage dice → **+5 directly to HP**, plus a roll on the body/head critical-injury
   table. If that bonus drops a tracked combatant to 0 it now logs ☠ MORTALLY WOUNDED (it didn't before).
5. Damage Deflection (Solo CA) subtracts from damage before armor; Spot Weakness adds once per round.

## Death and wounds

- **Death save** (`rollDeathSave`, opt-in per combatant via `trackDeath`): roll `1d10`, survive if
  `roll + penalty < BODY`; penalty = (death-save-penalty injuries) + (saves already made). Natural **10 always
  fails**; natural **1 always passes**. ❓ The auto-pass on 1 ignores the penalty — confirm that's your house rule.
- Crit-injury tables are `CRIT_BODY` / `CRIT_HEAD` (2d6). Some injuries add a death-save penalty (`DS_PENALTY`).
- Burning: −2 HP straight to HP at the end of that combatant's turn (`endOfTurnUpkeep`).

## Turn order, movement, range

- Initiative descending; **allies win ties** (`turnOrder`). A combatant at 0 HP is skipped unless death saves are being tracked for them (`actsThisTurn`: `hp>0 || trackDeath`), so mortally wounded characters still get their turn.
- 1 cell = 2 m. A Move Action covers MOVE cells, running doubles it (`gridMoveBudget`). MOVE is halved by a leg
  injury or the *Leg hit* condition. (A stale comment in `gridMoveStat` mentions Seriously Wounded halving MOVE; the
  code does not do that.)
- Range DV comes from the `RANGE` tables by weapon row and distance band (0–6, 7–12, 13–25, 26–50, 51–100, 101–200,
  201–400, 401–800 m); `N/A` means out of range.
- Line of sight is a sampled ray against *non-enterable* living cover; it is a gameplay aid, not exact geometry.

## Things the app does not enforce (GM adjudicates)

Held-item drops, most critical-injury *effects* beyond the log text and the death-save penalty, armor
penalties to REF/DEX/MOVE (stored on armor and shown on the sheet, but not applied to rolls), vehicle crash damage beyond the ram
tool, and cyberware effects other than Humanity tracking.
