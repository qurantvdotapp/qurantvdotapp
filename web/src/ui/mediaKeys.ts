// Media-key router — the player registers its handler here so global remote
// keys (play/pause, next/prev, info) reach the audio engine from any screen.

export type MediaKeyHandler = (key: "playPause" | "next" | "prev" | "info") => void;

let handler: MediaKeyHandler | null = null;

export function setMediaKeyHandler(h: MediaKeyHandler | null): void {
  handler = h;
}

export function dispatchMediaKey(key: "playPause" | "next" | "prev" | "info"): void {
  handler?.(key);
}
