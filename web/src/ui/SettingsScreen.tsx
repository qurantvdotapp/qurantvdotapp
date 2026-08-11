// Settings screen — language, default speed, font size, highlight color,
// auto-hide controls, only-timed-reciters (mirrors the Android settings).

import { createSignal, Show } from "solid-js";
import type { Lang, TFunction } from "../i18n/strings";
import { appContainer } from "../data/AppContainer";
import type { AppSettings } from "../data/repo/SessionRepository";
import { Chip, Dialog, DialogRow , focusable } from "./components";
import { focusFirst } from "./focus";

interface SettingsProps {
  t: TFunction;
  lang: Lang;
  onBack: () => void;
  onLanguageChange: (lang: Lang) => void;
}

export function SettingsScreen(props: SettingsProps) {
  const c = appContainer();
  const [settings, setSettings] = createSignal<AppSettings>(c.session.settings());
  const [dialog, setDialog] = createSignal<null | "language" | "speed" | "font" | "color" | "display" | "mushaf" | "misc">(null);

  function update(patch: Partial<AppSettings>) {
    const next = { ...settings(), ...patch };
    setSettings(next);
    // persist each field through the repository
    if ("language" in patch) c.session.setLanguage(next.language as Lang);
    if ("defaultSpeed" in patch) c.session.setDefaultSpeed(next.defaultSpeed);
    if ("fontSizeIndex" in patch) c.session.setFontSize(next.fontSizeIndex);
    if ("highlightColorIndex" in patch) c.session.setHighlightColor(next.highlightColorIndex);
    if ("displayMode" in patch) c.session.setDisplayMode(next.displayMode);
    if ("mushafStyle" in patch) c.session.setMushafStyle(next.mushafStyle);
    if ("autoHideControls" in patch) c.session.setAutoHideControls(next.autoHideControls);
    if ("onlyTimedReciters" in patch) c.session.setOnlyTimedReciters(next.onlyTimedReciters);
  }

  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const fontOptions = ["font_small", "font_normal", "font_large"] as const;
  const colorOptions = ["#e8c877", "#7fd1a3", "#7ac7e0"];

  function openDialog(name: NonNullable<ReturnType<typeof dialog>>) {
    setDialog(name);
    setTimeout(() => {
      const listEl = document.querySelector(".dialog-list");
      if (listEl) focusFirst(listEl);
    }, 80);
  }

  return (
    <div class="screen">
      <div style="display:flex;align-items:center;gap:20px;padding-bottom:18px">
        <Chip id="set-back" label="←" onClick={() => props.onBack()} />
        <h1 style="margin:0;font-size:40px;color:var(--gold)">{props.t("settings")}</h1>
      </div>

      <div class="h-scroll" style="display:flex;flex-direction:column;gap:14px;max-width:1100px">
        <Row id="set-lang" label={props.t("language")} value={props.lang === "ar" ? props.t("arabic") : props.t("english")} onClick={() => openDialog("language")} />
        <Row id="set-speed" label={props.t("default_speed")} value={`${settings().defaultSpeed}×`} onClick={() => openDialog("speed")} />
        <Row id="set-font" label={props.t("font_size")} value={props.t(fontOptions[settings().fontSizeIndex])} onClick={() => openDialog("font")} />
        <Row id="set-color" label={props.t("highlight_color")} value="●" onClick={() => openDialog("color")} />
        <Row id="set-display" label={props.t("display_mode")} value={settings().displayMode === 1 ? props.t("page_mode") : props.t("text_mode")} onClick={() => openDialog("display")} />
        <Row id="set-mushaf" label={props.t("mushaf_style")} value={mushafLabel(settings().mushafStyle, props.t)} onClick={() => openDialog("mushaf")} />
        <Row id="set-autohide" label={props.t("auto_hide")} value={settings().autoHideControls ? props.t("option_on") : props.t("option_off")} onClick={() => update({ autoHideControls: !settings().autoHideControls })} />
        <Row id="set-timed" label={props.t("only_timed_reciters")} value={settings().onlyTimedReciters ? props.t("option_on") : props.t("option_off")} onClick={() => update({ onlyTimedReciters: !settings().onlyTimedReciters })} />
      </div>

      <Show when={dialog() === "language"}>
        <Dialog title={props.t("language")} onClose={() => setDialog(null)}>
          <div class="dialog-list">
            <DialogRow id="lang-ar" label={props.t("arabic")} checked={props.lang === "ar"} onClick={() => { setDialog(null); update({ language: "ar" }); props.onLanguageChange("ar"); }} />
            <DialogRow id="lang-en" label={props.t("english")} checked={props.lang === "en"} onClick={() => { setDialog(null); update({ language: "en" }); props.onLanguageChange("en"); }} />
          </div>
        </Dialog>
      </Show>

      <Show when={dialog() === "speed"}>
        <Dialog title={props.t("default_speed")} onClose={() => setDialog(null)}>
          <div class="dialog-list">
            {speedOptions.map((s) => (
              <DialogRow id={`spd-${s}`} label={`${s}×`} checked={settings().defaultSpeed === s} onClick={() => { setDialog(null); update({ defaultSpeed: s }); }} />
            ))}
          </div>
        </Dialog>
      </Show>

      <Show when={dialog() === "font"}>
        <Dialog title={props.t("font_size")} onClose={() => setDialog(null)}>
          <div class="dialog-list">
            {fontOptions.map((k, i) => (
              <DialogRow id={`font-${i}`} label={props.t(k)} checked={settings().fontSizeIndex === i} onClick={() => { setDialog(null); update({ fontSizeIndex: i }); }} />
            ))}
          </div>
        </Dialog>
      </Show>

      <Show when={dialog() === "color"}>
        <Dialog title={props.t("highlight_color")} onClose={() => setDialog(null)}>
          <div class="dialog-list" style="display:flex;gap:14px;flex-wrap:wrap;padding:16px 28px">
            {colorOptions.map((hex, i) => (
              <div
                use:focusable={`col-${i}`}
                style={`width:90px;height:90px;border-radius:50%;background:${hex};border:3px solid ${settings().highlightColorIndex === i ? "#fff" : "transparent"}`}
                onClick={() => { setDialog(null); update({ highlightColorIndex: i }); }}
              />
            ))}
          </div>
        </Dialog>
      </Show>

      <Show when={dialog() === "display"}>
        <Dialog title={props.t("display_mode")} onClose={() => setDialog(null)}>
          <div class="dialog-list">
            <DialogRow id="dm-text" label={props.t("text_mode")} checked={settings().displayMode === 0} onClick={() => { setDialog(null); update({ displayMode: 0 }); }} />
            <DialogRow id="dm-page" label={props.t("page_mode")} checked={settings().displayMode === 1} onClick={() => { setDialog(null); update({ displayMode: 1 }); }} />
          </div>
        </Dialog>
      </Show>

      <Show when={dialog() === "mushaf"}>
        <Dialog title={props.t("mushaf_style")} onClose={() => setDialog(null)}>
          <div class="dialog-list">
            {[0, 1, 2, 3, 4, 5].map((style) => (
              <DialogRow
                id={`ms-${style}`}
                label={mushafLabel(style, props.t)}
                checked={settings().mushafStyle === style}
                onClick={() => { setDialog(null); update({ mushafStyle: style }); }}
              />
            ))}
          </div>
        </Dialog>
      </Show>
    </div>
  );
}

function Row(props: { id: string; label: string; value: string; onClick: () => void }) {
  return (
    <div use:focusable={props.id} class="tv-card" onClick={() => props.onClick()} style="justify-content:space-between">
      <span>{props.label}</span>
      <span style="color:var(--gold)">{props.value}</span>
    </div>
  );
}

function mushafLabel(style: number, t: TFunction): string {
  switch (style) {
    case 0:
      return t("mushaf_madinah");
    case 1:
      return t("mushaf_tajweed");
    case 2:
      return t("mushaf_madinah_hd");
    case 3:
      return t("mushaf_ayat_hafs");
    case 4:
      return t("mushaf_ayat_warsh");
    default:
      return t("mushaf_hafs_tajweed");
  }
}
