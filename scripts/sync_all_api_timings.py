#!/usr/bin/env python3
"""
sync_all_api_timings.py
Imports all available surah and reading timings from mp3quran.net API into:
- web/data-mirror/timing/reads.json
- web/data-mirror/timing/soar/<read_id>.json
- web/data-mirror/timing_clean/<slug>/<surah>.json
- web/data-mirror/timing/<slug>/<surah>.json
- web/data-mirror/timing_clean/<read_id>_<surah>.json
- web/data-mirror/timing/surah/<read_id>_<surah>.json
- web/data-mirror/timing_index.json
"""

import os
import sys
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_MIRROR = os.path.join(ROOT_DIR, "web", "data-mirror")
READS_FILE = os.path.join(DATA_MIRROR, "timing", "reads.json")
SOAR_DIR = os.path.join(DATA_MIRROR, "timing", "soar")
SURAH_DIR = os.path.join(DATA_MIRROR, "timing", "surah")
CLEAN_DIR = os.path.join(DATA_MIRROR, "timing_clean")
TIMING_DIR = os.path.join(DATA_MIRROR, "timing")
INDEX_FILE = os.path.join(DATA_MIRROR, "timing_index.json")

os.makedirs(SOAR_DIR, exist_ok=True)
os.makedirs(SURAH_DIR, exist_ok=True)
os.makedirs(CLEAN_DIR, exist_ok=True)
os.makedirs(TIMING_DIR, exist_ok=True)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) QuranTV/1.0"

def fetch_json(url, retries=3, delay=1.5):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read().decode("utf-8")
                return json.loads(data)
        except Exception as e:
            if attempt == retries - 1:
                return None
            time.sleep(delay * (attempt + 1))
    return None

def main():
    print("1. Fetching all reads from mp3quran API...")
    api_reads = fetch_json("https://www.mp3quran.net/api/v3/ayat_timing/reads")
    if not api_reads:
        print("Failed to fetch reads from API.")
        return

    print(f"Fetched {len(api_reads)} reads from API.")

    with open(READS_FILE, "r", encoding="utf-8") as f:
        local_reads = json.load(f)

    local_reads_by_id = {r["id"]: r for r in local_reads}

    # Update or insert reads in reads.json
    for ar in api_reads:
        rid = ar["id"]
        if rid in local_reads_by_id:
            local_reads_by_id[rid]["soar_count"] = ar.get("soar_count", local_reads_by_id[rid].get("soar_count", 114))
            local_reads_by_id[rid]["soar_link"] = ar.get("soar_link", f"https://www.mp3quran.net/api/v3/ayat_timing/soar?read={rid}")
            if not local_reads_by_id[rid].get("name") and ar.get("name"):
                local_reads_by_id[rid]["name"] = ar["name"]
            if not local_reads_by_id[rid].get("rewaya") and ar.get("rewaya"):
                local_reads_by_id[rid]["rewaya"] = ar["rewaya"]
            if not local_reads_by_id[rid].get("folder_url") and ar.get("folder_url"):
                local_reads_by_id[rid]["folder_url"] = ar["folder_url"]
        else:
            # New read
            slug = f"qurantvapp-read-{rid}"
            ar["slug"] = slug
            local_reads_by_id[rid] = ar

    merged_reads = sorted(list(local_reads_by_id.values()), key=lambda x: x["id"])
    with open(READS_FILE, "w", encoding="utf-8") as f:
        json.dump(merged_reads, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(merged_reads)} reads to reads.json.")

    print("2. Fetching all soar lists...")
    read_soar_map = {}

    def fetch_soar_task(read_obj):
        rid = read_obj["id"]
        soar_url = f"https://www.mp3quran.net/api/v3/ayat_timing/soar?read={rid}"
        soar_data = fetch_json(soar_url)
        if soar_data:
            soar_file = os.path.join(SOAR_DIR, f"{rid}.json")
            with open(soar_file, "w", encoding="utf-8") as sf:
                json.dump(soar_data, sf, ensure_ascii=False, indent=2)
            return rid, soar_data
        return rid, []

    with ThreadPoolExecutor(max_workers=12) as ex:
        futures = {ex.submit(fetch_soar_task, r): r for r in merged_reads}
        for f in as_completed(futures):
            rid, sdata = f.result()
            if sdata:
                read_soar_map[rid] = sdata

    print(f"Fetched soar lists for {len(read_soar_map)} reads.")

    print("3. Checking missing surah timings to download...")
    download_tasks = []
    for r in merged_reads:
        rid = r["id"]
        slug = r.get("slug")
        soar_list = read_soar_map.get(rid, [])
        if not soar_list:
            # Fallback to local soar file if present
            soar_file = os.path.join(SOAR_DIR, f"{rid}.json")
            if os.path.exists(soar_file):
                try:
                    with open(soar_file, "r", encoding="utf-8") as sf:
                        soar_list = json.load(sf)
                except Exception:
                    soar_list = []

        for s_item in soar_list:
            surah_num = s_item["id"] if isinstance(s_item, dict) else int(s_item)
            
            # Check if file exists in primary locations
            has_clean_slug = slug and os.path.exists(os.path.join(CLEAN_DIR, slug, f"{surah_num}.json"))
            has_clean_flat = os.path.exists(os.path.join(CLEAN_DIR, f"{rid}_{surah_num}.json"))
            has_surah_flat = os.path.exists(os.path.join(SURAH_DIR, f"{rid}_{surah_num}.json"))
            
            if not (has_clean_slug and has_clean_flat and has_surah_flat):
                download_tasks.append((rid, slug, surah_num))

    print(f"Total surah timings to fetch / update: {len(download_tasks)}")

    def fetch_and_save_surah(task):
        rid, slug, surah_num = task
        url = f"https://www.mp3quran.net/api/v3/ayat_timing?read={rid}&surah={surah_num}"
        raw_data = fetch_json(url)
        if not raw_data:
            return False

        # Convert to compact flat number array: [ayah, start_time, end_time, ...]
        flat_numbers = []
        if raw_data and isinstance(raw_data[0], (int, float)):
            flat_numbers = [int(x) for x in raw_data]
        else:
            for item in raw_data:
                if isinstance(item, dict):
                    a = item.get("ayah", 0)
                    st = item.get("start_time", item.get("start", 0))
                    et = item.get("end_time", item.get("end", 0))
                    flat_numbers.extend([int(a), int(st), int(et)])

        if not flat_numbers:
            return False

        compact_json = json.dumps(flat_numbers, separators=(",", ":"))

        # Save only to canonical mirror locations
        if slug:
            slug_clean_dir = os.path.join(CLEAN_DIR, slug)
            slug_timing_dir = os.path.join(TIMING_DIR, slug)
            os.makedirs(slug_clean_dir, exist_ok=True)
            os.makedirs(slug_timing_dir, exist_ok=True)

            with open(os.path.join(slug_clean_dir, f"{surah_num}.json"), "w", encoding="utf-8") as out:
                out.write(compact_json)
            with open(os.path.join(slug_timing_dir, f"{surah_num}.json"), "w", encoding="utf-8") as out:
                out.write(compact_json)

        return True

    success_count = 0
    failed_count = 0
    if download_tasks:
        print("Starting concurrent download worker pool (16 workers)...")
        with ThreadPoolExecutor(max_workers=16) as ex:
            futures = {ex.submit(fetch_and_save_surah, t): t for t in download_tasks}
            for i, f in enumerate(as_completed(futures), 1):
                res = f.result()
                if res:
                    success_count += 1
                else:
                    failed_count += 1
                if i % 100 == 0 or i == len(download_tasks):
                    print(f"Progress: {i}/{len(download_tasks)} (Success: {success_count}, Failed: {failed_count})")

    print("4. Regenerating timing_index.json...")
    index = {
        "version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "servers": {}
    }

    for r in merged_reads:
        read_id = r.get("id")
        folder_url = r.get("folder_url", "").strip().rstrip("/") + "/"
        slug = r.get("slug")
        if not folder_url or folder_url == "/":
            continue

        surahs = []
        if slug and os.path.exists(os.path.join(CLEAN_DIR, slug)):
            surahs = [int(f[:-5]) for f in os.listdir(os.path.join(CLEAN_DIR, slug)) if f.endswith(".json") and f[:-5].isdigit()]

        if surahs:
            sorted_surahs = sorted(list(set(surahs)))
            is_full = (len(sorted_surahs) == 114 and sorted_surahs[0] == 1 and sorted_surahs[-1] == 114)
            index["servers"][folder_url] = {
                "read_id": read_id,
                "slug": slug,
                "surahs": "all" if is_full else sorted_surahs,
                "clean": True
            }

    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    total_servers = len(index["servers"])
    all_servers = sum(1 for s in index["servers"].values() if s.get("surahs") == "all")
    partial_servers = total_servers - all_servers
    print(f"Successfully generated timing_index.json:")
    print(f"  - Total Servers: {total_servers}")
    print(f"  - Full 114 Surahs ('all'): {all_servers}")
    print(f"  - Partial Surahs: {partial_servers}")

if __name__ == "__main__":
    main()
