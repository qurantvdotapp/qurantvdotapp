// @vitest-environment jsdom
// Ported 1:1 from the Android IslamicPageBandsTest + IslamicHiliteRectsTest.

import { describe, expect, it } from "vitest";
import { parseLines } from "../src/domain/IslamicPageBands";
import { buildIslamicRects } from "../src/domain/IslamicHiliteRects";

const sampleSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
  <text x="360" y="163.16" font-size="32.4">
    <tspan data-ayah="1:1">بِسْمِ اللَّهِ</tspan>
  </text>
  <text x="360" y="213.38" font-size="32.4">
    <tspan data-ayah="1:2">الْحَمْدُ لِلَّهِ</tspan><tspan data-ayah="1:3">الرَّحْمَٰنِ</tspan>
  </text>
  <text x="360" y="263.60" font-size="22">
    <tspan data-ayah="1:4">مَالِكِ يَوْمِ الدِّينِ</tspan>
  </text>
</svg>`.trim();

const width = (text: string, fontSize: number): number => text.length * fontSize * 0.5;

describe("IslamicPageBands", () => {
  it("parses lines with baselines and tspans", () => {
    const lines = parseLines(sampleSvg);
    expect(lines.length).toBe(3);
    expect(lines[0].baselineY).toBeCloseTo(163.16);
    expect(lines[0].fontSize).toBeCloseTo(32.4);
    expect(lines[0].tspans.length).toBe(1);
    expect(lines[0].tspans[0].ayahKey).toBe("1:1");
    expect(lines[1].tspans.map((t) => t.ayahKey)).toEqual(["1:2", "1:3"]);
  });

  it("same-line ayahs get a rect between their end positions", () => {
    const lines = parseLines(sampleSvg);
    const rects = buildIslamicRects(lines, 720, 720, width);
    const r3 = rects.get("1:3")!;
    expect(r3.length).toBe(1);
    expect(r3[0].top * 720).toBeLessThan(213.38);
    expect(r3[0].bottom * 720).toBeGreaterThan(213.38);
    expect(r3[0].top * 720).toBeCloseTo(213.38 - 32.4 * 0.95, 0);
    expect(r3[0].bottom * 720).toBeCloseTo(213.38 + 32.4 * 0.35, 0);
  });

  it("multi-line ayah gets first and last line rects", () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
  <text x="360" y="100" font-size="30">
    <tspan data-ayah="2:1">TEXT_A AYAH_ONE_WORDS</tspan>
  </text>
  <text x="360" y="160" font-size="30">
    <tspan data-ayah="2:2">MORE TEXT HERE FOR TWO</tspan>
  </text>
  <text x="360" y="220" font-size="30">
    <tspan data-ayah="2:2">LAST BIT</tspan>
  </text>
</svg>`.trim();
    const lines = parseLines(svg);
    const rects = buildIslamicRects(lines, 720, 720, width);
    const r2 = rects.get("2:2")!;
    expect(r2.length).toBe(2);
    expect(r2[0].top * 720).toBeCloseTo(160 - 30 * 0.95, 0);
    expect(r2[1].top * 720).toBeCloseTo(220 - 30 * 0.95, 0);
    expect(r2[0].right * 720).toBeCloseTo(525, 0);
    expect(r2[1].left * 720).toBeCloseTo(300, 0);
    expect(r2[1].right * 720).toBeCloseTo(420, 0);
  });
});
