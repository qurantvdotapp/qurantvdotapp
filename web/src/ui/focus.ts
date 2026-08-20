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
  // Opacity/display don't inherit — a button inside an opacity-0 container
  // (e.g. the auto-hidden page-mode chrome) reports opacity 1 itself. Walk the
  // ancestor chain so hidden-chrome buttons never become D-pad targets (that
  // made focus move invisibly while the mushaf was fullscreen).
  let node: HTMLElement | null = el;
  while (node) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    node = node.parentElement;
  }
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
  let bestScore = Infinity;
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
    if (Number.isFinite(gap)) {
      // Near first, aligned second; alignment matters so we don't diagonal-jump
      // into a neighbouring column (e.g. the letter rail) when a straight move exists.
      const score = gap + perp * 1.5;
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
