---
name: qurantv-architecture
description: Architecture reference and refinement workflow for the Quran TV Android TV app (mp3qurantv repo, Kotlin + Compose for TV + Media3). Use when extending, debugging, refactoring, or reviewing this codebase — screens and navigation, data flow, verified mp3quran.net/Quran.com API contracts, ayah timing/sync algorithm, mushaf page coordinate math, caching/offline strategy, settings persistence, localization, and the build/test/emulator verification workflow.
---

# Quran TV — Architecture & Refinement Guide

Android TV / Google TV app streaming Quran surah audio from mp3quran.net with
Ayat-KSU-style ayah highlighting (text mode + authentic Madinah mushaf page
mode). Single-activity Jetpack Compose for TV (`androidx.tv`), Media3 ExoPlayer.
100% D-pad/remote driven. Arabic primary (RTL), English secondary.

Read [`PROMPT.md`](PROMPT.md) for the full product spec and
[`TASKS.md`](TASKS.md) for the delivery tracker (all phases 1–5 done).

**Verified API contracts** (mp3quran v3, Quran.com v4, Tanzil, tajweed CDN,
page SVGs — all live-tested): see [references/api-contracts.md](references/api-contracts.md).

---

## 1. Locked decisions (do not re-decide)

| ID | Decision |
|----|----------|
| D1 | Kotlin + Jetpack Compose for TV (`androidx.tv:tv-foundation`, `tv-material`) + Media3/ExoPlayer |
| D2 | Authentic Uthmani text: bundled Tanzil `quran-uthmani.txt` (canonical) + Quran.com API v4 fallback; pages = mp3quran SVG (authentic Madinah mushaf) |
| D3 | Arabic primary (RTL) + English secondary via resources |
| D4 | Core scope only: Reciters → Surahs → Player + highlight. No radio/live TV/tafsir |
| D5 | All riwayat, ayah sync best-effort where timing exists, graceful degradation |
| D6 | Emulator-first verification (Android TV AVD) → sideload to real Chromecast with Google TV |

## 2. Stack & versions

- Kotlin 2.2.x, AGP 8.13.x, compileSdk/targetSdk 36, **minSdk 23** (lint gate must stay clean for API 23)
- Compose for TV: `androidx.tv:tv-foundation` + `androidx.tv:tv-material` 1.0.x (standard lazy lists; **tv-foundation 1.0.0 has no TvLazyColumn** — use foundation lazy lists with tv-material components)
- Media3 ExoPlayer 1.10.x (`media3-exoplayer`, `media3-common`, `media3-session`, `media3-datasource-okhttp`)
- OkHttp + kotlinx-serialization (no Retrofit), Coil (+ coil-svg) listed but AndroidSVG (`com.caverock:androidsvg`) is what actually renders page SVGs
- `androidx.datastore-preferences` (settings + session), manual constructor DI (`AppContainer`), coroutines + Flow, version catalog `gradle/libs.versions.toml`

## 3. Source map (`app/src/main/java/com/qurantv/app/`)

```
MainActivity.kt            single activity; attachBaseContext wraps locale; setContent → QuranTvRoot
QuranTvApp.kt              Application; owns AppContainer
LocaleManager.kt           runtime ar/en locale WITHOUT AppCompat (SharedPreferences mirror for attachBaseContext)
di/AppContainer.kt         manual DI singleton factory (all repos, PlaybackController, loaders, navigator)
navigation/AppNavigator.kt hand-rolled back stack: Home → SurahGrid → Player, replaceTop for moshaf change
domain/                    PURE Kotlin, no Android deps → unit tested
  Models.kt                Reciter, Moshaf, QuranSurah, TimingRead, AyahTiming, SurahTiming, PointF,
                           PageAyahBand (fractional highlight band for estimates/fallbacks)
  CatalogParsing.kt        surah_list parsing, server URL normalization, audio URL rule, polygon parse
  TimingIndex.kt           binary-search ayah locator (playback position → TIMING index, not list pos)
  TimingCorrection.kt      linear timing↔audio speed correction (compressed reads, e.g. read 135)
  BasmalaOffset.kt         timing index ↔ verse key mapping (+ non-Hafs riwayat offset)
  PageMapping.kt           SVG viewBox parsing + page-space → screen-space mapping
  KsuWarshPageData.kt      Warsh mushaf pagination (page → first ayah, binary search)
  KsuTajweedPageData.kt    Tajweed (Page2) mushaf pagination
  PageAyahEstimator.kt     text-length band estimate (offline fallback for KSU pages)
  KsuHiliteGeometry.kt     the KSU site's hilitePage() algorithm → per-ayah rects (+ per-mushaf Meta)
  IslamicPageBands.kt      islamic.app SVG → structured lines (baseline, font, anchor, ordered tspans)
  IslamicHiliteRects.kt    islamic.app per-ayah rects (same region logic as KSU; injected width lambda)
data/api/
  ApiClient.kt             thin OkHttp wrapper (all calls on Dispatchers.IO, User-Agent set)
  Mp3QuranApi.kt           mp3quran.net API v3 client + DTO→domain mappers (defensive)
  QuranComApi.kt           api.quran.com API v4 client (chapters, verses/uthmani)
  Dtos.kt                  all @Serializable DTOs (@SerialName snake_case)
data/cache/JsonDiskCache.kt atomic tmp-file writes, TTL 24h catalog / forever timing+text+hilites, per-key single-flight
data/repo/
  CatalogRepository.kt     surahs (ar+en merged), reciters, recent_reads — disk cached
  TimingRepository.kt      reads list + per-(read,surah) timing, folder_url↔server matching
  QuranTextRepository.kt   Tanzil asset map (verse_key→text + verseTextLength) + Quran.com fallback
  SessionRepository.kt     DataStore: AppSettings (incl. autoHideControls) + LastSession
  KsuHilitesRepository.kt  KSU per-ayah hilites API + disk cache (forever)
player/
  PlaybackController.kt    app-scoped ExoPlayer + MediaSession + audio focus + 100ms ticker
  RepeatMode.kt            OFF / AYAH / SURAH
ui/
  QuranTvRoot.kt           shell: theme, RTL direction, back handling, screen switch
  theme/Theme.kt           tv-material night palette (gold/green/cyan on deep navy); SurfaceContainer* shims
  components/Common.kt     TvCard, TvIconButton (scale+border focus), Loading/Error/Empty states
  components/SurahJumpDialog.kt
  components/MushafPickerDialog.kt  style chooser (name + ✓ on current, immediate select)
  home/                    HomeScreen (header, search bar, Continue card, A–Z rail + reciter rows),
                            HomeViewModel, SearchOverlay
  surahs/                  SurahGridScreen (8-col grid, moshaf picker), SurahGridViewModel
  player/                  PlayerScreen, PlayerViewModel, TextModeList, TransportBar (no seek bar),
                            MushafSpreadView (two-page spread + spine + page-turn animation),
                            PageModeView (single page renderer; alignment param),
                            PageImageLoader (mp3quran AndroidSVG→Bitmap),
                            IslamicNetworkPageLoader (islamic.app SVG: tspan-merge for RTL + rects),
                            KsuPageLoader (KSU hafs/warsh/tajweed PNGs),
                            TajweedAyahView, AyahImageLoader (islamic.network CDN)
  settings/                SettingsScreen, SettingsViewModel
res/                       values/ + values-ar/ strings.xml, colors, themes (values-v27 cutout mode),
                           drawable ic_launcher + tv_banner
assets/quran/quran-uthmani.txt   Tanzil text committed (~1.3 MB); Gradle task re-downloads if missing
scripts/run-emulator.sh     boot TV AVD with audio + install/launch + fullscreen
scripts/emulator-fullscreen.py  EWMH _NET_WM_STATE_FULLSCREEN via python-Xlib
```

## 4. Data flow per screen

**Home**: `HomeViewModel.loadCatalog()` → `CatalogRepository.reciters("ar")` (disk-cached, 24h TTL, single-flight) → grouped by `letter` → vertical list of one `LazyRow` chip-row per letter + `LetterRail`; `lastSession` flows from DataStore for the Continue card. `continueTarget()` resolves the saved session against the catalog (reciter/moshaf may have moved).

**Surah grid**: `SurahGridViewModel.open(reciter, moshaf)` → `catalog.surahs("ar")` filtered by `moshaf.availableSurahIds` (empty `surah_list` → assume 1..114). Moshaf picker swaps via `selectMoshaf(index)`. Warms timing cache for the first surah.

**Player**: `PlayerViewModel.play(reciter, moshaf, surah, availableSurahs, resumeFromSession)`:
1. `TimingRepository.readForMoshaf(moshaf.server)` — match **timing read id** via `folder_url` ↔ `server` (normalized); no match → `hasTiming=false`, audio plays without sync, “no timing data” notice.
2. `timingFor(readId, surahId)` — disk-cached forever; null → graceful degradation.
3. `buildTextItems()` — timing index i≥1 → verse key via `BasmalaOffset.verseKeyFor` → text from `QuranTextRepository.verseText` (Tanzil first, Quran.com fallback).
4. `PlaybackController.playSurah(...)` builds `{server}{surah:03d}.mp3`, prepares ExoPlayer, starts ticker.
5. Session save loop every ~5 s (position throttled).

## 5. Core algorithms (unit tested in `app/src/test/.../DomainTests.kt`)

### 5.1 Ayah sync (`TimingIndex.ayahAt`)
Binary search over sorted entries for the largest `startMs ≤ position`, skipping
past degenerate (`endMs ≤ position`) intervals, then returns the entry's **timing
index** (`ayah` field), never its list position. This matters because reads
differ in shape: some include a timing index-0 basmala entry (list position ==
timing index), others omit it (entries start at 1). Always look entries up by
timing index via `SurahTiming.entryFor(ayah)` — never `entries.getOrNull(listPos)`.
Position 0's virtual basmala slot returns timing index 0 (the header). Runs every
100 ms in the ticker; UI state only updates when the index changes.

**Timing speed correction** (`TimingCorrection`): some reads' per-ayah timing does
not match the actual mp3 — verified compressed (timing SHORTER than the mp3 →
highlight drifts AHEAD): read 135 عبدالرحمن السويّد s2 6039 s vs 6757 s (1.119),
read 259 أحمد النفيس (1.095); and stretched (timing LONGER → highlight LAGS):
read 137 أحمد طالب بن حميد s2 7458 s vs 5874 s (0.788). Reads 5/13/17 are 1.000
(untouched). The app auto-detects per surah once the mp3 duration is known:
`TimingCorrection.ratio` = mp3 duration / timing's last end (clamped 0.70..1.30,
ignored under 1.03) and `PlaybackController` maps every playback position into
timing space with `pos / ratio` (BOTH directions) in the ticker, after seeks,
and at resume. Unit-tested with the verified values.

### 5.2 Basmala / verse mapping (`BasmalaOffset`)
- Timing index **0 = un-numbered basmala/header slot** (no polygon/page → skip highlight; surah 9 has no basmala).
- Index `i ≥ 1` ↔ verse key `"surah:i"` (Hafs, offset 0).
- Non-Hafs riwayat may count the basmala as verse 1 → `suggestOffset(entryCount, versesCount)` returns 1 when `entryCount == versesCount + 2`; offset is user-overridable via Settings.

### 5.3 Page highlight (`PageMapping`, `PageModeView`)
- Parse the **real** `viewBox` from each SVG (verified: pages vary — 235×235 early pages, page 187 is 345×550, islamic.app pages are 1200×1530). Never assume 235.
- `screen = (pageSpace − viewBox.origin) * displaySize / viewBoxSize`.
- Polygon string `"x1,y1 x2,y2 ..."` → bounding quad → translucent rounded rect (35% alpha fill + 3dp stroke) with small inset; null polygon (basmala) → nothing; `x`/`y`-only → (marker fallback documented, not drawn).
- **Second source — “Madinah HD” (islamic.app)**: `https://api.islamic.app/v1/mushaf/page/{page}.svg?theme=dark&width=1200` — same standard Madinah pagination as the timing `page` field, so page sync is unchanged. The page's `<text y>` is the BASELINE (glyphs sit above it), and every ayah's text ends with its embedded ۝+digits marker in the last tspan. **RTL text**: AndroidSVG lays MULTIPLE tspans per line in LTR order (single-tspan bidi is fine; `direction=rtl` has no effect — verified by probe), so each line's tspans are MERGED into one for rendering (a single drawText lets Android's bidi lay the RTL line out correctly); the original structure is still parsed for the highlight. `IslamicPageBands.parseLines` extracts the structured lines; `IslamicHiliteRects` (pure, with an injected width `measure` lambda; the loader uses `Paint.measureText`) computes EXACT per-ayah rects with the same region logic as the KSU site — first partial line from the line's left edge to the previous ayah's end, full middle lines, last partial line from the ayah's end (its number) to the line's right edge, same-line ayahs collapse to one rect; vertical band = baseline − 0.95×font … baseline + 0.35×font. See references/api-contracts.md for the source research.
- **Third source — KSU (Ayat) raster pages** (styles “آيات حفص”/“آيات ورش”/“حفص ملون”): `ayat/safahat1/{p}.png` (456×672), `warsh/{p}.png` (620×1005), `tajweed_png/{p}.png` (456×707). Hafs == standard Madinah pagination (timing `page` field); Warsh and Tajweed use their own bundled paginations (`KsuWarshPageData`, `KsuTajweedPageData` — generated from quran.ksu.edu.sa quran-data.js, Tanzil-sourced page facts).
- **EXACT per-ayah highlight = the site's own `hilitePage()` algorithm** (`KsuHiliteGeometry`): the hilites values are where each ayah **ENDS**; ayah *k*'s highlight spans from where ayah *k−1* ended to where *k* ends, drawn as up to three rects — the tail of the previous line (left margin → previous end-x = this ayah's first partial line), this ayah's last partial line (end-x → right margin), and the full-width block of complete lines between them; same-line ayahs collapse to one rect. Constants from `engine.js _hlMeta` per mushaf (height/mgwidth/twidth/ofwidth/ofheight/fasel_sura/page_top/page_sura_top; fp_* for the opening pages 1–2 with `prev_top=270`); mid-page surah starts add `fasel_sura`. `KsuHilitesRepository` fetches + caches forever (JsonDiskCache `ksu_hilites`); `PageAyahEstimator` (text-length estimate) is only the offline/fallback path.
- Page-turn: the page view is a TWO-PAGE SPREAD (odd page right, even page left — the same `page % 2` rule the KSU site uses), forced RTL so it never flips; `MushafSpreadView` animates spread changes as a page turn (slide+fade, direction-aware) via AnimatedContent keyed on the spread's right-page number, and joins the two pages with a folded SPINE ribbon + inner-edge shadows. Both pages are ALIGNED toward the spine (`PageModeView.alignment`: right page CenterEnd, left page CenterStart in the RTL row) so they meet realistically at the center. The spread loader (`loadSpreadSide`) consolidates all page sources with the highlight only on the current-ayah side + next-spread prefetch.
- Mushaf selection lives in the LOWER transport bar (compact button showing the localized style name → `MushafPickerDialog`: name + ✓ on the current style, immediate select, no redundant hints). The transport has NO seek bar (seeking is via prev/next ayah + surah buttons) — just a non-focusable time readout, plus an eye toggle for auto-hide (persisted `autoHideControls`).
- Page-mode chrome auto-hides 8 s after the LAST key press while playing — the countdown RESETS on every button press (`lastKeyPress` bumps in the screen-level key handler and keys the hide effect), so navigating the controls never hides them; any key reveals it. The fullscreen page is `.focusable()` so D-pad events keep flowing; pause reveals chrome; INFO/MENU toggles text/page mode.

### 5.4 Tanzil basmala stripping (`QuranTextRepository.stripBasmala`)
Tanzil embeds the basmala prefix in verse 1 of surahs 2–114, but the recitation recites it as the header. Strip it using the data's own `1:1` text (exact character match) so displayed text matches audio 1:1.

### 5.5 Repeat
- **Ayah**: ticker sees `pos ≥ entry.endMs` → `seekTo(entry.startMs)`.
- **Surah**: ExoPlayer `REPEAT_MODE_ALL` on the single-item playlist.
- **Off**: on `STATE_ENDED` → `onBoundaryExceeded(true)` → autoplay next available surah (none → stop).

## 6. Caching & offline

- Catalog (`suwar`, `reciters`, `recent_reads`, `chapters`): `JsonDiskCache` TTL 24 h.
- Timing per `(read, surah)` and Quran.com text per surah: cached **forever** (immutable data).
- Single-flight per key (`JsonDiskCache.singleFlight`) — no duplicate calls when focus moves fast.
- Cold start renders Home from cache instantly; refresh happens in background.
- **minSdk 23 gotcha**: never use `ConcurrentHashMap.computeIfAbsent` (API 24) — see the fix in `singleFlight` (getOrPut under `synchronized`).

## 7. Session & settings (`SessionRepository`, DataStore)

- `AppSettings`: language (ar/en), defaultSpeed, fontSizeIndex (0..2), highlightColorIndex (0..2), displayMode (0=text, 1=page), mushafStyle (0=Madinah SVG, 1=Tajweed images), ayahOffset.
- `LastSession`: reciter/moshaf/surah/ayah/position/updatedAt; written ≤ every 5 s; shown as the Home Continue card; position restored on play when `resumeFromSession=true`.
- Locale: `LocaleManager` mirrors language to SharedPreferences so `MainActivity.attachBaseContext` can wrap synchronously; language change triggers `recreate()`.

## 8. Localization (D3)

- All UI chrome must go through `strings.xml` + `values-ar/strings.xml` (`stringResource(R.string.*)`) — transport labels, repeat indicator, notices, error texts, content descriptions. Quran content (basmala, ayah text) stays Arabic by definition.
- Theme palette is fixed night-sky (gold accent); no locale-dependent colors.
- Layout direction flips via `CompositionLocalProvider(LocalLayoutDirection provides ...)` in `QuranTvRoot`.

## 9. Build, test, verify (D6)

```bash
export JAVA_HOME=/home/mohamed/jdk            # or any JDK 17+
./gradlew :app:assembleDebug                  # APK → app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:testDebugUnitTest              # 26 unit tests (parsing, URLs, timing search, mapping, basmala)
./gradlew :app:lintDebug                      # MUST pass 0 errors (minSdk 23 gate)
```

Emulator smoke test (AVD `Television_1080p` exists locally; system image android-36 android-tv x86_64):

```bash
$ANDROID_SDK/emulator/emulator -avd Television_1080p -no-snapshot -no-audio -gpu swiftshader_indirect -no-boot-anim &
adb wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.qurantv.app/.MainActivity
# keys: 19/20/21/22 dpad, 23 OK, 4 back, 85 play/pause, 165 INFO (toggle text/page mode)
adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml   # read visible text
adb logcat -d | grep -E "FATAL|AndroidRuntime"                              # crash check
```

Note: this model cannot view screenshots — verify UI via uiautomator dumps (text labels) + `dumpsys media_session` (playback state) + logcat.

## 10. Git workflow

- Conventional commits (`feat:` `fix:` `chore:` `docs:` `test:`); work on `phase/N-<name>` branches or commit directly to `main` for small changes.
- Never commit `local.properties`, build outputs, IDE files (`.gitignore` covers them).
- After each change: run assemble + tests + lint, update `TASKS.md` progress log, commit.

## 11. Gotchas & constraints (verified, do not re-invent)

- Timing **read id ≠ reciter id** — always match `reads[].folder_url` ↔ `moshaf.server` (trailing slashes normalized; servers may contain subdirectories).
- `surah_list` is a comma string, may end with `,`, may be a subset (e.g. 83/114) — parse defensively, only list available surahs; a missing surah 404s.
- Audio URL: `{normalized server}{surah:03d}.mp3`.
- `ayah 0` = basmala/header (no polygon/page) → skip highlight; surah 9 has none.
- Timestamps are integer ms; guard zero-width intervals (done in `TimingIndex` + `toDomain`).
- Always https; OkHttp follows the 301 redirects (do not disable).
- Warsh-style riwayat may shift basmala numbering → offset mechanism (validated surahs 1–2; Hafs is the verified-correct case).
- Page SVGs vary in viewBox — always parse it from the SVG.
- Media3 APIs are `@UnstableApi` — new ExoPlayer/MediaSession code needs `@OptIn(UnstableApi::class)` (see `PlaybackController`); don't propagate to callers.
- Some resource strings in `strings.xml` are intentionally unused long-forms (repeat_off, play, …) — harmless; prefer short variants in the UI.
- No ads, payments, analytics; free-feeling app; keep modules separable for later phases (radio/live-TV/tafsir slot in without rewriting).

## 12. Known limitations / deferred work

- **Background `MediaSessionService`**: deliberately out of scope (activity-scoped `MediaSession` only). Would need FOREGROUND_SERVICE + notification + a service in `AndroidManifest.xml`; keep playback app-scoped via `PlaybackController` in `AppContainer` (already survives navigation).
- **Real-device pass** (user-side, README): remote media-key routing, offline audio-failure → Retry, focus feel/60fps on actual TV GPU, on-screen keyboard search, banner appearance.
- **Emulator airplane mode** doesn't block Ethernet → offline audio-failure path can't be exercised there; code path is `onPlayerError → error state`.
- Non-Hafs riwayat sync is best-effort.
- `recent_reads` row on Home is a soft-fail row (error → hidden).

## 13. Refinement playbooks

- **Add a setting**: add key to `SessionRepository.Keys` + `AppSettings` + setter; expose in `SettingsViewModel`; UI row in `SettingsScreen`; consume in the relevant screen (settings Flow already collected in root/player/surah-grid).
- **Add a screen**: add a `Screen` subtype in `AppNavigator`, a composable in `ui/<name>/`, a ViewModel in `AppContainer`, wire in `QuranTvRoot` `when(screen)`.
- **Change sync behavior**: `TimingIndex` (locator) and `PlaybackController.startTicker` (what state updates when). Keep per-tick cost tiny; state updates only on index change.
- **Add an endpoint**: DTO + call in `Mp3QuranApi`/`QuranComApi` (+ `@SerialName`), optional `JsonDiskCache` category, repo method.
- **Touch timing/page math**: add a unit test in `DomainTests.kt` with the live-verified fixtures already there (surah 1 read 5, page 187 viewBox).
- **Perf on low-end TV**: avoid blur/heavy shadows; page bitmap cache ≤ 6 (each ~1200px-wide ARGB ≈ 6–9 MB — watch memory on 2 GB Chromecasts); no full-list recomposition per tick.
