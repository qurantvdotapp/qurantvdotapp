// Player screen — timing load, audio engine, ayah sync (ported TimingIndex +
// accuracy gate), text mode, mushaf page mode, transport, dialogs, session.

import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Moshaf, QuranSurah, Reciter, SurahTiming, TimingRead } from "../../domain/Models";
import { availableSurahIds } from "../../domain/Models";
import { audioUrlFor, normalizeServerUrl } from "../../domain/CatalogParsing";
import { ayahAt, repeatAyahTarget } from "../../domain/TimingIndex";
import { verseKeyFor, suggestOffset } from "../../domain/BasmalaOffset";
import { isReliable } from "../../domain/TimingAccuracy";
import { reciterMatchesQuery } from "../../domain/search";
import { arabicCollator, type Lang, type TFunction } from "../../i18n/strings";
import { appContainer } from "../../data/AppContainer";
import { AudioEngine } from "../../player/AudioEngine";
import { requestWakeLock, releaseWakeLock } from "../../player/wakeLock";
import { nextRepeat, type RepeatMode } from "../../player/RepeatMode";
import { setMediaKeyHandler } from "../mediaKeys";
import { Chip, Dialog, DialogRow, LoadingState, ErrorState, StarButton, focusable } from "../components";
import { focusFirst, focusElement, clearFocus } from "../focus";
import { TextModeList, type TextItem } from "./TextModeList";
import { TransportBar } from "./TransportBar";
import { MushafPageView } from "./MushafPageView";
import { MushafSpreadView } from "./MushafSpreadView";
import { MUSHAF_STYLES, mushafStyle } from "./mushafStyles";
import { SideContextPanel, modeLabel, modeShortLabel } from "./SideContextPanel";
import type { TafseerMode } from "../../data/repo/TafseerRepository";
import type { Navigator } from "../navigation";

interface PlayerProps {
  t: TFunction;
  lang: Lang;
  nav: Navigator;
  reciter: Reciter;
  moshaf: Moshaf;
  surah: QuranSurah;
  availableSurahs: QuranSurah[];
  startAyahIndex?: number;
  /** Seek to ayahStart + offset (position within the ayah) — G3. */
  resumeOffsetMs?: number;
  /** Retained behind another screen: audio keeps playing, view handlers idle. */
  hidden?: boolean;
}

const SPEED_CYCLE = [0.5, 0.75, 1, 1.25, 1.5, 2];
const HIGHLIGHT_COLORS = ["#e8c877", "#7fd1a3", "#7ac7e0"];
const FONT_SIZES = [26, 34, 44];

export function PlayerScreen(props: PlayerProps) {
  const c = appContainer();
  const settings = c.session.settings();

  const engine = new AudioEngine();
  let gaplessSurah: QuranSurah | null = null; // next surah whose audio we buffer
  const [phase, setPhase] = createSignal<"loading" | "ready" | "error">("loading");
  const [timing, setTiming] = createSignal<SurahTiming | null>(null);
  const [hasTiming, setHasTiming] = createSignal(true);
  const [items, setItems] = createSignal<TextItem[]>([]);
  const [basmala, setBasmala] = createSignal<string | null>(null);
  const [currentAyah, setCurrentAyah] = createSignal(props.startAyahIndex ?? 0);
  const [positionMs, setPositionMs] = createSignal(0);
  const [durationMs, setDurationMs] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [repeat, setRepeat] = createSignal<RepeatMode>("off");
  const [speed, setSpeed] = createSignal(settings.defaultSpeed);
  const [displayMode, setDisplayMode] = createSignal(settings.displayMode);
  const [style, setStyle] = createSignal<number>(settings.mushafStyle);
  const [noTimingPage, setNoTimingPage] = createSignal(props.surah.startPage);
  const [chromeVisible, setChromeVisible] = createSignal(true);
  const [activeSurah, setActiveSurah] = createSignal<QuranSurah>(props.surah);
  const [dialog, setDialog] = createSignal<null | "jump" | "mushaf" | "reciter" | "moshaf" | "view">(null);
  const [sideView, setSideView] = createSignal<null | TafseerMode>(null);
  const [ctxContent, setCtxContent] = createSignal<Map<number, { text: string; ayah: number }> | null>(null);
  const [pickerReciter, setPickerReciter] = createSignal<Reciter | null>(null);
  const [query, setQuery] = createSignal("");
  const [allReciters, setAllReciters] = createSignal<Reciter[]>([]);
  const [timedUrls, setTimedUrls] = createSignal<Set<string>>(new Set());
  const [favourites, setFavourites] = createSignal<Set<number>>(c.session.favouriteReciterIds());
  const [errorMsg, setErrorMsg] = createSignal("");
  const [audioError, setAudioError] = createSignal(false);
  let lastPlayUrl: string | null = null;
  /** Monotonic playSurah sequence — rapid navigation discards superseded loads. */
  let playSeq = 0;

  /** Previous tick's ayah index + timing, for repeat-ayah boundary detection. */
  let lastTickAyah = -1;
  let lastTickTiming: SurahTiming | null = null;


  /* ---------- retained player: re-show / hide ---------- */
  createEffect(() => {
    if (props.hidden) {
      // Retained behind another screen: drop app focus so the stale play
      // button can't trap D-pad navigation on the visible screen.
      clearFocus();
      return;
    }
    // Returning to the retained player (audio never stopped): reveal the
    // toolbar and land focus on play/pause, same UX as opening a surah.
    setChromeVisible(true);
    window.setTimeout(() => {
      if (!document.querySelector(".dialog-list")) focusElement("transport-play");
    }, 60);
  });

  /* ---------- media keys (global) ---------- */
  onMount(() => {
    setMediaKeyHandler((key) => {
      if (key === "playPause") togglePlay();
      else if (key === "next") nextSurah();
      else if (key === "prev") prevSurah();
      else if (key === "info") setDisplayMode(displayMode() === 1 ? 0 : 1);
    });
  });
  onCleanup(() => {
    setMediaKeyHandler(null);
    engine.destroy();
    releaseWakeLock();
  });

  /* ---------- chrome auto-hide (page mode) ---------- */
  let lastKey = Date.now();
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      // Retained-but-hidden: the player must not react to keys (no chrome
      // reveal, no focus steal) while another screen is on top.
      if (props.hidden) return;
      const wasHidden = displayMode() === 1 && !chromeVisible();
      lastKey = Date.now();
      // Hidden fullscreen page: LEFT/RIGHT step AYAHS (RTL — next is left,
      // previous is right) WITHOUT revealing the chrome; the page holds the
      // screen so navigation gives audible feedback instead.
      if (wasHidden && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        if (e.key === "ArrowLeft") nextAyah();
        else prevAyah();
        e.preventDefault();
        return;
      }
      setChromeVisible(true);
      // Any key while hidden reveals the toolbar with PLAY/PAUSE selected —
      // the next OK/Enter then toggles playback (TV convention: first press
      // shows the controls, second press acts on them). Delay past SolidJS's
      // effect flush so the chrome-hidden class is off before the focus
      // engine's visibility check.
      if (wasHidden) {
        window.setTimeout(() => focusElement("transport-play"), 60);
      }
    };
    window.addEventListener("keydown", onKey, true);
    const hideTimer = window.setInterval(() => {
      if (props.hidden) return; // retained behind another screen
      if (
        dialog() === null && // never auto-hide while a dialog is open
        displayMode() === 1 &&
        playing() &&
        settings.autoHideControls &&
        chromeVisible() &&
        Date.now() - lastKey > 5000
      ) {
        setChromeVisible(false);
        clearFocus(); // next key reveals the toolbar, it must not re-activate the hidden button
      }
    }, 500);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey, true);
      window.clearInterval(hideTimer);
    });
  });

  /* ---------- engine callbacks ---------- */
  engine.onPosition = (ms) => {
    setPositionMs(ms);
    const d = engine.durationMs();
    if (d > 0 && d !== durationMs()) setDurationMs(d);
    const t = timing();
    if (t && hasTiming()) {
      if (t !== lastTickTiming) {
        lastTickAyah = -1;
        lastTickTiming = t;
      }
      const idx = ayahAt(t, ms);
      if (idx !== currentAyah()) setCurrentAyah(idx);
      // Repeat ayah: when playback crosses the current ayah's end, jump back to
      // its start. `ayahAt` advances at the exact boundary (contiguous timing:
      // next.start == current.end), so the ENDING ayah is the previous tick's —
      // decide in the domain (see repeatAyahTarget), never on the current idx.
      if (repeat() === "ayah" && lastTickAyah >= 0) {
        const prev = lastTickAyah;
        const entry = t.entryFor(prev);
        if (entry) {
          let end = entry.endMs;
          if (end <= entry.startMs && prev === t.lastAyahIndex) {
            const dur = engine.durationMs();
            if (dur > entry.startMs) end = dur; // mp3 duration = last ayah's effective end
          }
          const target = repeatAyahTarget(t, prev, idx, ms, end);
          if (target !== null) {
            engine.seekTo(target);
            lastTickAyah = ayahAt(t, target);
            return;
          }
        }
      }
      lastTickAyah = idx;
    }
  };
  engine.onEnded = () => {
    if (repeat() === "surah") return; // handled by the engine itself
    const next = nextSurahAfterCurrent();
    if (next) {
      playSurah(next);
    } else {
      engine.pause();
      setPlaying(false);
    }
  };
  engine.onError = (url) => {
    setAudioError(true);
    setErrorMsg(props.t("error_audio"));
    lastPlayUrl = url || lastPlayUrl;
  };
  engine.onLoaded = (ms) => {
    setDurationMs(ms);
    const t = timing();
    if (t && ms > 0) {
      setHasTiming(isReliable(ms, t.lastEndMs));
    }
  };
  engine.onGaplessAdvanced = (url) => {
    const next = gaplessSurah;
    if (!next) return;
    void attachSurahForGapless(next, url);
  };
  engine.onPlayStateChange = (p) => {
    setPlaying(p);
    // Keep the TV screen awake only while audio is playing.
    if (p) void requestWakeLock();
    else releaseWakeLock();
  };

  /* ---------- load timing + text + start playback ---------- */
  onMount(() => {
    void load();
  });

  async function load() {
    setPhase("loading");
    setAudioError(false);
    try {
      const [read, surahs] = await Promise.all([
        c.timing.readForMoshaf(props.moshaf.server),
        c.catalog.surahs(props.lang),
      ]);
      const timed = await c.timing.timedServerUrls();
      setTimedUrls(timed);

      const versesCount = props.surah.versesCount || surahs.find((s) => s.id === props.surah.id)?.versesCount || 0;
      const t = read ? await c.timing.timingFor(read.id, props.surah.id) : null;
      setTiming(t);

      // Basmala header for surahs 2..114 (surah 1's verse 1 IS the basmala; surah 9 has none).
      if (props.surah.id >= 2 && props.surah.id <= 114) {
        setBasmala(await c.quranText.verseText(1, 1));
      }

      if (t) {
        const suggested = suggestOffset(t.entries.length, versesCount);
        const effOffset = settings.ayahOffset !== 0 ? settings.ayahOffset : suggested;
        const list: TextItem[] = [];
        for (const e of t.entries) {
          if (e.ayah < 1) continue;
          const key = verseKeyFor(e.ayah, props.surah.id, versesCount, effOffset);
          if (!key) continue;
          const [s, v] = key.split(":").map(Number);
          const text = (await c.quranText.verseText(s, v)) ?? "";
          list.push({ ayah: e.ayah, verseKey: key, text });
        }
        setItems(list);
      } else {
        // No timing → static list of the surah's verses (graceful degradation).
        const list: TextItem[] = [];
        for (let v = 1; v <= versesCount; v++) {
          const text = (await c.quranText.verseText(props.surah.id, v)) ?? "";
          list.push({ ayah: v, verseKey: `${props.surah.id}:${v}`, text });
        }
        setItems(list);
        setHasTiming(false);
      }

      setActiveSurah(props.surah);
      setPhase("ready");
      setTimeout(() => {
        const list = document.querySelector(".dialog-list");
        if (list) {
          focusFirst(list);
        } else {
          // Land on play/pause (not the back chip) so OK/Enter toggles playback.
          focusElement("transport-play");
        }
      }, 150);

      // Start playback: resume from the requested ayah's start, honouring the
      // carried position-within-ayah offset when provided (G3).
      let startMs = 0;
      if (props.startAyahIndex) {
        startMs = (t?.entryFor(props.startAyahIndex)?.startMs ?? 0) + (props.resumeOffsetMs ?? 0);
      } else if (props.resumeOffsetMs) {
        startMs = props.resumeOffsetMs;
      }
      engine.setSpeed(speed());
      engine.setRepeat(repeat());
      lastPlayUrl = audioUrlFor(props.moshaf.server, props.surah.id);
      engine.play(lastPlayUrl, startMs);

      // Session save loop (~5 s).
      window.setInterval(() => {
        c.session.saveLastSession(props.reciter, props.moshaf, activeSurah(), currentAyah(), positionMs());
      }, 5000);

      // Prepare the next surah for a GAPLESS handoff (audio + timing).
      const next = nextSurahAfterCurrent();
      if (next) {
        gaplessSurah = next;
        engine.prepareGapless(audioUrlFor(props.moshaf.server, next.id));
        if (read) c.timing.prefetch(read.id, next.id);
      }

      // Reciter list for the picker (sorted, Arabic collator).
      const col = arabicCollator();
      setAllReciters(allReciters().length ? allReciters() : (await c.catalog.reciters(props.lang)).slice().sort((a, b) => col.compare(a.name, b.name)));
    } catch (e) {
      setPhase("error");
      setErrorMsg((e as Error).message);
    }
  }

  function nextSurahAfterCurrent(): QuranSurah | null {
    const list = props.availableSurahs;
    const i = list.findIndex((s) => s.id === activeSurah().id); // NOT props.surah (stale after nav)
    return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  }

  function prevSurahBeforeCurrent(): QuranSurah | null {
    const list = props.availableSurahs;
    const i = list.findIndex((s) => s.id === activeSurah().id);
    return i > 0 ? list[i - 1] : null;
  }

  /** (Re)start playback for a surah (used by next/prev/jump). */
  async function playSurah(surah: QuranSurah, startAyahIndex?: number, resumeFrom = 0) {
    // Rapid navigation (e.g. hammering previous-ayah at a surah's first ayah)
    // fires concurrent playSurah calls — each fetches timing/text then plays.
    // A monotonic sequence makes the LAST request win; superseded ones
    // discard their (slow) results so state/audio never interleave.
    const seq = ++playSeq;
    let read: TimingRead | null = null;
    let t: SurahTiming | null = null;
    try {
      read = await c.timing.readForMoshaf(props.moshaf.server);
      t = read ? await c.timing.timingFor(read.id, surah.id) : null;
    } catch {
      t = null; // server hiccup — play without ayah sync, never hang
    }
    if (seq !== playSeq) return; // superseded
    // Keep the CURRENT state until the new surah's data is ready — switching
    // activeSurah/timing mid-fetch mixes them and flashes wrong mushaf pages.
    // The end-of-load sets land together (one render).
    setActiveSurah(surah);
    setTiming(t);
    setHasTiming(t !== null);
    setCurrentAyah(startAyahIndex ?? 0);
    setPositionMs(resumeFrom);
    setDurationMs(0);
    setAudioError(false);

    const versesCount = surah.versesCount;
    if (surah.id >= 2 && surah.id <= 114) {
      setBasmala(await c.quranText.verseText(1, 1));
    } else {
      setBasmala(null);
    }
    if (seq !== playSeq) return;

    if (t) {
      const suggested = suggestOffset(t.entries.length, versesCount);
      const effOffset = settings.ayahOffset !== 0 ? settings.ayahOffset : suggested;
      const list: TextItem[] = [];
      for (const e of t.entries) {
        if (e.ayah < 1) continue;
        const key = verseKeyFor(e.ayah, surah.id, versesCount, effOffset);
        if (!key) continue;
        const [s, v] = key.split(":").map(Number);
        const text = (await c.quranText.verseText(s, v)) ?? "";
        list.push({ ayah: e.ayah, verseKey: key, text });
      }
      setItems(list);
    } else {
      const list: TextItem[] = [];
      for (let v = 1; v <= versesCount; v++) {
        const text = (await c.quranText.verseText(surah.id, v)) ?? "";
        list.push({ ayah: v, verseKey: `${surah.id}:${v}`, text });
      }
      setItems(list);
    }
    if (seq !== playSeq) return;
    setNoTimingPage(surah.startPage);

    let startMs = resumeFrom;
    if (startAyahIndex && t) startMs = t.entryFor(startAyahIndex)?.startMs ?? resumeFrom;
    engine.setRepeat(repeat());
    engine.setSpeed(speed());
    engine.play(audioUrlFor(props.moshaf.server, surah.id), startMs);

    const next = nextSurahAfterCurrent();
    if (next) {
      gaplessSurah = next;
      engine.prepareGapless(audioUrlFor(props.moshaf.server, next.id));
      if (read) c.timing.prefetch(read.id, next.id);
    }
  }

  /** Attach the next surah's state after the engine gapless-handoffs to it
   *  (audio already playing in element B — do NOT re-prepare audio). */
  async function attachSurahForGapless(surah: QuranSurah, url: string) {
    // Switch the UI immediately (audio is ALREADY the new surah). Clear the
    // TIMING FIRST — setting activeSurah while the old timing is still live
    // made the page view mix them (stale entry tagged with the new surah's
    // id → the old mushaf spread froze). Timing first → the page shows its
    // loading state until the fresh timing arrives.
    setTiming(null);
    setActiveSurah(surah);
    setCurrentAyah(0);
    let read: TimingRead | null = null;
    let t: SurahTiming | null = null;
    try {
      read = await c.timing.readForMoshaf(props.moshaf.server);
      t = read ? await c.timing.timingFor(read.id, surah.id) : null;
    } catch {
      t = null; // server hiccup — keep playing without ayah sync, never hang
    }
    setTiming(t);
    setHasTiming(t !== null);
    setActiveSurah(surah);
    setCurrentAyah(0);
    setPositionMs(0);
    setDurationMs(0);
    setAudioError(false);

    const versesCount = surah.versesCount;
    const b = (await c.quranText.verseText(1, 1));
    setBasmala(surah.id >= 2 && surah.id <= 114 ? b : null);

    if (t) {
      const effOffset = settings.ayahOffset !== 0 ? settings.ayahOffset : suggestOffset(t.entries.length, versesCount);
      const list: TextItem[] = [];
      for (const e of t.entries) {
        if (e.ayah < 1) continue;
        const key = verseKeyFor(e.ayah, surah.id, versesCount, effOffset);
        if (!key) continue;
        const [s, v] = key.split(":").map(Number);
        list.push({ ayah: e.ayah, verseKey: key, text: (await c.quranText.verseText(s, v)) ?? "" });
      }
      setItems(list);
    } else {
      const list: TextItem[] = [];
      for (let v = 1; v <= versesCount; v++) {
        list.push({ ayah: v, verseKey: `${surah.id}:${v}`, text: (await c.quranText.verseText(surah.id, v)) ?? "" });
      }
      setItems(list);
    }
    setNoTimingPage(surah.startPage);

    // Chain the next gapless surah.
    const next2 = nextSurahAfterCurrent();
    if (next2) {
      gaplessSurah = next2;
      engine.prepareGapless(audioUrlFor(props.moshaf.server, next2.id));
      if (read) c.timing.prefetch(read.id, next2.id);
    } else {
      gaplessSurah = null;
      engine.prepareGapless(null);
    }
    // Validate the gate once the new surah's duration is known.
    const dur = engine.durationMs();
    if (t && dur > 0) setHasTiming(isReliable(dur, t.lastEndMs));
  }

  /* ---------- transport actions ---------- */
  function retryAudio() {
    setAudioError(false);
    if (!lastPlayUrl) return;
    engine.setRepeat(repeat());
    engine.setSpeed(speed());
    engine.play(lastPlayUrl, positionMs());
    setErrorMsg("");
  }

  function togglePlay() {
    if (playing()) engine.pause();
    else engine.resume();
  }

  function nextAyah() {
    const t = timing();
    if (t && hasTiming()) {
      const cur = currentAyah();
      const next = t.entries.find((e) => e.ayah > cur);
      if (next) engine.seekTo(next.startMs);
      return;
    }
    // No timing: browse the mushaf page by page (clamped to the surah range).
    const p = Math.min(activeSurah().endPage, noTimingPage() + 1);
    setNoTimingPage(p);
  }

  function prevAyah() {
    const t = timing();
    const cur = currentAyah();
    if (t && hasTiming()) {
      if (cur > 1) {
        const prev = [...t.entries].reverse().find((e) => e.ayah < cur);
        if (prev) engine.seekTo(prev.startMs);
      } else {
        // At the FIRST ayah → the previous surah's LAST ayah.
        const prevSurah = prevSurahBeforeCurrent();
        if (prevSurah) void playSurah(prevSurah, prevSurah.versesCount);
      }
      return;
    }
    // No timing: browse the mushaf page by page (clamped to the surah range).
    const p = Math.max(activeSurah().startPage, noTimingPage() - 1);
    setNoTimingPage(p);
  }

  function nextSurah() {
    const n = nextSurahAfterCurrent();
    if (n) void playSurah(n);
  }

  function prevSurah() {
    const p = prevSurahBeforeCurrent();
    if (p) void playSurah(p);
  }

  function selectAyah(ayah: number) {
    const t = timing();
    if (!t || !hasTiming()) return;
    const entry = t.entryFor(ayah);
    if (entry) engine.seekTo(entry.startMs);
  }

  function cycleRepeat() {
    const next = nextRepeat(repeat());
    setRepeat(next);
    engine.setRepeat(next);
  }

  function cycleSpeed() {
    const i = SPEED_CYCLE.indexOf(speed());
    const next = SPEED_CYCLE[(i + 1) % SPEED_CYCLE.length];
    setSpeed(next);
    engine.setSpeed(next);
  }

  function toggleFav(id: number) {
    const cur = favourites();
    const added = !cur.has(id);
    c.session.toggleFavourite(id);
    setFavourites(added ? new Set([...cur, id]) : new Set([...cur].filter((x) => x !== id)));
  }

  function switchReciter(reciter: Reciter, moshaf: Moshaf) {
    // Keep the current surah when the new moshaf covers it; else its first.
    const ids = new Set(availableSurahIds(moshaf));
    const kept = ids.has(props.surah.id) ? props.surah : null;
    setDialog(null);
    void c.catalog.surahs(props.lang).then((all) => {
      const available = all.filter((s) => ids.has(s.id));
      const surah = kept ?? available[0];
      if (!surah) return;
      const ayah = kept ? currentAyah() : undefined;
      // G3: carry the position-within-ayah offset so the new reciter resumes at
    // the same spot, not just the ayah start.
    const cur = currentAyah();
    const offset =
      cur >= 1 && timing()
        ? Math.max(0, positionMs() - (timing()!.entryFor(cur)?.startMs ?? positionMs()))
        : 0;
    props.nav.replaceTop({
        kind: "player",
        reciter,
        moshaf,
        surah,
        availableSurahs: available,
        startAyahIndex: ayah,
        resumeOffsetMs: offset,
      });
    });
  }

  /* ---------- derived ---------- */
  const rtl = props.lang === "ar";
  const verseKey = createMemo(() => {
    if (currentAyah() < 1) return null;
    const versesCount = activeSurah().versesCount;
    return verseKeyFor(currentAyah(), activeSurah().id, versesCount, settings.ayahOffset);
  });

  // Load the context content when the side panel is open.
  createEffect(async () => {
    const mode = sideView();
    if (!mode || displayMode() === 0) return;
    setCtxContent(null);
    try {
      const map = await c.tafseer.surahContent(activeSurah().id);
      const content = new Map<number, { text: string; ayah: number }>();
      for (const [ayah, ctx] of map) {
        content.set(ayah, { text: textForMode(ctx, mode), ayah });
      }
      setCtxContent(content);
    } catch {
      setCtxContent(new Map());
    }
  });

  const entry = createMemo(() => {
    const t = timing();
    if (!t || !hasTiming()) return null;
    return t.entryFor(currentAyah()) ?? null;
  });

  const filteredReciters = createMemo(() => {
    const q = query().trim();
    const list = allReciters();
    if (q.length === 0) return list;
    return list.filter((r) => reciterMatchesQuery(r, q));
  });

  const mushafLabel = createMemo(() => {
    if (displayMode() === 0) return props.t("text_mode");
    return props.t(mushafStyle(style()).labelKey);
  });
  const sideViewLabel = createMemo(() => {
    if (displayMode() === 0) return null;
    const v = sideView();
    return v ? modeShortLabel(v, props.t) : props.t("view_mushaf_short");
  });

  const fontSize = FONT_SIZES[settings.fontSizeIndex] ?? 34;
  const color = HIGHLIGHT_COLORS[settings.highlightColorIndex] ?? "#e8c877";

  // Debug hook for automated verification (Playwright + emulator scripts).
  (window as unknown as Record<string, unknown>).__quranTv = {
    getState: () => ({
      phase: phase(),
      currentAyah: currentAyah(),
      surahId: activeSurah().id,
      hasTiming: hasTiming(),
      positionMs: positionMs(),
      durationMs: durationMs(),
      displayMode: displayMode(),
      style: style(),
      polygonPoints: entry()?.polygon?.length ?? 0,
      lastEndMs: timing()?.lastEndMs ?? -1,
      entries: timing()?.entries.length ?? -1,
      textItems: items().length,
    }),
  };

  /* ---------- render ---------- */
  return (
    <div style="width:100%;height:100%;display:flex;flex-direction:column;background:var(--bg)">
      <Show when={phase() === "loading"} fallback={null}>
        <LoadingState t={props.t} />
      </Show>

      <Show when={phase() === "error"} fallback={null}>
        <ErrorState t={props.t} message={errorMsg()} onRetry={() => void load()} />
      </Show>

      {phase() === "ready" ? (
          <>
            {/* top bar */}
            <div
              class={displayMode() === 1 && !chromeVisible() ? "chrome-hidden" : ""}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "16px",
                padding: "12px 24px",
                background: displayMode() === 1 ? "rgba(4,8,18,0.62)" : "var(--surface)",
                "border-bottom": displayMode() === 1 ? "none" : "1px solid #26375c",
                transition: "opacity 0.25s ease",
                position: displayMode() === 1 ? "absolute" : "static",
                top: 0,
                left: 0,
                right: 0,
                "z-index": 20,
              }}
            >
              <Chip id="player-back" label={rtl ? "→" : "←"} onClick={() => props.nav.back()} />
              <div style="flex:1;min-width:0">
                <div class="quran-text" style="font-size:32px;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  {activeSurah().nameAr}
                </div>
                <div style="font-size:18px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  {props.reciter.name} · {props.moshaf.name}
                </div>
              </div>
              <Show when={audioError()}>
                <span class="badge" style="font-size:16px;color:var(--danger);border-color:var(--danger)">{props.t("error_audio")}</span>
                <Chip id="player-retry" label={props.t("retry")} onClick={retryAudio} />
              </Show>
            </div>

            {/* body: text mode or page mode */}
            <div style="flex:1;display:flex;flex-direction:column;min-height:0;position:relative">
              <Show when={displayMode() === 0} fallback={
                sideView() !== null ? (
                  <div dir="rtl" style="display:flex;flex-direction:row;height:100%;width:100%">
                    {/* current highlighted page on the RIGHT, aligned toward the spine */}
                    <div style="flex:1;min-width:0;height:100%">
                      <MushafPageView
                        style={style()}
                        entry={entry()}
                        timingEntries={timing()?.entries ?? null}
                        currentAyah={currentAyah()}
                        verseKey={verseKey()}
                        surah={activeSurah()}
                        noTimingPage={noTimingPage()}
                        hasTiming={hasTiming()}
                        color={color}
                        align="end"
                        loadingLabel={props.t("loading")}
                        onError={() => setAudioError(true)}
                      />
                    </div>
                    {/* folded spine ribbon */}
                    <div style="width:14px;background:linear-gradient(to right,#3a2f1f 0%,#7a5c2e 45%,#a8874a 55%,#3a2f1f 100%);flex-shrink:0" />
                    {/* context panel (LEFT page's place, rows start at the spine) */}
                    <div style="flex:1;min-width:0;height:100%">
                      <Show when={ctxContent()} fallback={<LoadingState t={props.t} />}>
                        {(content) => (
                          <SideContextPanel
                            t={props.t}
                            surahId={activeSurah().id}
                            surahNameAr={activeSurah().nameAr}
                            mode={sideView()!}
                            currentAyah={hasTiming() ? currentAyah() : -1}
                            content={content()}
                            fontSizePx={Math.max(18, fontSize - 4)}
                            highlightColor={color}
                          />
                        )}
                      </Show>
                    </div>
                  </div>
                ) : (
                <MushafSpreadView
                  style={style()}
                  entry={entry()}
                  timingEntries={timing()?.entries ?? null}
                  currentAyah={currentAyah()}
                  verseKey={verseKey()}
                  surah={activeSurah()}
                  noTimingPage={noTimingPage()}
                  hasTiming={hasTiming()}
                  color={color}
                  loadingLabel={props.t("loading")}
                  onError={() => setAudioError(true)}
                />
                )
              }>
                <TextModeList
                  t={props.t}
                  items={items()}
                  currentAyah={hasTiming() ? currentAyah() : -1}
                  basmala={basmala()}
                  fontSizePx={fontSize}
                  highlightColor={color}
                  onSelectAyah={selectAyah}
                />
              </Show>
            </div>

            {/* transport */}
            <div
              class={displayMode() === 1 && !chromeVisible() ? "chrome-hidden" : ""}
              style={{
                transition: "opacity 0.25s ease",
                position: displayMode() === 1 ? "absolute" : "static",
                bottom: 0,
                left: 0,
                right: 0,
                "z-index": 20,
              }}
            >
              <TransportBar
                t={props.t}
                rtl={rtl}
                playing={playing()}
                positionMs={positionMs()}
                durationMs={durationMs()}
                repeat={repeat()}
                speed={speed()}
                hasTiming={hasTiming()}
                mushafLabel={mushafLabel()}
                sideViewLabel={sideViewLabel()}
                autoHide={settings.autoHideControls}
                onTogglePlay={togglePlay}
                onNextAyah={nextAyah}
                onPrevAyah={prevAyah}
                onNextSurah={nextSurah}
                onPrevSurah={prevSurah}
                onCycleRepeat={cycleRepeat}
                onCycleSpeed={cycleSpeed}
                onOpenSurahJump={() => openDialog("jump")}
                onToggleAutoHide={() => {
                  c.session.setAutoHideControls(!settings.autoHideControls);
                  settings.autoHideControls = !settings.autoHideControls;
                }}
                onOpenReciterPicker={() => openDialog("reciter")}
                onOpenMushafPicker={() => openDialog("mushaf")}
                onOpenViewPicker={() => openDialog("view")}
              />
            </div>
          </>
      ) : null}

      {/* ------- dialogs ------- */}
      <Show when={dialog() === "jump"}>
        <Dialog title={props.t("surah_jump")} onClose={() => setDialog(null)}>
          <div class="dialog-list" style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
            {props.availableSurahs.map((s) => (
              <div
                use:focusable={`pj-${s.id}`}
                class="dialog-row"
                style="justify-content:center"
                onClick={() => {
                  setDialog(null);
                  if (s.id !== props.surah.id) void playSurah(s);
                }}
              >
                {s.id} · <span class="quran-text">{s.nameAr}</span>
              </div>
            ))}
          </div>
        </Dialog>
      </Show>

      <Show when={dialog() === "mushaf"}>
        <Dialog title={props.t("mushaf_style")} hint={props.t("mushaf_pick_hint")} onClose={() => setDialog(null)}>
          <div class="dialog-list">
            <DialogRow
              id="pm-text"
              label={props.t("text_mode")}
              checked={displayMode() === 0}
              onClick={() => {
                setDialog(null);
                setDisplayMode(0);
              }}
            />
            {MUSHAF_STYLES.map((st) => (
              <DialogRow
                id={`pm-${st.id}`}
                label={props.t(st.labelKey)}
                checked={displayMode() === 1 && style() === st.id}
                onClick={() => {
                  setDialog(null);
                  setStyle(st.id);
                  setDisplayMode(1); // picking a style enters page mode (Android behavior)
                  c.session.setMushafStyle(st.id);
                }}
              />
            ))}
          </div>
        </Dialog>
      </Show>

      <Show when={dialog() === "view"}>
        <Dialog title={props.t("view_picker_title")} hint={props.t("view_side_hint")} onClose={() => setDialog(null)}>
          <div class="dialog-list">
            <DialogRow
              id="pv-none"
              label={props.t("view_mushaf")}
              checked={sideView() === null}
              onClick={() => { setDialog(null); setSideView(null); }}
            />
            <DialogRow
              id="pv-tafseer"
              label={props.t("view_tafseer")}
              checked={sideView() === "tafseer"}
              onClick={() => { setDialog(null); setSideView("tafseer"); }}
            />
            <DialogRow
              id="pv-meanings"
              label={props.t("view_meanings")}
              checked={sideView() === "meanings"}
              onClick={() => { setDialog(null); setSideView("meanings"); }}
            />
            <DialogRow
              id="pv-translation"
              label={props.t("view_translation")}
              checked={sideView() === "translation"}
              onClick={() => { setDialog(null); setSideView("translation"); }}
            />
          </div>
        </Dialog>
      </Show>

      <Show when={dialog() === "reciter"}>
        <Dialog title={props.t("choose_reciter")} hint={props.t("search_enter_hint")} onClose={() => setDialog(null)}>
          <div style="padding:0 28px 14px">
            <input
              id="reciter-search"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder={props.t("search_hint")}
              style="width:100%;height:60px;font-size:24px;border-radius:12px;border:1px solid #2c3f68;background:var(--bg);color:var(--text);padding:0 16px"
            />
          </div>
          <div class="dialog-list" style="max-height:52vh">
            {filteredReciters().map((r) => (
              <DialogRow
                id={`pr-${r.id}`}
                label={r.name}
                sub={r.nameEn ?? undefined}
                checked={r.id === props.reciter.id}
                dim={!r.moshafs.some((m) => timedUrls().has(normalizeServerUrl(m.server)))}
                action={<StarButton id={`prstar-${r.id}`} active={favourites().has(r.id)} onClick={() => toggleFav(r.id)} />}
                onClick={() => {
                  const timed = r.moshafs.filter((m) => timedUrls().has(normalizeServerUrl(m.server)));
                  const candidates = timed.length > 0 ? timed : r.moshafs;
                  if (candidates.length > 1) {
                    setPickerReciter(r);
                    setDialog("moshaf");
                  } else if (candidates.length === 1) {
                    setDialog(null);
                    switchReciter(r, candidates[0]);
                  }
                }}
              />
            ))}
          </div>
        </Dialog>
      </Show>

      <Show when={dialog() === "moshaf" && pickerReciter()}>
        {(rc) => (
          <Dialog title={`${props.t("select_moshaf")} — ${rc().name}`} onClose={() => setDialog("reciter")}>
            <div class="dialog-list">
              {rc().moshafs.map((m) => (
                <DialogRow
                  id={`prm-${m.id}`}
                  label={m.name}
                  dim={!timedUrls().has(normalizeServerUrl(m.server))}
                  onClick={() => switchReciter(rc(), m)}
                />
              ))}
            </div>
          </Dialog>
        )}
      </Show>
    </div>
  );

  function openDialog(name: "jump" | "mushaf" | "reciter" | "view") {
    setDialog(name);
    setTimeout(() => {
      const listEl = document.querySelector(".dialog-list");
      if (listEl) focusFirst(listEl);
    }, 80);
  }
}

function textForMode(ctx: { tafseer: string; meanings: string; translation: string }, mode: TafseerMode): string {
  switch (mode) {
    case "tafseer":
      return ctx.tafseer;
    case "meanings":
      return ctx.meanings;
    case "translation":
      return ctx.translation;
  }
}
