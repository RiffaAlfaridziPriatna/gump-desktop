# Phase 3b Figma spec (read once, 2026-11-02)

Source: Figma file `W6N2UvJAw3J8NTuT60MlmB`, section "Photo Review" `12975:48188`. Read with `get_design_context` (sidebar nodes and sub-nodes). Sidebar width 246. Fonts: Red Hat Display (body) and Inter Semi Bold (headings, buttons, badges). Slices read this file instead of calling Figma. Raw values below are taken from the node output; nothing is guessed.

Not read: frames 12975:49760 (No picks sidebar), 12975:50177 (No results sidebar), 12975:50582 and 12975:51005 (grouped sidebars), 12975:53154 (call dropped; its Faces block is covered by 53266). Their copy and structure are in `phase-3b-sidebar-redesign.plan.md`. Sidebar sections below repeat across those frames.

## Tokens

| Use | Value |
|---|---|
| Orange (`theme/themeorange`) | `#ff9632` |
| Selected nav row bg | `#1e1e1e`, radius 8 |
| Divider | `#303030`, 1px |
| Muted text and checkbox border | `#737373` |
| Warning yellow (face status) | `#ffd700` |
| Status badge border | `#131415`, 2px |
| Photo card bg | `#161718`, radius 6, padding 8 8 12 8, gap 8 |
| Card overlay chip bg | `rgba(19,20,21,0.75)`, radius 100 |

## Sidebar (246 wide, column, gap 20, bottom padding 40)

Top stack (gap 16, full width):
- Upload Picked: bg orange, h 48, radius 100, padding L20 R24 T/B8, gap 8, icon 24, label "Upload Picked (148)" Red Hat Display Bold 16 white.
- Upload hint (only when picked photos are hidden by the view, frames 48906): row gap 6, padding X4, info icon 14, text "Upload includes picked photos outside this view." 12 `#737373`. Sits between Upload and Export.
- Export and Edit Photos: outlined orange 1px, h 48, radius 24, padding X24 Y8, gap 8, label Red Hat Display Bold 16 orange. Export icon 24, Edit Photos icon 22.

Panel (gap 14, width 246):
- Photo Filters heading: row gap 8, padding X12, chevron-up 16, sliders-horizontal 16, "Photo Filters" Inter Semi Bold 16 white.
- Nav rows (gap 8 between rows, each: padding X12 Y8, radius 8, gap 8, icon 16, label flex 14, count Red Hat Display Bold 14 white):
  - Selected: bg `#1e1e1e`, label Inter Semi Bold 14 white (frame 48189 All Photos, frame 49054 Picked for Upload).
  - Unselected: no bg, label Red Hat Display Regular 14 white.
  - "All Photos" icon layout-grid, count 635. "Picked for Upload" icon circle-check, count 148.
- Divider.
- AI Selection (padding X12, gap 10): out of phase 3b; copy and structure in frame 48189 nodes 48521 to 48535.
- Divider.
- AI Categories: caption "AI Categories" Red Hat Display SemiBold 16 white (padding X12, bottom 4); rows gap 4, each padding X12 Y5, gap 8: checkbox 16 (border 1px `#737373`, radius 3), icon 14, label flex Red Hat Display Regular 14 white, count Regular 14 `#737373`.
  - Checked: checkbox bg orange with white check icon 12 (frame 48906).
  - Rows in order: AI Recommended (sparkles, 61), Needs Review (circle-help, 92), Possible Blur (focus, 2), Possible Closed Eyes (eye-off, 120), Similar Shots (layers, 349).
- Divider.
- Faces in This Photo (padding X12, gap 10): heading row gap 6, chevron-up 16, scan-face 16, title Inter Semi Bold 16 white. Filename line Red Hat Display Regular 12 `#737373`.

### Faces states (nodes 53266, 53669, 54076, 54480)

| State | Heading | Filename line | Body |
|---|---|---|---|
| Before inspecting | "Faces in This Photo" | none | "Choose Inspect faces on a photo to check eyes and sharpness here." 13 `#737373` |
| Loading | "Faces in This Photo" | file name | row gap 8: loader-circle 16 plus "Loading face assessment…" 13 white |
| No faces | "Faces in This Photo" | file name | "No faces detected." 13 white |
| Unavailable | "Faces in This Photo" | file name | "Face assessment unavailable." 13 white |
| With faces | "Faces in This Photo · 5" (count is the face count) | file name | wrap grid, gap 12, items below |

Face item (width 66, column, gap 4, centered): crop 48x48; label 11 centered. Status badge 18x18, radius 9, border 2 `#131415`, at left 42 top 33 of the item.
- "Check eyes": label Inter Semi Bold `#ffd700`; badge bg `#ffd700` with closed-eyes icon 10.
- "Possible soft focus": label Inter Semi Bold `#ffd700`; badge bg `#ffd700` with "!" Red Hat Display Bold 12 `#131415`.
- "Eyes open": label Red Hat Display Regular `#737373`; no badge.
- "Unable to assess": label Red Hat Display Regular `#737373`; badge bg `#737373` with "?" Bold 11 white.

## Grid

Main area is 1082 wide next to the 246 sidebar; photo cards about 326 wide.

Photo card (node 53002, the card that holds "Inspect faces" in frame 52872):
- bg `#161718`, radius 6, padding 8 8 12 8, gap 8. Thumbnail 325.67 x 226.55.
- Footer row: gap 4, padding-right 2. Pick control 28x28 box with a 20x20 circle (picked: orange fill, white check 13). Filename Red Hat Display Regular 14 white (flex). Five stars 16 gap 4 (orange when rated).
- AI badges: at left 16, top 203.55 over the thumbnail, gap 4. Chip padding X8 Y4, radius 100, bg overlay token, label Inter Semi Bold 12. "Check eyes" has eye-off 12 and `#ffd700` text. A "+N" chip has white text.
- Inspect faces pill: at left 206.67, top 199.55; padding X10 Y6, radius 100, overlay bg, gap 6, scan-face 14, "Inspect faces" Inter Semi Bold 12 white.
- Focus ring: the card node shows no border. The plan describes a blue-indigo ring seen in screenshots. The ring is not in this node, so take its color, width and radius from the focused card's parent in frame 12975:52872 (not read).

Empty state "No picks" (node 49527, 1025 x 420, centered): "Pick photos using the circle beside each filename." Red Hat Display Regular 16 white centered.

Clear filters pill (node 50359, grouped frame): border 1px orange, radius 100, padding X14 Y6, "Clear filters" Inter Semi Bold 13 orange. In frame 49887 (no results) the pill is 111x33 and centered under "No photos match these filters."; in the grouped frame it is 102x28 at the right end of the Showing row.

Grouped view: group header "Group 1 · 4 shots · 1 picked" (node 50371, text 17 high); Showing row starts with "Showing:" text 57 wide.

## Focus ring lookup (2026-11-02)

Metadata of frame 12975:52872 was read once (get_metadata). The focused card "Photo" 12975:53002 has no border, outline or ring node: its children are Container (thumbnail), Container (footer), AI badges and Inspect faces only. The ring is not drawn in this frame. Color, width and radius are therefore still not in Figma; s4e keeps `colors.blue`, width 2, radius 8 as unverified placeholders. Card radius in Figma is 6 (see Grid). Frames 49760, 50177, 50582, 51005 not read.
