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

/** Generate standardized clean slug for a recitation. */
export function generateCleanSlug(
  reciterName: string,
  moshafName?: string | null,
  moshafId?: number | null,
  reciterId?: number | null,
): string {
  const rLower = (reciterName || "").toLowerCase();
  const mLower = (moshafName || "").toLowerCase();

  let recSlug = "reciter";
  if (rLower.includes("hussary") || rLower.includes("husary") || rLower.includes("حصري")) recSlug = "husry";
  else if (rLower.includes("afasy") || rLower.includes("alafasi") || rLower.includes("عفاسي")) recSlug = "afasy";
  else if (rLower.includes("minshawi") || rLower.includes("منشاوي")) recSlug = "minshawi";
  else if (rLower.includes("abdulbasit") || rLower.includes("عبد الباسط") || rLower.includes("عبدالباسط")) recSlug = "abdulbasit";
  else if (rLower.includes("shuraym") || rLower.includes("شريم")) recSlug = "shuraym";
  else if (rLower.includes("sudais") || rLower.includes("سديس")) recSlug = "sudais";
  else if (rLower.includes("ghamadi") || rLower.includes("غامدي")) recSlug = "ghamadi";
  else if (rLower.includes("maher") || rLower.includes("معيقلي")) recSlug = "maher";
  else if (rLower.includes("ayyoub") || rLower.includes("ayyub") || rLower.includes("أيوب")) recSlug = "ayyoub";
  else if (rLower.includes("tblawi") || rLower.includes("tablawi") || rLower.includes("طبلاوي")) recSlug = "tblawi";
  else if (rLower.includes("hudhaify") || rLower.includes("huthifi") || rLower.includes("حذيفي")) recSlug = "hudhaify";
  else if (rLower.includes("ajm") || rLower.includes("ajamy") || rLower.includes("عجمي")) recSlug = "ajamy";
  else if (rLower.includes("akram") || rLower.includes("علاقمي")) recSlug = "akram";
  else if (rLower.includes("akdr") || rLower.includes("اخضر") || rLower.includes("أخضر")) recSlug = "akhdar";
  else if (rLower.includes("bana") || rLower.includes("بنا")) recSlug = "banna";
  else if (rLower.includes("juhany") || rLower.includes("جهني")) recSlug = "juhany";
  else if (rLower.includes("shatri") || rLower.includes("شاطري")) recSlug = "shatri";
  else if (rLower.includes("yasser") || rLower.includes("ياسر")) recSlug = "yasser";
  else if (rLower.includes("basfar") || rLower.includes("بصفر")) recSlug = "basfar";
  else if (rLower.includes("qari") || rLower.includes("قاري")) recSlug = "qari";
  else if (rLower.includes("khayat") || rLower.includes("خياط")) recSlug = "khayat";
  else if (rLower.includes("matroud") || rLower.includes("مطرود")) recSlug = "matroud";
  else if (rLower.includes("zaki") || rLower.includes("داغستاني")) recSlug = "daghistani";
  else if (rLower.includes("dokali") || rLower.includes("دوكالي")) recSlug = "dokali";
  else if (rLower.includes("balilah") || rLower.includes("بليلة")) recSlug = "balilah";
  else if (rLower.includes("khalaf") || rLower.includes("خلف")) recSlug = "khalaf";
  else if (rLower.includes("dosri") || rLower.includes("دوسري")) recSlug = "dosri";
  else if (rLower.includes("jaleel") || rLower.includes("عبد الجليل")) recSlug = "abduljaleel";
  else if (rLower.includes("qahtani") || rLower.includes("قحطاني")) recSlug = "qahtani";
  else if (rLower.includes("swaiyd") || rLower.includes("سويد")) recSlug = "suwaid";
  else if (rLower.includes("peshawa") || rLower.includes("بيشوا")) recSlug = "peshawa";
  else if (rLower.includes("turki") || rLower.includes("تركي")) recSlug = "turki";
  else if (rLower.includes("saleh") || rLower.includes("صالح")) recSlug = "saleh";
  else if (rLower.includes("rashad") || rLower.includes("رشاد")) recSlug = "rashad";
  else if (rLower.includes("bassiouni") || rLower.includes("بسيوني")) recSlug = "bassiouni";
  else {
    recSlug = rLower.replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").substring(0, 18) || `reciter-${reciterId || 1}`;
  }

  let riwayahSlug = "hafs";
  if (mLower.includes("warsh") || mLower.includes("ورش")) riwayahSlug = "warsh";
  else if (mLower.includes("qalon") || mLower.includes("قالون")) riwayahSlug = "qalon";
  else if (mLower.includes("dori") || mLower.includes("douri") || mLower.includes("دوري")) riwayahSlug = "dori";
  else if (mLower.includes("susi") || mLower.includes("سوسي")) riwayahSlug = "susi";
  else if (mLower.includes("bazzi") || mLower.includes("بزي")) riwayahSlug = "bazzi";
  else if (mLower.includes("shuba") || mLower.includes("شعبة")) riwayahSlug = "shuba";
  else if (mLower.includes("mojawwad") || mLower.includes("مجود")) riwayahSlug = "mojawwad";
  else if (mLower.includes("mo-lim") || mLower.includes("معلم")) riwayahSlug = "moallim";

  if (mLower.includes("mojawwad") || mLower.includes("مجود")) {
    riwayahSlug = "mojawwad";
  } else if (mLower.includes("mo-lim") || mLower.includes("معلم")) {
    riwayahSlug = "moallim";
  } else if (mLower.includes("مرتل") || mLower.includes("murattal")) {
    riwayahSlug = `${riwayahSlug}-murattal`;
  }

  return `qurantvapp-${recSlug}-${riwayahSlug}`;
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
