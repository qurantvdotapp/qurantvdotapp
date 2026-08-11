#!/usr/bin/env python3
"""Convert the KSU Ayat .ayt SQLite tafseer DBs into per-surah JSON for the web
build (mirrors the Android app's bundled assets; source files live in the repo
at app/src/main/assets/tafseer/). Output: web/public/tafseer/surah_<n>.json —
one file per surah with {ayah: {tafseer, meanings, translation}} (empty strings
kept — the UI hides empty rows exactly like the Android app).

Usage: python3 scripts/convert-tafseer.py
"""
import json
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "..", "app", "src", "main", "assets", "tafseer")
OUT = os.path.join(ROOT, "public", "tafseer")

SOURCES = [
    ("ar_muyassar.ayt", "ar_muyassar", "tafseer"),
    ("ar_ma3any.ayt", "ar_ma3any", "meanings"),
    ("en_sahih.ayt", "en_sahih", "translation"),
]

# surah id -> first ayah (standard Madinah pagination: ayahs are contiguous 1..n
# per surah; we only need to know how many ayahs each surah has to pre-seed)
# 114 surahs, ayah counts from Tanzil (verified against quran-uthmani.txt).
AYAH_COUNTS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
    111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73,
    54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49,
    62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28,
    28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
    15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]

def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    # read all three DBs into {surah: {ayah: text}}
    data: dict[int, dict[int, dict[str, str]]] = {}
    for fname, table, key in SOURCES:
        path = os.path.join(SRC, fname)
        if not os.path.exists(path):
            print(f"SKIP {fname} (missing)", file=sys.stderr)
            continue
        con = sqlite3.connect(path)
        rows = con.execute(f"SELECT sura, aya, text FROM {table}").fetchall()
        con.close()
        for sura, aya, text in rows:
            data.setdefault(sura, {}).setdefault(aya, {})[key] = text or ""
        print(f"{fname}: {len(rows)} rows")

    total = 0
    for surah_id, count in enumerate(AYAH_COUNTS, start=1):
        surah_data = {aya: data.get(surah_id, {}).get(aya, {}) for aya in range(1, count + 1)}
        payload = json.dumps(surah_data, ensure_ascii=False, separators=(",", ":"))
        with open(os.path.join(OUT, f"surah_{surah_id}.json"), "w", encoding="utf-8") as f:
            f.write(payload)
        total += len(payload)
    print(f"wrote 114 files to {OUT} ({total/1024/1024:.1f} MB total)")

    # sanity: empty-meanings count should be 2576 (matches the Android notes)
    empty = sum(1 for s in data.values() for a in s.values() if not a.get("meanings"))
    print(f"empty meanings rows: {empty}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
