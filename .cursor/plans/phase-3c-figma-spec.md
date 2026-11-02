# Phase 3c Figma spec (read 2026-11-02)

Source: Figma file `W6N2UvJAw3J8NTuT60MlmB`, section "Upload & Export" `12975:61722`. Read with one `get_metadata` on the section (frame list and layer text) and `get_design_context` on the popup body of 11 frames (screenshots excluded). Slices read this file instead of calling Figma. Only values that came back from Figma are listed; nothing is guessed. Rows marked "decided" are user decisions for states Figma does not draw; they are not Figma values.

Frames for trial, computers and "Export options - Trial ended" are out of scope (subscription).

## Assets

Downloaded 2026-11-02 (Figma URLs expire 2026-11-09) to the session scratchpad:
`/private/tmp/claude-501/-Users-riffaap-App-Project-Pure-Typescript-gump-repositories-native/289eec8a-b9bd-4848-bc76-2b8040d447f6/scratchpad/figma-assets/`

| File | Figma asset | Use |
|---|---|---|
| `icon_error.svg` | `9a5e6.svg`, 40x40 | failure popups |
| `icon_check_circle_40.svg` | `47dd5.svg`, 40x40 | Upload complete |
| `icon_info_orange.svg` | `439c1.svg`, 16 | near-limit banner |
| `icon_info_red.svg` | `70fa7.svg`, 16 | not-enough banner |

The scratchpad is under `/private/tmp` and is cleared on reboot. The first UI slice copies the files it needs into `src/assets/images/` (check `icon_info.svg` and `icon_check_circle.svg` there first). If the files are gone, one Figma call per missing asset node is allowed.

## Shared popup layout

All frames are 1440x900 with the album screen behind a popup.

| Part | Value |
|---|---|
| Popup container | node "Popup", 720 wide, 456 tall (495 for Not enough cloud storage, 520 for Export options) |
| Body ("Pop up share album") | 480 wide, column, gap 24, centered |
| Status icon | 40x40 above the title (error or check-circle) |
| Title | DM Serif Display Regular 28, line height 1.2, `#131415` (`--black`), centered |
| Subtitle | Red Hat Display Regular 14, line height 1.44, `#737373`, centered; title block gap 12 |
| Button row | 456 wide, gap 12, two buttons flex 1 |
| Primary button | bg `#ff9632` (`--orange`), h 48, radius 24, padding X32 Y8, label Red Hat Display Bold 16 white |
| Secondary button | border 1px `#ff9632`, h 48, radius 24, padding X32 Y8, label Red Hat Display Bold 16 `#ff9632` |
| Text button | no border or bg, Red Hat Display Bold 16, line height 1.6, `#ff9632` |
| Single primary | centered container, button not stretched |

## Upload flow

| Frame | Node (body) | Title | Subtitle / body | Buttons |
|---|---|---|---|---|
| Upload - Checking storage | 12975:31466 | "Upload 99 photos to Gump Cloud" | "Checking cloud storage…" | none |
| Upload - Storage check unavailable | 12975:31955 | "Couldn't check cloud storage" (error icon) | "Check your connection and try again." | Primary "Try again", secondary "Cancel" |
| Upload confirmation | 12975:32454 | "Upload 99 photos to Gump Cloud" | storage card: "This upload" 0.6 GB, "Cloud storage used" 120.4 GB / 300 GB, "Storage after upload" 121.0 GB / 300 GB, bar fill 173 of 432 | single primary "Upload now" |
| Upload confirmation - Near storage limit | 12975:32962 | "Upload 99 photos to Gump Cloud" | storage card (299.1 GB / 300 GB, after 299.7 GB / 300 GB) plus orange banner "You'll have 0.3 GB of cloud storage left after this upload." | single primary "Upload now" |
| Not enough cloud storage | 12975:33474 | "Not enough cloud storage" (no icon) | "This upload needs 0.6 GB. You have 0.2 GB remaining." then red storage card (4.8 GB / 5 GB, after 5.4 GB / 5 GB) and red banner "Upgrade your cloud plan, free up storage or select fewer photos." | column, gap 12, 456 wide: primary "View cloud plans", text button "Choose fewer photos" |
| Upload confirmation - After cloud upgrade | 12975:33988 (metadata only) | not read | storage card 4.8 GB / 300 GB, after 5.4 GB / 300 GB | "Upload now" |
| Upload - Partial failure | 12975:34991 | "97 of 99 photos uploaded" (error icon) | "2 photos failed. Retry uploads only these 2." | Primary "Retry 2 photos", secondary "Back to album" |
| Upload complete | 12975:35490 | "Upload complete" (check-circle icon) | "99 photos uploaded", then card with "Storage used" "121.0 / 300 GB" and bar | single primary "Back to album" |

Storage card (node 12975:32502):
- Border 1px `#e4e4e4` (`--border-light`), radius 8, padding 24; rows column gap 12.
- Row: space-between, text 14, line height 1.2. Label Red Hat Display Regular `#737373`; value Red Hat Display SemiBold `#131415`.
- Rows in order: "This upload", "Cloud storage used", divider (top border `#ebebeb`, padding-top 12), "Storage after upload", progress bar.
- Progress bar: h 9, track `#ececec` radius 3, fill `#ff9632` radius 2000, fill width = after / limit.
- Card and banner sit in a column, gap 16, full width.

Not-enough variant (node 12975:33524): "Storage after upload" value `#ff6e5a`; bar fill `#ff6e5a`, full width.

Banner (nodes 12975:33026 orange, 12975:33539 red): left border 5px, radius 8, padding X16 Y12, gap 12; info icon 16; text Red Hat Display Regular 14, line height 1.3, `#131415`.
- Orange: bg `rgba(255,150,50,0.1)`, border `#ff9632`.
- Red: bg `rgba(255,110,90,0.1)`, border `#ff6e5a`.

Upload complete card (node 12975:35541): same border, radius and padding as the storage card; one row "Storage used" / "121.0 / 300 GB" (note: no "GB" after the used number), then bar h 6, track `#ececec` radius 3, fill `#ff9632` radius 3.

### Decided (no Figma frame)

| State | Copy and layout |
|---|---|
| Unlimited plan (`gbLimit` null) | Storage card with the three rows and no "/ limit"; no progress bar; no banner |
| All photos failed | Partial failure frame with 0: "0 of 99 photos uploaded" / "99 photos failed. Retry uploads only these 99." / "Retry 99 photos", "Back to album" |
| Some failures are quota (`USER_STORAGE_GB_LIMIT`, `USER_DATA_USAGE_LIMIT`) | Show the "Not enough cloud storage" frame; after a fresh check says it fits, return to the partial failure frame with "Retry N photos" |
| Some failures are final (other 4xx, source missing) | Partial failure frame plus subtitle line "{k} photos can't be uploaded."; final photos are not counted in "Retry N photos"; the retry button is hidden when N = 0 |
| Not enough disk while applying looks before upload | Export disk frame layout in the upload modal: "Not enough space on this computer" / "This upload needs {x} GB of free space to apply looks. Free up space and try again." / "Try again", "Cancel" |
| Server upload toast with failures | "Uploaded {ok} out of {n} photos" (pattern of the import toast) |

## Export flow

| Frame | Node (body) | Title | Subtitle / body | Buttons |
|---|---|---|---|---|
| Export - Missing source files | 12975:37980 | "2 source files are missing" (error icon) | "They were moved or deleted. Reconnect them and try again." | Primary "Try again", secondary "Cancel" |
| Export - Save cancelled | 12975:38981 | "Your export is ready" (no icon) | "Saving was cancelled. Your export is still ready." plus file card | single primary "Save to computer" |
| Export - Not enough disk space | 12975:39483 | "Not enough space on this computer" (error icon) | "This export needs 0.8 GB. Free up space or choose another location." | Primary "Try again", secondary "Change save location" |
| Export - Can't save to this folder | 12975:39982 | "Can't save to this folder" (error icon) | "Choose another location or check the folder's permissions." | Primary "Try again", secondary "Change save location" |
| Export ready - Save | 12975:38479 (metadata only) | not read | file card "photo-album.zip", "99 photos · 0.8 GB" | "Save to computer" |
| Export complete | 12975:40481 (metadata only) | not read | not read | "Open folder" |

File card (node 12975:39030): border 1px `#e4e4e4`, radius 8, padding X24 Y16, row gap 16; square thumb bg `#f8f8f8` radius 8 with `folder_zip` icon (repo has `src/assets/images/icon_folder_zip.svg`); name Red Hat Display SemiBold 16 `#131415`; meta Red Hat Display Regular 12, line height 1.6, `#737373`, text "99 photos  ·  0.8 GB" (two spaces around the dot in the layer).

## Sizes

All sizes show as GB with one decimal, binary base (1 GB = 1024^3 bytes), the same as the backend (`BYTES_PER_GB = 1024^3`, `toFixed(1)`). Below 0.05 GB the text is "<0.1 GB" (decided).
