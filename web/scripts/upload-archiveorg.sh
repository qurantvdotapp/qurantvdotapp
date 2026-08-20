#!/usr/bin/env bash
# Upload the Quran TV dataset mirror to archive.org.
# The dataset (web/data-mirror/) was downloaded from mp3quran.net + quran.ksu.edu.sa
# so the app can fall back to a stable mirror later.
#
# Prereqs:
#   1. Install the official archive.org CLI:  pipx install internetarchive   (or pip install)
#   2. Configure credentials ONCE:            ia configure   (enter your archive.org
#      email+password, or an access key/secret key)
#   3. Then run this script.
set -euo pipefail
cd "$(dirname "$0")/.."

ITEM="qurantv-dataset"
VERSION=$(node -p "require('./package.json').version")
DATE=$(date +%Y%m%d)
TARBALL="data-mirror/qurantv-dataset-${DATE}.tar.gz"

if [ ! -f "$TARBALL" ]; then
  echo "tarball missing — run scripts/download-dataset.mjs first"; exit 1
fi

echo "Uploading $TARBALL to archive.org item '$ITEM' ..."
ia upload "$ITEM" "$TARBALL" \
  --metadata="title:Quran TV — mp3quran + KSU dataset mirror" \
  --metadata="description:Full API database mirror for the Quran TV app: mp3quran.net catalog (reciters ar/en, suwar, riwayat, moshaf), ayat_timing reads/soar/per-(read,surah) timing (13,109 files), and quran.ksu.edu.sa hilites (604 pages x hafs/warsh/tajweed). Hosted for offline/mirror use by the free Quran TV app (Android + Tizen/Vidaa web port)." \
  --metadata="subject:quran; islam; audio; reciters; timing; dataset" \
  --metadata="mediatype:data" \
  --metadata="collection:opensource" \
  --metadata="date:${DATE}" \
  --metadata="licenseurl:https://mp3quran.net"

echo "Done. Item: https://archive.org/details/${ITEM}"
echo "Set the mirrors field in data-mirror/manifest.json to:"
echo "  https://archive.org/download/${ITEM}/qurantv-dataset-${DATE}.tar.gz"
