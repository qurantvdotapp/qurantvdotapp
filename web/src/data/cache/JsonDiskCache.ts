// Ported from app/src/main/java/com/qurantv/app/data/cache/JsonDiskCache.kt
// localStorage-backed JSON cache:
//  - catalog responses: TTL 24 h
//  - timing data: immutable → cached forever, keyed per (read, surah)
//  - quran text (Quran.com): cached per surah forever
// singleFlight prevents duplicate network calls for the same key.
//
// localStorage quota is ~5-10 MB on TV webviews; timing + text data is small
// (per-surah timings are a few KB; 114 surahs ≈ ~1 MB), so this is fine.

const TTL_24H = 24 * 60 * 60 * 1000;

export class JsonDiskCache {
  private readonly root = "qurantv_json_cache";
  private readonly flights = new Map<string, Promise<unknown>>();

  /** Raw stored value, or null when missing/expired/unparseable. */
  async read(category: string, key: string, maxAgeMs: number | null = null): Promise<string | null> {
    try {
      const raw = localStorage.getItem(this.storageKey(category, key));
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as { v: string; t: number };
      if (maxAgeMs !== null && Date.now() - parsed.t > maxAgeMs) return null;
      return parsed.v;
    } catch {
      return null;
    }
  }

  async write(category: string, key: string, content: string): Promise<void> {
    try {
      localStorage.setItem(
        this.storageKey(category, key),
        JSON.stringify({ v: content, t: Date.now() }),
      );
    } catch {
      // quota exceeded — drop silently (cache is best-effort)
    }
  }

  /** Serializes concurrent loads of the same key (single-flight per key). */
  async singleFlight<T>(flightKey: string, block: () => Promise<T>): Promise<T> {
    const existing = this.flights.get(flightKey) as Promise<T> | undefined;
    if (existing) return existing;
    const p = block().finally(() => {
      this.flights.delete(flightKey);
    });
    this.flights.set(flightKey, p);
    return p;
  }

  private storageKey(category: string, key: string): string {
    return `${this.root}/${category}/${this.safeKey(key)}`;
  }

  private safeKey(key: string): string {
    const sanitized = key.replace(/[^A-Za-z0-9._-]/g, "_");
    return sanitized.slice(-120);
  }
}

export const CACHE_TTL_24H = TTL_24H;

export const CACHE = {
  CATALOG: "catalog",
  TIMING: "timing",
  QURAN_TEXT: "quran_text",
  KSU_HILITES: "ksu_hilites",
} as const;
