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
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
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

/** Move focus in a direction using a rect-distance heuristic. */
export function moveFocus(dir: FocusDirection): void {
  const current = focusedElement();
  // When a dialog is open, keep D-pad focus INSIDE it (never escape to the
  // transport behind the scrim — otherwise the picker is unusable on a remote).
  let scope: ParentNode | null = null;
  if (typeof document !== "undefined") {
    scope = document.querySelector(".dialog-scrim");
  }
  const curRect = current?.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of registry.values()) {
    if (scope && !scope.contains(el)) continue;
    if (el === current || !isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    const dx = (r.left + r.width / 2) - (curRect ? curRect.left + curRect.width / 2 : window.innerWidth / 2);
    const dy = (r.top + r.height / 2) - (curRect ? curRect.top + curRect.height / 2 : window.innerHeight / 2);
    const overlapX = Math.min(r.right, curRect ? curRect.right : Infinity) - Math.max(r.left, curRect ? curRect.left : 0);
    const overlapY = Math.min(r.bottom, curRect ? curRect.bottom : Infinity) - Math.max(r.top, curRect ? curRect.top : 0);

    let score = Infinity;
    if (dir === "up" && dy < -4 && overlapX > -8) score = -dy + Math.max(0, -overlapX) * 4;
    if (dir === "down" && dy > 4 && overlapX > -8) score = dy + Math.max(0, -overlapX) * 4;
    if (dir === "left" && dx < -4 && overlapY > -8) score = -dx + Math.max(0, -overlapY) * 4;
    if (dir === "right" && dx > 4 && overlapY > -8) score = dx + Math.max(0, -overlapY) * 4;

    if (score < bestScore) {
      bestScore = score;
      best = el;
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
