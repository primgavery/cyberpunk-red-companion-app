# Developing

## Run it

There is no build. Open `index.html` in a browser (works from `file://`), or serve the folder:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

GitHub Pages serves the same file, so what you open locally is what ships.

## Tests

The checks drive the real app in headless Chromium with [Playwright](https://playwright.dev). They need only
Node and Playwright (`npm i playwright && npx playwright install chromium`); nothing is added to the app itself.

```bash
node tests/regression.js          # one check per bug that has actually bitten the app (fast, ~15 s)
node tests/fuzz-attacks.js        # every weapon × fire mode × aim × range through the real attack modal
node tests/monkey.js 1 3000       # random-click monkey: seed, number of clicks. Exit 1 on any uncaught error
```

- `regression.js` is the gate. **When you fix a bug, add a check that fails on the old code** (stash your change to
  `index.html`, run, confirm it fails, restore).
- The monkey is deterministic per seed and prints the last control touched next to each error. Run a few seeds
  (`for s in 1 2 3 4 5; do node tests/monkey.js $s 3000; done`) after any change to rendering or event handling —
  it found a re-entrancy crash that no hand-written test covered.
- Helpers in `tests/lib.js` (`launch`, `run`). Because the app's state is plain globals, tests can call app
  functions directly through `page.evaluate` (`addFromLibrary`, `rollApplyDamage`, `buildBackupData`, …) and stub
  dice with `randInt = () => 6` (restore it afterwards).
- Not covered: the cloud-sync network path (needs a token), canvas pixel output, touch gestures, multi-device
  conflicts.

## Recipes

**Add a weapon.** Append to `WEAPONS`: `{cat, name, skill, dmg:'3d6', mag, rangeRow, rof}` (+ `autoMult/autoRow`
for autofire, `areaMode` for area weapons). `rangeRow` must be a key of `RANGE.single.data`; `skill` should map in
`WPN_SKILL_MAP`. It then appears in the weapon picker and the NPC library gun dropdown.

**Add an NPC template.** Append to `NPC_LIB`: `{tier, name, hp, sp, cn, dodge}` (+ `vehicle:{name,type,sdp,sp,seats,move}`
to spawn with a vehicle). CN is the single combat number added to attacks and dodges.

**Add a map scene.** Write `presetFoo()` (see `presetAlley` — it sets `G.cols/rows`, `G.floorDeco`, and places cover with
`gridFillCover(name, hp, cells)` / `gridMkCover`), add it to `GRID_PRESET_FNS` **and** a matching `{name, …}` entry at the same index in `GRID_PRESETS`.

**Add a map object.** Add an entry to `GRID_LIB` (`{cat,name,hp,w,h}`) and, for a custom look, a `gridSpriteFoo` plus a
name match in `gridDrawSprite` (matching is by lowercase substring of the object name, first hit wins — order matters).

**Add a combatant field.** Add the default to `migrateCombatants`, set it wherever combatants are constructed
(`addCombatant`, `addFromLibrary`, `addRosterToCombat`, `gridMkCover`, `deployVehicle`), and if it must survive
write-back to the roster, add it to `writeBack`. Old saves then load without it breaking.

**Add a roster field.** Default in `blankChar()`; backfill in `applyBackupData` / `applyLoad` / `applyRosterImport`
if render code assumes it exists; include it in `saveCharSheet`.

**Add persistent state that isn't a combatant** (like the map). Write it in `save()` via `store.set`, restore it at
startup, add it to `buildBackupData` / `applyBackupData` and to the Save/Load text in `openSaveLoad` / `applyLoad`,
and call `save()` from every place that mutates it — the map lost its grid size and floor on reload because three
mutation sites never saved and no persistence path knew about it.

## Style conventions in the code

- Compact one-line setters ending `save(); renderX();` — keep that shape.
- `esc()` every user string going into `innerHTML`; use `esc(JSON.stringify(x))` for handler arguments (see Gotchas).
- Comments explain **why** (rule being implemented, bug being avoided), often with a "BATCH n" banner — preserve them.
- Rolls go through `randInt` (crypto RNG) so tests can stub one function.
