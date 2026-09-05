# Quran TV — Data Mirror

Published dataset for the Quran TV apps (SolidJS TV web app + Android TV
WebView wrapper). Consumed read-only at runtime via:

- `https://raw.githubusercontent.com/qurantvdotapp/qurantvdotapp/main/data-mirror/…` (canonical)
- `https://cdn.jsdelivr.net/gh/qurantvdotapp/qurantvdotapp@main/data-mirror/…` (CDN)

Written exclusively by the **timing-studio** publish pipeline
(one atomic Git Data API commit per publish: timing file + reviews + reads +
`timing_index.json` + the reconciled end-user catalog).

## Layout

| Path | Role |
|---|---|
| `catalog/recitations.json` | **End-user catalog** (single source of truth): recitations + audio sources + playable `surahs` + row-level `version` cache key |
| `catalog/*.json` | Suwar/reciters/riwayat reference catalogs (ar/en) |
| `timing_clean/<slug>/<surah>.json` | **Published canonical timing** — flat `[ayah, startMs, endMs, …]` (index 0 = basmala where present) |
| `timing_staged/<slug>/<surah>.json` | Studio drafts (never served to end users; deleted on publish) |
| `timing/reviews.json` | Per (reciter, moshaf, surah) review flags |
| `timing/reads.json` | read_id → name/rewaya/folder_url/slug identity registry |
| `timing/soar/<id>.json` | mp3quran soar metadata |
| `hilites/<mushaf>/<page>.json` | KSU per-ayah highlight coords (hafs/warsh/tajweed) |
| `timing_index.json` | folder_url → {read_id, slug, surahs} index (studio tooling) |

## Notes

- This repo intentionally contains **data only** (no application source).
- Raw URLs serve the branch tip instantly; jsDelivr serves `@main` with its own
  short cache TTL — expect a small propagation delay there.
- Source content attribution: Quran text (Tanzil.info Uthmani), recitation audio
  (mp3quran.net + Archive.org mirrors), mushaf pages (quran.ksu.edu.sa /
  mp3quran.net SVG / islamic.network).
