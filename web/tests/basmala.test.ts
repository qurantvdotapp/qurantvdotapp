// Ported from the QuranTextRepository behavior (basmala stripping, Tanzil parse).

import { describe, expect, it } from "vitest";
import { stripBasmala } from "../src/data/repo/QuranTextRepository";

const BASMALA = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";

describe("stripBasmala", () => {
  it("strips the basmala prefix from verse 1 of surahs 2-114", () => {
    // Tanzil embeds the basmala as a prefix of verse 1; the recitation recites
    // it as its own header segment (timing index 0).
    const raw = `${BASMALA} الٓمٓ`;
    expect(stripBasmala(raw, BASMALA)).toBe("الٓمٓ");
  });

  it("returns the trimmed full text when the basmala is not a prefix", () => {
    // Matches the Kotlin behavior exactly: a leading-space line never matches
    // startsWith, so the whole trimmed text is returned (basmala kept). Tanzil
    // lines are clean `surah|ayah|text`, so this never happens in practice.
    expect(stripBasmala(`  ${BASMALA}  الم  `, BASMALA)).toBe(`${BASMALA}  الم`);
  });

  it("keeps text that does not start with the basmala", () => {
    expect(stripBasmala("الم", BASMALA)).toBe("الم");
  });

  it("keeps verse 1 when the stripped remainder is empty", () => {
    // Should never happen for 2..114, but never return an empty string.
    expect(stripBasmala(BASMALA, BASMALA)).toBe(BASMALA);
  });
});
