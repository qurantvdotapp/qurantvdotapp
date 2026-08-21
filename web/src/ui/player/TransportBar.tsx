// Transport bar — three D-pad zones (mirrors the Android layout):
// LEFT [jump · speed · repeat · time] · CENTER [next-su · next-ay · play ·
// prev-ay · prev-su] · RIGHT [no-timing · eye · reciter · side view · mushaf].
// The cluster DOM order is emitted reversed in RTL so the physical order stays
// identical in both UI languages (same trick as the Android composable).

import { createMemo, createUniqueId } from "solid-js";
import type { JSX } from "solid-js";
import type { TFunction } from "../../i18n/strings";
import { formatTime, focusable } from "../components";

interface TransportBarProps {
  t: TFunction;
  rtl: boolean;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  repeat: string;
  speed: number;
  hasTiming: boolean;
  mushafLabel: string;
  /** Side-view label (مصحف/تفسير/معاني/ترجمة); null hides the button in text mode. */
  sideViewLabel: string | null;
  autoHide: boolean;
  onTogglePlay: () => void;
  onNextAyah: () => void;
  onPrevAyah: () => void;
  onNextSurah: () => void;
  onPrevSurah: () => void;
  onCycleRepeat: () => void;
  onCycleSpeed: () => void;
  onOpenSurahJump: () => void;
  onToggleAutoHide: () => void;
  onOpenReciterPicker: () => void;
  onOpenMushafPicker: () => void;
  onOpenViewPicker: () => void;
}

export function TransportBar(props: TransportBarProps) {
  const id = createUniqueId();
  const btn = (key: string) => `tb-${id}-${key}`;

  // Physical order: next · play · prev (next LEFT of play in RTL — the
  // Android-verified layout). DOM order is the reverse of physical in RTL.
  const clusterOrder = props.rtl
    ? ["prevSurah", "prevAyah", "play", "nextAyah", "nextSurah"]
    : ["nextSurah", "nextAyah", "play", "prevAyah", "prevSurah"];

  // Play/pause icon. Read props.playing DIRECTLY in the render (same pattern
  // as the position text): a top-level createMemo over the prop didn't
  // re-evaluate in this Solid build, leaving the icon stuck on play.
  const icon = (key: string): string | null => {
    switch (key) {
      case "play":
        return props.playing ? "pause" : "play";
      case "nextAyah":
        return "skipNext";
      case "prevAyah":
        return "skipPrev";
      case "nextSurah":
        return "fastNext";
      case "prevSurah":
        return "fastPrev";
    }
    return null;
  };

  const onClick = (key: string): (() => void) => {
    switch (key) {
      case "play": return props.onTogglePlay;
      case "nextAyah": return props.onNextAyah;
      case "prevAyah": return props.onPrevAyah;
      case "nextSurah": return props.onNextSurah;
      case "prevSurah": return props.onPrevSurah;
    }
    return () => {};
  };

  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        gap: "16px",
        padding: "16px 32px",
        background: "rgba(13, 26, 51, 0.72)", // semi-transparent over the mushaf
        "backdrop-filter": "blur(6px)",
        "-webkit-backdrop-filter": "blur(6px)",
        "border-top": "1px solid rgba(51, 72, 122, 0.5)",
        "min-height": "110px",
      }}
    >
      {/* LEFT zone */}
      <div style="display:flex;align-items:center;gap:12px;flex:1">
        <IconBtn id={btn("jump")} label={props.t("jump_to_surah_short")} onClick={props.onOpenSurahJump} />
        <IconBtn id={btn("speed")} label={`${props.speed}×`} onClick={props.onCycleSpeed} />
        <IconBtn id={btn("repeat")} label={repeatGlyph(props.repeat)} active={props.repeat !== "off"} onClick={props.onCycleRepeat} />
        <span style="font-size:20px;color:var(--text-dim);white-space:nowrap;font-variant-numeric:tabular-nums">
          {formatTime(props.positionMs)} / {formatTime(props.durationMs)}
        </span>
      </div>

      {/* CENTER zone */}
      <div style="display:flex;align-items:center;gap:12px;justify-content:center;flex:1.2">
        {clusterOrder.map((key) => (
          <IconBtn
            id={key === "play" ? "transport-play" : btn(key)}
            icon={icon(key)}
            onClick={onClick(key)}
            big={key === "play"}
          />
        ))}
      </div>

      {/* RIGHT zone */}
      <div style="display:flex;align-items:center;gap:12px;justify-content:flex-end;flex:1">
        {!props.hasTiming ? (
          <span class="badge" style="font-size:18px;color:var(--danger);border-color:var(--danger)">
            {props.t("no_timing_short")}
          </span>
        ) : null}
        <IconBtn
          id={btn("eye")}
          label={props.autoHide ? "👁" : "🚫"}
          active={props.autoHide}
          onClick={props.onToggleAutoHide}
        />
        <IconBtn id={btn("reciter")} label="🎤" onClick={props.onOpenReciterPicker} />
        {props.sideViewLabel !== null ? (
          <IconBtn id={btn("view")} label={props.sideViewLabel} onClick={props.onOpenViewPicker} />
        ) : null}
        <IconBtn id={btn("mushaf")} label={props.mushafLabel} onClick={props.onOpenMushafPicker} />
      </div>
    </div>
  );
}

function IconBtn(props: {
  id: string;
  label?: string;
  icon?: string | null;
  onClick: () => void;
  big?: boolean;
  active?: boolean;
}) {
  return (
    <div
      use:focusable={props.id}
      class={`icon-btn ${props.active ? "active" : ""}`}
      classList={{ big: props.big }}
      onClick={() => props.onClick()}
    >
      {props.icon ? <TbIcon name={props.icon} /> : props.label}
    </div>
  );
}

/** Crisp SVG transport icons (replace the old emoji glyphs). Directional
 *  icons are wrapped in .tb-dir — flipped by CSS in RTL so "next" always
 *  points the direction of travel. */
function TbIcon(props: { name: string }) {
  const directional = props.name === "skipNext" || props.name === "skipPrev" || props.name === "fastNext" || props.name === "fastPrev";
  // Memo, not a body switch: the icon must swap live (play ↔ pause) when the
  // name prop changes — a plain switch in the body runs only once.
  const inner = createMemo<JSX.Element>(() => {
    switch (props.name) {
      case "pause":
        return (
          <>
            <rect x="6" y="5" width="4.6" height="14" rx="1.3" />
            <rect x="13.4" y="5" width="4.6" height="14" rx="1.3" />
          </>
        );
      case "skipNext":
        return (
          <>
            <path d="M5.5 5.5v13L15 12z" />
            <rect x="17.2" y="5.5" width="2.2" height="13" rx="1" />
          </>
        );
      case "skipPrev":
        return (
          <>
            <path d="M18.5 5.5v13L9 12z" />
            <rect x="4.6" y="5.5" width="2.2" height="13" rx="1" />
          </>
        );
      case "fastNext":
        return (
          <>
            <path d="M3.8 5.5v13L12 12z" />
            <path d="M12 5.5v13l8.2-6.5z" />
          </>
        );
      case "fastPrev":
        return (
          <>
            <path d="M20.2 5.5v13L12 12z" />
            <path d="M12 5.5v13L3.8 12z" />
          </>
        );
      default: // play
        return <path d="M8 5.5v13l11-6.5z" />;
    }
  });
  return (
    <span class={directional ? "tb-dir" : undefined} style="display:inline-flex">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:block;width:100%;height:100%">
        {inner()}
      </svg>
    </span>
  );
}

function repeatGlyph(repeat: string): string {
  switch (repeat) {
    case "ayah":
      return "⟲ 1";
    case "surah":
      return "⟲ ∞";
    default:
      return "⇄";
  }
}
