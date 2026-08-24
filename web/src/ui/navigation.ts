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

export function exitApp(): void {
  // Stop all audio playback immediately
  try {
    const audios = document.querySelectorAll("audio");
    audios.forEach((a) => {
      try {
        a.pause();
        a.currentTime = 0;
        a.src = "";
        a.load();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
  // 1. Tizen Web API
  try {
    const tizenGlobal = (window as unknown as { tizen?: { application?: { getCurrentApplication?: () => { exit: () => void } } } }).tizen;
    if (tizenGlobal?.application?.getCurrentApplication) {
      tizenGlobal.application.getCurrentApplication().exit();
      return;
    }
  } catch {
    /* ignore */
  }

  // 2. webOS API
  try {
    const webOSGlobal = (window as unknown as { webOS?: { platformBack?: () => void } }).webOS;
    if (webOSGlobal?.platformBack) {
      webOSGlobal.platformBack();
      return;
    }
  } catch {
    /* ignore */
  }

  // 3. Android TV Webview Host interface
  try {
    const host = (window as unknown as { AndroidHost?: { exitApp?: () => void; close?: () => void } }).AndroidHost;
    if (host?.exitApp) {
      host.exitApp();
      return;
    }
    if (host?.close) {
      host.close();
      return;
    }
  } catch {
    /* ignore */
  }

  // 4. Cordova / standard mobile navigator app interface
  try {
    const navAny = navigator as unknown as { app?: { exitApp?: () => void } };
    if (navAny.app?.exitApp) {
      navAny.app.exitApp();
      return;
    }
  } catch {
    /* ignore */
  }

  // 4. Standard window.close()
  try {
    window.close();
  } catch {
    /* ignore */
  }

  // 5. History back fallback
  try {
    if (window.history.length > 1) {
      window.history.back();
    }
  } catch {
    /* ignore */
  }
}

let lastHomeBackPress = 0;

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

  /** Back: pop; on Home, double-press Back exits the app (or platform exit). */
  function back(): void {
    if (stack().length > 1) {
      pop();
    } else {
      const now = Date.now();
      if (now - lastHomeBackPress < 2500) {
        exitApp();
      } else {
        lastHomeBackPress = now;
        window.dispatchEvent(new CustomEvent("qurantv-exit-prompt"));
      }
    }
  }

  return { stack, current, push, replaceTop, pop, back, exitApp };
}

export type Navigator = ReturnType<typeof createNavigator>;
