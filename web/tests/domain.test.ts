// Ported 1:1 from app/src/test/java/com/qurantv/app/domain/DomainTests.kt
// Core domain fixtures (KSU geometry / warsh / tajweed / islamic bands / page
// estimator are ported together with the page-mode phases they serve).

import { describe, expect, it } from "vitest";
import {
  parseSurahList,
  normalizeServerUrl,
  audioUrlFor,
  parsePolygon,
} from "../src/domain/CatalogParsing";
import { ayahAt } from "../src/domain/TimingIndex";
import { parseViewBox, toScreen, type ViewBox } from "../src/domain/PageMapping";
import { suggestOffset, verseKeyFor } from "../src/domain/BasmalaOffset";
import { isReliable } from "../src/domain/TimingAccuracy";
import { reciterMatchesQuery } from "../src/domain/search";
import { SurahTiming, type Reciter } from "../src/domain/Models";

describe("SurahListParsing", () => {
  it("parses plain comma list", () => {
    expect(parseSurahList("1,2,3,4")).toEqual([1, 2, 3, 4]);
  });

  it("tolerates trailing comma", () => {
    expect(parseSurahList("1,2,3,")).toEqual([1, 2, 3]);
  });

  it("tolerates empty segments and whitespace", () => {
    expect(parseSurahList("1,, 2 ,3,, ")).toEqual([1, 2, 3]);
  });

  it("returns empty for null or blank", () => {
    expect(parseSurahList(null)).toEqual([]);
    expect(parseSurahList("")).toEqual([]);
    expect(parseSurahList("   ")).toEqual([]);
  });

  it("drops non numeric tokens", () => {
    expect(parseSurahList("1,abc,,")).toEqual([1]);
  });
});

describe("AudioUrl", () => {
  it("adds trailing slash when missing", () => {
    expect(normalizeServerUrl("https://server6.mp3quran.net/akdr")).toBe("https://server6.mp3quran.net/akdr/");
  });

  it("keeps existing trailing slash", () => {
    expect(normalizeServerUrl("https://server6.mp3quran.net/akdr/")).toBe("https://server6.mp3quran.net/akdr/");
  });

  it("keeps subdirectory paths", () => {
    expect(normalizeServerUrl("https://server16.mp3quran.net/deban/Rewayat-Qalon-A-n-Nafi")).toBe(
      "https://server16.mp3quran.net/deban/Rewayat-Qalon-A-n-Nafi/",
    );
  });

  it("builds zero padded mp3 url", () => {
    expect(audioUrlFor("https://server6.mp3quran.net/akdr/", 1)).toBe("https://server6.mp3quran.net/akdr/001.mp3");
    expect(audioUrlFor("https://server6.mp3quran.net/akdr", 114)).toBe("https://server6.mp3quran.net/akdr/114.mp3");
    expect(audioUrlFor("https://server6.mp3quran.net/akdr", 37)).toBe("https://server6.mp3quran.net/akdr/037.mp3");
  });

  it("parses polygons with four corners", () => {
    const polygon = parsePolygon("181.08,18.31 57.54,18.31 57.54,48.94 181.08,48.94");
    expect(polygon?.length).toBe(4);
    expect(polygon?.[0].x).toBeCloseTo(181.08);
    expect(polygon?.[3].y).toBeCloseTo(48.94);
  });

  it("returns null for null or malformed polygons", () => {
    expect(parsePolygon(null)).toBeNull();
    expect(parsePolygon("")).toBeNull();
    expect(parsePolygon("abc")).toBeNull();
    expect(parsePolygon("1,2")).toBeNull();
  });
});

function timing(entries: Array<[number, number, number]>): SurahTiming {
  return new SurahTiming(
    5,
    1,
    entries.map(([ayah, start, end]) => ({
      ayah,
      startMs: start,
      endMs: end,
      polygon: null,
      x: null,
      y: null,
      pageUrl: null,
    })),
  );
}

describe("TimingIndex", () => {
  it("finds correct ayah in the middle", () => {
    const t = timing([
      [0, 0, 3000],
      [1, 3000, 6000],
      [2, 6000, 9000],
    ]);
    expect(ayahAt(t, 0)).toBe(0);
    expect(ayahAt(t, 2999)).toBe(0);
    expect(ayahAt(t, 3000)).toBe(1);
    expect(ayahAt(t, 5999)).toBe(1);
    expect(ayahAt(t, 6000)).toBe(2);
    expect(ayahAt(t, 8999)).toBe(2);
  });

  it("clamps to last ayah after the end", () => {
    const t = timing([
      [0, 0, 3000],
      [1, 3000, 6000],
    ]);
    expect(ayahAt(t, 60_000)).toBe(1);
  });

  it("before the first entry returns index zero", () => {
    const t = timing([
      [0, 1000, 3000],
      [1, 3000, 6000],
    ]);
    expect(ayahAt(t, 0)).toBe(0);
  });

  it("skips zero width intervals", () => {
    const t = timing([
      [0, 0, 3000],
      [1, 3000, 3000],
      [2, 3000, 9000],
    ]);
    expect(ayahAt(t, 5000)).toBe(2);
  });

  it("stays on the previous ayah during an inter ayah gap", () => {
    // Ayah 1 ends at 6000; ayah 2 starts at 7500 (1500 ms of silence).
    const t = timing([
      [0, 0, 3000],
      [1, 3000, 6000],
      [2, 7500, 10_000],
    ]);
    expect(ayahAt(t, 6500)).toBe(1);
    expect(ayahAt(t, 7499)).toBe(1);
    expect(ayahAt(t, 7500)).toBe(2);
  });

  it("returns timing index not list position when the basmala entry is absent", () => {
    const t = timing([
      [1, 3220, 11_400],
      [2, 11_400, 19_040],
      [3, 19_040, 29_700],
    ]);
    expect(ayahAt(t, 1000)).toBe(0); // virtual basmala slot
    expect(ayahAt(t, 3220)).toBe(1);
    expect(ayahAt(t, 11_400)).toBe(2);
    expect(ayahAt(t, 19_040)).toBe(3);
    expect(ayahAt(t, 500_000)).toBe(3);
  });

  it("empty timing returns -1", () => {
    expect(ayahAt(timing([]), 1000)).toBe(-1);
  });

  it("matches real surah 1 read 5 data", () => {
    // Verified live values (read=5, surah=1): index 1 spans 2731..5720 (verse 1:1),
    // index 7 is the last entry (verse 1:7, ends at 37463).
    const t = new SurahTiming(5, 1, [
      { ayah: 0, startMs: 0, endMs: 2731, polygon: null, x: null, y: null, pageUrl: null },
      { ayah: 1, startMs: 2731, endMs: 5720, polygon: null, x: 66.48, y: 34.46, pageUrl: "https://www.mp3quran.net/api/quran_pages_svg/001.svg" },
      { ayah: 2, startMs: 5720, endMs: 10592, polygon: null, x: 43.55, y: 63.2, pageUrl: null },
      { ayah: 3, startMs: 10592, endMs: 14142, polygon: null, x: null, y: null, pageUrl: null },
      { ayah: 4, startMs: 14142, endMs: 17323, polygon: null, x: null, y: null, pageUrl: null },
      { ayah: 5, startMs: 17323, endMs: 22468, polygon: null, x: null, y: null, pageUrl: null },
      { ayah: 6, startMs: 22468, endMs: 25999, polygon: null, x: null, y: null, pageUrl: null },
      { ayah: 7, startMs: 25999, endMs: 37463, polygon: null, x: null, y: null, pageUrl: null },
    ]);
    expect(ayahAt(t, 1000)).toBe(0);
    expect(ayahAt(t, 2731)).toBe(1);
    expect(ayahAt(t, 6000)).toBe(2);
    expect(ayahAt(t, 37463)).toBe(7);
    expect(ayahAt(t, 999_999)).toBe(7);
  });
});

describe("PageMapping", () => {
  it("maps 235 space to screen with verified rule", () => {
    const vb: ViewBox = { x: 0, y: 0, w: 235, h: 235 };
    const polygon = [
      { x: 57.54, y: 18.31 },
      { x: 181.08, y: 18.31 },
      { x: 181.08, y: 48.94 },
      { x: 57.54, y: 48.94 },
    ];
    const mapped = toScreen(polygon, vb, 940, 940);
    expect(mapped[0].x).toBeCloseTo((57.54 * 940) / 235, 2);
    expect(mapped[3].y).toBeCloseTo((48.94 * 940) / 235, 2);
  });

  it("parses viewBox from svg string", () => {
    const svg = '<?xml version="1.0"?><svg viewBox="0 0 235 235" xmlns="http://www.w3.org/2000/svg"/>';
    const vb = parseViewBox(svg);
    expect(vb?.w).toBe(235);
    expect(vb?.h).toBe(235);
  });

  it("handles non-square viewBox pages", () => {
    // Live-verified: page 187 uses viewBox "0 0 345 550".
    const vb = parseViewBox('<svg viewBox="0 0 345 550"></svg>')!;
    expect(vb.w).toBe(345);
    expect(vb.h).toBe(550);
    const polygon = [
      { x: 0, y: 42.32 },
      { x: 343, y: 42.32 },
      { x: 343, y: 85.5 },
      { x: 0, y: 85.5 },
    ];
    const mapped = toScreen(polygon, vb, 690, 1100);
    expect(mapped[0].x).toBeCloseTo(0, 2);
    expect(mapped[1].x).toBeCloseTo(686, 2); // 343 * 690/345
    expect(mapped[2].y).toBeCloseTo(171, 2); // 85.5 * 1100/550
  });

  it("returns empty for degenerate screen size", () => {
    const vb: ViewBox = { x: 0, y: 0, w: 235, h: 235 };
    expect(toScreen([{ x: 1, y: 1 }], vb, 0, 0)).toEqual([]);
  });
});

describe("BasmalaOffset", () => {
  it("hafs layout keeps offset zero", () => {
    expect(suggestOffset(287, 286)).toBe(0);
    expect(suggestOffset(130, 129)).toBe(0);
    expect(suggestOffset(8, 7)).toBe(0);
  });

  it("non-hafs basmala counted as verse suggests offset one", () => {
    expect(suggestOffset(288, 286)).toBe(1);
  });

  it("maps timing index to verse key", () => {
    expect(verseKeyFor(1, 2, 286, 0)).toBe("2:1");
    expect(verseKeyFor(286, 2, 286, 0)).toBe("2:286");
    expect(verseKeyFor(1, 9, 129, 0)).toBe("9:1");
    expect(verseKeyFor(0, 2, 286, 0)).toBeNull(); // header
    expect(verseKeyFor(287, 2, 286, 0)).toBeNull(); // out of range
  });

  it("offset shifts the mapping by one", () => {
    expect(verseKeyFor(2, 2, 286, 1)).toBe("2:1");
    expect(verseKeyFor(1, 2, 286, 1)).toBeNull();
  });

  it("surah one header index has no verse", () => {
    expect(verseKeyFor(0, 1, 7, 0)).toBeNull();
    expect(verseKeyFor(1, 1, 7, 0)).toBe("1:1");
    expect(verseKeyFor(7, 1, 7, 0)).toBe("1:7");
  });
});

describe("SurahTimingLookup", () => {
  it("entryFor finds the entry by timing index", () => {
    const t = timing([
      [0, 0, 3000],
      [1, 3000, 6000],
      [2, 6000, 9000],
    ]);
    expect(t.entryFor(0)?.startMs).toBe(0);
    expect(t.entryFor(1)?.startMs).toBe(3000);
    expect(t.entryFor(2)?.endMs).toBe(9000);
    expect(t.entryFor(3)).toBeNull();
  });

  it("entryFor handles reads without a basmala entry", () => {
    const t = timing([
      [1, 3220, 11_400],
      [2, 11_400, 19_040],
    ]);
    expect(t.entryFor(1)?.startMs).toBe(3220);
    expect(t.entryFor(2)?.endMs).toBe(19_040);
    expect(t.entryFor(0)).toBeNull(); // virtual basmala slot — no entry
    expect(t.lastAyahIndex).toBe(2);
  });
});

describe("TimingAccuracy", () => {
  it("consistent reads are reliable", () => {
    // Verified: reads 5/13/17/62/273 surah 2 — mp3 duration ≈ timing total.
    expect(isReliable(6_705_000, 6_704_000)).toBe(true);
    expect(isReliable(6_641_000, 6_638_900)).toBe(true);
    expect(isReliable(6_906_000, 6_904_000)).toBe(true);
    expect(isReliable(5_964_000, 5_970_000)).toBe(true);
    expect(isReliable(7_200_000, 7_183_000)).toBe(true);
  });

  it("compressed timing is unreliable", () => {
    // read 135 (السويّد) s2 — mp3 6757 s vs timing 6039 s (1.119);
    // read 259 (أحمد النفيس) 1.095.
    expect(isReliable(6_757_368, 6_038_900)).toBe(false);
    expect(isReliable(8_164_000, 7_455_000)).toBe(false);
  });

  it("stretched timing is unreliable", () => {
    // read 137 (أحمد طالب بن حميد) s2 — mp3 5874 s vs timing 7458 s (0.788).
    expect(isReliable(5_874_000, 7_458_000)).toBe(false);
  });

  it("implausible durations are unreliable", () => {
    expect(isReliable(0, 6_000_000)).toBe(false);
    expect(isReliable(6_000_000, 0)).toBe(false);
    expect(isReliable(10_000, 6_000_000)).toBe(false);
  });
});

describe("TimingAccuracySilence", () => {
  it("trailing silence up to the allowance is still reliable", () => {
    // البنا المجود s97 — file 84.1 s vs timing 79.1 s → +5.0 s silence.
    expect(isReliable(84_088, 79_060)).toBe(true);
    // البنا s1 — file 85.1 s vs timing 78.9 s → +6.2 s.
    expect(isReliable(85_107, 78_900)).toBe(true);
    // Normal reads with a second or two of silence.
    expect(isReliable(47_100, 46_300)).toBe(true);
    expect(isReliable(36_100, 32_300)).toBe(true);
    // Right at the 8 s boundary.
    expect(isReliable(80_000, 72_000)).toBe(true);
  });

  it("more than the silence allowance is unreliable", () => {
    // البنا المجود s114 — file 79.1 s vs timing 45.0 s → +34 s (truncated).
    expect(isReliable(79_099, 45_000)).toBe(false);
    // الحذيفي s1 timing stops at 45.7 s while recitation continues to 61.3 s.
    expect(isReliable(62_992, 45_700)).toBe(false);
    // read 135 السويّد s1 +9.4 s (compressed read) stays unreliable.
    expect(isReliable(53_100, 43_700)).toBe(false);
  });

  it("timing over-claiming the mp3 is unreliable", () => {
    // read 17 s114 — timing 39.1 s vs a 31.0 s file (-20.7%).
    expect(isReliable(31_000, 39_100)).toBe(false);
    // read 137 s2 stretched (mp3 5874 s vs timing 7458 s).
    expect(isReliable(5_874_000, 7_458_000)).toBe(false);
  });

  it("small deficits within tolerance are reliable", () => {
    expect(isReliable(100_000, 101_000)).toBe(true);
  });
});

describe("ReciterSearch", () => {
  function reciter(name: string, letter: string | null = null): Reciter {
    return {
      id: name.length,
      name,
      letter,
      moshafs: [{ id: 1, name: "حفص", server: "https://example/", surahTotal: null, moshafType: null, rewayaId: null, surahList: [] }],
    };
  }

  it("exact arabic name matches", () => {
    expect(reciterMatchesQuery(reciter("محمود خليل الحصري"), "الحصري")).toBe(true);
  });

  it("partial name matches", () => {
    expect(reciterMatchesQuery(reciter("عبدالباسط عبدالصمد"), "عبدالباسط")).toBe(true);
    expect(reciterMatchesQuery(reciter("مشاري العفاسي"), "عفاسي")).toBe(true);
  });

  it("hamza variants are normalized", () => {
    expect(reciterMatchesQuery(reciter("أحمد بن علي العجمي"), "احمد")).toBe(true);
    expect(reciterMatchesQuery(reciter("أحمد الحواشي"), "أحمد الحواشي")).toBe(true);
  });

  it("alif maqsura and ta marbuta are normalized", () => {
    expect(reciterMatchesQuery(reciter("مصطفى إسماعيل"), "مصطفي اسماعيل")).toBe(true);
    expect(reciterMatchesQuery(reciter("عبدالرحمن السديس"), "السديس")).toBe(true);
  });

  it("initial letter matches", () => {
    expect(reciterMatchesQuery(reciter("مشاري العفاسي", "م"), "م")).toBe(true);
    expect(reciterMatchesQuery(reciter("مشاري العفاسي", "م"), "ح")).toBe(false);
  });

  it("empty query matches everything", () => {
    expect(reciterMatchesQuery(reciter("أي أحد"), "")).toBe(true);
    expect(reciterMatchesQuery(reciter("أي أحد"), "   ")).toBe(true);
  });

  it("non matching returns false", () => {
    expect(reciterMatchesQuery(reciter("محمود خليل الحصري"), "المنشاوي")).toBe(false);
  });
});
