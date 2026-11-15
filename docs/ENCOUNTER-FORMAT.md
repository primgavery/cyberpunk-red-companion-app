# Encounter files & rewards

An **encounter file** describes a fight in JSON. Paste it in with **🛠 Tools → Import encounter** and the app builds
the enemies, loads the map, and remembers the rewards. It is the bridge between planning a fight in chat and playing
it in the app: ask Claude (or write it yourself), paste the result, play.

Five ready-made examples are built in (tap one in the import screen to fill the box): *Maelstrom Ambush*,
*Tyger Claws Shakedown*, *Corpo Lobby Breach*, *Nomad Highway Raid*, *Cyberpsycho in the Combat Zone*.

## Format

```jsonc
{
  "app": "cpred_encounter",          // optional, but if present it must be this
  "v": 1,
  "name": "Maelstrom Ambush",        // shown in the log and on the rewards screen; also the ledger entry name
  "summary": "One or two lines for the GM.",
  "scene": "Alleyway",               // optional map preset (see list below). Loaded on Replace only
  "enemies": [ /* NPC */ ],          // required (or "allies")
  "allies":  [ /* NPC */ ],          // optional — same shape, spawn on the party's side
  "rewards": {                       // optional
    "eb": 150, "ip": 6, "notes": "Stolen cyberware worth fencing.",
    "bonuses": [ { "label": "Captured the Reaver alive", "eb": 100, "ip": 2 } ]
  }
}
```

### NPC

Everything except `template` (or `tier`) is optional; unspecified stats come from the template.

| Field | Meaning |
|---|---|
| `template` | Stat block from the NPC library: `Mook`, `LT`, `Light Mini Boss`, `Heavy Mini Boss`, `Light Boss`, `Heavy Boss`. An unknown name falls back to the `tier`'s template, else Mook (with a warning) |
| `tier` | `STANDARD` \| `MINI BOSS` \| `BOSS` \| `VEHICLE` — picks a template if none is given, and sets the **reward tier** |
| `name` | Display name. Duplicates are numbered automatically (`Booster`, `Booster #2`, …) |
| `qty` | How many (1–20; 40 combatants max per file) |
| `hp`, `sp`, `headSp`, `bodySp`, `cn`, `dodge`, `move`, `init` | Overrides. `cn` is the single combat number added to attacks and dodges; `move` is MOVE in squares |
| `armor` | A catalog armor name — `Leathers`, `Kevlar®`, `Light Armorjack`, `Medium Armorjack`, `Heavy Armorjack`, `Flak`, `Metalgear`, … — sets head and body SP |
| `weapons` | Up to 6. A name from the catalog (`Medium Pistol`, `Heavy Pistol`, `Very Heavy Pistol`, `SMG`, `Heavy SMG`, `Shotgun`, `Assault Rifle`, `Sniper Rifle`, `Grenade Launcher`, `Rocket Launcher`, `Light Melee`, `Medium Melee`, `Heavy Melee`, `Very Heavy Melee`, `Bow / Crossbow`) **or** an object `{ "name", "dmg": "3d6", "rangeRow", "mag", "rof", "skill", "melee" }` for something custom |
| `ammo` | Ammo type for the ranged weapons: `basic`, `ap`, `rubber`, `incendiary`, `expansive`, `smart`, `poison`, `biotoxin`, `sleep`, `flashbang`, `teargas`, `emp` |
| `vehicle` | `{ "name", "type", "sdp", "sp", "seats", "move" }` — spawns a vehicle (as cover); the first of the group is the driver, the rest passengers |
| `ai` | Behaviour — see below |
| `note` | Free text shown on the card (loot, tells, secrets) |

### AI behaviour

```jsonc
"ai": { "profile": "cautious", "stayInCoverUntil": "flanked", "retreatAtHpPct": 40,
        "focus": "nearest", "preferRange": [6, 25], "notes": "Barks orders from behind the dumpsters." }
```

Today this is a **brief for whoever runs the enemy** — it is rendered as a 🧠 line at the top of the combatant's note
and kept on the combatant as `ai`. The fields match the plan in [ENEMY-AI-NOTES.md](ENEMY-AI-NOTES.md), so when
enemies start acting on their own, existing encounter files will already carry the instructions. `profile` and `notes` are
free text; unknown keys are ignored.

### Scenes (the `scene` field)

`Parking Lot`, `Office Floor`, `Convenience Store`, `Street Shootout`, `Alleyway`, `Warehouse`, `Apartment Floor`,
`Restaurant`, `Bar / Club`, `Bank`, `Rooftop`, `Corpo Lobby`, `Subway Platform`, `Combat Zone`, `Ripperdoc Clinic`.
Matching ignores case and punctuation. An unknown scene is a warning, not an error.

## Replace vs Add

The import screen has a **Replace the current encounter** box (on by default).

- **Replace**: clears the current fight, loads the map scene, places the new tokens, starts a fresh reward record. **Undo** restores the previous combatants and cover, but not the map size/floor or the reward record.
- **Add**: keeps everything and adds the new combatants; the scene is *not* loaded (it would wipe the current cover), and the
  file's rewards are added to any unclaimed ones.

## Problems are reported, not fatal

A bad weapon name, unknown armor/template/scene/ammo, or an out-of-range number produces a note ("Unknown weapon "X" —
skipped") and the rest of the encounter still loads. Only a file that isn't an encounter at all (not JSON, wrong `app`,
no enemies, more than 40 combatants) is rejected. Numbers are clamped to sane ranges.

## Rewards

**🛠 Tools → Encounter rewards (EB / IP)** (it also works for fights you built by hand).

1. **Defeated** enemies are counted by tier (`STANDARD`, `MINI BOSS`, `BOSS`, `VEHICLE`). Enemies are remembered when you
   clear them, so you can *Clear dead enemies* first and claim rewards afterwards.
2. **Suggestion** = the sum of `REWARD_TABLE` for what was defeated:

   | Tier | EB | IP |
   |---|---|---|
   | STANDARD | 25 | 3 |
   | MINI BOSS | 100 | 8 |
   | BOSS | 250 | 15 |
   | VEHICLE | 40 | 4 |

   > These are **house defaults, not rulebook values** — they exist so you get a sensible starting number. Change them in
   > `REWARD_TABLE` (one line each) or just overwrite the amount on the screen.
3. If the file carried `rewards`, that is shown beside the suggestion and used as the starting amount; one tap switches
   between them. Ticking a **bonus** adds it once.
4. Choose **who is paid** (characters in the fight are pre-ticked) and how EB is split: *evenly* (remainders go to the
   first character, so nothing is lost) or *everyone gets the full amount*. **IP is always per character.**
5. **AWARD** appends an entry `{name: <encounter name>, eb, ip, session}` to each character's IP/Eb ledger — the same
   list as the *Gigs* rows in the ledger on their sheet, so it shows up where you would have typed it, counts toward
   their cash and IP balances, and can be edited or deleted there. Their stored totals are recomputed immediately.

Defeated enemies and bonuses are marked as paid, so reopening the screen shows nothing new — you can't award the same
kills twice. (The ledger entry itself is the record: delete it on the sheet if you want to take a payout back.)

## Asking Claude to write one

Paste this into the chat once, then ask for encounters ("a 4-person Valentinos stakeout at a rooftop bar, medium difficulty"):

> Output encounters as a single JSON code block in the RED // Companion encounter format: `{"app":"cpred_encounter","v":1,
> "name","summary","scene","enemies":[...],"rewards":{"eb","ip","notes","bonuses":[{"label","eb","ip"}]}}`. Each enemy is
> `{"template":"Mook|LT|Light Mini Boss|Heavy Mini Boss|Light Boss|Heavy Boss","name","qty","weapons":[...],"armor","dodge",
> "ai":{"profile","stayInCoverUntil","retreatAtHpPct","focus","preferRange":[min,max],"notes"}}`. Use only these weapon names:
> Medium Pistol, Heavy Pistol, Very Heavy Pistol, SMG, Heavy SMG, Shotgun, Assault Rifle, Sniper Rifle, Grenade Launcher,
> Rocket Launcher, Light Melee, Medium Melee, Heavy Melee, Very Heavy Melee, Bow / Crossbow. Use only these scenes: Parking
> Lot, Office Floor, Convenience Store, Street Shootout, Alleyway, Warehouse, Apartment Floor, Restaurant, Bar / Club, Bank,
> Rooftop, Corpo Lobby, Subway Platform, Combat Zone, Ripperdoc Clinic. Everything is Cyberpunk RED.
