// Ported 1:1 from app/src/main/java/com/qurantv/app/domain/CatalogParsing.kt
// Defensive parsing helpers for the mp3quran catalog.
// Gotchas: `surah_list` is a comma string that may end with a trailing comma;
// server URLs may or may not end with `/` and may contain subdirectories.

import type { PointF } from "./Models";

export function parseSurahList(raw: string | null | undefined): number[] {
  if (raw === null || raw === undefined || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((it) => it.trim())
    .filter((it) => it.length > 0)
    .map((it) => Number.parseInt(it, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 114);
}

/** Always ends with a single trailing slash. */
export function normalizeServerUrl(server: string): string {
  const trimmed = server.trim();
  if (trimmed.length === 0) return trimmed;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/** mp3quran audio URL rule (verified): `{server}{surah:03d}.mp3`. */
export function audioUrlFor(server: string, surahId: number): string {
  return normalizeServerUrl(server) + surahId.toString().padStart(3, "0") + ".mp3";
}

/** Parses a polygon string such as "181.08,18.31 57.54,18.31 57.54,48.94 181.08,48.94". */
export function parsePolygon(raw: string | null | undefined): PointF[] | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const points: PointF[] = [];
  for (const pair of raw.trim().split(/\s+/)) {
    const parts = pair.split(",");
    if (parts.length !== 2) continue;
    const x = Number.parseFloat(parts[0].trim());
    const y = Number.parseFloat(parts[1].trim());
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ x, y });
  }
  return points.length >= 3 ? points : null;
}
