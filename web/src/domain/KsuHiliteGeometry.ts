// Ported 1:1 from app/src/main/java/com/qurantv/app/domain/KsuHiliteGeometry.kt
// Exact ayah highlight geometry for the quran.ksu.edu.sa (Ayat) mushafs,
// reimplementing the site's own hilitePage() algorithm.
//
// The hilites API returns `"<sura>_<aya>" : [x, y]` = where that ayah ENDS, in
// the page's DISPLAY space. An ayah's highlight runs from where the PREVIOUS
// ayah ended to where this ayah ends, drawn as up to three rects (first partial
// line, last partial line, full-width middle block). Same-line ayahs collapse.

export interface KsuMeta {
  height: number;
  mgwidth: number;
  twidth: number;
  ofwidth: number;
  ofheight: number;
  faselSura: number;
  pageTop: number;
  pageSuraTop: number;
  fpHeight: number;
  fpMgwidth: number;
  fpTwidth: number;
  fpOfwidth: number;
  fpOfheight: number;
  /** Height of the API's coordinate space (site display height per mushaf). */
  displayHeight: number;
}

export const HAFS: KsuMeta = {
  height: 30, mgwidth: 40, twidth: 416, ofwidth: 10, ofheight: 15,
  faselSura: 110, pageTop: 37, pageSuraTop: 80,
  fpHeight: 20, fpMgwidth: 80, fpTwidth: 376, fpOfwidth: 5, fpOfheight: 10,
  displayHeight: 672, // native 456×672
};

export const WARSH: KsuMeta = {
  height: 40, mgwidth: 25, twidth: 427, ofwidth: 17, ofheight: 20,
  faselSura: 140, pageTop: 30, pageSuraTop: 80,
  fpHeight: 20, fpMgwidth: 80, fpTwidth: 376, fpOfwidth: 5, fpOfheight: 10,
  displayHeight: 760, // display-scaled from 620×1005
};

export const TAJWEED: KsuMeta = {
  height: 40, mgwidth: 25, twidth: 427, ofwidth: 17, ofheight: 20,
  faselSura: 140, pageTop: 30, pageSuraTop: 80,
  fpHeight: 30, fpMgwidth: 100, fpTwidth: 350, fpOfwidth: 10, fpOfheight: 15,
  displayHeight: 707, // native 456×707
};

/** prev_top seed for the ornamental opening pages (engine.js hard-codes 270). */
const FIRST_PAGES_TOP = 270;

/** One highlight rectangle, in fractions (0..1) of the rendered page. */
export interface KsuRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** An ayah on the page with its end position from the hilites API. */
export interface KsuAyahEnd {
  surah: number;
  ayah: number;
  x: number;
  y: number;
}

/**
 * Builds the highlight rectangles for every ayah on a page.
 * @returns `"surah:ayah" -> rects` in fraction-of-page units.
 */
export function buildKsuRects(
  ayahs: KsuAyahEnd[],
  page: number,
  meta: KsuMeta,
  imageWidth: number,
  imageHeight: number,
): Map<string, KsuRect[]> {
  if (ayahs.length === 0 || imageWidth <= 0 || imageHeight <= 0) return new Map();
  const firstPages = page === 1 || page === 2;
  const height = firstPages ? meta.fpHeight : meta.height;
  const mgwidth = firstPages ? meta.fpMgwidth : meta.mgwidth;
  const twidth = firstPages ? meta.fpTwidth : meta.twidth;
  const ofwidth = firstPages ? meta.fpOfwidth : meta.ofwidth;
  const ofheight = firstPages ? meta.fpOfheight : meta.ofheight;

  // Fractions are computed in the API's coordinate space (site display height).
  const spaceH = meta.displayHeight;
  const spaceW = (imageWidth * spaceH) / imageHeight;

  const out = new Map<string, KsuRect[]>();
  let prevTop = 0;
  let prevLeft = 0;
  ayahs.forEach((e, index) => {
    const top = e.y - ofheight;
    const left = e.x - ofwidth;
    if (index === 0) {
      prevLeft = twidth;
      prevTop = firstPages ? FIRST_PAGES_TOP : e.ayah === 1 ? meta.pageSuraTop : meta.pageTop;
    } else if (e.ayah === 1) {
      // A new surah starts on this page: skip its header separator.
      prevTop += meta.faselSura;
      prevLeft = twidth;
    }
    const diff = top - prevTop;
    let rects: KsuRect[];
    if (diff > height * 1.6) {
      rects = [
        ksuRect(mgwidth, prevTop, prevLeft, prevTop + height, spaceW, spaceH),
        ksuRect(left, top, twidth, top + height, spaceW, spaceH),
        ksuRect(mgwidth, prevTop + height, twidth, prevTop + diff, spaceW, spaceH),
      ];
    } else if (diff > height * 0.6) {
      rects = [
        ksuRect(mgwidth, prevTop, prevLeft, prevTop + height, spaceW, spaceH),
        ksuRect(left, top, twidth, top + height, spaceW, spaceH),
      ];
    } else {
      rects = [ksuRect(left, top, prevLeft, top + height, spaceW, spaceH)];
    }
    out.set(`${e.surah}:${e.ayah}`, rects);
    prevTop = top;
    prevLeft = left;
  });
  return out;
}

function ksuRect(left: number, top: number, right: number, bottom: number, spaceW: number, spaceH: number): KsuRect {
  return {
    left: clamp01(left / spaceW),
    top: clamp01(top / spaceH),
    right: clamp01(right / spaceW),
    bottom: clamp01(bottom / spaceH),
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
