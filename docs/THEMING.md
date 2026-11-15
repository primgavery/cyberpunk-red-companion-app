# Themes & visual design

Pick a theme in **🛠 Tools → Display → Theme**. It is saved on the device (`cpred_theme`) and is *not* part of backups
or cloud sync — a phone and a tablet can look different.

| Theme | Look | Notes |
|---|---|---|
| **Slate** (default) | Clean dark, soft blue accent | Modern layer |
| **Paper** | Light, high contrast | Modern layer; for bright rooms |
| **Ember** | Warm dark, orange accent | Modern layer |
| **Neon** | The original black / cyan / red, mono type, all-caps labels | "Classic": the modern layer is **off**; pixel-identical to the pre-theme app on every screen except the map (which also got the canvas-fit fix) |

## How it works

A theme is a set of CSS variables. Two attributes on `<html>` select it:

- `data-theme` = `slate | paper | ember | neon` — picks the palette (`html[data-theme="slate"]{…}` blocks in the stylesheet).
- `data-ui` = `modern | classic` — `modern` switches on the shared **modern layer**: every rule written
  `html[data-ui="modern"] …` (system sans type, no letter-spacing, soft radii, flat surfaces, one accent colour, SVG icons).
  Neon is `classic`, so none of those rules apply and it renders exactly as the app always did.

Both attributes are set **before first paint** by a tiny inline script in `<head>` (so there is no flash of the wrong
theme), and again by `setTheme(id)` when the user picks one. An unknown stored value falls back to Slate.

> The theme id list exists in **two** places that must stay in sync: the `THEMES` array (registry + picker) and the
> whitelist in the `<head>` script (`["slate","paper","ember","neon"]`). `tests/themes.js` parses the whitelist out of `index.html` and fails if it differs from `THEMES`.

### The variables (the "design tokens")

Defined in `:root` (= Neon) and overridden per theme. **Use these; never write a literal colour.**

| Token | Meaning |
|---|---|
| `--bg`, `--panel`, `--panel-2`, `--line`, `--nav-bg` | Page background, card surface, raised/inset surface, borders, bottom bar |
| `--text`, `--muted`, `--dim` | Primary text, secondary text, in-between |
| `--accent`, `--accent-rgb`, `--on-accent` | **Actions and selection**: primary buttons, active tab, focus. `--on-accent` is the text colour on top of it |
| `--focus` | Input focus border (Neon: cyan; modern: the accent) |
| `--red`, `--red-dim`, `--red-text`, `--red-rgb` | **Enemy / damage / danger.** `-text` is the readable variant for text on tinted backgrounds; `-rgb` ("255,43,61") is for `rgba(var(--red-rgb),.12)` tints |
| `--cyan`, `--cyan-dim`, `--cyan-rgb` | **Ally / info.** (The name is historical; in Slate it is teal.) |
| `--amber`, `--good` (+ `-rgb`) | Warning / active turn, success |
| `--ally-ring`, `--enemy-ring`, `--ally-token`, `--enemy-token` | **Canvas** colours (see below) |
| `--on-ally`, `--on-enemy`, `--ally-fill`, `--enemy-fill` | Text/fill for the initiative-strip dots (modern themes) |
| `--track`, `--card-shadow`, `--scrim` | HP-bar track, card elevation, modal backdrop (modern themes) |

**Semantics are fixed across themes**: red always means enemy/damage, cyan/teal always means ally, the accent is for things you
press. Don't use red for a primary button or the accent for an enemy.

### What a theme does *not* change

- **The map art.** Floors, cover sprites and the dark "table" are drawn on a `<canvas>` with their own palette and stay the
  same in every theme (like the dark mat in most VTTs). Only the **token rings, token fills and measuring-tool colour**
  follow the theme, via `themeVar('--ally-ring')` etc. (CSS variables don't reach a canvas.)
- **Dice DV-band colours** (the red → gold → green scale on roll results) — they carry meaning.
- **Emoji inside content** (log lines, ☠ ⚔ 🔥 …). The *chrome* icons (nav, header) are SVG in modern themes.

## Rules for writing styles

1. **Colour = a variable.** If you need a tint of a brand colour use the `-rgb` channel: `rgba(var(--red-rgb),.12)`.
   A hard-coded hex is a bug in at least one theme (typically Paper, where dark-era greys become unreadable).
2. **Text on a tint** must be the `-text` or full-strength colour, not `--muted`.
3. **Canvas colours** go through `themeVar('--name')` — it caches per theme (`setTheme` clears the cache), so it is safe in the
   draw loop. Don't call `getComputedStyle` directly in `gridDraw`.
4. Anything that changes the *look* of every theme goes in the modern layer (`html[data-ui="modern"] …`) — **not** in the base
   rules, or Neon changes.
5. A new surface that was hard-coded dark in the base CSS needs a one-line override in the modern layer (see the
   `surfaces that were hard-coded for a dark UI` block).
6. **Layout-driven canvas size.** The map canvas is a flex item; a `ResizeObserver` (set up in `gridBindEvents`) refits its
   pixel buffer whenever the layout changes. Don't size it with fixed attributes.

## Adding a theme

1. Add a `html[data-theme="mytheme"]{…}` block copying the variable list from Slate (every token above).
2. Add it to `THEMES` (id, name, description, 5 swatch colours) **and** to the whitelist in the `<head>` script.
3. Run `node tests/themes.js`. Its contrast audit must pass at AA (4.5:1) — if it fails it names the screen, the element and the
   ratio, e.g. `list: 3.2 span.badge "▨ COVER"`. Adjust the palette (usually `--muted`, the `-text` colours, or tint strength).
4. Look at it: `node tests/visual-tour.js mytheme mytheme` then open the PNGs in `tests/.shots/`.
5. Mention it in the table at the top of this file.

## Tools for changing the look safely

| Tool | What it does |
|---|---|
| `node tests/themes.js` | Applies every theme, checks persistence/fallback/no-flash, and runs a **WCAG contrast audit** over 15 screens (≈380 text elements per theme): modern themes must be ≥ 4.5:1 everywhere, Neon ≥ 3:1. |
| `tests/contrast-lib.js` | The audit itself (runs in the page). It composites translucent layers up the tree to find the real background, then reports ratio, selector and text — reuse it for any new screen. |
| `node tests/visual-tour.js <label> [theme]` | Phone-size screenshots of 7 screens into `tests/.shots/` (git-ignored). Deterministic. |
| `python3 tests/imgdiff.py <a> <b>` | % of differing pixels per screen between two tours. Use it to **prove a refactor changed nothing**: tour the old build (`APP=file:///tmp/old.html node tests/visual-tour.js before`), tour the new one, diff. That is how the Neon theme was kept identical while ~70 hard-coded colours were turned into variables. |

## History / why it is built this way

The original UI was a single neon theme with ~70 hard-coded brand-colour tints, monospace type and letter-spaced
all-caps labels everywhere. Rather than restyle in place (which would have been unreviewable and unrevertable), the colours
were first converted to variables with **zero pixel change** (verified by `imgdiff`), and *then* new palettes and a separate
modern layer were added on top. Neon remains selectable and is pixel-identical to the old look (the one deliberate difference is the map, which now also benefits from the canvas-fit fix).

Design direction for the modern layer — modelled on what the popular VTTs (Foundry, Owlbear Rodeo, Roll20 dark) share:
neutral surfaces, **one** accent colour, system sans type with tabular numerals, sentence-weight labels instead of
shouting caps, soft 10–12 px radii and subtle borders instead of glows, and meaning carried by colour *and* position/label.

## Known gaps / ideas

- Button and label **text is still ALL-CAPS** (literal strings in the markup); a sentence-case pass would need touching the strings, not CSS.
- Emoji used as section headings (💰 Gigs, 🛠 …) are still colourful in the modern themes.
- The attack modal lists *every* cover object as a target in list mode (pre-existing); it should prefer cover that actually shields the chosen enemy.
- No "follow system dark/light" option yet (`prefers-color-scheme` could pick Slate/Paper when no theme is stored).
- Neon's own two near-misses on contrast (`gi-dot` white-on-blue 3.3:1, the AWARD button 3.7:1) are original-design issues left untouched.
