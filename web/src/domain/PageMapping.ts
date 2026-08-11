// Ported 1:1 from app/src/main/java/com/qurantv/app/domain/PageMapping.kt
// Coordinate mapping between the SVG mushaf page space and screen pixels.
// The actual viewBox is ALWAYS parsed from the SVG (pages vary: 235×235 early
// pages, page 187 is 345×550) — never assume 235.

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_VIEW_BOX: ViewBox = { x: 0, y: 0, w: 235, h: 235 };

const VIEW_BOX_REGEX = /viewBox\s*=\s*["']([^"']+)["']/i;

export function parseViewBox(svg: string): ViewBox | null {
  const match = VIEW_BOX_REGEX.exec(svg);
  if (!match) return null;
  const parts = match[1]
    .trim()
    .split(/[\s,]+/)
    .map((it) => Number.parseFloat(it))
    .filter((n) => Number.isFinite(n));
  if (parts.length !== 4) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

/** Maps a polygon from page space into a screen rect of (screenW x screenH). */
export function toScreen(
  polygon: PointF[],
  viewBox: ViewBox,
  screenW: number,
  screenH: number,
): PointF[] {
  if (screenW <= 0 || screenH <= 0 || viewBox.w <= 0 || viewBox.h <= 0) return [];
  const sx = screenW / viewBox.w;
  const sy = screenH / viewBox.h;
  return polygon.map((p) => ({ x: (p.x - viewBox.x) * sx, y: (p.y - viewBox.y) * sy }));
}

import type { PointF } from "./Models";
