// Ported 1:1 from app/src/main/java/com/qurantv/app/data/repo/CatalogRepository.kt
// Catalog data (reciters, surahs, English names). Cached with a 24 h TTL so
// browsing works offline.

import { Mp3QuranApi, reciterDtoToDomain } from "../api/Mp3QuranApi";
import { QuranComApi } from "../api/QuranComApi";
import type { ChapterDto, ReciterDto, SurahDto } from "../api/Dtos";
import { CACHE, CACHE_TTL_24H, JsonDiskCache } from "../cache/JsonDiskCache";
import type { QuranSurah, Reciter } from "../../domain/Models";
import type { TimingRepository } from "./TimingRepository";
import { normalizeServerUrl } from "../../domain/CatalogParsing";

export class CatalogRepository {
  constructor(
    private readonly api: Mp3QuranApi,
    private readonly quranApi: QuranComApi,
    private readonly cache: JsonDiskCache,
    private readonly timingRepo?: TimingRepository,
  ) {}

  /** All surahs with Arabic (mp3quran) and English (Quran.com) names, merged by id. */
  async surahs(language: string): Promise<QuranSurah[]> {
    const key = `suwar_${language}`;
    return this.cache.singleFlight(key, async () => {
      const cached = await this.cache.read(CACHE.CATALOG, key, CACHE_TTL_24H);
      const suwar: SurahDto[] =
        cached !== null
          ? (JSON.parse(cached) as { suwar: SurahDto[] }).suwar
          : await this.api.suwar(language).then(async (list) => {
              await this.cache.write(CACHE.CATALOG, key, JSON.stringify({ suwar: list }));
              return list;
            });
      const chapters = await this.loadChapters("en");
      const byId = new Map(chapters.map((c) => [c.id, c]));
      return suwar.map((s) => {
        const ch = byId.get(s.id);
        return {
          id: s.id,
          nameAr: s.name,
          nameEn: ch?.name_simple ?? null,
          versesCount: ch?.verses_count ?? 0,
          startPage: s.start_page ?? 0,
          endPage: s.end_page ?? 0,
          isMakki: s.makkia === 1,
        };
      });
    });
  }

  private async loadChapters(language: string): Promise<ChapterDto[]> {
    const key = `chapters_${language}`;
    const cached = await this.cache.read(CACHE.CATALOG, key, CACHE_TTL_24H);
    if (cached !== null) {
      return (JSON.parse(cached) as { chapters: ChapterDto[] }).chapters;
    }
    try {
      const list = await this.quranApi.chapters(language);
      await this.cache.write(CACHE.CATALOG, key, JSON.stringify({ chapters: list }));
      return list;
    } catch {
      return []; // English names are enrichment only; never block the catalog
    }
  }

  /** Reciters (Arabic names), enriched with English names, strictly filtered to timed recitations. */
  async reciters(language: string): Promise<Reciter[]> {
    const [all, timedUrls] = await Promise.all([
      this.allReciters(language),
      this.timingRepo ? this.timingRepo.timedServerUrls() : Promise.resolve(null),
    ]);

    if (!timedUrls || timedUrls.size === 0) {
      return all;
    }

    return all
      .map((r) => ({
        ...r,
        moshafs: r.moshafs.filter((m) => timedUrls.has(normalizeServerUrl(m.server))),
      }))
      .filter((r) => r.moshafs.length > 0);
  }

  private async allReciters(language: string): Promise<Reciter[]> {
    const key = `reciters_aug_${language}`;
    return this.cache.singleFlight(key, async () => {
      const cached = await this.cache.read(CACHE.CATALOG, key, CACHE_TTL_24H);
      if (cached !== null) {
        return JSON.parse(cached) as Reciter[];
      }
      const [ar, en] = await Promise.all([this.rawReciters("ar"), this.rawReciters("en")]);
      // Key by reciter id (the ar and en lists share ids); nameEn carries the English name.
      const enById = new Map<number, string>();
      for (const r of en) if (r.nameEn) enById.set(r.id, r.nameEn);
      const merged = ar.map((r) => ({ ...r, nameEn: enById.get(r.id) ?? null }));
      await this.cache.write(CACHE.CATALOG, key, JSON.stringify(merged));
      return merged;
    });
  }

  /** English/transliterated reciter names, keyed by the Arabic name. */
  async englishReciterNames(): Promise<Map<string, string>> {
    const en = await this.rawReciters("en");
    const map = new Map<string, string>();
    for (const r of en) if (r.nameEn) map.set(r.name, r.nameEn);
    return map;
  }

  private async rawReciters(language: string): Promise<Reciter[]> {
    const key = `reciters_raw_${language}`;
    return this.cache.singleFlight(key, async () => {
      // 1. Try Live Network First (GitHub Raw canonical data)
      try {
        const list = await this.api.reciters(language);
        if (list && list.length > 0) {
          await this.cache.write(CACHE.CATALOG, key, JSON.stringify({ reciters: list }));
          return list.map((d) =>
            language === "en"
              ? { ...reciterDtoToDomain(d), nameEn: d.name }
              : reciterDtoToDomain(d),
          );
        }
      } catch {
        // Fallback to cache below
      }

      // 2. Fallback to Disk Cache if offline
      const cached = await this.cache.read(CACHE.CATALOG, key, CACHE_TTL_24H);
      if (cached !== null) {
        const dtos = (JSON.parse(cached) as { reciters: ReciterDto[] }).reciters;
        return dtos.map((d) =>
          language === "en"
            ? { ...reciterDtoToDomain(d), nameEn: d.name }
            : reciterDtoToDomain(d),
        );
      }
      return [];
    });
  }

  /** Recently added reads row on Home (optional). */
  async recentReads(): Promise<Reciter[]> {
    try {
      const list = await this.api.recentReads();
      if (list && list.length > 0) {
        await this.cache.write(CACHE.CATALOG, "recent_reads", JSON.stringify({ reads: list }));
        return list.map((d) => reciterDtoToDomain(d));
      }
    } catch {
      // Fallback to cache below
    }

    const cached = await this.cache.read(CACHE.CATALOG, "recent_reads", CACHE_TTL_24H);
    if (cached !== null) {
      const dtos = (JSON.parse(cached) as { reads: ReciterDto[] }).reads;
      return dtos.map((d) => reciterDtoToDomain(d));
    }
    return [];
  }
}
