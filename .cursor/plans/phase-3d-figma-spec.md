# Phase 3d Figma spec: album look (presets)

Source: Figma W6N2UvJAw3J8NTuT60MlmB, read on 2026-11-02:

- Frame `12975:60712` "Change look - Style 3 selected": `get_design_context` returned sparse metadata, then one `get_design_context` on its popup `12975:61141` (Edit Photos look picker).
- Frame `12975:58242` "Change look - Apply to existing photos?": one `get_metadata`, then one `get_design_context` each on `12975:58671` (scope popup) and `12975:58664` (look status).

5 Figma calls in total. UI slices read this file and do not call Figma again. Only values that were read are listed. Decisions that differ from Figma are marked "Decision".

## Flow

1. Photo Review screen. Look status line on the right of the star filter row.
2. "Edit Photos" (sidebar) or "Change" (status line) opens the Edit Photos look picker.
3. "Use this look" closes the picker and opens the scope popup.
4. "All album photos" or "New photos only" closes the popup. The look is applied in the background.

Both popups sit on a full-screen overlay (`12975:58670`, color not read) and are 720 wide, centered.

## Edit Photos look picker (`12975:61141`)

- Container: white, radius 8, padding Y 40, column, centered. 720 x 802.8. Frame position x 360, y 49 on 1440 x 900.
- Content (`12975:61142`): width 480, column, gap 24, centered.
- Title (`12975:61187`): "Edit Photos". `Desktop/Title`: DM Serif Display Regular 28, line height 1.2, #131415, center, no wrap.
- Subtitle (`12975:61188`): "John Doe" placeholder. Decision: album name (`title`, fallback `name`). `Desktop/Body`: Red Hat Display Regular 16, line height 1.4, `GumpLight/Grey4` #454545, center.
- Body block (`12975:61189`): column, gap 12, align start, full width.
  - Preview (`12975:61190`): full width (480), aspect 312:212, object-fit cover. No radius was read. Decision: the focused grid photo, else the first album photo in grid order.
  - Before/After toggle (`12975:61208`): absolute, left 16, top 280.15 inside the body block (bottom-left of the preview), width 140, gap 6.
    - Before (`12975:61209`, unselected): border 1 white, radius 24, padding X 12 Y 3, width 67, label Red Hat Display Regular 14, line height 1.6, white.
    - After (`12975:61210`, selected): background `theme/themeorange` #FF9632, radius 24, padding X 12 Y 5, width 67, label Red Hat Display Regular 14, line height 1.4, white.
    - Decision: opens on After.
  - Caption (`12975:61191`): "Choose a look for this album". Red Hat Display SemiBold 14, line height 1.2, #131415.
  - Tiles (`12975:61192`): grid of 4 equal columns, gap 8, one row.
    - Tile: border 1 #E4E4E4, radius 8, padding top 4, X 4, bottom 6, column, gap 6, centered. Image aspect 171:114, radius 4, cover. Label Red Hat Display Regular 12, #131415, center, no wrap.
    - Selected tile (`12975:61199`): background rgba(255,150,50,0.1), border 1 #FF9632, label Red Hat Display SemiBold 12.
    - Current look label: "<name> · Current" (`12975:61198`).
    - Tile images in the screenshot show the same photo with each look applied.
    - Figma tiles: "Style 1", "Style 2 · Current", "Style 3", "Upload preset" (dashed #E4E4E4 box on #F5F5F5 with "+" Regular 28 #737373). Decision: tiles are Original, Clean Natural, Warm Romantic, Film Mood (catalog labels). No Upload preset tile.
    - Decision: on open, the selected tile is the album's current default look.
  - Note (`12975:61206` / `12975:61207`): "Applies to photos in this album and new photos added later." `Desktop/Label`: Red Hat Display Regular 14, line height 1.2, #131415. Row padding Y 8, centered.
- Actions (`12975:61211`): column, gap 12, centered.
  - Primary (`12975:61212`): "Use this look". #FF9632, height 48, radius 24, padding X 32 Y 8, gap 8, `Desktop/Button` (Red Hat Display Bold 16, line height 1.6, white). Hidden icon slot.
  - Secondary (`12975:61215`): "Cancel". Red Hat Display Regular 14, line height 1.44, #737373, center.
- Close (`12975:61231`): 24 x 24, top bar 720 wide with padding 24, right aligned.
- Decorations `12975:61216` (top) and `12975:61227` (bottom): same shapes as the scope popup.
- Decision: no intensity slider (Figma has none). Intensity is removed from the app; looks are always baked at 100.

## Scope popup "Apply this new look to existing photos too?" (`12975:58671`)

- Container: white, radius 8, padding Y 40, column, centered. 720 x 456. Frame position x 360, y 222.
- Content (`12975:58672`): width 480, column, gap 24, centered.
- Title (`12975:58717`): "Apply this new look to existing photos too?" Design breaks after "existing". `Desktop/Title`, #131415, center.
- Body (`12975:58718`): "Style 3 applies to future uploads." Decision: "<catalog label> applies to future uploads." `Desktop/Body`, #454545, center.
- Actions (`12975:58719`): column, gap 12, centered.
  - Primary (`12975:58720`): "All album photos". Same button style as "Use this look".
  - Secondary (`12975:58723`): "New photos only". Red Hat Display Regular 14, line height 1.44, #737373, center, no background.
- Close (`12975:58739`): same as the picker.
- Decorations: `12975:58724` (top band 720 x 145: lime half circle with orange ring top-left, orange quarter circle plus light blue circle top-right) and `12975:58735` (bottom 686 x 80: blue circle bottom-left, red quarter circle bottom-right).
- Decision: the popup closes as soon as an action is pressed. The work runs in the background, so there is no busy state.

## Look status line (`12975:58664`)

- Row, gap 8, items centered, font size 14, line height normal. 348 x 19.
- Parts:
  1. "Look: Style 2": Red Hat Display SemiBold 14, white. Decision: "Look: <catalog label>".
  2. "·": Red Hat Display Regular 14, #D1D1D1.
  3. "Auto-applies to new photos": Red Hat Display Regular 14, #D1D1D1.
  4. "·": same as 2.
  5. "Change": Inter SemiBold 14, #FF9632. Opens the picker.
- Decision: same row as the star filter (CulledAlbumFilterBar row), `justifyContent: 'space-between'`, status on the right. Figma position x 774, y 128 matches that row.
- Decision: hidden when the album default look is Original.

## Icons and assets

- No `download_assets` call. Decision: reuse the existing decoration SVGs in `src/assets/images/upload/` (blue_circle, half_circle, light_blue_circle, orange_quarter_circle, red_quarter_circle) and the existing close control. The UI slice compares them with the screenshots; if they differ, it stops and asks.
- No icon inside photo cards, so no PNG 512 export.

## Not read

- Overlay color and opacity, popup shadow.
- Hover and pressed states of tiles, buttons, the toggle and "Change".
- Tile state while its look preview is still baking.
