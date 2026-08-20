// Web audio engine — HTML5 <audio> wrapper with a 100 ms ticker + GAPLESS
// surah handoff (Phase-1 G1). Mirrors the Android PlaybackController's role.
//
// Two elements: CURRENT (plays now) and CARRIER (idle buffer for the next
// surah). When CURRENT nears its end (repeat=OFF and a next was prepared via
// prepareGapless), the CARRIER is started muted and crossfaded in while
// CURRENT fades out (~650 ms); on CURRENT's 'ended' the roles swap and
// onGaplessAdvanced(url) fires so the player attaches the new surah's state
// WITHOUT re-preparing audio (like ExoPlayer's attachSurah). prepareGapless
// always loads the next into the IDLE element, so a playing surah is never
// clobbered. If no next is prepared, 'ended' fires onEnded() (genuine end).

import type { RepeatMode } from "./RepeatMode";

const TICK_MS = 100;
const CROSSFADE_MS = 650;
const NEAR_END_GUARD_S = 0.9;

export class AudioEngine {
  private readonly a = new Audio();
  private readonly b = new Audio();
  private current: HTMLAudioElement;
  private carrier: HTMLAudioElement;
  private gaplessUrl: string | null = null;
  private transitioning = false;
  private ticker: number | null = null;
  private url: string | null = null;
  private fadeTimer: number | null = null;
  private repeat: RepeatMode = "off";

  onPosition: (ms: number) => void = () => {};
  onEnded: () => void = () => {};
  onGaplessAdvanced: (url: string) => void = () => {};
  onError: (url: string) => void = () => {};
  onLoaded: (durationMs: number) => void = () => {};
  onPlayStateChange: (playing: boolean) => void = () => {};

  constructor() {
    this.current = this.a;
    this.carrier = this.b;
    for (const el of [this.a, this.b]) {
      el.preload = "auto";
      el.style.display = "none";
      el.setAttribute("data-qurantv-audio", "true");
      if (document.body) document.body.appendChild(el);
      // events fire for whichever element is CURRENT
      el.addEventListener("play", () => this.onPlayStateChange(true));
      el.addEventListener("pause", () => this.onPlayStateChange(false));
      el.addEventListener("loadedmetadata", () => this.onLoaded(this.durationMs()));
      el.addEventListener("ended", () => this.handleEnded(el));
      el.addEventListener("timeupdate", () => this.maybeCrossfade(el));
      el.addEventListener("error", () => this.onError(this.playingUrl()));
    }
  }

  get isPlaying(): boolean {
    return !this.current.paused && !this.current.ended;
  }

  private playingUrl(): string {
    return this.current.src || this.url || "";
  }

  positionMs(): number {
    const c = this.current;
    return Number.isFinite(c.currentTime) ? Math.round(c.currentTime * 1000) : 0;
  }

  durationMs(): number {
    if (!Number.isFinite(this.current.duration)) return 0;
    return Math.round(this.current.duration * 1000);
  }

  play(url: string, positionMs = 0): void {
    this.stopTransition();
    // Fresh start: A plays now, B is the carrier for the next surah.
    this.current = this.a;
    this.carrier = this.b;
    this.gaplessUrl = null;
    this.a.src = url;
    this.a.volume = 1;
    this.a.playbackRate = this.a.playbackRate || 1;
    if (positionMs > 0) this.a.currentTime = positionMs / 1000;
    this.b.pause();
    this.b.removeAttribute("src");
    this.b.load();
    this.b.volume = 1;
    this.url = url;
    void this.a.play().catch(() => this.onError(url));
    this.startTicker();
  }

  /** Preload + buffer the next surah into the IDLE element for a gapless handoff. */
  prepareGapless(url: string | null): void {
    if (this.repeat !== "off") {
      this.carrier.pause();
      this.carrier.removeAttribute("src");
      this.carrier.load();
      this.gaplessUrl = null;
      return;
    }
    this.gaplessUrl = url;
    const c = this.carrier;
    if (!url) {
      c.pause();
      c.removeAttribute("src");
      c.load();
      c.volume = 1;
      return;
    }
    c.src = url;
    c.volume = 0; // buffer silently; ramps at the crossfade
    c.load();
  }

  toggle(): void {
    if (this.isPlaying) this.pause();
    else this.resume();
  }

  pause(): void {
    this.current.pause();
  }

  resume(): void {
    void this.current.play().catch(() => this.onError(this.url ?? ""));
  }

  seekTo(ms: number): void {
    const c = this.current;
    if (Number.isFinite(c.duration)) c.currentTime = ms / 1000;
  }

  setSpeed(speed: number): void {
    for (const el of [this.a, this.b]) {
      try {
        el.playbackRate = speed;
      } catch {
        /* ignore */
      }
    }
  }

  setRepeat(mode: RepeatMode): void {
    this.repeat = mode;
    if (mode !== "off") {
      this.gaplessUrl = null;
      this.carrier.pause();
      this.carrier.removeAttribute("src");
      this.carrier.load();
    }
  }

  private handleEnded(el: HTMLAudioElement): void {
    if (this.repeat === "surah" && el === this.current) {
      el.currentTime = 0;
      void el.play();
      return;
    }
    // CURRENT ended during an active crossfade → finalize the handoff.
    if (this.transitioning) {
      this.finishHandoff();
      return;
    }
    // Genuine end (no gapless next) → notify the player.
    if (!this.gaplessUrl || this.repeat !== "off") {
      if (el === this.current) this.onEnded();
      return;
    }
    // Near-end crossfade never started (unknown duration): hand off now.
    if (el === this.current) this.finishHandoff();
  }

  private maybeCrossfade(el: HTMLAudioElement): void {
    if (this.repeat !== "off" || this.transitioning || !this.gaplessUrl || el !== this.current) return;
    if (el === this.carrier) return;
    if (!Number.isFinite(el.duration) || el.duration <= 0) return;
    const remaining = el.duration - el.currentTime;
    if (remaining > 0 && remaining <= NEAR_END_GUARD_S) {
      this.startCrossfade();
    }
  }

  private startCrossfade(): void {
    if (this.transitioning) return;
    const url = this.gaplessUrl;
    if (!url) return;
    this.transitioning = true;
    const from = this.current;
    const to = this.carrier;
    void to.play().catch(() => this.onError(url));
    to.volume = 0;
    to.playbackRate = from.playbackRate || 1;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / CROSSFADE_MS);
      to.volume = t;
      if (from === this.current) from.volume = 1 - t;
      if (t < 1) {
        this.fadeTimer = window.setTimeout(step, 16);
      } else {
        this.fadeTimer = null;
        // from's 'ended' event finalizes the handoff.
      }
    };
    step();
  }

  private finishHandoff(): void {
    this.stopTransition();
    const url = this.gaplessUrl;
    // Swap roles: the carrier becomes CURRENT; the old current becomes idle.
    const newCurrent = this.carrier;
    const oldCurrent = this.current;
    newCurrent.volume = 1;
    this.current = newCurrent;
    this.carrier = oldCurrent;
    this.gaplessUrl = null;
    oldCurrent.pause();
    oldCurrent.removeAttribute("src");
    oldCurrent.load();
    oldCurrent.volume = 1;
    this.url = url;
    if (url) this.onGaplessAdvanced(url);
    else this.onEnded();
  }

  private stopTransition(): void {
    if (this.fadeTimer !== null) {
      window.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.transitioning = false;
  }

  private startTicker(): void {
    if (this.ticker !== null) return;
    this.ticker = window.setInterval(() => this.onPosition(this.positionMs()), TICK_MS);
  }

  destroy(): void {
    if (this.ticker !== null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
    this.stopTransition();
    for (const el of [this.a, this.b]) {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.volume = 1;
    }
  }
}
