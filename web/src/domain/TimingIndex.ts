// Ported 1:1 from app/src/main/java/com/qurantv/app/domain/TimingIndex.kt
// Locates the current ayah for a playback position using binary search over the
// sorted timing entries.

import type { SurahTiming } from "./Models";

/**
 * Returns the entry's TIMING INDEX (its `ayah` field), NOT its list position —
 * reads without a basmala entry (entries starting at 1) would otherwise shift
 * every highlight one ayah behind. Before the first entry returns 0 (the
 * virtual basmala/header slot); empty timing returns -1.
 */
export function ayahAt(timing: SurahTiming, positionMs: number): number {
  const entries = timing.entries;
  if (entries.length === 0) return -1;
  let lo = 0;
  let hi = entries.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (entries[mid].startMs <= positionMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (result < 0) return 0; // before the first entry: header/basmala slot
  // Skip intervals already past (missing/zero end time), but never advance into
  // an ayah whose start has not been reached: during an inter-ayah silence gap
  // the previous ayah stays highlighted until the next one actually begins.
  while (
    result < entries.length - 1 &&
    entries[result].endMs <= positionMs &&
    entries[result + 1].startMs <= positionMs
  ) {
    result++;
  }
  return entries[result].ayah;
}
