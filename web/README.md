# Quran TV — Tizen OS + Vidaa OS port (`web/`)

The same Quran TV product as the Android app in `../app`, rebuilt as a **shared
TypeScript/HTML5 web app** that runs on both TV platforms:

| Target | Packaging | Notes |
|--------|-----------|-------|
| **Tizen** (Samsung) | `.wgt` (zip + `config.xml`) | Installed via `sdb`/`tizen install` on the TV emulator or a real TV (signed for retail; unsigned sideload for dev) |
| **Vidaa** (Hisense) | Hosted web app / PWA | Vidaa has no public SDK or emulator; its apps are plain web apps. Install via the community `vidaa-edge` PWA installer on a real TV; validate in Chromium (same web engine family) |

Why a web app: neither Tizen nor Vidaa runs Android, but both run HTML5. The
port keeps the pure domain logic (timing binary search, asymmetric
trailing-silence accuracy gate, basmala offset, viewBox page mapping, Arabic
search normalization) as a **1:1 TypeScript port** of the Android Kotlin, with
the same unit fixtures. Verified live: mp3quran.net sends
`Access-Control-Allow-Origin: *` on every endpoint (API, timing, SVG pages,
MP3 audio), so a hosted app consumes the whole backend from any origin.

## Stack

- [Vite](https://vitejs.dev) + [TypeScript](https://www.typescriptlang.org) + [SolidJS](https://www.solidjs.com) (fine-grained reactivity, small runtime — 23 KB gzipped)
- [Vitest](https://vitest.dev) unit tests (`tests/`), [Playwright](https://playwright.dev) e2e TV-keycode tests (`tests/e2e/`)
- Build target `es2019` (Tizen 5.5+/6.x webviews are Chromium ~79–92)

## Development

```bash
cd web
npm install
npm run assets     # copies quran-uthmani.txt + Amiri font from ../app
npm run dev        # dev server on :5173
npm run build      # production build → dist/ (base "./": works from file:// wgt and hosted)
npm run preview    # serve dist on :4173
```

## Tests

```bash
npm test                  # 49 unit tests (ported Android fixtures)
npx playwright install chromium
npx playwright test       # 3 e2e tests — drives the app ONLY with TV keys
                          # (arrows/Enter/Escape/i/Space) in Chromium = the
                          # Vidaa web-runtime stand-in; Tizen uses the same DOM codes
```

## Tizen packaging

```bash
bash scripts/build-tizen.sh     # → dist/QuranTV.wgt (unsigned)
```

The `.wgt` contains `config.xml` (TV profile, `internet` privilege, `hwkey-event`),
`index.html`, the JS/CSS bundle, icons, the bundled Tanzil text and the Amiri font.

### TV emulator (Linux, KVM)

Requires Tizen Studio (web-cli) + the `TV-SAMSUNG-Public-Emulator` device image
(installed via the package manager; an Arch `dpkg` shim satisfies its Ubuntu
prereq check — see `scripts/setup-tizen.sh`).

```bash
~/tizen-studio/tools/emulator/bin/em-cli list-vm        # instances
~/tizen-studio/tools/emulator/bin/em-cli launch -n <vm> # boot (headless-safe)
export PATH=$HOME/tizen-studio/tools:$PATH
sdb devices                                            # emulator visible
sdb shell 0 vd_sendkey 24                              # remote: dpad-ok, 24=ok
sdb install dist/QuranTV.wgt                           # install
# launch: from the TV launcher, or:
sdb shell 0 launch_app org.qurantv.QuranTV.web
```

Remote keys on the emulator: `vd_sendkey` codes — arrows 19/20/21/22, OK 24,
Back 10009 via `0 vd_sendkey 27`? (see the Samsung TV Emulator docs; the app
also accepts Enter/Escape for testing).

### Real Samsung TV (user-side)

1. Enable **Developer Mode** on the TV (Samsung account → developer mode ON)
2. `sdb connect <TV-IP>`, then `sdb install QuranTV.wgt` (unsigned wgts install
   in developer mode on 2016+ Tizen TVs)
3. Or package with a Samsung certificate (Tizen Studio Certificate Manager) for
   store/distribution builds

## Vidaa (Hisense) — real device

Vidaa apps are hosted web apps. Two ways to install (community tooling, no
official SDK):

- **vidaa-edge** (`https://github.com/weinzii/vidaa-edge`): serves the built
  `dist/` over HTTPS (self-signed cert included), installs it as a PWA via
  `Hisense_installApp` / `Appinfo.json` on your own TV (requires DNS pointing
  `vidaahub.com` to your host).
- Any web server: open the app's URL in the TV browser and use it as a web app.

The `dist/` build is fully self-contained and CORS-ready (mp3quran.net allows
all origins). A `manifest.webmanifest` is included for PWA installability.

## Feature map vs the Android app

| Feature | Android | web port |
|---------|---------|----------|
| Reciters A–Z + search (Arabic-tolerant) | ✅ | ✅ |
| Surah grid + moshaf picker + jump | ✅ | ✅ |
| Audio + transport (repeat, speed, ayah/surah nav) | ✅ | ✅ |
| Ayah sync (timing binary search + accuracy gate) | ✅ | ✅ |
| Text mode (Amiri, highlight, auto-scroll, tap-to-seek) | ✅ | ✅ |
| Mushaf page mode (SVG + polygon highlight + page-turn) | ✅ | ✅ (single page; spread animation deferred) |
| KSU raster styles (حفص/ورش/التجويد) + hilite API | ✅ | ⏳ later phase |
| islamic.app Madinah HD pages | ✅ | ⏳ later phase |
| Tafseer / word meanings / translation side panel | ✅ | ⏳ later phase (needs .ayt → JSON) |
| Continue listening + session | ✅ | ✅ |
| Settings (language/speed/font/color/modes) | ✅ | ✅ |
| Two-page spread + page-turn animation | ✅ | ⏳ deferred |
| Gapless surah transitions (ExoPlayer playlist) | ✅ | ~ (preload next; true gapless needs WebAudio) |

## Known limitations

- **Vidaa has no emulator** — Chromium e2e tests are the stand-in; final pass
  must happen on a real Hisense TV (see the vidaa-edge kit above).
- Tizen emulator keys: full remote-key walk uses `sdb shell 0 vd_sendkey`.
- Background playback/media-session notification: not implemented (same as the
  Android activity-scoped scope).
- `timingUsability` (per-surah mp3 probe for badges) is ported but the surah
  grid badges currently use the soar list only.
