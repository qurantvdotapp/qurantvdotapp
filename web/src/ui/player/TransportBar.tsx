// Transport bar — three D-pad zones (mirrors the Android layout):
// LEFT [jump · speed · repeat · time] · CENTER [next-su · next-ay · play ·
// prev-ay · prev-su] · RIGHT [no-timing · eye · reciter · side view · mushaf].
// The cluster DOM order is emitted reversed in RTL so the physical order stays
// identical in both UI languages (same trick as the Android composable).

import { createUniqueId } from "solid-js";
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

  const cluster: Record<string, { label: string; onClick: () => void; big?: boolean; active?: boolean }> = {
    play: {
      label: props.playing ? "⏸" : "▶",
      onClick: props.onTogglePlay,
      big: true,
    },
    nextAyah: { label: "⏭", onClick: props.onNextAyah },
    prevAyah: { label: "⏮", onClick: props.onPrevAyah },
    nextSurah: { label: "⏩", onClick: props.onNextSurah },
    prevSurah: { label: "⏪", onClick: props.onPrevSurah },
  };

  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        gap: "16px",
        padding: "16px 32px",
        background: "var(--surface)",
        "border-top": "1px solid #26375c",
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
        {clusterOrder.map((key) => {
          const c = cluster[key];
          return (
            <IconBtn
              id={btn(key)}
              label={c.label}
              onClick={c.onClick}
              big={c.big}
              active={c.active}
            />
          );
        })}
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
  label: string;
  onClick: () => void;
  big?: boolean;
  active?: boolean;
}) {
  const playStyle =
    props.label === "▶" || props.label === "⏸"
      ? "width:100px;height:100px;font-size:42px;border-radius:50%;background:linear-gradient(180deg,#f4d488,#c9a253);border:1px solid #f4d488;color:#221a08;box-shadow:0 6px 20px rgba(232,200,119,0.35)"
      : undefined;
  return (
    <div
      use:focusable={props.id}
      class={`icon-btn ${props.active ? "active" : ""}`}
      style={props.big ? (playStyle ?? "width:96px;height:96px;font-size:40px;border-radius:18px") : playStyle}
      onClick={() => props.onClick()}
    >
      {props.label}
    </div>
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
