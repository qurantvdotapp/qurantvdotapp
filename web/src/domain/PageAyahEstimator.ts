// Ported 1:1 from app/src/main/java/com/qurantv/app/domain/PageAyahEstimator.kt
// Estimates per-ayah highlight bands on pages with no coordinate data (KSU
// raster fallback): each ayah's slice of the page is proportional to its text
// length. Bands are FRACTIONS of the page height (0..1).

const TOP_MARGIN = 0.03;
const HEADER_FRACTION = 2 / 15;
const BOTTOM_MARGIN = 0.03;

export interface PageAyahBand {
  yTop: number;
  yBottom: number;
}

/**
 * @param ayahs ayah numbers on the page, ascending
 * @param lengths their text lengths, same order
 * @param pageStartsSurah true when the page opens a surah (title + basmala)
 * @returns `ayah -> band` in fraction-of-page-height units
 */
export function estimateBands(
  ayahs: number[],
  lengths: number[],
  pageStartsSurah: boolean,
): Map<number, PageAyahBand> {
  if (ayahs.length === 0) return new Map();
  const total = Math.max(1, lengths.reduce((a, b) => a + b, 0));
  const top = pageStartsSurah ? TOP_MARGIN + HEADER_FRACTION : TOP_MARGIN;
  const usable = 1 - top - BOTTOM_MARGIN;
  let cursor = top;
  const result = new Map<number, PageAyahBand>();
  ayahs.forEach((ayah, i) => {
    const len = lengths[i];
    const fraction = len !== undefined && len > 0 ? len / total : 1 / ayahs.length;
    const yTop = cursor;
    const yBottom = Math.min(1 - BOTTOM_MARGIN, cursor + fraction * usable);
    result.set(ayah, { yTop, yBottom });
    cursor = yBottom;
  });
  return result;
}
