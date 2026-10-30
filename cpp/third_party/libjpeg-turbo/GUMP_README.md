# libjpeg-turbo (Gump analysis)

Vendored **libjpeg-turbo 3.0.4** sources for shared Mac/Windows JPEG decode with
IDCT scaling (`scale_num` / `scale_denom`). This replaces full-resolution
`stb_image` decode for analysis while keeping Mac≈Win pixels.

## What Gump compiles

- Sources listed in `GumpJpegSources.txt` (8-bit)
- 12/16-bit object wrappers in `gump_wrappers/` (required by turbo 3.x symbols)
- Portable headers in `gump_config/` (`jconfig.h`, `jconfigint.h`, `jversion.h`)

Do **not** commit `build/` (local cmake artifacts; gitignored).

## License

See `LICENSE.md` / `README.ijg` in this directory (IJG + libjpeg-turbo BSD-style).
