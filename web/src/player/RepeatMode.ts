// Repeat modes — mirror of the Android RepeatMode (OFF / AYAH / SURAH).

export type RepeatMode = "off" | "ayah" | "surah";

export const REPEAT_CYCLE: RepeatMode[] = ["off", "ayah", "surah"];

export function nextRepeat(current: RepeatMode): RepeatMode {
  const i = REPEAT_CYCLE.indexOf(current);
  return REPEAT_CYCLE[(i + 1) % REPEAT_CYCLE.length];
}
