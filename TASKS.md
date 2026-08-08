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
| 2026-08-07 | meta | Added reusable skill `.pi/skills/qurantv-architecture/` — architecture map, source-by-source guide, verified API contracts (references/api-contracts.md), core algorithms, caching/offline, localization, build/test/emulator workflow, gotchas, and refinement playbooks. Loadable in future sessions via skill name `qurantv-architecture` | done |
| 2026-08-07 | 5+ | Sync hardening: (1) `TimingIndex` no longer advances the highlight into the next ayah during inter-ayah gaps (unit test added); (2) ticker 200→100 ms + immediate highlight refresh after every seek; (3) repeat-ayah uses the mp3 duration as the last ayah's effective end; (4) long-ayah follow: text mode now pins the current ayah to the viewport top on every change and, when the ayah is taller than the viewport, scrolls through it proportionally to playback progress inside the ayah (backs off on manual scroll until the next ayah). Verified on emulator: Hafs read-13 surah-2 boundaries EXACT within one tick (60–80 ms) over 100+ s, no drift; 51 s Warsh ayah followed without crash. | done |
| 2026-08-07 | 5+ | Basmala handling restored per user: the recited basmala (timing index 0) is shown again as a highlighted surah header above the verse list (every surah starts with it except Al-Tawbah 9; surah 1's 1:1 is the basmala itself). Tanzil's embedded basmala prefix is stripped from verse 1 of surahs 2–114 so text matches audio 1:1 — this fixes the reported voice-1-ayah-ahead-of-text desync. Also fixed a broken `else-if` branch that had rendered the Tajweed overlay inside text mode. Verified on emulator: surah 2 shows basmala header + verse 1 “الم”, surah 1 shows no header (1:1 = basmala), list pinned to top, audio audible (emulator must NOT be started with `-no-audio`) | done |
| 2026-08-07 | 5+ | **Off-by-one highlight fix**: mp3quran timing data has two shapes — some reads include a timing index-0 basmala entry (list position == timing index), others omit it entirely (entries start at 1). `TimingIndex.ayahAt` returned the list position, so reads without index 0 highlighted one ayah behind the voice. Fix: `ayahAt` now returns the entry's true timing index; all lookups go through `SurahTiming.entryFor(ayah)` (by-timing-index map) instead of `entries.getOrNull(listPos)`; `buildTextItems` row count derives from `lastAyahIndex + 1` so the final verse is never dropped. Verified live on read 17 surah 50 (no index 0): boundaries EXACT within one tick for ayahs 32–35, highlight row pinned to the recited verse; 30/30 unit tests (3 new: no-index-0 shape, entryFor, missing-basmala) | done |
| 2026-08-08 | 5+ | **Mushaf page = default ayah view + maximized**: (1) `displayMode` default is now 1 (mushaf page mode) on fresh installs — the SVG page is the primary view; (2) page mode maximizes the mushaf: top bar + transport auto-hide ~4 s after the last key while playing and the SVG goes full-bleed; any key reveals the chrome (fullscreen page holds focus so D-pad still works), DPAD_LEFT/RIGHT scrubs ±5 s while hidden, pause reveals chrome, INFO/MENU still toggles text mode. | done |
| 2026-08-08 | 5+ | **Second mushaf page source: islamic.app Madinah pages (style “Madinah HD”)**. Researched sources — islamic.app `https://api.islamic.app/v1/mushaf/page/{page}.svg` (CORS-open, 604 standard Madinah pages, per-ayah `data-ayah` tspans, dark theme, 1.45 aspect) ✓ usable; Quran.com image generator (quran/quran.com-images, QCF fonts) ✗ no public CDN; Quran Foundation pages API ✗ requires auth token; alquran.cloud page images ✗ 403. Same standard Madinah pagination as the mp3quran timing `page` field, so page auto-turn syncs unchanged; per-ayah highlight comes from `IslamicPageBands` (DOM-extracted line bands from the page's own data-ayah tspans, unit tested) instead of mp3quran polygons. Style cycle now 0→1→2 (م → ﷽ → HD) via top-bar button or Settings. Verified on emulator: pages 3/4/5 load + auto-turn with the audio, 11/8/5 ayahs indexed per page, chrome hidden fullscreen. 32/32 tests + lint green | done |
| 2026-08-08 | 5+ | **KSU (Ayat) Hafs + Warsh mushaf pages (styles “آيات حفص”/“آيات ورش”)**. Source: quran.ksu.edu.sa (the Ayat KSU reference app) — Hafs pages `ayat/safahat1/{page}.png` (456×672), Warsh pages `warsh/{page}.png` (620×1005), both verified live 200 OK. Hafs pagination verified == standard Madinah == timing `page` field (2:1→2, 2:6→3, 2:255→42, 50:1→518 ✓); Warsh uses its own pagination — the page boundaries are bundled as `KsuWarshPageData` (generated from quran.ksu.edu.sa quran-data.js, Tanzil-sourced facts, 604 pages) with a binary-search `warshPageFor(surah, ayah)`. Raster PNGs have no per-ayah coordinates → highlight = bottom ayah-text strip (semi-transparent) + page-level auto-turn. Style cycle now 0..4 (م ﷽ HD KS WS). Verified on emulator: h5 (456×672) and w5 (620×1005) load, correct page for the playing verse. 35/35 tests + lint green | done |
| 2026-08-08 | 5+ | **Ayah highlighting in ALL mushafs + Hafs Tajweed full-page mushaf + emulator fullscreen**. (1) KSU raster styles now render a real per-ayah highlight: `PageAyahEstimator` (domain, unit-tested) estimates each ayah's band from its text length / the page's total text length — the Madinah mushaf lays text out proportionally, so long ayahs get tall bands, short ones short bands; surah-start pages reserve the header. `PageModeView` gained a fractional-band mode; the old bottom text strip is gone. (2) New style “حفص ملون” (Hafs Tajweed, style 5): KSU full-page tajweed mushaf `tajweed_png/{page}.png` (456×707) with its OWN pagination (Page2 — 25 pages differ from Hafs) bundled as `KsuTajweedPageData`. Style cycle 0..5 (م ﷽ HD KS WS TJ). (3) Emulator fullscreen: `scripts/emulator-fullscreen.py` drives the window via EWMH `_NET_WM_STATE_FULLSCREEN` (python-Xlib; xfwm4 honors the direct-to-window variant) — verified 2560×1440 edge-to-edge; `run-emulator.sh` calls it automatically. Verified on emulator: Warsh page 9 + Tajweed page T9 load with estimated bands (4 ayahs), fullscreen applied. 38/38 tests + lint green | done |
| 2026-08-08 | 5+ | **EXACT KSU line bands from the site's own hilites API**. Discovered `interface.php?ui=pc&do=hilites&mosshaf=<hafs|warsh|tajweed>&t=28&page=<p>` → `{"p": {"s_a": [x, y], ...}}` — the same data the KSU website renders. Reverse-engineered the coordinate space empirically (segmented the tajweed page-9 image into its 17 lines; the API y-values land EXACTLY on lines 3/5/8/15 within ±1 px) → the values are in the page image's NATIVE pixel space (hafs 456×672, warsh 620×1005, tajweed 456×707) — no scaling needed. `KsuHiliteBands.build()` converts y to fraction-of-height bands [y_k, y_{k+1}) (last ayah to page bottom); `KsuHilitesRepository` fetches + caches forever (JsonDiskCache category `ksu_hilites`) with next-page prefetch; `PageAyahEstimator` remains the offline/fallback path. Verified on emulator: tajweed page 188 (9:7–13, 7 ayahs — matches the API exactly) and warsh page 188 both log `EXACT bands`; 40/40 tests + lint green | done |
| 2026-08-08 | 5+ | **Corrected KSU highlight semantics — the site's real hilitePage() algorithm**. Reading `engine.js` closely: the hilites values are where each ayah **ENDS** (not starts), and ayah *k*'s highlight spans from where ayah *k−1* ended to where *k* ends, drawn as up to THREE rectangles: the tail of the previous line (from the left margin to the previous end-x, i.e. this ayah's first partial line), this ayah's last partial line (from its end-x to the right margin), and the full-width block of complete lines between them; same-line ayahs collapse to a single rect. The per-mushaf layout constants (`_hlMeta`) and the special opening-spread layout for pages 1–2 (`prev_top=270`, fp_* overrides) are honored; mid-page surah starts add `fasel_sura`. Implemented as `KsuHiliteGeometry` (domain, 4 unit tests incl. verified tajweed page-9 data and the same-line 1:3/1:4 collapse); `KsuHiliteBands` deleted. `PageModeView` now draws the multi-rect highlight. Verified on emulator: warsh page 192 (9:32–36 = 5 ayahs, matches the API) logs `EXACT rects`; 42/42 tests + lint green | done |
| 2026-08-08 | 5+ | **Real-mushaf two-page spread + page-turn + mushaf picker in the transport bar**. (1) The page view now shows a TWO-PAGE spread like a real mushaf: odd page on the RIGHT, next even page on the LEFT (same layout rule the KSU site uses — `page % 2` → right/left container), forced RTL so it never flips in English locale. `MushafSpreadView` (AnimatedContent keyed on the spread's right-page number): spread changes animate as a page turn (slide-in from the right + fade, reversed when going back), while the highlight moving between the two sides (same spread) is instant. The spread loader consolidates the three page sources — mp3quran SVG, islamic.app, KSU raster — into one `loadSpreadSide()` per side (highlight only on the current-ayah side) with next-spread prefetch. (2) Mushaf selection moved from the top bar into the LOWER transport bar: a compact button showing the current style (م/﷽/HD/KS/WS/TJ) opens a `MushafPickerDialog` (6 styles, D-pad list). (3) Transport buttons compacted (icons 24–34dp, labelMedium, narrower seek bar) so the mushaf keeps more screen. Verified on emulator: tajweed spread (pages 212+213 with exact rects), islamic HD spread (213 right + 214 left + prefetch 215/216), picker dialog opens from the transport and switches styles. 42/42 tests + lint green | done |
| 2026-08-08 | 5+ | **HD (islamic.app) highlight precision — RTL + baseline fixes**. User reported RTL issues and an upward-shifted line band on the HD mushaf. Diagnosis: (a) proved AndroidSVG renders RTL correctly (a بِسْمِ ۝٣٤ probe rendered the ۝٣٤ marker on the LEFT, identical to rsvg — the embedded ayah-end markers are fine); (b) the real bugs were the highlight BANDS: the SVG `<text y>` is the text BASELINE (glyphs sit above it), so the old `(y, y+1.35×font)` band was shifted off the text; and full-width bands bled into the next ayah's text on shared lines. Fix: `IslamicPageBands` now parses structured lines (baseline, font size, anchor, ordered tspans with their ayah keys and text) and `IslamicHiliteRects` computes exact per-ayah rects — same region logic as the KSU site (first partial line from the line's left edge to the previous ayah's end, full middle lines, last partial line from the ayah's end — the embedded ۝ number — to the line's right edge; same-line ayahs collapse to one rect), with tspan text widths measured via Paint (injected `measure` lambda keeps the algorithm pure). Vertical band = baseline − 0.95×font … baseline + 0.35×font (covers the glyphs). Verified on emulator (pixel analysis): the gold highlight now overlaps the text rows exactly on the correct spread side and ends at the ayah number. 43/43 tests + lint green | done |
| 2026-08-08 | 5+ | **HD mushaf text RTL — tspan merging + UI refinements**. (1) The RTL report was real after all, but the bug was AndroidSVG laying MULTIPLE tspans per line in LTR order (each tspan's internal bidi is fine — a single-tspan probe matched rsvg — but a multi-tspan line rendered its first tspan on the LEFT; `direction=rtl` has no effect, verified). The ayah-end markers (۝+digits) are the last tspan content, so they landed on the wrong side. Fix: `IslamicNetworkPageLoader` merges each line's tspans into one for RENDERING (a single drawText lets Android's bidi lay the whole RTL line out correctly — verified by probe: merged 'ألف ألف ألف باء باء' renders ألف on the right) while the ORIGINAL structure is still parsed for the highlight geometry (whose cumulative-width math matches the RTL layout). (2) Seek bar removed from the transport (it grabbed D-pad focus needlessly) — seeking is via prev/next ayah + surah buttons; a plain non-focusable time readout (`30:37 / 45:52`) remains; the hidden-chrome ±5s scrub was removed too. (3) Mushaf chooser simplified: the transport button shows the localized style NAME (المدينة / التجويد / المدينة HD / آيات حفص / آيات ورش / حفص ملون) and the dialog lists each style with a hint + ✓ on the current one, immediate select. (4) The two pages are joined by a folded SPINE (leather-toned vertical ribbon + inner-edge shadows) like a real mushaf. (5) Control-bar auto-hide: delay 4s → 8s, and a new eye toggle in the transport (autoHideControls, persisted in DataStore) disables auto-hide entirely. Verified on emulator: transport shows the time readout only, spine renders between the pages, 8s hide + toggle works (chrome persists with auto-hide off). 43/43 tests + lint green | done |
| 2026-08-08 | 5+ | **Auto-hide timer resets on every button press + chooser hint removed**. (1) The 8s countdown now resets on EVERY key press (a `lastKeyPress` counter bumps in the screen-level key handler and keys the hide LaunchedEffect), so navigating through the transport buttons never hides the chrome mid-interaction; it only hides after 8s of no input. Verified on the emulator with an A/B pixel test (chrome visible right after a key; fullscreen page with the gold highlight after 9s of silence; periodic presses keep it visible). (2) The redundant per-row hint under each mushaf name in `MushafPickerDialog` is removed (the rows show just the name + ✓). 43/43 tests + lint green | done |
| 2026-08-08 | 5+ | **Timing speed correction for compressed reads (عبدالرحمن السويّد / Al-Kahf)**. User reported mushaf↔voice sync off in Surah Al-Kahf for عبدالرحمن السويّد (read 135). Diagnosis: for this read the mp3quran per-ayah timing is systematically ~12% SHORTER than the actual mp3 — surah 18 timing total 1440.5 s vs mp3 1644.4 s (ratio 1.142), surah 2 timing 6039 s vs mp3 6757 s (1.119); verified reads 5/13/17 are 1.000 (timing matches audio exactly). The timing is a uniform compression of a faster rendition, so the highlight drifted progressively AHEAD of the voice (up to ~200 s / 3+ min by the end of a long surah). Fix: `TimingCorrection` (domain, 3 unit tests) computes the linear ratio from the mp3 duration and the timing's last end (clamped 0.80..1.25, ignored under 1.03) and `PlaybackController` maps every playback position into timing space (`pos / ratio`) in the ticker, after seeks, and at resume — recomputed per surah once the mp3 duration is known. Verified on the emulator (resumed the user's own session: السويّد • الكهف): log shows `timing correction 1.142 (mp3 1644s vs timing 1440s)`, and the app's ayah transitions land within 0.1–0.2 s of the corrected timing windows (previously ~5–6 ayahs ahead). 46/46 tests + lint green | done |
| 2026-08-08 | 5+ | **Never estimate ayah sync — unreliable timing shows the surah's first page statically**. User directive: don't estimate ayah start/duration; if the reciter has no exact timings, show the first page of the surah and don't track progress. Replaced the linear speed-correction (`TimingCorrection`) with a reliability check (`TimingAccuracy`): once the mp3 duration is known, it must match the timing's last end within 2%; otherwise the timing is treated as absent — sync is disabled (hasTiming=false, no ayah tracking, no page turn) and the player shows the surah's FIRST page statically (surah.startPage for standard pagination; `warshPageFor(s,1)`/`tajweedPageFor(s,1)` for Warsh/Tajweed) with the “لا يوجد توقيت” notice. Verified on the emulator with read 137 (stretched, ratio 0.788): log `timing unreliable (mp3 5873s vs timing 7458s) — sync disabled`; the spread shows T1+T2 (Al-Baqarah's first page) with no highlight and no page turn over 25 s of playback; text mode shows the verse list without highlight. 47/47 tests (TimingAccuracyTest replaces TimingCorrectionTest) + lint green | done |
| 2026-08-08 | 5+ | **Home auto-scroll to top during playback fixed**. HomeScreen's initial-focus LaunchedEffect was keyed on `ui.lastSession`, which updates every ~5 s while playing (session save loop), so it re-requested focus on the Continue card and yanked the reciter list to the top; keyed on `ui.lastSession?.surahId` (the session's identity) so content updates no longer re-trigger it. Verified on the emulator: with السويّد الكهف playing, scrolled to the و group, waited 8 s — the list stayed put. | done |
