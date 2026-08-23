import os
import json
import glob
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_MIRROR = os.path.join(ROOT, "web", "data-mirror")
TIMING_SRC = os.path.join(DATA_MIRROR, "timing", "surah")
OUT_MUSHAF = os.path.join(DATA_MIRROR, "mushaf")
OUT_SVG = os.path.join(OUT_MUSHAF, "svg")

os.makedirs(OUT_MUSHAF, exist_ok=True)
os.makedirs(OUT_SVG, exist_ok=True)

print("[*] Extracting canonical mushaf layout from full read 106...")
layout = {}
for surah_id in range(1, 115):
    fpath = os.path.join(TIMING_SRC, f"106_{surah_id}.json")
    if os.path.exists(fpath):
        with open(fpath, "r", encoding="utf-8") as f:
            entries = json.load(f)
            for item in entries:
                ayah = item.get("ayah")
                if ayah is None:
                    continue
                key = f"{surah_id}:{ayah}"
                layout[key] = {
                    "surah": surah_id,
                    "ayah": ayah,
                    "polygon": item.get("polygon"),
                    "x": item.get("x"),
                    "y": item.get("y"),
                    "page": item.get("page")
                }

out_file = os.path.join(OUT_MUSHAF, "hafs_layout.json")
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(layout, f, ensure_ascii=False)

print(f"[✓] Saved {len(layout)} layout entries to {out_file} ({os.path.getsize(out_file)/1024:.1f} KB)")

# Download SVGs in parallel
print("[*] Downloading 604 Madinah Mushaf SVG pages...")
def get_svg(p):
    p_str = f"{p:03d}"
    dest = os.path.join(OUT_SVG, f"{p_str}.svg")
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return True
    url = f"https://www.mp3quran.net/api/quran_pages_svg/{p_str}.svg"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r, open(dest, "wb") as f:
            f.write(r.read())
        return True
    except:
        return False

with ThreadPoolExecutor(max_workers=16) as ex:
    res = list(ex.map(get_svg, range(1, 605)))

print(f"[✓] Downloaded {sum(1 for r in res if r)}/604 SVG pages into {OUT_SVG}")
