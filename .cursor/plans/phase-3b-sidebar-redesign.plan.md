---
name: phase-3b-sidebar-redesign
overview: Rebuild the CulledAlbumDetailSidebar to match Figma Photo Review. Photo Filters, AI Categories (label changes only), the action stack, and a Faces in This Photo panel driven by a new focus state on the grid. Key Faces is removed. AI Selection and Legend are not part of this phase.
approved: true
todos:
  - id: s4a
    content: Category label map (AI Recommended, Needs Review, Possible Blur, Possible Closed Eyes, Similar Shots)
    status: completed
  - id: s4b
    content: Photo Filters and AI Categories sidebar sections
    status: completed
  - id: s4c
    content: Sidebar action stack (Upload Picked, Add Photos, Export, Edit Photos)
    status: completed
  - id: s4e
    content: Grid focus state (first click focuses, click on the focused photo opens detail)
    status: completed
  - id: s4f
    content: Faces in This Photo panel
    status: completed
  - id: s4d
    content: Recompose CulledAlbumDetailSidebar per Figma and drop Key Faces from it
    status: pending
  - id: s4g
    content: Remove Key Faces leftovers from the screen
    status: pending
  - id: s4h
    content: Photo card AI badges (AI recommended, Needs review, Check eyes, Check sharpness)
    status: completed
  - id: s4i
    content: Showing line for every active filter, Clear filters, no-results state
    status: completed
isProject: false
---

# Phase 3b: Sidebar redesign

Source: user brief (Phase 3b), Figma W6N2UvJAw3J8NTuT60MlmB section "Photo Review" 12975:48188 (frames 12975:48189 main grid, 12975:49476 no picks, 12975:49887 no results, 12975:50306 similar grouped, 12975:52872 to 12975:54086 Faces states, 12975:54491 single photo), `.cursor/plans/phase-3a-similar-shots.plan.md`, `.cursor/rules/project-map.mdc`.

Figma check (2026-11-01): the Figma MCP Starter quota ran out during this session. Copy and structure come from the file's node metadata (visible text nodes and layer names), read before the quota ended. No screenshot was seen. Spacing, colors, icons, the focus visual, the Upload Picked button and anything inside a component instance are not readable. Every UI slice starts by asking the user for a screenshot of the named frame; nobody guesses.

Ids use `s4a`..`s4g` so they do not clash with the phase 3a ids (`s3a`..`s3h`). Slice ids are not in dependency order; the waves table is.

## How to run

- Set `approved: true` in the frontmatter after review.
- Next pending group: `/run-group-prompt phase-3b-sidebar-redesign` (or `/run-group-prompt` alone to follow the roadmap).
- One slice by hand: `/slice-prompt <id>`, then commit.
- After the group: read the Gate R report, merge the branch or run `/fix-prompt`.

## Done

- Toolbar left (selection filter check icons plus star filter 0 to 5): `CulledAlbumFilterBar.tsx` already renders it from `selectionFilter` and `starRatingFilter`. No work.
- Toolbar right avatar: `CulledAlbumDetailHeader` already receives `profileMenu`.
- "Upload Picked (N)" button and both notes: `UploadPickedButton.tsx` (phase 3a s3h and the 2026-11-01 note fix).
- Main area empty state for the Picked filter: done in phase 3a.
- Edit Photos acts on picked photos: phase 3a s3h wired `ApplyLookModal` to the picked set and already calls it "Edit Photos".
- Per-photo face data exists: `photo.faces` carries `eyeStatus` (`closed`, `partial`, open) and `focusLevel` (`blurred`, `soft`, good), mapped to labels in `src/lib/culling/faceStatus.ts`.

## Decisions (user, 2026-11-01)

- Labels are wording only. Logic, filter keys and stored flags do not change: `aiSelected` shows "AI Recommended", `maybe` "Needs Review", `blurred` "Possible Blur", `closedEyes` "Possible Closed Eyes", `duplicated` "Similar Shots".
- "All Photos" clears only `selectionFilter`.
- Add Photos to Cull stays and sits above Export.
- Key Faces is removed. Faces in This Photo replaces it. A first click on a grid photo puts it in a "focus" state and the panel shows that photo's faces; a click on the already focused photo opens the photo detail. With no focused photo the panel shows "Choose Inspect faces on a photo to check eyes and sharpness here."
- Legend is deferred: it relates to subscription and is out of 3b.
- AI Selection stays out of 3b (user, answer 1): no recommendation data source exists.
- Conflicts with phase 3a "Do not start" ("AI Selection levels, Faces panel"): the Faces panel moves into 3b by the user's decision. AI Selection stays out as 3a decided.

## Mapping: current sidebar to Figma sidebar

| Current | Figma | Status |
|---|---|---|
| Upload Picked button + notes | Upload Picked (N) + note | Exists |
| Add Photos to Cull | not in Figma | Kept, above Export (user) |
| Export | Export | Exists |
| Apply Look | Edit Photos | Button label rename (user confirmed button only; modal title untouched) |
| Cull Filters accordion | Photo Filters (collapsible) | Restructure |
| Total Photos badge | "All Photos" row with count | Becomes a selectable row |
| My Selections row | "Picked for Upload" row with count | Rename, same `selectionFilter === 'selected'` toggle |
| 5 category checkboxes | AI Categories checkboxes | Label change only |
| Key Faces album grid, tooltips, sticky title | "Faces in This Photo" (per photo, collapsible) | Replaced |
| none | AI Selection | Not in 3b |
| none | Legend button | Deferred |

## Rules for every slice

- One owner per state. Selection, category and star filters stay in `useCulledAlbumFilters`; counts stay derived from the store. The focused photo is UI state owned by the screen as a single `focusedPhotoId` (inferred, confirm); its faces are derived from `photo.faces`, never copied.
- Filter keys, persisted photo flags, `matchesCullFilterKey` and `stats` names do not change, so no data migration.
- `CulledAlbumDetailSidebar.tsx` (801), `CulledAlbumDetailScreen.tsx` (948) and `CulledAlbumPhotoCard.tsx` (384) must not grow. New markup goes in new files of 300 lines or less in `src/components/culling/`.
- Grid cards subscribe to `photoRenderStore`, not `culledAlbumStore` (project-map hard rule). The focus state must reach cards as a prop or a render-store field, not a direct store subscription.
- UI follows Figma. A doubt means asking for a screenshot.
- Every slice ends with `npm run typecheck`, `npm run lint`, `npm test`; report what ran and what did not.

## Execution waves

| Group | Wave | Slices | Parallel? | Waits for | Merge order / shared-touch |
|-------|------|--------|-----------|-----------|----------------------------|
| Sidebar | W1 | s4a, s4c, s4e | yes | - | s4a, s4c, s4e (s4e is the only one touching Card and Screen; inferred, confirm) |
| Sidebar | W2 | s4b, s4f, s4h, s4i | yes (max 3 at once; s4i runs in the second batch) | W1 merged | s4b, s4f, s4h, s4i (s4h touches the card and overlay, s4i the summary component and screen wiring; inferred, confirm) |
| Sidebar | W3 | s4d | no | W2 merged | - |
| Sidebar | W4 | s4g | no | W3 merged | - |

## Sidebar group (Figma 12975:48189, 12975:49476, 12975:52872, 12975:54086)

### s4a. Category label map [W1, parallel: s4c, s4e]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** -
- **Parallel:** yes, with s4c and s4e (new file only)
- **Scope:** new `src/lib/culling/cullFilterLabels.ts` exporting `CULL_FILTER_LABELS: Record<CullFilterKey, string>` and the Figma display order. Add a test in `__tests__/`.
- **Rules:** wording only; no key renamed.
- **Mirror:** `FILTER_LABELS` in `CulledAlbumDetailSidebar.tsx` (moved, not copied; the sidebar import switches in s4d).
- **Open:** none. The "Showing:" line today hardcodes "Similar Shots" in `CulledAlbumGridWithSummary.tsx`; s4i makes it read this map (user: same label everywhere).
- **Acceptance:**
  - [ ] Every `CullFilterKey` has exactly one label, in Figma order
  - [ ] No other file defines a second category label list
  - [ ] Tests that assert old category labels are updated, none deleted (grep today: no test asserts "AI Selected" or "Maybe")
- **Out of scope:** sidebar markup (s4b, s4d), per-face status labels (s4f).
- **Gate:** none

### s4c. Sidebar action stack [W1, parallel: s4a, s4e]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** -
- **Parallel:** yes, with s4a and s4e (new file only)
- **Scope:** new `SidebarActionStack.tsx` holding Upload Picked (existing `UploadPickedButton`), Add Photos to Cull, Export, Edit Photos in that order. The "Apply Look" button text becomes "Edit Photos"; its accessibility label follows.
- **Rules:** order per user (Add Photos above Export); button styling per Figma 48189.
- **Mirror:** the current `actionStack` block in `CulledAlbumDetailSidebar.tsx`.
- **Open:** none. The modal title stays "Apply Look" (user, 2026-11-01); only the button label changes.
- **Acceptance:**
  - [ ] Disabled states and callbacks are identical to today for all buttons
  - [ ] Button reads "Edit Photos"; accessibility label no longer says "Apply look"
  - [ ] The stack only receives props; no store or modal logic moves
- **Out of scope:** modal changes, Legend.
- **Gate:** A

### s4e. Grid focus state [W1, parallel: s4a, s4c]

- **Risk:** high (changes what a card click does, in a virtualized grid)
- **Role:** ui-frontend-developer (Build)
- **Depends on:** -
- **Parallel:** yes, with s4a and s4c (different files)
- **Shared-touch:** none from the shared list; changes `CulledAlbumPhotoCard.tsx`, the grid and `CulledAlbumDetailScreen.tsx`, all over 300 lines
- **Scope:** screen holds `focusedPhotoId`. Card click on an unfocused photo sets focus; click on the focused photo calls the existing `onOpenDetail`. Cards get an `isFocused` prop and a focus visual from Figma, plus a hidden "Inspect faces" button (small new component, `TODO` comment, not rendered). Existing taps that already open the viewer (the "N similar shots" badge from 3a s3f) keep their behavior.
- **Rules:** the pick circle, delete button and badge do not change focus. Card never reads `culledAlbumStore`.
- **Mirror:** `handleCardPress` and `onOpenDetail` in `CulledAlbumPhotoCard.tsx`.
- **Open:**
  - Focus visual (from the screenshots, 2026-11-01): a blue-indigo border with rounded corners around the whole card (thumbnail plus file name row). Exact color token, border width and radius are taken from the frame during the slice. The screenshots also show a lighter card background on one card in each frame (looks like hover, unconfirmed). Not built in 3b: per-card hover on thousands of photos was removed earlier for scroll lag (user, 2026-11-02); revisit only after a measured scroll check.
  - Focus clearing (user, 2026-11-01): focus clears when the focused photo leaves the filtered view (filter change or delete), and on a click on empty grid area. Returning from the viewer keeps the photo focused (user, 2026-11-01).
  - Keyboard (user, 2026-11-01): the first Enter on a card focuses it, a second Enter opens the detail, same as clicks.
  - "Inspect faces" (user, 2026-11-01): Figma (frame 12975:52872 screenshot) shows it as a dark pill with icon and label at the bottom-right of the thumbnail, on the focused card only. The user chose to keep it hidden with a `TODO` comment: faces appear in the panel as soon as a photo is focused, so the button does nothing visible yet. The hidden button only calls the same focus handler.
  - A parent decision in 3a s3f ("tap opens the viewer for that photo") covered the badge only; confirm the badge keeps opening directly.
- **Acceptance:**
  - [ ] First click focuses, second click on the same photo opens detail; click on another photo moves focus
  - [ ] Pick, delete and badge taps do not change focus
  - [ ] Focus clears when the focused photo is no longer in the shown set, and on a click on empty grid area
  - [ ] The "Inspect faces" button exists in code, is not rendered, and carries a `TODO`
  - [ ] Focused card has an accessible state (selected/focused) announced to screen readers
  - [ ] Flat and grouped (Similar Shots) grids both support it
  - [ ] `CulledAlbumPhotoCard.tsx` and `CulledAlbumDetailScreen.tsx` line counts do not grow
- **Out of scope:** the panel (s4f), sidebar layout (s4d).
- **Gate:** A, R

### s4b. Photo Filters and AI Categories sections [W2, parallel: s4f, s4h]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** s4a
- **Parallel:** yes, with s4f, s4h and s4i (different new files; at most 3 run at once)
- **Scope:** new `PhotoFiltersSection.tsx` (collapsible "Photo Filters"; rows "All Photos" with total count and "Picked for Upload" with picked count) and `AiCategoriesSection.tsx` ("AI Categories"; checkbox, label, count per category), in `src/components/culling/`. Presentational: props in, callbacks out.
- **Rules:**
  - "All Photos" sets `selectionFilter` to `null` only (user).
  - "Picked for Upload" toggles `selectionFilter` between `'selected'` and `null`, as My Selections does today.
  - Picked count equals N in "Upload Picked (N)" (3a rule). Similar Shots count keeps the 3a rule (all photos in groups; fallback to `stats.duplicated`).
- **Mirror:** the Cull Filters accordion body in the current sidebar; `Accordion` and `Checkbox` from `@components/ui`.
- **Open:** none. Selected look (Figma screenshots, 2026-11-01; supersedes the earlier "primary color" idea): a rounded dark-grey row background with a bold label and bold count. Unselected: no background, regular label. "Picked for Upload" is selected when `selectionFilter` is `'selected'` (frame 12975:49476). "All Photos" is selected only when no filter at all is active: it is highlighted with no filters and plain when a category filter is on. Selected derives from the existing filter state (category, selection and star filters), no new state.
- **Acceptance:**
  - [ ] Rows and counts render as in frames 48189 and 49476 (0 picked shows 0)
  - [ ] All Photos clears only `selectionFilter`; category and star filters are untouched
  - [ ] Section header is a button with `expanded` state; rows have accessible labels with counts
  - [ ] Each new file is 300 lines or less
- **Out of scope:** wiring into the sidebar (s4d), AI Selection.
- **Gate:** A

### s4f. Faces in This Photo panel [W2, parallel: s4b, s4h]

- **Risk:** high (new UI over per-face data, first use of the focus state)
- **Role:** ui-frontend-developer (Build)
- **Depends on:** s4e
- **Parallel:** yes, with s4b, s4h and s4i (different new files; at most 3 run at once)
- **Scope:** new `FacesInPhotoPanel.tsx` and, if needed, a small hook `useFocusedPhotoFaces` in `src/hooks/` that derives the faces of `focusedPhotoId` from the store. Collapsible title "Faces in This Photo" with " · N" when faces exist. States built in 3b: empty "Choose Inspect faces on a photo to check eyes and sharpness here.", none "No faces detected.", unavailable "Face assessment unavailable.", loading "Loading face assessment…" (brief), and the face rows with status text. Panel shows the focused file name under the title.
- **Rules:** faces come from `photo.faces`, not copied. Status colors and icons come from the existing `faceStatus.ts` meta.
- **Mirror:** `KeyFaceSidebarItem`, `FaceCropAvatar` and the face status tooltip.
- **Open:**
  - Status wording (user, 2026-11-01): panel uses `eyeStatus` closed or partial = "Check eyes", open = "Eyes open"; `focusLevel` soft or blurred = "Possible soft focus"; good focus shows no label; "Unable to assess" is the unavailable case above. The photo card badge uses "Check sharpness" for soft or blurred (s4h); the two texts differ on purpose. Tooltip and viewer wording do not change in 3b: `faceStatus.ts` and `__tests__/faceStatus.test.ts` stay as they are, and the panel and card badges use their own mapping in a new file (colors and icons are reused from `faceStatus.ts`). Aligning tooltip and viewer wording belongs to the viewer plan.
  - Loading and unavailable (user, 2026-11-01): faces show right after focus, and "Loading face assessment…" is a brief transient state while the focused photo's faces are prepared (Figma shows it with the file name under the title). Nothing real is pending (user, 2026-11-02): the loading state is a fixed delay of about 1 second after the focused photo changes, then the faces show. The delay is a constant, cancelled when focus changes again, and has a `TODO` comment saying it is simulated. "Face assessment unavailable." shows when the focused photo has faces but a face's `eyeStatus` or `focusLevel` is not a valid value (exact validity check defined in the slice from the enums in `Face.ts`, confirm).
  - "No faces detected." shows when the focused photo has an empty `photo.faces` (user, 2026-11-01).
  - Face row layout (from the screenshots): 3-column grid of round avatars with a small status badge on the avatar corner (yellow for warnings, grey "?" for unable to assess) and the status text below; muted file name under the title. State copy ("No faces detected.", "Face assessment unavailable.", loading) is plain white text under the file name.
- **Acceptance:**
  - [ ] No focused photo shows the empty copy exactly
  - [ ] Focused photo shows its faces and count from `photo.faces`
  - [ ] Collapse and expand work and expose `expanded` state
  - [ ] Each face row has an accessible label with its status
  - [ ] File is 300 lines or less
- **Out of scope:** sidebar wiring (s4d), viewer "Show AI markers" (not in 3b).
- **Gate:** A

### s4h. Photo card AI badges [W2, parallel: s4b, s4f]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** s4e
- **Parallel:** yes, with s4b, s4f and s4i (s4e already merged; different files; at most 3 run at once)
- **Scope:** badges on the grid card, in the same chip row as `SimilarShotsBadge` (3a s3f): "AI recommended", "Needs review", "Check eyes", "Check sharpness", per Figma frame 12975:48189 layers "AI badge=Check eyes", "AI badge=AI recommended". New small component in `src/components/culling/`; card and `CulledAlbumPhotoCardOverlay.tsx` get wiring only.
- **Rules (user, 2026-11-01):**
  - Card badge mapping (user, 2026-11-01), photo level: `aiSelected` = "AI recommended"; `maybe` (soft focus or partial eyes) = "Needs review"; `closedEyes` = "Check eyes"; `blurred` = "Check sharpness". "N similar shots" is added when the photo is in a group.
  - A photo with both `closedEyes` and `blurred` shows "Check eyes" first and "Check sharpness" goes into "+N" (inferred, confirm).
  - Order of the shown badge: AI recommended first, then the status badge, then similar shots. Only one badge shows; the rest collapse into the "+N" pill (screenshots show one badge plus "+1").
  - Badges derive from the photo flags already in `photoRenderStore`; no new state, no new analysis.
- **Mirror:** `SimilarShotsBadge` and `CulledAlbumPhotoCardOverlay`.
- **Open:**
  - Badge look (from the screenshots): dark translucent pill with icon and label at the bottom-left of the thumbnail; "AI recommended" has an indigo fill, "Check eyes", "Check sharpness" and "Needs review" have yellow text, "N similar shots ›" has white text. One badge shows, then a separate "+N" pill (screenshots show "+1"). What "+N" does on hover or click is not visible; default: not interactive (inferred, confirm).
  - Does the card read `closedEyes`/`blurred`/`maybe` flags or the face enums? Cards must not subscribe to `culledAlbumStore`; the render snapshot may need these fields (check `photoRenderStore` during the slice).
- **Acceptance:**
  - [ ] Each flagged photo shows the right badge; unflagged photos show none
  - [ ] Badges are not buttons unless Figma says so; each has an accessible label
  - [ ] Card reads only render-store data, no direct store subscription
  - [ ] `CulledAlbumPhotoCard.tsx` line count does not grow
- **Out of scope:** the panel (s4f), focus (s4e), viewer markers.
- **Gate:** A

### s4i. Showing line, Clear filters, no-results state [W2, parallel: s4b, s4f, s4h]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** s4a
- **Parallel:** yes, with s4b, s4f, s4h (different files; at most 3 run at once, so s4i goes in the second batch)
- **Scope:** `CulledAlbumGridWithSummary.tsx` shows "Showing: <active filter labels joined with " + "> · N photos" for every active filter, for example "Showing: Possible Closed Eyes + Similar Shots" (user, 2026-11-01). The line is not shown when no filter is active. It keeps "· N groups · M photos" for the Similar Shots grouped view (frame 12975:50306). Adds a "Clear filters" button and, when the result is empty, "No photos match these filters." (frame 12975:49887). Labels come from `CULL_FILTER_LABELS` (s4a). `summarizeSections` is the existing unit to extend.
- **Rules:**
  - "Active filter" means what `useCulledAlbumFilters` already treats as active (category checkboxes, selection filter, star filter). Its `hasActiveFilter` is unused today (3a follow-up); reuse or replace it.
  - "Clear filters" resets category filters, selection filter and star filter to their defaults (user, 2026-11-01). It resets the state the sidebar and toolbar already own; it adds no second owner.
  - The Picked-empty copy stays as in 3a ("Pick photos using the circle beside each filename.").
  - Note text "All alternatives are included in similar-shot groups." (Figma, grouped frame screenshot) shows at the right of the Showing line, before "Clear filters", only when Similar Shots is active together with another category (user, 2026-11-01).
- **Mirror:** `CulledAlbumGridWithSummary` and `summarizeSections`.
- **Open:**
  - Placement (Figma screenshots): with results, "Clear filters" is an outlined orange pill at the right end of the Showing row. With zero results the Showing row has no button; "No photos match these filters." and a "Clear filters" pill are centered in the main area (frame 12975:49887). The Upload note stays in the sidebar in both.
  - The 3a filter rule stays as decided; the note is copy only (user, 2026-11-01), so the slice does not change which photos are shown.
  - Selection and star text in the Showing line is improvised (not in Figma; user, 2026-11-01): selection shows "Picked" or "Not picked"; stars show the ratings as numbers, a consecutive run as a range ("4-5 stars"), a non-consecutive set as a list ("1, 3 stars"), a single rating as "4 stars" (singular "1 star"). Rating 0 is written as "No rating" (user, 2026-11-02); when 0 is combined with other ratings it is listed first, for example "No rating, 3 stars". Joined after the category labels with " + ".
  - Label order when several categories are active follows the sidebar order (user, 2026-11-01).
- **Acceptance:**
  - [ ] No active filter: no Showing line
  - [ ] One filter shows "Showing: <label> · N photos"; two show "Showing: A + B · N photos"
  - [ ] Zero results show "No photos match these filters." and a working "Clear filters"
  - [ ] Existing Similar Shots summary tests keep passing; label tests added; `summarizeSections` has a test per case
  - [ ] File is 300 lines or less
- **Out of scope:** sidebar markup, Picked-empty copy (done).
- **Gate:** A

### s4d. Recompose the sidebar per Figma [W3, sequential]

- **Risk:** high (801-line file with sticky Key Faces scroll logic; two callers in the 948-line screen)
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s4a, s4b, s4c, s4e, s4f
- **Parallel:** no, alone in its wave
- **Shared-touch:** none from the shared list; changes `CulledAlbumDetailSidebar.tsx` and `CulledAlbumDetailScreen.tsx` (both over 300 lines)
- **Scope:** sidebar renders, top to bottom: action stack (s4c), Photo Filters and AI Categories (s4b), Faces panel (s4f). The AI Selection section is not rendered in 3b (user, 2026-11-01): the sidebar goes from Photo Filters to AI Categories. Remove the Cull Filters accordion, Total Photos badge, My Selections row, `FILTER_LABELS`, the Key Faces list, sticky title, scroll-aware tooltip setup and their styles. Update `CulledAlbumDetailSidebarProps` and both usages in the screen (mobile and desktop) for renamed or removed props; pass `focusedPhotoId`-derived faces.
- **Rules:** net line count of both files goes down. The project never targets mobile (user, 2026-11-01): no mobile design or test is planned. The existing `isMobileLayout` branches are not extended and not removed here; where they reference removed Key Faces props they only get what keeps them compiling.
- **Mirror:** Figma frames 48189 and 49476; current sidebar structure.
- **Open:** removing the dead `isMobileLayout` branches is a separate cleanup the user has not asked for; report it in the final message instead of doing it.
- **Acceptance:**
  - [ ] Sidebar order and copy match Figma 48189 and 49476 for every 3b section
  - [ ] No Key Faces UI remains in the sidebar
  - [ ] Sidebar scrolls without the old sticky logic (manual check on macOS and Windows; no component harness exists for it)
  - [ ] `CulledAlbumDetailSidebar.tsx` and `CulledAlbumDetailScreen.tsx` line counts do not grow
  - [ ] No category flag, filter key or stored photo field changed
- **Out of scope:** AI Selection, Legend, deleting now-unused Key Faces helpers (s4g).
- **Gate:** A, R

### s4g. Remove Key Faces leftovers [W4, sequential]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s4d
- **Parallel:** no, alone in its wave
- **Scope:** delete what s4d left unreferenced: `keyFacesExpanded`, `handleKeyFacePress`, `useKeyFaceTooltip` wiring in the screen, and `KeyFaceSidebarItem` if the panel does not reuse it. Verify each by grep before deleting. `cullingKeyFaces` data, `computeKeyFaces` and the analysis path are not touched (C++ and engine ownership, project-map hard rule); report them as dead UI inputs instead.
- **Rules:** nothing deleted that another file still imports; tests of deleted units are removed only with the unit.
- **Acceptance:**
  - [ ] `npm run typecheck` and `npm run lint` show no unused exports from the removal
  - [ ] Screen line count drops
  - [ ] Analysis, store and persistence code unchanged
- **Out of scope:** removing `cullingKeyFaces` from the store or SQLite (needs its own decision).
- **Gate:** R (end of group)

## Do not start

- AI Selection (Fewer / Balanced / More, "Update recommendations", Updating, Updated, Update failed, and the "Recommendations updated · More" banner). Kept out as phase 3a decided and by user answer 1: no recommendation API, native function or store field exists, and nothing may be invented. Needs a data source and the Fewer and Balanced copy (only "A broader selection" for More is visible in the metadata).
- Legend button and its popup: deferred by the user (subscription-related).
- Viewer "Show AI markers" and the viewer similar-group frames beyond 3a: not in the sidebar redesign.
- Faces in This Photo panel inside the photo viewer, with its "Loading face assessment…" state (shown while the detail loads or when moving between photos) and "Face assessment unavailable." (trigger unknown). The viewer frames (12975:54491 to 12975:55526) also still show an old "Cull Filters / Key Faces" block next to the new panel; confirm with the designer before planning the viewer.
- Removing `cullingKeyFaces` from the album model and SQLite: separate decision after s4g.
- Presets and sorting: out of scope as in 3a.
- Fully splitting `CulledAlbumDetailScreen`, `CulledAlbumDetailSidebar` and `CulledAlbumPhotoCard` below 300 lines: separate refactor-janitor pass, as in 3a.
