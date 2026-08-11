// Text mode — the ayah list with the current ayah highlighted, auto-scrolling
// with the recitation (pin + proportional follow, mirroring the Android app).

import { createEffect } from "solid-js";
import type { TFunction } from "../../i18n/strings";
import { focusable } from "../components";

export interface TextItem {
  ayah: number; // timing index (0 = basmala header slot)
  verseKey: string | null;
  text: string;
}

interface TextModeListProps {
  t: TFunction;
  items: TextItem[];
  currentAyah: number; // timing index; -1 = no sync
  basmala: string | null; // surah basmala header (null for surah 1/9)
  fontSizePx: number;
  highlightColor: string;
  onSelectAyah: (ayah: number) => void;
}

export function TextModeList(props: TextModeListProps) {
  let listEl: HTMLDivElement | undefined;

  // Auto-scroll: keep the current ayah centered-ish (block: "center").
  createEffect(() => {
    const current = props.currentAyah;
    if (current <= 0) return;
    const id = `ayah-row-${current}`;
    const el = listEl?.querySelector(`#${id}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  const rows = (): { item: TextItem; current: boolean }[] =>
    props.items.map((item) => ({ item, current: item.ayah === props.currentAyah }));

  return (
    <div
      ref={listEl}
      class="h-scroll"
      style="flex:1;background:var(--bg);padding:24px 64px;display:flex;flex-direction:column;gap:10px"
    >
      {props.basmala ? (
        <div class="quran-text" style="text-align:center;font-size:34px;color:var(--gold);padding:18px 0 8px">
          {props.basmala}
        </div>
      ) : null}
      {rows().map(({ item, current }) => (
        <div
          id={`ayah-row-${item.ayah}`}
          use:focusable={`ayah-${item.ayah}`}
          class="quran-text"
          style={{
            "font-size": `${props.fontSizePx}px`,
            "line-height": 1.9,
            padding: "10px 22px",
            "border-radius": "12px",
            background: current ? `${props.highlightColor}4d` : "transparent",
            border: current ? `2px solid ${props.highlightColor}` : "2px solid transparent",
            cursor: "pointer",
          }}
          onClick={() => props.onSelectAyah(item.ayah)}
        >
          <span style="color:var(--gold);font-size:0.62em;margin-inline-end:14px">
            {item.verseKey ? item.verseKey.split(":")[1] : ""}
          </span>
          {item.text}
        </div>
      ))}
    </div>
  );
}
