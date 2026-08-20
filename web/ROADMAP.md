# Quran TV — Web port ROADMAP (awaiting approval)

Compares the **Kotlin/Android app** (`app/`) feature set against the **web port** (`web/`)
and proposes what to build next. **Nothing on this roadmap is implemented until approved.**
The two features already requested and DONE (not part of this roadmap's pending work):
**favourite reciters** and **English reciter-name search**.

## 1. Feature parity matrix — Kotlin app vs web port

| # | Feature | Android (Kotlin) | Web port | Notes |
|---|---------|:---:|:---:|---|
| 1 | Home: Continue listening card | ✅ | ✅ | |
| 2 | Home: reciters A–Z (letter groups + rail) | ✅ | ✅ | |
| 3 | Home: search (Arabic-tolerant) | ✅ | ✅ | + now English names too |
| 4 | Home: recently added reads | ✅ | ✅ | |
| 5 | Home: **favourites** | ❌ (new) | ✅ (new) | added to both platforms' value |
| 6 | Surah grid (only available surahs) | ✅ | ✅ | |
| 7 | Surah grid: moshaf picker / jump dialog | ✅ | ✅ | |
| 8 | Untimed badges (soar list + **real mp3 probe**) | ✅ | ✅ | |
| 9 | Player: transport 3-zone (repeat, speed, time) | ✅ | ✅ | |
| 10 | Player: repeat OFF/AYAH/SURAH | ✅ | ✅ | |
| 11 | Player: playback speed 0.5–2× | ✅ | ✅ | |
| 12 | Player: text mode (Amiri, highlight, auto-scroll, tap-seek, basmala) | ✅ | ✅ | |
| 13 | Player: mushaf page mode — all 6 styles | ✅ | ✅ | Madinah SVG, tajweed, islamic HD, KSU hafs/warsh/tajweed + hilites |
| 14 | Player: two-page spread + page-turn animation | ✅ | ✅ | |
| 15 | Player: tafseer / meanings / translation side panel | ✅ | ✅ | auto-scroll + empty-hide + pin |
| 16 | Player: reciter picker (sorted + search + current ✓) | ✅ | ✅ | + star/favourite + English names |
| 17 | Player: mushaf picker (7 options, style→page mode) | ✅ | ✅ | |
| 18 | Player: no-timing graceful degradation + page browse | ✅ | ✅ | |
| 19 | Reciter switch keeps current surah/ayah | ✅ | ~ | web keeps surah + resumes at the ayah's START (loses position within the ayah) — see gap G3 |
| 20 | **Gapless surah transitions** | ✅ | ~ | ExoPlayer playlist (zero gap); web preloads next (small gap) — gap G1 |
| 21 | Next-surah audio + timing prefetch | ✅ | ✅ | |
| 22 | Continuesting: session save ~5 s + restore | ✅ | ✅ | |
| 23 | Settings: language / speed / font / highlight / mode / style / auto-hide / only-timed | ✅ | ✅ | |
| 24 | Localization ar/en + RTL | ✅ | ✅ | |
| 25 | Amiri / Amiri-Quran fonts | ✅ | ✅ | + Tajawal UI font |
| 26 | **Keep-screen-on (daydream prevention)** | ✅ | ~ | FLAG_KEEP_SCREEN_ON; web has no wake-lock — gap G2 |
| 27 | About screen (version + attribution) | ✅ | ❌ | about_text strings exist but no UI row — gap G5 |
| 28 | Version shown in About | ✅ | ❌ | gap G5 |
| 29 | Offline audio-failure → Retry | ✅ | ✅ | banner + retry |
| 30 | Background media session / notification | ~ (activity-scoped) | ~ | both intentionally activity-scoped |

**Verdict: the web port has reached ~90% feature parity with the Kotlin app.** The
remaining gaps are mostly polish (wake-lock, About/version) plus two engineering
items (gapless audio, exact ayah-position resume).

## 2. Proposed phases (awaiting approval)

### Phase P1 — Closing the Kotlin parity gaps
- **G1 Gapless surah transitions**: WebAudio graph that plays the current surah's
  decoded buffer and crossfades into the next (or overlapping `<audio>` elements
  with a short crossfade). Removes the audible gap between surahs.
- **G2 Keep-screen-on**: `navigator.wakeLock.request('screen')` while playing
  (with fallback for TV webviews that lack it), so the TV doesn't dim during long
  listening.
- **G3 Exact ayah-position resume on reciter switch / continue**: capture the
  current *position within the ayah* and seek to `newReciterAyahStart + offset`
  instead of just the ayah start. Aligns with the Kotlin behavior.
- **G4 More faithful audio-error/Retry interaction** (focused retry button when a
  stream fails) if the banner feels insufficient on TV.

### Phase P2 — Polishing parity (small)
- **G5 About screen**: a Settings row → About dialog with app version, Tanzil /
  mp3quran / KSU attribution, and the version indicator.
- Mark version from `package.json` into the About + the wgt (already in config.xml).

### Phase P3 — Beyond the Kotlin app (optional, product-driven)
- **Favourites polish**: reorder favourites, per-moshaf favourites, fav badge on
  the player top bar / reciter picker, keyboard shortcut to star.
- **Offline**: cache downloaded surahs for offline listening (beyond the Android
  app which is stream-only).
- **More reciter metadata**: biography / nationality / more search aliases.
- **Qur'an text modes**: line-by-line, word-by-word, other qirā'āt text stacks.

## 3. Cross-platform recommendations (no decisions taken)
- Keep **Kotlin** as the Android TV app and the **web port** as Tizen/Vidaa — each is
  the only viable path to its platform (see `PERFORMANCE.md`); do not merge/drop either.
- The new **favourites + English search** features are worth adding to the **Kotlin
  app** too, so both platforms stay feature-aligned. (Not started — needs its own
  approval.)
- Keep the shared domain logic in sync via the mirrored unit-test fixtures (66 each).

## 4. Currently verified (this roadmap is grounded in it)
- 66 unit + 6 e2e green (incl. English search + favourites)
- TV Simulator live walk: favourites row, English "Maher" search, tafseer, spread,
  all 6 mushaf styles, borderless highlight, semi-transparent transport
- `PERFORMANCE.md`: web 151 KB / 3 MB / ~110 ms vs native 27 MB / 166 MB / 1.1 s — keep both

---

**To approve**: tell me which phases to start (P1, P2, and/or P3 items), or pick
specific items. Everything lands behind these checkboxes only after your go-ahead.
