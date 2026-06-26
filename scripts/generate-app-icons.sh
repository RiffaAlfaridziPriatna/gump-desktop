#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANDING_DIR="$ROOT_DIR/scripts/branding"
SOURCE_SVG="$ROOT_DIR/src/assets/images/logo_icon_only.svg"
SOURCE_PNG="$BRANDING_DIR/app-icon-1024.png"
ICON_BACKGROUND="#FFFFFF"

mkdir -p "$BRANDING_DIR"

if [[ ! -f "$SOURCE_SVG" ]]; then
  echo "Missing app icon source at $SOURCE_SVG" >&2
  exit 1
fi

npx --yes sharp-cli resize 1024 1024 \
  --fit contain \
  --background "$ICON_BACKGROUND" \
  --input "$SOURCE_SVG" \
  --output "$SOURCE_PNG" >/dev/null

resize_square() {
  local size="$1"
  local output="$2"
  sips -z "$size" "$size" "$SOURCE_PNG" --out "$output" >/dev/null
}

write_ios_icons() {
  local dir="$ROOT_DIR/ios/GumpDesktop/Images.xcassets/AppIcon.appiconset"
  mkdir -p "$dir"

  resize_square 40 "$dir/Icon-20@2x.png"
  resize_square 60 "$dir/Icon-20@3x.png"
  resize_square 58 "$dir/Icon-29@2x.png"
  resize_square 87 "$dir/Icon-29@3x.png"
  resize_square 80 "$dir/Icon-40@2x.png"
  resize_square 120 "$dir/Icon-40@3x.png"
  resize_square 120 "$dir/Icon-60@2x.png"
  resize_square 180 "$dir/Icon-60@3x.png"
  cp "$SOURCE_PNG" "$dir/Icon-1024.png"

  cat >"$dir/Contents.json" <<'EOF'
{
  "images": [
    { "filename": "Icon-20@2x.png", "idiom": "iphone", "scale": "2x", "size": "20x20" },
    { "filename": "Icon-20@3x.png", "idiom": "iphone", "scale": "3x", "size": "20x20" },
    { "filename": "Icon-29@2x.png", "idiom": "iphone", "scale": "2x", "size": "29x29" },
    { "filename": "Icon-29@3x.png", "idiom": "iphone", "scale": "3x", "size": "29x29" },
    { "filename": "Icon-40@2x.png", "idiom": "iphone", "scale": "2x", "size": "40x40" },
    { "filename": "Icon-40@3x.png", "idiom": "iphone", "scale": "3x", "size": "40x40" },
    { "filename": "Icon-60@2x.png", "idiom": "iphone", "scale": "2x", "size": "60x60" },
    { "filename": "Icon-60@3x.png", "idiom": "iphone", "scale": "3x", "size": "60x60" },
    { "filename": "Icon-1024.png", "idiom": "ios-marketing", "scale": "1x", "size": "1024x1024" }
  ],
  "info": { "author": "xcode", "version": 1 }
}
EOF
}

write_macos_icons() {
  local dir="$ROOT_DIR/macos/GumpDesktop-macOS/Assets.xcassets/AppIcon.appiconset"
  mkdir -p "$dir"

  resize_square 16 "$dir/icon_16x16.png"
  resize_square 32 "$dir/icon_16x16@2x.png"
  resize_square 32 "$dir/icon_32x32.png"
  resize_square 64 "$dir/icon_32x32@2x.png"
  resize_square 128 "$dir/icon_128x128.png"
  resize_square 256 "$dir/icon_128x128@2x.png"
  resize_square 256 "$dir/icon_256x256.png"
  resize_square 512 "$dir/icon_256x256@2x.png"
  resize_square 512 "$dir/icon_512x512.png"
  cp "$SOURCE_PNG" "$dir/icon_512x512@2x.png"

  cat >"$dir/Contents.json" <<'EOF'
{
  "images": [
    { "filename": "icon_16x16.png", "idiom": "mac", "scale": "1x", "size": "16x16" },
    { "filename": "icon_16x16@2x.png", "idiom": "mac", "scale": "2x", "size": "16x16" },
    { "filename": "icon_32x32.png", "idiom": "mac", "scale": "1x", "size": "32x32" },
    { "filename": "icon_32x32@2x.png", "idiom": "mac", "scale": "2x", "size": "32x32" },
    { "filename": "icon_128x128.png", "idiom": "mac", "scale": "1x", "size": "128x128" },
    { "filename": "icon_128x128@2x.png", "idiom": "mac", "scale": "2x", "size": "128x128" },
    { "filename": "icon_256x256.png", "idiom": "mac", "scale": "1x", "size": "256x256" },
    { "filename": "icon_256x256@2x.png", "idiom": "mac", "scale": "2x", "size": "256x256" },
    { "filename": "icon_512x512.png", "idiom": "mac", "scale": "1x", "size": "512x512" },
    { "filename": "icon_512x512@2x.png", "idiom": "mac", "scale": "2x", "size": "512x512" }
  ],
  "info": { "author": "xcode", "version": 1 }
}
EOF
}

write_android_icons() {
  local densities=(
    "mipmap-mdpi:48"
    "mipmap-hdpi:72"
    "mipmap-xhdpi:96"
    "mipmap-xxhdpi:144"
    "mipmap-xxxhdpi:192"
  )

  for entry in "${densities[@]}"; do
    local folder="${entry%%:*}"
    local size="${entry##*:}"
    local dir="$ROOT_DIR/android/app/src/main/res/$folder"
    mkdir -p "$dir"
    resize_square "$size" "$dir/ic_launcher.png"
    cp "$dir/ic_launcher.png" "$dir/ic_launcher_round.png"
  done
}

write_windows_icons() {
  local dir="$ROOT_DIR/windows/GumpDesktop.Package/Images"
  mkdir -p "$dir"

  resize_square 50 "$dir/StoreLogo.png"
  resize_square 24 "$dir/Square44x44Logo.targetsize-24_altform-unplated.png"
  resize_square 88 "$dir/Square44x44Logo.scale-200.png"
  resize_square 300 "$dir/Square150x150Logo.scale-200.png"
  resize_square 300 "$dir/LockScreenLogo.scale-200.png"
  npx --yes sharp-cli resize 620 300 \
    --fit contain \
    --background "$ICON_BACKGROUND" \
    --input "$SOURCE_SVG" \
    --output "$dir/Wide310x150Logo.scale-200.png" >/dev/null
  cp "$dir/Wide310x150Logo.scale-200.png" "$dir/SplashScreen.scale-200.png"

  npx --yes png-to-ico "$SOURCE_PNG" >"$ROOT_DIR/windows/GumpDesktop/GumpDesktop.ico"
}

write_ios_icons
write_macos_icons
write_android_icons
write_windows_icons

echo "Generated app icons from $SOURCE_SVG"
