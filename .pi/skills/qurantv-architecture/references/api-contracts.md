# Verified API Contracts (live-tested 2026-08-07)

All mp3quran endpoints are `https://mp3quran.net/api/v3/...` — **always https**;
plain http 301-redirects (OkHttp follows by default; do not disable).

## mp3quran.net API v3

### Languages (not used by the app)
`GET /api/v3/languages` → `{"language":[{"id":"1","language":"Arabic","native":"العربية", ...}]}`

### Surahs
`GET /api/v3/suwar?language=ar` → `{"suwar":[{"id":1,"name":"الفاتحة","start_page":1,"end_page":1,"makkia":1,"type":0}, ...]}`
- 114 items; `id` = standard surah number; `name` in requested language.

### Riwayat
`GET /api/v3/riwayat?language=ar` → `{"riwayat":[{"id":1,"name":"حفص عن عاصم"}, ...]}`

### Moshaf types
`GET /api/v3/moshaf?language=ar` → `{"riwayat":[{"id":11,"moshaf_type":1,"moshaf_id":1,"name":"حفص عن عاصم - مرتل"}, ...]}`

### Reciters (main catalog)
`GET /api/v3/reciters?language=ar` (optional filters `reciter=`, `rewaya=`, `sura=`)
```json
{"reciters":[{
  "id":231, "name":"هزاع البلوشي", "letter":"H",
  "moshaf":[{
    "id":231, "name":"حفص عن عاصم - مرتل",
    "server":"https://server11.mp3quran.net/hazza/",
    "surah_total":83, "moshaf_type":11,
    "surah_list":"1,6,13,14,15,18,19,20,25,29,30,31,32,34,35,36,37,38,39,40,41,42,44,47,49,50,51,52,53,54,55,56,57,61,63,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114"
  }]
}]}
```
- `GET /api/v3/recent_reads` → same reciter shape (used for the Home row).

### Audio URL rule (verified)
`{moshaf.server}{surah:03d}.mp3` — e.g. `https://server6.mp3quran.net/akdr/001.mp3` → HTTP 200, `content-type: audio/mpeg`. Servers may end with `/` or not, and may contain subdirectories (e.g. `https://server16.mp3quran.net/deban/Rewayat-Qalon-A-n-Nafi/`) — always normalize to a single trailing slash.

### Timing reads (which recitations have per-ayah timing)
`GET /api/v3/ayat_timing/reads` → array (not wrapped):
```json
[{"id":5,"name":"أحمد بن علي العجمي","rewaya":"حفص عن عاصم","folder_url":"https://server10.mp3quran.net/ajm/","soar_count":114,"soar_link":"https://www.mp3quran.net/api/v3/ayat_timing/soar?read=5"}, ...]
```
- `GET /api/v3/ayat_timing/soar?read=<id>` → `[{"id":1,"name":"الفاتحة","timing_link":".../ayat_timing?surah=1&read=5"}, ...]`

### Ayah timing (heart of the highlight)
`GET /api/v3/ayat_timing?surah=<n>&read=<readId>` (both required) — verified for `surah=1&read=5`:
```json
[
 {"ayah":0,"polygon":null,"start_time":0,"end_time":2731,"x":null,"y":null,"page":null},
 {"ayah":1,"polygon":"181.08,18.31 57.54,18.31 57.54,48.94 181.08,48.94","start_time":2731,"end_time":5720,"x":"66.48","y":"34.46","page":"https://www.mp3quran.net/api/quran_pages_svg/001.svg"},
 ...
]
```
- `start_time`/`end_time` are **milliseconds**. `ayah 0` = basmala (no page/polygon — skip highlight; surah 9 has no basmala).
- `page` is an SVG mushaf page URL. **viewBox varies per page** (235×235 early pages; page 187 is `viewBox="0 0 345 550"`) — always parse the real viewBox.

### Linking timing to the catalog (critical)
- Timing `read` id **≠** reciter id. Match `reads[].folder_url` against `moshaf.server` (normalize trailing slashes). Match → ayah sync available. No match → play without sync + “no timing data” notice; never crash.

### Optional endpoints (not in scope, D4)
`/api/v3/radios?language=ar`, `/api/v3/live-tv?language=ar`, `/api/v3/videos?language=ar`, `/api/v3/tafasir`, `/api/v3/tadabor?sura=3&language=ar`

## Quran.com API v4 (same Tanzil-sourced text; fallback/enrichment, no key)

- `GET https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=2` →
  `{"verses":[{"id":...,"verse_key":"2:1","text_uthmani":"...","chapter_id":2,"verse_number":1}, ...]}`
- `GET https://api.quran.com/api/v4/chapters?language=ar` → surah names (Arabic + English via `name_simple`).

## Tanzil Uthmani text (canonical, bundled)

- Source: `https://tanzil.net/pub/download/v1.0/download.php` (POST, params
  `quranType=uthmani&outType=txt-2&agree=true&marks=true&sajdah=true&rub=true&alef=true`).
- Format: one ayah per line, `surah|ayah|text` (e.g. `1|1|بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ`).
- Committed at `app/src/main/assets/quran/quran-uthmani.txt` (~1.3 MB); a Gradle task (`downloadTanzilText`) re-fetches it if missing. License CC BY-NC-ND — attribution shown in Settings → About.

## Tajweed per-ayah images (Color Tajweed style)

- `https://cdn.islamic.network/quran/images/high-resolution/{surah}_{ayah}.png` (e.g. `2_6`) → 1500px-wide PNG with tajweed color rules. Needs `Referer: https://alquran.cloud/`. The image IS the ayah — no coordinate math; highlight is a frame around it.

## Mushaf page SVGs

- mp3quran: `https://www.mp3quran.net/api/quran_pages_svg/{page:03d}.svg` (from timing `page` field). Rendered with AndroidSVG at ~1200px target width (viewBox-scaled), drawn on a white canvas, cached LRU ≤ 6. Polygons/x/y from the timing data are in each page's own viewBox space (varies: 235×235, 345×550).

## Mushaf page source research (2026-08-08)

| Source | Endpoint / URL | Status | Notes |
|---|---|---|---|
| **islamic.app (alquran.cloud ecosystem)** | `https://api.islamic.app/v1/mushaf/page/{page}.svg?font=uthmani&theme=dark&width=1200` | ✅ USED (style “Madinah HD”) | CORS-open, cacheable (24 h), 604 standard Madinah pages (same pagination as timing `page`), viewBox ~1200×1530, every `<tspan>` carries `data-ayah="s:a"` → per-ayah line-band highlights via `IslamicPageBands`. Dark theme fits the app. A small “islamic.app” label is printed top-left (don't crop). |
| Quran.com generated pages | `github.com/quran/quran.com-images` (QCF fonts from King Fahd Complex) | ❌ no public CDN | The repo generates PNGs + glyph bboxes; Quran.com renders text client-side with QCF fonts instead of serving images. |
| Quran Foundation Pages API | `https://apis.quran.foundation/content/api/v4/pages/lookup` + `verses/by_page` | ❌ requires `x-auth-token`/`x-client-id` | Word-level `page_number`/`line_number` data exists but auth-gated; not viable for an open app. |
| alquran.cloud page images | `https://cdn.islamic.network/quran/pages/001.png` | ❌ 403 | Even with Referer; only the per-ayah `images/high-resolution/{s}_{a}.png` (used by the Tajweed style) is open. |
