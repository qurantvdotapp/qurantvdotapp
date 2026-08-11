// Surah grid screen — 8-column grid of available surahs, moshaf picker,
// jump-to-surah dialog, untimed badges (soar list), select → player.

import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js";
import type { Moshaf, Reciter, QuranSurah } from "../domain/Models";
import { availableSurahIds } from "../domain/Models";
import type { TFunction } from "../i18n/strings";
import { appContainer } from "../data/AppContainer";
import { audioUrlFor } from "../domain/CatalogParsing";
import { Chip, Dialog, DialogRow, ErrorState, LoadingState , focusable } from "./components";
import { focusFirst } from "./focus";

interface SurahGridProps {
  t: TFunction;
  reciter: Reciter;
  moshaf: Moshaf;
  onBack: () => void;
  onMoshafChange: (moshaf: Moshaf) => void;
  onOpenSurah: (surah: QuranSurah, available: QuranSurah[], startAyahIndex?: number) => void;
}

export function SurahGridScreen(props: SurahGridProps) {
  const c = appContainer();
  const [surahs, setSurahs] = createSignal<QuranSurah[] | null>(null);
  const [error, setError] = createSignal(false);
  const [untimed, setUntimed] = createSignal<Set<number>>(new Set());
  const [matchedReadId, setMatchedReadId] = createSignal<number | undefined>(undefined);
  const [jumpOpen, setJumpOpen] = createSignal(false);
  const [pickerOpen, setPickerOpen] = createSignal(false);
  // Real mp3-duration probes (the soar list OVER-CLAIMS): verdict per surah.
  const [usability, setUsability] = createSignal<Map<number, boolean>>(new Map());
  const [probeFrom, setProbeFrom] = createSignal(0);

  // Probe lazily as cards scroll into view (≤10 MB files only; cached forever).
  createEffect(() => {
    const readId = matchedReadId();
    const start = probeFrom();
    if (readId === undefined || start < 0) return;
    const all = grid();
    const batch = all.slice(start, start + 12);
    if (batch.length === 0) return;
    let cancelled = false;
    void (async () => {
      const next = new Map(usability());
      for (const surah of batch) {
        if (cancelled) return;
        const verdict = await c.timing.timingUsability(
          readId,
          surah.id,
          audioUrlFor(props.moshaf.server, surah.id),
        );
        if (verdict !== null) next.set(surah.id, verdict);
      }
      if (!cancelled) setUsability(next);
      setProbeFrom(start + 12); // schedule the next batch
    })();
    return () => { cancelled = true; };
  });

  async function load() {
    setError(false);
    setSurahs(null);
    try {
      const lang = c.session.settings().language;
      const all = await c.catalog.surahs(lang);
      const ids = new Set(availableSurahIds(props.moshaf));
      const list = all.filter((s) => ids.has(s.id));
      setSurahs(list);
      setTimeout(() => {
        const scroll = document.querySelector(".h-scroll");
        if (scroll) focusFirst(scroll);
      }, 150);
      // Timing status for badges
      const read = await c.timing.readForMoshaf(props.moshaf.server);
      if (read) {
        const soar = await c.timing.surahsWithTiming(read.id);
        if (soar) {
          const allIds = new Set(list.map((s) => s.id));
          setUntimed(new Set([...allIds].filter((id) => !soar.has(id))));
        }
      } else {
        // No read at all → every surah is untimed.
        setUntimed(new Set(list.map((s) => s.id)));
      }
    } catch {
      setError(true);
    }
  }

  onMount(load);

  const grid = createMemo(() => surahs() ?? []);

  /** Untimed = outside the soar list, OR the real mp3 probe says unusable. */
  function effectiveUntimed(surahId: number): boolean {
    const u = usability().get(surahId);
    if (u === false) return true; // probe verdict: timing unusable
    return untimed().has(surahId); // soar-list gap
  }

  // Re-probe the first batch after the initial load.
  createEffect(() => {
    if (surahs() !== null && probeFrom() === 0) setProbeFrom(1);
  });

  return (
    <div class="screen">
      {/* header */}
      <div style="display:flex;align-items:center;gap:20px;padding-bottom:18px;flex-wrap:wrap">
        <Chip id="grid-back" label="←" onClick={() => props.onBack()} />
        <div>
          <div style="font-size:34px;color:var(--gold)">{props.reciter.name}</div>
          <div style="font-size:22px;color:var(--text-dim)">{props.moshaf.name}</div>
        </div>
        <div style="flex:1" />
        <Chip id="grid-jump" label={props.t("jump_to_surah_short")} onClick={() => {
          setJumpOpen(true);
          setTimeout(() => {
            const listEl = document.querySelector(".dialog-list");
            if (listEl) focusFirst(listEl);
          }, 80);
        }} />
        <Chip id="grid-moshaf" label={props.moshaf.name} onClick={moshafPicker} />
      </div>

      {error() ? (
        <ErrorState t={props.t} onRetry={load} />
      ) : surahs() === null ? (
        <LoadingState t={props.t} />
      ) : (
        <div class="h-scroll">
          <div style="font-size:30px;color:var(--gold);padding-bottom:14px">{props.t("surahs_title")}</div>
          <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:14px">
            {grid().map((s) => (
              <div
                use:focusable={`surah-${s.id}`}
                class="tv-card"
                classList={{ dim: effectiveUntimed(s.id) }}
                style="flex-direction:column;gap:6px;padding:14px;text-align:center;min-height:96px;justify-content:center"
                onClick={() => props.onOpenSurah(s, grid())}
              >
                <div style="font-size:18px;color:var(--gold)">{s.id}</div>
                <div class="quran-text" style="font-size:26px">{s.nameAr}</div>
                <Show when={effectiveUntimed(s.id)}>
                  <span class="badge">{props.t("no_timing_badge")}</span>
                </Show>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* jump dialog */}
      <Show when={jumpOpen()}>
        <Dialog title={props.t("surah_jump")} onClose={() => setJumpOpen(false)}>
          <div class="dialog-list" style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
            {grid().map((s) => (
              <div
                use:focusable={`jump-${s.id}`}
                class="dialog-row"
                style="justify-content:center"
                onClick={() => {
                  setJumpOpen(false);
                  props.onOpenSurah(s, grid());
                }}
              >
                {s.id} · <span class="quran-text">{s.nameAr}</span>
              </div>
            ))}
          </div>
        </Dialog>
      </Show>

      {/* moshaf picker */}
      {pickerOpen() ? (
          <Dialog
            title={`${props.t("change_moshaf")} — ${props.reciter.name}`}
            onClose={() => setPickerOpen(false)}
          >
            <div class="dialog-list">
              {props.reciter.moshafs.map((m) => (
                <DialogRow
                  id={`pm-${m.id}`}
                  label={m.name}
                  checked={m.id === props.moshaf.id}
                  onClick={() => {
                    setPickerOpen(false);
                    props.onMoshafChange(m);
                  }}
                />
              ))}
            </div>
          </Dialog>
      ) : null}
    </div>
  );

  function moshafPicker() {
    setPickerOpen(true);
    setTimeout(() => {
      const listEl = document.querySelector(".dialog-list");
      if (listEl) focusFirst(listEl);
    }, 80);
  }
}
