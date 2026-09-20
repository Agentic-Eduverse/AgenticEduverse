# DESIGN.md — Agentic EduVerse Roadshow (Style A · Signal Blue)

## Canvas & Master (A/B/C zones, exact px)
- Canvas: 1280 × 720.
- A · Title block: y 0–120 (padding-top 20). Page title 34px bold, color INK. A thin 4px
  accent underline (120px wide) sits below the title at y≈96. Title block right side stays
  empty (no decorative mini-images).
- B · Content zone: y 120–660 (540px usable). All content lives here.
- C · Footer: y 660–720. Left: "Agentic EduVerse · Roadshow 2026" 12px, INK at 45% opacity.
  Right: "NN / 14" 12px, same color. Cover (01) and closing (14) use custom layouts and
  may omit C.

## Palette (exactly 4 hex + opacity variants)
| Role | Hex | Usage area rule |
|---|---|---|
| PRIMARY `#1D4ED8` | deep signal blue | titles' accent line, key numbers, primary buttons, chart bars — ≤ 30% of a supporting page |
| ACCENT `#06B6D4` | cyan | only on the single focal element per page (big number underline, highlighted bar, "Live" badge) — ≤ 10% supporting, 15–20% hero |
| INK `#0F172A` | near-black | all body text, table text |
| SURFACE `#F1F5F9` | cool light gray | card backgrounds, table stripes, diagram fills |

- Text muted = INK with opacity 0.62 (do not introduce a 5th hex).
- Hero pages (02, 06, 12, 14) may push ACCENT to 15–20%.
- Screenshots are dark; place them on SURFACE cards with 12px radius and a soft shadow
  `0 8px 28px rgba(15,23,42,0.14)` so they float on the white background.

## Typography (2 families max)
- Family: `Segoe UI` everywhere (fallback Arial). Numbers keep the same family, different
  weight/size for contrast.
| Level | px | Weight |
|---|---|---|
| Cover title | 76 | bold |
| Anchor numbers | 88–120 | bold |
| Page title (A zone) | 34 | bold |
| Card heading | 21 | bold |
| Body | 15–16 | normal, lineHeight 1.55 |
| Caption / footer | 12 | normal |
- B2–C1 English: short sentences, no jargon, max ~14 words per line of body copy.

## Density
- Supporting pages: whitespace ≤ 35%; every page has ≥ 1 anchor (screenshot card ≥ 45% of
  B, or an 88px number, or a full-width diagram).
- Card groups: 3 cards max per row; each card ≥ 100 words worth of content (heading +
  2–3 short lines); tail elements pinned with marginTop auto.

## Image plan (all material screenshots, already captured at 3200×1800)
| File | Level | Page | Content (verified by Read) |
|---|---|---|---|
| assets/home_en.png | L1 | 01 | Hero landing, three role portals, dark neon style |
| assets/teacher_en.png | L1 | 04 | Teacher dashboard: 2 class cards, room codes, Live badge |
| assets/student_en.png | L1 | 05 | Student dashboard: coins, weekly stats, join class |
| assets/tutor_en.png | L1 | 06 | AI Tutor: 6 tabs, chat, 5 video suggestion cards with titles |
| assets/translator_en.png | L1 | 08 | Translator panel: 17 languages, source/target boxes |
| assets/parent_en.png | L1 | 09 | Parent dashboard: linked child, weekly report entry |
- All are PNG screenshots (same visual type — real product). No ImageGen needed;
  diagrams on 07/11/12 are SVG (structured/low-semantic → allowed).

## Page map
| # | File | Type | Role | Layout | L1 | Words | Whitespace | Color split | Constraints |
|---|---|---|---|---|---|---|---|---|---|
| 01 | 01_cover | cover | hero | full-bleed screenshot right 55% + left text | home_en.png | ~30 | 35% | PRIMARY 30 + screenshot | title 76px, no C zone |
| 02 | 02_problem | content | hero | two giant numbers side by side | — | ~110 | 40% | ACCENT 18% | anchors 96px |
| 03 | 03_solution | content | supporting | top text + 3-portal SVG flow | — | ~170 | 28% | PRIMARY 25 | SVG diagram ≥ 45% of B |
| 04 | 04_teacher | content | supporting | left text col 40% + right screenshot 60% | teacher_en.png | ~150 | 26% | PRIMARY 20 | screenshot in SURFACE card |
| 05 | 05_student | content | supporting | mirrored: screenshot left 58% + text right | student_en.png | ~150 | 26% | PRIMARY 20 | mirror of 04 |
| 06 | 06_ai_companion | content | hero | screenshot left 55% + right feature stack | tutor_en.png | ~160 | 24% | ACCENT 15% | ACCENT on "teaches, not cheats" |
| 07 | 07_video_finder | content | supporting | 4-step horizontal SVG flow + 3 stat chips | — | ~180 | 30% | PRIMARY 25 | flow ≥ 45% of B |
| 08 | 08_translation | content | supporting | text left 40% + screenshot right 60% | translator_en.png | ~140 | 27% | PRIMARY 20 | 17 & 8 as mini anchors |
| 09 | 09_parents | content | supporting | screenshot left 58% + text right | parent_en.png | ~150 | 26% | PRIMARY 20 | 3 safety chips |
| 10 | 10_classroom | content | supporting | 2×2 feature card grid, each w/ icon | — | ~220 | 26% | PRIMARY 22 | cards ≥ 100 words total each? (heading+3 lines) |
| 11 | 11_different | content | supporting | comparison table 3 cols | — | ~230 | 24% | PRIMARY 18 | our column tinted SURFACE+border |
| 12 | 12_market | content | hero | left giant number + right SVG bar chart | — | ~110 | 35% | ACCENT 18% | chart ≥ 45% of B, source note 12px |
| 13 | 13_business | content | supporting | top: 3 revenue cards; bottom: roadmap line | — | ~230 | 26% | PRIMARY 22 | roadmap 3 nodes with dates |
| 14 | 14_closing | closing | hero | centered statement + small logo line | — | ~40 | 45% | ACCENT 15% | statement 44px, no C zone |

## Gradient & translucency rules
- Allowed: `linear-gradient(135deg,#1D4ED8 0%,#06B6D4 100%)` only on cover text accent and
  the roadmap line; SURFACE cards may use `rgba(29,78,216,0.06)` wash.
- Screenshot cards: SURFACE background, radius 12, shadow as above.

## Self-check per page
A/B/C zones respected · ≤ 4 hex · 1 family · anchor present · role matches STORY.md ·
not a duplicate layout of the previous page · footer page number correct.
