---
name: phase-3d-presets
overview: Album look with built-in presets only. The album gets a default look id. The Edit Photos picker (redesigned per Figma, no intensity) chooses a look; a scope popup then applies it to all album photos plus the default, or to the default only. New photos added later get the default. A look status line shows the album look. Per-photo intensity is removed; looks always bake at 100. Custom presets and user .cube import are out.
approved: true
todos:
  - id: s6a
    content: Move look id types into src/domain/valueObjects (fixes CulledPhoto known violation)
    status: completed
  - id: s6f
    content: Scope popup UI (All album photos / New photos only)
    status: completed
  - id: s6b
    content: Remove lookIntensity everywhere; bake at fixed 100
    status: completed
  - id: s6c
    content: Album defaultLookId in model, entity, persistence and store setter
    status: completed
  - id: s6h
    content: Edit Photos look picker redesign per Figma
    status: completed
  - id: s6d
    content: New photos from Add Photos get the album default look
    status: completed
  - id: s6e
    content: Background apply album look action (all photos or new only)
    status: completed
  - id: s6g
    content: Look status line on the star filter row
    status: completed
  - id: s6i
    content: Wire Edit Photos and Change to picker, scope popup and apply action
    status: pending
isProject: false
---

# Phase 3d: Presets (album look)

Source: user brief (Phase 3d, 2026-11-02), user decisions below, `.cursor/plans/phase-3d-figma-spec.md` (Figma frames `12975:60712` and `12975:58242`), `.cursor/plans/phase-3b-figma-spec.md`, `.cursor/rules/project-map.mdc`.

Ids use `s6*`. Phase 3a uses `s3*`, phase 3b `s4*`, and phase 3c (`phase-3c-upload-export.plan.md`, runs in parallel) uses `s5*`. Slice ids are not in dependency order; the waves table is.

Branch: base from `feat/phase-3` (contains 3a and 3b).

## How to run

- Set `approved: true` in the frontmatter after review.
- Next pending group: `/run-group-prompt phase-3d-presets` (or `/run-group-prompt` alone to follow the roadmap).
- One slice by hand: `/slice-prompt <id>`, then commit.
- After the group: read the Gate R report, merge the branch or run `/fix-prompt`.

## Done

- Look catalog with 4 built-in looks (`original`, `cleanNatural`, `warmRomantic`, `filmMood`) and bundled .cube LUTs: `src/lib/look/{types,lookCatalog}.ts`.
- Per-photo look id: `CulledAlbumPhoto.lookId` (`src/lib/culledAlbum/types.ts:108`), entity `CulledPhoto.setLook`, persisted in the photo JSON.
- Apply look to a photo set: `cullingEngine.updateLook` (`src/lib/culling/cullingEngine.ts:938`). It validates the id and drops the stale look-baked detail.
- Bake at upload from the photo look: `src/lib/look/uploadLookBake.ts` via `serverUpload.ts`. Photos with a default look are baked by this path with no change.
- Grid thumbnails bake the look lazily per visible card (`CulledAlbumPhotoThumbnail.tsx:84`, `LookPreviewImage`); the grid reads `photoRenderStore` (throttled ~500 ms).
- Uploaded photos are locked: `isCulledPhotoDisabled` (`types.ts:318`), `serverUploadStatus === 'uploaded'`. In flight: `isServerUploadInFlight` (`pending`, `uploading`).
- Album persistence: `SQLiteAlbumRepository.save` stores `album.toPlain()` as one JSON blob. A new album field needs no `ALTER TABLE`.
- Chunk helpers: `src/lib/async/yieldToMain.ts`.

## Decisions (user, 2026-11-02)

- Only built-in looks. Custom presets, user .cube import and the Figma "Upload preset" tile are out.
- Album default look: `defaultLookId: LookId` in the album JSON blob. No SQLite column, no migration. Missing or invalid value reads as `original`. Not added to `CulledAlbumListItem`.
- Intensity is removed from the app: no slider, no `lookIntensity` field on photos or album. Old persisted values are ignored on read. JS always sends 100 to the native bake; the native API is unchanged. Bake cache keys include intensity, so photos baked at 80 re-bake at 100 when shown. Photos already on the server keep their 80 result.
- Edit Photos picker follows Figma `12975:61141`: title "Edit Photos", album name, preview of the focused photo (else the first album photo) with Before/After (starts on After), tiles Original + 3 looks with "· Current" on the album default, note text, "Use this look", "Cancel". Selected tile on open = album default.
- Scope popup follows Figma `12975:58671`:
  - "All album photos": apply to every album photo except photos already uploaded or uploading/pending server upload (they keep their look, so local matches server), including photos edited by hand; set the album default.
  - "New photos only": set the album default only.
  - X: cancel everything; nothing changes.
  - Shown even when the chosen look equals the current default.
- Apply runs in the background: the popup closes at once, photos update in chunks with `yieldToMain`, the last apply wins if a new one starts. Failures (album load, invalid id) happen before any change and are only reported through `reportError` (PostHog). No error toast.
- New photos created by Add Photos get the album default at creation. Photos merged in `sync.ts` (already on the server) stay `original`.
- Look status line "Look: <label> · Auto-applies to new photos · Change": same row as the star filter, space-between, on the right. Hidden when the default is Original.
- Edit Photos is enabled when the album has at least one photo. Focus returns to the trigger ("Edit Photos" or "Change") when the flow closes.
- Analytics `apply_look_started/completed/failed` send `lookId`, `scope`, `photoCount` (photos actually changed; 0 for new only). `lookIntensity` is dropped.
- Domain move: only `LOOK_IDS`, `LookId`, `isLookId`. `hasAppliedLook`, `LookDefinition`, catalog and bake stay in `src/lib/look`.
- Decorations: reuse the SVGs in `src/assets/images/upload/`.
- Cancelled apply (s6e): photos already changed by a cancelled "All album photos" apply stay changed (no rollback); the album default is the last call's. A failure after the first chunk rejects with a partial change; the caller reports it. The album persists once per apply (`persistAlbum` has no debounce; it only defers during navigation).

## Coordination with phase 3c

3c touches `src/lib/look/uploadLookBake.ts` (its s5h; `bakeLook.ts` was not edited), `store.ts` and `serverUpload.ts` (its s5d), `CulledAlbumDetailScreen.tsx` (its s5j, s5l), native `GumpLocalStorage` (its s5b, s5e). s6b removes the intensity parameter from the JS bake functions; its conflict surface with 3c s5h in `src/lib/look` is `uploadLookBake.ts`. Do not run s6b and 3c s5h at the same time. Whichever merges first wins; the other rebases onto it (user decision).

## Execution waves

| Group | Wave | Slices | Parallel? | Waits for | Merge order / shared-touch |
|-------|------|--------|-----------|-----------|----------------------------|
| Presets | W1 | s6a, s6f | yes | - | s6a, then s6f |
| Presets | W2 | s6b | no | W1 merged | `src/lib/look/*`, `types.ts`, `cullingEngine.ts`, `CulledAlbumDetailScreen.tsx`, `ApplyLookModal.tsx` (3c shared) |
| Presets | W3 | s6c, s6h | yes | W2 merged | s6c, then s6h. s6h alone touches the screen |
| Presets | W4 | s6d, s6e, s6g | yes | W3 merged | s6d (`store.ts`, `types.ts`), s6e (`cullingEngine.ts`), s6g (`CulledAlbumFilterBar.tsx`, screen) |
| Presets | W5 | s6i | no | W4 merged | `CulledAlbumDetailScreen.tsx`, sidebar props |

## Presets group (brief items: look per album, apply to existing, apply to new)

### s6a. Look id types into the domain [W1, parallel: s6f]

- **Risk:** high
- **Role:** system-architect
- **Depends on:** -
- **Parallel:** yes, with s6f
- **Shared-touch:** `src/lib/look/types.ts` (3c shared), `src/domain/index.ts` barrel
- **Scope:** new `src/domain/valueObjects/Look.ts` with `LOOK_IDS`, `LookId`, `isLookId`. `src/lib/look/types.ts` re-exports them. `CulledPhoto.ts` imports from the domain. Export from the domain barrel.
- **Rules:** the domain imports nothing outside `src/domain`. `DEFAULT_LOOK_INTENSITY` and `normalizeLookIntensity` stay where they are; s6b deletes them.
- **Mirror:** `src/domain/valueObjects/Status.ts`.
- **Acceptance:**
  - [ ] `CulledPhoto.ts` takes `LookId` and `isLookId` from the domain; its remaining `@lib/look/types` import is only the intensity helpers, which s6b deletes
  - [ ] All existing imports of `@lib/look/types` compile unchanged
  - [ ] `npm run typecheck`, `npm run lint`, `npm test` pass
- **Out of scope:** intensity removal (s6b), album field (s6c).
- **Gate:** none

### s6f. Scope popup UI [W1, parallel: s6a]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** -
- **Parallel:** yes, with s6a
- **Scope:** new presentational `src/components/modals/ApplyLookScopeModal.tsx`. Props: `visible`, `lookLabel`, `onApplyAll`, `onApplyNewOnly`, `onClose`. Copy, sizes and colors from the "Scope popup" section of `phase-3d-figma-spec.md`.
- **Rules:** no store access. No busy state: the parent closes the popup on either action. Use `Modal` from `@components/ui` and the existing decoration SVGs; compare with the spec, stop and ask if they differ. Do not call Figma.
- **Mirror:** `DeletePhotoModal.tsx` (confirm modal); decorations and tokens from `ApplyLookModal.tsx`.
- **Acceptance:**
  - [ ] Copy, sizes and colors match the spec file
  - [ ] Body text is "<lookLabel> applies to future uploads."
  - [ ] Both actions and close have `accessibilityRole="button"` and a label
  - [ ] Escape and close call `onClose`
  - [ ] Component test `__tests__/components/ApplyLookScopeModal.test.tsx` covers both actions and close
- **Out of scope:** wiring and focus return (s6i).
- **Gate:** A

### s6b. Remove look intensity [W2, sequential]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s6a
- **Parallel:** no, alone in its wave
- **Shared-touch:** `.cursor/rules/project-map.mdc` (Known violations), `src/lib/look/{types,lookCatalog,bakeLook}.ts` (3c s5h edits `bakeLook.ts` and `uploadLookBake.ts`), `src/lib/culledAlbum/types.ts`, `src/screens/CulledAlbumDetailScreen.tsx`, `src/components/modals/ApplyLookModal.tsx`
- **Scope:** remove `lookIntensity` and intensity parameters from: `types.ts`, `CulledPhoto.ts`, `photoMapper.ts`, `storage.ts`, `stableGridPhotos.ts`, `useStableGridPhotos.ts`, `cullingEngine.ts`, `bakeLook.ts`, `lookCatalog.ts`, `types.ts` in `src/lib/look`, `CulledAlbumPhotoGrid.tsx`, `CulledAlbumPhotoThumbnail.tsx`, `PhotoDetailImageViewer.tsx`, `ContainedLookImage.tsx`, `LookPreviewImage.tsx`, both CulledAlbum screens, and `ApplyLookModal.tsx` (drop the slider; `onApply(lookId)`). Delete `src/components/look/IntensitySlider.tsx`. One constant (for example `LOOK_BAKE_INTENSITY = 100` in `src/lib/look`) is the only value passed to the native bake. Remove the `CulledPhoto.ts:6` line from "Known violations" in `.cursor/rules/project-map.mdc` once `CulledPhoto.ts` has no `@lib` import.
- **Rules:** native bridge (`GumpLocalStorage.mm`, `.cpp`, `.h`) is not changed. Persisted `lookIntensity` in old photo JSON is ignored on read and not written back. Cache keys keep their format, so old 80 bakes miss and re-bake at 100.
- **Mirror:** current call chain from `getBakedUploadFile` to the native bridge in `bakeLook.ts`.
- **Acceptance:**
  - [ ] `grep -rn lookIntensity src` returns nothing
  - [ ] Every native bake call receives 100
  - [ ] Photo JSON with `lookIntensity: 80` loads without error and saves without the field (regression test)
  - [ ] Cache key for a photo previously baked at 80 differs from the new key (test)
  - [ ] Typecheck, lint, test pass (macOS and `npm run test:windows`)
- **Out of scope:** picker redesign (s6h), album default (s6c).
- **Gate:** none

### s6c. Album default look id [W3, parallel: s6h]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s6b
- **Parallel:** yes, with s6h
- **Shared-touch:** `src/lib/culledAlbum/types.ts`, `src/lib/culledAlbum/store.ts` (3c shared), persisted album JSON (no schema change)
- **Scope:**
  - `CulledAlbum` type: `defaultLookId: LookId`. `createCulledAlbumFromSelection` sets `original`.
  - Entity `src/domain/entities/CulledAlbum.ts`: field, getter, setter, `toPlain`, `fromPlain` with fallback.
  - `src/lib/culledAlbum/storage.ts`: thread the field through every `new CulledAlbum({...})` (lines 23, 115, 216) and the domain-to-store mapping (line 70).
  - Normalize on load: missing or invalid becomes `original`.
  - Store action `setAlbumDefaultLook(albumId, lookId)` using the existing debounced album persist.
- **Rules:** unknown id falls back to `original`, like photos (`types.ts:471`). Setting the default changes no photo.
- **Mirror:** `nextPhotoBatchId` threading through entity and `storage.ts`; per-photo normalize in `types.ts:471`.
- **Acceptance:**
  - [ ] Legacy album JSON without the field loads as `original` (regression test, in-memory repo)
  - [ ] Unknown id loads as `original`
  - [ ] Round trip: set, persist, reload, equal
  - [ ] Setting the default changes no photo
  - [ ] No SQL DDL added
- **Out of scope:** new photos (s6d), apply action (s6e), UI.
- **Gate:** none

### s6h. Edit Photos look picker redesign [W3, parallel: s6c]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s6b
- **Parallel:** yes, with s6c
- **Shared-touch:** `src/components/modals/ApplyLookModal.tsx`, `src/screens/CulledAlbumDetailScreen.tsx` (call-site props only)
- **Scope:** rebuild `ApplyLookModal` to the "Edit Photos look picker" section of `phase-3d-figma-spec.md`. Presentational props: `visible`, `albumName`, `previewPhoto`, `currentLookId`, `onUseLook(lookId)`, `onClose`. Before/After toggle (Before = original, After = selected look). Tiles Original + 3 catalog looks; each tile shows `previewPhoto` with its look; "· Current" on `currentLookId`; selected tile starts at `currentLookId`. The modal is 621 lines; new markup goes in new files of 300 lines or less in `src/components/look/` (for example tile and toggle).
- **Rules:** catalog labels, not "Style N". No intensity. No Upload preset tile. Do not call Figma.
- **Mirror:** current `ApplyLookModal` look list and `LookPreviewImage` use.
- **Acceptance:**
  - [ ] Layout, copy, colors match the spec file
  - [ ] Before shows the photo without a look; After shows the selected look
  - [ ] Tiles, toggle segments, "Use this look", "Cancel" and close are buttons with labels and are keyboard reachable
  - [ ] Selected and Current states are exposed to screen readers (`accessibilityState.selected`)
  - [ ] Component test covers tile select, toggle, "Use this look" with the selected id, Cancel
- **Out of scope:** flow wiring (s6i).
- **Gate:** A

### s6d. New photos get the album default [W4, parallel: s6e, s6g]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s6c
- **Parallel:** yes, with s6e and s6g
- **Shared-touch:** `src/lib/culledAlbum/types.ts`, `src/lib/culledAlbum/store.ts` (3c shared)
- **Scope:** `createCulledAlbumPhoto` takes an optional `lookId` (default `original`). The Add Photos path in `store.ts:957` passes the album `defaultLookId` read when the photos are created. `sync.ts:71` is unchanged.
- **Rules:** stamped once at creation. Later default changes do not touch the photo unless "All album photos" is used.
- **Mirror:** how `batchId` is read from the album and passed to `createCulledAlbumPhoto` in `store.ts`.
- **Acceptance:**
  - [ ] Default `warmRomantic`: Add Photos creates photos with `warmRomantic`
  - [ ] Default `original`: new photos are `original`
  - [ ] Photos merged by `sync.ts` stay `original`
  - [ ] Unit tests for the three cases
- **Out of scope:** existing photos (s6e).
- **Gate:** none

### s6e. Background apply album look action [W4, parallel: s6d, s6g]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s6c
- **Parallel:** yes, with s6d and s6g
- **Scope:** `cullingEngine.applyAlbumLook(albumId, lookId, scope: 'allPhotos' | 'newPhotosOnly')` in `src/lib/culling/cullingEngine.ts`. Validate first (load album, `isLookId`); then `setAlbumDefaultLook`; for `allPhotos`, update eligible photos in chunks of 50 (user decision) with `yieldToMain` between chunks, reusing the `updateLook` per-photo logic. Returns the number of photos changed.
- **Rules:**
  - Eligible = not `isCulledPhotoDisabled` and not `isServerUploadInFlight`.
  - Includes photos edited by hand.
  - A newer call for the same album cancels the older one at its next chunk; the last call wins.
  - Missing photos are skipped. Failures before the start throw; nothing has changed.
- **Mirror:** `cullingEngine.updateLook` (`cullingEngine.ts:938`).
- **Acceptance:**
  - [ ] `allPhotos` changes every eligible photo and sets the default
  - [ ] Uploaded, pending and uploading photos keep their look
  - [ ] `newPhotosOnly` changes no photo and sets the default
  - [ ] Second call during the first: final state equals the second call
  - [ ] Invalid id throws and changes nothing
  - [ ] Unit tests for each statement above
- **Out of scope:** UI, analytics, error reporting (s6i).
- **Gate:** none

### s6g. Look status line [W4, parallel: s6d, s6e]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** s6c
- **Parallel:** yes, with s6d and s6e
- **Shared-touch:** `src/screens/CulledAlbumDetailScreen.tsx` (3c shared, s6i)
- **Scope:** new `src/components/culling/AlbumLookStatus.tsx` (props `lookLabel`, `onChange`) per the "Look status line" section of the spec. Placed in the star filter row (`CulledAlbumFilterBar` row) with space-between, on the right. The screen passes the label from `album.defaultLookId` and the existing Edit Photos opener as `onChange` until s6i.
- **Rules:** hidden when `defaultLookId === 'original'`. "Change" is a button.
- **Mirror:** `CulledAlbumFilterBar` row; tokens from `src/lib/ui/typography`.
- **Acceptance:**
  - [ ] Copy, fonts, colors match the spec
  - [ ] Hidden for Original; visible otherwise
  - [ ] Label follows the album default without reload
  - [ ] "Change" is keyboard reachable with a label
  - [ ] Component test for label, hidden state and `onChange`
- **Out of scope:** the flow behind "Change" (s6i).
- **Gate:** A

### s6i. Wire the album look flow [W5, sequential]

- **Risk:** high
- **Role:** ui-frontend-developer (Build)
- **Depends on:** s6e, s6f, s6g, s6h
- **Parallel:** no, alone in its wave
- **Shared-touch:** `src/screens/CulledAlbumDetailScreen.tsx` (3c shared), sidebar action props (`CulledAlbumDetailSidebar.tsx` only if the enable rule lives there)
- **Scope:**
  - "Edit Photos" and "Change" open the picker with `albumName`, `previewPhoto` (focused photo from the 3b focus state, else the first photo in grid order), `currentLookId`.
  - "Use this look" closes the picker and opens the scope popup with the chosen look. Actions close the popup and call `applyAlbumLook` without awaiting the UI.
  - Edit Photos enabled when the album has at least one photo.
  - Focus returns to the trigger after the flow closes.
  - Analytics `apply_look_started/completed/failed` with `lookId`, `scope`, `photoCount`.
  - Failures go to `reportError` and `apply_look_failed`; no toast; replace the current `console.error`.
- **Rules:** X on the scope popup and "Cancel"/X on the picker change nothing.
- **Mirror:** current `handleApplyLook` in `CulledAlbumDetailScreen.tsx:474`.
- **Acceptance:**
  - [ ] Pick look, "All album photos": eligible photos change, status line shows the look
  - [ ] "New photos only": existing photos unchanged, status line shows the look, next Add Photos uses it
  - [ ] X or Cancel at any step changes nothing
  - [ ] Choosing the current look still shows the scope popup
  - [ ] Edit Photos disabled for an empty album
  - [ ] Focus returns to "Edit Photos" or "Change"
  - [ ] Failure is reported to PostHog, no toast
  - [ ] Typecheck, lint, test pass; manual run on macOS
- **Out of scope:** custom presets, re-upload, export changes.
- **Gate:** A, R

## Do not start

- Custom presets, user .cube import, "Upload preset" tile: out of scope (user decision 2026-11-02).
- Re-upload or re-bake of photos already on the server: decided not to touch them.
- Album look in the album list or card: not needed (user decision).
