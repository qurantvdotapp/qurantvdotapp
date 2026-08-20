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
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  // Only require a non-zero size — NOT a "within the viewport" check. Elements
  // below the fold of a scroll container are valid focus targets: scrollIntoView
  // brings them up. (The old viewport clip left the reciter list unable to scroll.)
  return r.width > 0 && r.height > 0;
}

export function focusElement(id: string): void {
  const el = registry.get(id);
  if (el && isVisible(el)) {
    setFocusedId(id);
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }
}

export function focusedElement(): HTMLElement | null {
  const id = focusedId();
  return id ? registry.get(id) ?? null : null;
}

/**
 * Move focus in a direction using grid-style spatial navigation:
 * the candidate must lie in that direction AND overlap the current element
 * along the perpendicular axis (small tolerance). We pick the nearest such
 * candidate (smallest gap), so D-pad moves row-by-row through a wrapped grid
 * and never diagonally jumps into a neighbouring column (e.g. the letter rail).
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
  const cur = current.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of registry.values()) {
    if (scope && !scope.contains(el)) continue;
    if (el === current || !isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    let ok = false;
    let gap = Infinity;
    let misalign = 0;
    if (dir === "down") {
      const overlap = Math.min(r.right, cur.right) - Math.max(r.left, cur.left);
      if (r.bottom > cur.bottom && overlap > -12) {
        ok = true;
        gap = r.top - cur.bottom;
        misalign = Math.max(0, Math.max(cur.left - r.left, r.right - cur.right));
      }
    } else if (dir === "up") {
      const overlap = Math.min(r.right, cur.right) - Math.max(r.left, cur.left);
      if (r.top < cur.top && overlap > -12) {
        ok = true;
        gap = cur.top - r.bottom;
        misalign = Math.max(0, Math.max(cur.left - r.left, r.right - cur.right));
      }
    } else if (dir === "right") {
      const overlap = Math.min(r.bottom, cur.bottom) - Math.max(r.top, cur.top);
      if (r.left > cur.left && overlap > -12) {
        ok = true;
        gap = r.left - cur.right;
        misalign = Math.max(0, Math.max(cur.top - r.top, r.bottom - cur.bottom));
      }
    } else {
      const overlap = Math.min(r.bottom, cur.bottom) - Math.max(r.top, cur.top);
      if (r.right < cur.right && overlap > -12) {
        ok = true;
        gap = cur.left - r.right;
        misalign = Math.max(0, Math.max(cur.top - r.top, r.bottom - cur.bottom));
      }
    }
    if (ok) {
      const score = gap + misalign * 1.2; // prefer near + aligned
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
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
