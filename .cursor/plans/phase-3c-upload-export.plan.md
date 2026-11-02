---
name: phase-3c-upload-export
overview: Upload and export improvements from the phase 3 list. Cloud storage check before upload, local disk space check before export and before the look bake that precedes upload, and clear failure handling (one message per cause, retry only what can succeed, no half-finished state). Subscription, trial, checkout, device limit, offline handling, AI Selection and presets are out.
approved: true
todos:
  - id: s5a
    content: Contracts for disk space, sizes, failure reasons, native error codes and upload preflight
    status: pending
  - id: s5b
    content: Native getFreeDiskSpace in GumpLocalStorage (macOS and Windows)
    status: pending
  - id: s5c
    content: Fake native disk, export error, upload error and cloud storage fixtures
    status: pending
  - id: s5d
    content: Server upload failure groups and retry of retryable photos only
    status: pending
  - id: s5e
    content: Native error codes for export and look bake failures
    status: pending
  - id: s5f
    content: Export disk preflight and typed export failures
    status: pending
  - id: s5g
    content: Cloud storage preflight hook for upload
    status: pending
  - id: s5h
    content: Disk check before the upload look bake
    status: pending
  - id: s5k
    content: Server upload toast counts failures
    status: pending
  - id: s5i
    content: Export modal failure states per Figma
    status: pending
  - id: s5j
    content: Upload modal cloud storage states per Figma
    status: pending
  - id: s5l
    content: Upload modal failure states (partial, quota, final, disk while baking)
    status: pending
isProject: false
---

# Phase 3c: upload and export improvements

Source: phase 3 list item "Upload and export improvements: storage check, disk space, failure handling" (user, 2026-11-02); `.cursor/plans/phase-3c-figma-spec.md` (Figma section "Upload & Export" `12975:61722`); `.cursor/rules/project-map.mdc`; backend facts read from the sibling repo `../backend` on the user's request (read only, never imported). No PRD section or design file exists for this item.

Branch: from `feat/phase-3` (holds 3a and 3b). Runs in parallel with `phase-3d-presets`; every file that plan may also touch is listed under Shared-touch.

## How to run

- Set `approved: true` in the frontmatter after review.
- Next pending group: `/run-group-prompt phase-3c-upload-export` (or `/run-group-prompt` alone to follow the roadmap).
- One slice by hand: `/slice-prompt <id>`, then commit.
- After the group: read the Gate R report, merge the branch or run `/fix-prompt`.

## Done

- Verified in code (2026-11-02), reused, not rebuilt:
  - `ExportPhotosModal` already has steps `options | applyingLook | preparing | ready | success | failed`, a `failureKind` of `prepare | download`, "Try Again" (re-runs download when a ZIP is staged, else prepare) and "Change save location" through `pickExportDirectory`.
  - Export writes the ZIP to an app staging folder (`ensureExportStagingDirectory`), then copies it to the destination (`downloadPreparedExport`). Look bake output also goes to the staging folder (`bakeLook.ts`).
  - Server upload retries once on HTTP 5xx (`serverUpload.ts`), times out after 10 min per photo (`serverUploadQueue.ts`), then marks the photo `failed` and settles it. No user action re-uploads failed photos today.
  - `uploadQueueStore` has `failed`, `failedCount`, `completionSeen`. `startServerUploadBatch(albumId, photoIds)` resets the given photos to `pending` and sets the batch.
  - `StorageDto.gbUsed/gbLimit/gbExtra` comes with the current user (query `['currentUser', token]` in `src/context/auth.tsx`) and is mapped to `storageGb {used, limit}` by `src/application/plan/mapUserPlan.ts` (limit = `gbLimit + gbExtra`).
  - `GumpLocalStorage` (macOS `.mm`, Windows `.h/.cpp`) owns every export native method. Windows rejects with `ReactError{"Error", text}`; `ReactError` has `Code` and `UserInfo` fields, so codes and counts can travel on both platforms.
  - `APIAgent` maps the server body `error` field to `APIException.name` (`src/services/api/agent.ts:76`).
  - `openUpgradePlan()` in `src/lib/plan/billingLinks.ts` opens `${WEB_APP_URL}/upgrade`.
  - No disk space code exists in `src/`, `macos/` (outside Pods), `windows/` or `cpp/`.
- Backend facts (`../backend`, read 2026-11-02):
  - `BYTES_PER_GB = Math.pow(1024, 3)`; `gbUsed/gbLimit/gbExtra` are `toFixed(1)` of bytes (`storage.entity.ts:108`).
  - Media upload finalization throws `USER_STORAGE_GB_LIMIT` (400, "Not enough storage") when `ContentLength + bytesUsed > bytesLimit + bytesExtra`, and `USER_DATA_USAGE_LIMIT` (400, "Reached data usage limit"); no check when `bytesLimit` is null (`media.service.ts:1318-1329`).
  - The server does not dedupe media uploads.

## Decisions (user, 2026-11-02)

- Disk space API: new method `getFreeDiskSpace(path)` on the existing `GumpLocalStorage` module (macOS and Windows). No new native module, dependency or podspec change.
- Disk threshold: estimate plus a fixed 500 MB margin in one constant. Before prepare: staging volume free space >= estimated export bytes + margin. Before saving: destination volume free space >= real ZIP `byteSize` + margin.
- Estimate: a photo's source `file.size`, also for photos that get a look bake. A photo with no `file.size` counts as 0 and the gap is reported through `reportError`.
- A failure of `getFreeDiskSpace` itself does not block export or bake: report it and continue; native `E_DISK_FULL` still catches a full disk.
- Cloud numbers: when the upload modal opens, refetch the current-user query and read `storageGb`. A failed refetch shows "Couldn't check cloud storage". No new endpoint. The server stays the final authority.
- Sizes show as GB with one decimal, binary base, matching the backend; below 0.05 GB shows "<0.1 GB".
- Near-limit banner: shown when the remainder after upload is under 5% of the limit.
- Unlimited plan (`gbLimit` null): status `ok`; card shows numbers without "/ limit" and without a bar.
- Not enough disk blocks export with "Try again" and "Change save location". Not enough cloud storage blocks upload with "View cloud plans" (`openUpgradePlan()`; the modal re-checks storage when the app becomes active again) and "Choose fewer photos" (close the modal, picks kept).
- Retry groups for server upload failures (transient errors only, per RFC 9110 and common SDK practice):
  - Retryable: network (no status), timeout, HTTP 5xx, 408, 429.
  - Quota: `USER_STORAGE_GB_LIMIT`, `USER_DATA_USAGE_LIMIT`. Retry offered only after a fresh cloud check says the retry fits.
  - Final: other 4xx and a missing local source file. Never retried.
- Duplicate risk on retry after a client timeout is accepted; every retry is reported with album and photo ids so it can be measured. Server dedupe is a backend item, outside this plan.
- All photos failed uses the partial failure frame with 0. Quota and final copy and the bake disk-full copy are in the Figma spec under "Decided".
- Server upload toast shows "Uploaded {ok} out of {n} photos" when some failed; no per-photo error UI.
- Missing source files keeps the Figma copy ("Reconnect them and try again."); no reconnect action; "Try again" re-runs prepare.
- Export ready button label becomes "Save to computer"; it still saves to the default folder without a dialog. "Save cancelled" appears when the "Change save location" picker is cancelled.
- Figma icons are downloaded to the session scratchpad (see spec); the UI slice copies them into `src/assets/images/`.

## Rules for every slice

- One owner per state. Photo upload status stays in the culledAlbum store; queue status stays in `uploadQueueStore`; cloud usage stays in the TanStack current-user query (never copied into a store); bake sessions stay in `uploadLookBake.ts`; export step stays local to `ExportPhotosModal`.
- Free disk space and storage numbers are read at the moment of the check, never cached.
- Native error codes are translated to app reasons in exactly one place (`src/lib/export`); server errors in exactly one place (`formatUploadError.ts`). UI never reads native codes or `APIException` directly.
- Server error codes used: only `USER_STORAGE_GB_LIMIT` and `USER_DATA_USAGE_LIMIT` (from `../backend` constants). Everything else is classified by status class and transport type.
- Native failures leave no partial file in staging or at the destination.
- Logs and reports carry album id, photo id, counts and byte sizes; full file paths are not logged.
- Every catch reports through `reportError` (or rethrows) and surfaces a reason; no `.catch(() => undefined)` in new code.
- Files over 300 lines (`ExportPhotosModal.tsx` 998, `UploadSelectedModal.tsx` 404, `UploadToast.tsx` 976, `store.ts` 1458, `CulledAlbumDetailScreen.tsx`) grow only by wiring; new markup goes in new files of 300 lines or less in `src/components/modals/`.
- Native work stays in native; culling work is not touched.
- UI follows `.cursor/plans/phase-3c-figma-spec.md`. That file replaces "ask the user for a screenshot" for this plan. A gap or conflict with the spec means stop and ask one question.
- Every slice ends with `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:windows`; native slices also build macOS and Windows. Report what ran and what did not.

## Execution waves

| Group | Wave | Slices | Parallel? | Waits for | Merge order / shared-touch |
|-------|------|--------|-----------|-----------|----------------------------|
| Upload & export | W1 | s5a | no | - | `src/lib/export/types.ts`, `nativeExport.ts`, `formatByteSize.ts` |
| Upload & export | W2 | s5b, s5c, s5d | yes | W1 merged | s5b, s5c, then s5d (`store.ts`, `serverUpload.ts`, shared with 3d) |
| Upload & export | W3 | batch 1: s5e, s5f, s5g; batch 2: s5h, s5k | yes, within each batch | W2 merged | s5e (native), s5f (`prepareExport.ts`, shared with 3d), s5g, s5h (`src/lib/look/*`, shared with 3d), s5k |
| Upload & export | W4 | s5i | no | W3 merged | `ExportPhotosModal.tsx` (shared with 3d); copies icons into `src/assets/images/` |
| Upload & export | W5 | s5j | no | W4 merged | `UploadSelectedModal.tsx`, `CulledAlbumDetailScreen.tsx` (shared with 3d) |
| Upload & export | W6 | s5l | no | W5 merged | `UploadSelectedModal.tsx`, `CulledAlbumDetailScreen.tsx` (shared with 3d) |

## Upload & export group (phase 3 item; Figma 12975:61722)

### s5a. Contracts for disk space, sizes, failure reasons and upload preflight [W1, sequential]

- **Risk:** high
- **Role:** system-architect
- **Depends on:** none
- **Parallel:** no, alone in its wave
- **Shared-touch:** `src/lib/export/types.ts`, `src/lib/export/nativeExport.ts`, `src/lib/export/formatByteSize.ts` (3d may touch export; confirm with the 3d plan)
- **Scope:**
  - `getFreeDiskSpace(path): Promise<{availableBytes: number}>` on the `NativeExportModule` type and a thin wrapper in `nativeExport.ts` (no native code).
  - `DISK_SPACE_MARGIN_BYTES = 500 * 1024 * 1024`; pure `hasEnoughDiskSpace(availableBytes, requiredBytes)` adding the margin.
  - Pure `estimateExportBytes(photos)`: sum of `photo.file.size`; returns the count of photos without a size so the caller can report it.
  - `formatGigabytes(bytes)` next to `formatByteSize`: binary base, one decimal, "<0.1 GB" below 0.05 GB.
  - `ExportFailureReason`: `'diskFull' | 'folderNotWritable' | 'sourceMissing' | 'unknown'`; `ExportError` (extends `AppError`) with `reason`, `requiredBytes?`, `missingCount?`.
  - Native reject code table, both platforms: `E_DISK_FULL`, `E_NOT_WRITABLE`, `E_SOURCE_MISSING` (with `missingCount` in user info).
  - `UploadFailureGroup`: `'retryable' | 'quota' | 'final'`, and `UploadFailureCause`: `'network' | 'timeout' | 'server' | 'rateLimited' | 'storageLimit' | 'dataUsageLimit' | 'rejected' | 'sourceMissing' | 'unknown'`, with a fixed cause-to-group map (`unknown` = retryable).
  - `CloudStoragePreflight`: `checking | unavailable | ok | nearLimit | exceeded`, with `uploadBytes`, `usedBytes`, `limitBytes | null`, `afterBytes`; `NEAR_LIMIT_RATIO = 0.05`.
- **Rules:** decisions above.
- **Mirror:** `src/lib/observability/AppError.ts`; `src/lib/export/types.ts`.
- **Acceptance:**
  - [ ] Unit tests: `hasEnoughDiskSpace` at the exact margin edge; `estimateExportBytes` with zero photos and photos without size; `formatGigabytes` for 0, 0.04 GB, 0.8 GB, 120.4 GB
  - [ ] The cause-to-group map is total (typecheck fails if a cause is missing)
  - [ ] No `any`; both jest configs pass
- **Out of scope:** native code (s5b, s5e), UI (s5i, s5j, s5l).
- **Gate:** S

### s5b. Native getFreeDiskSpace (macOS and Windows) [W2, parallel: s5c, s5d]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s5a
- **Parallel:** yes, with s5c, s5d
- **Shared-touch:** `macos/GumpDesktop-macOS/GumpLocalStorage.mm`, `windows/GumpDesktop/GumpLocalStorage.h`, `windows/GumpDesktop/GumpLocalStorage.cpp` (3d may touch `applyLook`; confirm with the 3d plan)
- **Scope:** `getFreeDiskSpace(path)` resolves `{availableBytes}` for the volume holding `path` or its nearest existing parent. macOS: `NSURLVolumeAvailableCapacityForImportantUsageKey`, fallback `NSURLVolumeAvailableCapacityKey`. Windows: `GetDiskFreeSpaceExW` (bytes available to caller). Off the JS thread like the other export methods.
- **Rules:** absolute path required; reject with a clear message when empty or no parent exists. Writes nothing.
- **Mirror:** `ensureExportStagingDirectory` / `EnsureExportStagingDirectory` in the same files.
- **Acceptance:**
  - [ ] macOS and Windows builds pass
  - [ ] Manual: value roughly matches Finder / Explorer for the Downloads volume and an external drive
  - [ ] A path that does not exist yet resolves through its parent
  - [ ] No full path in native logs
- **Out of scope:** error codes on other methods (s5e).
- **Gate:** S

### s5c. Fake native disk, export, upload error and cloud storage fixtures [W2, parallel: s5b, s5d]

- **Risk:** normal
- **Role:** fixture-mock-engineer
- **Depends on:** s5a
- **Parallel:** yes, with s5b, s5d
- **Scope:** in `__tests__/helpers`:
  - Fake `GumpLocalStorage` export surface: plenty, low staging space, low destination space, `getFreeDiskSpace` throws, `createZipFromEntries` rejects `E_DISK_FULL` / `E_SOURCE_MISSING` (count 2), `copyFile` rejects `E_NOT_WRITABLE`, `applyLook` rejects `E_DISK_FULL`, picker cancelled.
  - `APIException` builders for `USER_STORAGE_GB_LIMIT`, `USER_DATA_USAGE_LIMIT` (400), 404, 408, 429, 500; `MultipartUploadError` without status; timeout error.
  - Current-user fixtures with `storage`: normal (120.4/300), near limit (299.1/300), exceeded (4.8/5), unlimited (`gbLimit: null`), refetch fails.
- **Mirror:** `__tests__/helpers/fixtures.ts`, `__tests__/helpers/inMemoryRepos.ts`.
- **Acceptance:**
  - [ ] Each scenario is selectable per test
  - [ ] Synthetic identities only
  - [ ] Works in both jest configs
- **Out of scope:** real native code.
- **Gate:** none

### s5d. Server upload failure groups and retry of retryable photos only [W2, parallel: s5b, s5c]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s5a
- **Parallel:** yes, with s5b, s5c
- **Shared-touch:** `src/lib/culledAlbum/store.ts`, `src/lib/culledAlbum/serverUpload.ts` (listed shared with 3d)
- **Scope:**
  - In `formatUploadError.ts`: `classifyUploadError(err): UploadFailureCause` using `APIException.name` for the two quota codes, status class otherwise (5xx `server`, 408 `timeout`, 429 `rateLimited`, other 4xx `rejected`), `MultipartUploadError` without status and fetch `TypeError` = `network`, the queue timeout = `timeout`, missing photo or unreadable source = `sourceMissing`. Message strings stay as today.
  - The cause is stored with the failed photo next to `serverUploadError` (field name decided in the slice; persisted like `serverUploadError`).
  - Store action `retryFailedServerUploads(albumId, {includeQuota})`: takes photos of the last batch whose cause group is `retryable` (plus `quota` when `includeQuota`), calls `startServerUploadBatch(albumId, ids)`. Uploaded, pending and `final` photos are untouched.
  - Each retry is reported with album id, photo ids and causes.
  - Exposed through `culledAlbumProvider` so screens do not call the store.
- **Rules:** retry groups decision. The existing one-shot 5xx auto-retry stays. Queue ends in `completed` or `failed`, never `active`, after the last photo settles.
- **Mirror:** `startServerUploadBatch` in `store.ts`; upload wiring in `culledAlbumProvider.tsx`.
- **Acceptance:**
  - [ ] Each error type maps to its cause and group (unit test per branch)
  - [ ] Retry re-queues only `retryable` photos, and `quota` photos only with `includeQuota` (test)
  - [ ] `final` photos never re-queue (test)
  - [ ] Queue `failedCount` and `completionSeen` reset for the retry batch (test)
  - [ ] Every failure and retry is reported once, without full file paths
- **Out of scope:** modal UI (s5l), toast (s5k), cloud pre-check (s5g).
- **Gate:** S

### s5e. Native error codes for export and look bake failures [W3, parallel: s5f, s5g]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s5b
- **Parallel:** yes, with s5f, s5g
- **Shared-touch:** `GumpLocalStorage.mm`, `GumpLocalStorage.cpp` (3d may touch `applyLook`; confirm with the 3d plan)
- **Scope:** `createZipFromEntries`, `copyFile` and `applyLook` reject with the s5a codes on both platforms: out of space (`ENOSPC` / `ERROR_DISK_FULL`, `ERROR_HANDLE_DISK_FULL`) = `E_DISK_FULL`; permission or read-only (`EACCES`, `EPERM`, `EROFS` / `ERROR_ACCESS_DENIED`, `ERROR_WRITE_PROTECT`) = `E_NOT_WRITABLE`; missing source entry = `E_SOURCE_MISSING` with `missingCount` in user info (`NSError.userInfo` / `ReactError.UserInfo`). Partial ZIP, partial copy or partial bake file is removed on failure.
- **Mirror:** current reject paths in the same methods (`removeItemAtPath` before `ZipStore::CreateZip` on macOS).
- **Acceptance:**
  - [ ] macOS and Windows builds pass
  - [ ] Manual: small disk image / volume gives `E_DISK_FULL`; read-only folder gives `E_NOT_WRITABLE`; 2 deleted sources give `E_SOURCE_MISSING` with count 2
  - [ ] No partial file left after each failure (manual)
- **Out of scope:** JS mapping (s5f, s5h).
- **Gate:** S

### s5f. Export disk preflight and typed export failures [W3, parallel: s5e, s5g]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s5a, s5c
- **Parallel:** yes, with s5e, s5g
- **Shared-touch:** `src/lib/export/prepareExport.ts` (listed shared with 3d)
- **Scope:**
  - `prepareSelectedPhotosExport`: before any bake or zip work, `getFreeDiskSpace(staging)` vs `estimateExportBytes + margin`; short = throw `ExportError('diskFull', requiredBytes)`.
  - `downloadPreparedExport`: before copying, `getFreeDiskSpace(destination)` vs ZIP `byteSize + margin`; short = `diskFull`.
  - One function maps native codes to `ExportError` reasons; anything else = `unknown` with the cause kept.
  - `getFreeDiskSpace` failure: report and continue.
  - Photos without size: reported once per export with the count.
- **Rules:** decisions above. A staged ZIP stays usable after a download failure.
- **Mirror:** existing `prepareExport.ts` flow.
- **Acceptance:**
  - [ ] Low staging space throws `diskFull` before any bake or zip call (test with s5c fake)
  - [ ] Low destination space throws `diskFull` with `requiredBytes` = ZIP size + margin (test)
  - [ ] `E_NOT_WRITABLE`, `E_SOURCE_MISSING` (count kept) and unknown errors map correctly (tests)
  - [ ] `getFreeDiskSpace` throwing does not stop the export and is reported (test)
- **Out of scope:** modal copy and buttons (s5i).
- **Gate:** S

### s5g. Cloud storage preflight hook [W3, parallel: s5e, s5f]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s5a, s5c
- **Parallel:** yes, with s5e, s5f
- **Scope:** `src/hooks/useCloudStoragePreflight.ts`: on mount and on `retry()`, refetch the current-user query; also refetch when the app becomes active again (`AppState`) while the modal is open. Derive `CloudStoragePreflight` from `mapUserPlan(...).storageGb` (GB to bytes with 1024^3) and the picked photos' bytes: `checking` while refetching, `unavailable` on error, `ok` when the limit is null, `exceeded` when used + upload > limit, `nearLimit` when the remainder < 5% of the limit, else `ok`. Expose the refetch through the auth context only if no hook exposes it today.
- **Rules:** decisions above; numbers derived, never stored. Backend values are rounded to 0.1 GB, so the client check is a hint; the server decides.
- **Mirror:** `src/hooks/usePlanMenu.ts`; current-user query in `src/context/auth.tsx`.
- **Acceptance:**
  - [ ] Each state is reached from the s5c user fixtures (hook tests)
  - [ ] Refetch error gives `unavailable`; `retry()` recovers
  - [ ] App becoming active triggers a refetch (test with mocked `AppState`)
  - [ ] No storage numbers copied into a Zustand store
- **Out of scope:** modal UI (s5j).
- **Gate:** S

### s5h. Disk check before the upload look bake [W3, parallel: s5k]

- **Risk:** normal
- **Role:** integration-engineer
- **Depends on:** s5a, s5c
- **Parallel:** yes, with s5k (W3 batch 2; batch 1 is full)
- **Shared-touch:** `src/lib/look/uploadLookBake.ts`, `src/lib/look/bakeLook.ts` (listed shared with 3d)
- **Scope:** before baking for upload, check the staging volume against the source bytes of photos that need a bake plus margin; short = bake session `failed` with reason `diskFull` and `requiredBytes`, no bake file written, upload not started. A native `E_DISK_FULL` from `applyLook` gives the same state. `getFreeDiskSpace` failure: report and continue.
- **Mirror:** `beginUploadLookBake` and its failure path in `uploadLookBake.ts`.
- **Acceptance:**
  - [ ] Low space fails the session before any `applyLook` call (test with s5c fake)
  - [ ] Upload queue does not start after a `diskFull` bake failure (test)
  - [ ] Session state exposes `reason` and `requiredBytes` for the UI
- **Out of scope:** UI (s5l).
- **Gate:** none

### s5k. Server upload toast counts failures [W3, parallel: s5h]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s5d
- **Parallel:** yes, with s5h (W3 batch 2)
- **Scope:** in `UploadToast.tsx`, the `serverUpload` completed label becomes "Uploaded {ok} out of {n} photos" when any photo failed; unchanged otherwise. No per-photo error UI.
- **Rules:** decision above (pattern of the import toast).
- **Mirror:** `completedLabel` for `mode === 'upload'` in `UploadToast.tsx`.
- **Acceptance:**
  - [ ] Label with and without failures (component test)
  - [ ] `UploadToast.tsx` grows only by the label branch
- **Out of scope:** modal states (s5l).
- **Gate:** none

### s5i. Export modal failure states per Figma [W4, sequential]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s5f
- **Parallel:** no, alone in its wave
- **Shared-touch:** `src/components/modals/ExportPhotosModal.tsx` (listed shared with 3d); copies `icon_error.svg` into `src/assets/images/`
- **Scope:** failure view per reason in a new file in `src/components/modals/`, wired into `ExportPhotosModal`; copy, layout and tokens from the spec "Export flow":
  - `diskFull`, `folderNotWritable`, `sourceMissing` frames (size with `formatGigabytes`, count from `missingCount`).
  - Picker cancelled: ready view with "Saving was cancelled. Your export is still ready." and the file card.
  - `unknown`: today's "Export failed" / "Download failed" copy.
  - Ready button label "Save to computer" (behavior unchanged).
- **Rules:** "Try again" re-runs only the failed step. `sourceMissing` "Try again" re-runs prepare.
- **Mirror:** current `step === 'failed'` block in `ExportPhotosModal.tsx`.
- **Acceptance:**
  - [ ] Each reason renders the Figma title, subtitle and buttons (component tests with s5c scenarios)
  - [ ] Focus moves to the primary button when the failure view appears; icon is decorative, buttons have labels (Gate A)
  - [ ] Picker cancel shows the save-cancelled view, not a failure
  - [ ] `ExportPhotosModal.tsx` grows only by wiring
- **Out of scope:** export options, trial state, presets.
- **Gate:** A

### s5j. Upload modal cloud storage states per Figma [W5, sequential]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s5g, s5i
- **Parallel:** no, alone in its wave
- **Shared-touch:** `src/components/modals/UploadSelectedModal.tsx`, `src/screens/CulledAlbumDetailScreen.tsx` (listed shared with 3d); copies `icon_info_orange.svg`, `icon_info_red.svg`, `icon_check_circle_40.svg` into `src/assets/images/` unless an existing asset matches
- **Scope:** new parts in `src/components/modals/` wired into `UploadSelectedModal`; copy, layout and tokens from the spec "Upload flow":
  - Checking, unavailable ("Try again" calls `retry()`, "Cancel" closes), confirmation, near limit (orange banner), not enough (red card and banner, "View cloud plans" calls `openUpgradePlan()`, "Choose fewer photos" closes the modal with picks kept), unlimited (decided layout).
  - Upload complete: check-circle icon, "Upload complete", "{n} photos uploaded", "Storage used" card from a fresh refetch, "Back to album".
  - "Upload now" is not shown in `exceeded`, `checking` or `unavailable`.
- **Mirror:** current phases in `UploadSelectedModal.tsx`; 3b sidebar components for token use.
- **Acceptance:**
  - [ ] Every preflight state renders the spec copy and buttons (component tests with s5c fixtures)
  - [ ] "View cloud plans" opens the upgrade URL and the state refreshes when the app is active again
  - [ ] Progress bar exposes its value to screen readers; focus and labels per Gate A
  - [ ] `UploadSelectedModal.tsx` and `CulledAlbumDetailScreen.tsx` grow only by wiring
- **Out of scope:** failure states (s5l), plan purchase flow.
- **Gate:** A

### s5l. Upload modal failure states [W6, sequential]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s5d, s5h, s5j
- **Parallel:** no, alone in its wave
- **Shared-touch:** `src/components/modals/UploadSelectedModal.tsx`, `src/screens/CulledAlbumDetailScreen.tsx` (listed shared with 3d)
- **Scope:** new parts in `src/components/modals/`:
  - Partial failure (and all failed with 0): "{ok} of {n} photos uploaded" / "{f} photos failed. Retry uploads only these {f}." / "Retry {f} photos" (calls `retryFailedServerUploads`), "Back to album"; {f} counts `retryable` photos only.
  - Final photos: extra subtitle "{k} photos can't be uploaded."; retry button hidden when {f} = 0.
  - Quota photos: the "Not enough cloud storage" view from s5j; when a fresh check says the retry fits, back to partial failure with quota photos included in "Retry".
  - Bake disk full: "Not enough space on this computer" / "This upload needs {x} GB of free space to apply looks. Free up space and try again." / "Try again" (re-runs the bake), "Cancel".
- **Rules:** retry groups decision; copy from the spec "Decided" table.
- **Mirror:** s5j parts; s5i failure view.
- **Acceptance:**
  - [ ] Partial, all-failed, final-only, quota and bake-disk-full states render the decided copy (component tests)
  - [ ] "Retry {f} photos" re-queues only retryable photos (integration test with s5d)
  - [ ] Quota photos are offered for retry only after a fresh check fits (test)
  - [ ] Focus and labels per Gate A
- **Out of scope:** per-photo error UI.
- **Gate:** A, R

## Do not start

- "Export options - Trial ended", computers, subscription, checkout, device limit, offline handling: out of scope (user).
- Per-photo upload error UI on cards: no design; the cause is stored and reported only.
- Reconnecting missing source files: no feature or design for the action.
- Server-side upload dedupe: backend work outside this repo.
