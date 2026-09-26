# UI kit

The look of every window and HUD piece, rebuilt from the source game's screenshots and trailer. The kit is CSS
tokens and components in `src/ui/kit/`. The style tile in `pages/ui-tile.html` shows it in use over the Wage Slave's
living room at 1920 × 1080, in English and Chinese. The game's panels (`src/ui/*.js`, `styles.css`) do not use the
kit yet; a later package migrates them one panel at a time (§10).

Sources are cited by name: `ss_01`…`ss_08` are `assets/targets/source/screenshots/`. `tNNN` is the trailer frame
at second NNN in `assets/targets/source/trailer/`, as in `docs/ART.md` (t018 = `shot_08_t018.167s.jpg`). Screenshot
boxes are `[x0, y0, x1, y1]` in 1080p pixels. Trailer boxes are file pixels; the game sits in the trailer frame at
0.90625 scale, so game = (file − (90, 9)) / 0.90625.

Every value below is labelled:

- **measured**: read off the source, with its sample box.
- **derived**: moved from a measurement for a stated reason, usually contrast, or a JPEG's chroma loss.
- **decided**: no measurement exists; the value is a choice.

Contents:

1. [How the kit is built](#1-how-the-kit-is-built)
2. [Colour](#2-colour)
3. [Type](#3-type)
4. [Space, sizes and layers](#4-space-sizes-and-layers)
5. [Components](#5-components)
6. [Motion](#6-motion)
7. [Hover, press and focus](#7-hover-press-and-focus)
8. [The style tile](#8-the-style-tile)
9. [Tests](#9-tests)
10. [Divergences, gaps and follow-ups](#10-divergences-gaps-and-follow-ups)

---

## 1. How the kit is built

| file | holds |
|---|---|
| `src/ui/kit/tokens.css` | every token: colour (palette, then per-component colours), type, 4 px spacing, radii, sizes, elevation, focus, motion, layers; Chinese overrides; reduced motion |
| `src/ui/kit/base.css` | the `.sl-root` scope, type roles (`.sl-t-*`), colour utilities, the focus ring, scrollbars, glyph sizing |
| `src/ui/kit/components.css` | panels, the station frame, section heads, buttons, tabs, chips, tags, badges, counts, tooltips, bars, rows, prices, key/value lists, toasts, modals |
| `src/ui/kit/inventory.css` | grids, cells, slots and their badges, states, cold storage, drop previews, the load line |
| `src/ui/kit/hud.css` | day bar and dial, navigation, floors, power and room rows, stats, objectives, quest card, toolbar, action queue, speed, wish, alerts, crisis banner |
| `src/ui/kit/kit.css` | imports the five files above in order; link this one |
| `src/ui/kit/glyphs.js` | 39 filled 24 × 24 glyphs (`glyph(name)` → `<svg>`, `currentColor`, `aria-hidden` unless labelled) |
| `src/ui/kit/slot.js` | slot geometry (`slotSize`, `iconBox`, `artAngle`, `freshness`) and builders (`gridElement`, `slotElement`) |
| `src/ui/kit/format.js` | quality text, weights, loads, footprints, money, clock, "Label: value" in both languages |
| `src/ui/kit/contrast.js` | WCAG luminance and contrast, alpha compositing, the AA threshold for a size and weight, CIELAB and `darkenToContrast` |
| `src/ui/kit/place.js` | `placeItemTip`: item tooltip placement beside its slot (§5.4) |
| `src/ui/kit/build.js` | thin element builders over the classes, for P1: `el`, `button`, `tag`, `bar`, `toast`, `closeButton`, `section`, `panel`, `frame` |
| `src/ui/kit/index.js` | re-exports the script modules |

Conventions:

- **Scope.** Tokens sit on `:root`. Everything else is scoped to `.sl-root`, and every class starts with `sl-`, so
  the kit loads beside `styles.css` without touching the current panels (they own `.win`, `.topbar`, `--panel`…).
  Put `class="sl-root"` and a `lang` attribute on the root that should use it.
- **Names.** `sl-block`, `sl-block__part`, `sl-block--variant`.
- **States.** A state has two spellings. The pseudo-class (`:hover`, `:active`, `:focus-visible`, `:disabled`) is
  what users trigger. A mirror class (`.is-hover`, `.is-active`, `.is-focus`, `.is-disabled`) lets the tile and
  tests show a state without a pointer. Semantic state goes in ARIA and HTML attributes: `aria-selected` on tabs,
  `aria-pressed` on the speed buttons, `aria-current` on the floor you're on, and `disabled`.
- **Tokens first.** Components read colours only from `tokens.css`, and a test fails on any raw colour in
  `base.css`, `components.css`, `inventory.css` or `hud.css`. The palette (§2.1–§2.4) comes first; after it,
  "component colours" hold each component's own gradient stops, shadows and scrims, named by rule and property
  (`--ui-btn-primary-bg`, `--ui-daybar-before-bg`), so a look changes in one file.
- **Sim boundary.** Nothing in the kit imports game state. `slot.js` takes plain values (footprint, extent,
  servings, freshness), so a renderer can build slots from the view model.

---

## 2. Colour

### 2.1 The twelve tokens of ART.md §8 (measured)

ART.md measured these on the source; the kit keeps their names and values, and a test fails if either drifts (§9).
`--ui-secondary` has two measured values, so the lighter one is `--ui-secondary-light`.

| token | value | used for |
|---|---|---|
| `--ui-panel` | `#232522` | the panel colour as composited over the scene. The kit's `--ui-panel-bg` produces it (§2.5) |
| `--ui-text` | `#e1e1df` | running text on panels |
| `--ui-confirm` | `#328a33` | the large "Confirm Purchase" face (ss_03). White on it is 4.22 : 1, which passes for large text only, so the face is reserved for `--lg` buttons (§5.2) |
| `--ui-buy` | `#64923e` | the **hovered** Buy button (ss_01's first row, under the cursor; `measure_ui.py` reads `#668e40`). The five resting Buys measure `#5d823b`–`#5d833b`. White on `--ui-buy` is 3.8 : 1, so the kit's Buy faces sit lower at the same hue (§2.3, §5.2) |
| `--ui-stat-good` | `#4c7642` | stat bar fill |
| `--ui-gold` | `#e3c761` | prices, money, gold labels, current floor (9.28 : 1 on the panel) |
| `--ui-objective` | `#8c862f` | the "Complete Preparations" label, 3.79 : 1 on its face: large text only |
| `--ui-primary` | `#f8ad34` | orange primary button (CANCEL COOKBOOK, ss_08), section heads, the cooking bar |
| `--ui-secondary` / `--ui-secondary-light` | `#e8ae06` / `#fdcc2d` | the yellow Checkout gradient (t018) |
| `--ui-danger` | `#ac3b2a` | danger buttons, the overweight bar, expired freshness |
| `--ui-danger-badge` | `#6b0102` | "Encumbered", the expired status badge |
| `--ui-info` | `#69c5e4` | clock digits, info toasts |

### 2.2 Measured on the source

`docs/art/ui/measure_ui.py` measures every box below and writes `docs/art/ui/measurements.json` (the spec checks
that each quoted box and colour is there). A fill is the median of the box; text is the median of the brightest 20 %
of its glyph pixels (the stroke cores). Boxes are `[x0,y0,x1,y1]` in game pixels, or in file pixels for trailer
frames. The script's Buy-button, panel-alpha, frosted-frame and grid-pitch methods come from builder A's.

| token | value | sample |
|---|---|---|
| `--ui-text-strong` | `#f4f6f3` | ss_01 "Inventory" title `[382,145,499,168]` |
| `--ui-gold-pale` | `#ffe8ad` | ss_07 active tab label "Inventory" `[370,252,470,278]` |
| `--ui-gold-deep` | `#d79e02` | ss_07 load bar `[300,327,820,334]` |
| `--ui-amber` | `#fbbb09` | ss_07 crafted item "Spike Barrier Supply Box*1" `[968,558,1180,576]` |
| `--ui-fresh` | `#71ae72` | ss_01 freshness bar under the flour sack `[400,716,570,719]` |
| `--ui-success` | `#87e18e` | ss_07 "Crafting Complete" `[1085,520,1270,545]` |
| `--ui-online` | `#5ed67f` | ss_02 current-floor dot `[1878,596,1888,604]` |
| `--ui-xp` | `#68b4fa` | ss_07 "Gained 70 XP." `[968,582,1066,600]` |
| `--ui-alert` | `#d73041` | ss_02 Front Door hit-point bar `[145,136,225,147]` |
| `--ui-stat-warn` | `#877524` | ss_02 Stamina fill `[1640,972,1660,1002]` |
| `--ui-cold-cell` | `#12273a` | ss_08 empty freezer cell `[496,422,536,464]` |
| `--ui-tag-must` | `#743a2a` | t018 "Must Buy" tag `[1215,300,1230,320]` (file px) |
| `--ui-track` | `#121619` | ss_01 load bar track `[900,208,935,213]` |
| `--ui-thumb` | `#555654` | ss_01 shop scrollbar thumb `[1534,220,1540,400]` |
| `--ui-tab-on-bg` | `#2b271c` | ss_07 active tab face `[300,250,340,280]` |
| `--ui-gold-chip` | `#4f4112` | ss_02 "Pick One" chip `[777,992,783,1018]` |
| `--ui-cell-top` → `--ui-cell-bottom` | `#0d0e11` → `#1a1b1f` | ss_01 empty cell, column x 900, y 656 → 718 (median `#17181c` in `[880,690,920,730]`) |
| `--ui-slot-top` → `--ui-slot-bottom` | `#25292c` → `#2d3134` | ss_01 crate slot, column x 400, y 244 → 428. Slots and cells lighten toward the foot |
| `--ui-slot-edge` | `#3c4044` | ss_01 slot border `[384,300,386,420]` → `#3e4244` |
| `--ui-grid-line` | `#2d2e30` | ss_01 gap between empty cells at y 690, x 870–871: `#3a3b3d` / `#2f3032` beside `#0f1012` |

Also measured, used inside one component, and cited there:

- Disabled button: face `#2c2d31` in ss_01 `[420,880,560,905]`, label `#7e7f81` in `[607,903,714,923]`.
- Shop row hover `#31332f`, from ss_01 `[1240,190,1400,210]`. The kit's `--ui-row-hover` composites to `#2f312e`.
- Pressed speed button: face `#433a18` in ss_02 `[468,1008,480,1048]`, glyph `#f3cc32`.
- Rich tooltip face `#191d20`, from t014 `[740,640,760,700]`.
- Day counter `#e4e5e3`, from ss_02 `[1545,50,1710,98]`.
- Loop pill face `#2a2c27`, from the ss_02 column x 1612, y 113–128.
- Power row label `#a1acb5`, from ss_06 "Grid Power".
- Navigation label `#8e8f8b`, from ss_02 "Log" and "Tactics".

### 2.3 Derived

| token | value | measured | why it moved |
|---|---|---|---|
| `--ui-text-dim` | `#9c9e9a` | `#888b87`–`#909290`: ss_01 "Remaining: 3", "Load:", "0.20kg [1x1]", tip line | At the measured value, dim text on a hovered row (`#2f312e`) is 4.09 : 1. At `#9c9e9a` it is 4.86 : 1 there and 5.72 : 1 on the panel. The cores also read a little dark, since JPEG blurs thin strokes into the background |
| `--ui-text-faint` | `#6d6f6b` | `#575858`–`#5d5d5d`: ss_03 "Items Owned", "2 remaining", "Return" | Used only for disabled labels (exempt from AA, §2.6). Never for information: 3.04 : 1 |
| `--ui-text-on-light` | `#2a1c05` | `#070403` (ss_08 CANCEL COOKBOOK) to `#573500` (t018 Checkout) | One dark brown for text on orange and yellow faces: 8.70 : 1 on `--ui-primary`. The yellow secondary face keeps its own `#4a2e00` (7.25 : 1) |
| `--ui-positive` | `#b8ebb2` | `#c1eabc`–`#c6efc2`: ss_03 spec values "Auto", "30 W" | Small coloured text is a lower bound on saturation (ART.md §8, 4:2:0 JPEG), so the kit keeps the lightness at a little more chroma |
| `--ui-chilled` | `#86983f` | `#8e9e41`: ss_08 status badge `[474,298,489,312]`, the white price tag excluded | The white price tag on the measured green is 2.95 : 1; a little darker it is 3.19 : 1 (3 : 1 for graphics) |
| `--ui-buy-face` | `#5b813a` | `--ui-buy-rest` `#5d833b`: the resting Buy face, ss_01 rows 2–6 | White on the rest green is 4.43 : 1. `darkenToContrast` (after builder A) lowers L* by 0.6 at the same hue, to 4.52 : 1. It is the hovered Buy's label backing; the resting face sits 4 L* lower (§5.2) |
| `--ui-tag-must-text` | `#f6c2ad` | `#dca08b`: t018 "Must Buy" label | 3.97 : 1 on the tag at the measured value; 5.56 : 1 here |
| `--ui-danger-text` | `#f0715f` | from `--ui-danger` | Red text on the panel ("Sold out", an over-limit load): 5.32 : 1, where `--ui-danger` itself would be 2.6 : 1 |
| `--ui-panel-bg` | `rgb(33 36 32 / 0.9)` | from `--ui-panel` | See §2.5 |

### 2.4 Decided

| token | value | for |
|---|---|---|
| `--ui-stat-sat` `--ui-stat-mor` `--ui-stat-sta` `--ui-stat-life` | `#d9835f` `#eaa6bb` `#f3d23c` `#e25454` | Stat icon tints, after the source's icons: brown-orange drumstick, pink brain, yellow bolt, red shield (ss_02). The icons are too small to measure |
| `--ui-stat-bad` | `#8e2a22` | Stat fill when a stat is critical |
| `--ui-expiring` | `#d9a53a` | The expiring status badge and freshness bar, between gold and danger |
| `--ui-panel-solid` | `#1d1f1c` | Opaque panels: modals, tooltips over busy art |
| `--ui-focus` | `= --ui-gold-pale` | The keyboard focus ring (§7) |

### 2.5 Surfaces and translucency

The source's panels are translucent. ART.md points out that the cooking panel in ss_08 reads brown over a warm
room, and the ss_01 panel shows faint shelf edges through it. Two estimates of the opacity:

- A regression of panel edges against the scene behind them in ss_01 gives α 0.92–0.97, with a weak fit (r 0.58).
- The shelves showing through give α 0.85–0.90.

The kit takes **α 0.90 with base `rgb(33 36 32)`**. That composites to exactly `--ui-panel` (#232522) over a scene
of sRGB 55, the median of the source's scenes behind panels. `pages/ui-tile/backdrop.json` records the tile
backdrop's luma: p50 59, p90 93. The alpha also keeps the contrast margins on any plausible backdrop:

| scene behind the panel (sRGB grey) | 0 | 55 | 120 | 200 | 255 |
|---|---|---|---|---|---|
| composited panel | `#1e201d` | `#232622` | `#2a2c29` | `#323431` | `#373a36` |
| `--ui-text` contrast | 12.5 | 11.7 | 10.8 | 9.6 | 8.8 |
| `--ui-text-dim` contrast | 6.1 | 5.7 | 5.2 | 4.7 | 4.3 |

Dim text stays at or above 4.5 : 1 up to a scene of sRGB 220. That covers every diffuse band of ART.md §7.1 up to
its p90; the brightest, tiles, is 126. Only specular metal and glass go brighter (p90 232 and 195). Surface tokens:

| token | value | label | for |
|---|---|---|---|
| `--ui-panel-bg` | `rgb(33 36 32 / 0.9)` | derived | windows |
| `--ui-panel-solid` | `#1d1f1c` | decided | modals |
| `--ui-panel-sunk` | `rgb(10 11 10 / 0.55)` | decided | wells inside a panel (the cooking view) |
| `--ui-panel-edge` | `rgb(255 255 255 / 0.08)` | decided | 1 px panel border |
| `--ui-line` | `rgb(255 255 255 / 0.07)` | decided | row separators, rules |
| `--ui-row-hover` | `rgb(255 255 255 / 0.055)` | measured (`#31332f`, ss_01) | hovered row |
| `--ui-row-selected` | `rgb(227 199 97 / 0.1)` | decided | selected row, with a 3 px gold left edge |
| `--ui-hud-bg-strong` | `rgb(24 25 22 / 0.9)` | measured (chip faces `#1b1d18`–`#21201b`, ss_02 / 04 / 05) | chips, HUD rows |
| `--ui-hud-edge` | `rgb(255 255 255 / 0.16)` | measured (chip hairlines ≈ 17 % white, ss_04 / 05) | chip borders |
| `--ui-scrim` | `rgb(0 0 0 / 0.62)` | decided (§5.9) | behind a modal |
| `--ui-control` / `-deep` / `-edge` | `#393b36` / `#252722` / `#4a4c46` | decided | neutral button face |
| `--ui-badge-bg` | `rgb(0 0 0 / 0.85)` | decided (after ss_01's black "7/7" pill) | servings pill |
| `--ui-cold-edge` | `#1e3b56` | decided | cold cell border |
| `--ui-slot-edge-hover` | `#7b7f82` | decided | hovered slot border |

### 2.6 The contrast rule

- Text meets **WCAG 2.x AA against the colour actually composited under it**: 4.5 : 1 for normal text and 3 : 1 for
  large text, which is ≥ 24 px, or ≥ 18.66 px at weight ≥ 700 (`requiredContrast` in `contrast.js`).
- Disabled controls are exempt, as WCAG allows. They are still listed in the test's report.
- Text shadows don't count. The test measures the background with shadows removed, so a label must pass on its fill
  alone. A shadow is polish, never the reason a label is legible.
- Non-text graphics (status glyphs, bars against their track) aim for 3 : 1.

Consequences in the kit:

- The measured Buy, Confirm and Objective faces are kept where their labels are large, and stepped darker where
  labels are small (§5.2).
- HUD text on the scene gets a soft scrim instead of a panel (§5.10).
- The 19 px bold HUD labels count as large text.

---

## 3. Type

### 3.1 Scale

| role | token | size / line (EN) | line (ZH) | weight | used for | source |
|---|---|---|---|---|---|---|
| body | `--ui-fs-body` | 14 / 20 | 22 | 400, 700 | meta, stock, tips, tags, badges, tooltips | ART.md §8 body 13–15. ss_01 "Remaining: 3" is 83 px wide in both the source and the kit |
| HUD | `--ui-fs-hud` | 17 / 24 | 26 | 400–700 | chips, row names, section heads, wish line, toasts, loop pill | ART.md §8. ss_02 "Water" 48 px ink ≈ 17.7 px |
| HUD label | `--ui-fs-hud-lg` | 19 / 26 | 28 | 700 | navigation, stats, objectives | ink widths against the same words: "Tactics" 63 px, "Satiety" 62 px, "Rescue the Neighbor Girl" 223 px ≈ 18.5–19 px (ss_02, ss_06) |
| title | `--ui-fs-title` | 20 / 28 | 30 | 700 | prices, large buttons, power and room rows | ss_01 "Checkout" 102 px ≈ 20 px, "$10" caps 14 px |
| floor | `--ui-fs-floor` | 22 | — | 700 | the floor list | ss_02 "Home" 60 px ink ≈ 22.6 px |
| heading | `--ui-fs-heading` | 28 / 36 | 40 | 700 | window titles, big totals | ART.md §8 headings 26–30; ss_01 "Groceries" ≈ 26–27 px |
| clock | `--ui-fs-clock` | 32 / 36 | — | 700 mono | the digital clock | ss_02 digits 23 px ink |
| display | `--ui-fs-display` | 68 / 1.42 em | — | 900 | the day counter | ss_02 "DAY7" caps 49 px |

**Why the HUD label size isn't ART.md's 17 px.** ART.md converts ink height to font size as if ink spanned about
1 em. That holds for a word with both ascenders and descenders ("Satiety", 19 px of ink). It undercounts words
without descenders: "Morale", "Track" and "Home" have 15–16 px of ink at the same size. Measured by width against
the kit's own rendering of the same words, the source's stat, navigation and objective labels are 18.5–19.5 px.
The kit keeps 14 / 17 / 28 as its core steps and adds the two measured HUD sizes: 19 for labels, 22 for floors.
At ≥ 18.66 px bold these labels are large text (§2.6).

Line heights sit on the 4 px grid in English. Chinese gets +2 px per step, which is the extra leading a CJK face
needs to breathe, and which also holds PingFang's taller content area (§9 catches a line box that clips it).

### 3.2 Faces

Decided at checkpoint 1: SIL OFL 1.1 fonts are an allowed source (docs/wp/README.md), and the kit sets its text in
Noto Sans and Noto Sans SC, with the old system stacks behind them as fallbacks:

| token | stack |
|---|---|
| `--ui-font-latin` | `'Noto Sans', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial` |
| `--ui-font-cjk` | `'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC'` |
| `--ui-font` | Latin, then CJK (English); CJK, then Latin under `:lang(zh)` |
| `--ui-font-mono` | `ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono'`, then CJK: weights, footprints, timers |
| `--ui-font-display` | `'Arial Black', 'Segoe UI Black', 'Helvetica Neue', Arial`, then CJK: the day counter |

The swap was a token change: `src/ui/kit/fonts.css` (imported first by `kit.css`) holds the two `@font-face` rules,
and the two tokens above name the families. Nothing else names a face, except the canvas text the 3D renderer
draws (`src/render3d/overlays.js` labels, `dressing.js` shop signs), which lists the same families before its
system fallbacks. The game's own styles (`styles.css`) read `--ui-font` too.

- **Files.** `assets/fonts/noto-sans/NotoSans.woff2` (about 29 KB) and `assets/fonts/noto-sans-sc/NotoSansSC.woff2`
  (about 630 KB), each with its `OFL.txt`, built by `tools/fonts/build.sh` from the Google Fonts repository's
  variable TTFs (locked in `assets/sources.lock.json`; manifest `assets/fonts/manifest.json`). One variable file per
  face covers weights 400 … 700, so regular, medium, semibold and bold are all real; 800 and 900 resolve to 700.
- **Subsets.** Noto Sans keeps ASCII, Latin-1, the typographic punctuation and the few other characters the strings
  use that it has. Noto Sans SC keeps exactly the Chinese characters the game shows (2,256 today, collected from
  `src/` into `tools/fonts/charset.json`), plus ASCII, Latin-1 and punctuation, so Latin inside Chinese text uses the
  CJK face's Latin (§3.3). Symbols and emoji (arrows, ★, 🎒) are in neither subset and come from the system fonts.
  `tests/fonts.test.js` fails when a string adds a Chinese character the charset lacks: run
  `tools/fonts/build.sh --collect`, then `tools/fonts/build.sh`.
- **Loading.** Nothing is preloaded. Each face declares a `unicode-range` (the manifest's `params.unicodeRange`)
  and `font-display: swap`, so a face downloads only when text on screen needs one of its characters, and the
  fallback stack shows until it arrives. An English session fetches only the 29 KB Latin file; the Chinese file
  loads when Chinese text appears. Canvas labels drawn before a face arrived are redrawn when it has.
- **Display face.** The day counter keeps Arial Black (English) and Noto Sans SC at 700 (Chinese). The counter's line
  box assumes Arial Black's 1.41 em ascent + descent (`.sl-day__count`, `.sl-t-display`); the overflow test (§9)
  checks it in both languages.
- **Fallbacks** on this Mac resolve to SF (system-ui), PingFang SC, Menlo and Arial Black; on Windows to Segoe UI,
  Microsoft YaHei, Consolas and Arial Black.

### 3.3 English and Chinese

- **Order of faces.** In Chinese the CJK face comes first, so Han glyphs never take a Latin face's metrics and
  Latin runs inside Chinese text use the CJK face's Latin (as the source's Chinese build does).
- **No synthesis.** `font-synthesis: none` on `.sl-root`. Bold is weight 700, a real instance of both Noto faces'
  weight axis (the system fallbacks render it as their semibold); nothing is faked.
- **The Chinese day counter.** The shipped CJK face stops at 700 and no system CJK face has a black weight. `第7天` is set wholly in the CJK face, digit
  included, so the three glyphs share one weight. A 2 px stroke in the text colour gives it the counter's mass.
  Mixing Arial Black's "7" with PingFang's 第 and 天 read as two weights.
- **Caps.** Uppercase is English-only (`.sl-root:lang(en) .sl-section`, `.sl-t-caps`). Chinese has no case and
  gets less tracking: 0.04 em instead of 0.08 em on caps, 0.02 em instead of 0.06 em on buttons.
- **Punctuation.** Chinese strings use full-width punctuation: `剩余：3`, `周目：1`, `（0/1）`, `【心愿】`.
  `labelled()` in `format.js` writes "Remaining: 3" or "剩余：3".
- **Quality is text.** English appends " (Perfect)", Chinese appends 【完美】 (`withQuality`). Config names carry
  the Chinese suffix `(完美)`, which `splitQuality` strips first. See §5.5.
- **Numbers.** Prices, stats and counts use tabular figures (`.sl-num`, `font-variant-numeric`), so values don't
  jitter as they change. Money is written `$1,118` in both languages, as the Chinese build does.
- **Lengths.** Chinese strings run about 40 % narrower than English. Every layout is checked in both languages
  (§9), and no fixed width is sized for Chinese only.

### 3.4 Copy formats (`format.js`)

| helper | output | as in |
|---|---|---|
| `formatKg(500)` | `0.50kg` | ss_01 row meta |
| `formatFootprint([2, 2])` | `[2x2]` | ss_01 row meta |
| `formatLoad(8.8, 8)` | `8.8 / 8.0 Kg` | ss_01 load line, capital K |
| `formatMoney(1118)` | `$1,118` | ss_01, t018 |
| `formatClock(11, 50)` | `11:50` | ss_02 |
| `labelled('Remaining', 3, 'en')` | `Remaining: 3` / `剩余：3` | ss_01 |
| `withQuality('Luncheon Meat and Fried Egg', 'good', 'en')` | `Luncheon Meat and Fried Egg (Good)` | ss_07 "Eat Mushroom Soup (Perfect)" |

### 3.5 Names: where the source differs from our config

Our English names come from the config's machine translation (`src/data/gen/en.js`). Where the source prints a
name, the tile uses the source's (`SOURCE_NAMES` in `pages/ui-tile/content.js`). Mismatches noticed so far:

| id | config (ZH) | our English | the source shows | where |
|---|---|---|---|---|
| 2105 | 红烧牛肉面 | Braised Beef Instant Noodles | **Beef Noodles** | t018 shop |
| 2101 | 90压缩饼干 | Compressed Biscuits (90) | **Hardtack** | t018 shop, `[4x3]` |
| 2102 (2001, 2002) | 苏打饼干 | Soda Crackers | **Crackers** | t018 shop; ss_08 chip "Eat Crackers" |
| 2117 | 卤蛋 | Braised Egg | **Marinated Eggs** | ss_01 shop |
| 2118 | 纯牛奶 | Pure Milk | **Whole Milk** | ss_01 shop |
| 2127 | 红富士苹果 | Red Fuji Apple | **Fuji Apple** | ss_01 shop |
| 2121 | 乳清蛋白粉 | Whey Protein Powder | **Protein Powder** | ss_01 shop |
| 2110 | 北京烤鸭卷 | Peking Duck Wraps | **Duck Wrap** | ss_02 wish |
| 12004? | 冷冻囤货食材包 | Frozen Stockpile Food Pack | **Starter Ingredients Kit** | t018 shop. Uncertain: the source lists 2.00 kg `[4x3]`, the config `[6,5]` |

Names that match: Banana (2125), Cheddar Cheese Slices (2119), Organic Fragrant Rice (2103), Hot Dog (2510), BBQ
Ribs (12069), Cola (2130), Marshmallows (2143).

The source has two localisation bugs the kit does not copy:

- ss_04 has a mixed-language chip, "去吃 Crackers".
- ss_05 shows a raw key, "SmartRecommend_EatChip".

The fix for our names belongs in the i18n lane's `EN_NAMES` (§10).

---

## 4. Space, sizes and layers

### 4.1 The 4 px grid

`--ui-space-1` … `-16`: **4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px.**

- Every padding, gap, margin and control size is a multiple of 4.
- Hairlines (1–2 px borders, rules) and the dial's internal geometry are the only exceptions.
- The inventory pitch is on the grid by construction: 64 px cell + 4 px gap = 68.

### 4.2 Radii and sizes

| token | value | for |
|---|---|---|
| `--ui-radius-bar` / `-control` / `-slot` / `-panel` / `-modal` / `-pill` | 2 / 4 / 6 / 10 / 12 / 999 px | bars / buttons, cells / slots, rows, tooltips / windows / modals / pills |
| `--ui-control-h` / `-sm` / `-lg` | 36 / 28 / 52 px | buttons |
| `--ui-hud-button` / `-lg` | 72 / 92 px | toolbar buttons / the main action (ss_02) |
| `--ui-cell` / `--ui-cell-gap` / `--ui-cell-pitch` | 64 / 4 / 68 px | inventory; the icons' native size is 64 |
| `--ui-icon-fill` | 0.66 | the icon convention (§5.5) |
| `--ui-fresh-bar-h` / `--ui-status-badge` | 4 / 20 px | slot badges |

### 4.3 Layers

`--ui-z-hud` 10 < `--ui-z-window` 20 < `--ui-z-drag` 40 < `--ui-z-toast` 50 < `--ui-z-modal` 60 < `--ui-z-tip` 70.

Windows sit over the HUD and toasts over windows. A tooltip is always on top, even over a modal.

### 4.4 HUD anchors at 1080p

Measured on ss_02 and ss_06 (ink boxes). The tile hits them to within a few pixels:

| piece | source | tile |
|---|---|---|
| day counter caps | x 1527–1710, y 50–98 | x 1518–1704, y 52–99 |
| dial | 144 px, centre (1818, 105) | 144 px, right edge 1890, top 33 |
| clock digits | x 1765–1867, y 194–216 | x 1767–1865, y 194–218 |
| navigation | 46 px circles, first centre y 273, pitch 72 | same |
| floors | first centre y 597, pitch 53 | 598, 52 |
| power / room rows | centres y 771 / 828 | 772 / 828 |
| stat bars | x 1626–1888, centres y 882 / 935 / 988 / 1040 | x 1624–1888, pitch 54 |
| "Satiety" label | x 1669–1730, y 874–892 | x 1669–1731, y 872–888 |
| objectives | "Main" caps top y 43, x 54 | y 42, x 52 |
| toolbar | bag and phone 72 px at x 22 (ss_06 order); main action 92 px; chips y ≈ 944 | same |

---

## 5. Components

### 5.1 Panels

- `.sl-panel`: a window. `--ui-panel-bg` at α 0.9 (§2.5), a 1 px `--ui-panel-edge`, radius 10 and
  `--ui-shadow-panel`, padded 20.
  - `__head` holds a `__title` (28 px, strong) and a `.sl-close` ×.
  - `__foot` holds a centred dim tip line ("Tip: Drag items…", ss_01).
  - `--solid` is opaque; `--flush` has no padding; `__sunk` is a darker well.
- `.sl-section`: the section head of ss_08 and t043 ("COOKING STATION - STOVE", "RECIPE BOOK"): a 4 × 18 px bar and
  a label in `--ui-primary`, bold, caps in English. It can carry `__sub` (a strong suffix) and `__aside` (a dim
  right-aligned value such as a load or "Space: 18 / 35").
- Paired containers: the source's storage view (t021) sets two panels side by side, "Backpack" and "Toolbox", with
  white titles above them and the transfer buttons between. The kit covers it with two `.sl-panel`s, `.sl-t-title`
  headings, secondary "Take All" / "Leave All" buttons and ghost "Take by Type" buttons.

**Station frame.** `.sl-frame` is the frosted window of the multi-pane stations (ss_07 workbench, ss_08 cooking):
`--ui-frame-fill` (`rgb(56 57 54 / 0.6)`) with a 20 px backdrop blur. It holds a `__head` (section head and close)
and `__panes`, a row of `.sl-panel--pane` panels (8 px radius, `--ui-shadow-pane`). Builder A measured the
frame in ss_08 (`frostedFrame` in `measurements.json`): warm, smooth, and lighter than the room above it. The kit
sheet shows one over the backdrop.

### 5.2 Buttons

`.sl-btn` sets its face through three custom properties (`--btn-bg`, `--btn-fg`, `--btn-edge`), so a variant is
three lines. Sizes: default 36 px at 17 px, `--sm` 28 px at 14 px, `--lg` 52 px at 20 px (tracked 0.06 em);
`--block` spans its container, `--caps` sets caps.

| variant | face | label | contrast | source |
|---|---|---|---|---|
| `--primary` | `#fbbb4c` → `--ui-primary` → `#ee9f24`, soft glow | `--ui-text-on-light` | 8.7 | ss_08 and t043 CANCEL COOKBOOK |
| `--secondary` | `--ui-secondary-light` → `--ui-secondary` | `#4a2e00` | 7.3 | t018 Checkout, t008 Upgrade (`#f7c437` → `#eeae14`) |
| `--confirm` | `#2f8431` → `#276f29` | `#f2fff1` | 5.2 | ss_03, stepped darker for 17 px labels |
| `--confirm.--lg` | `#36903a` → `--ui-confirm` → `#2d7f2e` | `#f2fff1` | 4.2 (large text, ≥ 3) | ss_03 "Confirm Purchase" |
| `--buy` | rest `#5e843c` → `--ui-buy-rest-face` `#517730` at 4 px → `#426822`; hover `#688e46` → `--ui-buy-face` → `#4c722c` | white | 5.3 rest, 4.5 hover | ss_01 Buy, 64 × 32 like all six |
| `--danger` | `#b8452f` → `--ui-danger` → `#963121` | `#fff1ec` | 4.9–6.9 | decided |
| `--objective` | `rgb(41 43 38 / 0.96)` | `--ui-objective` at 20 px bold | 3.8 (large only) | ss_01 "Complete Preparations" |
| `--ghost` | `rgb(12 13 14 / 0.7)` | `--ui-text-dim` | 6.8 | ss_03 "Return", t021 "Take by Type" |
| neutral (no modifier) | `--ui-control` → `--ui-control-deep` | `#dcdeda` | 8.4–9.7 | t014 CLOSE, the kit sheet's "OK" |
| disabled | `#2c2d31` | `#7e7f81` | 3.3 (exempt) | ss_01 disabled Checkout |

State rules:

- **Hover** adds a 1 px inner white ring; the face under the label never lightens, so a hovered button keeps its
  label contrast. Buy is the one face that visibly lightens, as the source's does (rest `#5c8439`, hovered
  `#648e3f`, both lighter at the top). The source's hovered green fails AA under white, so the kit keeps the step
  and moves both faces down: each is a vertical gradient, lighter in the top 4 px (above the tallest label box,
  Chinese included) and darker toward the foot. Hovered, the face behind the label is `--ui-buy-face` (4.52 : 1);
  at rest the whole gradient sits 4 L* lower (`--ui-buy-rest-*`, 5.2 : 1 on the face stop), the source's 3.7 L* rest-to-hover step.
  Hover therefore lifts every row of the face evenly, with no ring and no shadow. An earlier radial "rim" hover
  drew an oval on the 64 × 32 button and was dropped. The face stays green, never grey: the hover rule sets
  `--btn-bg`, and a disabled Buy is excluded. (Builder A's hover went grey because a generic `.sl-btn:hover`
  replaced the green.)
- **Pressed** moves down 1 px, dims to 90 % and shows an inset shadow.
- **Focus** adds the ring of §7.
- **Disabled** drops every effect and the pointer.

### 5.3 Tabs, chips, tags, badges, counts

- `.sl-tabs` / `.sl-tab`: the "Character Inventory | Fridge | Freezer" and "Inventory | Workbench Drawer" tabs
  (ss_08, ss_07, t043).
  - The selected tab (`aria-selected="true"`) takes `--ui-tab-on-bg`, a gold edge and a `--ui-gold-pale` label.
  - `.sl-tabs--fill` is the filled variant (the Goods categories in ss_03): a gold face with dark text.
- `.sl-chip`: a quick action on the toolbar ("Eat Hot Dog", "Listen to Music"; ss_02). A 40 px chip on
  `--ui-hud-bg-strong` with an `--ui-hud-edge` hairline, an optional 24–28 px item icon or glyph, and a gold edge on
  hover.
- `.sl-tag`: 24 px, 14 px bold.
  - `--must`: "Must Buy", t018.
  - `--gold`: "Pick One", ss_02.
  - `--outline`: the quest tags "Food" / "Sundries", ss_06.
  - `--quiet`: "Lv.0", t008.
- `.sl-badge`: a status label. `--danger` is "Encumbered" (ss_02) and `--good` is "Orderly Exit" (ss_04). `--lg`
  is the HUD's 30 px, 17 px size.
- `.sl-count`: a round count ("Home Plants 3", ss_02); `--gold` is the gold variant. `.is-bump` pops it when the
  value changes.

### 5.4 Tooltips

- `.sl-tip`: a label tip ("View Stockpile Reminder", ss_01). 17 px bold on `rgb(36 38 33 / 0.97)`, with an arrow
  toward its anchor.
- `.sl-tip--rich`: an item or building tip (t014 "Plant"). 340 px wide, a gold hairline, face `#191d20`
  (measured). It holds:
  - `__title`: gold, 17 px, with the item icon.
  - `__sub`: dim facts ("Meat · Cooked dish · 0.50kg [2x2]").
  - `__gains`: "Satiety +32" with the number in `--ui-positive`.
  - `__rule` separators.
  - A `.sl-kv` table: dim keys, right-aligned values in `--ui-positive`, or `.is-plain` / `.is-warn` / `.is-bad`,
    or t014's gold "• Sufficient" (`.is-gold`, `--ui-amber`) and dim "○ Insufficient" (`.is-dim`).
  - `__desc`: `#b3b5b1` body.
- Tips never take pointer events. An item tip follows its item, never the cursor. It appears after
  `--ui-delay-tip` (350 ms of hover intent) and fades in over `--ui-dur-tip`.
- `placeItemTip(tip, slot, { bounds, avoid })` (`place.js`, after builder A) places an item tip. It goes right of
  the slot, centred on it, or left when the right side would leave `bounds` (the tile passes the window). It stays
  inside `bounds`, then slides down, and failing that up, until it covers no `avoid` element (the window's other
  slots), so it lies over empty cells only. It sets `data-side`, and `--tip-arrow` points the arrow at the slot's
  centre. The tile's tooltip is placed this way, not at a fixed position.

### 5.5 Inventory: grids, slots and badges

**Grid.** `gridElement({ cols, rows, cold })` makes `.sl-grid` with `--cols`/`--rows`.

- Width is `cols × 68 − 4`, framed by a 4 px `--ui-grid-line` padding, so the gaps read as the source's light lines.
- Empty cells run from `--ui-cell-top` to `--ui-cell-bottom`.
- `.sl-grid--cold` has blue cells (`--ui-cold-cell`, `--ui-cold-edge`): the fridge and freezer (ss_08).

**Slot sizes.** A slot spanning w × h cells is `w × 68 − 4` by `h × 68 − 4` px. The source's config footprints run
from 1×1 to 6×5; the kit handles any size. The rendered icons (WP-P0-12) cover these:

| footprint | slot px | rendered items |
|---|---|---|
| 1 × 1 | 64 × 64 | seeds 15026, trap 25001 |
| 2 × 1 | 132 × 64 | tin 2115, bread 2502, bandage 2400, plank 20106 |
| 1 × 2 | 64 × 132 | water 2142, book 3022 |
| 2 × 2 | 132 × 132 | noodles 2105, dishes 13540–13542, failed dish 13543 |
| 3 × 3 | 200 × 200 | none rendered yet (the kit sheet shows the frame) |
| 3 × 4 | 200 × 268 | rice 2103 |

**Icon fit.** The icons are square renders, and the item's content fills 0.66 of the box on its long side
(`params.box.fill`). The item's actual content extent is `meta.framing.extent`, e.g. `[0.66, 0.4182]` for the lying
bottle. The icon box is the largest square whose content fits 0.66 of the slot on both axes:

```
icon = min(0.66 · slotW / ex, 0.66 · slotH / ey)
```

This is `--icon` in `inventory.css` and `iconBox()` in `slot.js`. In a 1×1 slot the icon is exactly 64 px, the
icons' native size. Consequences:

- A wide render in a 2×1 slot grows until its height fills: bread becomes 82.9 px, the plank 101.8 px.
- The icon box may overhang the slot on its transparent margin. It stays centred, and the slot clips it.
- The `srcset` (64 / 128 / 256) is chosen for the icon box, not the slot.
- The icons carry their soft shadow baked in (3 % down-right, σ 2 %, 30 %). The kit adds no second shadow.

**Rotation.** `rotated: true` (R while dragging) swaps the footprint. The art turns 90° clockwise with it, and the
extent swaps, so the icon box is the same size. The baked shadow then falls down-left (§10).

**Art turn.** A render can lie across its footprint. The 2142 bottle is framed wide for a 1 × 2 cell, which would
leave a 64 px icon in a 64 × 132 slot. `SlotIcon.turn` (±90) stands such a render up; −90 puts the cap on top, as
the source stands its bottles (ss_01's cola). The icon then grows to 101 px.

- The angle is the icon's turn plus the item's rotation (`artAngle`), and the extent swaps whenever the angle is
  ±90.
- Rotating the turned bottle lays it back down at the render's own angle.
- The icon manifest has no turn field yet, so the tile keys it by asset in `ART_TURN` (§10).

**Badges.** These are the source's conventions, and they are the only overlays on a slot:

| badge | where | look | source |
|---|---|---|---|
| servings `__servings` | bottom-left, 6 px in, 10 px up | black pill (`--ui-badge-bg`), 14 px bold white, "7/7" | ss_01, ss_08 |
| status `__status` | top-right, 4 px in | 20 px square with a 14 px glyph: `--chilled` (kept cold) white price tag on green, as the source draws it, `--expiring` amber hourglass (dark glyph), `--expired` dark red "!" with a red hairline, `--mold` olive | ss_08 |
| freshness `__fresh` | full width at the foot, 6 px in, 3 px up, 4 px tall | `--ui-fresh`; amber when expiring, red when expired, on a dark track | ss_01 |

Freshness follows `src/sim/spoilage.js` (`freshness(daysLeft, life)`):

- Items that don't spoil (`life ≤ 0`) get no bar.
- The bar's value is days left over life.
- The state is `soon` at ≤ 1 day or ≤ 20 % of life, and `expired` at ≤ 0.
- The source's bar may track servings rather than freshness (§10). The bar is data-agnostic (`--v`), so either
  reading is one line in the caller.

**Quality is text, never a badge.** WP-P0-07.md's scope lists "badges for servings / quality / expired". The icon
decision replaces the quality badge:

- The source shows dish quality only in the name: "Eat Mushroom Soup (Perfect)" (ss_07) and 【完美】 in Chinese.
- Perfect, Good and Normal share one render; Failed has its own (the manifest binds 13540–13542 to one asset).
- The kit writes quality into the name everywhere it appears (tooltip title, chip, row, accessible name) through
  `withQuality`, and draws nothing on the icon.

**States.**

| state | look | source |
|---|---|---|
| rest | slot gradient, `--ui-slot-edge` | ss_01 |
| `:hover` / `.is-hover` | lighter gradient, grey edge | ss_01 |
| `.is-selected` | 2 px `--ui-gold-pale` edge | ss_07 |
| `.is-pending` | 2 px gold edge and a warm fill: bought, not paid for | t018 (the two items of "2 item(s)") |
| `.is-dragging` | 35 % opacity where it was | decided |
| `--ghost` | the dragged copy, with `--ui-shadow-pop` | decided |
| `:focus-visible` / `.is-focus` | the focus ring | §7 |
| `--frozen` | the freezer's snow cap across the top | ss_08 |

Drop previews colour the cells under the ghost: `.sl-cell.is-drop-ok` (buy green, 40 %) and `.is-drop-bad`
(danger, 45 %).

**The load line.** `.sl-load`, or a section head's aside, with a 6 px bar:

- Gold (`--ui-gold-deep`) normally.
- Danger with `--ui-danger-text` numbers when over the limit ("8.8 / 8.0 Kg"), as ss_01's red bar with Encumbered.

**Accessibility.** A slot is `role="gridcell"`, focusable, and its `aria-label` is the name with its quality. The
status badge carries its label as a title.

### 5.6 Progress bars

`.sl-bar` has a 6 px track (`--ui-track`) and a fill whose width is `--v` × 100 %. The fill eases over
`--ui-dur-bar`. Variants:

- `--thick` (10 px pill).
- `--danger`: the overweight bar.
- `--alert` (12 px `--ui-alert`): hit points, Front Door in ss_02.
- `--primary`: the orange cooking progress of ss_08.
- `--fresh`, `--info`.

The stat bar (`.sl-stat`, §5.10) is its own component.

### 5.7 Rows, prices, key/value

**Rows.** `.sl-row` is a shop or list row (ss_01): a grid of icon, main and aside, at least 112 px tall (the
source's pitch is 114).

- The icon is the square render at 96 px (`--row-icon`), so the item reads the source's ~64 px. Its layout box is
  80 × 64, and the render's transparent margin overhangs it.
- Name: 17 px bold, strong.
- Meta: mono 14 px dim ("0.50kg  [2x2]").
- Aside: stock ("Remaining: 2", dim, or "Sold out" in `--ui-danger-text`) over the price and a 64 × 32 Buy.
- Rows are separated by `--ui-line`. `:hover` / `.is-hover` shows `--ui-row-hover`. `.is-selected` shows
  `--ui-row-selected` with a 3 px gold edge.

**Prices and key/value.**

- `.sl-price`: 20 px bold gold with tabular figures. `--lg` is 28 px, as the CASH total. `--muted` is dim, for a
  sold-out price.
- `.sl-kv`: a two-column key/value list (ss_03 specs, tooltips).

### 5.8 Toasts

`.sl-toasts` is a centred stack, newest at the bottom, five at most. Each `.sl-toast` is 44 px on
`rgb(18 19 17 / 0.92)`:

- plain by default, like ss_07's "Crafting Proficiency +28";
- `--good`, `--bad` and `--info` add a 3 px accent on the left: fresh green ("+1 Beef Noodles" with the item icon
  and a `--ui-success` gain), danger and info.

A toast enters from 8 px above over `--ui-dur-toast` and holds `--ui-dur-toast-hold` (3.2 s; the game's toast code
reads this token). `.is-leaving` fades it out 4 px upward over `--ui-dur-modal`.

### 5.9 Modals

`.sl-scrim` covers its positioned parent and dims it with `--ui-scrim`. `.sl-modal` sits on top: 560 px,
`--ui-panel-solid`, radius 12, `--ui-shadow-modal`. It has three parts:

- `__head`: a 28 px title, a `__sub` line in `--ui-positive` ("Cooking Furniture"), and a price and a close button
  on the right.
- `__body`.
- `__foot`: a ghost Cancel and a large Confirm (ss_03).

On the scrim, the source is inconsistent, so the kit picks a middle and says so:

- ss_03's purchase dialog has no scrim at all.
- ss_07 darkens only the window the result belongs to (the workbench), almost to black.
- Neither blurs.

The kit's scrim is window-local, since it covers its positioned parent. It dims to 62 % and doesn't blur. The dialog
rises 6 px from 97 % scale and fades in over `--ui-dur-modal`.

### 5.10 HUD

HUD text sits on the scene, so each cluster brings its own scrim, and text on the scene also gets
`--ui-text-shadow-hud` (§2.6: the scrim, not the shadow, must carry the contrast).

- **Day bar** (`.sl-daybar`, ss_02 and ss_04).
  - A dark band 48 px tall holds the day counter's caps exactly. The offsets are measured relative to the dial's top.
  - The weather orb (60 px, gold glyph) is centred on the band, 40 px left of the counter.
  - The loop pill hangs just below: a `#2a2c27` face with a gold label and no outline.
  - The clock column holds the 144 px dial and the cyan digits (32 px mono). The digits glow in `--ui-info` over a
    soft radial vignette that has no edge; it keeps them at 3 : 1 over a bright wall, where the source relies on
    the scene being dark.
- **Dial** (drawn in the tile; ss_02).
  - The inner disc (r 44) is night `--ui-dial-night` `#222d2f` on top and day `--ui-dial-day` `#5e4139` below,
    as measured (`dialNight`, `dialDay`). The hours sit on a slightly lighter outer ring (`#2a3538` / `#66483f`).
  - A 1.5 px pale rim, `--ui-dial-rim`.
  - One 5 px white hand that stays inside the disc, so it never crosses a numeral, and the gold marker above 24.
- **Navigation** (`.sl-nav`): Log, Tactics, Track, Layout.
  - Each label is 19 px bold `--ui-text-dim` (source `#8e8f8b`) standing on the scene, as in the source. One soft
    shade covers the whole column (`.sl-nav::before`): it deepens toward the right edge and fades out to the left
    and at both ends, so there is no blotch per label and the labels stay at 3 : 1 over a bright wall.
  - The glyph sits in a 46 px dark circle with a 2 px light ring that turns gold on hover.
- **Floors** (`.sl-floors`): a 140 px dark column of 52 px, 22 px bold rows.
  - The current floor (`aria-current`) is gold on a gold wash that deepens to the right, with the green
    `--ui-online` dot.
  - Other floors are light grey; an unreachable one (`:disabled`) is faint.
  - The source draws no lock.
- **Power and room rows** (`.sl-hudrow`): 40 px, 20 px bold, dark face.
  - `--power` is blue-grey (ss_06).
  - The room row has a cloud glyph, the room name and its temperature ("Living Room · Normal"; "Bal... Slight
    Chill" in ss_02).
- **Stats** (`.sl-stat`, ss_02): 264 × 38 px.
  - The fill is the stat's share of its maximum (`--v`), in `--ui-stat-good`; `--warn` is `--ui-stat-warn` and
    `--bad` is `--ui-stat-bad`.
  - Label and value are 19 px bold white. The icon is tinted by stat (§2.4).
  - "Encumbered" (`.sl-badge--danger.sl-badge--lg`) sits to the left of Life, as in ss_02.
- **Objectives** (`.sl-objectives`, ss_06).
  - The source darkens the scene's top-left corner rather than drawing a box. The kit's scrim fades to nothing at
    the right and below.
  - Heads ("Main" gold with a flag, "Event" with a bolt) are 19 px bold over a gold hairline.
  - Lines have a diamond bullet; the main quest is gold, others `#c8cfd0`, done lines dim, and a mono timer
    follows ("23:45").
  - `.sl-quest` is the quest card: gold title, outline tags, and a mono progress line ("0/500 · Can last 20 more
    days").
- **Toolbar** (ss_02).
  - `.sl-toolbtn`: 72 px buttons (bag, phone) and the 92 px `--main` action.
  - `.sl-chips`: quick actions.
  - `.sl-queue`: a gold ‹ and five 52 px queue slots. The current slot has a gold hairline and an orange progress
    bar.
  - `.sl-speed`: play, fast, fastest, pause; the pressed one (`aria-pressed`) is gold on `#433a18`.
- **Wish and alerts** (ss_02).
  - `.sl-wish` is a pill: gold "[Wish]", a "Pick One" tag, the items in white, and a mono timer on a grey chip.
  - `.sl-alert` is a 56 px "!" button. `--new` pulses its edge (the only infinite animation in the kit).
- **Crisis banner** (`.sl-crisis`): a red band fading right, with 28 px black-weight white text ("Zombie Siege!",
  ss_02; "Undead Swarm! Part II", ss_05).

### 5.11 Glyphs and scrollbars

- `glyph(name, { label })` returns a 24 × 24 filled SVG in `currentColor`, sized 1.15 em by `.sl-glyph`. An unknown
  name throws, so a typo fails the page instead of drawing nothing.
- These are UI glyphs only. Items always use their rendered icons.
- `.sl-scroll` styles a real scroll area with the source's thin `--ui-thumb` on a clear track. `.sl-scrollbar` is the
  same look as a static indicator for the tile.

---

## 6. Motion

**Feedback within 100 ms.** Every direct response starts at 0 ms and settles within 100 ms: press 60 ms, hover
90 ms. Nothing that answers an input waits.

- The tooltip delay (350 ms) is an intent delay, not feedback.
- Windows and toasts open fast and leave slower, so the eye catches arrivals and isn't dragged along by departures.

| token | value | for |
|---|---|---|
| `--ui-dur-press` | 60 ms | the press transform |
| `--ui-dur-hover` | 90 ms | hover colours, borders, rings |
| `--ui-dur-tip` | 120 ms | tooltip fade, after `--ui-delay-tip` 350 ms |
| `--ui-dur-open` | 180 ms | a window opens: fade and rise 4 px |
| `--ui-dur-toast` | 240 ms | a toast arrives: fade and drop 8 px; a count bumps |
| `--ui-dur-modal` | 280 ms | a modal arrives; a toast leaves |
| `--ui-dur-bar` | 400 ms | a bar changes value |
| `--ui-dur-toast-hold` | 3200 ms | how long a toast stays (read by the game's code) |
| `--ui-ease-out` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | everything that arrives |
| `--ui-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | everything that leaves |
| `--ui-ease-inout` | `cubic-bezier(0.4, 0, 0.2, 1)` | loops (the new-alert pulse) |
| `--ui-ease-pop` | `cubic-bezier(0.34, 1.4, 0.64, 1)` | badge and count changes |

Rules:

- **What animates.** Only opacity, transform, colours and box-shadows; never layout.
- **Reduced motion.** `prefers-reduced-motion: reduce` sets opening, bar and modal durations to 0–80 ms. Feedback
  stays, and nothing slides.
- **Infinite animation.** Only the new-alert pulse loops.

---

## 7. Hover, press and focus

- **Hover never changes a label's contrast.** Buttons gain an inner ring rather than a lighter face. Rows, slots,
  tabs and chips change their edge or a translucent overlay. Text brightens at most (navigation labels go from
  dim to strong).
- **Press** moves the control down 1 px and dims it to 90 % over 60 ms.
- **Focus is keyboard-only** (`:focus-visible`), and one ring serves everything: a 2 px black gap, then a 2 px
  `--ui-gold-pale` ring (`--ui-focus-ring`).
  - The black gap keeps it visible on yellow faces; the pale gold keeps it visible on dark panels.
  - Slots, rows, tabs, chips, HUD buttons and the close button all take it. `.is-focus` shows it statically.
- **Selection vs focus.** Selection is gold (a pale gold edge on slots, a gold edge on rows and tabs); focus is the
  ring. They can coexist.
- **Disabled** controls keep their shape at low contrast and lose hover, press and the pointer.

---

## 8. The style tile

`pages/ui-tile.html`, from the dev server: `http://127.0.0.1:<5200 + slot>/pages/ui-tile.html`.

| query | shows |
|---|---|
| (none) | the tile, English |
| `?lang=zh` | the tile, Chinese |
| `?view=kit` | the component sheet: every token and component in every state (`&lang=zh` for Chinese) |
| `?backdrop=<url>` | the same over another still |

**The scene.** Day 7 in the Wage Slave's living room. The survivor has just bought Beef Noodles and a Natural
Sparkling Water, so both are gold-edged and unpaid, which makes "2 item(s) $45" and 8.8 / 8.0 Kg: over the limit,
so the load bar is red and the HUD shows Encumbered. The fridge is open beside the backpack, and the grocery shop
beside them. Everything in view comes from the config: names, weights, prices, footprints, servings and shelf lives
(`pages/ui-tile/content.js`).

Layout, all at 1080p:

- **HUD in the source's places** (§4.4): objectives top-left, day bar top-right, the navigation, floor, power, room
  and stat column on the right, toolbar bottom-left, wish and alerts bottom-centre, two toasts top-centre.
- **Inventory** (x 120–1078, y 226–878).
  - One window, like ss_01's "Inventory", holding the backpack (8 × 7, as ss_01, ss_07 and t043) and the fridge
    (5 × 7 cold grid). Each has an ss_08-style section head with its load or space.
  - A rich tooltip describes the hovered Luncheon Meat and Fried Egg (Good): gains, shelf life, kept-cold status.
    `placeItemTip` puts it left of the dish (the window ends on the right), over the backpack's empty cells.
  - The icons are all twelve WP-P0-12 renders: 1×1 to 3×4, one rotated plank, the turned bottle.
  - Badges: servings on the book (2/3) and the rice (7/7); kept-cold (the source's price tag) and expired status;
    fresh, expiring and expired bars.
- **Shop** (x 1092–1592).
  - The Groceries window, y 226–764: four 112 px rows, with hover, Must Buy and sold-out states, each with a
    64 × 32 Buy. The fifth row of the first pass went: at the source's row pitch it would push CASH into the wish
    line.
  - The CASH panel under it, y 776–946, as ss_01 and t018 have it.

**The backdrop.** `pages/ui-tile/backdrop.jpg` is the single swappable file.

- It is WP-P0-13's shell render of the 1F living room by day (`docs/art/homes/apartment-1F-day-spike.png` on
  `wp/P0-13`), re-encoded as a 1920 × 1080 JPEG.
- The WP-P0-08 spike room isn't built. This still has the source's value range under the windows; WP-P0-10's
  furniture on a grey void (p50 104) would make every translucent panel read lighter than in the source.
- `pages/ui-tile/backdrop.json` records the source commit, both SHA-256s, the conversion and the swap steps.
  Replace the file (any 1920 × 1080 still) or pass `?backdrop=`, then re-run the spec: the contrast check re-measures
  every text run on the new still.

**Screenshots and boards** (`docs/art/ui/`, written by the spec with `UI_TILE_OUT=docs/art/ui`). The same folder
holds `measure_ui.py` and its `measurements.json` (§2.2):

| file | shows |
|---|---|
| `tile-en.png`, `tile-zh.png` | the tile at 1920 × 1080 |
| `kit-en.png`, `kit-zh.png` | the component sheet (full page) |
| `board-inventory.png` | ss_01 Inventory beside the tile's inventory, 1:1 |
| `board-shop.png` | ss_01 Groceries beside the tile's shop and CASH panel, 1:1 |
| `board-cash.png` | t018's CASH panel (trailer, rescaled to game pixels) beside the tile's |
| `board-topbar.png` | ss_02 day, loop and clock beside the tile's, same region |
| `board-stats.png` | ss_02 navigation, floors, power and stats beside the tile's, same region |
| `board-objectives.png` | ss_06 objectives beside the tile's, same region |
| `board-toolbar.png` | ss_02 toolbar, queue, speed and wish beside the tile's, same region |
| `board-frame-ss01.png`, `board-frame-ss02.png`, `board-frame-zh.png` | whole frames side by side at 50 % |

To refresh them:

```
UI_TILE_OUT=docs/art/ui WP_SLOT=<slot> npx playwright test tests/e2e/ui-tile.spec.js
python3 docs/art/ui/measure_ui.py
```

---

## 9. Tests

`tests/e2e/ui-tile.spec.js`, eleven tests. All but the kit sheets (3, 4) and the boards (11) are tagged `@smoke`,
so the gate runs them.

1. **tile (en)** and 2. **tile (zh)** check the tile; 3. **kit (en)** and 4. **kit (zh)** check the component sheet.
   Each asserts that:
   - there are no console errors, failed requests or HTTP errors;
   - every image loaded, the rendered icons are on screen, and the backdrop is one 1920 × 1080 still;
   - the tile document is exactly 1920 × 1080;
   - **no two items share a grid cell and every item lies inside its grid**, on every `.sl-grid` of the page (read
     from the slots' `--x`, `--y`, `--w`, `--h`). A dragged copy (`.sl-slot--ghost`) is exempt. On the kit sheet
     this caught the first pass's rotation demo, which had two planks in cell (4, 0);
   - **no overflowing, clipped or covered text.** Every text node is walked to the nearest box that holds it, and
     that box needs scrollWidth ≤ clientWidth and scrollHeight ≤ clientHeight (1 px tolerance). Every line box of
     the run must also sit inside each clipping ancestor, and on the tile inside the frame. **Covered** (after
     builder A): with pointer events forced on everywhere, a hit test at 20 %, 50 % and 80 % along the middle of
     each line must find the text's own element or a descendant. The kit sheet is taller than the viewport, so the
     test lays it out in one viewport as tall as the page. A toast moved over the first shop row fails with
     `"Beef Noodles" … covered by … div.sl-toast.sl-toast--good`;
   - **contrast.** The page is shot again with every glyph hidden (text colour, text fill, text and SVG text made
     transparent, shadows removed). That shot is the true composited background, panel alpha and scrims included.
     Each run's line boxes are sampled pixel by pixel. The run's ratio is the 2nd-percentile pixel, which ignores
     a border or a neighbouring fill crossing the line box. It must meet the run's AA threshold (4.5 or 3 : 1 by
     size and weight). Disabled runs are listed but exempt;
   - there are enough runs to count: over 60 on the tile and 150 on the kit, with over 40 and 100 of them at body
     size.

   Each run writes `<view>-<lang>-contrast.json` with every run's colour, size, worst and p2 ratio. The tightest
   runs at the time of writing:
   - body text 4.58 : 1 everywhere: the hovered Buy's label on `--ui-buy-face` (4.52 : 1 at its lightest pixel,
     which test 10 holds at 4.5 or more). Resting Buys are 5.3 : 1;
   - large text 3.95 : 1 on the tile (the clock digits over the wall) and 3.84 : 1 on the kit (Complete
     Preparations);
   - disabled labels (exempt): 3.42–3.43 : 1.
5. **kit helpers.** Pitch; slot sizes; `placed`; `iconBox` and `artAngle`, including a turned and a rotated
   bottle; freshness thresholds; contrast and compositing arithmetic; AA thresholds; quality text in both languages;
   formats.
6. **kit tokens.**
   - The twelve tokens of ART.md §8 are parsed from ART.md itself and must keep their values in `tokens.css`.
     `--ui-secondary`'s second value is `--ui-secondary-light`.
   - Every `var(--ui-*)` read by a kit file is defined.
7. **Buy face and raw colours.** `darkenToContrast(--ui-buy-rest, --ui-buy-label)` must give `--ui-buy-face` at
   4.52 : 1, and white on `--ui-buy` must stay under 4.5 (the reason the faces step down). Both label backings
   (`--ui-buy-face`, `--ui-buy-rest-face`) must reach 4.5 : 1; each gradient must run lighter top to darker foot;
   the hover must lift the rest by the source's rest-to-hover step (within 1 L*); and the hover rule must be that
   vertical gradient with no shadow. No raw colour
   (`#hex`, `rgb()`, `hsl()`) may appear in `base.css`, `components.css`, `inventory.css` or `hud.css`.
8. **measurements.** Every `[x0,y0,x1,y1]` box that this file quotes must be a sample in
   `docs/art/ui/measurements.json`, and the line quoting it must give the measured colour. The resting Buy green
   must be within 2 codes of the six-button measurement, and there must be six Buy buttons.
9. **tile content** (after builder A's config-facts and overlap tests). Every item the tile shows is a config item
   with a rendered icon, every source name is shown, servings are within the config's, and the backpack and fridge
   placements fit their grids without overlaps.
10. **tile (en) config facts.** The shop rows print each item's config weight, footprint and price, are 112 px tall
    with a 64 × 32 Buy; the load line is the backpack's config weight; the CASH total is the unpaid items' prices.
    The rendered rest and hovered Buy faces, label hidden, are then read pixel by pixel. Every row inside the edge
    must be one colour (within 2 levels), which rules out a ring or oval. The lightest pixel behind the label must
    still give 4.5 : 1 under white. Each face must be lighter at the top, and the hovered one lighter than the
    resting one on every row.
11. **boards.** Renders the boards of §8 from the tile and the source frames.

Run it with `WP_SLOT=<slot> npx playwright test tests/e2e/ui-tile.spec.js`. The page needs the dev server;
Playwright reuses one on the slot's port.

---

## 10. Divergences, gaps and follow-ups

Where the tile departs from the source, and why:

- **Backpack and fridge in one window.** The source's storage view (t021) is two titled panels with transfer buttons
  between them. Beside a shop at 1080p that doesn't fit, so the tile uses ss_01's single Inventory window with
  ss_08's section heads. The kit has every piece for the two-panel layout (§5.1).
- **Grid pitch** is 68 px (the icons' 64 + 4) against the source's ~70.
- **The sim's backpack** is 10 × 6 and 20 kg (`src/sim/state.js`). The tile shows the source's 8 × 7, with an 8 kg
  limit to put the over-limit state on screen.
- **Contrast steps.** Buy, Confirm and Objective faces are stepped for AA at small sizes (§5.2). Both Buy faces sit
  about 4 L* below the source's, keeping its rest-to-hover step. Dim text is 12 levels lighter than measured. HUD
  text over the scene gets soft scrims the source doesn't have.
- **The modal scrim** dims to 62 % where the source ranges from none to near-black (§5.9).

Gaps:

- **Fonts.** Noto Sans and Noto Sans SC since checkpoint 1 (§3.2). Noto's ascent and descent are taller than the
  system faces', so two line boxes are the ones to watch when sizes change: the 22 px floor labels (they set
  `--ui-lh-title`, 28 px, rather than inheriting the 20 px body line) and the day counter, whose band is sized to
  hold its caps exactly (§5.10). The covered-text and overflow checks pass with the Noto faces in both languages.
- **No 3×3 render.** The kit sheet shows the frame; the tile has no 3×3 item.
- **The backdrop** is the P0-13 shell still, not the P0-08 spike (§8).
- **Panel opacity** is an estimate: α 0.90 from two methods that disagree by ±0.05 (§2.5).
- **What the slot bar measures.** In ss_08 the bacon's bar fills 0.74 of its slot at 3/4 servings, and every
  full-serving item has a full bar, so the source's bar may track servings. The kit follows the brief (freshness)
  and keeps the bar's value data-agnostic.
- **Not applied.** The kit isn't applied to the game's panels yet, by scope.

Follow-ups:

- **Art director: "Encumbered".** ss_02's HUD badge measures `#861f28` (`encumbered` in `measurements.json`; white
  on it is 9.4 : 1), not ART.md's `--ui-danger-badge` `#6b0102`. The kit keeps ART.md's token, which a test pins;
  the art director should decide whether to change it in ART.md.
- **Integrator (hook requests).**
  - Put `pages/ui-tile/backdrop.jpg` (a plain 300 KB blob today) into LFS with a `pages/**/*.jpg` and
    `pages/**/*.png` rule in `.gitattributes`.
  - Keep the dev pages (`ui-tile`, `spike`, `audio-test`) out of `dist`, or at least never ship source
    screenshots. Neither build does today: the boards read the frames in Node, not through the page.
- **Icons (WP-P0-12).**
  - A rotated item turns its render, so the baked shadow falls down-left. Render rotated or shadowless variants, or
    bake no shadow and let the kit draw one.
  - 2142 (water) is framed wide for a 1 × 2 footprint. Render it upright, or add a `turn` field to the manifest
    that `SlotIcon.turn` can read, replacing the tile's `ART_TURN`.
  - 3022 (book) is also wide in a 1 × 2 cell, but nearly square, so it is left as is.
- **English names (i18n lane).** Adopt the source's names of §3.5 in `EN_NAMES`.
- **Migration.** Apply the kit panel by panel: add `sl-root` and `lang` to the app root, load `kit.css`, then
  replace `styles.css` rules as each panel moves. `invgrid.js`'s 34 px emoji cells become `gridElement` and
  `slotElement` at 64 px.
