// Ported 1:1 from app/src/main/java/com/qurantv/app/data/api/Dtos.kt
// mp3quran.net/api/v3 DTO shapes (verified live) + Quran.com API v4.

export interface SuwarResponse {
  suwar: SurahDto[];
}

export interface SurahDto {
  id: number;
  name: string;
  start_page?: number;
  end_page?: number;
  makkia?: number | null;
  type?: number | null;
}

export interface RecitersResponse {
  reciters: ReciterDto[];
}

export interface RecentReadsResponse {
  reads: ReciterDto[];
}

export interface ReciterDto {
  id: number;
  name: string;
  letter?: string | null;
  date?: string | null;
  moshaf?: MoshafDto[];
}

export interface MoshafDto {
  id: number;
  name: string;
  server: string;
  surah_total?: number | null;
  moshaf_type?: number | null;
  rewaya_id?: number | null;
  surah_list?: string | null;
}

export interface TimingReadDto {
  id: number;
  name: string;
  rewaya?: string | null;
  folder_url?: string;
  soar_count?: number | null;
  soar_link?: string | null;
  slug?: string | null;
}

export interface SoarDto {
  id: number;
  name: string;
  timing_link?: string | null;
}

export interface AyahTimingDto {
  ayah: number;
  polygon?: string | null;
  start_time?: number;
  end_time?: number;
  x?: string | null;
  y?: string | null;
  page?: string | null;
}

/* ---------------- Quran.com API v4 ---------------- */

export interface ChaptersResponse {
  chapters: ChapterDto[];
}

export interface ChapterDto {
  id: number;
  name_arabic: string;
  name_simple: string;
  verses_count: number;
}

export interface VersesResponse {
  verses: VerseDto[];
}

export interface VerseDto {
  id: number;
  verse_key: string;
  text_uthmani: string;
  chapter_id: number;
  verse_number: number;
}
