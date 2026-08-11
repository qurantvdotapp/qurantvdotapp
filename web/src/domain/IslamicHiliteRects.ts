// Ported 1:1 from app/src/main/java/com/qurantv/app/domain/IslamicHiliteRects.kt
// Exact per-ayah highlight rects for islamic.app pages (same region logic as
// the KSU hilitePage). Text width measurement is injected so the algorithm
// stays pure (the loader supplies a Paint.measureText equivalent).

import type { IslamicLine } from "./IslamicPageBands";
import type { KsuRect } from "./KsuHiliteGeometry";

interface LineLayout {
  lineTop: number;
  lineBottom: number;
  lineLeft: number;
  lineRight: number;
}

interface AyahEnd {
  key: string;
  x: number;
  y: number;
}

/**
 * @param lines the page's ayah text lines
 * @param viewBoxWidth / height the SVG viewBox (fraction space)
 * @param measure text -> width for the line's font
 * @returns ayah key -> highlight rects in fraction-of-page units
 */
export function buildIslamicRects(
  lines: IslamicLine[],
  viewBoxWidth: number,
  viewBoxHeight: number,
  measure: (text: string, fontSize: number) => number,
): Map<string, KsuRect[]> {
  if (lines.length === 0 || viewBoxWidth <= 0 || viewBoxHeight <= 0) return new Map();

  const ends = new Map<string, AyahEnd>();
  const lineLayouts: LineLayout[] = [];

  for (const line of lines) {
    const widths = line.tspans.map((t) => Math.max(0, measure(t.text, line.fontSize)));
    const total = widths.reduce((a, b) => a + b, 0);
    const lineRight = line.anchorX + total / 2;
    const lineLeft = line.anchorX - total / 2;
    lineLayouts.push({
      lineTop: line.baselineY - line.fontSize * 0.95,
      lineBottom: line.baselineY + line.fontSize * 0.35,
      lineLeft,
      lineRight,
    });
    let consumed = 0;
    for (let j = 0; j < line.tspans.length; j++) {
      consumed += widths[j];
      const key = line.tspans[j].ayahKey;
      if (key !== null) {
        ends.set(key, { key, x: lineRight - consumed, y: line.baselineY });
      }
    }
  }

  const ayahKeys = [...ends.keys()];
  const out = new Map<string, KsuRect[]>();
  for (let idx = 0; idx < ayahKeys.length; idx++) {
    const key = ayahKeys[idx];
    const end = ends.get(key)!;
    const firstLineIndex = firstLineOf(lines, key);
    const lastLineIndex = lineIndexOf(lines, end.y);
    const firstLayout = lineLayouts[firstLineIndex];
    const lastLayout = lineLayouts[lastLineIndex];

    const prevEnd = idx === 0 ? undefined : ends.get(ayahKeys[idx - 1]);
    const startX =
      prevEnd !== undefined && lineIndexOf(lines, prevEnd.y) === firstLineIndex
        ? prevEnd.x
        : firstLayout.lineRight;

    let rects: KsuRect[];
    if (firstLineIndex === lastLineIndex) {
      rects = [islamicRect(startX, end.x, firstLayout.lineTop, firstLayout.lineBottom, viewBoxWidth, viewBoxHeight)];
    } else {
      const builder: KsuRect[] = [];
      builder.push(
        islamicRect(firstLayout.lineLeft, startX, firstLayout.lineTop, firstLayout.lineBottom, viewBoxWidth, viewBoxHeight),
      );
      for (let m = firstLineIndex + 1; m < lastLineIndex; m++) {
        const ml = lineLayouts[m];
        builder.push(islamicRect(ml.lineLeft, ml.lineRight, ml.lineTop, ml.lineBottom, viewBoxWidth, viewBoxHeight));
      }
      builder.push(
        islamicRect(end.x, lastLayout.lineRight, lastLayout.lineTop, lastLayout.lineBottom, viewBoxWidth, viewBoxHeight),
      );
      rects = builder;
    }
    out.set(key, rects);
  }
  return out;
}

function firstLineOf(lines: IslamicLine[], ayahKey: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].tspans.some((t) => t.ayahKey === ayahKey)) return i;
  }
  return 0;
}

function lineIndexOf(lines: IslamicLine[], baselineY: number): number {
  let best = 0;
  let bestDist = Number.MAX_VALUE;
  for (let i = 0; i < lines.length; i++) {
    const d = Math.abs(lines[i].baselineY - baselineY);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function islamicRect(left: number, right: number, top: number, bottom: number, vw: number, vh: number): KsuRect {
  const l = Math.min(left, right);
  const r = Math.max(left, right);
  return {
    left: clamp01(l / vw),
    top: clamp01(top / vh),
    right: clamp01(r / vw),
    bottom: clamp01(bottom / vh),
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
