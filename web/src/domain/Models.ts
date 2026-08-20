// Domain models — ported 1:1 from app/src/main/java/com/qurantv/app/domain/Models.kt
// (Pure TS, no framework deps — mirrors the Kotlin so behavior stays identical.)

/** A reciter from the mp3quran catalog (may have several moshafs / riwayat). */
export interface Reciter {
  id: number;
  name: string;
  /** English/transliterated name (from mp3quran language=en; null if unknown). */
  nameEn: string | null;
  letter: string | null;
  moshafs: Moshaf[];
}

/** One moshaf (riwaya + recitation style) of a reciter. */
export interface Moshaf {
  id: number;
  name: string;
  server: string;
  surahTotal: number | null;
  moshafType: number | null;
  rewayaId: number | null;
  surahList: number[];
}

/** Available surah ids; when the API omits the list, assume the full mushaf. */
export function availableSurahIds(moshaf: Moshaf): number[] {
  return moshaf.surahList.length === 0 ? Array.from({ length: 114 }, (_, i) => i + 1) : moshaf.surahList;
}

/** A surah with Arabic + English names and Madinah mushaf page range. */
export interface QuranSurah {
  id: number;
  nameAr: string;
  nameEn: string | null;
  versesCount: number;
  startPage: number;
  endPage: number;
  isMakki: boolean;
}

/** A read from the mp3quran ayat_timing/reads list (per-ayah timing provider). */
export interface TimingRead {
  id: number;
  name: string;
  rewaya: string | null;
  folderUrl: string;
}

/** A point in the SVG mushaf page coordinate space. */
export interface PointF {
  x: number;
  y: number;
}

/** Timing of one ayah: the audio span plus the highlight geometry on its page. */
export interface AyahTiming {
  ayah: number;
  startMs: number;
  endMs: number;
  polygon: PointF[] | null;
  x: number | null;
  y: number | null;
  pageUrl: string | null;
}

/** The full sorted ayah timing list for one (read, surah) pair. */
export class SurahTiming {
  readonly readId: number;
  readonly surahId: number;
  readonly entries: AyahTiming[];
  private readonly byAyah: Map<number, AyahTiming>;

  constructor(readId: number, surahId: number, entries: AyahTiming[]) {
    this.readId = readId;
    this.surahId = surahId;
    this.entries = entries;
    this.byAyah = new Map(entries.map((e) => [e.ayah, e]));
  }

  get lastEndMs(): number {
    const last = this.entries[this.entries.length - 1];
    return last ? last.endMs : 0;
  }

  /** The timing index of the last entry (e.g. 286 for surah 2). */
  get lastAyahIndex(): number {
    const last = this.entries[this.entries.length - 1];
    return last ? last.ayah : -1;
  }

  /**
   * The entry for a timing ayah index, or null when it has none.
   * Some reads include the basmala as timing index 0 (entry with ayah == 0);
   * others omit it (entries start at 1) — index 0 is then a virtual basmala
   * slot. Always look up by timing index, never by list position.
   */
  entryFor(ayah: number): AyahTiming | null {
    return this.byAyah.get(ayah) ?? null;
  }
}

/**
 * One horizontal highlight band on a mushaf page, in the page's viewBox
 * coordinate space (or fractions of the image height for KSU raster pages).
 */
export interface PageAyahBand {
  yTop: number;
  yBottom: number;
}

/** Simplified tafseer (الميسر) + word meanings (المعاني) + English translation
 *  for one ayah, from the KSU Ayat app's bundled databases. */
export interface AyahTafseer {
  tafseer: string;
  wordMeanings: string;
  translation: string;
}
