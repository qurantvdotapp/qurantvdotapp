// Ported 1:1 from app/src/main/java/com/qurantv/app/data/repo/QuranTextRepository.kt
// Authentic Uthmani Quran text:
//  - primary: bundled Tanzil `quran-uthmani.txt` (canonical, offline), parsed
//    once into an in-memory `verse_key -> text` map (~6k entries);
//  - fallback: Quran.com API v4 `text_uthmani`, cached per surah forever.

import { QuranComApi } from "../api/QuranComApi";
import type { VerseDto } from "../api/Dtos";
import { CACHE, JsonDiskCache } from "../cache/JsonDiskCache";
import { loadAssetText } from "../assetLoader";

const TANZIL_ASSET = "quran/quran-uthmani.txt";

export class QuranTextRepository {
  private tanzilMap: Map<string, string> | null = null;

  constructor(
    private readonly quranApi: QuranComApi,
    private readonly cache: JsonDiskCache,
  ) {}

  private async loadTanzil(): Promise<Map<string, string>> {
    if (this.tanzilMap !== null) return this.tanzilMap;
    const map = new Map<string, string>();
    try {
      // XHR not fetch: file:// in the Android TV webview blocks fetch().
      const text = await loadAssetText(TANZIL_ASSET);
      for (const line of text.split("\n")) {
        const parts = line.split("|", 3);
        if (parts.length === 3 && parts[0] !== "" && parts[1] !== "") {
          map.set(`${parts[0]}:${parts[1]}`, parts[2]);
        }
      }
    } catch {
      // fall back to Quran.com per-verse lookups
    }
    this.tanzilMap = map;
    return map;
  }

  /** Text length of a verse (0 when unknown) — used by the page highlight estimator. */
  async verseTextLength(surahId: number, verseNumber: number): Promise<number> {
    return (await this.loadTanzil()).get(`${surahId}:${verseNumber}`)?.length ?? 0;
  }

  async verseText(surahId: number, verseNumber: number): Promise<string | null> {
    const key = `${surahId}:${verseNumber}`;
    const raw = (await this.loadTanzil()).get(key);
    if (raw !== undefined) {
      // Tanzil embeds the basmala as a prefix of verse 1 for surahs 2–114; the
      // recitation recites it as its own segment (timing index 0, shown as the
      // basmala header), NOT as part of verse 1 — strip the prefix so displayed
      // text matches the audio 1:1. The prefix comes from the data itself (1|1).
      // Surah 9 has no basmala, and surah 1's verse 1 IS the basmala — both are
      // naturally untouched by this branch.
      if (surahId >= 2 && surahId <= 114 && verseNumber === 1) {
        const basmala = (await this.loadTanzil()).get("1:1");
        if (basmala !== undefined) {
          return stripBasmala(raw, basmala);
        }
      }
      return raw;
    }
    return this.cachedVerseFromQuranCom(surahId, key);
  }

  private async cachedVerseFromQuranCom(
    surahId: number,
    key: string,
  ): Promise<string | null> {
    const cacheKey = `ch${surahId}`;
    return this.cache.singleFlight(cacheKey, async () => {
      const cached = await this.cache.read(CACHE.QURAN_TEXT, cacheKey);
      let verses: VerseDto[];
      if (cached !== null) {
        verses = (JSON.parse(cached) as { verses: VerseDto[] }).verses;
      } else {
        try {
          verses = await this.quranApi.versesUthmani(surahId);
          await this.cache.write(CACHE.QURAN_TEXT, cacheKey, JSON.stringify({ verses }));
        } catch {
          verses = [];
        }
      }
      return verses.find((v) => v.verse_key === key)?.text_uthmani ?? null;
    });
  }
}

export function stripBasmala(text: string, basmala: string): string {
  if (!text.startsWith(basmala)) return text.trim();
  const rest = text.slice(basmala.length).trimStart();
  return rest.length > 0 ? rest : text.trim();
}
