#!/usr/bin/env python3
"""
port_legacy_timings.py
Ports all legacy timing files from web/data-mirror/timing/surah/*.json into:
1. Compact format with only {"ayah": ..., "start_time": ..., "end_time": ...}
2. Slug-based directory structures:
   - web/data-mirror/timing_clean/<slug>/<surah>.json
   - web/data-mirror/timing/<slug>/<surah>.json
   - web/data-mirror/timing_clean/<slug>_<surah>.json
   - web/data-mirror/timing/surah/<slug>_<surah>.json
3. Also updates legacy flat files in timing/surah and timing_clean in-place with the compact schema.
4. Regenerates timing_index.json.
"""

import os
import sys
import json
import re
import time

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_MIRROR = os.path.join(ROOT_DIR, "web", "data-mirror")

def get_slug_for_recitation(prefix, reads_list, catalog_ar, catalog_en):
    if prefix.startswith("qurantvapp-"):
        return prefix

    matching_read = None
    if prefix.isdigit():
        r_id = int(prefix)
        for r in reads_list:
            if r.get("id") == r_id:
                matching_read = r
                break
    
    if matching_read and "archive.org/download/" in matching_read.get("folder_url", ""):
        slug = matching_read["folder_url"].split("archive.org/download/")[1].split("/")[0].strip()
        if slug:
            return slug

    reciter_id = None
    moshaf_id = None
    if "_" in prefix:
        parts = prefix.split("_")
        if parts[0].isdigit() and parts[1].isdigit():
            reciter_id = int(parts[0])
            moshaf_id = int(parts[1])
    elif prefix.isdigit():
        reciter_id = int(prefix)
        moshaf_id = int(prefix)

    reciter_ar = None
    reciter_en = None
    for r in catalog_ar:
        if r.get("id") == reciter_id:
            reciter_ar = r
            break
    for r in catalog_en:
        if r.get("id") == reciter_id:
            reciter_en = r
            break

    r_name = ""
    m_name = ""
    if reciter_en:
        r_name = reciter_en.get("name", "")
        if moshaf_id:
            for m in reciter_en.get("moshaf", []):
                if m.get("id") == moshaf_id:
                    m_name = m.get("name", "")
                    break
    if not r_name and reciter_ar:
        r_name = reciter_ar.get("name", "")
        if moshaf_id:
            for m in reciter_ar.get("moshaf", []):
                if m.get("id") == moshaf_id:
                    m_name = m.get("name", "")
                    break

    if not r_name and matching_read:
        r_name = matching_read.get("name", "")
        m_name = matching_read.get("rewaya", "")

    r_lower = (r_name or "").lower()
    m_lower = (m_name or "").lower()

    if any(k in r_lower for k in ["hussary", "husary", "حصري"]): rec_slug = "husry"
    elif any(k in r_lower for k in ["afasy", "alafasi", "عفاسي"]): rec_slug = "afasy"
    elif any(k in r_lower for k in ["minshawi", "منشاوي"]): rec_slug = "minshawi"
    elif any(k in r_lower for k in ["abdulbasit", "عبد الباسط", "عبدالباسط"]): rec_slug = "abdulbasit"
    elif any(k in r_lower for k in ["shuraym", "شريم"]): rec_slug = "shuraym"
    elif any(k in r_lower for k in ["sudais", "سديس"]): rec_slug = "sudais"
    elif any(k in r_lower for k in ["ghamadi", "غامدي"]): rec_slug = "ghamadi"
    elif any(k in r_lower for k in ["maher", "معيقلي"]): rec_slug = "maher"
    elif any(k in r_lower for k in ["ayyoub", "ayyub", "أيوب"]): rec_slug = "ayyoub"
    elif any(k in r_lower for k in ["tblawi", "tablawi", "طبلاوي"]): rec_slug = "tblawi"
    elif any(k in r_lower for k in ["hudhaify", "huthifi", "حذيفي"]): rec_slug = "hudhaify"
    elif any(k in r_lower for k in ["ajm", "ajamy", "عجمي"]): rec_slug = "ajamy"
    elif any(k in r_lower for k in ["akram", "علاقمي"]): rec_slug = "akram"
    elif any(k in r_lower for k in ["akdr", "اخضر", "أخضر"]): rec_slug = "akhdar"
    elif any(k in r_lower for k in ["bana", "بنا"]): rec_slug = "banna"
    elif any(k in r_lower for k in ["juhany", "جهني"]): rec_slug = "juhany"
    elif any(k in r_lower for k in ["shatri", "شاطري"]): rec_slug = "shatri"
    elif any(k in r_lower for k in ["yasser", "ياسر"]): rec_slug = "yasser"
    elif any(k in r_lower for k in ["basfar", "بصفر"]): rec_slug = "basfar"
    elif any(k in r_lower for k in ["qari", "قاري"]): rec_slug = "qari"
    elif any(k in r_lower for k in ["khayat", "خياط"]): rec_slug = "khayat"
    elif any(k in r_lower for k in ["matroud", "مطرود"]): rec_slug = "matroud"
    elif any(k in r_lower for k in ["zaki", "داغستاني"]): rec_slug = "daghistani"
    elif any(k in r_lower for k in ["dokali", "دوكالي"]): rec_slug = "dokali"
    elif any(k in r_lower for k in ["balilah", "بليلة"]): rec_slug = "balilah"
    elif any(k in r_lower for k in ["khalaf", "خلف"]): rec_slug = "khalaf"
    elif any(k in r_lower for k in ["dosri", "دوسري"]): rec_slug = "dosri"
    elif any(k in r_lower for k in ["jaleel", "عبد الجليل", "عبدالجليل"]): rec_slug = "abduljaleel"
    elif any(k in r_lower for k in ["qahtani", "قحطاني"]): rec_slug = "qahtani"
    elif any(k in r_lower for k in ["swaiyd", "سويد"]): rec_slug = "suwaid"
    elif any(k in r_lower for k in ["peshawa", "بيشوا"]): rec_slug = "peshawa"
    elif any(k in r_lower for k in ["turki", "تركي"]): rec_slug = "turki"
    elif any(k in r_lower for k in ["saleh", "صالح"]): rec_slug = "saleh"
    elif any(k in r_lower for k in ["rashad", "رشاد"]): rec_slug = "rashad"
    elif any(k in r_lower for k in ["bassiouni", "بسيوني"]): rec_slug = "bassiouni"
    else:
        rec_slug = re.sub(r"[^a-z0-9\-]", "", r_lower.replace(" ", "-").replace("_", "-")).strip("-")
        if not rec_slug or len(rec_slug) < 3:
            rec_slug = f"reciter-{reciter_id or 1}"
        if len(rec_slug) > 18:
            rec_slug = rec_slug[:18].rstrip("-")

    riwayah_slug = "hafs"
    if any(k in m_lower for k in ["warsh", "ورش"]): riwayah_slug = "warsh"
    elif any(k in m_lower for k in ["qalon", "قالون"]): riwayah_slug = "qalon"
    elif any(k in m_lower for k in ["dori", "douri", "دوري"]): riwayah_slug = "dori"
    elif any(k in m_lower for k in ["susi", "سوسي"]): riwayah_slug = "susi"
    elif any(k in m_lower for k in ["bazzi", "بزي"]): riwayah_slug = "bazzi"
    elif any(k in m_lower for k in ["shuba", "شعبة"]): riwayah_slug = "shuba"
    elif any(k in m_lower for k in ["mojawwad", "مجود"]): riwayah_slug = "mojawwad"
    elif any(k in m_lower for k in ["mo-lim", "معلم"]): riwayah_slug = "moallim"

    if reciter_ar and reciter_ar.get("moshaf") and len(reciter_ar["moshaf"]) > 1:
        if "mojawwad" in m_lower or "مجود" in m_lower:
            riwayah_slug = "mojawwad"
        elif "mo-lim" in m_lower or "معلم" in m_lower:
            riwayah_slug = "moallim"
        elif "مرتل" in m_lower or "murattal" in m_lower:
            riwayah_slug = f"{riwayah_slug}-murattal"
        elif moshaf_id and moshaf_id != reciter_id:
            riwayah_slug = f"{riwayah_slug}-m{moshaf_id}"

    return f"qurantvapp-{rec_slug}-{riwayah_slug}"

def main():
    surah_dir = os.path.join(DATA_MIRROR, "timing", "surah")
    clean_dir = os.path.join(DATA_MIRROR, "timing_clean")
    timing_dir = os.path.join(DATA_MIRROR, "timing")
    reads_file = os.path.join(DATA_MIRROR, "timing", "reads.json")
    rec_ar_file = os.path.join(DATA_MIRROR, "catalog", "reciters_ar.json")
    rec_en_file = os.path.join(DATA_MIRROR, "catalog", "reciters_en.json")

    os.makedirs(clean_dir, exist_ok=True)
    os.makedirs(surah_dir, exist_ok=True)

    with open(reads_file, "r", encoding="utf-8") as f:
        reads_list = json.load(f)
    with open(rec_ar_file, "r", encoding="utf-8") as f:
        catalog_ar = json.load(f).get("reciters", [])
    with open(rec_en_file, "r", encoding="utf-8") as f:
        catalog_en = json.load(f).get("reciters", [])

    files = [f for f in os.listdir(surah_dir) if f.endswith(".json")]
    print(f"Found {len(files)} files in {surah_dir}...")

    prefix_map = {}
    for f in files:
        parts = f[:-5].split("_")
        if len(parts) == 2:
            prefix = parts[0]
            surah_num = int(parts[1])
        elif len(parts) == 3:
            prefix = f"{parts[0]}_{parts[1]}"
            surah_num = int(parts[2])
        else:
            prefix = "_".join(parts[:-1])
            surah_num = int(parts[-1])
        prefix_map.setdefault(prefix, []).append((surah_num, f))

    print(f"Found {len(prefix_map)} unique recitations/prefixes.")

    processed_count = 0
    slug_created_count = 0

    for prefix, surah_entries in prefix_map.items():
        slug = get_slug_for_recitation(prefix, reads_list, catalog_ar, catalog_en)
        
        slug_clean_dir = os.path.join(clean_dir, slug)
        slug_timing_dir = os.path.join(timing_dir, slug)
        os.makedirs(slug_clean_dir, exist_ok=True)
        os.makedirs(slug_timing_dir, exist_ok=True)

        for surah_num, filename in surah_entries:
            src_path = os.path.join(surah_dir, filename)
            with open(src_path, "r", encoding="utf-8") as sf:
                try:
                    raw_data = json.load(sf)
                except Exception as e:
                    print(f"Error reading {src_path}: {e}")
                    continue

            # Pure flat number array: [ayah, start_time, end_time, ...]
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

            # Dense JSON string
            compact_json = json.dumps(flat_numbers, separators=(",", ":"))

            # 1. Update source legacy flat files in-place with compact flat number array
            with open(src_path, "w", encoding="utf-8") as out_f:
                out_f.write(compact_json)

            clean_flat_path = os.path.join(clean_dir, filename)
            with open(clean_flat_path, "w", encoding="utf-8") as out_f:
                out_f.write(compact_json)

            # 2. Write to new structured slug directory
            slug_surah_path = os.path.join(slug_timing_dir, f"{surah_num}.json")
            slug_clean_path = os.path.join(slug_clean_dir, f"{surah_num}.json")
            with open(slug_surah_path, "w", encoding="utf-8") as out_f:
                out_f.write(compact_json)
            with open(slug_clean_path, "w", encoding="utf-8") as out_f:
                out_f.write(compact_json)

            # 3. Write flat slug filename compatibility alias
            flat_slug_surah = os.path.join(surah_dir, f"{slug}_{surah_num}.json")
            flat_slug_clean = os.path.join(clean_dir, f"{slug}_{surah_num}.json")
            with open(flat_slug_surah, "w", encoding="utf-8") as out_f:
                out_f.write(compact_json)
            with open(flat_slug_clean, "w", encoding="utf-8") as out_f:
                out_f.write(compact_json)

            processed_count += 1

        slug_created_count += 1

    print(f"Compacted and ported {processed_count} files across {slug_created_count} recitations.")

    # Regenerate timing_index.json using timing-studio generator
    sys.path.insert(0, os.path.join(ROOT_DIR, "timing-studio", "backend"))
    try:
        from server import generate_timing_index_data
        idx = generate_timing_index_data()
        print(f"Regenerated timing_index.json with {len(idx['servers'])} servers.")
    except Exception as e:
        print("Warning: failed to run generate_timing_index_data:", e)

if __name__ == "__main__":
    main()
