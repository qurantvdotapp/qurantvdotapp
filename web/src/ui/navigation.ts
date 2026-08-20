// Navigation — hand-rolled back stack (mirrors the Android AppNavigator):
// Home → SurahGrid → Player; replaceTop for display-mode/moshaf changes; a
// dialog overlay stack per screen is managed by the screens themselves.

import { createSignal } from "solid-js";
import type { Moshaf, Reciter, QuranSurah } from "../domain/Models";

export type Screen =
  | { kind: "home" }
  | { kind: "surahs"; reciter: Reciter; moshaf: Moshaf }
  | { kind: "player"; reciter: Reciter; moshaf: Moshaf; surah: QuranSurah; availableSurahs: QuranSurah[]; startAyahIndex?: number; resumeOffsetMs?: number }
  | { kind: "settings" };

export function createNavigator() {
  const [stack, setStack] = createSignal<Screen[]>([{ kind: "home" }]);

  const current = (): Screen => stack()[stack().length - 1];

  function push(screen: Screen): void {
    setStack((s) => [...s, screen]);
  }

  function replaceTop(screen: Screen): void {
    setStack((s) => [...s.slice(0, -1), screen]);
  }

  function pop(): void {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }

  /** Back: pop; on Home, exit the app (browser/TV close). */
  function back(): void {
    if (stack().length > 1) {
      pop();
    } else {
      // On a packaged TV app this closes the app; in a browser it's a no-op.
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }
  }

  return { stack, current, push, replaceTop, pop, back };
}

export type Navigator = ReturnType<typeof createNavigator>;
