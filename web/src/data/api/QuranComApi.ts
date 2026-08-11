// Ported 1:1 from app/src/main/java/com/qurantv/app/data/api/QuranComApi.kt
// Quran.com API v4 (same Tanzil-sourced text; enrichment/fallback for D2).

import type { ApiClient } from "./ApiClient";
import type { ChapterDto, VerseDto } from "./Dtos";

export class QuranComApi {
  private readonly base = "https://api.quran.com/api/v4";

  constructor(private readonly client: ApiClient) {}

  async chapters(language: string): Promise<ChapterDto[]> {
    const res = await this.client.getText(`${this.base}/chapters?language=${language}`);
    return (JSON.parse(res) as { chapters: ChapterDto[] }).chapters;
  }

  async versesUthmani(chapter: number): Promise<VerseDto[]> {
    const res = await this.client.getText(`${this.base}/quran/verses/uthmani?chapter_number=${chapter}`);
    return (JSON.parse(res) as { verses: VerseDto[] }).verses;
  }
}
