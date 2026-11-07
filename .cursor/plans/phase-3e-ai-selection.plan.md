---
name: phase-3e-ai-selection
overview: AI Selection levels (Fewer / Balanced / More) for the culling sidebar. The user picks a level and presses "Update recommendations"; the app re-marks which photos are AI recommended by star rating (Fewer 5, Balanced 5 and 4, More 5, 4 and 3); picked photos never change. Level is stored per album. Includes the Updating, Updated and Update failed states. Pure JS, no native change.
approved: true
todos:
  - id: s7a
    content: AiSelectionLevel value object with star rule, album field, persistence and store setter
    status: completed
  - id: s7b
    content: Apply recommendations action (chunked, aiSelected only)
    status: completed
  - id: s7c
    content: useAiSelectionFlow hook (draft level, status, retry)
    status: completed
  - id: s7d
    content: AI Selection sidebar section UI
    status: pending
  - id: s7e
    content: Updated and Update failed toasts, wired on the screen
    status: pending
isProject: false
---

# Phase 3e: AI Selection levels

Source: user brief (EOD heading 2, 2026-11-04), user decisions below, Figma file `W6N2UvJAw3J8NTuT60MlmB` section "Photo Review" `12975:48188` (read via `get_metadata` and `get_screenshot`, not `get_design_context`), `.cursor/plans/phase-3b-sidebar-redesign.plan.md` (Do not start), `.cursor/rules/project-map.mdc`.

Ids use `s7*`. Phase 3a `s3*`, 3b `s4*`, 3c `s5*`, 3d `s6*`.

Branch: base from `feat/phase-3` (contains 3a to 3d).

## How to run

- Set `approved: true` in the frontmatter after review.
- Next pending group: `/run-group-prompt phase-3e-ai-selection` (or `/run-group-prompt` alone to follow the roadmap).
- One slice by hand: `/slice-prompt <id>`, then commit.
- After the group: read the Gate R report, merge the branch or run `/fix-prompt`.

## Done

- Per-photo `aiSelected`, `maybe`, `blurred`, `closedEyes`, `selected` and `starRating` come from native analysis (`cpp/analysis/PhotoFlags.cpp`: `DerivePhotoFlags`, `DeriveStarRating`) and are stored on `CulledPhoto`. Native is not changed by this phase.
- `DeriveStarRating`: 5 stars = no face with a low tier and no face with a medium tier; 4 stars = no low-tier face but some medium; 3, 2, 1 = at least one closed-eyes or blurred face, graded by the average tier. So today's `aiSelected` equals 5 stars and today's `maybe` equals 4 stars.
- Filters and counts already read `aiSelected`: `cullFilterLabels.ts` ("AI Recommended"), `cullingUtil.ts:603`, `AiCategoriesSection.tsx`, `PhotoAiBadges.tsx`, `SimilarShotsStrip.tsx`.
- Album persistence: one JSON blob via `album.toPlain()`. A new album field needs no `ALTER TABLE` (phase 3d).
- Chunked background apply with "last call wins": `src/lib/culling/applyAlbumLook.ts` (phase 3d). Chunk helper: `src/lib/async/yieldToMain.ts`.

## Figma facts (read 2026-11-04)

Sidebar "AI Selection" block, 246 wide, sits between Photo Filters and AI Categories (frame `12975:48521`, 180 high):
- Caption: sparkles icon 16 + "AI Selection".
- Segmented control (read with `get_design_context`, 2026-11-08): three pills in a row, gap 6, radius 24, Red Hat Display Regular 14 white. Unselected: 1px white border, padding X12 Y3, no fill. Selected: orange fill `#ff9632` (`theme/themeorange`), no border, padding X12 Y5.
- Helper line under it (Red Hat Display Regular 13 white): Balanced = "Balance quality, variety and coverage."; More = "A broader selection". Fewer copy is not in the file.
- Button "Update recommendations" (222 x 40).
- Footnote (Red Hat Display Regular 12, `#737373`): "Changes AI recommendations only. Your picked photos stay unchanged."
- Updating (frame `12975:51577`, block `12975:51909`): button is outlined orange (1px `#ff9632`, radius 24, h 40, opacity 60) with a 16 loader-circle icon and "Updating…" in Inter Semi Bold 14 orange; under it the indicator "Updating recommendations…" (Red Hat Display Regular 12, `#737373`); then the footnote.
- Updated (frame `12975:52002`, toast `12975:52424`): white toast, text `#131415` 16: bold "Recommendations updated · More" and regular "94 recommended photos. Your picked photos are unchanged.", and a 20 close icon on the right. No action button.
- Update failed (frame `12975:52436`, toast `12975:52858`): white toast, one row: 16 error icon, bold "Couldn't update recommendations", regular "Previous results kept", close icon on the right. No retry button.
- Sample counts in the file (AI Recommended 61 at Balanced, 94 at More, Needs Review 92, 635 photos) are mock numbers and do not match the star rule below.

## Decisions (user, 2026-11-04)

- Ranking is by star rating (`starRating`, 1 to 5): Fewer = 5 stars; Balanced = 5 and 4; More = 5, 4 and 3. Default level is Balanced. Photos with no rating (not analyzed, failed, 0) are never recommended. Duplicate groups, time spread and face flags are not inputs.
- Existing albums (already analyzed) are left as they are and read as Balanced; their picks are already 5 and 4 stars. `aiSelectionLevel` is written to an album only when the user applies a level; an album without the field reads Balanced (inferred, confirm: the user's wording was that state is saved for new albums).
- The rule runs in JS, not in C++ (the user first chose C++, then moved it to JS once the rule was a star threshold on data JS already holds). No native or bridge change in this phase.
- Consequence of the rule: Fewer reproduces today's AI Recommended; at the default Balanced, AI Recommended also includes today's Needs Review photos; More adds 3-star photos, which have a closed-eyes or blurred face (their `closedEyes` or `blurred` flags are true).

## Execution waves

| Group | Wave | Slices | Parallel? | Waits for | Merge order / shared-touch |
|-------|------|--------|-----------|-----------|----------------------------|
| AI Selection | W1 | s7a | no | - | `src/domain/index.ts`, `types.ts`, `store.ts` |
| AI Selection | W2 | s7b | no | W1 merged | `store.ts`, `culledAlbumContext.ts`, `culledAlbumProvider.tsx` |
| AI Selection | W3 | s7c | no | W2 merged | - |
| AI Selection | W4 | s7d | no | W3 merged | `CulledAlbumDetailSidebar.tsx`, `CulledAlbumDetailScreen.tsx` |
| AI Selection | W5 | s7e | no | W4 merged | `CulledAlbumDetailScreen.tsx` |

## AI Selection group (EOD heading 2)

### s7a. AiSelectionLevel, star rule, album field and setter [W1, sequential]

- **Risk:** high
- **Role:** system-architect
- **Depends on:** -
- **Parallel:** no, alone in its wave
- **Shared-touch:** `src/domain/index.ts` barrel, `src/lib/culledAlbum/types.ts`, `src/lib/culledAlbum/store.ts`
- **Scope:** `src/domain/valueObjects/AiSelection.ts` with `AI_SELECTION_LEVELS = ['fewer','balanced','more']`, `AiSelectionLevel`, `isAiSelectionLevel`, the minimum stars per level (Fewer 5, Balanced 4, More 3) and `isRecommendedAtLevel(starRating, level)`. Album field `aiSelectionLevel` (the level last applied) in the `CulledAlbum` entity, `toPlain`, `types.ts`, and a store setter `setAlbumAiSelectionLevel`. Missing or invalid persisted value reads as `balanced`.
- **Rules:** the domain imports nothing outside `src/domain`. The field is the applied level, not the draft shown in the control (draft belongs to s7c). No SQLite column, no migration. Rating of `null`, 0 or below the minimum is not recommended.
- **Mirror:** `src/domain/valueObjects/Look.ts` and the album `defaultLookId` field and setter (phase 3d s6c).
- **Acceptance:**
  - [ ] `isRecommendedAtLevel` is true for 5 at Fewer; for 5 and 4 at Balanced; for 5, 4 and 3 at More; false for 2, 1, 0 and `null` at every level
  - [ ] Each level's set is a subset of the next
  - [ ] An album without the field, or with an invalid stored value, reads `balanced`
  - [ ] The setter persists the album once and does not touch any photo
  - [ ] Field is not added to `CulledAlbumListItem`
  - [ ] `npm run typecheck`, `npm run lint`, `npm test` pass
- **Out of scope:** applying to photos (s7b), UI (s7d, s7e).
- **Gate:** none

### s7b. Apply recommendations action [W2, sequential]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s7a
- **Parallel:** no, alone in its wave
- **Shared-touch:** `src/lib/culledAlbum/store.ts`, `src/context/culledAlbumContext.ts`, `src/context/culledAlbumProvider.tsx`
- **Scope:** `src/lib/culling/applyAiSelectionLevel.ts`: for the album's photos, sets `aiSelected = isRecommendedAtLevel(photo.starRating, level)` in chunks with `yieldToMain`, sets the album `aiSelectionLevel`, persists once, returns the recommended count. Exposed as one context action. Stats and filter counts update through existing derivation.
- **Rules:**
  - Only `aiSelected` changes. `selected` (picks), `maybe`, `blurred`, `closedEyes` and `starRating` are never written.
  - Newer call for the same album wins at its next chunk; photos already changed stay changed (as `applyAlbumLook`).
  - Uploaded or in-flight photos are included: only a local flag changes, no file or server data (inferred, confirm).
  - A failure rejects; the caller reports it.
- **Mirror:** `src/lib/culling/applyAlbumLook.ts`.
- **Open:**
  - Whether photos that become AI Recommended should leave Needs Review (`maybe`), Possible Blur or Possible Closed Eyes. Figma does not say; this plan leaves those flags untouched, so one photo can show in two categories.
  - Known gap, accepted by the user: until Update is pressed, the AI Recommended filter, count and badges show the 5-star set (analysis-time `aiSelected`) while the label reads Balanced. The picks (`selected`, 5 and 4 stars) already match Balanced.
- **Acceptance:**
  - [ ] After apply, each photo's `aiSelected` equals `isRecommendedAtLevel(starRating, level)`
  - [ ] `selected` is identical before and after for every photo
  - [ ] The album level is saved once per run and the recommended count is returned
  - [ ] A second call cancels the first at the next chunk
  - [ ] A failure leaves the album level unchanged and rejects
- **Out of scope:** hook and status (s7c), UI (s7d, s7e).
- **Gate:** none

### s7c. useAiSelectionFlow hook [W3, sequential]

- **Risk:** normal
- **Role:** integration-engineer
- **Depends on:** s7b
- **Parallel:** no, alone in its wave
- **Scope:** `src/hooks/useAiSelectionFlow.ts`: draft level (starts at the album's applied level), status `idle | updating | updated | failed`, `update()` calls the s7b action, `retry()`, `dismiss()`. Reports failures with the app's error reporter and keeps the recommended count for the toast.
- **Rules:** changing the draft does not change any photo. Pressing update while `updating` is ignored. Status is local to the hook (transient); the applied level has one owner, the album (s7a).
- **Mirror:** `src/hooks/useAlbumLookFlow.ts`.
- **Acceptance:**
  - [ ] Draft changes alone cause no photo change
  - [ ] `update()` moves idle to updating to updated and exposes the recommended count
  - [ ] A rejected update ends in `failed` and is reported once
  - [ ] Double press while updating makes one call
- **Out of scope:** rendering (s7d, s7e).
- **Gate:** none

### s7d. AI Selection sidebar section UI [W4, sequential]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s7c
- **Parallel:** no, shares the sidebar and screen with s7e
- **Shared-touch:** `src/components/culling/CulledAlbumDetailSidebar.tsx`, `src/screens/CulledAlbumDetailScreen.tsx`
- **Scope:** new `AiSelectionSection` component per the Figma facts above: caption, segmented control, helper line, "Update recommendations" button, footnote, and the Updating button and indicator. Placed between Photo Filters and AI Categories (replaces the 3b gap). Uses `useAiSelectionFlow`.
- **Rules:** follow Figma 100%. The segmented control is one keyboard stop group with arrow keys; segments use the ui `Pressable` (macOS Space/Enter). While updating the control and button are disabled and the button reads "Updating…".
- **Mirror:** `src/components/culling/AiCategoriesSection.tsx` (sidebar section) and the ui `Pressable`.
- **Copy:** Fewer helper line is "Only the best shots" (user decision, 2026-11-08; no Figma frame shows Fewer selected).
- **Acceptance:**
  - [ ] Section matches Figma sizes and states (Balanced, More, Updating)
  - [ ] Segments are reachable by keyboard and announce selected state
  - [ ] Button is disabled while updating and shows the loader
  - [ ] Section file stays under 300 lines
- **Out of scope:** toasts (s7e), hook logic (s7c).
- **Gate:** A

### s7e. Updated and Update failed toasts [W5, sequential]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s7d
- **Parallel:** no, shares the screen with s7d
- **Shared-touch:** `src/screens/CulledAlbumDetailScreen.tsx`
- **Scope:** toast "Recommendations updated · <Level>" with "<N> recommended photos. Your picked photos are unchanged." and a close button; failure toast "Couldn't update recommendations" with an error icon. Triggered by the hook status. Announced to screen readers.
- **Rules:** follow Figma 100%. No retry action on the failure toast (Figma has none); only the close icon. The failure line "Previous results kept" is true because a failed save leaves the applied level unchanged (s7b); photo flags changed before a mid-run failure stay (partial change, see s7b).
- **Mirror:** `src/components/upload/UploadToast.tsx`, `src/components/error/ErrorToast.tsx`.
- **Auto-dismiss:** 5000 ms, the house value in `ErrorToast.tsx` (`TOAST_DURATION`) and `UploadToast.tsx` (`AUTO_CLOSE_DELAY_MS`); Figma gives none (inferred, confirm).
- **Acceptance:**
  - [ ] Updated toast shows the applied level and the recommended count
  - [ ] Failure toast shows after a rejected update and does not claim any change
  - [ ] Close dismisses; screen readers hear the message when it appears
- **Out of scope:** section UI (s7d).
- **Gate:** R (end of group)

## Do not start

- Legend button and popup (deferred, subscription related).
- "AI badge = More" overflow chips on photo cards (26 instances in Figma). Not part of AI Selection; meaning unconfirmed.
- Changing `DerivePhotoFlags` or the analysis-time `aiSelected`, and any native or bridge change.
- Server-side or backend recommendations.
