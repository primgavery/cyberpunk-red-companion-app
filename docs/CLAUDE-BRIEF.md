# The DOCS tab: Claude brief & campaign log

The fourth tab (**DOCS**) exists for one purpose: so Claude can write encounters that **port straight into the app**, and so you
don't have to keep retelling the story.

## The brief

**DOCS → Brief for Claude → COPY BRIEF** puts one Markdown document on your clipboard (or **DOWNLOAD** for a `.md`). Paste it into a
Claude chat once, then just ask for fights: *"Make a hard Valentinos ambush in the Parking Lot for my party."* Claude answers with a JSON block;
paste that into **🛠 Tools → Import encounter**.

### What is in it
| Section | Source |
|---|---|
| Task + output rules | static text |
| Enemy fields table | `ENC_FIELDS` (the single source — see below) |
| Stat templates, weapons, armor, ammo, scenes | **generated live** from `NPC_LIB`, `WEAPONS`, `ARMOR_CATALOG`, `AMMO`, `GRID_PRESETS` |
| "How hard does a weapon hit" | computed: average damage and expected HP through SP 4/7/11/13 (`advDamage`) |
| AI behaviour | `AI_PROFILES` + the `ai` keys |
| Reward guidance | `REWARD_TABLE` |
| **My party** (optional) | roster: name, role(s), HP, head/body SP, REF, MOVE, BODY, weapons |
| **The story so far** (optional) | the last 5/10/20/50 campaign-log entries |
| A worked example (optional) | `EXAMPLE_ENCOUNTERS[0]` |

Nothing is sent anywhere by the app. It builds text; **you** copy it and choose where to paste it. The Gist token and storage keys are never
included (a test checks this). Untick *Include my party* if you don't want character names in a chat.

### Why it can't go stale
The tables are built from the very catalogs the importer validates names against. `tests/brief.js` proves it for every entry:
- every weapon / armor / template / ammo type / scene named in the brief imports with **no warnings**;
- a "kitchen-sink" encounter built **from the field table itself** imports clean and each field has its documented effect;
- the JSON blocks inside the brief (the skeleton and the worked example) parse and import.

So: add a weapon to `WEAPONS` and it appears in the next brief automatically. **Add a new importer field?** Add it to `ENC_FIELDS` with an
example; the test then fails until `importEncounter` honours it (extend the `checks` in `tests/brief.js`). The brief and the importer cannot drift
silently.

Size: about **2.2k tokens** bare and about **2.8k** with a one-character party, ten log entries and the worked example (grows with party size and log length). The tab shows a live estimate (`characters ÷ 4`).

### Reference tables
Under **Reference** the same data is shown as collapsible tables (fields, templates, weapons, damage vs armor, armor, ammo, scenes, AI behaviour,
reward defaults) so you can read what Claude will be told.

## The campaign log

A short, persistent, newest-first list of text entries — your own session notes, so you stop re-explaining the story.

- **Add**: type and press Enter (or ADD). Chips pre-fill a prefix: *Session* (auto-numbered "Session 3 — "), *Scene*, *NPC*, *Loot*, *Lead*, *Downtime*.
- **✎ Recap this fight** writes the recap *for you* into the box (edit it, then ADD). Example:
  `Maelstrom Ambush — 3 rounds. Defeated: Maelstrom Booster ×3, Maelstrom Reaver. Party: Test Runner 12/30 HP. Notable: ☠ …. Paid: 150 eb total (split) · 6 IP each → Test Runner.`
  It works after you've cleared the dead, because defeated enemies' names are remembered (`activeEncounter.names`).
- **Automatic**: paying rewards (Tools → Encounter rewards → AWARD) appends an `encounter` entry with the recap and the payout. Delete or edit it if you don't want it.
- **✎ / ✕** edit or delete an entry. **COPY LOG** copies all of it as Markdown.
- Entries are capped at 600 characters, the log at 500 entries (oldest drop). Text is escaped (HTML in an entry is shown, not run).

### Data
`sessionLog = [{id, at (ISO time), kind: 'note'|'session'|'encounter', text}]`, key `cpred_sessionlog`. It travels in the **full backup / cloud sync**
(`sessionLog`) and in **Save/Load text**, where loading **merges by id** instead of replacing — a stale save can't wipe newer entries.
The brief option choices (party/log/example/N) are in `cpred_briefopts`.

### Why not just use Notes?
The older Tools → Notes is free-form titled notes. The log is chronological, short, auto-written for fights, and fed to Claude; the two are separate on purpose.

## Typical session loop
1. Before: **Copy brief** → paste into Claude → ask for tonight's fight → paste the JSON into **Import encounter**. (Or use one of the five built-in examples.)
2. During: play it; on an NPC's turn the **turn advisor** ([TURN-ADVISOR.md](TURN-ADVISOR.md)) suggests the move.
3. After: **Encounter rewards → AWARD**; the recap is logged. Add a line or two of story.
4. Next time: the brief carries the log, so Claude knows what happened.

## For developers
- Code: search `DOCS TAB, CLAUDE BRIEF & CAMPAIGN LOG` in `index.html` (`buildClaudeBrief`, `docsData`, `renderDocs`, `logAdd`, `logCompose`).
- IDs: the log uses `clog*` because the Dice tab already owns `#logList` (the combat log) — `getElementById` silently returns the first match, which is exactly
  the bug a duplicate-id regression test now guards against. Prefix new IDs.
- Tests: `node tests/brief.js` (brief validity, DOCS tab UI, log add/edit/delete/persist, recap, auto-log on payout, backup/merge).
