# cyberpunk-red-companion-app

**RED // Companion** — a phone-first table companion for *Cyberpunk RED*: combat tracker, battle map, dice,
character sheets, vehicles, gigs and netrunning in a single offline-capable web page.

**Live:** https://primgavery.github.io/cyberpunk-red-companion-app/

One static file (`index.html`), no build, no dependencies. Your data lives in your browser's localStorage; an
optional GitHub-Gist sync keeps devices in step.

## What it does

- **Combat tracker** — initiative and turn order, HP / head & body SP with ablation, conditions, death saves,
  critical injuries, burning, undo, combat log. Card view and a canvas **battle map** share the same data.
- **Full attack flow** — single shot, autofire, suppressive fire, blast/shell, aimed head/leg/held shots, ammo types,
  melee, mounted vehicle weapons, ramming; DV from range bands (or the map), dodge/opposed rolls, cover.
- **Battle map (VTT)** — tokens with portraits, 47 placeable objects drawn as top-down sprites, 15 ready-made scenes,
  line of sight, movement reach, measuring, area-of-effect aiming, **Theater of the Mind** mode for no-map play.
- **Characters** — character sheets with multi-role support, role tools (Solo combat awareness, Netrunner interface, Medtech medicine, Tech maker, Fixer, Lawman, Media, Exec, Rockerboy), 66+ skills, cyberware & Humanity, armor,
  weapons with attachments, ammo tracker, wardrobe, portraits, IP/Eb ledger, and a roster that copies into combat and
  writes HP/ammo/injuries back.
- **Vehicles, Gigs, Net Architectures** — deployable vehicles, a shared job log, and runnable netrunning scenes (ICE, demons, programs).
- **Encounters & rewards** — import a prepared fight as JSON (five Cyberpunk RED examples built in): enemies, gear, map scene and AI behaviour notes load in one step. Afterwards the app *suggests* EB and IP from what was defeated and pays it into each character's ledger.
- **Themes** — Slate (default), Paper (light), Ember (warm) and the original Neon, switchable in Tools → Display. All four are checked for readable contrast on every screen.
- **Dice, calculator, notes**, full-backup export, and cloud auto-sync with a conflict guard.

## For developers

| Doc | Read it for |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how the single file is organised, the attack pipeline, and the **gotchas** that cause bugs |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | every localStorage key, the combatant / character / vehicle shapes, backup formats, cloud sync |
| [docs/RULES-NOTES.md](docs/RULES-NOTES.md) | exactly which rules are implemented how — and the ❓ calls to confirm against your table's rules |
| [docs/ENCOUNTER-FORMAT.md](docs/ENCOUNTER-FORMAT.md) | the encounter file format, the rewards flow, and a prompt to have Claude write encounters for you |
| [docs/THEMING.md](docs/THEMING.md) | the theme system, design tokens, rules for styling, and the contrast/visual-diff tools |
| [docs/DEVELOPING.md](docs/DEVELOPING.md) | running, testing, and recipes (add a weapon / NPC / map scene / field) |
| [docs/ENEMY-AI-NOTES.md](docs/ENEMY-AI-NOTES.md) | groundwork and a build order for enemies that act on their own |

Tests (headless browser, needs Playwright): `node tests/regression.js`, `node tests/encounters.js`, `node tests/themes.js`, `node tests/fuzz-attacks.js`,
`node tests/monkey.js <seed> <clicks>`.

## Privacy

Everything stays on the device unless you turn on cloud sync. Sync uploads to a **secret** GitHub Gist (unlisted, not
access-controlled — anyone with the link can read it) and stores a personal access token in localStorage. Keep
anything you need to stay private (campaign lore, NPC secrets) out of the app and in a private repository.
