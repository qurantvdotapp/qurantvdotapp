// Side context panel — the mushaf page stays on screen; this panel shows the
// whole surah's tafseer / word meanings / translation beside it, one ayah per
// row. The current ayah is highlighted and AUTO-SCROLLS with the recitation
// (mirrors the Android SurahContentView): rows with EMPTY content are hidden,
// and when the current ayah itself has no row the list pins to the nearest
// preceding row so it still follows the recitation.

import { createEffect, createMemo } from "solid-js";
import type { TFunction } from "../../i18n/strings";
import { TafseerRepository, type TafseerMode } from "../../data/repo/TafseerRepository";

interface SideContextPanelProps {
  t: TFunction;
  surahId: number;
  surahNameAr: string;
  mode: TafseerMode;
  currentAyah: number; // timing index; -1 = no sync (static)
  content: Map<number, { text: string; ayah: number }>;
  fontSizePx: number;
  highlightColor: string;
  onLoadError?: (msg: string) => void;
}

export function SideContextPanel(props: SideContextPanelProps) {
  let listEl: HTMLDivElement | undefined;

  // Non-empty rows in order (empty rows hidden — e.g. 2576 empty meanings rows).
  const rows = createMemo(() => {
    const out: Array<{ ayah: number; text: string }> = [];
    for (const [ayah, item] of props.content) {
      if (item.text.trim().length > 0) out.push({ ayah, text: TafseerRepository.renderText(item.text) });
    }
    return out;
  });

  // Pin: nearest preceding row for the current ayah (Android behavior).
  const pinned = createMemo(() => {
    const cur = props.currentAyah;
    if (cur < 1) return null;
    let best: { ayah: number; text: string } | null = null;
    for (const r of rows()) {
      if (r.ayah <= cur) best = r;
      else break;
    }
    return best;
  });

  // Auto-scroll with the recitation.
  createEffect(() => {
    const p = pinned();
    if (!p) return;
    const el = listEl?.querySelector(`#ctx-row-${p.ayah}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        background: "var(--bg)",
        "border-inline-start": "none",
      }}
    >
      {/* header: mode name + surah */}
      <div
        style={{
          padding: "12px 16px",
          "font-size": "20px",
          color: "var(--gold)",
          "border-bottom": "1px solid #26375c",
          "white-space": "nowrap",
          overflow: "hidden",
          "text-overflow": "ellipsis",
        }}
      >
        {modeLabel(props.mode, props.t)} · <span class="quran-text">{props.surahNameAr}</span>
      </div>
      {/* rows start at the spine (inline-start = the mushaf side) */}
      <div ref={listEl} class="h-scroll" style="flex:1;padding:10px 14px 20px 26px;display:flex;flex-direction:column;gap:8px">
        {rows().map((r) => {
          const isCurrent = pinned()?.ayah === r.ayah;
          return (
            <div
              id={`ctx-row-${r.ayah}`}
              class={props.mode === "translation" ? undefined : "content-text"}
              style={{
                "font-size": `${props.fontSizePx}px`,
                "line-height": 1.8,
                padding: "8px 12px",
                "border-radius": "10px",
                background: isCurrent ? `${props.highlightColor}4d` : "transparent",
                border: isCurrent ? `2px solid ${props.highlightColor}` : "2px solid transparent",
                "white-space": "pre-line",
              }}
            >
              <span style="color:var(--gold);font-size:0.6em;margin-inline-end:10px">{r.ayah}</span>
              {r.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function modeLabel(mode: TafseerMode, t: TFunction): string {
  switch (mode) {
    case "tafseer":
      return t("tafseer_simplified");
    case "meanings":
      return t("tafseer_word_meanings");
    case "translation":
      return t("tafseer_translation");
  }
}

export function modeShortLabel(mode: TafseerMode, t: TFunction): string {
  switch (mode) {
    case "tafseer":
      return t("view_tafseer_short");
    case "meanings":
      return t("view_meanings_short");
    case "translation":
      return t("view_translation_short");
  }
}
