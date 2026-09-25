# LifeOS — design system (v1.1, 25 Sep 2026)

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

### Type · Manrope, tabular numerals wherever numbers appear
| Style | Spec | Token |
|---|---|---|
| Stat · hero | 36 / 800 · −0.02em · tnum | `display` |
| Stat | 26–32 / 800 · −0.02em · tnum | `stat` (28) |
| Screen title | 30 / 800 · −0.02em | `title` |
| Section | 17 / 800 · −0.01em | `heading` |
| Row title | 15 / 700 | `rowTitle` |
| Body | 15 / 600 | `body` |
| Tile title | 14 / 700 | `tileTitle` |
| Caption | 13 / 600 · secondary | `caption` |
| Chip | 13 / 700 · pill | `label` |
| Label caps | 12 / 700 · +0.08em | `labelCaps` |
| Nav | 11 / 700 | `nav` |

### Radius
Tile 20 · card / row / sheet body 16 · sheet top 24 · record band bottom 28 · button 14 · input 14 · icon-box 10 · checkbox 7 · bar segment 7 (14 tall) · chip / segment / toggle pill · nav bar 22.

### Strokes & spacing
Icons 2px, round caps and joins, 24 grid; sizes 22 nav · 18 row · 16 tile · 14 chip. Stacked-bar gap 3px. Page gutter 20, tile gap 12. Tile padding 16, row padding 12. Frames 390 wide. Nav bar 66 high, radius 22, inset 20, centre Talk raised (58 mustard disc, mic).

### Icons
Inline SVG, 24 viewBox, stroke 2, round caps/joins, `currentColor`. Never an icon font. Required set: home, wrench, sparkle (Talk), grid, user, search, plus, check, bell, calendar, car, card, receipt, repeat, tag, link, paperclip, comment, clock, alert, chevron-right, chevron-left, more, trash, undo, edit, filter, sort, star, pin, mic, send, share, lock, moon, sun, settings, shoe, shirt, drop, leaf, heart, activity, book, plane, file, folder, people, wallet, chart, trend.

### Contrast
All text pairs meet AA 4.5 in both themes (secondary on tile 7.7 / 9.1, every tint ink on its fill ≥ 6.0, coral text on coral fill 5.0 / 7.4). `fg.tertiary` on tile is 3.7:1 in light — used for icons and axis labels only, never body text.

## Components (M1 builds these)
Tile (1×1, 2×1, 2×2; header row = icon-box + label + meta; body = stat or list; optional footer StackedBar) · StatTile · StackedBar (rounded segments, 3 px gaps, legend row) · Ring · RowItem (icon-box · title/sub · trailing value or checkbox) · Chip / FilterChip · Sheet (bottom) · Toast with Undo · EmptyState (illustration-free: icon-box + one line + one button) · Segmented · Form fields (text, number, money, date, select, relation picker, tags) · RecordHeader (module tint band, title, status chip, key stats) · SectionCard · WeekStrip (Upkeep) · AgentCard (record / cycle / list / number / chart) · Composer (text, mic, send).

## Screens to match the canvas
Today · Upkeep (list + This week) · Talk thread · Browse · Record (Vehicle, Person, Subscription) · List · Form · You. Light and dark for each.
