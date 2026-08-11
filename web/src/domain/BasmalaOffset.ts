// Ported 1:1 from app/src/main/java/com/qurantv/app/domain/BasmalaOffset.kt
// Maps mp3quran timing ayah indices to Quran verse keys.

/**
 * Timing index 0 is always the un-numbered basmala / surah header slot
 * (no polygon, no page — skipped in page mode). Index i >= 1 ↔ verse key
 * "surah:i" for Hafs. Non-Hafs riwayat may count the basmala as verse 1 →
 * the text offset shifts by one; offset (per-moshaf, default 0) corrects it.
 */

/** entries == verses+2 means the basmala occupies a numbered verse in addition
 *  to the header slot → offset 1. Anything else keeps the standard layout. */
export function suggestOffset(timingEntryCount: number, versesCount: number): number {
  return timingEntryCount === versesCount + 2 ? 1 : 0;
}

/** Verse key for a timing ayah index, or null when the index maps to the
 *  un-numbered header (or lies outside the surah). */
export function verseKeyFor(
  timingAyah: number,
  surahId: number,
  versesCount: number,
  offset: number,
): string | null {
  if (timingAyah < 1) return null; // header slot (basmala), not a numbered verse
  const v = timingAyah - offset;
  return v >= 1 && v <= versesCount ? `${surahId}:${v}` : null;
}
