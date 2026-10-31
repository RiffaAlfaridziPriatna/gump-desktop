---
name: phase-3a-similar-shots
overview: Show Similar Shots as groups (grouped filter view, main-grid badge, viewer strip) using the duplicate groups the analysis already computes and persists. Local only, no new analysis pass.
approved: true
todos:
  - id: s3a
    content: Similar-shot group derivations (pure lib + tests)
    status: completed
  - id: s3b
    content: useSimilarShotGroups read seam
    status: completed
  - id: s3d
    content: Grid section rows (group header row support)
    status: pending
  - id: s3e
    content: Similar Shots filter renders grouped view
    status: pending
  - id: s3f
    content: Main grid "N similar shots" card badge
    status: pending
  - id: s3g
    content: Viewer similar-shots strip
    status: pending
isProject: false
---

# Phase 3a: Similar Shots as groups

Source: user brief (Phase 3a), Figma W6N2UvJAw3J8NTuT60MlmB section "Photo Review" 12975:48188 (frames 12975:48189, 12975:50306, 12975:50730, 12975:54491), docs/PROJECT.md (Arsitektur, Dual state).

Project map: `.cursor/rules/project-map.mdc` does not exist in this repo. Assumptions used instead: layers and folders from docs/PROJECT.md (`screens/components/hooks/context` → `application` → `domain` → `infrastructure`; `lib/culling` and `lib/culledAlbum` hold culling logic and the album store); verify commands from package.json: `npm run typecheck`, `npm run lint`, `npm test`; file limit 300 lines; roles = the agent roles in the slice-plan skill.

## How to run

- Set `approved: true` in the frontmatter after review.
- Next pending group: `/run-group-prompt phase-3a-similar-shots` (or `/run-group-prompt` alone to follow the roadmap).
- One slice by hand: `/slice-prompt <id>`, then commit.
- After the group: read the Gate R report, merge the branch or run `/fix-prompt`.

## Done

- Group building already exists. `detectDuplicates` / `detectDuplicatesAsync` return `CullingDuplicateGroup[]` = `{groupId, photoIds, bestPhotoId}` (src/lib/culledAlbum/types.ts:180), groups of size ≥ 2, union-find over a 5-minute capture window.
- Groups are already stored and persisted. `completeAnalysis` always runs `applyDuplicateFlags` (src/lib/culling/cullingEngine.ts:1083), which writes `album.cullingDuplicateGroups` (cullingEngine.ts:323). The native session path writes the C++ groups the same way (cullingEngine.ts:768-779). `CulledAlbum.toPlain()` includes the field and `SQLiteAlbumRepository` saves it as JSON (SQLiteAlbumRepository.ts:9). Delete keeps groups consistent via `patchDuplicateGroupsAfterDelete` (deletePhotoDerivedState.ts:141). Added in 9fb51dc (2026-07-24).

## Rules for every slice

- Single owner: `culledAlbumStore.albums[id].cullingDuplicateGroups`. All group views (index, order, counts, picked) are derived with memoized pure functions. No group data copied into photo records, render store or component state.
- No change to the analysis path (`cullingEngine` ingest, `analysisQueue`, C++). Derivations run on render data only: O(total group members) per groups or selection change.
- "Picked" = `photo.selected` (sidebar "Picked for Upload"). "AI recommended" badge = existing `aiSelected` badge. Group `bestPhotoId` is not shown as "picked".
- Files over 300 lines must not grow net. New logic goes in new files ≤ 300 lines; the over-limit file only gets the wiring (import + a few lines). A full split of the 900+ line screens is out of this plan.
- Every slice ends with `npm run typecheck`, `npm run lint`, `npm test`; report what ran and what did not.

## Execution waves

| Group | Wave | Slices | Parallel? | Waits for | Merge order / shared-touch |
|-------|------|--------|-----------|-----------|----------------------------|
| Data | W1 | s3a | no | - | - |
| Data | W2 | s3b | no | W1 merged | - |
| UI | W1 | s3d, s3g | yes | Data Gate R | s3d, then s3g |
| UI | W2 | s3e | no | W1 merged | - |
| UI | W3 | s3f | no | W2 merged | - |

## Data group (brief: "Do first" items 1-3)

### s3a. Similar-shot group derivations [W1, sequential]

- **Risk:** high (first slice, new rules)
- **Role:** system-architect
- **Depends on:** -
- **Parallel:** no, alone in its wave
- **Scope:** new `src/lib/culling/similarShotGroups.ts` (pure, no store import):
  - `indexGroupsByPhotoId(groups) → Map<photoId, groupIndex>`
  - `orderSimilarShotGroups(groups, photosById)`: drops ids not in the album, drops groups left with < 2 live members, orders groups by earliest member `capturedAt`, members by `capturedAt` then file name.
  - `summarizeGroup(group, photosById) → {shotCount, pickedCount}`.
  - `buildSimilarShotSections(orderedGroups, matchesOtherFilters)`: the grouped-view model (see s3e rules).
  - New `__tests__/similarShotGroups.test.ts`.
- **Rules:** group "n" in "Group n" is the 1-based position after ordering (inferred, confirm). `groupId` is not shown; it changes when the best photo changes (`dup-<bestId>-<size>`).
- **Mirror:** `patchDuplicateGroupsAfterDelete` in src/lib/culling/deletePhotoDerivedState.ts (pure function over groups + `getPhoto`), tests in __tests__/deletePhotoDerivedState.test.ts.
- **Acceptance:**
  - [ ] Stale ids (deleted photos) are dropped; a group with < 2 live members is not returned
  - [ ] Order is stable for equal `capturedAt` (file-name tiebreak)
  - [ ] `pickedCount` counts `selected` only, independent of `bestPhotoId`
  - [ ] Tests cover empty groups, undefined groups, stale ids, ordering, picked count, section building
- **Out of scope:** store access (s3b), UI.
- **Gate:** none

### s3b. useSimilarShotGroups read seam [W2, sequential]

- **Risk:** normal
- **Role:** integration-engineer
- **Depends on:** s3a
- **Parallel:** no, alone in its wave
- **Scope:** new `src/hooks/useSimilarShotGroups.ts`: selects `cullingDuplicateGroups` for one album from `culledAlbumStore` plus the grid photos the screen already has; returns memoized `{orderedGroups, groupIndexByPhotoId, summaryFor(groupIndex)}` from s3a.
- **Mirror:** how CulledAlbumDetailScreen / sidebar read `cullingKeyFaces` from the album (inferred, confirm the exact selector during the slice).
- **Acceptance:**
  - [ ] Hook re-derives only when the groups reference or the photo list changes (test with a store fixture)
  - [ ] Undefined groups returns empty results and `hasGroups: false`, no throw
- **Out of scope:** writing groups.
- **Gate:** R (end of Data group)

## UI group (Figma 12975:50306, 12975:50730, 12975:48189, 12975:54491)

### s3d. Grid section rows [W1, parallel: s3g]

- **Risk:** high (virtualized list, perf-sensitive)
- **Role:** ui-frontend-developer (Build)
- **Depends on:** Data Gate R
- **Parallel:** yes, with s3g
- **Scope:** `CulledAlbumPhotoGrid` (588 lines) accepts optional sections `{title, photoIds}[]`. Move `GridRow` / `buildRows` out to new `src/components/culling/culledAlbumGridRows.ts` and add a header row kind; new `src/components/culling/SimilarShotGroupHeader.tsx` (stack icon + "Group n · x shots · y picked", and the plain "Other matching photos" header). Without sections the grid behaves as today.
- **Mirror:** existing `buildRows` / row renderer in CulledAlbumPhotoGrid.tsx.
- **Acceptance:**
  - [ ] Flat grid output (no sections) is unchanged: same row keys, same windowing props
  - [ ] Header rows never contain photo cells; a group never shares a row with another group
  - [ ] CulledAlbumPhotoGrid.tsx line count does not grow
  - [ ] Headers are announced as headers to screen readers
- **Out of scope:** deciding when sections are used (s3e).
- **Gate:** A

### s3e. Similar Shots filter renders grouped view [W2, sequential]

- **Risk:** high (changes filter semantics)
- **Role:** ui-frontend-developer (Build)
- **Depends on:** s3d, s3b
- **Parallel:** no, alone in its wave
- **Scope:** `useCulledAlbumFilters` returns `sections` when the `duplicated` filter is on; CulledAlbumDetailScreen passes them to the grid (wiring only); "Showing: Similar Shots · N groups · M photos" line; sidebar label "Duplicated" → "Similar Shots".
- **Rules (decided by user 2026-10-31):**
  - Similar Shots only: every group, all members (including the best photo, which `matchesCullFilterKey('duplicated')` excludes today).
  - Similar Shots + other categories: inside each group, show only the members that match another active category; a group with no matching member is hidden. Ungrouped matches go under "Other matching photos". Matching inside a group uses the raw flag (today `closedEyes` etc. exclude `duplicated` photos).
  - Sidebar Similar Shots count = total photos in groups (all members, including best), derived from the groups. `stats.duplicated` is not changed.
  - Album without stored groups (analysed before 2026-07-24): no grouped view, no backfill. Similar Shots falls back to today's flat `duplicated` list and today's `stats.duplicated` count.
  - Selection filter (picked / not picked) and star filter still apply per photo; a group with no remaining photo is hidden.
  - "Upload Picked (N)" is unchanged; it counts all picked photos ("Upload includes picked photos outside this view").
  - Group header "x shots · y picked" always counts the full live group, even when only some members are shown; same numbers as the viewer strip. The "Showing: … · M photos" line counts the shown photos.
- **Mirror:** `matchesCulledAlbumGridFilters` + `useCulledAlbumFilters` filtering.
- **Acceptance:**
  - [ ] Filter tests in __tests__/culledAlbumPhotoFilters.test.ts or hooks.test.ts cover: Similar Shots alone, + Closed Eyes (only matching members shown, empty group hidden), + selection filter, empty result, missing groups fallback
  - [ ] Sidebar count equals the number of photos shown with Similar Shots alone
  - [ ] Group header picked count updates after toggling a pick, without re-running detection
  - [ ] CulledAlbumDetailScreen.tsx and CulledAlbumDetailSidebar.tsx line counts do not grow
- **Out of scope:** card badge (s3f), viewer (s3g), AI Selection levels, Faces panel.
- **Gate:** none

### s3f. Main grid "N similar shots" card badge [W3, sequential]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** s3e
- **Parallel:** no, touches the grid and screen wiring changed in s3e
- **Scope:** badge "N similar shots ›" on every card that belongs to a group, in the flat grid (frame 48189). Tap opens the photo viewer for that photo (existing `onOpenDetail`); the s3g strip shows the group. Card (384 lines) gets one prop; badge is a new small component in components/culling.
- **Rules (decided by user 2026-10-31):** badge on all group members; tap opens the viewer and does not change active filters.
- **Open:** how the badge sits next to the existing status chips ("Check eyes", "+1") on the same card (inferred: same chip row, confirm on review).
- **Acceptance:**
  - [ ] Every member of a live group shows the badge; count = live group size from s3b
  - [ ] Tap opens the viewer for that photo; active filters unchanged
  - [ ] Badge is a button with an accessible label
  - [ ] No badge on albums without stored groups
- **Out of scope:** collapsing groups in the main grid (not in Figma).
- **Gate:** A, R (end of UI group)

### s3g. Viewer similar-shots strip [W1, parallel: s3d]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** Data Gate R
- **Parallel:** yes, with s3d (different files)
- **Scope:** new `src/components/culling/SimilarShotsStrip.tsx`: "Similar shots · x photos · y picked", member thumbnails with pick toggle, AI recommended badge, current photo outlined; tap a thumbnail opens that photo. Hidden when the photo is in no group. CulledAlbumPhotoDetailScreen (927 lines) gets wiring only.
- **Mirror:** `CulledAlbumPhotoThumbnail` and the existing pick toggle handler in CulledAlbumPhotoDetailScreen.
- **Acceptance:**
  - [ ] Pick toggle in the strip uses the existing selection action (same store write as "Pick for upload")
  - [ ] Strip is keyboard reachable; thumbnails have accessible labels with file name and picked state
  - [ ] CulledAlbumPhotoDetailScreen.tsx line count does not grow
- **Out of scope:** Faces panel, AI markers.
- **Gate:** A

## Do not start

- AI Selection levels, Faces panel/markers, presets, upload/export, subscription, sorting (out of scope per brief).
- Collapsing groups to one card in the main grid: not in Figma.
- Backfilling groups for albums analysed before 2026-07-24: declined by user 2026-10-31. Those albums show groups only after a re-analysis.
- Splitting CulledAlbumDetailScreen / CulledAlbumPhotoDetailScreen / CulledAlbumDetailSidebar below 300 lines: separate refactor-janitor pass.
