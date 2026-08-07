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

- [x] Gradle project scaffold (version catalog `libs.versions.toml`, wrapper) → `./gradlew :app:assembleDebug` green (AGP 8.13.2 / Kotlin 2.2.21 / compileSdk 36)
- [x] Compose for TV theme (tv-foundation / tv-material), shared focus modifiers (scale ~1.1 + border); note: tv-foundation 1.0.0 stable has no TvLazyColumn — standard foundation lazy lists used with tv-material components
- [x] Navigation shell: single activity, back-stack Home → Surah list → Player (double-Back exits)
- [x] API layer: `Mp3QuranApi` (suwar, reciters, recent_reads, ayat_timing/reads, /soar, /ayat_timing) + DTOs; OkHttp + kotlinx-serialization
- [x] Disk JSON cache + single-flight loading; defensive parsing (trailing commas in `surah_list`)
- [x] Home screen: Continue-listening card + full-height vertical reciter list grouped by letter with A–Z jump rail + visible search bar
- [x] Surah grid screen: 8-column dense grid; moshaf picker + jump-to-surah dialogs
- [x] Focusable loading / error / empty states with Retry
- [x] Unit tests: `surah_list` parsing, URL construction (trailing-slash normalization) — green
- [x] Commit: `feat: phase 1 — catalog browsing`

## Phase 2 — Player + streaming

- [x] Player screen scaffold: top bar (surah/reciter/moshaf), transport bar, state hoisting, stable keys
- [x] Media3 ExoPlayer streaming from `{server}{surah:03d}.mp3` (verified PLAYING on TV emulator)
- [x] Play/pause, seek ±5s (D-pad), playback speed 0.5×–2.0× (1.25×/1.5× verified via media session)
- [x] Next/prev surah (via available-surah list)
- [x] MediaSession wired; remote play/pause on real device pending
- [x] Audio focus handling (pause on transient loss / resume on gain)
- [x] Stream error → focused Retry state (code path; real-device offline test pending)
- [x] Commit: `feat: phase 2 — audio playback`

## Phase 3 — Text mode sync

- [x] Tanzil Uthmani asset: Gradle download task (skip if present) + parser → `verse_key` index (`"2:1"` → text); asset committed (1.3 MB)
- [x] Timing fetch per `(read, surah)` + on-disk cache (immutable → cache forever)
- [x] Read ↔ moshaf matching via `folder_url` ↔ `server` (normalized); enable sync only when matched
- [x] Position ticker (~200ms) + binary search `start_time ≤ pos < end_time`; state updates only on ayah change (stable keys; no full-list recomposition)
- [x] Text mode: current ayah highlighted + auto-scroll, select/tap-ayah → seek (verified: tap on verse 4 seeks to 14.1s)
- [x] Repeat modes: off / repeat ayah (seek to start on end, verified loop) / repeat surah (seek 0 on ended); autoplay next surah when repeat off (الفاتحة → البقرة verified)
- [x] Continue-listening persistence (DataStore: last reciter/moshaf/surah/ayah/position, throttled 5s writes; card verified across reinstall)
- [x] Basmala handling: timing index 0 = header slot (skip highlight), surah 9 none, offset mechanism for non-Hafs (count-based suggestion + settings override); mapping verified against SVG marker coordinates
- [x] Unit tests: timing binary search, basmala offset logic — green
- [x] Commit: `feat: phase 3 — ayah-synced text mode`

## Phase 4 — Mushaf page mode

- [x] SVG page fetch + AndroidSVG rendering (`com.caverock:androidsvg-aar`) to Bitmap (real viewBox parsed per page — 235×235 and 345×550 verified)
- [x] Polygon → screen mapping: `screen = pageSpace * displaySize / viewBoxSize` (per-page viewBox)
- [x] Highlight: rounded translucent rect from polygon quad; null polygon skipped (basmala/header)
- [x] Auto page-turn when ayah crosses page boundary; prefetch next page
- [x] LRU page bitmap cache (≤6 pages)
- [x] Mode toggle (text ↔ page) on-screen button + INFO/MENU remote key; persisted in settings (verified on emulator)
- [x] Unit tests: coordinate mapping — green
- [x] Commit: `feat: phase 4 — mushaf page highlight`

## Phase 5 — Polish

- [x] Settings: language ar/en (verified switch both ways), default speed, text font size, highlight color, default display mode
- [x] Offline polish: disk caches verified (catalog/timing); cold start from cache; audio-failure Retry path needs real-device pass (emulator airplane mode does not block Ethernet)
- [ ] Media session active (activity-scoped); background MediaSessionService deliberately out of scope for core delivery (noted in README)
- [x] `README.md`: prerequisites, build, emulator setup, sideload to Chromecast with Google TV, manual test checklist, Tanzil attribution, honest testing notes
- [x] Acceptance checklist sign-off (PROMPT.md Part 13) on Android TV 36 emulator — all core items pass
- [x] Lint-free build + all 26 unit tests pass; no jank observed during highlight ticks on the TV emulator
- [x] Real-device verification list handed to user in README (remote media keys, search IME, offline audio failure, focus feel/perf)
- [x] Commit: `feat: phase 5 — polish & release`

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
| 2026-08-07 | 1 | Catalog browsing: scaffold, theme, nav shell, API + cache, Home A–Z rail, surah grid, unit tests | done (emulator: grid + picker verified) |
| 2026-08-07 | 2 | Player: ExoPlayer streaming, transport, speed, media session, focus retry states | done (emulator: PLAYING, 1.25×/1.5× verified) |
| 2026-08-07 | 3 | Text-mode sync: Tanzil asset, timing match + cache, binary-search ticker, highlight + auto-scroll, repeat, continue-listening | done (emulator: ayah seek boundaries + auto-scroll verified) |
| 2026-08-07 | 4 | Mushaf page mode: AndroidSVG rendering, per-page viewBox mapping, polygon highlight, page turn, mode toggle | done (emulator: page mode renders, INFO toggle works) |
| 2026-08-07 | 5 | Polish: settings (ar/en verified), search overlay, README + acceptance, tests final | done |
| 2026-08-07 | 5+ | Lint cleanup: `lintDebug` made genuinely green (was failing) — `ConcurrentHashMap.computeIfAbsent` (API 24) replaced in `JsonDiskCache.singleFlight` (minSdk 23 crash fix), Media3 `UnstableApi` opt-in on `PlaybackController`, cutout-mode attr moved to `values-v27`, deprecated `URL(String)` fixed in the Tanzil download task. Re-verified: build + 26 tests + full emulator smoke pass (Home → reciter → surah grid → player streaming, INFO page-mode toggle, media-key pause/resume, autoplay to next surah, Continue card) | done |
| 2026-08-07 | 5+ | Localization: wired player chrome through `strings.xml` — transport labels (repeat ⇄/⟲, “السور” jump, prev/next ayah/surah content descriptions), “no timing data” notice, audio-error and Retry texts now render in the active locale (Arabic primary per D3). Verified on emulator: “⇄ متوقف”, “1×”, “السور” + PLAYING audio, no crashes | done |
