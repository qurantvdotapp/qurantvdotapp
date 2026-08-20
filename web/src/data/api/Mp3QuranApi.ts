// Ported 1:1 from app/src/main/java/com/qurantv/app/data/api/Mp3QuranApi.kt
// mp3quran.net API v3 client (endpoints verified live). Always https.

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

export class Mp3QuranApi {
  private readonly base = "https://mp3quran.net/api/v3";

  constructor(private readonly client: ApiClient) {}

  async suwar(language: string): Promise<SurahDto[]> {
    const res = JSON.parse(await this.client.getText(`${this.base}/suwar?language=${language}`)) as SuwarResponse;
    return res.suwar;
  }

  async reciters(language: string): Promise<ReciterDto[]> {
    const res = JSON.parse(await this.client.getText(`${this.base}/reciters?language=${language}`)) as RecitersResponse;
    return res.reciters;
  }

  async recentReads(): Promise<ReciterDto[]> {
    const res = JSON.parse(await this.client.getText(`${this.base}/recent_reads`)) as RecentReadsResponse;
    return res.reads;
  }

  async timingReads(): Promise<TimingReadDto[]> {
    return JSON.parse(await this.client.getText(`${this.base}/ayat_timing/reads`)) as TimingReadDto[];
  }

  async soar(readId: number): Promise<SoarDto[]> {
    return JSON.parse(await this.client.getText(`${this.base}/ayat_timing/soar?read=${readId}`)) as SoarDto[];
  }

  async ayahTiming(surah: number, readId: number): Promise<AyahTimingDto[]> {
    return JSON.parse(
      await this.client.getText(`${this.base}/ayat_timing?surah=${surah}&read=${readId}`),
    ) as AyahTimingDto[];
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
  };
}

export function ayahTimingToDomain(dtos: AyahTimingDto[], readId: number, surahId: number): SurahTiming {
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
