---
name: qurantv-architecture
description: Architecture reference and refinement workflow for the Quran TV Android TV app (mp3qurantv repo, Kotlin + Compose for TV + Media3). Use when extending, debugging, refactoring, or reviewing this codebase — screens and navigation, data flow, verified mp3quran.net/Quran.com API contracts, ayah timing/sync algorithm (incl. the trailing-silence-aware accuracy gate), mushaf page coordinate math, bundled KSU Ayat tafseer data, caching/offline strategy, settings persistence, localization, and the build/test/emulator verification + samba-release workflow.
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
| D4 | Core scope only: Reciters → Surahs → Player + highlight. No radio/live TV; **simplified tafseer / word meanings / translation IS in scope** via the player's page-view selector (KSU Ayat data) |
| D5 | All riwayat, ayah sync best-effort where timing exists, graceful degradation |
| D6 | Emulator-first verification (Android TV AVD) → sideload to real Chromecast with Google TV |

## 2. Stack & versions

- Kotlin 2.2.x, AGP 8.13.x, compileSdk/targetSdk 36, **minSdk 23** (lint gate must stay clean for API 23)
- Compose for TV: `androidx.tv:tv-foundation` + `androidx.tv:tv-material` 1.0.x (standard lazy lists; **tv-foundation 1.0.0 has no TvLazyColumn** — use foundation lazy lists with tv-material components)
- Media3 ExoPlayer 1.10.x (`media3-exoplayer`, `media3-common`, `media3-session`, `media3-datasource-okhttp`)
- OkHttp + kotlinx-serialization (no Retrofit), Coil (+ coil-svg) listed but AndroidSVG (`com.caverock:androidsvg`) is what actually renders page SVGs
- `androidx.datastore-preferences` (settings + session), manual constructor DI (`AppContainer`), coroutines + Flow, version catalog `gradle/libs.versions.toml`
- **Amiri Quran font** bundled at `res/font/amiri_quran.ttf` (SIL OFL) → `QuranFontFamily` in the theme — used ONLY for Quran content (ayah text list, basmala header); UI chrome keeps the system font
- **KSU Ayat tafseer data**: three SQLite databases bundled as assets (`assets/tafseer/ar_muyassar.ayt` التفسير الميسر, `ar_ma3any.ayt` معاني الكلمات, `en_sahih.ayt` English translation) — each a `(id, sura, aya, text)` table with one row per ayah (6236). Extracted from the official Ayat Linux package (`Images_Tafasir_Translations/contents.standard.ayt`, itself a zip; the inner `.ayt` files are SQLite). Copied to files on first use (`TafseerRepository`), ~2.3 MB in the APK

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
  TimingAccuracy.kt        mp3-length vs timing-total reliability check (never estimate sync)
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
  TimingRepository.kt      reads list + per-(read,surah) timing, folder_url↔server matching,
                           timedServerUrls(), surahsWithTiming() (soar), timingUsability() probe
  QuranTextRepository.kt   Tanzil asset map (verse_key→text + verseTextLength) + Quran.com fallback
  SessionRepository.kt     DataStore: AppSettings (incl. autoHideControls, onlyTimedReciters) + LastSession
  KsuHilitesRepository.kt  KSU per-ayah hilites API + disk cache (forever)
  TafseerRepository.kt     KSU Ayat SQLite DBs (muyassar/ma3any/en_sahih): tafseerFor(s,a), surahContent(s, mode)
player/
  PlaybackController.kt    app-scoped ExoPlayer + MediaSession + audio focus + 100ms ticker;
                           queued-playlist seamless transitions (onMediaItemTransition→attachSurah)
  RepeatMode.kt            OFF / AYAH / SURAH
ui/
  QuranTvRoot.kt           shell: theme, RTL direction, back handling, screen switch
  theme/Theme.kt           tv-material night palette (gold/green/cyan on deep navy); SurfaceContainer* shims; QuranFontFamily
  components/Common.kt     TvCard, TvIconButton (scale+border focus), Loading/Error/Empty states, NoTimingBadge
  components/SurahJumpDialog.kt   surah list (dimmed + بدون توقيت badge for untimed surahs)
  components/MushafPickerDialog.kt  combined display-mode + style chooser (ONE flat list: حفص ملون·آيات حفص·آيات ورش·المدينة·المدينة HD·التجويد الملون·نص; picking a style also enters page mode)
  components/MoshafSelectionDialog.kt  reciter riwaya chooser (timedServers badges; used by Home, grid, player reciter switch)
  components/ReciterPickerDialog.kt  player reciter chooser — Arabic-collator sorted + live search + no-timing badges
  home/                    HomeScreen (header, search bar, Continue card, A–Z rail + reciter FlowRows), HomeViewModel, SearchOverlay
  surahs/                  SurahGridScreen (8-col grid, moshaf picker, untimed-surah badges), SurahGridViewModel
  player/                  PlayerScreen, PlayerViewModel, TextModeList, TransportBar (3-zone layout, no seek bar),
                            SurahContentView (full-surah tafseer/meanings/translation lists w/ auto-scroll),
                            MushafSpreadView (two-page spread + spine + page-turn animation),
                            PageModeView (single page renderer; alignment param),
                            PageImageLoader (mp3quran AndroidSVG→Bitmap),
                            IslamicNetworkPageLoader (islamic.app SVG: tspan-merge for RTL + rects),
                            KsuPageLoader (KSU hafs/warsh/tajweed PNGs),
                            TajweedAyahView, AyahImageLoader (islamic.network CDN)
  settings/                SettingsScreen, SettingsViewModel
res/                       values/ + values-ar/ strings.xml, colors, themes (values-v27 cutout mode),
                           drawable ic_launcher + tv_banner; font/amiri_quran.ttf
assets/quran/quran-uthmani.txt   Tanzil text committed (~1.3 MB); Gradle task re-downloads if missing
assets/tafseer/*.ayt       KSU Ayat SQLite DBs (ميسر/معاني/ترجمة), ~6.8 MB raw / ~2.3 MB compressed
scripts/run-emulator.sh     boot TV AVD with audio + install/launch + fullscreen
scripts/emulator-fullscreen.py  EWMH _NET_WM_STATE_FULLSCREEN via python-Xlib
```

## 4. Data flow per screen

**Home**: `HomeViewModel.loadCatalog()` → `TimingRepository.reads()` (cached forever; normalized `folder_url`s mark which moshaf `server`s have ayah timing) → `CatalogRepository.reciters("ar")` (disk-cached, 24h TTL, single-flight) → grouped by `letter`, each group SORTED alphabetically (Arabic Collator) → vertical list of `FlowRow` chip-groups per letter (reciters WRAP into multiple short rows — no horizontal scrolling; single-moshaf reciters show NO moshaf count, only >1) + `LetterRail`. Setting `onlyTimedReciters` (Settings → فقط القراء مع توقيت الآيات) filters to reciters with ≥1 timed moshaf and keeps only the timed moshafs per reciter — applied live; the Continue card and recent-reads follow the same filter. **Search** (`SearchOverlay`): an EMPTY query returns the whole sorted list (browsable; typing visibly narrows it); `reciterMatchesQuery` is Arabic-tolerant (normalizes أ/إ/آ/ٱ→ا, ة→ه, ى→ي; case-insensitive substring + initial-letter match); the overlay opens with the field focused + the keyboard shown explicitly (TVs don't always connect the IME — see gotchas), ImeAction.Search + Enter/OK open the first match, plus a visible بحث button.

**Surah grid**: `SurahGridViewModel.open(reciter, moshaf)` → `catalog.surahs("ar")` filtered by `moshaf.availableSurahIds` (empty `surah_list` → assume 1..114). Moshaf picker swaps via `selectMoshaf(index)`. Warms timing cache for the first surah.

**Player**: `PlayerViewModel.play(reciter, moshaf, surah, availableSurahs, resumeFromSession, startAyahIndex?)`:
1. `TimingRepository.readForMoshaf(moshaf.server)` — match **timing read id** via `folder_url` ↔ `server` (normalized); no match → `hasTiming=false`, audio plays without sync, “no timing data” notice (moved to the TRANSPORT bar, left of the auto-hide eye).
2. `timingFor(readId, surahId)` — disk-cached forever; null → graceful degradation.
3. `buildTextItems()` — timing index i≥1 → verse key via `BasmalaOffset.verseKeyFor` → text from `QuranTextRepository.verseText` (Tanzil first, Quran.com fallback).
4. `PlaybackController.playSurah(...)` builds `{server}{surah:03d}.mp3`, prepares ExoPlayer, starts ticker.
5. Session save loop every ~5 s (position throttled).
6. **Seamless transitions**: when repeat is OFF, the playlist queues the REMAINING surahs (mediaId = surah id); ExoPlayer pre-buffers and transitions with no gap; `onMediaItemTransition` → `onSurahAdvanced` → `handleSurahAdvanced` swaps timing/text via `attachSurah` (no audio re-prepare). Next/prev surah use `seekToNext/PreviousMediaItem`. Surah repeat uses `REPEAT_MODE_ONE` (loops the current item only; ALL would loop the whole queue).
7. **Reciter switch** from the transport (🎤): `switchReciter` keeps the CURRENT surah (fallback to the moshaf's first) and resumes from the SAME ayah (`startAyahIndex` → the new timing's entry start) when the surah is kept.

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

**Timing reliability check** (`TimingAccuracy`): ayah boundaries are NEVER
estimated. The check is now ASYMMETRIC and trailing-silence aware — mp3quran
files commonly END WITH SILENCE (verified 1–6 s across reads; e.g. البنا
المجود s97's file is 84.1 s but the recitation ends at 80.9 s — the timing's
79.1 s total is EXACT). So the mp3 may be LONGER than the timing by up to
`max(SILENCE_ALLOWANCE_MS=8_000, 2% relative)` while the timing stays exact
(covers silence on short AND long surahs), but the timing must never
significantly OVER-CLAIM the mp3 (reject when the mp3 is shorter than the
timing by >2% — e.g. read 17 s114: timing 39.1 s vs a 31.0 s file). Genuinely
bad reads stay rejected: read 135 السويّد compressed (s2 6039 vs 6757 = 1.119),
read 259 النفيس 1.095, read 137 طالب stretched 0.788, truncations (الحذيفي s1
timing stops at 45.7 s while the recitation continues to 61.3 s; البنا المجود
s114 45.0 s timing vs 75.1 s of audio). Reads 5/13/17/62/273 are ≈ 1.000
(reliable). `PlaybackController.checkTimingAccuracy` compares ExoPlayer's
mp3 duration against the timing's last end; an unreliable read has NO timing —
the audio plays but the surah's FIRST page shows statically, with the
“لا يوجد توقيت” notice; prev/next ayah then BROWSE the mushaf page by page
(`noTimingPage`, full spread per press, clamped 1..604).

**Badge accuracy** (`TimingRepository.timingUsability`): the `ayat_timing/soar`
list OVER-CLAIMS (it lists surahs whose timing doesn't match the mp3 — e.g. read
122 البنا المجود includes s97/s1 which are actually accurate-but-silent, and
s114 which is truncated). The no-timing badges (reciter cards, surah grid,
choosers) therefore probe each visible surah's mp3 duration via
`MediaMetadataRetriever` (skipped for files >10 MB) and cache the verdict
(`usable2_r<read>_s<surah>`, key versioned because the gate changed). Per-surah
verdicts are computed lazily as cards are composed (`refineSurahTiming`).

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
- Page-turn: the page view is a TWO-PAGE SPREAD (odd page right, even page left — the same `page % 2` rule the KSU site uses), forced RTL so it never flips; `MushafSpreadView` animates spread changes as a page turn via AnimatedContent keyed on the spread's right-page number — **NEXT page: the new spread slides in from the LEFT, the old slides out to the RIGHT** (reversed from the original), backwards is the mirror — with a folded SPINE ribbon + inner-edge shadows. Both pages ALIGNED toward the spine (`PageModeView.alignment`: right CenterEnd, left CenterStart). The spread loader (`loadSpreadSide`) consolidates all page sources with the highlight only on the current-ayah side + next-spread prefetch.
- Mushaf selection lives in the LOWER transport bar (compact button showing the localized style name → `MushafPickerDialog`: ONE flat list — حفص ملون · آيات حفص · آيات ورش · المدينة · المدينة HD · التجويد الملون · نص — with ✓ on current and initial focus; picking a mushaf style ALSO switches to page mode). The transport has NO seek bar — just a non-focusable time readout, plus the auto-hide eye toggle.
- Page-mode chrome is a TRANSLUCENT OVERLAY (0.62-alpha scrim) over the always-full-screen mushaf, auto-hiding **3 s** after the LAST key press while playing (countdown resets on every press via `lastKeyPress`); any key reveals it; pause reveals it; INFO/MENU toggles text/page mode.

### 5.4 Tanzil basmala stripping (`QuranTextRepository.stripBasmala`)
Tanzil embeds the basmala prefix in verse 1 of surahs 2–114, but the recitation recites it as the header. Strip it using the data's own `1:1` text (exact character match) so displayed text matches audio 1:1.

### 5.5 Repeat
- **Ayah**: ticker sees `pos ≥ entry.endMs` → `seekTo(entry.startMs)`.
- **Surah**: `REPEAT_MODE_ONE` (loops the CURRENT media item — with the queued playlist, ALL would loop the whole remaining sequence).
- **Off**: on `STATE_ENDED` (only at the END of the queued playlist) → `onBoundaryExceeded(true)` → next surah (none → stop).

### 5.6 Transport bar layout & page views
- The transport bar is THREE equal zones (D-pad friendly): LEFT `[السور][1×][repeat][time]` · CENTER the playback cluster dead-centre `[next-su][next-ay][⏯][prev-ay][prev-su]` (RTL: next on the LEFT of play) · RIGHT `[eye][🎤 reciter][mushaf style]`. The cluster is emitted direction-aware (children reversed in RTL) so the on-screen order is identical in Arabic and English; the material directional icons auto-mirror in RTL, so `TransportButton` un-mirrors them with `Modifier.scale(scaleX = -1f)` when RTL to keep the standard outward-pointing look.
- **Page view selector** (top-bar button, label shows the current view → 4-option chooser with ✓): `صفحة المصحف` (the two-page spread) · `التفسير الميسر` · `معاني الكلمات` · `الترجمة`. The non-mushaf views show the WHOLE SURAH, one ayah per row (`SurahContentView`, text-mode-style follow: current ayah highlighted + AUTO-SCROLLS with the recitation when timing exists, static without). Data from `TafseerRepository.surahContent(surahId, mode)` (bundled SQLite DBs).

## 6. Caching & offline

- Catalog (`suwar`, `reciters`, `recent_reads`, `chapters`): `JsonDiskCache` TTL 24 h.
- Timing per `(read, surah)` and Quran.com text per surah: cached **forever** (immutable data).
- Single-flight per key (`JsonDiskCache.singleFlight`) — no duplicate calls when focus moves fast.
- Cold start renders Home from cache instantly; refresh happens in background.
- **minSdk 23 gotcha**: never use `ConcurrentHashMap.computeIfAbsent` (API 24) — see the fix in `singleFlight` (getOrPut under `synchronized`).

## 7. Session & settings (`SessionRepository`, DataStore)

- `AppSettings`: language (ar/en), defaultSpeed, fontSizeIndex (0..2), highlightColorIndex (0..2), displayMode (0=text, 1=page — the DEFAULT, page mode), mushafStyle (0..5 — default **5 = حفص ملون** Hafs Tajweed), ayahOffset, autoHideControls, onlyTimedReciters. (A transient `showTafseer` setting was tried then REMOVED — the page view is chosen in the player's view selector instead.)
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
./gradlew :app:testDebugUnitTest              # 60 unit tests (parsing, URLs, timing search, mapping, basmala, accuracy incl. silence, reciter search)
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
- **Release**: bump `versionCode`/`versionName` in `app/build.gradle.kts`, rebuild, and push the APK to the samba share as `QuranTV-<version>-debug.apk` (`/mnt/rpi-share`, CIFS; verify with md5sum — keep the previous versions for rollback).

## 11. Gotchas & constraints (verified, do not re-invent)

- Timing **read id ≠ reciter id** — always match `reads[].folder_url` ↔ `moshaf.server` (trailing slashes normalized; servers may contain subdirectories).
- `surah_list` is a comma string, may end with `,`, may be a subset (e.g. 83/114) — parse defensively, only list available surahs; a missing surah 404s.
- Audio URL: `{normalized server}{surah:03d}.mp3`.
- **Trailing silence**: mp3quran mp3s commonly end with 1–6 s of silence — the TIMING is exact but the FILE is longer. The accuracy gate is asymmetric (`max(8 s, 2%)` longer side, 2% over-claim); do NOT revert to a symmetric 2% gate or accurate timings get wrongly disabled. The `soar` list OVER-CLAIMS surahs whose timing doesn't actually match — trust `timingUsability` (MediaMetadataRetriever probe, ≤10 MB) for badges, not the soar list.
- **TV keyboard/IME**: a focused text field does NOT reliably create an input connection on some TV builds (`mServedInputConnection=null` — reproducible on the TV AVD, which ships GBoard refusing TV input). Text fields must explicitly `keyboard?.show()` after gaining focus; provide `ImeAction.Search` + Enter/OK handling AND a visible fallback button. Typing can't be exercised on the emulator.
- **Reciter search Arabic**: match after normalizing أ/إ/آ/ٱ→ا, ة→ه, ى→ي (see `reciterMatchesQuery`) — plain `contains` misses alternate spellings.
- `ayah 0` = basmala/header (no polygon/page) → skip highlight; surah 9 has none.
- Timestamps are integer ms; guard zero-width intervals (done in `TimingIndex` + `toDomain`).
- Always https; OkHttp follows the 301 redirects (do not disable).
- Warsh-style riwayat may shift basmala numbering → offset mechanism (validated surahs 1–2; Hafs is the verified-correct case).
- Page SVGs vary in viewBox — always parse it from the SVG.
- Media3 APIs are `@UnstableApi` — new ExoPlayer/MediaSession code needs `@OptIn(UnstableApi::class)` (see `PlaybackController`); don't propagate to callers.
- Some resource strings in `strings.xml` are intentionally unused long-forms (repeat_off, play, …) — harmless; prefer short variants in the UI.
- **Material icons auto-mirror in RTL** — directional icons (NavigateBefore/Next, SkipPrevious/Next) render flipped in an RTL composition; un-mirror with `Modifier.scale(scaleX = -1f)` when RTL for the standard look.
- **Screen saver**: page mode sets `view.keepScreenOn = ui.isPlaying` (DisposableEffect) so the TV's daydream doesn't dim during playback; the AVD has no dream service so the flag is verified via window attrs.
- No ads, payments, analytics; free-feeling app; keep modules separable for later phases (radio/live-TV slot in without rewriting).

## 12. Known limitations / deferred work

- **Background `MediaSessionService`**: deliberately out of scope (activity-scoped `MediaSession` only). Would need FOREGROUND_SERVICE + notification + a service in `AndroidManifest.xml`; keep playback app-scoped via `PlaybackController` in `AppContainer` (already survives navigation).
- **Real-device pass** (user-side, README): remote media-key routing, offline audio-failure → Retry, focus feel/60fps on actual TV GPU, banner appearance. (Search typing depends on the TV's Leanback keyboard; the field + IME-action + visible button are in place but typing can't be verified on the emulator.)
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
