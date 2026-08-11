// Ported 1:1 from app/src/main/java/com/qurantv/app/domain/IslamicPageBands.kt
// Structured line data parsed from islamic.app mushaf page SVGs:
// `<text x y font-size text-anchor>` elements whose `<tspan data-ayah="s:a">`
// children hold the ayah text; `y` is the BASELINE (glyphs sit above it).

export interface IslamicTspan {
  ayahKey: string | null;
  text: string;
}

export interface IslamicLine {
  baselineY: number;
  fontSize: number;
  anchorX: number;
  anchor: string;
  tspans: IslamicTspan[];
}

/** Parses the page's ayah text lines (in document order) using DOMParser. */
export function parseLines(svg: string): IslamicLine[] {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const lines: IslamicLine[] = [];
  const texts = doc.getElementsByTagName("text");
  for (let i = 0; i < texts.length; i++) {
    const text = texts.item(i) as Element | null;
    if (!text) continue;
    const tspans: IslamicTspan[] = [];
    collectTspans(text, tspans);
    if (tspans.length === 0) continue;
    const y = parseFloatAttr(text, "y");
    const fs = parseFloatAttr(text, "font-size");
    const x = parseFloatAttr(text, "x");
    if (!Number.isFinite(y) || !Number.isFinite(fs) || !Number.isFinite(x)) continue;
    lines.push({
      baselineY: y,
      fontSize: fs,
      anchorX: x,
      anchor: text.getAttribute("text-anchor") ?? "",
      tspans,
    });
  }
  return lines;
}

function parseFloatAttr(el: Element, name: string): number {
  const v = el.getAttribute(name);
  return v === null ? NaN : Number.parseFloat(v);
}

function collectTspans(el: Element, out: IslamicTspan[]): void {
  for (const child of Array.from(el.children)) {
    if (child.tagName === "tspan") {
      const key = child.getAttribute("data-ayah");
      out.push({ ayahKey: key && key.trim().length > 0 ? key : null, text: child.textContent ?? "" });
    } else if (child.tagName === "text" || child.tagName === "tspan") {
      collectTspans(child, out);
    }
  }
}
