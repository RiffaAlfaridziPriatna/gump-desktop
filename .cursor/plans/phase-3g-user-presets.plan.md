---
name: phase-3g-user-presets
overview: One user preset per album, imported from the Edit Photos picker as a Lightroom/Camera Raw .xmp preset or a .cube LUT. No library renders Lightroom presets, so GUMP gets its own approximate engine - a TypeScript parser reads the crs develop settings, a TypeScript engine evaluates the per-pixel settings into a canonical .cube, and the spatial settings (clarity, texture, dehaze, vignette, grain) go to the existing native finishing as parameters. A .cube upload skips the engine. Native bakes from an absolute LUT path plus finishing parameters on macOS and Windows. A new upload replaces the old preset. Two inline error states. A spike runs first and decides whether the rest ships.
approved: true
todos:
  - id: s9a
    content: Spike - XMP engine prototype vs Lightroom renders, .cube samples, root cause of manual adjustment
    status: pending
  - id: s9b
    content: Domain - LookId 'custom', CulledAlbum.customLook, LookFinishing value object
    status: completed
  - id: s9c
    content: .cube and .xmp parsers and validators with tests
    status: completed
  - id: s9d
    content: Develop-to-LUT engine (per-pixel crs settings to canonical .cube) with tests
    status: completed
  - id: s9e
    content: Native finishing takes parameters instead of hardcoded look ids; built-ins unchanged
    status: completed
  - id: s9f
    content: Native - preset file picker, LUT file write, bake from absolute LUT path
    status: completed
  - id: s9g
    content: Import flow - pick, read, parse, convert, write, replace album preset, typed errors and logging
    status: completed
  - id: s9h
    content: Bake path - custom LUT path, finishing and revision in bake, preview and detail cache keys
    status: completed
  - id: s9i
    content: Picker UI - Upload preset tile, custom tile, error banner (presentational)
    status: completed
  - id: s9j
    content: Wire import into ApplyLookModal, scope modal and look status labels
    status: pending
isProject: false
---

# Phase 3g: User presets (.xmp and .cube import)

Source: user brief 2026-11-15 (Phase 3 item 5), user decisions below, research notes below, Figma file `W6N2UvJAw3J8NTuT60MlmB` section "Edit Photos" `12975:55848` (frames `12975:56273`, `12975:59170`, `12975:56784`, `12975:57299`), `.cursor/plans/phase-3d-presets.plan.md`, `.cursor/rules/project-map.mdc`.

Ids use `s9*`. Phase 3a `s3*`, 3b `s4*`, 3c `s5*`, 3d `s6*`, 3e `s7*`, 3f `s8*`.

Branch: base from `feat/phase-3`.

## How to run

- Set `approved: true` in the frontmatter after review.
- Next pending group: `/run-group-prompt phase-3g-user-presets` (or `/run-group-prompt` alone to follow the roadmap).
- One slice by hand: `/slice-prompt <id>`, then commit.
- After the group: read the Gate R report, merge the branch or run `/fix-prompt`.

## Done

- Per-album default look (`CulledAlbum.defaultLookId`), `ApplyLookScopeModal` (All album photos / New photos only), `AlbumLookStatus`, bake-at-upload: phase 3d.
- Picker with Original + 3 catalog looks, catalog labels (not "Style N"), Before/After: phase 3d decision 2026-11-02, aligned in 3f s8j. Figma "Style 1/2/3" and the missing Original tile are not differences to fix.

## Decisions (user, 2026-11-15)

- Upload accepts `.xmp` (Lightroom/Camera Raw develop preset) and `.cube`.
- XMP output does not need to match Lightroom 100%; the built-in looks do not either.
- One custom preset per album. It shows only in that album. A new upload replaces the old one.
- Replacing the preset that is the album look: the new custom tile is selected; "Use this look" goes through the scope popup like any look change.
- Tile label = file name without extension (not the TITLE header or the preset's internal name).
- Row 1 holds five tiles: Original, Clean Natural, Warm Romantic, Film Mood, Upload preset. The custom tile sits in row 2 under Upload preset (Figma `12975:59170`). The user wants to consider a wider dialog later (see Open in s9i).
- Remove control: none. No Figma frame exists. Replace-on-upload and album delete are the only ways a preset goes away.

## Research (2026-11-15)

- No usable library renders Lightroom develop presets. Adobe DNG SDK (C++) renders DNG and camera profiles, not develop sliders. darktable `lightroom.c` maps a subset to darktable modules (GPL-3.0). RapidRAW maps nearly all fields to its own GPU pipeline (AGPL-3.0, Rust/WGSL) and documents the result as a starting point that needs small changes. Both licences rule out reuse in GUMP; no code is copied from them.
- XMP-to-LUT tools either make Lightroom render an identity image (needs Lightroom) or use their own renderer (approximate). A LUT carries only per-pixel color and tone; clarity, texture, dehaze, vignette, grain, sharpening, noise reduction, masks and lens corrections cannot live in it.
- Adobe does not publish PV2012 formulas. Highlights, Shadows, Whites, Blacks are adaptive per image in Lightroom; GUMP approximates them as global curves.
- Aftershoot Instant AI Profiles take an `.xmp` and write Lightroom develop settings (adjusted per photo for exposure, temperature, tint) that Lightroom renders. They do not bake pixels, so their route does not fit GUMP's bake-and-upload flow.

## Findings in this repo (read-only, 2026-11-15)

- JS sends only `lookId` to native `applyLook`; `lutName` in `lookCatalog.ts` is never sent.
- macOS `lookCubePathForId` (`GumpLocalStorage.mm:3474`) resolves `<lookId>.cube` from the bundle `Looks/` only. Windows `ResolveLookCubePath` (`GumpLocalStorage.cpp:2439`) searches `Assets\Looks` and similar under the exe. Neither accepts an absolute path. Windows `LoadCubeLut` caches per path for the process lifetime.
- Both native parsers skip `#`, `TITLE`, `DOMAIN_*`, read `LUT_3D_SIZE`, have no size limit, fail on `LUT_1D_SIZE`, ignore DOMAIN values. The macOS parser reads a 3-token keyword line (for example `LUT_3D_INPUT_RANGE 0 1`) as a data row; Windows skips it (hypothesis H1).
- Invalid or missing LUT: macOS rejects `ELOOK`; Windows throws "missing" or "could not parse". No code tells unsupported from unreadable.
- Native finishing (texture, clarity, dehaze, vignette, grain, warm nudge) is hardcoded per look id (`.mm:3645`, `.cpp:2256`), implemented twice (CoreImage on macOS, BGRA CPU on Windows). The bundled LUTs are "Lightroom-trained" (`lookCatalog.ts` comment) and still need this finishing.
- Album folder: macOS `~/Library/Application Support/Gump/culling-albums/<albumId>`, Windows `%LOCALAPPDATA%\Gump\culling-albums\<albumId>`. Album delete removes it.
- Albums persist as `JSON.stringify(album.toPlain())` (`SQLiteAlbumRepository.ts:9`); a new optional field needs no SQL migration.
- No JS-to-native text write exists. The native picker allows image types only. No XML parser in `package.json`.

## Execution waves

| Group | Wave | Slices | Parallel? | Waits for | Merge order / shared-touch |
|-------|------|--------|-----------|-----------|----------------------------|
| Presets import | W1 | s9a | no | - | - |
| Presets import | W2 | s9b, s9c | yes | W1 verdict approved | s9b, then s9c |
| Presets import | W3 | s9d, s9e, s9i | yes | W2 merged | s9d, s9e, s9i |
| Presets import | W4 | s9f | no | W3 merged | - |
| Presets import | W5 | s9g, s9h | yes | W4 merged | s9g, then s9h |
| Presets import | W6 | s9j | no | W5 merged | - |

## Presets import group (brief item 5)

### s9a. Spike: XMP engine prototype and .cube samples [W1, sequential]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** -
- **Parallel:** no, its verdict sets the scope of every other slice
- **Scope:** throwaway branch `spike/preset-import`, never merged.
  1. Prototype `.xmp` parser and develop-to-LUT engine in TypeScript for the per-pixel fields of s9d. Generate a 33-point `.cube` per preset.
  2. Bake reference photos through the real native path: copy each generated or sample `.cube` into `macos/GumpDesktop-macOS/Looks/` and `windows/GumpDesktop/Looks/` under a spike name and call `NativeLocalStorage.applyLook` with that name from a dev-only harness (native does not check ids). Spatial fields: pass by hand-editing a spike copy of the finishing switch.
  3. Compare with Lightroom exports of the same photos and presets: ΔE2000 mean and p95 per photo, per platform, and macOS vs Windows. Comparison script lives outside the repo.
  4. Field census over the user's presets: which `crs:` fields are set, how many use a creative profile (`crs:Look`), masks, process version other than 2012+.
  5. `.cube` samples: header features, parse time, ΔE vs a reference renderer.
  6. Why the built-in LUTs needed extra work after the HALD route (user, 2026-11-16: Lightroom `.xmp` → export of a HALD image → presetsstore.com/generate-lut → `.cube`, then post-LUT finishing; Film Mood's HALD cube posterized and was replaced by a hand-made curve70+warm+pull20 cube, commits `525b902e`, `e8a4908d`, `a7ccdc84`). Test, do not assume: H4 spatial settings (clarity, texture, dehaze, vignette, grain) cannot live in a LUT, so finishing was needed (history supports this). H5 spatial settings left on during the HALD export bake noise into the LUT. H7 lossy 8-bit JPEG export of the HALD (DCT blocks mix neighbouring lattice cells) or export resize/output sharpening causes the posterization. H8 PV2012 Highlights/Shadows/Whites/Blacks adapt to image content, so a LUT rendered from the HALD differs from Lightroom on real photos. H9 color space mismatch (export space vs native `CIColorCubeWithColorSpace` sRGB). Also H1 macOS keyword line read as data, H2 DOMAIN ignored, H6 no per-photo exposure and white balance adaptation (Aftershoot adapts per photo).
  7. Reference LUTs: re-export the HALD for each built-in `.xmp` as 16-bit TIFF, sRGB, no resize, no output sharpening, spatial settings off; build the LUT locally (no upload). Compare engine LUT vs this reference LUT per lattice point (ΔE2000), which isolates engine error from H5, H7, H8.
- **Built-in presets found (2026-11-16):** `~/Library/Application Support/Adobe/CameraRaw/ImportedSettings/{Clear Natural,Warm Romantic,Film Mood}.xmp` (Camera Raw 18.5.1, `ProcessVersion` 15.4, `CameraProfile` "Default Color", `PointColors` empty, no masks, sharpening and noise reduction 0). Native finishing vs `.xmp`: Warm Romantic texture/clarity/dehaze/vignette/grain equal, plus hand-added warm nudge 0.045 and settle 0.035; Clean Natural equal; Film Mood differs (native texture -3, clarity 0, dehaze 0, vignette -30 frame-ellipse, grain 0 vs `.xmp` texture -5, clarity +4, dehaze +5, vignette -20, grain 25). These differences are the "manual adjustment" to explain.
- **Reference without Lightroom (user has no Lightroom installed, 2026-11-16):** bundled `cleanNatural.cube` and `warmRomantic.cube` are Lightroom HALD renders of these exact `.xmp` files (64-point, presetsstore). Primary metric: engine LUT vs bundled cube per lattice point (ΔE2000 mean, p95, worst hue region). Film Mood's bundled cube is hand-made, so it is a visual reference only. Second metric: full GUMP bake (engine LUT + `.xmp` finishing) vs the shipped look on photos in `~/Pictures/GUMP/Test Dupe/` (IMG_3689, IMG_3705, IMG_3760 carry these presets in the old Lightroom catalog). Lightroom exports become optional (trial or a colleague) for a final check.
- **Samples from the user:** the HALD image used; Lightroom exports of 3 reference photos (skin, sunset, neutral grey card) with each preset and without; 2 more real `.xmp` presets the target photographers use; any `.cube` users bring. The built-ins are the first benchmark: the shipped looks are the accepted target. Negatives made in the spike: `.lrtemplate`, profile `.xmp`, `.xmp` with masks only, 1D LUT, truncated file, binary renamed.
- **Pass/fail bar (ΔE numbers proposed, confirm):**
  - Pass: per preset ΔE2000 mean ≤ 5 vs Lightroom on both platforms, and the user approves at least 4 of 5 presets side by side as "close enough". macOS vs Windows mean ≤ 1.5. Engine builds a 33-point LUT in ≤ 300 ms in the app on both platforms. Then s9b to s9j ship.
  - Pass with gaps: some fields miss the bar. Those fields go to "Do not start" (ignored with a log), the rest ship.
  - Fail: most presets miss the bar, or most depend on creative profiles or masks. Stop. Report the cause; the user decides whether only `.cube` ships.
- **Acceptance:**
  - [ ] Report appended to this plan under "Spike result": numbers per preset, photo and platform; field census; H1 to H6 verdicts
  - [ ] Verdict (pass, pass with gaps, fail) and the field list that ships
  - [ ] Accepted `LUT_3D_SIZE` range confirmed on both platforms (CIColorCube limit on macOS)
  - [ ] Spike branch deleted, nothing merged
- **Out of scope:** product code, tests in `__tests__/`.
- **Gate:** none

### s9b. Domain: custom look and finishing value object [W2, parallel: s9c]

- **Risk:** high
- **Role:** system-architect
- **Depends on:** s9a
- **Parallel:** yes, with s9c
- **Scope:** `LOOK_IDS` gains `'custom'` (`src/domain/valueObjects/Look.ts`). New value object `LookFinishing` (`src/domain/valueObjects/LookFinishing.ts`): texture, clarity, dehaze, vignette amount/midpoint/feather/roundness, grain amount/size/roughness, each clamped to the Lightroom slider range. `CulledAlbum` gains `customLook: {name: string; revision: string; finishing: LookFinishing | null} | null` with getter, a replace method, `toPlain`/`fromPlain` (optional on read). `src/lib/look/types.ts` re-exports. `lookCatalog.ts`: label for `'custom'` comes from the album preset name; `LOOK_CATALOG` keeps built-ins only.
- **Rules:** old albums (no `customLook`) load unchanged. `defaultLookId: 'custom'` with `customLook: null` loads as `'original'`. A photo with `lookId: 'custom'` in an album without a preset bakes as original and reports via `reportError` (inferred, confirm). No file path in the domain: path derives from album id + revision.
- **Mirror:** `defaultLookId` handling in `CulledAlbum.ts:106` and `:218`.
- **Acceptance:**
  - [x] Old album plain JSON round-trips with `customLook === null`
  - [x] `'custom'` default without a preset loads as `'original'`
  - [x] Out-of-range finishing values clamp on read
  - [x] Existing look tests (`lookId`, `albumDefaultLook`, `setAlbumDefaultLook`) pass
- **Out of scope:** file IO, engine, UI.
- **Done (2026-11-16, W2):** `resolveLookId` in `Look.ts`; `parseCustomLook`/`requireCustomLook` in `LookFinishing.ts` (revision `/^[A-Za-z0-9_-]{1,64}$/`, name 1..255). Handoff: store/storage do not carry `customLook` yet (`src/lib/culledAlbum/types.ts:521`, `store.ts:610`, `storage.ts:23/:60`); `hasAppliedLook('custom')` is false and no `reportError` for a custom photo without a preset (s9h). Tests: `__tests__/albumCustomLook.test.ts`.
- **Gate:** R

### s9c. .cube and .xmp parsers [W2, parallel: s9b]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s9a
- **Parallel:** yes, with s9b
- **Scope:** pure TS, the only place a user file is validated.
  - `src/lib/look/cubeParser.ts`: `parseCube(text)` returns `{ok: true; size; canonicalText}` or `{ok: false; reason; detail}`. Canonical = `LUT_3D_SIZE n` plus `n³` rows, domain rescaled to 0..1.
  - `src/lib/look/xmpParser.ts`: `parseXmpPreset(text)` returns `{ok: true; settings: DevelopSettings; ignored: string[]}` or `{ok: false; reason; detail}`. Reads `crs:` fields as attributes or elements, including `rdf:Seq` tone curves. Limited hand parser, no new dependency.
  - `reason` is `'unsupported' | 'unreadable'`. Fixtures in `__tests__/fixtures/presets/`, tests `__tests__/cubeParser.test.ts`, `__tests__/xmpParser.test.ts`. Each file ≤300 lines.
- **Rules (inferred, confirm after s9a):**
  - unsupported: extension not `.xmp`/`.cube`; `.lrtemplate`; `.xmp` without the camera-raw-settings namespace; profile `.xmp` (has `crs:RGBTable` or `crs:LookTable` without develop sliders); `.xmp` with none of the shipped fields set; `LUT_1D_SIZE` or no `LUT_3D_SIZE`; LUT size outside the s9a range (proposed 2..65); bad DOMAIN.
  - unreadable: empty, not UTF-8, malformed XML, non-numeric value in a shipped field, LUT row count ≠ `n³`, NaN/Infinity, file over 16 MB.
  - Fields not shipped (masks, lens, sharpening, noise reduction, creative profile) go to `ignored`, not an error.
- **Mirror:** pure lib style of `src/lib/culledAlbum/photoMapper.ts`.
- **Acceptance:**
  - [x] Each rule has a passing test
  - [x] A LUT keyword line is never read as a data row (H1 regression)
  - [x] Attribute and element forms of the same field parse equal
  - [x] s9a sample presets kept as fixtures where the licence allows (inferred, confirm)
- **Out of scope:** reading files, the engine, native code.
- **Done (2026-11-16, W2):** spike rules applied (size 2..65, exact n³ rows, keyword lines never data). DOMAIN/`LUT_3D_INPUT_RANGE` treated as the input range (Adobe spec): a non-unit domain is resampled trilinearly to a lattice over input 0..1; output clamped to 0..1. Only top-level `rdf:Description` read; nested `crs:Look` goes to `ignored`. Extra files: `developSettings.ts` (exports `DevelopSettings`), `miniXml.ts`. 16 MB cap counts UTF-16 units; the reader (s9g) must cap bytes. Left: no range clamp on per-pixel develop fields (s9d must clamp). Tests: `cubeParser`, `xmpParser`, `xmpParserHardening`.
- **Gate:** S, R

### s9d. Develop-to-LUT engine [W3, parallel: s9e, s9i]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s9c
- **Parallel:** yes, with s9e, s9i
- **Scope:** `src/lib/look/developToLut.ts` (split per stage if over 300 lines, for example `developTone.ts`, `developColor.ts`): `buildLut(settings: DevelopSettings, size = 33): string` evaluates, per lattice point in sRGB: white balance shift (Temperature/Tint as incremental values for JPEG), Exposure2012, Contrast2012, Highlights/Shadows/Whites/Blacks2012 as global curves, ParametricCurve, ToneCurvePV2012 (master, red, green, blue), HSL 8 bands, Vibrance, Saturation, SplitToning and ColorGrade. Returns canonical `.cube` text. `splitFinishing(settings): LookFinishing | null` extracts the spatial fields.
- **Rules:** field list and order come from the s9a verdict. Formulas are GUMP approximations, documented per stage in one line. Default settings produce an identity LUT.
- **Mirror:** none (first engine); s9a prototype.
- **Open:** resolved by the s9a verdict ("Fields that ship").
- **Acceptance:**
  - [x] Default settings give an identity LUT (max error ≤ 1/1023)
  - [x] Each field moves the expected channel in the expected direction (one test per field)
  - [x] Output parses with `parseCube`
  - [x] 33-point build within the s9a time bar in Jest (Release Hermes and Windows not measured)
- **Out of scope:** spatial effects (s9e), file IO.
- **Gate:** R

### s9e. Native finishing by parameters [W3, parallel: s9d, s9i]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s9b
- **Parallel:** yes, with s9d, s9i
- **Scope:** `applyLook` gains an optional `finishing` object. macOS `applyLookFinishingToImage` (`GumpLocalStorage.mm:3625`) and Windows `ApplyLookFinishingBgra` (`GumpLocalStorage.cpp:2238`) read values from it instead of switching on `lookId`. The current values for the 3 built-ins move to `lookCatalog.ts` (one owner of look data) and JS sends them. `src/lib/storage/localStorage.ts` and `bakeLook.ts` pass them.
- **Rules:** built-in looks render byte-identical before and after on both platforms. Missing `finishing` = none. Look-specific extras without a Lightroom slider (warm nudge, settle nudge, frame-ellipse vignette) stay in the parameter object as GUMP fields.
- **Mirror:** current switch blocks at `.mm:3645` and `.cpp:2256`.
- **Acceptance:**
  - [ ] Built-ins byte-identical on macOS and Windows (golden JPEGs from before the change). macOS finishing stage byte-identical in a standalone old-vs-new driver (3 looks x 3 photos); full bake pipeline and Windows not verified
  - [ ] Finishing values from JS reach native and clamp to range. JS side tested; native clamp by code only, not run
  - [ ] Both platforms build; `npm test` and `npm run test:windows` pass
- **Out of scope:** LUT path, picker.
- **Gate:** R

### s9f. Native: picker, LUT write, bake from path [W4, sequential]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s9e
- **Parallel:** no, same native files as s9e
- **Shared-touch:** native module headers (`GumpLocalStorage.h`, `GumpFilePicker.h`)
- **Scope:** macOS (`GumpLocalStorage.mm`, `GumpFilePicker.mm`) and Windows (`GumpLocalStorage.cpp/.h`, `GumpFilePicker.cpp/.h`):
  1. `pickLookPresetFile()`: single file, filter `.xmp` and `.cube`, resolves `{uri, name, size}` or null on cancel.
  2. `writeAlbumLookFile(albumId, fileName, text)`: writes into `culling-albums/<albumId>/looks/`, returns the absolute path; rejects a `fileName` with separators or `..`.
  3. `applyLook` gains optional `lutPath`, which must sit inside `culling-albums`.
  4. Reject codes `ELOOK_LUT_MISSING`, `ELOOK_LUT_PARSE`.
  JS bridge: `src/lib/storage/localStorage.ts`, `src/lib/media/filePicker.ts`.
- **Rules:** each revision writes a new file name (`custom-<revision>.cube`), so the Windows path cache stays valid.
- **Mirror:** `pickImages` (`GumpFilePicker.mm:119`), absolute-path check near `GumpLocalStorage.mm:3438`, `ApplyLook` (`GumpLocalStorage.cpp:2774`).
- **Open (resolved, user 2026-11-16):** harden native too. Both parsers skip keyword lines, require exactly n³ rows, size 2..65, file ≤ 32 MB; a custom LUT that fails rejects `ELOOK_LUT_PARSE`.
- **Acceptance:**
  - [x] `lutPath` outside `culling-albums` rejects. macOS guard proven in a standalone driver on the extracted code (outside, symlink file and dir escape, `..`, relative, sibling prefix, root itself → reject; missing → `ELOOK_LUT_MISSING`). Windows by code only, not built
  - [x] `fileName` with `/`, `\` or `..` rejects (also `.`; Windows also `:`). macOS driver-proven; Windows by code only
  - [x] Picker cancel resolves null, no error. JS bridge tested; native by code only (macOS builds, picker not clicked)
  - [x] Built-ins still bake as before. macOS: old vs new parser yields byte-identical cube data for all 3 built-ins (driver), `lutPath` null keeps the bundled path, Debug app builds. No in-app bake vs golden JPEGs; Windows not built
- **Out of scope:** parsing (s9c), engine (s9d), JS flow (s9g).
- **Gate:** S, R

### s9g. Import flow [W5, parallel: s9h]

- **Risk:** high
- **Role:** integration-engineer
- **Depends on:** s9b, s9c, s9d, s9f
- **Parallel:** yes, with s9h
- **Shared-touch:** `src/lib/culledAlbum/store.ts` (1458 lines, add one action, no split)
- **Scope:** `src/lib/look/importAlbumPreset.ts`: pick → read text (`fetch(file://)`) → `.xmp`: `parseXmpPreset` → `buildLut` + `splitFinishing`; `.cube`: `parseCube` → `writeAlbumLookFile` → store action replaces `album.customLook` → delete the old revision file. Hook `src/hooks/useImportAlbumPreset.ts` returns `{importPreset, status, error: 'unsupported' | 'unreadable' | null}`.
- **Rules:** any failure keeps the previous preset and look ("Your album look hasn't changed"). Each failure goes to `reportError` with reason, extension and size; no file content or full path. Ignored `.xmp` fields are logged once per import. Native read or write failure maps to `unreadable`. Cancel is not an error.
- **Mirror:** `useAlbumLookFlow.ts`, `setAlbumDefaultLook` store action.
- **Open (resolved, user 2026-11-16):** re-bake with the new preset. One preset file per album; every `'custom'` photo bakes with the latest preset, the old revision file is deleted after a replace. (Keeping old revisions was considered and dropped: per-photo revision pin, ~10 files.)
- **Acceptance:**
  - [x] Valid `.xmp` and `.cube` set `customLook` with the file-name label and a new revision (Jest, mocked native; no real-file import in the app)
  - [x] Unsupported and unreadable keep the old preset and return the matching error
  - [x] Old revision file deleted after a successful replace (via `deleteLocalPhotoFile`; Jest only)
  - [x] Every failure logged once, no swallowed error (a persist failure is logged by `persistAlbum`; `reportError` dedupes the same object)
- **Out of scope:** UI, cache keys.
- **Done (2026-11-16, W5):** commit 722e37a. Store album carries `customLook` (`types.ts` normalize, `storage.ts` both directions); store action `setAlbumCustomLook` rolls back on persist failure and returns the previous preset. `src/lib/look/customLookFile.ts` holds the file name, revision and path helpers. Logs carry albumId, extension, size, step, reason; no parser detail (it can quote file content), no path. Ignored `.xmp` fields go to PostHog `look_preset_fields_ignored` once per import. Hook keeps `error` until the next non-cancelled import; a concurrent call resolves `cancelled`. The import does not change `defaultLookId`; selecting the custom tile after the first upload is s9j. Tests: `importAlbumPreset`, `setAlbumCustomLook`, `useImportAlbumPreset`.
- **Gate:** R

### s9h. Bake path for the custom look [W5, parallel: s9g]

- **Risk:** normal
- **Role:** integration-engineer
- **Depends on:** s9b, s9e, s9f
- **Parallel:** yes, with s9g
- **Scope:** `bakeLook.ts`, `uploadLookBake.ts`: for `'custom'` pass `lutPath` (album id + revision) and `customLook.finishing`. Cache keys and bake file names (`previewCacheKey`, `lookDetailCacheKey`, `resolveBakeDestinationPath`) include the revision for `'custom'`.
- **Mirror:** `lookDetailCacheKey` and `isLookDetailCurrent` in `bakeLook.ts`.
- **Acceptance:**
  - [x] Built-in look keys unchanged (existing tests pass, plus an explicit key and file-name test)
  - [x] Custom keys change when the revision changes
  - [x] Missing preset for a `'custom'` photo bakes as original and reports
- **Out of scope:** import, UI.
- **Done (2026-11-16, W5):** commit a5bba14. `bakePhotoLook`, `bakeLooksForPhotos`, `ensureLookDetail`, `getCachedLookPreviewUri`, `bakeLookPreviewUri` take an optional `CustomLookSource` (`{albumId, customLook}`); `uploadLookBake` passes it from the store. Key part for custom is `custom-<revision>`; built-ins keep the bare id. `.cube` path derives from the photo/thumb path (`culling-albums/<albumId>/looks/custom-<revision>.cube`, shortcut: JS has no root API). Finishing via `toNativeFinishing` (frame ellipse). Preview bake moved to `bakeLookPreview.ts` (bakeLook.ts would pass 300 lines). `photoNeedsLookBake` is now true for `'custom'`. Handoff to s9j: export (`prepareExport.ts`) and the detail screen / picker preview do not pass `CustomLookSource` yet, so a custom photo exports as original with a report; `hasAppliedLook('custom')` stays false for the UI. Not verified: in-app bake of a real preset (app not run), Windows.
- **Gate:** R

### s9i. Picker UI: Upload preset, custom tile, error banner [W3, parallel: s9d, s9e]

- **Risk:** normal
- **Role:** ui-frontend-developer (Build)
- **Depends on:** s9b
- **Parallel:** yes, with s9d, s9e
- **Scope:** read Figma `12975:56273`, `12975:59170`, `12975:56784`, `12975:57299` with `get_design_context` first. New `src/components/look/UploadPresetTile.tsx` and `src/components/look/LookImportErrorBanner.tsx`. `LookPickerBody.tsx` (241 lines) takes `customLook`, `onUploadPreset`, `importError`; tile list moves to a new `LookPickerTiles.tsx` if the body would pass 300 lines. Arrow-key order: Original, 3 looks, custom (Upload preset is a button, not a radio).
- **Rules:** messages verbatim: "Unsupported file format. Your album look hasn't changed." and "This file can't be read. Your album look hasn't changed." Banner under the note text, above "Use this look". Row 1 five tiles; custom tile in row 2 under Upload preset.
- **Mirror:** `LookPickerTile.tsx`, 3f s8j spacing.
- **Open:** resolved (user, 2026-11-16): widen the dialog so tiles keep the Figma width (842 px dialog, 602 px content). A first upload selects the new custom tile, like a replace.
- **Acceptance:**
  - [ ] Matches the four frames at 1440×900 except the agreed five-tile row. Measured values match Figma; no rendered visual diff yet
  - [x] Banner announced to screen readers
  - [x] Upload preset reachable by keyboard with an accessibility label
  - [x] Every new or touched file ≤300 lines
- **Out of scope:** import logic, modal wiring.
- **Gate:** A, R

### s9j. Wire import into the look flow [W6, sequential]

- **Risk:** normal
- **Role:** ui-frontend-developer (Adapt)
- **Depends on:** s9g, s9h, s9i
- **Parallel:** no, last slice
- **Scope:** `ApplyLookModal.tsx` (243 lines) uses `useImportAlbumPreset`; on success the custom tile is selected. Figma `12975:59170` shows it unselected after a first upload; the user decision covers only replacing the active preset (inferred for first upload, confirm). Error clears on the next tile select or upload. `ApplyLookScopeModal`, `AlbumLookStatus` and `useAlbumLookFlow` show the custom name.
- **Mirror:** current `onUseLook` path in `useAlbumLookFlow.ts`.
- **Acceptance:**
  - [ ] Upload `.xmp` and `.cube`, select, "Use this look", scope popup works end to end on macOS and Windows
  - [ ] Error state leaves the selected tile and album look unchanged
  - [ ] Status line and scope text use the preset name
  - [ ] typecheck, lint, test, test:windows pass
- **Out of scope:** remove control.
- **Gate:** A, R (group)

## Spike result (s9a, 2026-11-16)

**Verdict: pass with gaps** (user, 2026-11-16). Bar confirmed by the user: ΔE2000 mean ≤ 5 must also hold leave-one-out, plus visual approval. The visual check passed for all 3 built-ins. Leave-one-out and the 300 ms timing target failed, so `.xmp` ships as an approximate look with the gaps below; `.cube` ships in full.

Branch `spike/preset-import` (worktree `modest-shamir-edad60`): never merged, never pushed. Scripts and outputs are in the session scratchpad, outside the repo. The side-by-sides are in the side-session notes folder `s9a-sbs/`.

**Engine.** TypeScript: a regex `.xmp` reader (attribute and element forms, rejects files without the `crs` namespace, flags masks), then sRGB → linear WB/exposure → sRGB-gamma tone (contrast S-curve, Highlights/Shadows/Whites/Blacks as global zone curves, parametric bumps, Fritsch-Carlson point curve master + R/G/B) → HSL 8-band hue/sat/lum → saturation, vibrance → split toning and midtone grade → canonical `.cube` (R fastest). It has 15 strength constants, fitted jointly to `cleanNatural.cube` and `warmRomantic.cube` (coordinate descent on a 16³ subsample). Per-channel tone beat tone-on-luma.

**Primary metric: engine LUT vs bundled cube, per lattice point (64³), ΔE2000.**

| Preset | identity | engine, uncalibrated | engine, joint fit | leave-one-out (fit on the other preset) |
|---|---|---|---|---|
| Clear Natural | mean 4.93 / p95 8.19 | 4.75 / 7.73 | **2.58 / 5.58**, worst yellow 3.33, green 3.24, orange 2.83 | **4.89** / 9.64 (≈ identity) |
| Warm Romantic | 7.81 / 11.26 | 7.28 / 12.14 | **3.80 / 8.56**, worst green 6.01, aqua 5.29, yellow 3.61 | **12.41** / 18.93 |

The leave-one-out fails: with 2 references the constants overfit and do not generalise. Film Mood's cube is hand-made, so it was compared visually only.

**Second metric: real native bake, macOS Debug build, `applyLook` from a dev harness, 2048 px, q 0.92, ΔE2000 photo mean / p95 vs the shipped look.**

| Photo | CN spike64 | CN spike33 | WR spike64 | WR spike33 | FM spike64 (fit) | FM spike64 (uncalibrated) | original vs shipped CN / WR / FM |
|---|---|---|---|---|---|---|---|
| IMG_3689 | 1.95 / 3.55 | 1.93 | 3.69 / 6.50 | 3.65 | 5.80 / 11.44 | 4.00 / 6.99 | 3.21 / 6.27 / 14.19 |
| IMG_3705 | 2.34 / 3.71 | 2.32 | 5.59 / 7.77 | 5.55 | 6.43 / 12.22 | 4.21 / 7.90 | 3.61 / 8.75 / 12.34 |
| IMG_3760 | 2.13 / 3.79 | 2.13 | 4.07 / 6.74 | 4.05 | 6.94 / 12.11 | 4.19 / 7.02 | 3.49 / 7.00 / 14.49 |

- Spike finishing used the `.xmp` spatial values (no warm nudge or settle), which explains part of the WR gap.
- A 33-point cube vs a 64-point cube differs by ΔE 0.55–0.57 mean, so 33 is enough.
- User visual verdict: "cukup" for all 3.

**Timing.**

| Where | parse | engine 33 | engine 64 | `.cube` text 33 / 64 |
|---|---|---|---|---|
| Node 24 | <1 ms | 28–37 ms | 189–195 ms | 10 / 80 ms |
| App, macOS Debug Hermes | 0–2 ms | **≈600 ms** | ≈4.2 s | 28 / 215 ms |

- The ≤300 ms target fails in Debug. Release Hermes was not measured.
- Native bake time is dominated by the `NSNumber` cube parser: ≈0.2–1.3 s for a 33-point cube, ≈4 s for 64, ≈32 s for 128.
- Windows: not run (no Windows machine in this session). The macOS vs Windows ΔE was not measured.

**`LUT_3D_SIZE` on macOS.**
- 2, 33, 64 and 65 apply. Identity ΔE is 0.00 for size 2 and 0.09–0.15 for 33 and 65.
- 128 returns "ok" but the output is bit-identical to the original: CIColorCube silently ignores it.
- Accept 2–65 and reject anything larger at import. Windows range not checked.

**Hypotheses.**
- H1 confirmed. On macOS, `LUT_3D_INPUT_RANGE 0.0 1.0` becomes a data row `(0,0,1)`, and the `values.count < expected` check accepts the surplus rows. The lattice shifts by one row without an error. Identity-cube bake vs original: ΔE mean 3.2–5.1, p95 up to 18.1.
- H2 confirmed. `DOMAIN_MAX 2 2 2` is ignored. A half-scale cube applies as-is: ΔE 17–24.
- H4 supported, by construction. Texture, clarity, dehaze, vignette and grain are not in the LUT. They need native finishing by parameters (s9e).
- H5 not testable without Lightroom.
- H6 not tested (needs per-photo Lightroom renders).
- H7 supported. 100% of the values in `cleanNatural.cube` and `warmRomantic.cube` are exact multiples of 1/255, with 256 distinct values: the HALD went through 8-bit. Film Mood's cube is 2.6% quantized. Posterization from an 8-bit HALD is plausible. JPEG DCT mixing was not isolated.
- H8 supported. The neutral axis of `warmRomantic.cube` is non-monotonic: 202 → (236,218,203), but 227 → (233,220,209). No global curve produces that. This is content-adaptive PV2012 behaviour on the HALD image (or H5 noise), and it puts a floor under the engine-vs-reference ΔE.
- H9 inconclusive. The fitted global chroma factor is ≈1.09 (no systematic desaturation), so a colour-space mismatch is not evident. Not isolated.

**Field census.** Only the 3 built-ins were available; the user presets and Lightroom exports listed under "Samples" were not provided.
- All 3: `ProcessVersion` 15.4, `CameraProfile` "Default Color", `PointColors` empty, no masks, sharpening and noise reduction 0.
- Fields set: WB increments, Contrast/Highlights/Shadows/Whites/Blacks, Texture/Clarity/Dehaze, Vibrance/Saturation, HSL 8×3, split toning (+ balance), midtone grade, master point curve, grain, post-crop vignette.
- Never set (all zero): Exposure, Parametric*, R/G/B curves, ColorGradeGlobal*, ColorGrade lum, calibration (`RedHue`… `ShadowTint`).

**Fields that ship (s9d per-pixel, s9e spatial):**
- Per pixel: IncrementalTemperature, IncrementalTint, Exposure2012, Contrast2012, Highlights2012, Shadows2012, Whites2012, Blacks2012, Vibrance, Saturation, HSL Hue/Saturation/Luminance × 8, SplitToning* (+ Balance), ColorGradeMidtoneHue/Sat, ToneCurvePV2012 (+ Red/Green/Blue, exact spline math), ConvertToGrayscale.
- Spatial: Texture, Clarity2012, Dehaze, PostCropVignette Amount/Midpoint/Feather, GrainAmount/Size/Frequency.

**Gaps (the conditions of "pass with gaps"):**
- `.xmp` output is labelled approximate. The fitted constants are the starting point. Re-fit once 2+ real user presets with Lightroom exports exist, and re-run the leave-one-out before calling `.xmp` accurate.
- s9d must reach ≤300 ms for 33 points in a Release build: typed arrays, no per-pixel tuple allocation, and no HSL round-trip where avoidable. Measure on both platforms.
- s9c: macOS parser fixes are required. Skip or apply `LUT_3D_INPUT_RANGE`, honour or reject DOMAIN ≠ 0..1, reject surplus rows, and cap size at 65. Mirror the same rules on Windows. Prefer 33-point output from the engine.
- Fields moved to "Do not start": ignored with a log, because untested.

**Cleanup.**
- Done: the symlink `~/Library/Application Support/Gump/spike-preset` (needed because the Debug build is not sandboxed) was removed; the app and Metro were stopped.
- Left: container folder `~/Library/Containers/com.gump.cullyourphotos/Data/Library/Application Support/Gump/spike-preset` holds the test cubes, photo copies and bakes. Delete it with the branch.

## Do not start

- `.xmp` fields never set in any available preset, so untested (ignored with a log): Parametric* tone curve, ColorGradeGlobal*, ColorGrade Shadow/Midtone/Highlight Lum, camera calibration (`RedHue`, `RedSaturation`, `GreenHue`, `GreenSaturation`, `BlueHue`, `BlueSaturation`, `ShadowTint`), `PointColors`. Revisit with real user presets (s9a gap).
- Remove preset control: no Figma frame (user decision 2026-11-15).
- More than one custom preset per album, or a shared preset library.
- `.lrtemplate`, profile `.xmp` (creative profiles, `crs:RGBTable`), masks, lens corrections, sharpening, noise reduction.
- Per-photo exposure and white balance adaptation (Aftershoot-style); revisit after s9a H6.
- Rebuilding the 3 built-in looks as `.xmp` through the engine: separate refactor, needs the user's go.
