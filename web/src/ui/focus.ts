// Focus engine — DOM-rect spatial navigation for TV remotes.
// Elements register via the `focusable` SolidJS directive; arrows move focus to
// the nearest visible element in that direction (getBoundingClientRect), Enter
// activates (click). A `.focused` class drives the scale+border ring in CSS.
// This mirrors the Android app's explicit D-pad focus but stays fully dynamic
// (works with lazily-loaded lists without a hand-wired focus graph).

import { createSignal } from "solid-js";

export type FocusDirection = "up" | "down" | "left" | "right";

const registry = new Map<string, HTMLElement>();
const [focusedId, setFocusedId] = createSignal<string | null>(null);
export { focusedId };

export function registerFocusable(id: string, el: HTMLElement): void {
  registry.set(id, el);
}

export function unregisterFocusable(id: string): void {
  registry.delete(id);
  if (focusedId() === id) setFocusedId(null);
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  // Fast path for visibility on TV without layout thrashing:
  // offsetParent is null when an element (or ancestor) is display: none.
  // We check offsetWidth/offsetHeight or offsetParent.
  if (el.offsetParent === null && el.style.position !== "fixed") return false;
  if (el.offsetWidth <= 0 || el.offsetHeight <= 0) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
  }
  // Check ancestor hidden classes without calling getComputedStyle in a loop
  let node: HTMLElement | null = el;
  while (node) {
    if (node.classList && (node.classList.contains("chrome-hidden") || node.getAttribute("aria-hidden") === "true")) {
      return false;
    }
    if (node.style.display === "none" || node.style.visibility === "hidden") return false;
    node = node.parentElement;
  }
  return true;
}

export function focusElement(id: string): void {
  const el = registry.get(id);
  if (el && isVisible(el)) {
    setFocusedId(id);
    // Use instant scroll ("auto") instead of "smooth" on TV to eliminate input lag and frame drops during rapid remote D-pad presses
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    // When app focus leaves the search bar, drop DOM focus from the search
    // <input>. Otherwise Enter/OK keeps landing on the input (which re-runs
    // the search via openFirstMatch) instead of activating the newly focused
    // chip/row/card — the moshaf picker then feels like it "doesn't wait":
    // every OK re-opens the chooser, and key cascades can land in the player
    // at surah 1 without a deliberate selection.
    if (id !== "home-search" && document.activeElement?.tagName === "INPUT") {
      (document.activeElement as HTMLElement).blur();
    }
  }
}

/** Drop app focus entirely (e.g. when the player chrome auto-hides, so the
 *  next OK reveals the toolbar instead of activating a now-invisible button). */
export function clearFocus(): void {
  setFocusedId(null);
}

export function focusedElement(): HTMLElement | null {
  const id = focusedId();
  return id ? registry.get(id) ?? null : null;
}

/**
 * Spatial navigation tuned for a mixed dashboard:
 * a candidate is eligible when its CENTER lies in the movement direction, and we
 * pick the nearest one weighted by an ALIGNMENT PENALTY (perpendicular distance).
 * Forgiving — works for wrapped grids, the letter rail, rows and dialogs.
 */
export function moveFocus(dir: FocusDirection): void {
  const current = focusedElement();
  // When a dialog is open, keep D-pad focus INSIDE it (never escape to the
  // transport behind the scrim — otherwise the picker is unusable on a remote).
  let scope: ParentNode | null = null;
  if (typeof document !== "undefined") scope = document.querySelector(".dialog-scrim");
  if (!current) {
    focusFirst(scope ?? document);
    return;
  }
  const CR = current.getBoundingClientRect();
  const cx = CR.left + CR.width / 2;
  const cy = CR.top + CR.height / 2;
  let best: HTMLElement | null = null;
  const candidates: Array<{ el: HTMLElement; gap: number; perp: number }> = [];
  for (const el of registry.values()) {
    if (scope && !scope.contains(el)) continue;
    if (el === current || !isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    let gap = Infinity;
    let perp = Infinity;
    if (dir === "down" && ey > cy + 4) {
      gap = ey - cy;
      perp = Math.abs(ex - cx);
    } else if (dir === "up" && ey < cy - 4) {
      gap = cy - ey;
      perp = Math.abs(ex - cx);
    } else if (dir === "right" && ex > cx + 4) {
      gap = ex - cx;
      perp = Math.abs(ey - cy);
    } else if (dir === "left" && ex < cx - 4) {
      gap = cx - ex;
      perp = Math.abs(ey - cy);
    }
    if (Number.isFinite(gap)) candidates.push({ el, gap, perp });
  }
  if (candidates.length === 0) return;
  // ROW-PRIMARY navigation: move to the NEAREST perpendicular row first, then
  // the closest cell within it. (The old gap+1.5*perp score let a column-
  // aligned cell two rows down beat a partial row's edge cell — e.g. on the
  // dashboard a letter group with 2 reciters was skipped entirely.)
  const TOL = 12; // px — same-row cells share an identical perpendicular offset
  let row: Array<{ el: HTMLElement; gap: number; perp: number }>;
  if (dir === "up" || dir === "down") {
    const minGap = Math.min(...candidates.map((c) => c.gap));
    row = candidates.filter((c) => c.gap <= minGap + TOL);
    best = row.reduce((a, b) => (b.perp < a.perp ? b : a), row[0]).el;
  } else {
    const minPerp = Math.min(...candidates.map((c) => c.perp));
    row = candidates.filter((c) => c.perp <= minPerp + TOL);
    // Row's edge: fall back to the next band so LEFT/RIGHT still advances.
    const pick = row.length > 0 ? row : candidates;
    best = pick.reduce((a, b) => (b.gap < a.gap ? b : a), pick[0]).el;
  }
  if (best) {
    const id = best.getAttribute("data-focus-id");
    if (id) focusElement(id);
  }
}

/** Focus the first visible focusable (used when a screen/dialog opens). */
export function focusFirst(scope: ParentNode | HTMLElement = document): void {  let best: HTMLElement | null = null;
  let bestTop = Infinity;
  for (const el of registry.values()) {
    if (!scope.contains(el) || !isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.top < bestTop) {
      bestTop = r.top;
      best = el;
    }
  }
  if (best) {
    const id = best.getAttribute("data-focus-id");
    if (id) focusElement(id);
  }
}

/** Activate the focused element (Enter / OK). */
export function activateFocused(): void {
  const el = focusedElement();
  el?.click();
}
