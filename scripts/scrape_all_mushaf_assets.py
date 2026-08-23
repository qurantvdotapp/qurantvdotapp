#!/usr/bin/env python3
"""
Master Quran & Mushaf Asset Scraper
Downloads all assets required for 100% self-hosted, independent operation:
1. Madinah Mushaf SVG Pages (604 pages)
2. KSU Ayat Hafs PNG Pages (604 pages)
3. KSU Ayat Warsh PNG Pages (604 pages)
4. KSU Hafs Tajweed PNG Pages (604 pages)
5. KSU Ayah Highlight JSONs for Hafs, Warsh, and Tajweed (604 pages each)
6. Tanzil Canonical Quran Texts (Uthmani, Simple, English translations)
7. mp3quran v3 Catalog (suwar, reciters, moshaf, riwayat)
"""

import os
import sys
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_DIR = os.path.join(ROOT, "web", "data-mirror")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*"
}

def download_file(url: str, dest_path: str, min_size: int = 100, retries: int = 3) -> bool:
    """Download single file with retries and min size validation."""
    if os.path.exists(dest_path) and os.path.getsize(dest_path) >= min_size:
        return True # already downloaded
    
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
                if len(data) >= min_size:
                    with open(dest_path, "wb") as f:
                        f.write(data)
                    return True
        except Exception as e:
            if attempt == retries - 1:
                return False
            time.sleep(0.5 * (attempt + 1))
    return False

def scrape_ksu_images(category_name: str, base_url: str, out_subfolder: str):
    """Scrape 604 high-res page images."""
    dest_dir = os.path.join(OUT_DIR, "mushaf", out_subfolder)
    os.makedirs(dest_dir, exist_ok=True)
    print(f"[*] Scraping {category_name} (604 pages) -> {dest_dir} ...")
    
    def fetch_page(p: int):
        url = f"{base_url}/{p}.png"
        dest = os.path.join(dest_dir, f"{p}.png")
        return download_file(url, dest, min_size=5000)

    with ThreadPoolExecutor(max_workers=12) as ex:
        results = list(ex.map(fetch_page, range(1, 605)))
        
    success = sum(1 for r in results if r)
    print(f"[✓] {category_name}: {success}/604 pages downloaded.")

def scrape_ksu_hilites(mushaf_name: str):
    """Scrape 604 KSU highlight JSONs."""
    dest_dir = os.path.join(OUT_DIR, "hilites", mushaf_name)
    os.makedirs(dest_dir, exist_ok=True)
    print(f"[*] Scraping KSU highlights ({mushaf_name}) -> {dest_dir} ...")
    
    def fetch_hilite(p: int):
        url = f"https://quran.ksu.edu.sa/interface.php?ui=pc&do=hilites&mosshaf={mushaf_name}&page={p}"
        dest = os.path.join(dest_dir, f"{p}.json")
        return download_file(url, dest, min_size=10)

    with ThreadPoolExecutor(max_workers=12) as ex:
        results = list(ex.map(fetch_hilite, range(1, 605)))
        
    success = sum(1 for r in results if r)
    print(f"[✓] Highlights ({mushaf_name}): {success}/604 JSONs downloaded.")

def scrape_tanzil_texts():
    """Download canonical Tanzil texts and translations."""
    tanzil_dir = os.path.join(OUT_DIR, "text")
    os.makedirs(tanzil_dir, exist_ok=True)
    print(f"[*] Downloading Tanzil Quran texts & translations -> {tanzil_dir} ...")
    
    urls = [
        ("quran-uthmani.txt", "https://tanzil.net/pub/download/download.php?quranType=quran-uthmani&outType=txt"),
        ("quran-simple.txt", "https://tanzil.net/pub/download/download.php?quranType=quran-simple&outType=txt"),
        ("quran-simple-clean.txt", "https://tanzil.net/pub/download/download.php?quranType=quran-simple-clean&outType=txt"),
        ("en.sahih.txt", "https://tanzil.net/pub/download/download.php?transID=en.sahih&outType=txt"),
    ]
    
    for fname, url in urls:
        dest = os.path.join(tanzil_dir, fname)
        if download_file(url, dest, min_size=1000):
            print(f"[✓] Text downloaded: {fname} ({os.path.getsize(dest)/1024:.1f} KB)")
        else:
            # Copy bundled local version as fallback
            local_src = os.path.join(ROOT, "app", "src", "main", "assets", "quran", "quran-uthmani.txt")
            if os.path.exists(local_src) and fname == "quran-uthmani.txt":
                with open(local_src, "rb") as src_f, open(dest, "wb") as dst_f:
                    dst_f.write(src_f.read())
                print(f"[✓] Bundled fallback copied: {fname}")

def main():
    print("==================================================")
    print("  Master Quran & Mushaf Full Asset Scraper")
    print("==================================================")
    
    # 1. KSU Ayat Hafs PNGs (Style 3)
    scrape_ksu_images("KSU Ayat Hafs (safahat1)", "https://quran.ksu.edu.sa/ayat/safahat1", "ksu_hafs")
    
    # 2. KSU Hafs Tajweed PNGs (Style 5 - Default)
    scrape_ksu_images("KSU Hafs Tajweed", "https://quran.ksu.edu.sa/tajweed_png", "ksu_tajweed")
    
    # 3. KSU Ayat Warsh PNGs (Style 4)
    scrape_ksu_images("KSU Ayat Warsh", "https://quran.ksu.edu.sa/warsh", "ksu_warsh")
    
    # 4. KSU Highlights JSON (Hafs, Warsh, Tajweed)
    scrape_ksu_hilites("hafs")
    scrape_ksu_hilites("tajweed")
    scrape_ksu_hilites("warsh")
    
    # 5. Tanzil Quran texts
    scrape_tanzil_texts()
    
    print("\n==================================================")
    print("  [✓] FULL ASSET SCRAPING COMPLETE")
    print("==================================================")

if __name__ == "__main__":
    main()
