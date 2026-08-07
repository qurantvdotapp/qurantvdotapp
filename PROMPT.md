# DeepSeek V4 Flash — Build Prompt: "Quran TV" (Android TV / Google TV app)

## How to use this file

1. The **DECISIONS** table below is **final** (agreed with the project owner). Paste the whole file (from `## PROMPT` onward) into DeepSeek V4 Flash.
2. Do not ask the user to re-decide these: D1/D4/D6 are decided, D2 requires authentic Tanzil Uthmani text, D3 = Arabic + English, D5 = all riwayat best-effort.
3. Work in the current directory: `/home/mohamed/playground/mp3qurantv` — a **git repository already initialized** (`main` branch). See `TASKS.md` for the task tracker and git conventions.
4. After each delivery phase: update the phase checkboxes in `TASKS.md` and commit to git (see Part 15).

---

## DECISIONS — edit these before sending to the model

| ID | Topic | Default | Alternatives |
|----|-------|---------|--------------|
| D1 | Tech stack | **DECIDED: Kotlin + Jetpack Compose for TV (`androidx.tv`) + Media3/ExoPlayer** — native Google stack, best D-pad focus handling, best ExoPlayer integration | Flutter (fluttertv), classic Views + Leanback |
| D2 | Quran text source | **Authentic Uthmani text (Tanzil-sourced)**: bundle Tanzil `quran-uthmani.txt` as a build-time asset — canonical, offline, matches the Madinah mushaf orthography. Quran.com API v4 `text_uthmani` + disk cache as enrichment/fallback. Mushaf images = mp3quran SVG pages (authentic Madinah mushaf) | Quran.com-only, Tanzil API |
| D3 | UI language | Arabic primary (RTL), English secondary via resources | Arabic only |
| D4 | Scope | **DECIDED: Core only** — Reciters → Surahs → Player with ayah highlight. No live TV / radio / tafsir / videos | Include radio/live-TV rows |
| D5 | Riwayat | Support all riwayat; ayah sync only where timing data exists (graceful degradation otherwise) | Hafs-only MVP |
| D6 | Test flow | **DECIDED: Emulator-first** — develop + verify on an Android TV emulator, then sideload to a real Chromecast with Google TV (Android TV OS 12+); minSdk 23 | Real device only |

---

# PROMPT

## Role

You are a senior Android TV engineer. You build production-quality Android TV apps that are controlled **exclusively with a TV remote (D-pad + media keys)** and run smoothly at 60fps on low-end Google TV / Chromecast with Google TV hardware. You write clean, modular Kotlin code and you verify your work by building it.

## Goal

Build a complete, **buildable** Android TV app called **"Quran TV"** in the current working directory (a fresh, empty project). The app:

- Streams Quran surah (chapter) audio from **mp3quran.net** for many reciters and riwayat (narration styles).
- Shows the Quran text of the **currently playing ayah (verse)** and keeps it highlighted and in sync with the audio, in two interchangeable display modes like the **Ayat KSU** app:
  1. **Text mode**: a list of ayah texts, the current ayah highlighted, auto-scrolling as audio plays.
  2. **Mushaf page mode**: the actual mushaf (Madinah) page image with the current ayah's region highlighted; auto page-turn.
- Is 100% navigable by remote control, has a 10-foot UI, and degrades gracefully when a reciter/moshaf has no timing data.

The final deliverable must compile (`./gradlew :app:assembleDebug` passes) and include a README with run/test instructions for a Chromecast with Google TV or an Android TV emulator.

---

## Part 1 — Product requirements

1. **Browse reciters**: list all reciters from the mp3quran API, grouped by their first letter (the API provides a `letter` field) for an A–Z jump rail. Show reciter name in the selected language. Add search by reciter name.
2. **Pick riwayat/moshaf**: a reciter can have multiple moshafs (riwayat + recitation style). Let the user pick one; default to the first.
3. **Pick surah**: show a grid of available surahs only (use the moshaf's `surah_list` — some reciters have fewer than 114). Show surah number + Arabic name (and English name in English locale).
4. **Playback**: stream the surah mp3; support play/pause, seek, next/prev surah, next/prev **ayah**, repeat modes (off / repeat current ayah / repeat current surah), playback speed 0.5×–2.0×.
5. **Ayah sync & highlight**: while playing, the current ayah is identified from timing data and highlighted in both modes (see Part 4). Tapping/selecting an ayah seeks the audio to that ayah's start.
6. **Continue listening**: persist last reciter/moshaf/surah/ayah/position; show a "Continue" card on Home; restore position on play.
7. **Settings** (simple): language (ar/en if D3 both), default playback speed, text font size, highlight color.
8. **Offline resilience**: cached metadata and timings keep browsing working without network; audio failures show a focused "Retry" state.

## Part 2 — Platform & tech stack (decision D1 — DECIDED)

- **Android TV / Google TV app**, single Activity, **Jetpack Compose for TV** (Kotlin):
  - `androidx.tv:tv-foundation` and `androidx.tv:tv-material` (Compose for TV) for D-pad focus, rows, cards, dialogs.
  - tv-material theme; 10-foot friendly. Material3 where tv-material lacks a component.
- **Media3 ExoPlayer** for audio streaming (`media3-exoplayer`, `media3-common`, `media3-session`).
- Networking: OkHttp + kotlinx-serialization (or Retrofit + Moshi — pick one and be consistent).
- Image/SVG loading: Coil + `coil-svg`, plus `com.caverock:androidsvg` for mushaf page SVG rendering.
- Persistence: `androidx.datastore` (settings, last session) + on-disk JSON cache for API responses and per-(read, surah) timing data (Room optional; only if it genuinely helps).
- DI: manual constructor DI or Hilt — pick one; keep it simple.
- Coroutines + Flow for async; all network on IO dispatchers.

## Part 3 — mp3quran.net API contracts (VERIFIED live, 2026-08-07)

Base URL: `https://mp3quran.net/api/v3/...` — always use **https**; plain http 301-redirects (OkHttp follows redirects by default; do not disable).

### 3.1 Languages
`GET https://mp3quran.net/api/v3/languages`
Response: `{"language":[{"id":"1","language":"Arabic","native":"العربية","surah":"https://www.mp3quran.net/api/v3/suwar?language=ar","rewayah":"...","moshaf":"...","reciters":"...","radios":"...","tafasir":"..."}, ...]}`

### 3.2 Surahs
`GET https://mp3quran.net/api/v3/suwar?language=ar`
```json
{"suwar":[{"id":1,"name":"الفاتحة","start_page":1,"end_page":1,"makkia":1,"type":0}, ...]}
```
- 114 items; `id` = standard surah number; `name` in requested language; `start_page`/`end_page` = Madinah mushaf pages.

### 3.3 Riwayat
`GET https://mp3quran.net/api/v3/riwayat?language=ar` → `{"riwayat":[{"id":1,"name":"حفص عن عاصم"}, ...]}`

### 3.4 Moshaf types
`GET https://mp3quran.net/api/v3/moshaf?language=ar` → `{"riwayat":[{"id":11,"moshaf_type":1,"moshaf_id":1,"name":"حفص عن عاصم - مرتل"}, ...]}` (recitation styles: مرتل/mujawwad, etc.)

### 3.5 Reciters (the main catalog)
`GET https://mp3quran.net/api/v3/reciters?language=ar`
- Optional filters: `reciter=<id>`, `rewaya=<id>`, `sura=<id>`.
- Response (verified):
```json
{"reciters":[{
  "id":231, "name":"هزاع البلوشي", "letter":"H", "date":"2025-09-14T04:55:55.000000Z",
  "moshaf":[{
    "id":231, "name":"حفص عن عاصم - مرتل",
    "server":"https://server11.mp3quran.net/hazza/",
    "surah_total":83, "moshaf_type":11,
    "surah_list":"1,6,13,14,15,18,19,20,25,29,30,31,32,34,35,36,37,38,39,40,41,42,44,47,49,50,51,52,53,54,55,56,57,61,63,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114"
  }]
}]}
```
- **Audio URL construction (verified)**: `{moshaf.server}{surah:03d}.mp3`. Example: `https://server6.mp3quran.net/akdr/001.mp3` → HTTP 200, `content-type: audio/mpeg`. Server strings sometimes end with `/`, sometimes not; some contain subdirectories (e.g. `https://server16.mp3quran.net/deban/Rewayat-Qalon-A-n-Nafi/`) — always normalize to a single trailing slash before concatenation.
- **`surah_list` gotcha**: it is a comma-separated string and can end with a trailing comma; parse defensively. Only surahs present are available — hide the rest; requesting a missing surah 404s.

### 3.6 Timing reads (which recitations have per-ayah timing)
`GET https://mp3quran.net/api/v3/ayat_timing/reads`
```json
[{"id":5,"name":"أحمد بن علي العجمي","rewaya":"حفص عن عاصم","folder_url":"https://server10.mp3quran.net/ajm/","soar_count":114,"soar_link":"https://www.mp3quran.net/api/v3/ayat_timing/soar?read=5"}, ...]
```
- `GET https://mp3quran.net/api/v3/ayat_timing/soar?read=<id>` → `[{"id":1,"name":"الفاتحة","timing_link":".../ayat_timing?surah=1&read=5"}, ...]`

### 3.7 Ayah timing (the heart of the highlight feature)
`GET https://mp3quran.net/api/v3/ayat_timing?surah=<n>&read=<readId>` (both required)
Verified response for `surah=1&read=5`:
```json
[
 {"ayah":0,"polygon":null,"start_time":0,"end_time":2731,"x":null,"y":null,"page":null},
 {"ayah":1,"polygon":"181.08,18.31 57.54,18.31 57.54,48.94 181.08,48.94","start_time":2731,"end_time":5720,"x":"66.48","y":"34.46","page":"https://www.mp3quran.net/api/quran_pages_svg/001.svg"},
 {"ayah":2,"polygon":"203.87,49.07 36.74,49.07 36.74,76.22 203.87,76.22","start_time":5720,"end_time":10592,"x":"43.55","y":"63.20","page":"https://www.mp3quran.net/api/quran_pages_svg/001.svg"},
 ...
]
```
- `start_time`/`end_time` are **milliseconds**. `ayah 0` is the **basmala** (no page/polygon — skip highlight, it's the surah header). For surah 9 (At-Tawbah) there is no basmala.
- `page` is an SVG mushaf page URL, e.g. `https://www.mp3quran.net/api/quran_pages_svg/002.svg`.
- The `page` SVG has `viewBox="0 0 235 235"`, and all `polygon`/`x`/`y` values are in that **235×235 page space** (verified by reverse-mapping the SVG's inner transform matrix against the `ayah:x`/`ayah:y` attributes). See Part 5 for the highlight math.

### 3.8 Linking timing to the catalog (IMPORTANT)
- The timing `read` id is **not** the reciter id. Match a reciter's `moshaf.server` against `reads[].folder_url` (normalize trailing slashes). When a match is found, the app knows this (reciter, moshaf) has timing data → enable ayah sync/highlight. Cross-check `rewaya` names when available.
- Fetch the `reads` list once at startup and cache it.
- If no timing match: play audio normally, show the surah text page without sync or show "لا يوجد توقيت" notice; never crash.

### 3.9 Optional endpoints (only if D4 includes them)
`/api/v3/radios?language=ar`, `/api/v3/live-tv?language=ar`, `/api/v3/videos?language=ar`, `/api/v3/tafasir`, `/api/v3/tadabor?sura=3&language=ar`.

## Part 4 — Quran text source & ayah-numbering sync (decision D2 — AUTHENTIC text/images)

Authenticity requirement: text shown in the app must be the **authentic Uthmani script** (رسم عثماني, same orthography as the Madinah mushaf), and page mode renders authentic Madinah mushaf images. mp3quran **does not provide per-ayah Arabic text** — only timing, page SVGs, and tafsir/tadabor audio — so the ayah text comes from **Tanzil** (the canonical source used by Quran.com and virtually every Quran app):

**Canonical text source — Tanzil Uthmani text, bundled at build time (offline, authentic, stable):**
- Add a Gradle task (or committed download script) that fetches `quran-uthmani.txt` from Tanzil (`https://tanzil.net/pub/download/index.php`, zip `quran-uthmani.zip`) — or the `tanzil/quran-text` GitHub mirror — and extracts it into `app/src/main/assets/quran/` once (skip if present).
- Format: one ayah per line, `surah|ayah|text`, e.g. `1|1|بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ`. Parse at startup into an in-memory `Map<String verseKey, String text>` (e.g. key `"2:1"`); ~6k verses, loads in milliseconds.
- License: Tanzil text is CC BY-NC-ND — fine for a free app; include the attribution in the About/settings screen.
- Surah names: use mp3quran `/api/v3/suwar?language=ar` (Arabic names with diacritics) + Quran.com chapters for English names (D3).

**Enrichment/fallback — Quran.com API v4** (same Tanzil-sourced text, JSON, no key for these endpoints):
- `GET https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=2` → `{"verses":[{"id":...,"verse_key":"2:1","text_uthmani":"...","chapter_id":2,"verse_number":1}, ...]}`
- `GET https://api.quran.com/api/v4/chapters?language=ar` → surah names.
- Use it as a runtime fallback if the bundled asset is missing, and to refresh names. Cache per surah on disk. Set a descriptive User-Agent.

**Mushaf images**: page mode renders mp3quran's SVG pages (authentic Madinah mushaf, Part 5) — no third-party image source needed.

### Numbering sync rules (critical — verified against real timing data)
- For Hafs reads: timing `ayah i` (i ≥ 1) corresponds to Quran.com `verse_key "surah:i"`. Timing `ayah 0` = the basmala, which is **not** a numbered verse for surahs 2–114 (render the basmala as a surah header in text mode, skip in page mode). Exception: surah 1's verse `1:1` **is** the basmala — and timing ayah 0 of surah 1 is the basmala, so the offset is consistent.
- For non-Hafs riwayat (Warsh and others), basmala may be counted as verse 1 → the offset can shift by one. Implement an **offset correction mechanism**: when building the ayah list for a surah, compare the first few ayah texts against known anchors (e.g., surah 1), or expose a per-moshaf offset; validate with surah 1 and surah 2 and log a warning if mismatch. MVP must be correct for Hafs; other riwayat should be "best effort" with the offset mechanism in place.
- Never hardcode timing ids or verse counts; always derive from the API.

## Part 5 — Mushaf page mode & highlight math (VERIFIED)

- Fetch the SVG page (e.g. `https://www.mp3quran.net/api/quran_pages_svg/001.svg`). Render it with **AndroidSVG** (`com.caverock:androidsvg`) into a `Picture`/Bitmap at the display size (SVG is vector → scales crisply to 1080p/4K).
- **Coordinate mapping (verified)**: the SVG `viewBox` is `0 0 235 235` and `polygon`/`x`/`y` are in that space. To draw the highlight on a rendered page of width `W`:
  `screenX = pageSpaceX * W / 235`, `screenY = pageSpaceY * H / 235`.
- Highlight: parse the polygon string `"x1,y1 x2,y2 x3,y3 x4,y4"` → the ayah's bounding quad. Draw a rounded translucent rect (fill ~35% alpha, e.g. yellow/green) inset slightly (1–2px scaled) over the current ayah. If `polygon` is null (basmala/header), draw nothing.
- Fallback highlight: if only `x`/`y` present, draw a small marker circle at that point.
- Auto page-turn: when the current ayah's `page` URL changes, swap in the new page (prefetch next page ahead of time; crossfade optional).
- Caching: LRU bitmap cache of ~6 pages max (604 pages exist; each ~200–500KB at TV resolution); release on navigation away. Coil disk cache can hold decoded pages too.
- Optional (perf): a Gradle/script step that pre-renders all 604 SVG pages to WebP assets once, so runtime never parses SVG — only do this if rendering cost is an issue.

## Part 6 — Screens & remote-control (10-foot UI) spec

### Global rules
- **D-pad only**: no mouse/touch assumptions. Every interactive element must be reachable with D-pad; focus is explicit and visible (scale ~1.05–1.1× + border/glow). No hover-only affordances.
- Focus order: left→right within a row, top→bottom between rows; row movement uses vertical press; wrap-around at row ends (optional, consistent).
- All text ≥ 20sp body / 28sp headings. Focus targets ≥ 48dp (use tv-material sizes). Keep 10ft contrast (WCAG-ish).
- Overscan safety margins (~48dp) around the screen edges.
- Remote media keys: play/pause toggles playback from anywhere in the player. Back button hierarchy: Player → Surah list → Reciters → Home; double-Back on Home exits.
- Loading/error/empty states are focusable and have a Retry action.
- App must handle the `DPAD_CENTER`, `ENTER`, `BACK`, `MEDIA_PLAY_PAUSE`, `MEDIA_NEXT`, `MEDIA_PREVIOUS`, `KEYCODE_CHANNEL_UP/DOWN` (optional) keys.

### Home screen
- Row 1: **Continue listening** card (last reciter/surah/ayah, resume position) if session exists.
- Row 2: **Reciters (A–Z)** — vertical alphabet rail (from the API `letter` field) on the left edge; horizontal row of reciter cards per letter; jump by selecting a letter.
- Row 3: **Recently added reads** (from `/api/v3/recent_reads` — optional).
- (D4 optional rows: Live TV, Radio, Videos.)

### Surah list screen (per selected reciter + moshaf)
- Header: reciter name, moshaf name (changeable via a moshaf picker dialog).
- Grid/row of surah cards (number + name), only available surahs (surah_list). If a moshaf has no surah_list, assume 1–114.
- Focused card scales; select → player screen.

### Player screen (the core)
- Top bar: surah name (Arabic), reciter, moshaf; playback controls row (visible on focus/always).
- **Text mode (default)**: `LazyColumn` of ayah texts; current ayah gets a distinct background + scale; auto-scrolls to keep it centered (animateScrollToItem with a small offset). Selecting an ayah seeks audio to its `start_time`. Basmala shown as header for surahs 2–114.
- **Page mode**: mushaf SVG page with the current ayah highlighted (Part 5); page-turn on ayah crossing.
- **Mode toggle**: on-screen toggle button + remote shortcut (e.g. long-press `DPAD_CENTER` or the info/menu key); state persists.
- Transport controls (D-pad selectable): play/pause, prev/next ayah (seek to `start_time` of prev/next; at surah start/end → prev/next surah), repeat mode cycle (off → ayah → surah → off, with on-screen indicator), speed cycle (0.5, 0.75, 1.0, 1.25, 1.5, 2.0), jump to surah (number pad or list dialog).
- When navigating away from the player to browse more, playback continues in-app (background service optional — see Phase 5).
- Seek bar: D-pad left/right scrubs with 5s steps (or ayah steps when snapped to ayah starts).

## Part 7 — Audio engine & sync algorithm

- **ExoPlayer (Media3)**: `MediaItem.fromUri(audioUrl)`; mp3 has `content-length` so seeking works. Configure buffer sizes for smooth streaming on TV (e.g. 1–5MB min/max buffer).
- **Position ticker**: a coroutine ticker (every ~200ms) or `Player.Listener` reading `player.currentPosition`; find current ayah by **binary search** over the sorted timing array: largest index where `start_time <= position` and `position < end_time` (clamp last ayah). 
- **State updates only on change**: when the ayah index changes, update: highlighted ayah, auto-scroll, page swap. Never recompose the whole list per tick — hoist the "current ayah index" state and give list items stable keys; use `derivedStateOf`/`snapshotFlow` so only the affected item recomposes.
- **Repeat ayah**: when position ≥ ayah `end_time` and repeat=ayah → seek to `start_time` (and briefly flash the ayah). Repeat surah: on `PlaybackState.ENDED` (or last ayah end) → seek to 0.
- **Speed**: `player.playbackParameters = PlaybackParameters(speed)`; keep highlight math time-based so speed changes don't desync (it uses `currentPosition`, not elapsed ticks).
- **Audio focus**: request/abandon; pause on transient loss; resume on gain if user was playing.
- **Media session** (`media3-session`) so the remote's play/pause/media buttons work; optional `MediaSessionService` + notification for background playback (Phase 5 — keep the activity-based session first so Phase 1–4 stay simple).

## Part 8 — Data, caching, offline

- API responses: OkHttp cache or explicit disk JSON cache. Timings are immutable → cache per `(read, surah)` forever (keyed by read id + surah). Catalog (reciters/suwar/riwayat) TTL 24h.
- Quran text (Quran.com): cache per surah on disk after first fetch; show cached text when offline.
- Session state (last reciter/moshaf/surah/ayah, position, settings) in DataStore; write throttled (position writes every ~5–10s, not per tick).
- Single-flight per request; no duplicate API calls when focus moves fast.
- All parsing defensive: trailing commas in `surah_list`, missing fields, null polygons, non-200s → typed errors → user-facing retry.

## Part 9 — Performance ("runs smoothly" on Chromecast with Google TV)

- 60fps UI; no main-thread network/disk; no blocking during playback ticks.
- Lazy lists everywhere; stable keys; no recreated composables per tick.
- Page bitmap cache capped (6); decoded once; release on nav away.
- Avoid blur/large shadow/expensive effects on low-end; `hardwareAccelerated=true`; use `remember` + `derivedStateOf` for derived UI values.
- Prefetch: next surah timing + next page SVG while playing.
- Cold start: show Home from cache instantly, refresh in background.

## Part 10 — Manifest, TV specifics, assets

- Permissions: `INTERNET`; `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (only if background service added in Phase 5).
- Features: `<uses-feature android:name="android.software.leanback" android:required="false"/>`, `<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>`.
- Launcher: `LEANBACK_LAUNCHER` intent filter on the main activity; `android:banner` 320×180 (xhdpi) — generate a simple placeholder banner (XML drawable or vector) so the launcher shows it.
- `android:hardwareAccelerated="true"`, `android:configChanges` for keyboard/orientation as needed, `android:supportsRtl="true"`, locale support ar/en; app label "القرآن" / "Quran TV" (both locales).
- minSdk 23, targetSdk latest stable, compileSdk latest stable available to you; version catalog (`libs.versions.toml`).

## Part 11 — Project structure

```
mp3qurantv/
├── settings.gradle.kts, build.gradle.kts, gradle/libs.versions.toml, gradle wrapper
├── app/
│   ├── src/main/AndroidManifest.xml
│   ├── src/main/java/<pkg>/
│   │   ├── MainActivity.kt            (single activity, Compose for TV)
│   │   ├── navigation/                (simple back-stack state or Navigation Compose — pick simple)
│   │   ├── data/
│   │   │   ├── api/                   (OkHttp + serialization: Mp3QuranApi, QuranApi, DTOs)
│   │   │   ├── cache/                 (disk JSON cache, DataStore)
│   │   │   └── repo/                  (RecitersRepository, TimingRepository, QuranTextRepository, SessionRepository)
│   │   ├── domain/                    (models: Reciter, Moshaf, Surah, AyahTiming, models mapping)
│   │   └── ui/
│   │       ├── home/                  (HomeScreen, ReciterRows)
│   │       ├── surahs/                (SurahGridScreen, MoshafPicker)
│   │       ├── player/                (PlayerScreen, TextModeList, PageModeView, TransportBar, PlayerViewModel)
│   │       └── theme/                 (tv-material theme, focus modifiers)
│   ├── src/main/res/ (icons, banner, strings ar/en)
│   └── src/test/ + src/androidTest/ (a few unit tests: timing binary search, surah_list parsing, coordinate mapping)
└── README.md
```

Dependencies (version catalog): compose BOM, activity-compose, `androidx.tv:tv-foundation`, `androidx.tv:tv-material`, `media3-exoplayer`, `media3-common`, `media3-session`, okhttp, kotlinx-serialization (or retrofit/moshi), coil + coil-svg, `com.caverock:androidsvg`, datastore-preferences, kotlinx-coroutines, room (only if used). Use latest stable versions you know; if a version is uncertain, prefer a known-stable pair and note it.

## Part 12 — Build & verification (MANDATORY before you finish; emulator-first per D6)

1. Scaffold the Gradle project (include the wrapper) and run `./gradlew :app:assembleDebug` until it **passes**. Fix all compile errors yourself.
2. Add and run unit tests: timing binary search, `surah_list` parsing, polygon→screen coordinate mapping, basmala offset logic.
3. **Emulator-first verification (D6)**: create/run an Android TV AVD (Android TV system image, API 30–34), install the APK, and drive the app with the emulator's D-pad/keyboard mapping (arrow keys, Enter, Back, media play/pause) to walk the manual test checklist. Everything must pass on the emulator before real-device work.
4. **Real-device pass (secondary, user does it after emulator sign-off)**: document in the README how to sideload to a real Chromecast with Google TV: enable Developer options + USB debugging on the TV, `adb connect <TV_IP>`, `adb install -r app/build/outputs/apk/debug/app-debug.apk`. List which items must be re-verified on real hardware (remote key behavior, focus feel, performance on the actual TV).
5. Write `README.md` covering prerequisites, build, emulator setup, sideload steps, and the manual test checklist.
6. State honestly which items you could not test and how the user should verify them.
7. Do not leave TODOs that block building. Prefer complete-but-small over stub-heavy.

## Part 13 — Acceptance checklist (implement all; mark off in README)

- [ ] App builds; launches on Android TV emulator; banner + leanback launcher work; no crash on cold start.
- [ ] Home shows Continue, Reciters A–Z rail; reciter list loads from API; works from cache offline.
- [ ] Surah grid shows only available surahs; moshaf picker works when reciter has multiple moshafs.
- [ ] Audio streams and plays; play/pause, seek, speed work; remote media key play/pause works.
- [ ] Text mode: current ayah highlighted, auto-scrolls, in sync with audio (test with `read=5`, surah 1 — timings in Part 3.7). Selecting an ayah seeks.
- [ ] Page mode: mushaf SVG renders; current ayah polygon highlighted; page auto-turns; coordinates align with the ayah text (spot-check surah 1 pages 1–2).
- [ ] Repeat ayah and repeat surah work; indicator visible.
- [ ] Continue listening restores reciter/surah/position.
- [ ] Airplane-mode test: browsing from cache works; audio failure shows Retry.
- [ ] D-pad full navigation of every screen with visible focus; no dead ends.
- [ ] No UI jank while the ayah highlight updates during playback (check on TV-grade emulator).

## Part 14 — Constraints & gotchas (respect these)

- Use the **verified** API facts in Part 3. Never invent endpoints or response shapes; if something 404s, read the docs at `https://www.mp3quran.net/eng/timing-api` and `https://www.mp3quran.net/eng/api`.
- Timing `read` ids differ from reciter ids — always match via `folder_url` ↔ `server`.
- `ayah 0` = basmala (no polygon) — skip highlight; no basmala in surah 9.
- Timestamps are integer milliseconds; some entries may be missing/zero-length — guard against zero-width intervals.
- Arabic text: RTL layout mandatory; system Arabic fonts are fine; don't embed Quran text manually — fetch/bundle via script (D2).
- Network on IO threads only; JSON parsing defensive; trailing commas in `surah_list`.
- No ads, no payments, no analytics. Free and open-feeling app.
- Keep the code modular so later phases (radio, live TV, tafsir) slot in without rewriting.

## Part 15 — Phased delivery

Deliver in phases; **stop and wait for confirmation after each phase** before continuing. Each phase must leave the project compiling. The repo already has git (`main` branch) and a task tracker (`TASKS.md`).

1. **Phase 1 — Skeleton + catalog**: Gradle project, theme, navigation, Home (Continue + Reciters A–Z) and Surah grid from the real API; caching. No playback.
2. **Phase 2 — Player + streaming**: player screen, ExoPlayer streaming, transport controls, speed, media keys, basic error states. No ayah sync yet.
3. **Phase 3 — Text mode sync**: timing fetch + binary search ticker; highlight + auto-scroll; ayah tap-to-seek; repeat ayah/surah; continue-listening persistence.
4. **Phase 4 — Mushaf page mode**: SVG rendering + polygon highlight math + page-turn + bitmap cache (Part 5).
5. **Phase 5 — Polish**: settings, offline polish, media session/background audio, README + acceptance checklist sign-off, unit tests final pass.

**After every phase**: update that phase's checkboxes in `TASKS.md` (mark done + short verification notes), then commit to git with a conventional message (e.g. `feat: phase 1 — catalog browsing`). Work on `phase/N-<name>` branches and merge to `main`, or commit directly if the change is small. Never commit build outputs or local files — `.gitignore` already covers them.

---

# End of prompt
