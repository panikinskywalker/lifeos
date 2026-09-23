# LifeOS — design system (v0.9, 23 Sep 2026)

Source of truth will be the Claude Design canvas once Rutvij shares it; until then these are the locked directions and working tokens. **When the canvas arrives, replace the token values below with the exact ones from the canvas and delete this line.**

## Direction

Apple-Health-style bento grid, but calmer: warm bone ground, muted pastel module tints, rounded stacked bars, big tabular numbers, thin stroke icons. No shadows, no gradients, no emoji, no glassmorphism. Whitespace does the separating; tiles are one shade off the ground.

## Tokens

### Colour (light)
| Token | Value | Use |
|---|---|---|
| `bg.ground` | `#F4F3EE` | screen background |
| `bg.tile` | `#ECEBE5` | bento tiles, cards |
| `bg.tileRaised` | `#FFFFFF` | sheets, inputs |
| `bg.bar` | `#17201C` | bottom bar |
| `fg.primary` | `#1B1F1D` | headings, numbers |
| `fg.secondary` | `#6F7773` | captions, meta |
| `fg.tertiary` | `#A2A8A4` | placeholders, dividers text |
| `line` | `#E2E0D8` | hairlines |
| `accent.mustard` | `#F3C84B` | primary actions, Talk button, selected |
| `accent.mustardInk` | `#5A4300` | text on mustard |
| `alert.coral` | `#E9635A` | overdue, destructive |
| `ok.sage` | `#8FB59B` | done, on-track |

### Module tints (tile fill / ink)
| Module | Fill | Ink |
|---|---|---|
| Finance | sand `#F1DFB8` | `#6B4F12` |
| Upkeep / Things | sage `#CFE0D1` | `#2E5A3C` |
| People | dusty rose `#EFCDC8` | `#7A3A34` |
| Tasks / Projects | sky `#CFDDEB` | `#2B4A66` |
| Health / Habits | mint `#CDE6DD` | `#215546` |
| Notes / Memory | lavender `#DDD5EA` | `#4B3D6B` |
| Travel | peach `#F4D9C4` | `#7A4520` |
| Documents | stone `#DEDCD3` | `#4C4B44` |

### Dark
Ground `#141614`, tile `#1E211E`, raised `#262A27`, fg.primary `#F1F0EA`, fg.secondary `#9AA19C`, line `#2C302D`. Tints keep hue, drop to ~30% lightness with ink at ~80%. Mustard stays `#F3C84B`.

### Type
Family: **Manrope** (fallback Plus Jakarta Sans, DM Sans). Tabular numerals everywhere numbers appear.

| Style | Size/line | Weight |
|---|---|---|
| display | 40/44 | 800, -0.03em |
| title | 28/32 | 800, -0.02em |
| heading | 20/26 | 700 |
| body | 15/22 | 600 |
| caption | 12/16 | 600 |
| stat | 26/28 | 800, tabular |

### Shape & space
Radius: tile 20 · card 16 · chip 999 · input 12 · icon-box 10. Spacing scale 4/8/12/16/20/24/32. Screen gutter 20. Grid gap 12. Bottom bar 62 high, radius 22, inset 20.

### Icons
Inline SVG, 24 viewBox, stroke 2 (2.2 in icon-boxes), round caps/joins, `currentColor`. Never an icon font. Required set: home, wrench, sparkle (Talk), grid, user, search, plus, check, bell, calendar, car, card, receipt, repeat, tag, link, paperclip, comment, clock, alert, chevron-right, chevron-left, more, trash, undo, edit, filter, sort, star, pin, mic, send, share, lock, moon, sun, settings, shoe, shirt, drop, leaf, heart, activity, book, plane, file, folder, people, wallet, chart, trend.

## Components (M1 builds these)
Tile (1×1, 2×1, 2×2; header row = icon-box + label + meta; body = stat or list; optional footer StackedBar) · StatTile · StackedBar (rounded segments, 3 px gaps, legend row) · Ring · RowItem (icon-box · title/sub · trailing value or checkbox) · Chip / FilterChip · Sheet (bottom) · Toast with Undo · EmptyState (illustration-free: icon-box + one line + one button) · Segmented · Form fields (text, number, money, date, select, relation picker, tags) · RecordHeader (module tint band, title, status chip, key stats) · SectionCard · WeekStrip (Upkeep) · AgentCard (record / cycle / list / number / chart) · Composer (text, mic, send).

## Screens to match the canvas
Today · Upkeep (list + This week) · Talk thread · Browse · Record (Vehicle, Person, Subscription) · List · Form · You. Light and dark for each.
