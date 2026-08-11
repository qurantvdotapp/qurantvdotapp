// Unified mushaf page renderer — dispatches on the active style:
// 0 Madinah SVG (mp3quran, polygon highlight) · 1 per-ayah tajweed image
// · 2 islamic.app HD SVG (computed rects) · 3/4/5 KSU PNGs (hilite API rects,
// text-length estimator fallback). Highlights are fraction-of-page rects so one
// overlay pipeline serves every source.

import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { parseViewBox } from "../../domain/PageMapping";
import { parseLines } from "../../domain/IslamicPageBands";
import { buildIslamicRects } from "../../domain/IslamicHiliteRects";
import { buildKsuRects, HAFS, TAJWEED, WARSH, type KsuRect } from "../../domain/KsuHiliteGeometry";
import { estimateBands } from "../../domain/PageAyahEstimator";
import { warshPageFirst, warshPageLast } from "../../domain/KsuWarshPageData";
import { tajweedPageFirst, tajweedPageLast } from "../../domain/KsuTajweedPageData";
import type { KsuAyahEnd } from "../../domain/KsuHiliteGeometry";
import type { AyahTiming, QuranSurah } from "../../domain/Models";
import { appContainer } from "../../data/AppContainer";
import {
  ayahTajweedUrl,
  islamicPageUrl,
  ksuPageUrl,
  madinahSvgUrl,
  mushafStyle,
  pageForVerse,
  type MushafStyleInfo,
} from "./mushafStyles";

interface MushafPageViewProps {
  style: number;
  /** Current timing entry (for the timing-pagination page + polygon). */
  entry: AyahTiming | null;
  timingEntries: AyahTiming[] | null;
  currentAyah: number;
  verseKey: string | null;
  surah: QuranSurah;
  /** For no-timing browse + estimator fallback. */
  noTimingPage: number;
  hasTiming: boolean;
  color: string;
  align?: "center" | "end";
  onError?: (msg: string) => void;
}

interface Highlight {
  rects: KsuRect[];
  color: string;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, fontSize: number): number {
  try {
    if (!measureCtx) {
      const canvas = document.createElement("canvas");
      measureCtx = canvas.getContext("2d");
    }
    if (measureCtx) {
      measureCtx.font = `${fontSize}px "Amiri Quran", "Amiri", serif`;
      return measureCtx.measureText(text).width;
    }
  } catch {
    /* fall through */
  }
  return text.length * fontSize * 0.45;
}

export function MushafPageView(props: MushafPageViewProps) {
  const c = appContainer();
  const style = createMemo(() => mushafStyle(props.style));

  /* ---------- resolve the page ---------- */
  const timingPage = createMemo(() => {
    if (!props.hasTiming) return null;
    const e = props.entry;
    if (!e?.pageUrl) return null;
    const m = /([0-9]+)\.svg$/.exec(e.pageUrl);
    return m ? Number.parseInt(m[1], 10) : null;
  });

  const page = createMemo(() => {
    const s = style();
    const p =
      pageForVerse(s, timingPage(), props.surah.id, props.currentAyah) ??
      (props.hasTiming ? null : props.noTimingPage);
    return p && p >= 1 ? p : null;
  });

  /* ---------- source URL ---------- */
  const sourceUrl = createMemo(() => {
    const s = style();
    const p = page();
    if (p === null) return null;
    switch (s.kind) {
      case "madinah-svg":
        return props.hasTiming && props.entry?.pageUrl
          ? props.entry.pageUrl
          : madinahSvgUrl(p);
      case "ayah-tajweed":
        return props.currentAyah >= 1 ? ayahTajweedUrl(props.surah.id, props.currentAyah) : null;
      case "islamic-svg":
        return islamicPageUrl(p);
      case "ksu":
        return ksuPageUrl(s, p);
    }
  });

  /* islamic.app rects (per page, cached) */
  const [islamicRectsMap, setIslamicRectsMap] = createSignal(new Map<string, KsuRect[]>());
  const islamicRects = createMemo(() => islamicRectsMap());
  createEffect(() => {
    const s = style();
    const p = page();
    if (s.kind !== "islamic-svg" || p === null || !props.verseKey) return;
    const url = islamicPageUrl(p);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const svg = await res.text();
        const vb = parseViewBox(svg);
        if (!vb) return;
        const lines = parseLines(svg);
        if (lines.length === 0) return;
        const rects = buildIslamicRects(lines, vb.w, vb.h, measureText);
        setIslamicRectsMap(new Map(rects));
      } catch {
        props.onError?.(url);
      }
    })();
  });

  /* KSU hilites rects (per page, via the repository) */
  const [ksuRectsMap, setKsuRectsMap] = createSignal(new Map<string, KsuRect[]>());
  const ksuRects = createMemo(() => ksuRectsMap());
  const [positions, setPositions] = createSignal<KsuAyahEnd[] | null>(null);
  createEffect(() => {
    const s = style();
    const p = page();
    if (s.kind !== "ksu" || p === null) {
      setPositions(null);
      setKsuRectsMap(new Map());
      return;
    }
    const mushaf = s.ksuMushaf!;
    void (async () => {
      const pos = await c.ksuHilites.positionsFor(mushaf, p);
      setPositions(pos);
      if (pos && pos.length > 0) {
        const meta = s.ksuMeta === "WARSH" ? WARSH : s.ksuMeta === "TAJWEED" ? TAJWEED : HAFS;
        const size = s.imageSize!;
        const rects = buildKsuRects(pos, p, meta, size.w, size.h);
        setKsuRectsMap(new Map(rects));
      } else {
        setKsuRectsMap(new Map());
      }
    })();
  });

  /* estimator fallback band for KSU pages */
  const estimatedBand = createMemo(() => {
    const s = style();
    const p = page();
    if (s.kind !== "ksu" || p === null) return null;
    // ayahs on this page within the current surah
    let ayahs: number[] = [];
    if (s.pagination === "timing") {
      const entries = props.timingEntries;
      if (!entries) return null;
      const pageKey = `000${p}`.slice(-3);
      ayahs = entries.filter((e) => e.pageUrl?.includes(`/${pageKey}.svg`)).map((e) => e.ayah);
    } else {
      const first = s.pagination === "warsh" ? warshPageFirst(p) : tajweedPageFirst(p);
      const last = s.pagination === "warsh" ? warshPageLast(p) : tajweedPageLast(p);
      if (first === null || last === null) return null;
      const firstS = Math.trunc(first / 1000);
      const firstA = first % 1000;
      const lastS = Math.trunc(last / 1000);
      const lastA = last % 1000;
      if (props.surah.id < firstS || props.surah.id > lastS) return null;
      const a1 = props.surah.id === firstS ? firstA : 1;
      const a2 = props.surah.id === lastS ? lastA : props.surah.versesCount;
      ayahs = [];
      for (let a = a1; a <= a2; a++) ayahs.push(a);
    }
    if (ayahs.length === 0) return null;
    const band = estimateBands(ayahs, ayahs.map((a) => props.surah.versesCount * 3), false).get(props.currentAyah);
    return band ?? null;
  });


  /* ---------- highlight ---------- */
  const highlight = createMemo<Highlight | null>(() => {
    if (props.currentAyah < 1) return null;
    const s = style();
    const p = page();
    if (p === null) return null;
    const color = props.color;

    switch (s.kind) {
      case "madinah-svg": {
        const poly = props.entry?.polygon ?? null;
        if (!poly || poly.length === 0) return null;
        const xs = poly.map((pt) => pt.x);
        const ys = poly.map((pt) => pt.y);
        return {
          color,
          rects: [{ left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }],
        };
      }
      case "ayah-tajweed":
        // The image IS the ayah — frame it.
        return { color, rects: [{ left: 0.01, top: 0.01, right: 0.99, bottom: 0.99 }] };
      case "islamic-svg": {
        if (!props.verseKey) return null;
        // Computed lazily per page (see below).
        return islamicRects().get(props.verseKey)?.length
          ? { color, rects: islamicRects().get(props.verseKey)! }
          : null;
      }
      case "ksu": {
        if (!props.verseKey) return null;
        const exact = ksuRects().get(props.verseKey);
        if (exact && exact.length > 0) return { color, rects: exact };
        // Offline fallback: text-length estimator bands.
        const band = estimatedBand();
        if (band) {
          return { color, rects: [{ left: 0.03, top: band.yTop, right: 0.97, bottom: band.yBottom }] };
        }
        return null;
      }
    }
  });

  /* ---------- render box ---------- */
  const [container, setContainer] = createSignal({ w: 1280, h: 720 });
  const containerRef = (el: HTMLDivElement | undefined) => {
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setContainer({ w: r.width, h: r.height });
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  };

  // Rendered box: keep the source aspect ratio, fit into the container.
  const aspect = createMemo(() => {
    const s = style();
    const src = sourceUrl();
    if (s.kind === "ksu") {
      const size = s.imageSize!;
      return size.w / size.h;
    }
    if (s.kind === "ayah-tajweed") return 1500 / 1000; // islamic.network high-res
    // SVG pages: use the viewBox when known; default Madinah 235×235.
    return 235 / 235;
  });

  const fitted = createMemo(() => {
    const c = container();
    const a = aspect();
    if (c.w <= 0 || c.h <= 0) return null;
    const scale = Math.min(c.w / a, c.h);
    return { w: Math.floor(a * scale), h: Math.floor(scale) };
  });

  // Prefetch the next page.
  createEffect(() => {
    const src = sourceUrl();
    if (src && style().kind === "ksu") {
      const img = new Image();
      img.src = src;
    }
  });

  // Fraction rects → pixel rects within the fitted box.
  const pixelRects = createMemo(() => {
    const b = fitted();
    const h = highlight();
    if (!b || !h) return [];
    return h.rects
      .map((r) => ({
        left: r.left * b.w,
        top: r.top * b.h,
        w: Math.max(2, (r.right - r.left) * b.w),
        h: Math.max(2, (r.bottom - r.top) * b.h),
      }))
      .filter((r) => r.w > 1 && r.h > 1);
  });

  const alignStyle = props.align === "end" ? "justify-content:flex-end" : "justify-content:center";

  return (
    <div ref={containerRef} style={`width:100%;height:100%;display:flex;align-items:center;${alignStyle};overflow:hidden;background:#f5efe2`}>
      <Show when={sourceUrl()} fallback={<div style="color:#555;font-size:22px">…</div>}>
        <Show when={fitted()} fallback={null}>
          {(b) => (
            <div style={`position:relative;width:${b().w}px;height:${b().h}px;flex-shrink:0`}>
              <img
                src={sourceUrl()!}
                alt=""
                style={`width:${b().w}px;height:${b().h}px;display:block`}
                draggable={false}
              />
              {pixelRects().map((r, i) => (
                <div
                  style={{
                    position: "absolute",
                    left: `${r.left}px`,
                    top: `${r.top}px`,
                    width: `${r.w}px`,
                    height: `${r.h}px`,
                    background: `${highlight()!.color}59`, // 35% alpha
                    border: `3px solid ${highlight()!.color}`,
                    "border-radius": "8px",
                    "pointer-events": "none",
                    transition: "all 0.2s ease",
                  }}
                />
              ))}
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}

export type { MushafStyleInfo };
