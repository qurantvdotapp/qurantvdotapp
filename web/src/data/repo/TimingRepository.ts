// Ported 1:1 from app/src/main/java/com/qurantv/app/data/repo/TimingRepository.kt
// Per-ayah timing data: reads list cached forever, per-(read, surah) timing
// cached forever, reads matched to reciter moshafs by folder_url ↔ server
// (normalized trailing slashes) — timing read ids are NOT reciter ids.

import { normalizeServerUrl } from "../../domain/CatalogParsing";
import { isReliable } from "../../domain/TimingAccuracy";
import type { SurahTiming, TimingRead } from "../../domain/Models";
import { Mp3QuranApi, ayahTimingToDomain, timingReadDtoToDomain } from "../api/Mp3QuranApi";
import type { AyahTimingDto, SoarDto, TimingReadDto } from "../api/Dtos";
import { CACHE, JsonDiskCache } from "../cache/JsonDiskCache";

const MAX_PROBE_BYTES = 10 * 1024 * 1024;

export class TimingRepository {
  constructor(
    private readonly api: Mp3QuranApi,
    private readonly cache: JsonDiskCache,
  ) {}

  async reads(): Promise<TimingRead[]> {
    const key = "reads";
    return this.cache.singleFlight(key, async () => {
      const cached = await this.cache.read(CACHE.TIMING, key);
      if (cached !== null) {
        return (JSON.parse(cached) as TimingReadDto[]).map(timingReadDtoToDomain);
      }
      // Store the DTOs (snake_case), exactly like the Kotlin disk cache —
      // reading back must see folder_url, not the domain folderUrl.
      const dtos = await this.api.timingReads();
      await this.cache.write(CACHE.TIMING, key, JSON.stringify(dtos));
      return dtos.map(timingReadDtoToDomain);
    });
  }

  /** The read whose folder matches this moshaf server, or null when untimed. */
  async readForMoshaf(server: string): Promise<TimingRead | null> {
    const target = normalizeServerUrl(server);
    const all = await this.reads();
    return all.find((r) => normalizeServerUrl(r.folderUrl) === target) ?? null;
  }

  /** Normalized folder URLs of every read that has ayah timing. */
  async timedServerUrls(): Promise<Set<string>> {
    const all = await this.reads();
    return new Set(all.map((r) => normalizeServerUrl(r.folderUrl)));
  }

  /**
   * The surah ids that have per-ayah timing files for this read (the
   * ayat_timing/soar list — some reads cover fewer than all 114 surahs).
   * Cached forever. Returns null on failure so callers can fall back to the
   * full list (graceful degradation).
   */
  async surahsWithTiming(readId: number): Promise<Set<number> | null> {
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
        return null; // unknown — callers keep the full surah list
      }
    });
  }

  /**
   * Whether the (read, surah) timing is ACTUALLY usable — the soar list can
   * over-claim. Verdict: the timing exists AND (when the mp3 is small enough to
   * probe) the mp3 duration matches the timing total within the accuracy gate.
   * Cached forever. Returns null when unknown (mp3 too large / probe failed).
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

  /**
   * Probes an mp3's duration via a metadata-only <audio> load. Files larger than
   * MAX_PROBE_BYTES are skipped (VBR mp3s without a Xing header require a full
   * scan — too costly to check eagerly).
   */
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
  async timingFor(readId: number, surahId: number): Promise<SurahTiming | null> {
    const key = `s${surahId}_r${readId}`;
    return this.cache.singleFlight(key, async () => {
      const cached = await this.cache.read(CACHE.TIMING, key);
      if (cached !== null) {
        return ayahTimingToDomain(JSON.parse(cached) as AyahTimingDto[], readId, surahId);
      }
      try {
        const list = await this.api.ayahTiming(surahId, readId);
        await this.cache.write(CACHE.TIMING, key, JSON.stringify(list));
        return ayahTimingToDomain(list, readId, surahId);
      } catch {
        return null; // no timing for this pair — play without ayah sync
      }
    });
  }

  /** Warm the cache for the next surah while the current one plays. */
  prefetch(readId: number, surahId: number): void {
    void this.timingFor(readId, surahId);
  }
}
