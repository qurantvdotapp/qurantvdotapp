import { warshPageFor } from "../../domain/KsuWarshPageData";
import { tajweedPageFor } from "../../domain/KsuTajweedPageData";

// Mushaf style configuration — the 6 page styles (Android parity):
// 0 = Madinah SVG (mp3quran) · 1 = التجويد الملون (per-ayah tajweed, islamic.network)
// 2 = المدينة HD (islamic.app SVG) · 3 = آيات حفص (KSU) · 4 = آيات ورش (KSU)
// 5 = حفص ملون (KSU tajweed full-page — the DEFAULT, matches the Android app)

export type MushafKind = "madinah-svg" | "ayah-tajweed" | "islamic-svg" | "ksu";

export interface MushafStyleInfo {
  id: number;
  kind: MushafKind;
  labelKey: "mushaf_madinah" | "mushaf_tajweed" | "mushaf_madinah_hd" | "mushaf_ayat_hafs" | "mushaf_ayat_warsh" | "mushaf_hafs_tajweed";
  /** KSU hilites mushaf name + page image base (for kind === "ksu"). */
  ksuMushaf?: string;
  ksuBaseUrl?: string;
  ksuMeta?: "HAFS" | "WARSH" | "TAJWEED";
  imageSize?: { w: number; h: number };
  /** Pagination: "timing" (standard Madinah = the timing page field) or warsh/tajweed. */
  pagination: "timing" | "warsh" | "tajweed";
}

export const MUSHAF_STYLES: MushafStyleInfo[] = [
  { id: 0, kind: "madinah-svg", labelKey: "mushaf_madinah", pagination: "timing" },
  { id: 1, kind: "ayah-tajweed", labelKey: "mushaf_tajweed", pagination: "timing" },
  { id: 2, kind: "islamic-svg", labelKey: "mushaf_madinah_hd", pagination: "timing" },
  {
    id: 3, kind: "ksu", labelKey: "mushaf_ayat_hafs", pagination: "timing",
    ksuMushaf: "hafs", ksuMeta: "HAFS", imageSize: { w: 456, h: 672 },
    ksuBaseUrl: "https://quran.ksu.edu.sa/ayat/safahat1",
  },
  {
    id: 4, kind: "ksu", labelKey: "mushaf_ayat_warsh", pagination: "warsh",
    ksuMushaf: "warsh", ksuMeta: "WARSH", imageSize: { w: 620, h: 1005 },
    ksuBaseUrl: "https://quran.ksu.edu.sa/warsh",
  },
  {
    id: 5, kind: "ksu", labelKey: "mushaf_hafs_tajweed", pagination: "tajweed",
    ksuMushaf: "tajweed", ksuMeta: "TAJWEED", imageSize: { w: 456, h: 707 },
    ksuBaseUrl: "https://quran.ksu.edu.sa/tajweed_png",
  },
];

export function mushafStyle(id: number): MushafStyleInfo {
  return MUSHAF_STYLES.find((s) => s.id === id) ?? MUSHAF_STYLES[0];
}

/** Page number of the current verse in the style's pagination. */
export function pageForVerse(
  style: MushafStyleInfo,
  timingPage: number | null,
  surahId: number,
  ayah: number,
): number | null {
  if (ayah < 1) return null; // basmala slot: no page highlight
  switch (style.pagination) {
    case "timing":
      return timingPage ?? null;
    case "warsh":
      return warshPageFor(surahId, ayah);
    case "tajweed":
      return tajweedPageFor(surahId, ayah);
  }
}

/** KSU page image URL. */
export function ksuPageUrl(style: MushafStyleInfo, page: number): string {
  return `${style.ksuBaseUrl}/${page}.png`;
}

/** Per-ayah tajweed image URL (style 1). */
export function ayahTajweedUrl(surahId: number, ayah: number): string {
  return `https://cdn.islamic.network/quran/images/high-resolution/${surahId}_${ayah}.png`;
}

/** islamic.app HD page SVG URL (style 2) — same Madinah pagination as timing. */
export function islamicPageUrl(page: number): string {
  return `https://api.islamic.app/v1/mushaf/page/${page}.svg?theme=dark&width=1200`;
}

/** Standard Madinah SVG page URL (style 0, mp3quran). */
export function madinahSvgUrl(page: number): string {
  return `https://www.mp3quran.net/api/quran_pages_svg/${page.toString().padStart(3, "0")}.svg`;
}
