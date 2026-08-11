// Ported 1:1 from app/src/main/java/com/qurantv/app/ui/home/HomeViewModel.kt
// (reciterMatchesQuery + normalizeArabic)

import type { Reciter } from "./Models";

/**
 * Arabic-tolerant reciter search: case-insensitive substring match after
 * normalizing common letter forms — hamza variants (أ/إ/آ/ٱ → ا), ta marbuta
 * (ة → ه) and alif maqsura (ى → ي). Also matches the initial letter.
 */
export function reciterMatchesQuery(reciter: Reciter, query: string): boolean {
  const q = query.trim();
  if (q.length === 0) return true;
  const needle = normalizeArabic(q);
  if (normalizeArabic(reciter.name).toLowerCase().includes(needle.toLowerCase())) return true;
  return reciter.letter !== null && normalizeArabic(reciter.letter) === needle;
}

/** Folds common Arabic letter variants so search is forgiving. */
export function normalizeArabic(s: string): string {
  let out = "";
  for (const c of s) {
    switch (c) {
      case "أ":
      case "إ":
      case "آ":
      case "ٱ":
        out += "ا";
        break;
      case "ة":
        out += "ه";
        break;
      case "ى":
        out += "ي";
        break;
      default:
        out += c;
    }
  }
  return out;
}
