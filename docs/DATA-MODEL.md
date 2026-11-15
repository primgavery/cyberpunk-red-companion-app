# Data model & persistence

Everything is plain JSON. Nothing is versioned; old data is upgraded by *backfilling missing fields*
(see [ARCHITECTURE → Gotchas](ARCHITECTURE.md#gotchas) #4).

## localStorage keys

All access goes through `store.get/set` (which survives blocked/full storage — see Gotchas #5).

| Key | Written by | Contents |
|---|---|---|
| `cpred_combat` | `save()` | `combatants[]` — the encounter **including** tokens, cover objects and deployed vehicles |
| `cpred_turn` | `save()` | `{round, activeId}` |
| `cpred_log` | `save()` | combat log, capped at 250 entries `{r, m, k}` (round, message, kind) |
| `cpred_notes` | `save()` | `[{id,title,body}]` |
| `cpred_sort` | `save()` | `'added'` \| `'init'` |
| `cpred_tokenstyle` | `save()` | token display options (shape, portrait, name, hp display, scale) |
| `cpred_theater` | `save()` | `'1'`/`'0'` — Theater of the Mind |
| `cpred_map` | `save()` | `{cols, rows, floorDeco[]}` — grid size and painted floor (**not** cover/tokens; those are combatants) |
| `cpred_theme` | `setTheme()` | `slate` \| `paper` \| `ember` \| `neon`. A per-device preference: **not** included in backups, Save/Load or cloud sync. Read by a script in `<head>` before first paint — see [THEMING.md](THEMING.md) |
| `cpred_encounter` | `saveEncounterState()` | the active encounter record: `{name, summary, scene, rewards:{eb,ip,notes,bonuses[],claimed}, kills:{combatantId→tier}, paid:{combatantId→1}, claims[]}` — see [ENCOUNTER-FORMAT.md](ENCOUNTER-FORMAT.md) |
| `cpred_roster` | `saveRoster()` | character sheets |
| `cpred_vehicles` | `saveVehicles()` | vehicle sheets |
| `cpred_gigs` | `saveGigs()` | shared gig log |
| `cpred_architectures` | `saveArchitectures()` | net architectures |
| `cpred_autosync` | cloud modal | `'0'` disables auto-sync |
| `cpred_gist_token` | cloud modal | **GitHub personal access token (plain text)** — never included in backups |
| `cpred_gist_id`, `cpred_gist_known_version`, `cpred_gist_last_sync` | `doGistUpload` | sync bookkeeping |

localStorage is ~5 MB. Character portraits are stored as base64 in the roster and are what fills it up; the
character sheet shows a storage bar (`csStorageBarHtml`). When a write fails the app now warns once a minute.

## Combatant (`combatants[]`)

Created by `addCombatant`, `addFromLibrary`, `addRosterToCombat`, `gridMkCover`, `deployVehicle`;
defaults filled by `migrateCombatants`.

```jsonc
{
  "id": "mwh3jc9cb2eg",            // uid(): base36 time + random
  "side": "ally" | "enemy",
  "name": "Mook #2",
  "hpMax": 30, "hp": 30,
  "head": 4, "body": 4,            // CURRENT SP (armor ablates down)
  "headMax": 4, "bodyMax": 4,
  "init": 0,
  "weapons": [ /* see Weapon */ ],
  "ammoReserve": null | [ /* ammo tracker entries copied from the roster */ ],
  "injuries": ["Broken Ribs"],     // critical injury names (CRIT_BODY / CRIT_HEAD)
  "conditions": [ { "name": "Stunned", "rounds": 2 } ],   // rounds counts down in endOfTurnUpkeep
  "loc": "body" | "head",          // manual-damage target
  "armorMode": "full" | "half" | "ignore", "ablate": 1 | 2, "ignoreBelow": null | number,
  "note": "", "lastHit": "",       // lastHit = last damage line, shown on the card
  // death saves (opt-in per combatant)
  "trackDeath": false, "body_stat": 5, "deathSaves": 0, "deathResult": "",
  // combat number: one base for attacks AND dodges; ncn for non-combat skill checks
  "cn": 10, "useCN": true, "ncn": 8, "ncnAuto": true, "checkResult": "",
  "canDodge": false, "dodgeBase": 0,
  "onFire": false,
  // cover / vehicles
  "isCover": false,                // objects (and vehicles) — excluded from turn order
  "behindCoverId": null,           // id of the cover/vehicle this combatant is behind or inside
  "isVehicle": false, "vehicleId": null, "seatRole": null /* driver|gunner|passenger */,
  "mountedWeapons": [], "vehicleSeats": 4,
  // map placement (null/undefined = not on the grid)
  "gridX": 3, "gridY": 1, "gridW": 1, "gridH": 1,
  // roster-linked only
  "rosterId": "…", "charStats": {…}, "skills": {…}, "skillMisc": {…}, "roles": […],
  "combatAwareness": { /* Solo abilities */ }
}
```

**Weapon** (`WEAPONS` catalog entry copied by `weaponFromCatalog`):
`{id, name, skill, dmg:"3d6", mag, ammo, rangeRow, rof, hitBonus, dmgBonus, armorMode, ignoreBelow, apDefault,
melee, autoMult, autoRow, areaMode, ammoType, reloadActions, reloading, jammed?, quality?, attachments?}`.
`rangeRow` selects a row of the `RANGE.single` DV table; `autoMult/autoRow` enable autofire; `areaMode`
(`'shell'`, blast) marks area weapons; a weapon with no `rangeRow` and no `mag` is treated as melee.

## Roster character (`roster[]`)

Created by `blankChar()`; lots more is added by the per-role sheets.

`{id, name, handle, role, roles:[{role, rank, data}], stats:{int,ref,dex,tech,cool,will,luck,move,body,emp},
skills:{…}, skillMisc, hpMax, currentHP?, headSP/headSPMax, bodySP/bodySPMax, headArmor/bodyArmor,
humanity*, weapons[], ammo[], tools[], wardrobe[], misc[], cyberware, gear, notes, cn/useCN/ncn, canDodge, dodgeBase,
trackDeath, body_stat, side, ip, eurodollars, archive, images[], injuries[], conditions[]}`

- `HP` formula: `10 + 5·ceil((BODY+WILL)/2)` (`calcHP`).
- **Roster ↔ combat is a copy, not a link.** `addRosterToCombat` copies a character into a combatant (keeps
  `rosterId`). `writeBack(combatId)` copies HP, SP, weapons/ammo, injuries, conditions and Solo state back.
  Until you write back, combat damage does not touch the sheet.

## IP / Eb ledger (`roster[].archive`)

A character's money and improvement points are **derived from a ledger**, not stored as a number:
`archive = {gigs:[{name, ip, eb, session}], improvements:[{name, cost, session}], purchases:[{name, cost, notes, session}], dtd:[…], notes, curSession}`.
`csComputeEb` = Σ `gigs.eb` + Σ `dtd.eb` (hustles) − Σ `purchases.cost`; `csComputeIP` = Σ `gigs.ip` − Σ `improvements.cost`.
`roster[].ip` / `.eurodollars` are cached copies refreshed on save. **Encounter rewards append a `gigs` entry** via
`awardToRoster()` and refresh the cache — never write to `ip`/`eurodollars` directly, they would be overwritten the next time the sheet is saved.
If that character's sheet is open, `awardToRoster` also pushes to the sheet's in-memory ledger so the save doesn't drop the award.

## Other records

- **Vehicle** `{id,name,type,cat,sdp,sdpMax,sp,seats,move,speed,cost,upgrades[],mountedWeapons[],notes,owner}`.
  `deployVehicle` turns it into a cover+vehicle combatant (SDP is its `hp`).
- **Gig** `{id,name,payout,fixer,notes,participants[],status:'active'|'done',created,completed}` — `participants`
  are roster ids; one entry is shared by every linked character.
- **Architecture** `{id,name,difficulty,floors:[{type,dv,ice,demon,notes,cleared,rez,rezMax}],currentFloor,notes,
  owner,runnerId,netActionsUsed,programStates}`.

## Backup / Save-Load formats

| Format | Produced by | Restore | Includes |
|---|---|---|---|
| **Full backup** `{app:"cpred_full_backup", …}` | `buildBackupData` (file download + cloud sync) | `applyBackupData` — *replaces* everything | combatants, notes, round/active, log, roster, vehicles, architectures, gigs, tokenStyle, sortMode, theaterMode, map, encounter |
| **Save text** `{app:"cpred", v:6, …}` | Tools → Save / Load | `applyLoad` — replaces the encounter, **merges** roster/vehicles/architectures/gigs by name | same minus tokenStyle/sort/theater (includes map and encounter) |
| **Roster export** `{app:"cpred_roster", roster:[…]}` | CHARS → export | `applyRosterImport` — merge by name, skips duplicates | characters only (see `test-character.json`) |
| **Vehicle export** `{app:"cpred_vehicles", …}` | vehicle sheet | `applyVehicleImport` | vehicles only |

Not in any backup: the Gist token, Gist bookkeeping keys, the theme, undo history.

## Cloud sync (GitHub Gist)

- Uploads the full backup to a **secret** gist (`cpred-backup.json`). Secret ≠ private: anyone with the URL can read
  it, and a personal access token with `gist` scope is stored in localStorage. Don't put anything in the app you
  couldn't tolerate leaking, or keep the roleplay lore in a separate private repo.
- `scheduleAutoSync` debounces: 8 s after the last change, or at most ~20 s into a continuous burst.
- **Conflict guard** (`doGistUpload`): before uploading it fetches the gist's latest revision and compares it to
  `cpred_gist_known_version`. If another device pushed something this one hasn't pulled, it refuses
  (`conflict` state) instead of overwriting. `force` skips the guard.
- Restoring (`cloudSyncLoad`) goes through `applyBackupData` and passes `skipAutoSync` so a pull isn't re-pushed.
