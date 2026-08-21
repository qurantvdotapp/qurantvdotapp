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
  // English/transliterated name (case-insensitive substring).
  if (reciter.nameEn && reciter.nameEn.toLowerCase().includes(q.toLowerCase())) return true;
  return reciter.letter !== null && normalizeArabic(reciter.letter) === needle;
}

/**
 * Folds common Arabic letter variants (hamza, ta marbuta, alif maqsura)
 * and strips diacritics/tashkeel (harakat, tanween, shadda, sukun) + tatweel
 * so search is forgiving.
 */
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
      case "ـ": // tatweel / kashida
      case "\u064B": // tanween fatha
      case "\u064C": // tanween damma
      case "\u064D": // tanween kasra
      case "\u064E": // fatha
      case "\u064F": // damma
      case "\u0650": // kasra
      case "\u0651": // shadda
      case "\u0652": // sukun
      case "\u0670": // superscript alef / dagger alif
        break;
      default: {
        const code = c.charCodeAt(0);
        if (code >= 0x064B && code <= 0x065F) {
          break;
        }
        out += c;
      }
    }
  }
  return out;
}
