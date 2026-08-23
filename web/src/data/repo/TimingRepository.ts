import { normalizeServerUrl } from "../../domain/CatalogParsing";
import { isReliable } from "../../domain/TimingAccuracy";
import type { SurahTiming, TimingRead } from "../../domain/Models";
import {
  Mp3QuranApi,
  ayahTimingToDomain,
  timingReadDtoToDomain,
  type TimingIndex,
} from "../api/Mp3QuranApi";
import type { AyahTimingDto, SoarDto, TimingReadDto } from "../api/Dtos";
import { CACHE, JsonDiskCache } from "../cache/JsonDiskCache";

const MAX_PROBE_BYTES = 10 * 1024 * 1024;

export class TimingRepository {
  private timingIndexCache: TimingIndex | null = null;

  constructor(
    private readonly api: Mp3QuranApi,
    private readonly cache: JsonDiskCache,
  ) {}

  /** Load fast O(1) timing index from CDN/mirror if available. */
  async getTimingIndex(): Promise<TimingIndex | null> {
    if (this.timingIndexCache !== null) return this.timingIndexCache;
    const key = "timing_index_fast";
    return this.cache.singleFlight(key, async () => {
      const cached = await this.cache.read(CACHE.TIMING, key);
      if (cached !== null) {
        this.timingIndexCache = JSON.parse(cached) as TimingIndex;
        return this.timingIndexCache;
      }
      const idx = await this.api.timingIndex();
      if (idx) {
        await this.cache.write(CACHE.TIMING, key, JSON.stringify(idx));
        this.timingIndexCache = idx;
      }
      return idx;
    });
  }

  async reads(): Promise<TimingRead[]> {
    const key = "reads";
    return this.cache.singleFlight(key, async () => {
      const cached = await this.cache.read(CACHE.TIMING, key);
      if (cached !== null) {
        return (JSON.parse(cached) as TimingReadDto[]).map(timingReadDtoToDomain);
      }
      const dtos = await this.api.timingReads();
      await this.cache.write(CACHE.TIMING, key, JSON.stringify(dtos));
      return dtos.map(timingReadDtoToDomain);
    });
  }

  /** The read whose folder matches this moshaf server, or null when untimed. */
  async readForMoshaf(server: string): Promise<TimingRead | null> {
    const target = normalizeServerUrl(server);
    const all = await this.reads();
    const match = all.find((r) => normalizeServerUrl(r.folderUrl) === target);
    if (match) return match;

    // Fast path fallback: O(1) check index
    const idx = await this.getTimingIndex();
    if (idx && idx.servers[target]) {
      const record = idx.servers[target];
      return {
        id: record.read_id,
        name: "",
        rewaya: null,
        folderUrl: target,
        slug: null,
      };
    }
    return null;
  }

  /** Normalized folder URLs of every read that has ayah timing. */
  async timedServerUrls(): Promise<Set<string>> {
    const idx = await this.getTimingIndex();
    if (idx) {
      return new Set(Object.keys(idx.servers).map(normalizeServerUrl));
    }
    const all = await this.reads();
    return new Set(all.map((r) => normalizeServerUrl(r.folderUrl)));
  }

  /**
   * The surah ids that have per-ayah timing files for this read (the
   * ayat_timing/soar list). Cached forever.
   */
  async surahsWithTiming(readId: number, serverUrl?: string): Promise<Set<number> | null> {
    // Fast path via index
    if (serverUrl) {
      const idx = await this.getTimingIndex();
      const target = normalizeServerUrl(serverUrl);
      if (idx && idx.servers[target] && idx.servers[target].surahs) {
        const s = idx.servers[target].surahs;
        if (s === "all" || s === "*") {
          return new Set(Array.from({ length: 114 }, (_, i) => i + 1));
        }
        if (Array.isArray(s)) {
          return new Set(s);
        }
      }
    }

    const key = `soar_r${readId}`;
    return this.cache.singleFlight(key, async () => {
      const cached = await this.cache.read(CACHE.TIMING, key);
      if (cached !== null) {
        return new Set((JSON.parse(cached) as SoarDto[]).map((s) => s.id));
      }
      try {
        const list = await this.api.soar(readId);
        await this.cache.write(CACHE.TIMING, key, JSON.stringify(list));
        return new Set(list.map((s) => s.id));
      } catch {
        return null;
      }
    });
  }

  /**
   * Whether the (read, surah) timing is ACTUALLY usable.
   */
  async timingUsability(readId: number, surahId: number, mp3Url: string): Promise<boolean | null> {
    const timing = await this.timingFor(readId, surahId);
    if (timing === null) return false;
    const verdictKey = `usable2_r${readId}_s${surahId}`;
    const cachedVerdict = await this.cache.read(CACHE.TIMING, verdictKey);
    if (cachedVerdict !== null) return cachedVerdict === "1";
    const usable = await this.probeMp3DurationMs(mp3Url).then((mp3Ms) =>
      mp3Ms !== null ? isReliable(mp3Ms, timing.lastEndMs) : null,
    );
    if (usable !== null) {
      await this.cache.write(CACHE.TIMING, verdictKey, usable ? "1" : "0");
    }
    return usable;
  }

  private async probeMp3DurationMs(url: string): Promise<number | null> {
    try {
      const size = await this.headContentLength(url);
      if (size !== null && size > MAX_PROBE_BYTES) return null;
      return await new Promise<number | null>((resolve) => {
        const audio = new Audio();
        audio.preload = "metadata";
        const timer = setTimeout(() => {
          audio.src = "";
          resolve(null);
        }, 15_000);
        audio.onloadedmetadata = () => {
          clearTimeout(timer);
          const ms = Math.round(audio.duration * 1000);
          audio.src = "";
          resolve(Number.isFinite(ms) ? ms : null);
        };
        audio.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        audio.src = url;
      });
    } catch {
      return null;
    }
  }

  private async headContentLength(url: string): Promise<number | null> {
    try {
      const res = await fetch(url, { method: "HEAD" });
      const cr = res.headers.get("Content-Range");
      if (cr) {
        const total = Number.parseInt(cr.substring(cr.lastIndexOf("/") + 1), 10);
        if (Number.isFinite(total)) return total;
      }
      const cl = res.headers.get("Content-Length");
      return cl ? Number.parseInt(cl, 10) : null;
    } catch {
      return null;
    }
  }

  /** Timing for (read, surah); null on any failure → graceful degradation. */
  async timingFor(
    readId: number,
    surahId: number,
    slug?: string,
    reciterId?: number,
    moshafId?: number,
  ): Promise<SurahTiming | null> {
    const key = `s${surahId}_r${readId}${slug ? `_${slug}` : ""}`;
    return this.cache.singleFlight(key, async () => {
      const cached = await this.cache.read(CACHE.TIMING, key);
      if (cached !== null) {
        return ayahTimingToDomain(JSON.parse(cached) as (AyahTimingDto | number)[], readId, surahId);
      }
      try {
        const list = await this.api.ayahTiming(surahId, readId, slug, reciterId, moshafId);
        await this.cache.write(CACHE.TIMING, key, JSON.stringify(list));
        return ayahTimingToDomain(list, readId, surahId);
      } catch {
        return null;
      }
    });
  }

  /** Warm the cache for the next surah while the current one plays. */
  prefetch(
    readId: number,
    surahId: number,
    slug?: string,
    reciterId?: number,
    moshafId?: number,
  ): void {
    void this.timingFor(readId, surahId, slug, reciterId, moshafId);
  }
}
