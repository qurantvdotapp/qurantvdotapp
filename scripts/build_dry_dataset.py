#!/usr/bin/env python3
"""
Builds DRY dataset:
1. Extracts canonical Mushaf SVG layout/highlights (surah:ayah -> {page, polygon, x, y}) once.
2. Converts timing files into clean DRY JSON (ayah, start_time, end_time).
3. Downloads the 604 Madinah Mushaf SVGs for self-hosted / offline use.
"""

import os
import sys
import json
import glob
import urllib.request
from concurrent.futures import ThreadPoolExecutor

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_MIRROR = os.path.join(ROOT, "web", "data-mirror")
TIMING_SRC = os.path.join(DATA_MIRROR, "timing", "surah")
OUT_MUSHAF = os.path.join(DATA_MIRROR, "mushaf")
OUT_SVG = os.path.join(OUT_MUSHAF, "svg")
OUT_DRY_TIMING = os.path.join(DATA_MIRROR, "timing_clean")

def extract_canonical_mushaf_layout():
    """Extracts a single master layout for all 6,236 Ayahs."""
    os.makedirs(OUT_MUSHAF, exist_ok=True)
    layout = {}
    
    files = glob.glob(os.path.join(TIMING_SRC, "*.json"))
    print(f"[*] Scanning {len(files)} timing files for highlight polygons...")
    
    for fpath in files:
        fname = os.path.basename(fpath)
        # fname is {read}_{surah}.json
        parts = fname.replace(".json", "").split("_")
        if len(parts) != 2:
            continue
        surah_id = int(parts[1])
        
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                entries = json.load(f)
                for item in entries:
                    ayah = item.get("ayah")
                    if ayah is None:
                        continue
                    key = f"{surah_id}:{ayah}"
                    # Only store if has polygon or page and not already stored with full polygon
                    if key not in layout or (not layout[key].get("polygon") and item.get("polygon")):
                        layout[key] = {
                            "surah": surah_id,
                            "ayah": ayah,
                            "polygon": item.get("polygon"),
                            "x": item.get("x"),
                            "y": item.get("y"),
                            "page": item.get("page")
                        }
        except Exception:
            continue
            
    out_file = os.path.join(OUT_MUSHAF, "hafs_layout.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(layout, f, ensure_ascii=False)
        
    size_mb = os.path.getsize(out_file) / (1024 * 1024)
    print(f"[✓] Extracted {len(layout)} canonical Ayah highlight entries -> {out_file} ({size_mb:.2f} MB)")
    return layout

def download_svg_pages():
    """Downloads the 604 Madinah Mushaf SVG pages for self-hosting."""
    os.makedirs(OUT_SVG, exist_ok=True)
    print(f"[*] Checking/downloading 604 Madinah Mushaf SVG pages to {OUT_SVG}...")
    
    def download_page(page_num):
        p_str = f"{page_num:03d}"
        local_path = os.path.join(OUT_SVG, f"{p_str}.svg")
        if os.path.exists(local_path) and os.path.getsize(local_path) > 1000:
            return True
        url = f"https://www.mp3quran.net/api/quran_pages_svg/{p_str}.svg"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp, open(local_path, "wb") as f:
                f.write(resp.read())
            return True
        except Exception as e:
            return False

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(download_page, range(1, 605)))
        
    success_count = sum(1 for r in results if r)
    print(f"[✓] Downloaded {success_count}/604 SVG pages.")

if __name__ == "__main__":
    print("=== BUILDING DRY DATASET & ASSETS ===")
    extract_canonical_mushaf_layout()
    download_svg_pages()
    print("=== DONE ===")
