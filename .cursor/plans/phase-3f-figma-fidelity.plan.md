---
name: phase-3f-figma-fidelity
overview: Bring the phase 3 UI (3a to 3e) to Figma. A read-only audit on 2026-11-08 compared Figma numbers with the code and found many differences. Biggest causes - SemiBold fonts (Inter and Red Hat Display) are not bundled, the photo card has no Figma shell, the Similar Shots strip was built from an older design, shared modal parts lack radius, and the Export popup was never aligned. This plan fixes them per area with numeric acceptance. No new features.
approved: true
todos:
  - id: s8a
    content: Bundle Inter SemiBold and Red Hat Display SemiBold, add font tokens
    status: completed
  - id: s8g
    content: Shared modal parts - ProgressBar radius, Modal radius, padding and close, shared decorations
    status: completed
  - id: s8b
    content: Photo card shell, footer, pick control, stars, delete, focus ring, grid metrics
    status: completed
  - id: s8d
    content: Similar Shots strip rebuilt to Figma
    status: completed
  - id: s8e
    content: Photo viewer header, gaps and face badges
    status: completed
  - id: s8f
    content: Sidebar gaps, fonts, icons and colors
    status: completed
  - id: s8h
    content: Upload popup and cloud storage card alignment
    status: completed
  - id: s8i
    content: Export popup alignment
    status: completed
  - id: s8j
    content: Look picker, scope popup and look status alignment
    status: completed
  - id: s8k
    content: AI Selection toast width, icons and stacking
    status: completed
  - id: s8c
    content: AI badges, similar shots chip and group header bars
    status: completed
isProject: false
---

# Phase 3f: Figma fidelity

Source: user report (2026-11-08: badge on photos and the selected filter do not match Figma), read-only audit of four areas on 2026-11-08 (photo card and badges, sidebar, AI Selection and viewer, upload/export/look modals), Figma file `W6N2UvJAw3J8NTuT60MlmB` section "Photo Review" `12975:48188`, `.cursor/plans/phase-3a-similar-shots.plan.md`, `phase-3b-figma-spec.md`, `phase-3c-figma-spec.md`, `phase-3d-figma-spec.md`, `phase-3e-ai-selection.plan.md`, `.cursor/rules/project-map.mdc`.

Ids use `s8*`. Phase 3a `s3*`, 3b `s4*`, 3c `s5*`, 3d `s6*`, 3e `s7*`.

Branch: base from `feat/phase-3` (contains 3a to 3e).

## How to run

- Set `approved: true` in the frontmatter after review.
- Next pending group: `/run-group-prompt phase-3f-figma-fidelity` (or `/run-group-prompt` alone to follow the roadmap).
- One slice by hand: `/slice-prompt <id>`, then commit.
- After the group: read the Gate R report, merge the branch or run `/fix-prompt`.
- Every slice is verified against Figma numbers by Jest style assertions, but nothing here renders the app. The "Manual check" acceptance items are for a person running the macOS and Windows builds next to the Figma frame; agents do not run them.

## Done

- Audit findings (2026-11-08) are the source of the numbers in each slice. Figma values were read with `get_design_context`; code values come from the files named per slice.
- Bundled fonts today (`src/assets/fonts`, `macos/.../Fonts`): `RedHatDisplay-Regular`, `RedHatDisplay-Medium`, `RedHatDisplay-Bold`, `DMSerifDisplay-Regular`. `src/lib/ui/typography.ts` exposes only `fonts.serif`, `fonts.sans` (Regular) and `sansBoldStyle`. Inter is not bundled and no SemiBold exists.
- Verified as matching Figma and left alone: popup title (DM Serif 28), storage card (border, radius, padding), banners, primary and secondary buttons in `UploadPopupParts`, picker 720x803, scope popup 720x456, picker tile, AI Selection segments, help text, note, toast text sizes, toast padding, sidebar divider, category rows, checkbox box, filter row bg `#1e1e1e` and radius 8.

## Decisions

- UI follows Figma 100% (standing user rule). Where Figma and the earlier code differ, Figma wins unless listed here.
- Fonts (user, 2026-11-08): bundle a real Inter SemiBold (not the system font with `fontWeight`), and bundle Red Hat Display SemiBold copied from `camera-to-phone/assets/fonts/RedHatDisplay-SemiBold.ttf`. The Inter file is not in any local repo: it is downloaded (Google Fonts, OFL) by s8a, and the exact filename, source URL and size are stated to the user before the download.
- Viewer side panel (user, 2026-11-09): "Faces in This Photo" as in Figma replaces "Key Faces" in the viewer. Unblocks s8e.
- Culling toast ETA (user, 2026-11-09): Figma frame 12975:29262 adds "About X min left" to the analyze toast. Computed client-side from observed pace, hidden until 5 photos finished, in analyze and local import (upload) toasts, not server upload (`lib/culledAlbum/analysisEta.ts`). Close icon and ProgressBar already match; label stays "Analyzing N photos" (Figma says "Culling N photos", not changed).
- Face zoom in viewer (user, 2026-11-09): tapping a face in the viewer panel zooms to it, tapping the selected face again clears the zoom. Panel viewer variant takes `onFacePress` and `selectedIndex`.
- Export popup (user, 2026-11-09): Figma copy replaces the current copy. Anything the app does that Figma does not show (for example the saved path card) is kept and handled in the Figma style. Unblocks s8i.
- Accepted deviations stay: upload popup width 720 (user), Figma token contrast kept (white on orange 2.17:1, `#737373` 3.89:1), "Choose fewer photos" copy kept.
- Not changed because Figma shows none: previous and next chevrons in the viewer, viewer image frame background and radius, Add Photos button.

## Execution waves

| Group | Wave | Slices | Parallel? | Waits for | Merge order / shared-touch |
|-------|------|--------|-----------|-----------|----------------------------|
| Fidelity | W1 | s8a, s8g | yes | - | s8a (`typography.ts`, assets, native font registration), then s8g (`ui/Modal.tsx`, `ui/ProgressBar.tsx`, new shared decorations) |
| Fidelity | W2 | s8b, s8d, s8e, s8f, s8h, s8i, s8j, s8k | yes, at most 3 at once | W1 merged | s8b (`colors.ts`), s8d, s8e, s8f, s8h, s8i, s8j, s8k; run in batches of 3 in this order |
| Fidelity | W3 | s8c | no | W2 merged | `PhotoAiBadges.tsx`, `SimilarShotsBadge.tsx`, `SimilarShotGroupHeader.tsx` |

## Fidelity group (audit 2026-11-08)

### s8a. Bundle SemiBold fonts and tokens [W1, parallel: s8g]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** -
- **Parallel:** yes, with s8g (fonts and tokens vs modal primitives; no common file)
- **Shared-touch:** `src/lib/ui/typography.ts`, `package.json` only if the font loader needs it (inferred, confirm), native font registration (macOS Info.plist and Windows resources)
- **Scope:** add `Inter-SemiBold` and `RedHatDisplay-SemiBold` font files to `src/assets/fonts` and to the macOS and Windows font registration the same way `RedHatDisplay-Medium` is registered. Add tokens `fonts.sansSemiBold` (Red Hat Display SemiBold) and `fonts.interSemiBold` (Inter SemiBold), plus style helpers next to `sansBoldStyle` that set the family and no `fontWeight`.
- **Rules:** no `fontWeight: '600'` on a Regular font name (renders as an undefined weight). The Windows font fallback for Inter must be checked, not assumed. Slices s8b to s8k use the tokens; this slice replaces no usage.
- **Mirror:** how `RedHatDisplay-Medium` and `RedHatDisplay-Bold` are registered on both platforms.
- **Open:**
  - **Font files.** Checked in the source on 2026-11-08: `native` bundles only `RedHatDisplay` Regular, Medium and Bold and `DMSerifDisplay-Regular` (registered in `AppDelegate.mm`, `Info.plist`, `windows/GumpDesktop/GumpDesktop.cpp`, `GumpDesktop.vcxproj`, `macos/link-assets-manifest.json`). There are 15 `fontWeight: 600` usages in `src`, but no SemiBold file, so they do not render a real SemiBold. `RedHatDisplay-SemiBold.ttf` exists in the sibling repo `camera-to-phone/assets/fonts` (its Regular file is byte-identical to this repo's, md5 match), so it can be copied locally with no download. Inter exists in no repo here (`native`, `site`, `camera-to-phone`); "Inter" appears in `native/src` only in three comments saying it is not bundled. Decided: bundle Inter SemiBold (see Decisions); the download needs the user's approval of the exact file, source and size at run time.
  - **Which family the designer intends.** The same Figma panel mixes Inter SemiBold (Photo Filters heading, selected filter row, Faces heading, badges, group headers, "Update recommendations") with Red Hat Display SemiBold (AI Selection and AI Categories captions, several modal values). Confirm that Inter is intended and not a Figma fallback. If it is a fallback, drop `fonts.interSemiBold` and use Red Hat SemiBold everywhere (changes s8b to s8k).
  - How macOS resolves `fontWeight: '600'` against a Regular PostScript name was not verified.
- **Acceptance:**
  - [ ] Both font files exist and are registered on macOS and Windows
  - [ ] `fonts.sansSemiBold` and `fonts.interSemiBold` resolve to the registered PostScript names (unit test on the tokens)
  - [ ] No existing usage changes in this slice
  - [ ] Manual check: a text sample renders in each new family on macOS and on Windows
  - [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:windows` pass
- **Out of scope:** replacing usages (s8b to s8k), Inter Regular or Medium.
- **Gate:** none

### s8g. Shared modal parts [W1, parallel: s8a]

- **Risk:** high
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** -
- **Parallel:** yes, with s8a
- **Shared-touch:** `src/components/ui/Modal.tsx`, `src/components/ui/ProgressBar.tsx` (used by every modal), new shared decorations component in `src/components/modals`
- **Scope:**
  - `ui/ProgressBar.tsx`: track and fill get a pill radius (height / 2). Today neither has a radius, so the upload bar is square.
  - `ui/Modal.tsx`: card radius 8 (Figma popup r8; the audit found none), content padding top and bottom 40 (today 40 and 24, so content sits 8 px above center), close icon 24 at top and right 24 (today a 32 box at 16 with a 20 icon).
  - One shared decorations component with the five Figma shapes and offsets: half circle top 0 left 0, orange quarter top 0 right 0, light blue top 80 right 0, blue bottom 24 left 24, red quarter bottom 0 right 0 (`ApplyLookScopeModal` offsets are the verified ones; `LookPickerDecorations` is a reusable copy). It replaces no usage here; s8h, s8i and s8j adopt it.
- **Rules:** do not change behavior of Modal (focus, close, accessibility labels). All current Modal users must still render and keep their tests.
- **Mirror:** `src/components/look/LookPickerDecorations.tsx` for the decorations.
- **Open:** popup radius at runtime was not verified (the audit found none in `Modal.tsx` and `modalDimensions.ts`; it may be applied by a caller). Check every caller before adding it.
- **Acceptance:**
  - [ ] `ProgressBar` track and fill use radius height / 2 for any height
  - [ ] Modal card radius 8 and content padding 40 top and bottom, with horizontal override still working
  - [ ] Close button icon is 24 and sits 24 from the top and right
  - [ ] The shared decorations component renders the five shapes at the offsets above
  - [ ] Existing modal tests pass; `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:windows`
  - [ ] Manual check: upload, export, picker, scope popup still open, close and focus correctly
- **Out of scope:** per-modal layout (s8h, s8i, s8j).
- **Gate:** A

### s8b. Photo card shell and footer [W2, parallel: s8d, s8e]

- **Risk:** high
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s8a
- **Parallel:** yes, with s8d and s8e (card and grid files vs strip vs viewer files; no common file)
- **Shared-touch:** `src/lib/ui/colors.ts` (new token for `#161718`)
- **Scope:** files `CulledAlbumPhotoCard.tsx`, `CulledAlbumPhotoCardOverlay.tsx`, `CulledAlbumPhotoThumbnail.tsx`, `CulledAlbumPhotoFocusFrame.tsx`, `CulledAlbumPhotoGrid.tsx`, `CulledAlbumPhotoRowView.tsx`, `culledAlbumGridRows.ts`, and the card assets. Figma frames `12975:48319` (focused card), `12975:48300` (card with delete), `12975:48189`.
  - Card shell: background `#161718`, radius 6, padding 8 8 12 8, gap 8; cards sit next to each other with gap 0 (today bare thumbnail and 16 gap); card width = grid width / 3; thumbnail = card width - 16 at 325.67 x 226.55 (ratio 1.4375; today 3/2).
  - Footer row: height 28, gap 4, padding right 2, order pick control, filename, stars (today filename, stars, pick control on the right). Filename Red Hat Display Regular 14 white.
  - Pick control: 20 x 20 circle. Unpicked: 1 px white border, no fill. Picked: fill `#ff9632` with a 13 px white check (today white 16 px PNGs, no fill).
  - Stars: 5 stars of 16, gap 4, row 96 wide (today gap 2 and the 96 x 16 image squeezed to 88).
  - Delete button: 36 x 36, radius 100, background rgba(19,20,21,0.4), icon 24, top 12 and right about 12 (11.67) of the thumbnail (today 8 and 8).
  - Focus ring: 2 px `#4141ff`, radius 6, inside the card bounds (inset 0; today offset -4 outside).
  - Row stride follows the card: thumbnail + 8 + 28 + 8 + 12 (about 282.55 at the Figma width). Gap between a group's last row and the next group's header 24 (today 16).
- **Rules:** keep the virtualized grid's row height computed from one function so scroll position and `getItemLayout` stay exact. The pick control and the star control keep their hit areas; move `cardChromeHit` frames with the controls. Photos stay the single source of truth for pick state (no copy).
- **Mirror:** `src/components/culling/CulledAlbumPhotoCard.tsx` (keep its structure; change styles and order).
- **Open:**
  - Figma shows cards abutting with no gap and a continuous band, and a thumbnail ratio of 1.4375. Both follow Figma under the standing rule; confirm with the designer that this is not an export artifact (inferred, confirm).
  - Exact star and pick check asset colors were not downloaded; compare with `#ff9632` in the Figma asset.
- **Acceptance:**
  - [ ] Card style values above are asserted in a component test (background, radius, padding, gap, footer order, control sizes)
  - [ ] Row height function returns thumbnail + 8 + 28 + 8 + 12 and group gap 24; scrolling to a photo by index lands on it (existing grid tests pass)
  - [ ] Pick, unpick and star changes still work by click and keyboard
  - [ ] Focus ring is inside the card
  - [ ] Manual check: a row of cards in the macOS and Windows build next to Figma `12975:48189`
- **Out of scope:** AI and similar-shots badges and group header bars (s8c), strip (s8d), grid performance work.
- **Gate:** A

### s8d. Similar Shots strip [W2, parallel: s8b, s8e]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s8a
- **Parallel:** yes, with s8b and s8e (`SimilarShotsStrip.tsx` only; the gap above the strip is s8e)
- **Scope:** rebuild `SimilarShotsStrip.tsx` to the Figma strip (node `12975:54715` in frame `12975:54491`, "Similar group, not picked").
  - Title row: 16 layers icon + Inter SemiBold 14 white, gap 8; container gap 10 (today text only, Regular with `fontWeight` 600).
  - Card 140 wide: padding 3, radius 8, image 134 x 89 (radius 6), gap 6, bottom row 24; cards 12 apart (today thumbnail 96 wide, radius 4, gap 8).
  - Current card border 2 px `#4141ff` (`colors.blue`; today orange `colors.accent`).
  - Bottom row: pick control (24 x 24 hit area, 18 circle radius 9: unpicked 1.5 px white border; picked `#ff9632` fill with an 11 px check) at the bottom left, then the filename Red Hat Regular 11 white, gap 4 (today pick at the top right of the image and no filename).
  - AI badge on the image at left 4, bottom 4: background `#4141ff`, radius 100, padding 8 x 4, gap 4, 12 sparkles icon + "AI recommended" Inter SemiBold 12 white (today white badge, 10 px text, no icon).
- **Rules:** Figma 100%. Pick toggling keeps calling the existing handler; the strip owns no state.
- **Mirror:** the card footer of `CulledAlbumPhotoCard.tsx` (pick control) after s8b; until then the same Figma values.
- **Open:** frames for picked, AI-badged and hover or disabled strip variants were not read; the audit saw only "Similar group, not picked" and "Not in a similar group". Read them before building those states.
- **Acceptance:**
  - [ ] Strip style values above are asserted in a component test
  - [ ] Current card border is blue; the AI badge shows icon and text on blue
  - [ ] Pick works by click and keyboard; label and state are announced
  - [ ] Manual check: strip next to Figma `12975:54491`
- **Out of scope:** gap between viewer and strip (s8e), the grid chip (s8c).
- **Gate:** A

### s8e. Photo viewer header, gaps and face badges [W2, parallel: s8b, s8d]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s8a
- **Parallel:** yes, with s8b and s8d (`CulledAlbumPhotoDetailScreen.tsx`, `PhotoDetailImageViewer.tsx`, `FaceStatusIconBadge.tsx`, `FaceStatusTooltip.tsx`)
- **Scope:** Figma frames `12975:54491` to `12975:55526`.
  - Header: padding top and bottom 40 (today 40 and 24; frame height 120), horizontal 64 (check `screenPaddingHorizontal`); filename Red Hat Display SemiBold 20; stars 24 with gap 4 (today gap 2).
  - Pick control becomes a pill: label "Pick for upload" or "Picked" in Inter SemiBold 14 white, 1 px `#4A4A4A` border, radius 100, padding 14 x 8, gap 8, 20 circle (border 1.5 white when not picked, orange check when picked). Today it is a 24 px icon with no label.
  - Gap between the photo and the strip 28 (today 12, set in the strip's padding; remove it there only through this slice's screen change); gap between viewer and side panel 42 (today 24).
  - Face status badges on the photo: 32 circle, eyes icon 20, focus icon 16, gap 4 (today 28, 16, gap 2). Tooltip: gap 8 between lines, 4 between icon and text, text lineHeight 10 (today 14). Backdrop blur 2 is skipped if the platform has none.
- **Rules:** Figma 100%.
- **Open:**
  - **Decided (user, 2026-11-09):** the viewer side panel becomes "Faces in This Photo" as in Figma (frame "Faces panel (revised)"), replacing "Key Faces (n)" and the old Cull Filters. Read that frame, reuse `FacesInPhotoPanel` where it already matches, keep face data behavior unchanged.
  - Header close glyph size (40 box, glyph about 16) was not verified.
- **Acceptance:**
  - [ ] Header, pill, gap and badge values above are asserted in component tests
  - [ ] The pill toggles pick state, shows the right label, and exposes selected state to screen readers
  - [ ] Manual check: viewer next to Figma `12975:54491`
- **Out of scope:** nav chevrons (not in Figma), the strip (s8d).
- **Gate:** A

### s8f. Sidebar gaps, fonts, icons and colors [W2, parallel: s8d, s8e]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s8a
- **Parallel:** yes, with s8d and s8e (sidebar files only; `AiSelectionToast.tsx` imports `LEVEL_LABELS` from `AiSelectionSection.tsx` read-only)
- **Scope:** files `CulledAlbumDetailSidebar.tsx`, `PhotoFiltersSection.tsx`, `AiCategoriesSection.tsx`, `AiSelectionSection.tsx`, `UploadPickedButton.tsx`, `SidebarActionStack.tsx`, `FacesInPhotoPanel.tsx`; Figma `12975:48496`, `12975:48907`, `12975:49362`, `12975:49006`, `12975:50297`.
  - Selected filter row label ("All Photos", "Picked for Upload"): Inter SemiBold 14 white (today Red Hat Bold; background `#1e1e1e`, radius 8, size 14 and white already match).
  - "Photo Filters" and "Faces in This Photo" headings: Inter SemiBold 16 white. AI Selection and AI Categories captions: Red Hat Display SemiBold 16 white. "Update recommendations" and "Updating…": Inter SemiBold 14 `#ff9632`. Warning face labels ("Check eyes"): Inter SemiBold 11 `#ffd700`.
  - Icon colors: the "Picked for Upload" circle-check is orange in both filter states, layout-grid stays white (today every icon white). AI category icons: check the Figma stroke; the audit saw white against code `textGray` `#B7B7B7`.
  - Gaps: heading to rows 8 (today 14); between sidebar blocks (around each divider) 14 (today 20); action stack to panel stays 20. AI Categories caption to the first row 4 (today none).
  - Icons: chevron-up and chevron-down become lucide strokes (today Material filled), and the info icon in the upload hint becomes lucide info at 14 (today a filled Material circle). Checked box check: lucide check at 12.
  - Line heights: Upload Picked label 16 x 1.2, Export and Edit Photos labels 16 x 1.6.
- **Rules:** Figma 100%. Icons are downloaded as the Figma skill says and named like the other `lucide_*` assets.
- **Open:** SVG stroke colors and glyph shapes of the Figma assets were not downloaded in the audit (category icon color, upload, export and eye status glyphs). The Photo Filters, grouped (`12975:50582`, `12975:51005`) and No picks (`12975:49760`) sidebars were not read.
- **Acceptance:**
  - [ ] Font, gap, icon color and line-height values above are asserted in component tests
  - [ ] Existing sidebar tests pass
  - [ ] Manual check: sidebar next to Figma `12975:48496` and `12975:49362` in both filter states
- **Out of scope:** toast (s8k), Add Photos button, Clear filters and No results (frames not read), mobile sidebar layout.
- **Gate:** none

### s8h. Upload popup and cloud storage card [W2, parallel: s8i, s8j]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s8a, s8g
- **Parallel:** yes, with s8i and s8j (different modal files)
- **Scope:** `UploadSelectedModal.tsx`, `CloudStorageCard.tsx`, `UploadPopupParts.tsx`; Figma `12975:34497` (uploading), `12975:32454`, `12975:32962`, `12975:33474` and the other 3c frames in `phase-3c-figma-spec.md`.
  - Uploading popup height 456 (today 360); body gap 24 (today 32); subtitle line height 14 x 1.44; title "Uploading 99 photos" with a lowercase "photos"; meta line "45 of 99 photos · 0.3 GB of 0.6 GB" in one Red Hat SemiBold 14 `#737373` style (today "{pct}%" bold plus regular text).
  - Progress bar uses the s8g radius; decorations use the s8g component at its offsets (today shifted: top -20 / left -28 and others).
  - "Not enough cloud storage": the primary "View cloud plans" hugs its content and is centered (today it stretches to 456); text buttons ("Choose fewer photos", "Cancel") have the height of their text (today `minHeight` 44) with `hitSlop` for the target size.
  - Storage card values in Red Hat Display SemiBold; bar height 9 with pill radius (today radius 3 and a square fill end).
- **Rules:** Figma 100% except the accepted deviations (popup width 720, contrast, "Choose fewer photos" copy).
- **Open:** the meta line needs the count of uploaded photos; check that the upload queue exposes it before building (inferred, confirm). Frames 12975:31466, 31955, 37980, 39483, 39982, 30620 and 33988 were not re-read; use the spec and re-read before building their states.
- **Acceptance:**
  - [ ] Height, gap, copy, meta line, bar and button values above are asserted in component tests
  - [ ] Existing upload modal tests pass (update only the assertions the new copy changes)
  - [ ] Manual check: uploading and not-enough-storage popups next to Figma
- **Out of scope:** export (s8i), look modals (s8j), `UploadToast`, bake disk full and failure flow (no Figma frames).
- **Gate:** A

### s8i. Export popup [W2, parallel: s8h, s8j]

- **Risk:** high
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s8a, s8g
- **Parallel:** yes, with s8h and s8j (`ExportPhotosModal.tsx` and `ExportFailureView.tsx` only)
- **Scope:** Figma `12975:36464` (options), `12975:37486` (preparing), `12975:40481` (complete). Today the file (1021 lines) still carries pre-3c styling.
  - Popup height 520 (today 500); title DM Serif Regular 400 (today `fontWeight: '700'`, a synthetic bold on every step); options gap 24, quality card padding 16 x 20, selected option tint 10% (today gap 20, 16, 7.8%); subtitle line height 1.44.
  - Format dropdown: border `#303030`, text Regular 16 (today dark border and bold). Progress bar height 9 with the s8g radius; percentage label SemiBold 14, line height 1.44.
  - Primary and secondary buttons reuse the `UploadPopupParts` button and title parts (today own styles with padding 12 x 40 and no line height); export file name SemiBold 16; file card thumbnail about 38 on `#F8F8F8` radius 8, meta line height 1.6.
  - Export complete: 40 green check (`icon_check_circle_40.svg`, as `UploadCompleteView`), title "Export complete", subtitle "99 photos saved to your computer", button "Open folder".
- **Rules:** Figma 100% for structure and copy. Reuse `PopupButton` and `PopupTitleBlock` instead of duplicating them. Do not add to the file's length; extract steps only if the diff stays small (inferred, confirm).
- **Open:**
  - **Decided (user, 2026-11-09):** the Figma strings replace the current ones, and the right-hand status labels are dropped as Figma shows none. Behavior the app has that Figma does not show must still be handled (see path card).
  - **Path card. Decided (user, 2026-11-09):** anything not in Figma stays handled. Keep the saved-path information after export, restyled to the Figma popup language (reuse the file card styling); do not remove it.
- **Acceptance:**
  - [ ] Height, weights, gaps, tint, dropdown, bar, copy and the complete step match the values above in component tests
  - [ ] The ExportPhotosModal tests pass after their copy assertions are updated to the confirmed strings (never weakened)
  - [ ] Manual check: options, preparing and complete steps next to Figma
- **Out of scope:** export logic and disk-space handling (3c), the failure flow's layout.
- **Gate:** A

### s8j. Look picker, scope popup and look status [W2, parallel: s8h, s8i]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s8a, s8g
- **Parallel:** yes, with s8h and s8i
- **Scope:** `ApplyLookModal.tsx`, `ApplyLookScopeModal.tsx`, `LookPickerBody.tsx`, `LookPickerTile.tsx`, `LookCompareToggle.tsx`, `LookPickerDecorations.tsx` (replaced by the s8g shared component where identical), `AlbumLookStatus.tsx`; Figma `12975:61141`, `12975:58671`, `12975:58664`.
  - Text buttons ("Cancel", "New photos only") have the height of their text (today `minHeight` 44, about 24 px taller); close icon 24 at top and right 24 in both modals (today 20 in 24 box, and 20 in a 32 box at 16).
  - Before/After toggle: Before line height 1.6, After 1.4 (today one 1.5), bottom offset about 16 (today 18).
  - Picker selected tile label Red Hat SemiBold 12; caption "Choose a look…" Red Hat SemiBold 14 (today Bold).
  - Look status: "Look: <label>" Red Hat SemiBold 14 white; "Change" Inter SemiBold 14 `#ff9632` with its font family set (today no `fontFamily`, so it falls back to the system font).
- **Rules:** Figma 100%.
- **Open:** the look status line frame `12975:58664` is the only reference; the grid area around it was not read.
- **Acceptance:**
  - [ ] Button heights, close icon, toggle line heights, label fonts and the "Change" font family are asserted in component tests
  - [ ] Existing picker and scope tests pass
  - [ ] Manual check: picker, scope popup and the status line next to Figma
- **Out of scope:** upload and export (s8h, s8i).
- **Gate:** A

### s8k. AI Selection toast width, icons and stacking [W2, parallel: s8h, s8i]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s8a
- **Parallel:** yes, with s8h and s8i (`AiSelectionToast.tsx` and its mount on the screen)
- **Shared-touch:** `src/screens/CulledAlbumDetailScreen.tsx` (mount point only)
- **Scope:** Figma toasts `12975:52424` and `12975:52858`.
  - The toast has a fixed width so the close icon sits at the right edge (Figma content 480 / 488 inside 544 / 552); today it hugs its text with a 12 gap.
  - Close icon: re-export from Figma node `12975:52433` (circle `#717273` with a white x, glyph 18.75 in a 20 box); today `icon_close_circle.svg` is `#D9D9D9` and scaled to 20. Failure icon: compare `icon_error.svg` with node `12975:52862` (an unmasked circle) and replace if the glyph differs.
  - Stacking: the AI toast and `UploadToast` are both `absolute; bottom: 0; left: 0`. Show them in one column so a visible upload or analyze toast is never covered (Gate R finding of 3e).
- **Rules:** Figma 100%.
- **Open:** the Figma toast frames are isolated, so the toast's screen position and exact width are not confirmed (inferred, confirm).
- **Acceptance:**
  - [ ] Width, icon sizes and colors are asserted in a component test
  - [ ] With an `UploadToast` visible, the AI toast appears above it and neither is hidden
  - [ ] Manual check: both toasts next to Figma
- **Out of scope:** toast copy and timing (3e).
- **Gate:** none

### s8c. AI badges, similar shots chip and group header bars [W3, sequential]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s8a, s8b
- **Parallel:** no, alone in its wave
- **Scope:** `PhotoAiBadges.tsx`, `SimilarShotsBadge.tsx`, `SimilarShotGroupHeader.tsx`; Figma badges `12975:48260`, `48279`, `48372`, `48391`, `48298` (variants and "+N" `48338`, `48392`), group headers `12975:50790`, `12975:50941`.
  - AI badge row: Inter SemiBold 12 text (today Red Hat Bold); position left 8 and bottom 8 of the thumbnail (today left 16, because the thumbnail has no card padding before s8b); chip height 23.
  - Similar shots chip: background rgba(19,20,21,0.75) (today 0.6), height 23 from padding 4 (today fixed 24), a 12 layers icon before the text and a 12 chevron-right icon after it (today text "›"), gap 4, Inter SemiBold 12 white.
  - Group header: a full-width bar `#1e1e1e` with radius 8, padding 16 x 10, height 37, gap 8, 4 below it to the first row (today plain text); layers icon 16 (today 20); Inter SemiBold 14 white. "Other matching photos" is the same bar with no icon.
- **Rules:** Figma 100%. Reuse `lucide_layers.svg` if it is the same glyph; add `lucide_chevron_right` as a new asset downloaded per the Figma skill.
- **Open:** the Inspect faces pill (`InspectFacesButton.tsx`, Figma left 206.67 top 199.55, padding 10 x 6, gap 6, scan-face 14, Inter SemiBold 12) was not audited; read its Figma node before including it. The badge priority order when several apply is not in Figma.
- **Acceptance:**
  - [ ] Font, offsets, alpha, height, icons and bar values above are asserted in component tests
  - [ ] Existing badge, chip and group header tests pass
  - [ ] Manual check: a card and a group header next to Figma `12975:48189` and `12975:50730`
- **Out of scope:** card shell (s8b), strip badge (s8d).
- **Gate:** R (end of group)

## Do not start

- Inspect faces pill, Clear filters, No results and the filter bar: no Figma frame was read for them.
- Add Photos button: not in Figma.
- `UploadToast`, `UploadBakeDiskFullView`, `UploadFailureFlow`: no Figma frame for the decided states.
- Mobile layout (`sidebarMobile`).
- Viewer side panel (Key Faces versus Faces in This Photo): needs the designer's confirmation (see s8e).
- Contrast changes (Figma tokens kept).
- A fidelity gate in the slice-plan skill (for example a screenshot comparison): not part of this plan.
