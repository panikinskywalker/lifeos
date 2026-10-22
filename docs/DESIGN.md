# LifeOS — design system

## v3 Noir — the design language from 22 Oct 2026

**Source of truth:** the **v3 Noir** page of the LifeOS Claude Design canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), artboards
`project/NR-*.dc.html`: Today, Kit · components, Kit · charts, Kit · records &
profiles, Kit · trips, Kit · instruments, Field type kit (15 types × 4
places). Rutvij adds to it as features are added; read the matching artboard
(Artifact tool, `action: read`, `path`) before building or restyling a screen,
and copy its sizes and colours exactly rather than guessing. A saved export of
the same page: `~/Downloads/LifeOSdardnoir.html`. Turf web already wears Noir
(its own `TF-*` / `W-*` / `P-*` artboards on the same canvas).

Measured from the NR artboards on 22 Oct (the artboards win if they differ):

| Token | Value | Use |
|---|---|---|
| ground | `#0B0B0D` | screen background; ink on lime and on light blocks |
| card | `#1A1A1E` | cards, tiles, row groups |
| raised | `#26262B` | nested slab, secondary button, chips, inputs |
| hairline | `rgba(255,255,255,0.08)` (1px) | dividers, card edges |
| outline | `1.5px rgba(245,245,247,0.22)` | outlined pills and buttons |
| text | `#F5F5F7` · secondary 62% · tertiary 42% | body, meta, labels |
| accent · lime | `#D7F55C`; soft `rgba(215,245,92,0.16)`; glow `0 10px 30px rgba(215,245,92,0.25)` | primary action, today, selected, the big number block |
| colour blocks | sky `#A9C4FF` · orange `#F26B2B` · pink `#F4A8CE` · yellow `#F6E27F` · lilac `#C9A7F5` | tiles on a colour, module discs, chart series |
| gradients | teal `#2E7F94 → #5FB7C8 → #8AD3DD` · warm `#D9602E → #F0A050 → #F7B26A` (radial, with dot-matrix) | hero tiles, records, trips |
| alert | `#FF5C47` · soft text `#FF8A7A` | overdue, errors |
| instruments | orange `#F0622E` on charcoal | gauges and readouts |

- **Type**: Plus Jakarta Sans; weights 600 / 700 (400 for body). Sizes 11 ·
  12 · 13 · 15 · 16 · 22, numbers 30 / 34 / 44 at 700 with −1.5px tracking
  and tabular numerals. Section labels 11 / 600, UPPERCASE, +0.9px, tertiary.
  **JetBrains Mono** 10 / 500 UPPERCASE +0.6px for numbered labels and
  instrument readouts; a serif (Playfair Display) only for the rare display
  line on records and trips.
- **Shape**: pills `999` (chips, status, option pills, buttons, nav); cards
  20 / 24 / 28; inner slabs 16 / 22; small 9 / 12. Buttons 52 tall, 15 / 700:
  lime with ground ink (primary), raised with text (secondary).
- **Depth**: soft shadows on sheets and toasts (`0 -8px 24px rgba(0,0,0,0.35)`),
  the lime glow on the primary block, blur 10 on pills over photos. Gradients
  and dot-matrix are allowed; glass is not.
- **Icons**: unchanged: inline SVG, 2px strokes (below).

**In code since LifeOS v0.0.4 (22 Oct):** the dark theme is Noir and the
default appearance (`src/ui/theme/tokens.ts`: colours, module discs, colour
blocks, gradients; Noir type and shapes for both themes); JetBrains Mono is
installed and loaded (Playfair Display is not yet: no screen needs it). The
kit follows NR-KitComponents: pill buttons 52 / 44, round 44 actions, chips
40 with white selected, status pills 28, option pills 30, row cards 24 with
40 discs, 17/600 section headers, the caption-over-title top bar, inputs 20
with a hairline / white focus ring, the 32 sheet, the white toast pill, the
metrics row, colour-block tiles (`filled`, everything black via `OnBlock`),
the 22 progress bar, the nav (a pill of 52 discs + the 64 lime Dump disc),
and the Browse module stack (`ModuleStack`). Today's My day is the NR
checklist and Spend the orange block. The light theme keeps the v1.1 colours
until it is redrawn or dropped (Rutvij's call).

## History: v1.1 Calm bento (25 Sep 2026, retired 22 Oct)

Sources of truth: **colours** from the Stitch "LifeOS Android design system" (M1.5, `stitch_lifeos_android_design_system.zip`, Material 3 roles); **layout and components** from the **LifeOS** Claude Design canvas (https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF) and, phase by phase (MILESTONES M1.5), the Stitch screens. Code lives in `src/ui/theme/tokens.ts`.

## Direction

Calm bento, editorial: warm cream ground, tiles in stepped surface levels (a slab nested in a tile is one level lighter), gold/mustard accent, sage for "done / optimal", steel and soft data colours for charts, big tabular numbers, small UPPERCASE labels, thin 2px stroke icons (Lucide geometry). No shadows, no gradients, no emoji, no glassmorphism. Our dark bottom bar with the raised mic stays.

## Tokens

### Colour · surfaces & text
Stitch role in brackets. Dark is derived by us (Stitch is light only).
| Token | Light | Dark | Use |
|---|---|---|---|
| `bg.ground` (surface) | `#FCF9F4` | `#141311` | screen background, sheet body |
| `bg.tile` (container-high) | `#EBE8E3` | `#252420` | bento tiles, cards, rows |
| `bg.tileRaised` (container-low) | `#F6F3EE` | `#1D1C19` | slab / control nested in a tile |
| `bg.container` (container) | `#F0EDE8` | `#211F1C` | secondary tiles, chat bubbles |
| `bg.lowest` (container-lowest) | `#FFFFFF` | `#0F0E0C` | segmented track, composer |
| `bg.dim` (surface-dim) | `#DCDAD5` | `#3A3833` | tracks, quiet buttons |
| `bg.bar` | `#1C1C19` | `#2B2A26` | bottom bar, toast (ours) |
| `fg.primary` (on-surface) | `#1C1C19` | `#E6E2DC` | headings, numbers, body |
| `fg.secondary` (on-surface-variant) | `#4D4635` | `#D1C5AF` | captions, meta |
| `fg.tertiary` (outline) | `#7F7663` | `#9A9079` | chevrons, faint icons, axis labels |
| `line` / `ringTrack` | `#DCDAD5` | `#3A3833` | tracks, hairlines |
| `rail` (outline-variant) | `#D1C5AF` | `#4D4635` | timeline rail, chart gridlines |
| `accent.mustard` (primary-container) | `#F3C84B` | `#F3C84B` | primary action, Talk, selected |
| `accent.mustardInk` (on-primary-fixed) | `#241A00` | `#241A00` | text/icons on mustard |
| `accent.gold` (primary) | `#755B00` | `#ECC245` | accent text, links, icons |
| `accent.mustardSoft` (primary-fixed) | `#FFE08F` | `#584400` | reminder icon-box, highlight |
| `alert.coral` | `#E9635A` | `#F07A71` | overdue / flag dots and fills |
| `alert.coralText` (error) | `#BA1A1A` | `#FFB4AB` | overdue text and icons |
| `alert.coralFill` (error-container) | `#FFDAD6` | `#5C1F1A` | overdue chip / icon-box |
| `ok.sage` (secondary-fixed-dim) | `#BFCC9E` | `#5B6741` | done fill, checkbox |
| `ok.sageText` (secondary) | `#57633D` | `#BFCC9E` | "Done", positive deltas |
| `ok.sageFill` (secondary-container) | `#D8E5B5` | `#404B27` | "Optimal / done" pill |
| `chart[0..4]` | `#6F9E88` `#7F9BB0` `#8C7FB0` `#C89AA6` `#8E9B70` | lighter of each | mint · sky · lavender · rose · olive |

### Module tints (tile fill / ink of the same hue, from the Stitch data palette)
| Module | Light fill | Light ink | Dark fill | Dark ink |
|---|---|---|---|---|
| Finance · gold | `#F7E7B4` | `#584400` | `#584400` | `#FFE08F` |
| Upkeep · mint (Things share it) | `#CFE2D8` | `#284938` | `#284938` | `#CFE2D8` |
| People · rose | `#F0DCE1` | `#7A3E4E` | `#5A2E3A` | `#F0DCE1` |
| Tasks · steel | `#D3E3EF` | `#2E4A5C` | `#2E4A5C` | `#C9E6FD` |
| Health · sage | `#D8E5B5` | `#404B27` | `#404B27` | `#DAE8B8` |
| Notes / Memory · lavender | `#E1DCEF` | `#4B3F75` | `#3D3361` | `#E1DCEF` |
| Travel · terracotta | `#F5DCCB` | `#7A4420` | `#5E3418` | `#F5DCCB` |
| Documents · stone | `#E5E2DD` | `#4D4635` | `#4D4635` | `#E5E2DD` |

### Type · Plus Jakarta Sans (Stitch), tabular numerals wherever numbers appear
| Style | Spec | Token |
|---|---|---|
| Hero metric | 36 / 700 · −0.025em · tnum | `display` |
| Metric | 26 / 600 · −0.015em · tnum | `stat` |
| Screen title | 30 / 700 · −0.025em | `title` |
| Tile / section headline | 19 / 600 · −0.015em | `heading` |
| Row title | 15 / 600 | `rowTitle` |
| Body | 15 / 400 · −0.005em | `body` |
| Tile title | 14 / 600 | `tileTitle` |
| Caption | 13 / 400 · secondary | `caption` |
| Chip / field label | 13 / 600 | `label` |
| Label caps | 12 / 600 · +0.06em · UPPERCASE | `labelCaps` |
| Micro label | 10 / 700 · +0.05em · UPPERCASE | `labelMicro` |
| Nav | 11 / 600 | `nav` |

Buttons 15/700 (primary) and 15/600. Money values in rows 15/700.

### Radius
Tile 24 · card / row / nested slab / sheet body 16 · icon button 30% of its size (40 → 12) · sheet top 24 · record band bottom 28 · button 14 · input 14 · icon-box 10 · checkbox 7 · bar segment 7 (14 tall) · chip / segment / toggle pill · nav bar 22.

### Strokes & spacing
Icons 2px, round caps and joins, 24 grid; sizes 22 nav · 18 row · 16 tile · 14 chip. Stacked-bar gap 3px. Page gutter 20, tile gap 12. Tile padding 16, row padding 12. Frames 390 wide. Nav bar 66 high, radius 22, inset 20, centre Talk raised (58 mustard disc, mic).

### Icons
Inline SVG, 24 viewBox, stroke 2, round caps/joins, `currentColor`. Never an icon font. Required set: home, wrench, sparkle (Talk), grid, user, search, plus, check, bell, calendar, car, card, receipt, repeat, tag, link, paperclip, comment, clock, alert, chevron-right, chevron-left, more, trash, undo, edit, filter, sort, star, pin, mic, send, share, lock, moon, sun, settings, shoe, shirt, drop, leaf, heart, activity, book, plane, file, folder, people, wallet, chart, trend.

### Contrast
All text pairs meet AA 4.5 in both themes (secondary on tile 7.7 / 9.1, every tint ink on its fill ≥ 6.0, coral text on coral fill 5.0 / 7.4). `fg.tertiary` on tile is 3.7:1 in light — used for icons and axis labels only, never body text.

## Components (M1 builds these)
Tile (1×1, 2×1, 2×2; header row = icon-box + label + meta; body = stat or list; optional footer StackedBar) · StatTile · StackedBar (rounded segments, 3 px gaps, legend row) · Ring · RowItem (icon-box · title/sub · trailing value or checkbox) · Chip / FilterChip · Sheet (bottom) · Toast with Undo · EmptyState (illustration-free: icon-box + one line + one button) · Segmented · Form fields (text, number, money, date, select, relation picker, tags) · RecordHeader (module tint band, title, status chip, key stats) · SectionCard · WeekStrip (Upkeep) · AgentCard (record / cycle / list / number / chart) · Composer (text, mic, send).

**Added in M1.5 / M2 (Stitch):** ProgressBar (8 tall, optional target tick) · Sparkline · LineChart and ColumnChart (dotted gridlines, y labels right, friendly steps) · ChartLegend · StatTrio (three metrics in one tile) · AttentionCard (coral eyebrow, URGENT pill, estimate, two actions) · QuickActions (horizontal "+ action" pills) · DayTimeline (lanes of segments over a span) · status pills (`Chip caps`) · RecordHeader cover photo. Record pages put a type's trio / attention / quick actions above the details (`placement: 'top'`).

## Screens to match the canvas
Today · Upkeep (list + This week) · Talk thread · Browse · Record (Vehicle, Person, Subscription) · List · Form · You. Light and dark for each.
