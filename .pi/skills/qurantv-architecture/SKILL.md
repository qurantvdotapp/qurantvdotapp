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
  Models.kt                Reciter, Moshaf, QuranSurah, TimingRead, AyahTiming, SurahTiming, PointF
  CatalogParsing.kt        surah_list parsing, server URL normalization, audio URL rule, polygon parse
  TimingIndex.kt           binary-search ayah locator (playback position → ayah index)
  BasmalaOffset.kt         timing index ↔ verse key mapping (+ non-Hafs riwayat offset)
  PageMapping.kt           SVG viewBox parsing + page-space → screen-space mapping
data/api/
  ApiClient.kt             thin OkHttp wrapper (all calls on Dispatchers.IO, User-Agent set)
  Mp3QuranApi.kt           mp3quran.net API v3 client + DTO→domain mappers (defensive)
  QuranComApi.kt           api.quran.com API v4 client (chapters, verses/uthmani)
  Dtos.kt                  all @Serializable DTOs (@SerialName snake_case)
data/cache/JsonDiskCache.kt atomic tmp-file writes, TTL 24h catalog / forever timing+text, per-key single-flight
data/repo/
  CatalogRepository.kt     surahs (ar+en merged), reciters, recent_reads — disk cached
  TimingRepository.kt      reads list + per-(read,surah) timing, folder_url↔server matching
  QuranTextRepository.kt   Tanzil asset map (verse_key→text) + Quran.com per-surah fallback cache
  SessionRepository.kt     DataStore: AppSettings + LastSession
player/
  PlaybackController.kt    app-scoped ExoPlayer + MediaSession + audio focus + 200ms ticker
  RepeatMode.kt            OFF / AYAH / SURAH
ui/
  QuranTvRoot.kt           shell: theme, RTL direction, back handling, screen switch
  theme/Theme.kt           tv-material night palette (gold/green/cyan on deep navy); SurfaceContainer* shims
  components/Common.kt     TvCard, TvIconButton (scale+border focus), Loading/Error/Empty states
  components/SurahJumpDialog.kt
  home/                    HomeScreen (header, search bar, Continue card, A–Z rail + reciter rows),
                            HomeViewModel, SearchOverlay
  surahs/                  SurahGridScreen (8-col grid, moshaf picker), SurahGridViewModel
  player/                  PlayerScreen, PlayerViewModel, TextModeList, TransportBar,
                            PageModeView, PageImageLoader (AndroidSVG→Bitmap),
                            TajweedAyahView, AyahImageLoader (islamic.network CDN)
  settings/                SettingsScreen, SettingsViewModel
res/                       values/ + values-ar/ strings.xml, colors, themes (values-v27 cutout mode),
                           drawable ic_launcher + tv_banner
assets/quran/quran-uthmani.txt   Tanzil text committed (~1.3 MB); Gradle task re-downloads if missing
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
Binary search over sorted entries for largest `startMs ≤ position`; then skip past any degenerate (`endMs ≤ position`) intervals; clamp to last ayah. Runs every 200 ms in the ticker; **UI state only updates when the index changes** (stable keys, `derivedStateOf`-style hoisting) so the whole list never recomposes per tick.

### 5.2 Basmala / verse mapping (`BasmalaOffset`)
- Timing index **0 = un-numbered basmala/header slot** (no polygon/page → skip highlight; surah 9 has no basmala).
- Index `i ≥ 1` ↔ verse key `"surah:i"` (Hafs, offset 0).
- Non-Hafs riwayat may count the basmala as verse 1 → `suggestOffset(entryCount, versesCount)` returns 1 when `entryCount == versesCount + 2`; offset is user-overridable via Settings.

### 5.3 Page highlight (`PageMapping`, `PageModeView`)
- Parse the **real** `viewBox` from each SVG (verified: pages vary — 235×235 early pages, page 187 is 345×550). Never assume 235.
- `screen = (pageSpace − viewBox.origin) * displaySize / viewBoxSize`.
- Polygon string `"x1,y1 x2,y2 ..."` → bounding quad → translucent rounded rect (35% alpha fill + 3dp stroke) with small inset; null polygon (basmala) → nothing; `x`/`y`-only → (marker fallback documented, not drawn).
- Page-turn: `currentPageUrl` changes → swap bitmap (prefetch next page; LRU ≤ 6 bitmaps).

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
