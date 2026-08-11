#!/usr/bin/env bash
# Generate Tizen TV app icons (512 + 128) from the shared SVG mark.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist/icons
for size in 512 128; do
  rsvg-convert -w "$size" -h "$size" tizen/icon.svg -o "dist/icons/icon_${size}.png"
  echo "icon_${size}.png: $(wc -c < dist/icons/icon_${size}.png) bytes"
done
