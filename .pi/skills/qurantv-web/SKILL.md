---
name: qurantv-web
description: Verified architecture, environment, and hard-won gotchas for the Quran TV WEB port (web/ SolidJS+Vite app + tvweb/ Android TV WebView wrapper). Use when touching web/src or tvweb/ — SolidJS reactivity traps, the file:// fetch/XHR rule, viewport/DPR pinning, audio-engine + gapless transition state machine, retained-player layer, D-pad focus engine, on-screen keyboard, and the Android TV emulator workflow on this machine. These findings cost hours of debugging; do not re-derive them.
---

# Quran TV — Web Port Guide (SolidJS + Vite + tvweb WebView)

Same product as the Android app in `app/`, rebuilt as a shared TS/HTML5 app:
`web/` (Vite + SolidJS, es2019 target for Tizen Chromium ~79-92) and `tvweb/`
(a thin Android WebView that loads `web/dist` from assets). Runs on Android
TV, Tizen, Vidaa (hosted web). mp3quran.net serves `Access-Control-Allow-Origin: *`.

Read `web/README.md` for the dev loop; this skill is the non-obvious, verified
stuff.

---

## 1. Environment / emulator workflow (this machine)

- No root: Android SDK at `$HOME/Android/sdk`, Temurin JDK 17 at
  `$HOME/Android/jdk-17.0.20+8`. `local.properties` was fixed to
  `sdk.dir=/home/mohamed/Android/sdk`.
- AVD `GoogleTV_1080p`: Android 14 Google TV, **4K 3840×2160, native density
  320** (config.ini `hw.lcd.width/height=3840/2160, density=320`). Never hack
  `wm density` — the tvweb viewport pin (below) makes the app render at design
  scale at native density.
- Host has no KWin window-rule support (Wayland ignores them). The emulator
  window is kept on-screen / windowed-50% by the watchdog:
  `scripts/emu-window-watchdog.sh` (uses `scripts/emu-window.c` /
  `scripts/emu-keys.c` — X11 helpers, auto-built). `emu-keys` can send keys to
  the emulator window via XTEST.
- **CDP debugging**: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`
  then drive `http://127.0.0.1:9222/json` with a WebSocket. The app exposes a
  live state hook `window.__quranTv.getState()` (surahId, currentAyah, entries,
  hasTiming, positionMs, …) — read it for sync assertions. Re-run the forward
  after every app restart (the socket dies with the process).
- **mp3quran.net is slow/flaky (8-20 s per request)**: e2e tests and manual
  checks need generous waits; the catalog can stall the home screen for tens of
  seconds. Live-network e2e flakes are expected — re-run before suspecting a
  regression.

## 2. The file:// rule — fetch is BLOCKED, XHR works

Android WebView (tvweb loads `file:///android_asset/www/index.html`):
`fetch()` throws "Failed to fetch" on file:// URLs, but **XHR works** (tvweb
enables `allowFileAccessFromFileURLs`). All bundled-asset loads must use
`data/assetLoader.ts` → `loadAssetText(url)` (XHR). **Never add a bare
`fetch()` for a bundled asset** (tafseer JSONs, the Tanzil text bundle) — it
silently empties the side panel / text mode in the APK while passing e2e
(which runs over http).

## 3. Viewport pin (tvweb) — density-320 TV webviews

Android TV WebViews report density 320 (DPR 2), so `device-width` gives a
960×540 CSS viewport and the 1920×1080-tuned app renders 2× oversized.
`tvweb/build.gradle.kts` rewrites the viewport meta to `width=1920` in the
copied `index.html` + `MainActivity` sets `useWideViewPort` /
`loadWithOverviewMode`. Result: CSS viewport is exactly 1920×1080 on any
panel/DPI; 1 CSS px = 1 surface px. Keep this if you touch the build step.

## 4. Repeated fixes — symptom → root → fix (check these first)

These bugs recurred across the session; each row is a "when X looks broken,
check Y" pattern. The root causes are in section 5/6/7 — this is the triage
table.

| Symptom | Root | Fix |
|---|---|---|
| Play/pause icon shows ▶ while audio plays | ended element's spurious "pause" event, OR pause() left the crossfade carrier playing, OR the icon switch ran once in the body, OR a memo over the prop didn't re-evaluate | both-paused guard on the engine event; pause() stops both elements; icon via createMemo; read props in the render |
| Icon frozen on play after SVG rewrite | body `switch` runs once | move the switch into createMemo (see §5) |
| Mushaf pages flash wrong / freeze the old spread on transition | stale timing + new surah mix; memo writing lastKnownPage; tracked read not first | timing cleared before activeSurah; lastKnownPage surah-tagged + effect-updated; read props.surah.id at memo top (see §5/6) |
| Highlight frozen (audio runs on) | timing fetch failed/hung; no re-attempt | ApiClient 15 s timeout; loadTiming retries; scheduleTimingSync background loop (see §5) |
| prev/next-surah "dead", mixed header/audio | playSurah applied state early, superseded mid-load | apply ALL state + engine.play atomically at the end; seq guard (see §5) |
| Arrows flip mushaf pages instead of stepping ayahs | no-timing page-browse fired while timing merely loading | page-browse only when hasTiming() === false (see §5) |
| Retained-player chrome visible on other screens | display:none computed inside a For callback (not reactive) | move it to an App-level memo outside the For (see §6) |
| Mushaf panes 0-height / blank bottom | retained wrapper had no height; player root height:100% collapsed | wrapper carries width/height:100% when visible (see §6) |
| D-pad skips partial rows / jumps by column | gap+perp score let a column-aligned cell two rows down win | row-primary: nearest perpendicular row (12 px band) then closest cell (see §7) |
| OK/Enter re-runs the search instead of activating a chip | the search input kept DOM focus; its Enter handler fired | focusElement blurs the input when focus leaves it (see §7) |
| On-screen keyboard "dead" after one letter | kbChar bounced focus back to the input | keep focus on the keys (see §7) |
| Tafseer/meanings/translation empty in the APK | fetch() blocked on file:// | loadAssetText (XHR) for bundled assets (see §2) |
| e2e fails intermittently | live mp3quran latency | generous waits; re-run before suspecting a regression (see §1) |

## 4b. SolidJS reactivity traps (each cost a debugging session)

1. **Reads inside a `<For>` callback are NOT reactive to external signals** —
   compute visibility/derived state in a memo at the component root and read
   THAT in the For (the retained-player `display:none` wrapper bug).
2. **A plain `switch`/`if` in a component body runs ONCE** — prop-driven
   content must live in a `createMemo` (the play/pause icon froze on play).
3. **A top-level `createMemo` over a prop did NOT re-evaluate in this Solid
   build** — read the prop directly in the render instead (the position text
   updated; the memoized icon didn't).
4. **Memos must not write state** — side effects belong in `createEffect`
   (the mushaf `lastKnownPage` memo-write froze the old spread).
5. **Tracked reads must come FIRST in a memo** — a signal read only inside a
   conditional branch isn't tracked (the surah-change guard silently compared
   a stale surah id).

## 5. Audio engine + gapless transitions (player/AudioEngine.ts)

- Two `<audio>` elements (current + carrier); the carrier crossfades in near
  the end and roles swap on `ended`.
- **An ENDED element still has `paused === false`** — calling `pause()` on it
  fires a "pause" event → a spurious state flip. `onPlayStateChange(false)`
  must fire only when BOTH elements are paused.
- `pause()` must stop BOTH elements (pausing just `current` mid-crossfade
  leaves the carrier audible while the icon shows ▶).
- `destroy()` must `el.remove()` the elements (retained players leak them
  into the DOM otherwise).
- **Transition state machine (PlayerScreen):**
  - The gapless attach must clear timing (`setTiming(null)`) BEFORE switching
    `activeSurah` — the reverse order lets a stale entry tag the new surah's
    page id and freeze the old spread.
  - `playSurah` must load EVERYTHING (timing + text) first, then apply all
    state + `engine.play` atomically at the end; a superseded (seq-guarded)
    call changes nothing. Applying state early left activeSurah switched with
    the old audio/timing — previous-surah "dead" and highlight frozen.
  - Keep a monotonic `playSeq`; rapid nav presses make the last call win.
  - Timing fetches fail/hang on the flaky server: `ApiClient.getText` has a
    15 s AbortController timeout, `loadTiming` retries 3×, and a failed load
    starts a 10 s background re-sync (`scheduleTimingSync`) that re-applies
    the timing + re-derives the ayah from the live position. Without it the
    highlight freezes for the whole surah.
  - `nextAyah`/`prevAyah`: the no-timing page-browse fallback applies ONLY
    when `hasTiming() === false` — never while the timing is merely loading
    (arrows must not flip mushaf pages mid-transition).
  - prevAyah at a surah's first ayah plays the previous surah's last ayah
    (`playSurah(prev, versesCount)`) — it is transient (that ayah ends → the
    gapless returns), which is correct.

## 6. Retained player layer (audio keeps playing on other screens)

`App.tsx` keeps the last player route mounted as a keyed layer: `display:none`
when another screen is on top (audio continues), remounted only on a new
recitation (keyed by reciter/moshaf/surah/resume-point). Gotchas:
- The `display:none` wrapper must be OUTSIDE the `<For>` (For callbacks aren't
  reactive) and carry `width/height:100%` when visible (the player root uses
  height:100%; an auto-height wrapper collapsed the mushaf panes to 0).
- `PlayerScreen` needs a `hidden` prop: key handlers, the chrome auto-hide
  timer, and focus must idle while hidden; hiding clears app focus so a stale
  play button can't trap the D-pad.

## 7. D-pad focus engine (ui/focus.ts)

- **Row-primary navigation**: move DOWN/UP to the nearest perpendicular row
  (12 px band), then the closest cell within it — the old `gap + 1.5×perp`
  score skipped partial rows (a letter group with 2 reciters was unreachable).
- `focusElement` must blur the search `<input>` when app focus leaves it —
  otherwise Enter/OK hits the input (re-runs the search) instead of the
  focused chip (mushaf picker felt like it "didn't wait").
- The on-screen TV keyboard (`TVKeyboard`) must KEEP focus while typing —
  `kbChar` must not bounce focus back to the input (it stranded the user
  after one letter).

## 8. UX behaviors the user asked for (do not regress)

- **Hidden-chrome LEFT/RIGHT step ayahs** (RTL: LEFT = next, RIGHT =
  previous) without revealing the toolbar — replaces the ±5 s scrub. Keep the
  default 10 s scrub only when the toolbar is visible. prevAyah at a surah's
  first ayah plays the previous surah's last ayah (see §5).
- **Persistent audio across screens**: backing out of the player keeps the
  audio playing via the retained layer (§6).
- **Dashboard order**: search → one-row recents (scrollable `.h-scroll`) →
  continue → favourites → fixed letter rail (OUTSIDE the scroll container) →
  groups. Initial focus: the continue card.
- Transport icons are SVG paths with a stable `transport-play` id for e2e
  (RTL page flips the cluster, not the icon). Cluster order (filter `.icon-btn`
  with an SVG): 0 prevSurah, 1 prevAyah, 2 play/pause, 3 nextAyah, 4 nextSurah.
- Gold-on-gold: the focused big icon keeps a dark icon fill (`.icon-btn.big.focused`).
- After a surah change both elements must be paused before the new one plays
  (a stale "playing" event skipped the pause → icon mismatch).

## 9. Build / deploy / verify loop

```
cd web && npm run check && npm run build && npm test
# unit tests: vitest; e2e: npx playwright test (live mp3quran — flaky, re-run)
export JAVA_HOME=$HOME/Android/jdk-17.0.20+8 PATH=$JAVA_HOME/bin:$PATH
./gradlew :tvweb:assembleDebug --no-daemon
export PATH=$HOME/Android/sdk/platform-tools:$PATH
adb install -r tvweb/build/outputs/apk/debug/tvweb-debug.apk
adb shell am force-stop com.qurantv.tvweb && adb shell am start -n com.qurantv.tvweb/.MainActivity
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.qurantv.tvweb | tr -d '\r')
curl -s http://127.0.0.1:9222/json   # CDP page list → websocket → Runtime.evaluate
adb exec-out screencap -p > shot.png # screen evidence
```

- CDP assertions: `Runtime.evaluate` with `returnByValue:true` +
  `awaitPromise:true`; the player exposes `window.__quranTv.getState()`
  (`{phase, surahId, currentAyah, hasTiming, positionMs, entries, …}` — absent
  on home; press the focused continue card to resume). `[data-highlight]` = the
  current-ayah highlight element (its rect top moves with the ayah).
- If the emulator drops to the launcher or the CDP socket dies, re-forward +
  `am start` (the watchdog script keeps the window, not the app).
- Verify transitions by the STATE, not the UI: all of surahId/timing
  entries/audio src/header must flip together (the mixed-state tell).

## 10. Platform constraints (web target)

- The app targets es2019 / Tizen Chromium ~79-92: **no
  `Promise.withResolvers`** (ES2024/Chrome 119+) — use `new Promise`.
  `AbortController` is fine (Chrome 66+).
- No external fonts over http at runtime; the Android build bundles everything
  into the APK assets.
- The WebView blocks `fetch()` on file:// (see §2) and has no localStorage
  persistence guarantees beyond what tvweb enables.

## 11. Committing hygiene

The repo stores LF; Windows checkouts leave CRLF in working files. Before
`git add`, normalize edited files: `sed -i 's/\r$//' <file>` — otherwise the
commit is whole-file churn. Set identity: `git config user.name/email`
(Mohamed Elbeshbeshy <drelsaka1993@gmail.com>). Don't commit screenshots or
compiled X11 helpers (commit the .c sources); `local.properties` is ignored.
