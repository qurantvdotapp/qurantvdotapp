// Ported from app/src/main/java/com/qurantv/app/data/repo/SessionRepository.kt
// localStorage-backed persistence for settings + "continue listening" session.
// (Android used DataStore; localStorage is the TV-webview equivalent. Position
// writes are throttled by the caller — at most every ~5 s, not per tick.)

import type { Moshaf, QuranSurah, Reciter } from "../../domain/Models";

export interface AppSettings {
  language: "ar" | "en"; // Arabic primary (RTL), English secondary
  defaultSpeed: number;
  fontSizeIndex: number; // 0 = small, 1 = normal, 2 = large
  highlightColorIndex: number; // 0 = gold, 1 = green, 2 = cyan
  displayMode: number; // 0 = text, 1 = mushaf page (default)
  mushafStyle: number; // page mode style; default 5 = Hafs Tajweed (حفص ملون)
  ayahOffset: number; // basmala offset for non-Hafs riwayat (best effort)
  autoHideControls: boolean;
  onlyTimedReciters: boolean;
}

export interface LastSession {
  reciterId: number;
  reciterName: string;
  moshafId: number;
  moshafName: string;
  surahId: number;
  surahNameAr: string;
  ayahIndex: number;
  positionMs: number;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "ar",
  defaultSpeed: 1,
  fontSizeIndex: 1,
  highlightColorIndex: 0,
  displayMode: 1,
  mushafStyle: 5,
  ayahOffset: 0,
  autoHideControls: true,
  onlyTimedReciters: false,
};

const SETTINGS_KEY = "qurantv_settings";
const SESSION_KEY = "qurantv_last_session";
const FAVOURITES_KEY = "qurantv_favourites";

export class SessionRepository {
  settings(): AppSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw === null) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  lastSession(): LastSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw === null) return null;
      return JSON.parse(raw) as LastSession;
    } catch {
      return null;
    }
  }

  private persistSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // quota — ignore
    }
  }

  setLanguage(language: "ar" | "en"): void {
    this.persistSettings({ ...this.settings(), language });
  }

  setDefaultSpeed(speed: number): void {
    this.persistSettings({ ...this.settings(), defaultSpeed: speed });
  }

  setFontSize(index: number): void {
    this.persistSettings({ ...this.settings(), fontSizeIndex: index });
  }

  setHighlightColor(index: number): void {
    this.persistSettings({ ...this.settings(), highlightColorIndex: index });
  }

  setDisplayMode(mode: number): void {
    this.persistSettings({ ...this.settings(), displayMode: mode });
  }

  setMushafStyle(style: number): void {
    this.persistSettings({ ...this.settings(), mushafStyle: style });
  }

  setAyahOffset(offset: number): void {
    this.persistSettings({ ...this.settings(), ayahOffset: offset });
  }

  setAutoHideControls(enabled: boolean): void {
    this.persistSettings({ ...this.settings(), autoHideControls: enabled });
  }

  setOnlyTimedReciters(enabled: boolean): void {
    this.persistSettings({ ...this.settings(), onlyTimedReciters: enabled });
  }

  favouriteReciterIds(): Set<number> {
    try {
      const raw = localStorage.getItem(FAVOURITES_KEY);
      const arr = raw ? (JSON.parse(raw) as number[]) : [];
      return new Set(arr.filter((n) => Number.isInteger(n)));
    } catch {
      return new Set();
    }
  }

  isFavourite(reciterId: number): boolean {
    return this.favouriteReciterIds().has(reciterId);
  }

  toggleFavourite(reciterId: number): boolean {
    const set = this.favouriteReciterIds();
    const added = !set.has(reciterId);
    if (added) set.add(reciterId);
    else set.delete(reciterId);
    try {
      localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...set]));
    } catch {
      /* ignore */
    }
    return added;
  }

  saveLastSession(
    reciter: Reciter,
    moshaf: Moshaf,
    surah: QuranSurah,
    ayahIndex: number,
    positionMs: number,
  ): void {
    const session: LastSession = {
      reciterId: reciter.id,
      reciterName: reciter.name,
      moshafId: moshaf.id,
      moshafName: moshaf.name,
      surahId: surah.id,
      surahNameAr: surah.nameAr,
      ayahIndex,
      positionMs,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // quota — ignore
    }
  }
}
