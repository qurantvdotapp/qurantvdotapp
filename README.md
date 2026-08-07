# Quran TV (القرآن)

An Android TV / Google TV app that streams Quran surah recitations from
[mp3quran.net](https://mp3quran.net) with **Ayat-KSU-style ayah highlighting**
in two display modes:

1. **Text mode** — authentic Tanzil Uthmani text, current ayah highlighted and
   auto-scrolled in sync with the audio.
2. **Mushaf page mode** — the actual Madinah mushaf SVG page with the current
   ayah's region highlighted; pages turn automatically. A second style is
   available: **Color Tajweed**, which renders the current ayah as its own
   color-coded tajweed image (from the islamic.network CDN).

100% remote-control navigable (D-pad + media keys), 10-foot UI, Arabic primary
(RTL) with English secondary.

---

## Feature summary

- **Reciters**: scrollable list grouped alphabetically by initial letter — one
  compact row of reciter chips per letter (maximizes screen use) with an A–Z
  jump rail and an always-visible search bar.
- **Riwayat / moshaf picker** per reciter (Hafs مرتل, mujawwad, المصحف المعلم, …).
- **Surah grid** showing only the surahs available for the selected moshaf
  (`surah_list` — some reciters have fewer than 114) in a dense 8-column grid
  with a jump-to-surah dialog (no long scrolling).
- **Playback**: stream `{server}{surah:03d}.mp3` via Media3 ExoPlayer;
  play/pause, seek (±5s), next/prev surah, next/prev ayah, repeat
  (off / ayah / surah), speed 0.5×–2×, jump-to-surah dialog.
- **Autoplay**: when a surah finishes (repeat off), the next available surah
  starts automatically from its first ayah.
- **Compact text mode**: tight rows + line height so ~6 short ayahs are visible
  at once and long ayahs (e.g. 2:13) fit fully on screen.
- **Mushaf styles** (page mode): Madinah SVG (polygon highlight) or Color
  Tajweed per-ayah images — toggle in the player top bar or Settings.
- **Ayah sync** where timing data exists (matched by moshaf `server` ↔ timing
  `folder_url`); graceful degradation with a “لا يوجد توقيت” notice otherwise.
  The text list shows exactly the numbered verses — the recited basmala is a
  decorative surah header above the list, and the basmala prefix that Tanzil
  embeds in verse 1 of surahs 2–114 is stripped so text matches audio 1:1.
  Auto-scroll only moves when the current ayah's start leaves the screen, so
  long multi-line ayahs (e.g. 2:13) keep their highlight fully visible and
  manual scrolling is never fought.
- **Continue listening** card on Home; position restored on play.
- **Settings**: language (ar/en), default speed, text font size, highlight
  color, default display mode.
- **Offline resilience**: catalog/timing/text caches on disk; browsing works
  without network; audio failures show a focused Retry state.

## Architecture

```
app/src/main/java/com/qurantv/app/
├── MainActivity.kt            single activity, Compose for TV, locale handling
├── QuranTvApp.kt              Application (DI container)
├── LocaleManager.kt           runtime ar/en locale without AppCompat
├── di/AppContainer.kt         manual constructor DI (singletons)
├── navigation/AppNavigator.kt simple back stack (Home → SurahGrid → Player)
├── domain/                    pure models + verified logic
│   ├── Models.kt              Reciter, Moshaf, QuranSurah, SurahTiming, …
│   ├── CatalogParsing.kt      surah_list parsing, URL construction
│   ├── TimingIndex.kt         binary-search ayah locator
│   ├── BasmalaOffset.kt       timing-index ↔ verse-key mapping (+riwayat offset)
│   └── PageMapping.kt         SVG viewBox → screen coordinate mapping
├── data/
│   ├── api/                   OkHttp + kotlinx.serialization (mp3quran v3, Quran.com v4)
│   ├── cache/JsonDiskCache.kt on-disk JSON cache (TTL 24h catalog; forever timing/text)
│   └── repo/                  Catalog, Timing, QuranText, Session repositories
├── player/PlaybackController.kt  ExoPlayer + MediaSession + audio focus + 200ms ticker
└── ui/
    ├── theme/                 tv-material theme (night palette, 10-ft sizes)
    ├── components/            TvCard/TvIconButton (focus scale+border), states
    ├── home/                  Home (Continue + A–Z rail + recent reads + search)
    ├── surahs/                surah grid + moshaf picker
    ├── player/                PlayerScreen, TextModeList, PageModeView,
    │                          TransportBar, PageImageLoader (AndroidSVG)
    └── settings/              settings screen
```

**Stack**: Kotlin 2.2, AGP 8.13, Jetpack Compose for TV (`androidx.tv:tv-foundation`,
`androidx.tv:tv-material`), Media3 ExoPlayer 1.10, OkHttp, kotlinx-serialization,
Coil, AndroidSVG, DataStore, coroutines. Version catalog in
`gradle/libs.versions.toml`. minSdk 23, target/compile 36.

## Verified API facts (live-tested while building)

- Audio URL: `{moshaf.server}{surah:03d}.mp3` (normalize trailing slash; servers
  may contain subdirectories).
- Timing `read` id ≠ reciter id — match `reads[].folder_url` to `moshaf.server`.
- Timing index `0` = un-numbered basmala/header slot (no polygon/page → skip
  highlight; surah 9 has no basmala). Index `i ≥ 1` ↔ verse key `"surah:i"`.
- **Correction vs. the build prompt**: the prompt states all pages use
  `viewBox="0 0 235 235"`; live checking shows pages vary (page 187 is
  `viewBox="0 0 345 550"`). The app parses each page's real `viewBox` from the
  SVG and maps polygons with `screen = pageSpace * displaySize / viewBoxSize`.
- **Surah 1 nuance**: the recitation contains a pre-surah basmala (index 0) and
  verse 1:1 is index 1 (verified by matching timing `x/y` to the SVG `ayah:x/y`
  markers and by segment durations). The uniform mapping (index i ↔ verse i)
  matches the data.

## Prerequisites

- JDK 17+ (built and tested with Temurin 21)
- Android SDK with `platforms;android-36`, `build-tools;36.0.0`+
- An Android TV emulator image (`system-images;android-36;android-tv;x86_64`)
  or a Chromecast with Google TV / Android TV device

## Build

```bash
./gradlew :app:assembleDebug          # APK at app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:testDebugUnitTest      # unit tests (26): parsing, URLs, timing search,
                                      # coordinate mapping, basmala offset
```

The Tanzil Uthmani text is committed at `app/src/main/assets/quran/quran-uthmani.txt`
(CC BY-NC-ND — see About). If it is ever removed, a Gradle task re-downloads it
from `https://tanzil.net/pub/download/v1.0/download.php` automatically.

## Emulator verification (D6 — done)

```bash
sdkmanager "system-images;android-36;android-tv;x86_64"
avdmanager create avd -n qurantv_tv -k "system-images;android-36;android-tv;x86_64" -d tv_1080p
emulator -avd qurantv_tv -gpu swiftshader_indirect &
adb wait-for-device
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.qurantv.app/.MainActivity
# D-pad: adb shell input keyevent 19/20/21/22 (up/down/left/right), 23 (center),
#        4 (back), 85 (media play/pause), 165 (INFO — toggle text/page mode)
```

### Manual test checklist (emulator pass)

- [x] Cold start: Home renders, no crash; banner/leanback launcher entry present
- [x] Continue-listening card shows the last reciter/surah; single OK press resumes
- [x] Reciters: full-height vertical grouped list with A–Z jump rail (letter tap scrolls
      the list) + always-visible search bar (focus/OK opens the search overlay)
- [x] Surah grid: 8-column dense grid, moshaf picker + jump-to-surah dialogs work
- [x] Audio streams; play/pause; restart from end works; speed 1.25/1.5 shown and applied
- [x] Repeat ayah loops within the ayah window; repeat indicator updates
- [x] Autoplay: الفاتحة ends → البقرة starts automatically (verified on emulator)
- [x] Text mode: ayah boundaries verified via prev/next-ayah seek; auto-scroll tracks
      playback; tap/OK on an ayah seeks to its start
- [x] Timing match works for timed reciters (e.g. أحمد صابر — Hafs مرتل); untimed
      moshafs (e.g. المصحف المعلم) degrade gracefully with the no-timing notice
- [x] Page mode toggles via INFO key; mushaf SVG renders (viewBox parsing incl.
      345×550 pages); highlight drawn from polygons
- [x] Search overlay opens (text entry needs the Google TV on-screen keyboard —
      see real-device list)
- [x] Settings: language ar↔en recreates the UI in the chosen locale
- [x] Back hierarchy Player → Surah grid/Home; double-Back exits
- [x] Disk cache populated (catalog/timing); cold start renders instantly from cache

## Sideload to a real Chromecast with Google TV (user pass)

1. On the TV: Settings → System → About → build to enable **Developer options**,
   then enable **USB debugging**.
2. From this machine:
   ```bash
   adb connect <TV_IP_ADDRESS>
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   adb shell am start -n com.qurantv.app/.MainActivity
   ```
3. **Re-verify on real hardware** (cannot be fully simulated):
   - Remote play/pause media key behavior (MediaSession routing)
   - Focus feel + 60fps during ayah-highlight ticks on the actual TV GPU
   - Search typing with the Google TV on-screen keyboard
   - **Offline test**: enable airplane mode on the TV → browsing from cache works;
     starting a surah shows the focused Retry state after the network timeout
   - Audio focus ducking when another app plays audio
   - Banner/icon appearance in the launcher row

## Known limitations (honest)

- The emulator's airplane mode does not disable Ethernet, so the offline
  *audio-failure → Retry* state could not be exercised on the emulator; the code
  path is `onPlayerError → error state` and needs the real-device pass above.
- Non-Hafs riwayat may count the basmala as verse 1; an offset mechanism
  (`Settings → ayah offset` plumbing + `BasmalaOffset.suggestOffset`) is in place
  and validated on surahs 1–2, but sync for those riwayat is best-effort — Hafs
  is verified correct.
- Page-mode bitmap cache is capped at 6 decoded pages (per Part 5).

## License / attribution

- Audio + mushaf page SVGs: [mp3quran.net](https://mp3quran.net)
- Quran text: **Tanzil** Uthmani script, CC BY-NC-ND —
  [tanzil.net](https://tanzil.net) (attribution shown in Settings → About)
- English surah names: [Quran.com](https://quran.com) API v4
