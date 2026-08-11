// Ported 1:1 from app/src/main/java/com/qurantv/app/data/repo/KsuHilitesRepository.kt
// Exact per-ayah page positions from quran.ksu.edu.sa (the Ayat reference app).
// `interface.php?ui=pc&do=hilites&mosshaf=<m>&t=28&page=<p>` →
// `{"<p>": {"<sura>_<aya>": [x, y], ...}}` — immutable, cached forever.

import type { KsuAyahEnd } from "../../domain/KsuHiliteGeometry";
import { CACHE, JsonDiskCache } from "../cache/JsonDiskCache";

const MAX_PAGES = 12;

export class KsuHilitesRepository {
  private readonly memory = new Map<string, KsuAyahEnd[]>();

  constructor(
    private readonly cache: JsonDiskCache,
    private readonly fetchText: (url: string) => Promise<string>,
  ) {}

  /** Page ayah end-positions in document order; null on failure. */
  async positionsFor(mushaf: string, page: number): Promise<KsuAyahEnd[] | null> {
    const key = `${mushaf}_${page}`;
    const mem = this.memory.get(key);
    if (mem) return mem;
    return this.cache.singleFlight(key, async () => {
      const cached = await this.cache.read(CACHE.KSU_HILITES, key);
      if (cached !== null) {
        const parsed = parseHilites(cached);
        if (parsed) this.memoize(key, parsed);
        return parsed;
      }
      try {
        const url = `https://quran.ksu.edu.sa/interface.php?ui=pc&do=hilites&mosshaf=${mushaf}&t=28&page=${page}`;
        const raw = await this.fetchText(url);
        const parsed = parseHilites(raw);
        if (parsed) {
          await this.cache.write(CACHE.KSU_HILITES, key, raw);
          this.memoize(key, parsed);
        }
        return parsed;
      } catch {
        return null;
      }
    });
  }

  private memoize(key: string, positions: KsuAyahEnd[]): void {
    this.memory.set(key, positions);
    if (this.memory.size > MAX_PAGES) {
      const first = this.memory.keys().next().value;
      if (first !== undefined) this.memory.delete(first);
    }
  }
}

export function parseHilites(raw: string): KsuAyahEnd[] | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const pageObj = Object.values(obj)[0];
  if (typeof pageObj !== "object" || pageObj === null) return null;
  const ordered: KsuAyahEnd[] = [];
  for (const [key, value] of Object.entries(pageObj)) {
    const parts = key.split("_");
    if (parts.length !== 2) continue;
    const surah = Number.parseInt(parts[0], 10);
    const ayah = Number.parseInt(parts[1], 10);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah)) continue;
    if (!Array.isArray(value) || value.length < 2) continue;
    const x = Number.parseInt(String(value[0]), 10);
    const y = Number.parseInt(String(value[1]), 10);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    ordered.push({ surah, ayah, x, y });
  }
  return ordered.length > 0 ? ordered : null;
}
