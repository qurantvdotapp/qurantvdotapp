// Unified TV remote key handling for Tizen + Vidaa + Chromium testing.
// Tizen sends standard DOM keyCodes (37/38/39/40, 13) plus TV-specific ones
// (Back=10009, PlayPause=415/19, Info=10252, ChannelUp/Down=427/428).
// Vidaa's Chromium runtime sends the same DOM codes; a few TVs send 461/webOS
// codes — normalized here so screens never see raw codes.

export type AppKey =
  | "up"
  | "down"
  | "left"
  | "right"
  | "ok"
  | "back"
  | "playPause"
  | "mediaNext"
  | "mediaPrev"
  | "info"
  | "channelUp"
  | "channelDown"
  | "rewind"
  | "fastForward"
  | "unknown";

export interface KeyEventLike {
  key: string;
  keyCode: number;
  preventDefault(): void;
  target: EventTarget | null;
}

export function normalizeKey(e: KeyEventLike): AppKey {
  const k = e.key;
  const c = e.keyCode;
  if (k === "ArrowUp" || c === 38) return "up";
  if (k === "ArrowDown" || c === 40) return "down";
  if (k === "ArrowLeft" || c === 37) return "left";
  if (k === "ArrowRight" || c === 39) return "right";
  if (k === "Enter" || c === 13 || c === 108 || c === 160) return "ok";
  // Back: Tizen 10009, webOS 461, browsers Escape/Backspace, "Back" key name
  if (k === "Back" || k === "Escape" || c === 10009 || c === 461 || c === 8 || c === 27) return "back";
  // Media keys
  if (k === "MediaPlayPause" || c === 415 || c === 19 || c === 179 || (k === " " && c === 32)) return "playPause";
  if (k === "MediaTrackNext" || c === 417 || c === 228 || c === 176) return "mediaNext";
  if (k === "MediaTrackPrevious" || c === 412 || c === 229 || c === 177) return "mediaPrev";
  // Info / guide
  if (k === "Info" || k === "i" || k === "I" || c === 10252 || c === 457 || c === 358) return "info";
  // Channel zapping
  if (k === "ChannelUp" || c === 427 || c === 33 || c === 264) return "channelUp";
  if (k === "ChannelDown" || c === 428 || c === 34 || c === 265) return "channelDown";
  // Rewind / fast-forward
  if (k === "MediaRewind" || c === 412 || c === 224) return "rewind";
  if (k === "MediaFastForward" || c === 417 || c === 228) return "fastForward";
  return "unknown";
}

const ACTION_THROTTLE_MS = 160;
const NAV_THROTTLE_MS = 40;

/** Attach a normalized-key handler to the window; returns a cleanup fn. */
export function onRemoteKey(handler: (key: AppKey, raw: KeyEventLike) => void): () => void {
  let lastActionTime = 0;
  let lastNavTime = 0;
  let lastKey: AppKey | null = null;

  const listener = (e: KeyboardEvent) => {
    const key = normalizeKey(e);
    if (key !== "unknown") {
      const now = Date.now();
      const isNav = key === "up" || key === "down" || key === "left" || key === "right";
      const isAction = key === "ok" || key === "back" || key === "playPause" || key === "info";

      // Suppress duplicate hardware key bounce for the same key within throttle threshold
      if (isAction && lastKey === key && now - lastActionTime < ACTION_THROTTLE_MS) {
        e.preventDefault();
        return;
      }
      if (isNav && lastKey === key && now - lastNavTime < NAV_THROTTLE_MS) {
        e.preventDefault();
        return;
      }

      if (isAction) lastActionTime = now;
      if (isNav) lastNavTime = now;
      lastKey = key;

      e.preventDefault();
      handler(key, e);
    }
  };
  window.addEventListener("keydown", listener, true);
  return () => window.removeEventListener("keydown", listener, true);
}
