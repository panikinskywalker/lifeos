# LifeOS — design system (v1.0, 25 Sep 2026)

Source of truth: the **LifeOS** Claude Design canvas (https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), its "Components & tokens" sheet and 16 screens (Today, Upkeep, This week, Talk — light and dark — Browse, Transactions, Vehicle / Person / Subscription records, New routine, You). Values below are copied from it; code lives in `src/ui/theme/tokens.ts`.

## Direction

Apple-Health-style bento, calmer: near-white ground, tiles one shade off, muted module tints each with an ink of the same hue, big tabular numbers, thin 2px stroke icons (Lucide geometry). No shadows, no gradients, no emoji, no glassmorphism.

## Tokens

### Colour · surfaces & text
| Token | Light | Dark | Use |
|---|---|---|---|
| `bg.ground` | `#FAFAF7` | `#141614` | screen background, sheet body |
| `bg.tile` | `#F1F1EC` | `#1E211E` | tiles, cards, rows, inputs on the ground |
| `bg.tileRaised` (nested / control) | `#FAFAF7` | `#272B27` | controls sitting on a tile |
| `bg.bar` (nav bar, toast) | `#17201C` | `#242A26` | bottom bar, toast |
| `fg.primary` (ink) | `#1B1F1D` | `#EDEEEA` | headings, numbers, body |
| `fg.secondary` | `#6F7773` | `#9AA19C` | captions, meta |
| `fg.tertiary` | `#A3A9A5` | `#6C736E` | chevrons, faint icons |
| `fg.onBar` | `#AEB5B0` | `#8F978F` | inactive nav |
| `line` (track) | `#E4E4DD` | `#333833` | segmented / toggle / chip tracks |
| `ringTrack` | `#E3E3DB` | `#343934` | unfilled ring |
| `accent.mustard` | `#F3C84B` | `#F3C84B` | primary action, Talk, selected, today |
| `accent.mustardInk` | `#1B1F1D` | `#1B1F1D` | text/icons on mustard |
| `accent.mustardSoft` | `#FBEFC6` | `#5D533C`* | reminder icon-box |
| `alert.coral` | `#E9635A` | `#F07A71` | overdue fills, dots |
| `alert.coralText` | `#B8382F` | `#F5A29B` | overdue text and icons |
| `alert.coralFill` | `#F8D9D5` | `#4A2724` | overdue chip / icon-box |
| `ok.sage` | `#8FB596` | `#5F7F65` | done fill |

\* working value (the canvas shows it in light only).

### Module tints (tile fill / ink of the same hue)
| Module | Light fill | Light ink | Dark fill | Dark ink |
|---|---|---|---|---|
| Finance · sand | `#F4E8CC` | `#6E5010` | `#5D533C` | `#E8D7B0` |
| Upkeep · sage (Things share it) | `#CFE0D1` | `#2F6142` | `#3C5D40` | `#BCDCC0` |
| People · rose | `#EFCDC8` | `#94423C` | `#5D403C` | `#E8B7B0` |
| Tasks · sky | `#CFDDEB` | `#2E5A84` | `#3C4D5D` | `#B2CCE6` |
| Health · mint | `#CDE6DD` | `#24654B` | `#3C5D51` | `#B6E2D2` |
| Notes / Memory · lavender | `#DDD5EA` | `#544483` | `#483C5D` | `#C7B6E2` |
| Travel · peach | `#F4D9C4` | `#8E4F22` | `#5D4A3C` | `#E8C8B0` |
| Documents · stone | `#DEDCD3` | `#54544A` | `#575342` | `#DBD6BD` |

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

### Open contrast items
`fg.secondary` on tile is 4.06:1 and on ground 4.40:1, `alert.coralText` on `alert.coralFill` 4.36:1 — just under AA 4.5 for 13px text. Kept as designed; raise with the canvas if it matters on device.

## Components (M1 builds these)
Tile (1×1, 2×1, 2×2; header row = icon-box + label + meta; body = stat or list; optional footer StackedBar) · StatTile · StackedBar (rounded segments, 3 px gaps, legend row) · Ring · RowItem (icon-box · title/sub · trailing value or checkbox) · Chip / FilterChip · Sheet (bottom) · Toast with Undo · EmptyState (illustration-free: icon-box + one line + one button) · Segmented · Form fields (text, number, money, date, select, relation picker, tags) · RecordHeader (module tint band, title, status chip, key stats) · SectionCard · WeekStrip (Upkeep) · AgentCard (record / cycle / list / number / chart) · Composer (text, mic, send).

## Screens to match the canvas
Today · Upkeep (list + This week) · Talk thread · Browse · Record (Vehicle, Person, Subscription) · List · Form · You. Light and dark for each.
