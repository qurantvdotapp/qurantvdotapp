// Web audio engine — HTML5 <audio> wrapper with a 100 ms ticker.
// Mirrors the Android PlaybackController's role: play/pause/seek/speed,
// position ticker, end-of-media handling, error surfacing.
//
// Gapless note: the Android app queues remaining surahs in ExoPlayer for
// seamless transitions. In a web runtime, true gapless crossfade would need a
// Web Audio graph; the port swaps <audio>.src on ended (small gap) and
// PRELOADS the next surah's audio during playback to minimize it.

import type { RepeatMode } from "./RepeatMode";

const TICK_MS = 100;

export class AudioEngine {
  private readonly audio = new Audio();
  private ticker: number | null = null;
  private url: string | null = null;
  private nextPreload: HTMLAudioElement | null = null;
  private repeat: RepeatMode = "off";

  /** Position ticker (ms) — called every ~100 ms. */
  onPosition: (ms: number) => void = () => {};
  /** End of media reached (used by repeat=off → next surah / stop). */
  onEnded: () => void = () => {};
  onError: (url: string) => void = () => {};
  /** Metadata loaded (duration known, ms). */
  onLoaded: (durationMs: number) => void = () => {};
  onPlayStateChange: (playing: boolean) => void = () => {};

  constructor() {
    this.audio.preload = "auto";
    // Attach to the DOM (hidden) so playback is visible to the platform's
    // media pipeline and to test tooling (Tizen/Vidaa route audio by element).
    this.audio.style.display = "none";
    this.audio.setAttribute("data-qurantv-audio", "true");
    if (document.body) document.body.appendChild(this.audio);
    this.audio.addEventListener("ended", () => {
      if (this.repeat === "surah") {
        this.audio.currentTime = 0;
        void this.audio.play();
      } else {
        this.onEnded();
      }
    });
    this.audio.addEventListener("error", () => {
      this.onError(this.url ?? "");
    });
    this.audio.addEventListener("loadedmetadata", () => {
      this.onLoaded(this.durationMs());
    });
    this.audio.addEventListener("play", () => this.onPlayStateChange(true));
    this.audio.addEventListener("pause", () => this.onPlayStateChange(false));
  }

  get isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  positionMs(): number {
    if (!Number.isFinite(this.audio.currentTime)) return 0;
    return Math.round(this.audio.currentTime * 1000);
  }

  durationMs(): number {
    if (!Number.isFinite(this.audio.duration)) return 0;
    return Math.round(this.audio.duration * 1000);
  }

  play(url: string, positionMs = 0): void {
    this.url = url;
    this.audio.src = url;
    this.audio.playbackRate = this.audio.playbackRate || 1;
    if (positionMs > 0) {
      this.audio.currentTime = positionMs / 1000;
    }
    void this.audio.play().catch(() => this.onError(url));
    this.startTicker();
  }

  toggle(): void {
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      void this.audio.play().catch(() => this.url && this.onError(this.url));
    }
  }

  pause(): void {
    this.audio.pause();
  }

  resume(): void {
    void this.audio.play().catch(() => this.url && this.onError(this.url));
  }

  seekTo(ms: number): void {
    if (Number.isFinite(this.audio.duration)) {
      this.audio.currentTime = ms / 1000;
    }
  }

  setSpeed(speed: number): void {
    try {
      this.audio.playbackRate = speed;
    } catch {
      /* unsupported rate — ignore */
    }
  }

  setRepeat(mode: RepeatMode): void {
    this.repeat = mode;
  }

  /** Preload the next surah's mp3 while the current one plays (gap reduction). */
  preloadNext(url: string | null): void {
    if (this.nextPreload) {
      this.nextPreload.removeAttribute("src");
      this.nextPreload.load();
    }
    if (url) {
      this.nextPreload = new Audio();
      this.nextPreload.preload = "auto";
      this.nextPreload.src = url;
      this.nextPreload.load();
    }
  }

  private startTicker(): void {
    if (this.ticker !== null) return;
    this.ticker = window.setInterval(() => {
      this.onPosition(this.positionMs());
    }, TICK_MS);
  }

  destroy(): void {
    if (this.ticker !== null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.nextPreload) {
      this.nextPreload.removeAttribute("src");
      this.nextPreload = null;
    }
  }
}
