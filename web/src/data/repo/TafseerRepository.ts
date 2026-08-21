// KSU Ayat tafseer data — per-surah JSON generated from the bundled .ayt
// SQLite DBs by scripts/convert-tafseer.py (public/tafseer/surah_<n>.json).
// Mirrors the Android TafseerRepository (6236 rows per mode; 2576 word-meaning
// rows are empty and hidden by the UI).

import { loadAssetText } from "../assetLoader";

export type TafseerMode = "tafseer" | "meanings" | "translation";

export interface AyahContext {
  tafseer: string;
  meanings: string;
  translation: string;
}

export class TafseerRepository {
  private cache = new Map<number, Map<number, AyahContext>>();
  private pending = new Map<number, Promise<Map<number, AyahContext>>>();

  /** All ayahs of a surah (1..n) with their tafseer/meanings/translation. */
  async surahContent(surahId: number): Promise<Map<number, AyahContext>> {
    const cached = this.cache.get(surahId);
    if (cached) return cached;
    const inflight = this.pending.get(surahId);
    if (inflight) return inflight;
    const p = (async () => {
      // XHR not fetch: file:// in the Android TV webview blocks fetch().
      const text = await loadAssetText(`tafseer/surah_${surahId}.json`);
      const raw = JSON.parse(text) as Record<string, { tafseer?: string; meanings?: string; translation?: string }>;
      const map = new Map<number, AyahContext>();
      for (const [ayah, v] of Object.entries(raw)) {
        map.set(Number.parseInt(ayah, 10), {
          tafseer: v.tafseer ?? "",
          meanings: v.meanings ?? "",
          translation: v.translation ?? "",
        });
      }
      this.cache.set(surahId, map);
      return map;
    })().finally(() => this.pending.delete(surahId));
    this.pending.set(surahId, p);
    return p;
  }

  /** Text for one mode; "" when the row is empty (hidden by the UI). */
  static textFor(ctx: AyahContext, mode: TafseerMode): string {
    switch (mode) {
      case "tafseer":
        return ctx.tafseer;
      case "meanings":
        return ctx.meanings;
      case "translation":
        return ctx.translation;
    }
  }

  /** Convert <br> markers (meanings DB) to newlines for rendering. */
  static renderText(text: string): string {
    return text.replace(/<br\s*\/?>/gi, "\n").trim();
  }
}
