#!/usr/bin/env bash
# Copy shared assets from the Android app into the web build (mirrors the Gradle
# task that keeps quran-uthmani.txt in sync). Idempotent; copies only if missing.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/quran public/fonts public/icons

if [ ! -f public/quran/quran-uthmani.txt ]; then
  cp ../app/src/main/assets/quran/quran-uthmani.txt public/quran/quran-uthmani.txt
  echo "copied quran-uthmani.txt ($(wc -c < public/quran/quran-uthmani.txt) bytes)"
else
  echo "quran-uthmani.txt present"
fi

if [ ! -f public/fonts/amiri_quran.ttf ]; then
  cp ../app/src/main/res/font/amiri_quran.ttf public/fonts/amiri_quran.ttf
  echo "copied amiri_quran.ttf ($(wc -c < public/fonts/amiri_quran.ttf) bytes)"
else
  echo "amiri_quran.ttf present"
fi
