// Two-page mushaf spread — the open-book look (Android parity):
// odd page on the RIGHT, even page on the LEFT (the page % 2 rule the KSU site
// uses), forced RTL so it never flips in either UI language. Pages align
// toward the folded spine. When the current ayah crosses into a new spread,
// the spread animates in as a page turn (next: slides in from the LEFT; back:
// from the RIGHT).

import { createEffect, createMemo, createSignal, Show } from "solid-js";
import type { AyahTiming, QuranSurah } from "../../domain/Models";
import { MushafPageView, PageLoading } from "./MushafPageView";
import { madinahSvgUrl, ksuPageUrl, islamicPageUrl, mushafStyle, pageForVerse } from "./mushafStyles";

interface MushafSpreadViewProps {
  style: number;
  entry: AyahTiming | null;
  timingEntries: AyahTiming[] | null;
  currentAyah: number;
  verseKey: string | null;
  surah: QuranSurah;
  noTimingPage: number;
  hasTiming: boolean;
  color: string;
  /** Localized "loading" label for the page-loading indicator. */
  loadingLabel?: string;
  onError?: (msg: string) => void;
}

export function MushafSpreadView(props: MushafSpreadViewProps) {
  const style = createMemo(() => mushafStyle(props.style));

  // Last known page (timing pageUrl is sparse — keep the mushaf put). Only
  // valid for the CURRENT surah: a stale page from the previous surah must
  // not flash during the gapless handoff.
  const [lastKnownPage, setLastKnownPage] = createSignal<{ page: number; surahId: number } | null>(null);

  const timingPage = createMemo(() => {
    if (!props.hasTiming) return null;
    const e = props.entry;
    if (e?.pageUrl) {
      const m = /([0-9]+)\.svg$/.exec(e.pageUrl);
      if (m) return Number.parseInt(m[1], 10);
    }
    if (props.currentAyah < 1 && props.surah.startPage >= 1) return props.surah.startPage;
    return null;
  });

  const computedPage = createMemo(() => {
    const s = style();
    const p =
      pageForVerse(s, timingPage(), props.surah.id, props.currentAyah) ??
      (props.hasTiming ? null : props.noTimingPage);
    return p && p >= 1 ? p : null;
  });

  const currentPage = createMemo(() => {
    const surahId = props.surah.id;
    const cp = computedPage();
    if (cp !== null && cp >= 1) return cp;
    const lk = lastKnownPage();
    return lk && lk.surahId === surahId ? lk.page : null;
  });

  // Track the known page in an EFFECT, never inside the memo — writing state
  // from the memo let a stale entry (old timing + new surah mid-handoff) tag
  // the wrong page with the new surah's id, freezing the old mushaf spread.
  createEffect(() => {
    const p = computedPage();
    if (p !== null && p >= 1) setLastKnownPage({ page: p, surahId: props.surah.id });
  });

  /** Spread = [rightPage(odd), leftPage(even)]. */
  const spread = createMemo(() => {
    const p = currentPage();
    if (p === null) return null;
    const right = p % 2 === 1 ? p : Math.max(1, p - 1);
    const left = right + 1;
    return { right, left };
  });

  // Page-turn animation direction (next vs back).
  const [turnDir, setTurnDir] = createSignal<"next" | "back" | null>(null);
  const [spreadKey, setSpreadKey] = createSignal("");
  createEffect(() => {
    const sp = spread();
    if (!sp) return;
    const key = `${sp.right}-${sp.left}`;
    if (key !== spreadKey() && spreadKey() !== "") {
      const prevRight = Number.parseInt(spreadKey().split("-")[0], 10);
      setTurnDir(sp.right > prevRight ? "next" : "back");
    }
    setSpreadKey(key);
  });

  // Prefetch the next spread's pages.
  createEffect(() => {
    const sp = spread();
    if (!sp) return;
    const after = sp.right + 2;
    if (after <= 604) {
      const st = mushafStyle(props.style);
      const url =
        st.kind === "ksu" ? ksuPageUrl(st, after) : st.kind === "islamic-svg" ? islamicPageUrl(after) : madinahSvgUrl(after);
      const img = new Image();
      img.src = url;
    }
  });

  const animation = createMemo(() => {
    const dir = turnDir();
    if (!dir) return "";
    return `spread-turn-${dir} 0.45s ease`;
  });

  return (
    <div dir="rtl" style="width:100%;height:100%;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:0;background:#f5efe2;overflow:hidden">
      <Show when={spread()} fallback={<PageLoading label={props.loadingLabel} />}>
        {(sp) => (
          <>
            {/* RIGHT page (odd) — aligns toward the spine (its left edge) */}
            <div
              style={`flex:1;height:100%;min-width:0;display:flex;animation:${animation()}`}
            >
              <MushafPageView
                style={props.style}
                entry={props.entry}
                timingEntries={props.timingEntries}
                currentAyah={props.currentAyah}
                verseKey={props.verseKey}
                surah={props.surah}
                noTimingPage={props.noTimingPage}
                hasTiming={props.hasTiming}
                color={props.color}
                align="end"
                forcedPage={sp().right}
                showHighlight={currentPage() === sp().right}
                loadingLabel={props.loadingLabel}
                onError={props.onError}
              />
            </div>
            {/* folded spine ribbon */}
            <div style="width:16px;align-self:stretch;background:linear-gradient(to right,#3a2f1f 0%,#7a5c2e 45%,#a8874a 55%,#3a2f1f 100%);flex-shrink:0" />
            {/* LEFT page (even) — aligns toward the spine (its right edge) */}
            <div
              style={`flex:1;height:100%;min-width:0;display:flex;animation:${animation()}`}
            >
              <MushafPageView
                style={props.style}
                entry={props.entry}
                timingEntries={props.timingEntries}
                currentAyah={props.currentAyah}
                verseKey={props.verseKey}
                surah={props.surah}
                noTimingPage={props.noTimingPage}
                hasTiming={props.hasTiming}
                color={props.color}
                align="start"
                forcedPage={sp().left}
                showHighlight={currentPage() === sp().left}
                loadingLabel={props.loadingLabel}
                onError={props.onError}
              />
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
