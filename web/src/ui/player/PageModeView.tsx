// Mushaf page mode — renders the mp3quran SVG page natively and overlays the
// current ayah's polygon highlight, mapping from the SVG viewBox to the
// rendered box (ported PageMapping math). Prefetches the next page.

import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { parseViewBox, toScreen, type ViewBox } from "../../domain/PageMapping";
import type { PointF, AyahTiming } from "../../domain/Models";

interface PageModeViewProps {
  /** The current page's SVG URL (timing entry pageUrl). */
  pageUrl: string | null;
  /** Polygon of the current ayah in page space (null = basmala/header). */
  polygon: PointF[] | null;
  /** Next page URL to prefetch. */
  nextPageUrl: string | null;
  /** Highlight color (settings). */
  color: string;
  /** Align the rendered page toward the spine when in the split view. */
  align?: "center" | "end";
  onPageError?: (url: string) => void;
}

export function PageModeView(props: PageModeViewProps) {
  const [viewBox, setViewBox] = createSignal<ViewBox | null>(null);
  const [box, setBox] = createSignal<{ w: number; h: number } | null>(null);
  const containerRef = (el: HTMLDivElement | undefined) => {
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setContainer({ w: r.width, h: r.height });
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  };
  const [container, setContainer] = createSignal({ w: 1280, h: 720 });

  // Fetch + parse the SVG (we need the real viewBox; the <img> itself renders it).
  createEffect(() => {
    const url = props.pageUrl;
    if (!url) {
      setViewBox(null);
      return;
    }
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((svg) => {
        if (cancelled) return;
        const vb = parseViewBox(svg);
        if (vb) setViewBox(vb);
      })
      .catch(() => props.onPageError?.(url));
    return () => {
      cancelled = true;
    };
  });

  // Prefetch the next page (browser cache) so page turns are instant.
  createEffect(() => {
    const next = props.nextPageUrl;
    if (next) {
      const img = new Image();
      img.src = next;
    }
  });

  // Rendered box: fit the viewBox into the container.
  const fitted = createMemo(() => {
    const vb = viewBox();
    const c = container();
    if (!vb || vb.w <= 0 || vb.h <= 0 || c.w <= 0 || c.h <= 0) return null;
    const scale = Math.min(c.w / vb.w, c.h / vb.h);
    return { w: Math.floor(vb.w * scale), h: Math.floor(vb.h * scale) };
  });

  createEffect(() => setBox(fitted()));

  // Highlight rects in rendered pixels.
  const rects = createMemo(() => {
    const vb = viewBox();
    const b = box();
    const poly = props.polygon;
    if (!vb || !b || !poly || poly.length === 0) return [];
    const mapped = toScreen(poly, vb, b.w, b.h);
    if (mapped.length === 0) return [];
    const xs = mapped.map((p) => p.x);
    const ys = mapped.map((p) => p.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const inset = Math.max(2, b.w / 600);
    return [
      {
        left: left + inset,
        top: top + inset,
        w: Math.max(4, right - left - inset * 2),
        h: Math.max(4, bottom - top - inset * 2),
      },
    ];
  });

  const alignStyle = props.align === "end" ? "justify-content:flex-end" : "justify-content:center";
  return (
    <div ref={containerRef} style={`width:100%;height:100%;display:flex;align-items:center;${alignStyle};overflow:hidden;background:#f5efe2`}>
      <Show when={box()} fallback={<div style="color:#555;font-size:22px">…</div>}>
        {(b) => (
          <div style={`position:relative;width:${b().w}px;height:${b().h}px`}>
            <Show when={props.pageUrl} fallback={null}>
              <img
                src={props.pageUrl!}
                alt=""
                style={`width:${b().w}px;height:${b().h}px;display:block`}
                draggable={false}
              />
            </Show>
            {rects().map((r) => (
              <div
                style={{
                  position: "absolute",
                  left: `${r.left}px`,
                  top: `${r.top}px`,
                  width: `${r.w}px`,
                  height: `${r.h}px`,
                  background: `${props.color}59`, // 35% alpha
                  border: `3px solid ${props.color}`,
                  "border-radius": "8px",
                  "pointer-events": "none",
                  transition: "all 0.2s ease",
                }}
              />
            ))}
          </div>
        )}
      </Show>
    </div>
  );
}

/** Derive the mushaf page number from a timing pageUrl (basename, no ext). */
export function pageNumberFromUrl(url: string | null): number {
  if (!url) return 0;
  const m = /([0-9]+)\.svg$/.exec(url);
  return m ? Number.parseInt(m[1], 10) : 0;
}

/** The pageUrl of the NEXT page after the current ayah's (for prefetch). */
export function nextPageUrlFor(entries: AyahTiming[], currentAyah: number): string | null {
  // Next entry with a different page URL than the current one.
  const current = entries.find((e) => e.ayah === currentAyah);
  if (!current?.pageUrl) return null;
  for (const e of entries) {
    if (e.ayah <= currentAyah) continue;
    if (e.pageUrl && e.pageUrl !== current.pageUrl) return e.pageUrl;
  }
  return null;
}
