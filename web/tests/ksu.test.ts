// Ported 1:1 from app/src/test/java/com/qurantv/app/domain/DomainTests.kt
// KSU hilite geometry, pagination data, and page-band estimator fixtures.

import { describe, expect, it } from "vitest";
import { buildKsuRects, HAFS, TAJWEED, WARSH, type KsuAyahEnd } from "../src/domain/KsuHiliteGeometry";
import { estimateBands } from "../src/domain/PageAyahEstimator";
import { warshPageFor } from "../src/domain/KsuWarshPageData";
import { tajweedPageFor } from "../src/domain/KsuTajweedPageData";

const ayahEnd = (surah: number, ayah: number, x: number, y: number): KsuAyahEnd => ({ surah, ayah, x, y });

describe("KsuHiliteGeometry", () => {
  it("first ayah on a page spans from the text top to its end as three rects", () => {
    // Verified tajweed page 9 data: 2_58 ends at [248, 136].
    const rects = buildKsuRects(
      [ayahEnd(2, 58, 248, 136), ayahEnd(2, 59, 223, 222)],
      9,
      TAJWEED,
      456,
      707,
    );
    const r58 = rects.get("2:58")!;
    expect(r58.length).toBe(3);
    const r1 = r58[0];
    expect(r1.left).toBeCloseTo(25 / 456, 3);
    expect(r1.top).toBeCloseTo(30 / 707, 3);
    expect(r1.right).toBeCloseTo(427 / 456, 3);
    expect(r1.bottom).toBeCloseTo(70 / 707, 3);
    const r2 = r58[1];
    expect(r2.left).toBeCloseTo(231 / 456, 3);
    expect(r2.top).toBeCloseTo(116 / 707, 3);
    const r3 = r58[2];
    expect(r3.top).toBeCloseTo(70 / 707, 3);
    expect(r3.bottom).toBeCloseTo(116 / 707, 3);
  });

  it("warsh ayah ends stay in the site's display space", () => {
    // Verified warsh p192: 9_35 ends [316,502], 9_36 ends [47,685].
    const rects = buildKsuRects(
      [ayahEnd(9, 35, 316, 502), ayahEnd(9, 36, 47, 685)],
      192,
      WARSH,
      620,
      1005,
    );
    const r36 = rects.get("9:36")!;
    const spaceW = (620 * 760) / 1005;
    const last = r36[1];
    expect(last.left).toBeCloseTo(30 / spaceW, 3); // 47-17
    expect(last.top).toBeCloseTo(665 / 760, 3); // 685-20
    expect(last.right).toBeCloseTo(427 / spaceW, 3);
    expect(last.bottom).toBeCloseTo(705 / 760, 3); // 665+40
  });

  it("last line of the page spans the full native line ink", () => {
    // Verified: tajweed p9 2_61 ends at [46,648].
    const rects = buildKsuRects(
      [ayahEnd(2, 60, 46, 351), ayahEnd(2, 61, 46, 648)],
      9,
      TAJWEED,
      456,
      707,
    );
    const r61 = rects.get("2:61")!;
    const last = r61[1];
    expect(last.left).toBeCloseTo(29 / 456, 3);
    expect(last.top).toBeCloseTo(628 / 707, 3);
    expect(last.right).toBeCloseTo(427 / 456, 3);
    expect(last.bottom).toBeCloseTo(668 / 707, 3);
  });

  it("two ayahs ending on the same line collapse to one rect", () => {
    // 1_3 [243,353] and 1_4 [138,352] on page 1 (fp layout).
    const rects = buildKsuRects(
      [ayahEnd(1, 3, 243, 353), ayahEnd(1, 4, 138, 352)],
      1,
      HAFS,
      456,
      672,
    );
    const r4 = rects.get("1:4")!;
    expect(r4.length).toBe(1);
    expect(r4[0].left * 456).toBeCloseTo(138 - 5, 1);
    expect(r4[0].right * 456).toBeCloseTo(243 - 5, 1);
  });

  it("page two opening spread uses fp layout", () => {
    const rects = buildKsuRects(
      [ayahEnd(2, 1, 283, 324), ayahEnd(2, 2, 284, 352)],
      2,
      HAFS,
      456,
      672,
    );
    const r1 = rects.get("2:1")!;
    expect(r1.length).toBe(3);
    expect(r1[1].left * 456).toBeCloseTo(278, 1);
  });

  it("empty input yields no rects", () => {
    expect(buildKsuRects([], 9, TAJWEED, 456, 707).size).toBe(0);
  });
});

describe("PageAyahEstimator", () => {
  it("long ayahs get proportionally tall bands in order", () => {
    const ayahs = Array.from({ length: 11 }, (_, i) => 6 + i);
    const lengths = ayahs.map((a) => 50 - a); // descending: 44..34
    const bands = estimateBands(ayahs, lengths, false);
    let prevBottom = 0;
    for (const a of ayahs) {
      const b = bands.get(a)!;
      expect(b.yTop).toBeGreaterThanOrEqual(prevBottom - 0.001);
      expect(b.yBottom).toBeGreaterThan(b.yTop);
      expect(b.yBottom).toBeLessThanOrEqual(1.0);
      prevBottom = b.yBottom;
    }
    expect(bands.get(6)!.yTop).toBeGreaterThanOrEqual(0.02);
    expect(bands.get(16)!.yBottom).toBeLessThanOrEqual(0.98);
  });

  it("surah-start pages reserve the header", () => {
    const bands = estimateBands([1, 2], [100, 100], true);
    const top = bands.get(1)!.yTop;
    expect(top).toBeGreaterThanOrEqual(2 / 15);
    expect(top).toBeLessThan(0.2);
  });

  it("empty input yields no bands", () => {
    expect(estimateBands([], [], false).size).toBe(0);
  });
});

describe("KsuWarshPageData", () => {
  it("maps known verses to warsh pages", () => {
    expect(warshPageFor(2, 1)).toBe(2);
    expect(warshPageFor(2, 6)).toBe(3);
    expect(warshPageFor(2, 255)).toBe(42);
    expect(warshPageFor(2, 282)).toBe(48);
    expect(warshPageFor(50, 1)).toBe(518);
    expect(warshPageFor(1, 1)).toBe(1);
    expect(warshPageFor(9, 1)).toBe(187);
  });

  it("returns null below the first page", () => {
    expect(warshPageFor(0, 0)).toBeNull();
  });

  it("clamps valid ranges to a page", () => {
    expect(warshPageFor(1, 8)).not.toBeNull();
    expect(warshPageFor(114, 6)).not.toBeNull();
  });
});

describe("KsuTajweedPageData", () => {
  it("maps known verses to tajweed pages", () => {
    // Tajweed pagination == mod3 of the standard layout; spot-check a few.
    expect(tajweedPageFor(1, 1)).toBe(1);
    expect(tajweedPageFor(2, 1)).toBe(2);
    expect(tajweedPageFor(114, 6)).toBe(604);
  });

  it("returns null below the first page", () => {
    expect(tajweedPageFor(0, 0)).toBeNull();
  });
});

describe("KsuHilitesRepository", () => {
  it("parses hilites json correctly from mock api and caches result", async () => {
    const { KsuHilitesRepository, parseHilites } = await import("../src/data/repo/KsuHilitesRepository");
    const { JsonDiskCache } = await import("../src/data/cache/JsonDiskCache");

    const sample = '{"1": {"1_1": [181, 301], "1_2": [159, 325]}}';
    const parsed = parseHilites(sample);
    expect(parsed).toEqual([
      { surah: 1, ayah: 1, x: 181, y: 301 },
      { surah: 1, ayah: 2, x: 159, y: 325 },
    ]);

    const mockApi: any = {
      hilites: async (mushaf: string, page: number) => {
        if (mushaf === "hafs" && page === 1) return sample;
        throw new Error("not found");
      },
    };
    const cache = new JsonDiskCache();
    const repo = new KsuHilitesRepository(mockApi, cache);
    const result = await repo.positionsFor("hafs", 1);
    expect(result).toEqual([
      { surah: 1, ayah: 1, x: 181, y: 301 },
      { surah: 1, ayah: 2, x: 159, y: 325 },
    ]);
  });
});

