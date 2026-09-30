#!/usr/bin/env bash
# Fail fast if Xcode Copy Bundle Resources points at missing files.
# Catches gitignored / deleted assets before a 20–30m Release build.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PBX="${ROOT_DIR}/macos/GumpDesktop.xcodeproj/project.pbxproj"
MACOS_DIR="${ROOT_DIR}/macos"

if [[ ! -f "$PBX" ]]; then
  printf '✗ Missing Xcode project: %s\n' "$PBX" >&2
  exit 1
fi

python3 - "$PBX" "$MACOS_DIR" <<'PY'
import re
import sys
from pathlib import Path

pbx_path = Path(sys.argv[1])
macos_dir = Path(sys.argv[2])
text = pbx_path.read_text(encoding="utf-8", errors="replace")

# PBXBuildFile: ID /* name in Resources */ = { … fileRef = REF … };
build_files = {
    m.group(1): m.group(2)
    for m in re.finditer(
        r"(\w+)\s*/\*\s*[^*]+?\s+in Resources\s*\*/\s*=\s*\{[^}]*?fileRef\s*=\s*(\w+)",
        text,
        re.S,
    )
}

# PBXFileReference: ID /* … */ = { … path = NAME; …};
file_refs = {
    m.group(1): m.group(2).strip('"')
    for m in re.finditer(
        r"(\w+)\s*/\*[^*]*\*/\s*=\s*\{isa\s*=\s*PBXFileReference;[^}]*?\bpath\s*=\s*([^;]+);",
        text,
        re.S,
    )
}

# Resources phase file list
phase = re.search(
    r"/\* Begin PBXResourcesBuildPhase section \*/(.*?)/\* End PBXResourcesBuildPhase section \*/",
    text,
    re.S,
)
if not phase:
    print("✗ No PBXResourcesBuildPhase section found", file=sys.stderr)
    sys.exit(1)

resource_build_ids = re.findall(r"(\w+)\s*/\*\s*[^*]+?\s+in Resources\s*\*/", phase.group(1))

# Resolve by basename under macos/ (Models, Fonts, PrivacyInfo, assets, …).
seen = set()
missing = []
checked = []
for bid in resource_build_ids:
    ref = build_files.get(bid)
    if not ref:
        continue
    name = file_refs.get(ref)
    if not name or name in {"Base"} or name in seen:
        continue
    seen.add(name)
    checked.append(name)
    if (macos_dir / name).exists():
        continue
    if any(macos_dir.rglob(name)):
        continue
    missing.append(name)

print(f"▸ Checked {len(checked)} macOS bundle resource(s)")
if missing:
    print("✗ Missing files referenced by Xcode Copy Bundle Resources:", file=sys.stderr)
    for name in missing:
        print(f"  - {name}", file=sys.stderr)
    print(
        "\nRemove them from macos/GumpDesktop.xcodeproj (Resources) "
        "or commit/un-ignore the files before Release.",
        file=sys.stderr,
    )
    sys.exit(1)

print("▸ macOS bundle resources OK")
PY
