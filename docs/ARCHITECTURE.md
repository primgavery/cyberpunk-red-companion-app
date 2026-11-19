# Architecture

RED // Companion is **one static file**: `index.html` (~12k lines: CSS, markup, and one `<script>`).
No build step, no framework, no dependencies. It is served as-is by GitHub Pages and runs fully offline;
the only network call is the optional cloud sync (a private-ish GitHub Gist).

```
index.html      the whole app
test-character.json   sample roster export (also used by the tests)
tests/          headless-browser checks (Playwright) — see DEVELOPING.md
docs/           you are here
```

## The mental model

Everything is **global state + full re-render**.

1. State lives in a handful of top-level variables (`combatants`, `roster`, `vehicles`, `gigs`,
   `architectures`, `notesData`, `combatLog`, `roundNo`, `activeId`, and the map object `G`).
2. A user action calls a setter (e.g. `applyDamage`, `setInit`, `nextTurn`) that mutates state, calls
   `save()` (or `saveRoster()` etc.), then calls a `render*()` function that rebuilds that screen's HTML
   with `innerHTML`.
3. Handlers are **inline** (`onclick="applyDamage('abc123')"` inside the generated HTML), so every function
   they call must be a global. Rename a function and you must grep the HTML strings, not just call sites.

There is no state library, no virtual DOM, no modules. That is a deliberate simplicity trade — it keeps the
app a single file that works from `file://` — but it shapes every rule in [Gotchas](#gotchas).

## Screens

Bottom nav has four tabs (MAP, DICE, CHARS, DOCS); everything else hangs off the 🛠 Tools modal (`openTools`).

| Screen | Section / entry | What it is |
|---|---|---|
| **MAP** | `showMapTab` → `openGrid` | Canvas VTT: tokens, cover objects, floor, LOS, reach, range-DV, aimed attacks. Toggle to **list mode** (`setMapMode('list')`) for the card-based combat tracker (`#combat`, `renderCombat`). |
| **DICE** | `#dice` | d4/d6/d8/d10/d12/d20/d100 roller with modifier, exploding-d10 toggle, timeline + combat log tabs. |
| **CHARS** | `#roster` | Roster of full character sheets (`openCharSheet`), vehicles, gigs, net architectures. |
| **DOCS** | `#docs`, `renderDocs` | The brief for Claude (copy/download), the campaign log, and reference tables generated from the live catalogs — see [CLAUDE-BRIEF.md](CLAUDE-BRIEF.md). |
| Tools modal | `openTools` | Roster picker, NPC library, sort, new encounter, Theater of the Mind, range/DV references, vehicle combat tools, Save/Load, Full backup, Cloud sync, Calculator, Notes, mobile-view toggle. |

**Theater of the Mind** (`toggleTheaterMode`): skip auto-placing tokens on the grid so range/DV is entered by hand.

## Script layout (search for the banner comments)

The script is ordered roughly bottom-up: data tables → combat engine → renderers → roster/sheets → map.
Search for these `/* ===== … ===== */` banners:

| Banner | Contents |
|---|---|
| `STORAGE` | `store` (localStorage wrapper), `save()`, `mapState()/applyMapState()` |
| `SECURE RNG` | `randInt` (rejection-sampled `crypto.getRandomValues`), `rollDiceStr`, `rollAttackRoll` (d10 with exploding crit/fumble) |
| `NAV / SIM` | `showView`, `showMapTab`, `setMapMode`, `openTools` |
| `WEAPON CATALOG & RANGE` | `WEAPONS`, `AMMO`, `CLIP_CHART`, `ATTACH_CAT`, `ARMOR_CATALOG`, `VEHICLE_CATALOG`, `RANGE`/`BANDS` DV tables, `CRIT_BODY`/`CRIT_HEAD` |
| `NET ARCHITECTURE` | `NET_DIFFICULTIES`, `BLACK_ICE`, `DEMONS`, `FLOOR_TYPES` |
| `COMBAT STATE` | `combatants`, turn state, `migrateCombatants`, `computeDV` |
| shared damage resolver | **`resolveDamage`** (the one place armor/HP math happens), `applyAreaDamage` |
| `TURN ORDER` | `turnOrder`, `nextTurn`, `prevTurn`, `endOfTurnUpkeep` |
| `SHOOT FLOW` | `openShoot` → `rollAttack` → `rollApplyDamage` / `rollApplyArea` / `rollSuppression` (see below) |
| `RANGE BANDS` | DV lookup by weapon row + distance |
| `SAVE / LOAD`, `COMBAT RENDER` | text save/load, `renderCombat`, `cardHtml` |
| `NPC LIBRARY` | `NPC_LIB` templates, `addFromLibrary` |
| `RE-RENDER SAFETY` | `captureCardState` / `restoreCardState` — keep typed-but-uncommitted input across renders |
| `CALC`, `NOTES` | calculator (`safeEval`), notes |
| `ROSTER` | skill catalog, role abilities, multi-role system, all per-role sub-systems (Rockerboy impact, Media credibility, Lawman backup, Fixer operator, Tech maker, Medtech medicine, Netrunner interface, Exec teamwork), character sheet pagination, ammo tracker, wardrobe, images, **cyberware** |
| `VEHICLE SYSTEM` | vehicle sheet, deploy-to-combat (a vehicle becomes a *cover* combatant), ram/maneuver tools |
| `CLOUD SYNC` | `buildBackupData` / `applyBackupData`, Gist upload with conflict guard |
| `GIGS` | shared job log |
| `NET ARCHITECTURE SYSTEM` | runnable netrunning scenes (floors, ICE, demons, programs) |
| `ARCHIVE` | IP / eurodollar ledger |
| `WRITE-BACK` | `writeBack` — copy combat HP/SP/ammo/injuries back to the roster character |
| `TURN ADVISOR` | `suggestTurn` (pure planner), probability helpers (`advHitProb`, `advDamage`), `advDoIt`/`advApplyMove`, the strips (`advRefreshStrips`) and the WHY panel — see [TURN-ADVISOR.md](TURN-ADVISOR.md) |
| `DOCS TAB, CLAUDE BRIEF & CAMPAIGN LOG` | `ENC_FIELDS`, `AI_PROFILES`, `buildClaudeBrief`, `docsData`, `renderDocs`, the campaign log (`logAdd`, `logCompose`) — see [CLAUDE-BRIEF.md](CLAUDE-BRIEF.md) |
| `THEMES` | `THEMES` registry, `setTheme`, `openThemePicker`, `themeVar` (canvas colours). The palettes and the shared "modern layer" are in the stylesheet — see [THEMING.md](THEMING.md) |
| `ENCOUNTERS & REWARDS` | `importEncounter` (file → combatants), `EXAMPLE_ENCOUNTERS`, `REWARD_TABLE`, kill tracking (`rwSnapshotKills`, `rwKillCounts`), `openRewards` / `rwApply`, `awardToRoster` |
| `VTT BATTLE MAP` | `G`, `gridDraw`, pointer events, LOS/reach/movement, 47-item object library, 43 canvas-drawn sprite functions, 15 scene presets |

## The attack pipeline (the most important code path)

```
openShoot(shooterId)            builds the modal, sets global `shoot`
  └ selectTarget / setFireMode / setAimType / onRangeInput   → computes DV (computeDV, gridRangeDV)
rollAttack()                    reads modal inputs; spends ammo; rolls d10 (+CN/skill, wound, aim, CA bonuses)
  ├ hit?  atk.total > DV  (or > dodge total)       ← ties go to the defender
  └ renders the "ROLL & APPLY DAMAGE" button
rollApplyDamage() / rollApplyArea()
  └ resolveDamage(target, dmg, loc, armorMode, ablate, ignoreBelow, opts)
       SP subtraction → head ×2 (×3 cracked skull) → HP → ablation → logs
  └ crit (two 6s): +5 straight to HP, critical-injury table (rollCritInjury)
```

Rules (modes) layered on the same pipeline: single, autofire (2d6 × margin, capped by weapon), suppressive fire
(opposed rolls per defender), blast/shell (one damage roll applied to each target's own armor, cover shields
unless destroyed), aimed head/leg/held-item, smart/AP/API/rubber/incendiary/expansive ammo, melee (½ SP,
adjacency check on the grid), vehicle mounted weapons, ramming.

> **Coupling warning.** `rollAttack` reads its inputs from the modal's DOM and stores progress in the global
> `shoot`. There is no headless "resolve this attack" function. Anything that wants to attack without the modal
> (e.g. automated enemy turns) needs that extracted first — see [ENEMY-AI-NOTES.md](ENEMY-AI-NOTES.md).

## Persistence

See [DATA-MODEL.md](DATA-MODEL.md) for shapes and keys. In short: `save()` writes the encounter + map to
localStorage; `saveRoster()/saveVehicles()/saveGigs()/saveArchitectures()` write their own keys; every `save*()`
calls `scheduleAutoSync()` which (if a Gist token is set) uploads a full backup 8 s after the last change.
`applyBackupData` is the single restore path for cloud pulls and file backups.

## Gotchas

1. **Inline handlers need global functions.** Generated HTML calls them by name.
2. **Never put user text in a JS string inside an attribute with `esc()` alone.** `esc()` escapes `& < > "` for
   HTML, but entities are decoded *before* the JS parses, so `'` still breaks out. For handler arguments use
   `esc(JSON.stringify(text))` (see `csRenderSkillRow`). Prefer passing ids and looking the record up.
3. **`renderCombat()` replaces everything.** Typed-but-uncommitted values survive only if the field has class
   `js-transient` and an `id`. `renderCombat` also `blur()`s the focused field *first*: removing a focused field
   fires blur/change handlers mid-swap, and any handler that re-renders (like `tapInit`'s) would nest a second
   `innerHTML` swap inside the first and throw.
4. **Migrations are backfills, not versions.** `migrateCombatants` (and the roster/vehicle/gig/architecture
   backfills in `applyBackupData` / `applyLoad`) add missing fields with defaults so old saves still load. When you
   add a field that render code assumes exists, add its default there **and** in every import path.
5. **`store.set` can fail** (quota, blocked storage). It now keeps the value in memory, serves reads from it, and
   warns the user. Don't write to `localStorage` directly.
6. **Cover objects, tokens and vehicles are all `combatants`.** `isCover:true` objects are filtered out of turn
   order and targeted differently; vehicles are `isCover && isVehicle`. Anything iterating `combatants` must
   decide whether it wants them.
7. **Top-level `let/const` are in TDZ until their line runs.** `save()` can be called early; code it uses that
   touches later-declared state (like `G`) must be guarded (see `mapState`).
8. **Colour is a variable, never a literal.** Every theme is a set of CSS variables; a hard-coded hex breaks at least one of them (usually the light one). Canvas drawing reads colours with `themeVar('--name')`. Details and the contrast tooling: [THEMING.md](THEMING.md).
9. **The map canvas is sized by layout, not by attributes.** A `ResizeObserver` (in `gridBindEvents`) refits its pixel buffer when the layout changes; before it existed, a late layout shift left the buffer stretched and tokens ~9% squashed.
10. **Map units:** one grid cell = 2 m (`gridDist`, `combatGridDist`).
11. **Element ids are global and `getElementById` returns the first match.** A duplicate id fails *silently* (the new code renders into the wrong, often hidden, element). Prefix new ids by feature (`clog*`, `rw*`, `enc*`, `docs*`); `tests/regression.js` scans 14 screens for duplicates.
12. **Planners must not touch state.** `suggestTurn` is pure on purpose (it even avoids `gridMoveBudget`, which stamps the combatant); `advApplyMove` is where state changes, using the same bookkeeping as a drag. `gridReach`'s cache key covers every token's position, so it is safe to call after anything moves.
13. **Undo** (`pushUndo`) snapshots combatants, notes, round, active id and log — **not** roster, vehicles, map.

## Where to add things

See [DEVELOPING.md](DEVELOPING.md#recipes).
