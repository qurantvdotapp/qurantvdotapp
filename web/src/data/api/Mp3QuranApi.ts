// Quran TV API client — GitHub Dataset & Archive.org Cloud CDN are the exclusive sources.
// Managed and published via Quran TV Admin Studio.

import type { ApiClient } from "./ApiClient";
import { parsePolygon, parseSurahList } from "../../domain/CatalogParsing";
import { SurahTiming, type Moshaf, type Reciter, type TimingRead, type AyahTiming } from "../../domain/Models";
import type {
  AyahTimingDto,
  MoshafDto,
  ReciterDto,
  SoarDto,
  SuwarResponse,
  RecitersResponse,
  RecentReadsResponse,
  SurahDto,
  TimingReadDto,
} from "./Dtos";

export interface TimingIndexRecord {
  read_id: number;
  surahs: number[];
  clean?: boolean;
}

export interface TimingIndex {
  version: number;
  generated_at?: string;
  servers: Record<string, TimingIndexRecord>;
}

export class Mp3QuranApi {
  // Tier 1: jsDelivr Edge CDN over GitHub (Cloudflare/Fastly global edge caching)
  private readonly jsdelivrCdnBase = "https://cdn.jsdelivr.net/gh/qurantvdotapp/qurantvdotapp@main/web/data-mirror";
  // Tier 2: GitHub Raw CDN (Live canonical data published by Admin)
  private readonly githubRawBase = "https://raw.githubusercontent.com/qurantvdotapp/qurantvdotapp/main/web/data-mirror";
  // Tier 3: Archive.org Dataset CDN
  private readonly archiveOrgBase = "https://archive.org/download/qurantv-dataset";
  // Tier 4: Local Bundled Mirror / PWA Cache
  private readonly localMirrorBase = "/data-mirror";

  constructor(private readonly client: ApiClient) {}

  /** Attempts to fetch with automatic failover through the CDN tier hierarchy. */
  private async fetchWithFallback<T>(
    mirrorPath: string,
    unwrap?: (raw: string) => T,
  ): Promise<T> {
    const parse = unwrap ?? ((t: string) => JSON.parse(t) as T);

    const endpoints = [
      `${this.jsdelivrCdnBase}${mirrorPath}`,
      `${this.githubRawBase}${mirrorPath}`,
      `${this.archiveOrgBase}${mirrorPath}`,
      `${this.localMirrorBase}${mirrorPath}`,
    ];

    let lastError: Error | null = null;
    for (const url of endpoints) {
      try {
        const text = await this.client.getText(url);
        return parse(text);
      } catch (err) {
        lastError = err as Error;
      }
    }

    throw lastError || new Error(`Failed to load ${mirrorPath} from all CDNs`);
  }

  async timingIndex(): Promise<TimingIndex | null> {
    try {
      return await this.fetchWithFallback<TimingIndex>("/timing_index.json");
    } catch {
      return null;
    }
  }

  async suwar(language: string): Promise<SurahDto[]> {
    return this.fetchWithFallback<SurahDto[]>(
      `/catalog/suwar_${language === "en" ? "en" : "ar"}.json`,
      (t) => (JSON.parse(t) as SuwarResponse).suwar,
    );
  }

  async reciters(language: string): Promise<ReciterDto[]> {
    return this.fetchWithFallback<ReciterDto[]>(
      `/catalog/reciters_${language === "en" ? "en" : "ar"}.json`,
      (t) => (JSON.parse(t) as RecitersResponse).reciters,
    );
  }

  async recentReads(): Promise<ReciterDto[]> {
    return this.fetchWithFallback<ReciterDto[]>(
      "/catalog/recent_reads.json",
      (t) => (JSON.parse(t) as RecentReadsResponse).reads,
    );
  }

  async timingReads(): Promise<TimingReadDto[]> {
    return this.fetchWithFallback<TimingReadDto[]>(
      "/timing/reads.json",
    );
  }

  async soar(readId: number): Promise<SoarDto[]> {
    return this.fetchWithFallback<SoarDto[]>(
      `/timing/soar/${readId}.json`,
    );
  }

  async ayahTiming(
    surah: number,
    readId: number,
    slug?: string,
    reciterId?: number,
    moshafId?: number,
  ): Promise<AyahTimingDto[] | number[]> {
    const candidates: string[] = [];

    // 1. Structured slug directory (primary format)
    if (slug) {
      candidates.push(`/timing_clean/${slug}/${surah}.json`);
      candidates.push(`/timing/${slug}/${surah}.json`);
    }
    
    // 2. Direct slug / readId lookups
    candidates.push(`/timing_clean/${readId}/${surah}.json`);
    if (reciterId && moshafId && moshafId !== reciterId) {
      candidates.push(`/timing_clean/${reciterId}_${moshafId}/${surah}.json`);
    }

    let lastError: Error | null = null;
    for (const path of candidates) {
      try {
        return await this.fetchWithFallback<AyahTimingDto[] | number[]>(path);
      } catch (err) {
        lastError = err as Error;
      }
    }

    throw lastError || new Error(`Failed to load timing for read ${readId}, surah ${surah}`);
  }

  async hilites(mushaf: string, page: number): Promise<string> {
    return this.fetchWithFallback<string>(
      `/hilites/${mushaf}/${page}.json`,
      (raw) => raw,
    );
  }
}

/* ---------------- DTO → domain mapping (defensive) ---------------- */

export function reciterDtoToDomain(dto: ReciterDto): Reciter {
  return {
    id: dto.id,
    name: dto.name,
    nameEn: null, // English names merged separately (CatalogRepository)
    letter: dto.letter ?? null,
    moshafs: (dto.moshaf ?? []).map(moshafDtoToDomain),
  };
}

export function moshafDtoToDomain(dto: MoshafDto): Moshaf {
  return {
    id: dto.id,
    name: dto.name,
    server: dto.server,
    surahTotal: dto.surah_total ?? null,
    moshafType: dto.moshaf_type ?? null,
    rewayaId: dto.rewaya_id ?? null,
    surahList: parseSurahList(dto.surah_list ?? null),
  };
}

export function timingReadDtoToDomain(dto: TimingReadDto): TimingRead {
  return {
    id: dto.id,
    name: dto.name,
    rewaya: dto.rewaya ?? null,
    folderUrl: dto.folder_url ?? "",
    slug: dto.slug ?? null,
  };
}

export function ayahTimingToDomain(
  raw: (AyahTimingDto | number)[],
  readId: number,
  surahId: number,
): SurahTiming {
  if (!raw || raw.length === 0) {
    return new SurahTiming(readId, surahId, []);
  }

  // Check if flat number array: [ayah, start_ms, end_ms, ...] (3-tuples) or [start_ms, end_ms, ...] (2-tuples)
  if (typeof raw[0] === "number") {
    const numbers = raw as number[];
    const entries: AyahTiming[] = [];
    
    // If length is a multiple of 3 (ayah, start, end)
    if (numbers.length % 3 === 0) {
      for (let i = 0; i < numbers.length; i += 3) {
        const ayah = numbers[i] ?? 0;
        const startMs = numbers[i + 1] ?? 0;
        const endMs = numbers[i + 2] ?? startMs;
        entries.push({
          ayah,
          startMs,
          endMs,
          polygon: null,
          x: null,
          y: null,
          pageUrl: null,
        });
      }
    } else {
      // 2-tuple fallback: [start0, end0, start1, end1, ...]
      let ayah = 1;
      for (let i = 0; i < numbers.length; i += 2) {
        const startMs = numbers[i] ?? 0;
        const endMs = numbers[i + 1] ?? startMs;
        entries.push({
          ayah,
          startMs,
          endMs,
          polygon: null,
          x: null,
          y: null,
          pageUrl: null,
        });
        ayah++;
      }
    }
    return new SurahTiming(readId, surahId, entries);
  }

  const dtos = raw as AyahTimingDto[];
  const entries: AyahTiming[] = dtos
    .map((dto) => {
      const startMs = Math.max(0, dto.start_time ?? 0);
      return {
        ayah: dto.ayah,
        startMs,
        endMs: Math.max(startMs, dto.end_time ?? startMs),
        polygon: parsePolygon(dto.polygon ?? null),
        x: dto.x ? Number.parseFloat(dto.x.trim()) || null : null,
        y: dto.y ? Number.parseFloat(dto.y.trim()) || null : null,
        pageUrl: dto.page ?? null,
      };
    })
    .sort((a, b) => a.ayah - b.ayah);
  return new SurahTiming(readId, surahId, entries);
}
