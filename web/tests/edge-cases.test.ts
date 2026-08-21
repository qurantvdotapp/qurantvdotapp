// Edge case exploration suite for mp3qurantv
import { describe, expect, it } from "vitest";
import { normalizeArabic, reciterMatchesQuery } from "../src/domain/search";
import { parseSurahList, parsePolygon, normalizeServerUrl, audioUrlFor } from "../src/domain/CatalogParsing";
import { ayahAt, repeatAyahTarget } from "../src/domain/TimingIndex";
import { isReliable, TOLERANCE, SILENCE_ALLOWANCE_MS } from "../src/domain/TimingAccuracy";
import { parseViewBox, toScreen } from "../src/domain/PageMapping";
import { suggestOffset, verseKeyFor } from "../src/domain/BasmalaOffset";
import { estimateBands } from "../src/domain/PageAyahEstimator";
import { SurahTiming, type Reciter, type Moshaf } from "../src/domain/Models";
import { SessionRepository, DEFAULT_SETTINGS } from "../src/data/repo/SessionRepository";

describe("Edge Case Probing: Search & Arabic Normalization", () => {
  const sampleReciter: Reciter = {
    id: 1,
    name: "محمود خليل الحصري",
    nameEn: "Mahmoud Khalil Al-Hussary",
    letter: "م",
    moshafs: [],
  };

  it("matches standard Arabic names and English transliteration", () => {
    expect(reciterMatchesQuery(sampleReciter, "محمود")).toBe(true);
    expect(reciterMatchesQuery(sampleReciter, "الحصري")).toBe(true);
    expect(reciterMatchesQuery(sampleReciter, "mahmoud")).toBe(true);
    expect(reciterMatchesQuery(sampleReciter, "Hussary")).toBe(true);
  });

  it("handles whitespace and casing gracefully", () => {
    expect(reciterMatchesQuery(sampleReciter, "   ")).toBe(true);
    expect(reciterMatchesQuery(sampleReciter, "  MAHMOUD  ")).toBe(true);
  });

  it("strips diacritics / tashkeel in query and database name", () => {
    const withFatha = "مَحْمُود";
    expect(normalizeArabic(withFatha)).toBe("محمود");
    expect(reciterMatchesQuery(sampleReciter, withFatha)).toBe(true);
    const withMultipleHarakat = "مَحْمُودُ خَلِيلُ الحُصَرِيّ";
    expect(reciterMatchesQuery(sampleReciter, withMultipleHarakat)).toBe(true);
  });

  it("strips tatweel / kashida in query and database name", () => {
    const withTatweel = "محـمود";
    expect(normalizeArabic(withTatweel)).toBe("محمود");
    expect(reciterMatchesQuery(sampleReciter, withTatweel)).toBe(true);
  });
});

describe("Edge Case Probing: CatalogParsing", () => {
  it("handles malformed surah_list strings", () => {
    expect(parseSurahList(null)).toEqual([]);
    expect(parseSurahList(undefined)).toEqual([]);
    expect(parseSurahList("")).toEqual([]);
    expect(parseSurahList("   ")).toEqual([]);
    expect(parseSurahList("1,2,3,")).toEqual([1, 2, 3]);
    expect(parseSurahList(",,, 1 , 2 , , 3 ,,,")).toEqual([1, 2, 3]);
    expect(parseSurahList("1, foo, 2, bar, 3")).toEqual([1, 2, 3]);
  });

  it("filters out-of-range surah IDs to 1..114", () => {
    const parsed = parseSurahList("-1, 0, 1, 114, 115, 999");
    expect(parsed).toEqual([1, 114]);
  });

  it("handles malformed polygons defensively", () => {
    expect(parsePolygon(null)).toBeNull();
    expect(parsePolygon("")).toBeNull();
    expect(parsePolygon("1,2 3,4")).toBeNull(); // fewer than 3 points
    expect(parsePolygon("1,2 3,4 foo,bar")).toBeNull();
    expect(parsePolygon("1,2 3,4 5,6")).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ]);
  });

  it("handles server URL variations", () => {
    expect(normalizeServerUrl("https://server.com/audio/")).toBe("https://server.com/audio/");
    expect(normalizeServerUrl("https://server.com/audio")).toBe("https://server.com/audio/");
    expect(normalizeServerUrl("  https://server.com/audio  ")).toBe("https://server.com/audio/");
    expect(normalizeServerUrl("")).toBe("");
  });

  it("generates 3-digit padded surah mp3 audio URLs", () => {
    expect(audioUrlFor("https://server.com/audio/", 1)).toBe("https://server.com/audio/001.mp3");
    expect(audioUrlFor("https://server.com/audio", 114)).toBe("https://server.com/audio/114.mp3");
    expect(audioUrlFor("https://server.com/audio", 0)).toBe("https://server.com/audio/000.mp3");
  });
});

describe("Edge Case Probing: TimingIndex & Binary Search", () => {
  const timing = new SurahTiming(5, 1, [
    { ayah: 0, startMs: 0, endMs: 4000, polygon: null, x: null, y: null, pageUrl: null },
    { ayah: 1, startMs: 4000, endMs: 9000, polygon: null, x: null, y: null, pageUrl: null },
    { ayah: 2, startMs: 9000, endMs: 15000, polygon: null, x: null, y: null, pageUrl: null },
  ]);

  it("locates ayahs accurately at exact boundaries", () => {
    expect(ayahAt(timing, -100)).toBe(0); // before start -> 0 (header/basmala)
    expect(ayahAt(timing, 0)).toBe(0);
    expect(ayahAt(timing, 3999)).toBe(0);
    expect(ayahAt(timing, 4000)).toBe(1);
    expect(ayahAt(timing, 8999)).toBe(1);
    expect(ayahAt(timing, 9000)).toBe(2);
    expect(ayahAt(timing, 20000)).toBe(2); // clamped to last ayah
  });

  it("handles empty timing entries", () => {
    const emptyTiming = new SurahTiming(5, 1, []);
    expect(ayahAt(emptyTiming, 1000)).toBe(-1);
  });

  it("handles repeatAyahTarget at boundaries and seeks", () => {
    // Advancing from 1 to 2 at 9000ms:
    expect(repeatAyahTarget(timing, 1, 2, 9000, 9000)).toBe(4000);
    // Not crossed yet:
    expect(repeatAyahTarget(timing, 1, 1, 8000, 9000)).toBeNull();
    // Manual forward seek skipping ayah (idx = 3):
    expect(repeatAyahTarget(timing, 0, 2, 9000, 9000)).toBeNull();
  });
});

describe("Edge Case Probing: PageMapping & ViewBox", () => {
  it("parses varied viewBox attribute formats", () => {
    expect(parseViewBox('<svg viewBox="0 0 235 235">')).toEqual({ x: 0, y: 0, w: 235, h: 235 });
    expect(parseViewBox("<svg viewBox='10, 20, 300, 400'>")).toEqual({ x: 10, y: 20, w: 300, h: 400 });
    expect(parseViewBox('<svg VIEWBOX="0 0 500.5 700.25">')).toEqual({ x: 0, y: 0, w: 500.5, h: 700.25 });
    expect(parseViewBox("<svg>")).toBeNull();
    expect(parseViewBox('<svg viewBox="invalid">')).toBeNull();
  });

  it("transforms coordinates defensively with zero or negative dimensions", () => {
    const poly = [{ x: 10, y: 10 }];
    const vb = { x: 0, y: 0, w: 100, h: 100 };
    expect(toScreen(poly, vb, 0, 100)).toEqual([]);
    expect(toScreen(poly, vb, 100, -10)).toEqual([]);
    expect(toScreen(poly, { x: 0, y: 0, w: 0, h: 100 }, 100, 100)).toEqual([]);
  });
});

describe("Edge Case Probing: TimingAccuracy", () => {
  it("rejects non-positive durations", () => {
    expect(isReliable(0, 1000)).toBe(false);
    expect(isReliable(1000, 0)).toBe(false);
    expect(isReliable(-500, 1000)).toBe(false);
  });

  it("handles asymmetric trailing silence and over-claims", () => {
    // 30s timing with 35s mp3 (5s trailing silence <= 8s allowance) -> reliable
    expect(isReliable(35_000, 30_000)).toBe(true);
    // 30s timing with 45s mp3 (15s trailing silence > 8s allowance) -> unreliable
    expect(isReliable(45_000, 30_000)).toBe(false);
    // 30s timing with 29.5s mp3 (overclaim by 0.5s <= 2% tolerance of 0.6s) -> reliable
    expect(isReliable(29_500, 30_000)).toBe(true);
    // 30s timing with 28s mp3 (overclaim by 2s > 2% tolerance) -> unreliable
    expect(isReliable(28_000, 30_000)).toBe(false);
  });
});

describe("Edge Case Probing: SessionRepository & LocalStorage Fault Tolerance", () => {
  it("PROBE: corrupt or unexpected localStorage values", () => {
    const mockStorage = new Map<string, string>();
    const storageObj = {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, val: string) => mockStorage.set(key, val),
    };
    // Emulate localStorage in test environment
    const origLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { value: storageObj, configurable: true });

    try {
      const repo = new SessionRepository();
      // Empty storage returns default settings
      expect(repo.settings()).toEqual(DEFAULT_SETTINGS);

      // Corrupted JSON returns default settings without throwing
      mockStorage.set("qurantv_settings", "{ malformed json ... ");
      expect(repo.settings()).toEqual(DEFAULT_SETTINGS);

      // Partial / out-of-bounds settings object gets sanitized and clamped to defaults
      mockStorage.set("qurantv_settings", JSON.stringify({ defaultSpeed: -5, language: "fr", mushafStyle: 99 }));
      const s = repo.settings();
      expect(s.defaultSpeed).toBe(DEFAULT_SETTINGS.defaultSpeed);
      expect(s.language).toBe("ar");
      expect(s.mushafStyle).toBe(DEFAULT_SETTINGS.mushafStyle);

      // Valid custom settings persist cleanly
      mockStorage.set("qurantv_settings", JSON.stringify({ defaultSpeed: 1.5, language: "en", mushafStyle: 2 }));
      const s2 = repo.settings();
      expect(s2.defaultSpeed).toBe(1.5);
      expect(s2.language).toBe("en");
      expect(s2.mushafStyle).toBe(2);
      // Corrupted session
      mockStorage.set("qurantv_last_session", "INVALID");
      expect(repo.lastSession()).toBeNull();

      // Corrupted favourites
      mockStorage.set("qurantv_favourites", JSON.stringify(["not_a_number", null, 42]));
      expect(repo.favouriteReciterIds()).toEqual(new Set([42]));
    } finally {
      Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, configurable: true });
    }
  });
});
