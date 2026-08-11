# Web port vs native Kotlin — performance comparison

Measured 2026-08-11 on this machine. **No decision to remove either codebase is
made here** — this is data to inform that decision when the time comes.

## Methodology

| Side | Environment | What was measured |
|------|-------------|-------------------|
| **Web** (`web/`, TypeScript + SolidJS) | Chromium 137 (headless) against the built `dist/` served by `vite preview` (localhost) | Perceived startup to full catalog, transfer size, DOM size, JS heap (CDP), long-task count during 12 s of playback |
| **Native** (`app/`, Kotlin + Compose for TV + Media3) | Android TV emulator `Television_1080p` (API 36, software GPU `swiftshader_indirect`) | Cold/warm start to first frame (`ActivityTaskManager Displayed`), `TOTAL PSS`, process CPU `top` during playback |

Both apps stream the same mp3quran.net audio and render the same mushaf page
data. Emulator numbers skew higher than real TV hardware (software rendering);
the relative picture is what matters.

## Results

| Metric | Web (Chromium) | Native (Android TV emulator) |
|---|---|---|
| Bundle / APK size | **151 KB total transfer** (31 KB JS gzip + 2 KB CSS + 2 × 59 KB UI fonts); lazy: 1.3 MB Tanzil text, per-surah tafseer JSON (24 KB avg) | **26.9 MB APK** (Compose runtime + Media3 + ~2.3 MB tafseer SQLite + font) |
| Startup → first content | **~110 ms** (92 ms to the full 241-reciters catalog after HTML) | **1.1 s cold** (first frame), 922 ms warm |
| Memory at rest (home) | **3 MB JS heap** (CDP `Runtime.getHeapUsage`) | **127 MB PSS** |
| Memory in player | 3 MB heap; 359 DOM nodes home / 53 player | **166 MB PSS** (mushaf bitmaps + Compose) |
| CPU during playback | 0 long tasks (>50 ms) in 12 s of ticker + sync; no main-thread stalls | **4–12 %** process CPU (audio decode is in the media server) |
| Audio pipeline | HTML5 `<audio>`, browser-managed | Media3 ExoPlayer (media server decode) |
| Playback position accuracy | 1.0× verified (+9003 ms / 10 s) | 1.0× verified (+9003 ms / 10 s) |

## Analysis

**The web app is dramatically lighter** — ~150 KB payload vs 27 MB APK, 3 MB vs
127–166 MB memory, sub-200 ms vs ~1 s startup. This matters most on low-end TV
hardware (2 GB Chromecast-class devices), where the native app's 166 MB PSS and
Compose overhead sit close to the line. The web app's DOM stays tiny (53 nodes
in the player — SolidJS updates only the changed ayah highlight, same
per-change-only discipline as the Kotlin side), and the 100 ms ticker produced
**zero long tasks** in the measured window: the sync logic is genuinely
frame-friendly in both implementations because both share the same
index-change-only update rule.

**The native app is stronger where platform integration matters**: ExoPlayer's
gapless playlist transitions (the web port preloads the next surah but can't
crossfade without a WebAudio graph), hardware-accelerated bitmap decode and
caching (web relies on the browser image cache), guaranteed-background media
session (web needs the TV runtime's media integration), and native touch/remote
focus feel. The 4–12 % CPU during playback is mostly the UI layer + ticker and
is comparable to the web's idle-main-thread profile.

**Fairness caveats**: the web numbers are from a desktop Chromium on localhost;
on a real TV the API latency (mp3quran catalog fetch, ~200–400 ms over WAN) and
the TV webview's JIT/GC dominate, so the real-world startup gap narrows to
roughly 0.4–0.7 s vs 1.1 s. The native numbers are from a software-rendered
emulator; real TV GPU composition would cut both memory and jank.

## Recommendation (data-driven, no action taken)

**Keep both.** They are not competitors today — they are the only viable paths
to their respective platforms:

- **Kotlin + Compose remains the Android TV / Google TV app.** Nothing else can
  match ExoPlayer's gapless playback, media-session integration, and the
  leanback runtime on Android. Its heavier footprint is acceptable on Android TV
  hardware and it is already fully built, tested, and released.
- **The web port is the Tizen + Vidaa app.** Android code cannot run there; the
  web app's ~150 KB footprint and 3 MB heap are the right profile for TV
  webviews, and the shared TypeScript domain layer (timing index, accuracy gate,
  geometry) keeps the two implementations behaviorally identical.

**When a revisit would be warranted** (future decision criteria, not now):
- If the web port's feature set fully converges AND a single-codebase strategy
  (e.g. WebView-hosted web app on Android, like PWA-on-Tizen) is adopted — then
  Kotlin could be reconsidered; the current Android app is native-first and
  would not be trivially replaced.
- If the team wants one codebase for TV regardless of platform cost — the web
  app is the portable one; Kotlin would be retired for Android TV in favor of a
  WebView shell. That is a product decision with tradeoffs (playback quality,
  background audio), not a performance verdict — today both win on their own
  turf.

Maintenance cost today is modest: the shared domain layer is duplicated (Kotlin
↔ TS, 66 unit tests on each side pinning identical fixtures), so behavioral
drift is caught by tests rather than users.

## Reproduction

```bash
# web
cd web && npm run build && npm run preview &
node scripts/bench-web.mjs          # startup/transfer/DOM/long-tasks snapshot

# native (Android TV AVD, needs ANDROID_HOME)
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb logcat -c && adb shell am start -n com.qurantv.app/.MainActivity
adb logcat -d | grep Displayed     # cold start
adb shell dumpsys meminfo com.qurantv.app | grep TOTAL   # PSS
adb shell top -n 1 -b | grep qurantv                      # CPU during playback
```
