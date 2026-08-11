#!/usr/bin/env bash
# Build the Tizen TV web package (.wgt) from the Vite build.
#  1. vite build (dist/)
#  2. copy config.xml + icons into dist
#  3. zip as dist/QuranTV.wgt (unsigned — installable on the emulator after
#     "Permit to install applications"; real TVs need a Samsung-signed wgt)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== vite build =="
npm run build

echo "== tizen packaging =="
bash scripts/gen-icons.sh
cp tizen/config.xml dist/config.xml

# .wgt is a zip with the config.xml at the archive root
python3 - << 'PYEOF'
import os, zipfile
out = "dist/QuranTV.wgt"
if os.path.exists(out):
    os.remove(out)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _dirs, files in os.walk("dist"):
        for f in files:
            if f == "QuranTV.wgt":
                continue
            p = os.path.join(root, f)
            arc = os.path.relpath(p, "dist")
            z.write(p, arc)
print("wrote", out)
PYEOF
echo "== QuranTV.wgt =="
ls -la dist/QuranTV.wgt

# If the Tizen CLI is present, also produce a signed package for a real device
# (requires a Samsung certificate profile created via the Certificate Manager).
if command -v ~/tizen-studio/tools/ide/bin/tizen >/dev/null 2>&1; then
  echo "tizen CLI present — unsigned build only (no certificate profile configured)."
fi
