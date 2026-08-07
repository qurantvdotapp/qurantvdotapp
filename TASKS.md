# Quran TV — Task Tracker & Progress Log

Android TV (Google TV / Chromecast) app: stream Quran surahs from mp3quran.net with
Ayat-KSU-style ayah highlighting (text mode + authentic Madinah mushaf page mode).
Build prompt lives in `PROMPT.md`; this file tracks delivery phases and git progress.

## Status legend

- `[ ]` not started · `[~]` in progress · `[x]` done

## Locked decisions (see PROMPT.md DECISIONS)

| ID | Decision |
|----|----------|
| D1 | Kotlin + Jetpack Compose for TV (`androidx.tv`) + Media3/ExoPlayer |
| D2 | Authentic Uthmani text: bundled Tanzil `quran-uthmani.txt` (canonical) + Quran.com API v4 fallback; pages = mp3quran SVG (authentic Madinah mushaf) |
| D3 | Arabic primary (RTL) + English secondary |
| D4 | Core scope only: Reciters → Surahs → Player + highlight |
| D5 | All riwayat, ayah sync best-effort where timing exists |
| D6 | Emulator-first verification → sideload to real Chromecast with Google TV |

## Git workflow (implemented)

- Repo initialized on `main`; initial commit contains `PROMPT.md`, `TASKS.md`, `.gitignore`.
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
- Each phase: work on `phase/N-<name>` branch → merge to `main` → update this file → commit.
- Never commit build outputs / IDE files / local.properties (`.gitignore` covers them).

---

## Phase 0 — Bootstrap (done)

- [x] Scaffold build prompt (`PROMPT.md`) with verified mp3quran API contracts (live-tested endpoints, audio URL rule, timing format, SVG 235×235 coordinate space)
- [x] Lock decisions D1–D6 (authentic Tanzil Uthmani text, emulator-first)
- [x] Create task tracker (this file)
- [x] `git init` + `.gitignore` + initial commit

## Phase 1 — Skeleton + catalog

- [ ] Gradle project scaffold (version catalog `libs.versions.toml`, wrapper) → `./gradlew :app:assembleDebug` green
- [ ] Compose for TV theme (tv-foundation / tv-material), shared focus modifiers (scale ~1.1 + border)
- [ ] Navigation shell: single activity, back-stack Home → Surah list → Player
- [ ] API layer: `Mp3QuranApi` (suwar, riwayat, moshaf, reciters, recent_reads, ayat_timing/reads, /soar, /ayat_timing) + DTOs; OkHttp + kotlinx-serialization (or Retrofit/Moshi)
- [ ] Disk JSON cache + single-flight loading; defensive parsing (trailing commas in `surah_list`)
- [ ] Home screen: Continue-listening card + Reciters A–Z rail (using API `letter` field)
- [ ] Surah grid screen: only available surahs; moshaf picker dialog for multi-moshaf reciters
- [ ] Focusable loading / error / empty states with Retry
- [ ] Unit tests: `surah_list` parsing, URL construction (trailing-slash normalization)
- [ ] Commit: `feat: phase 1 — catalog browsing`

## Phase 2 — Player + streaming

- [ ] Player screen scaffold: top bar (surah/reciter/moshaf), transport bar, state hoisting, stable keys
- [ ] Media3 ExoPlayer streaming from `{server}{surah:03d}.mp3`
- [ ] Play/pause, seek ±5s (D-pad), playback speed 0.5×–2.0×
- [ ] Next/prev surah
- [ ] Remote media keys (play/pause) via media3 session
- [ ] Audio focus handling (pause on transient loss)
- [ ] Stream error → focused Retry state
- [ ] Commit: `feat: phase 2 — audio playback`

## Phase 3 — Text mode sync

- [ ] Tanzil Uthmani asset: Gradle download task (skip if present) + parser → `verse_key` index (`"2:1"` → text)
- [ ] Timing fetch per `(read, surah)` + on-disk cache (immutable → cache forever)
- [ ] Read ↔ moshaf matching via `folder_url` ↔ `server` (normalized); enable sync only when matched
- [ ] Position ticker (~200ms) + binary search `start_time ≤ pos < end_time`; state updates only on ayah change (no full-list recomposition)
- [ ] Text mode: current ayah highlighted + auto-scroll (center), select-ayah → seek
- [ ] Repeat modes: off / repeat ayah (seek to start on end) / repeat surah (seek 0 on ended)
- [ ] Continue-listening persistence (DataStore: last reciter/moshaf/surah/ayah/position, throttled writes)
- [ ] Basmala handling: timing `ayah 0` = basmala (skip highlight), surah 9 none, offset mechanism for non-Hafs riwayat (validate on surahs 1–2)
- [ ] Unit tests: timing binary search, basmala offset logic
- [ ] Commit: `feat: phase 3 — ayah-synced text mode`

## Phase 4 — Mushaf page mode

- [ ] SVG page fetch + AndroidSVG rendering (`com.caverock:androidsvg`) to Picture/Bitmap
- [ ] Polygon → screen mapping: `screen = pageSpace * W / 235` (viewBox `0 0 235 235`, verified)
- [ ] Highlight: rounded translucent rect from polygon quad; `x`/`y` marker fallback; skip null polygon (basmala)
- [ ] Auto page-turn when ayah crosses page boundary; prefetch next page
- [ ] LRU page bitmap cache (≤6 pages); release on nav away
- [ ] Mode toggle (text ↔ page) on-screen + remote shortcut; persist choice
- [ ] Unit tests: coordinate mapping
- [ ] Commit: `feat: phase 4 — mushaf page highlight`

## Phase 5 — Polish

- [ ] Settings: language ar/en, default speed, text font size, highlight color
- [ ] Offline polish (airplane-mode pass: cached browse, audio failure → Retry)
- [ ] Media session polish + optional background audio service (FOREGROUND_SERVICE_MEDIA_PLAYBACK)
- [ ] `README.md`: prerequisites, build, emulator setup, sideload to Chromecast with Google TV, manual test checklist, Tanzil attribution
- [ ] Acceptance checklist sign-off (PROMPT.md Part 13) on emulator
- [ ] Lint + all unit tests pass; performance pass on TV emulator (no jank during highlight ticks)
- [ ] Real-device verification list handed to user (remote keys, focus feel, perf on actual TV)
- [ ] Commit: `feat: phase 5 — polish & release`

---

## Cross-phase concerns

- **10-foot UI**: D-pad only; visible focus (scale 1.05–1.1 + border); text ≥20sp body / 28sp headings; overscan margins ~48dp; media keys wired.
- **Performance**: no per-tick recomposition of the whole list (hoist current-ayah state, stable keys); page bitmap cache ≤6; `hardwareAccelerated`; no blur/heavy shadows on low-end.
- **Authenticity**: text = Tanzil Uthmani (CC BY-NC-ND, attribution in About); page images = mp3quran SVG (authentic Madinah mushaf).
- **Arabic RTL** mandatory; English via resources.

## Known gotchas (from PROMPT.md Part 14)

- Timing `read` id ≠ reciter id → match `folder_url` ↔ `server` (trailing slashes normalized).
- `ayah 0` = basmala, `polygon`/`page` null → skip highlight; surah 9 has no basmala.
- `surah_list` is comma-separated, may end with `,`, may be a subset (e.g. 83/114) → only list available.
- Server URLs may contain subdirectories (`.../deban/Rewayat-Qalon-A-n-Nafi/`) → normalize then concatenate `{server}{surah:03d}.mp3`.
- Warsh-style riwayat may count basmala as verse 1 → offset mechanism (validate surahs 1–2).

## Progress log

| Date | Phase | What | Status |
|------|-------|------|--------|
| 2026-08-07 | 0 | Bootstrap: build prompt (verified API contracts), decisions locked, tracker + git init | done |
