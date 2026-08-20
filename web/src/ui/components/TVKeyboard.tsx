// On-screen TV keyboard for the search bar — the emulator/Tizen webview doesn't
// reliably show a native IME for a web <input>, so we render a D-pad-navigable
// keyboard. Arabic (primary) + English (toggled) layouts; each key focusable.

import { createMemo, createSignal } from "solid-js";
import { focusable } from "../components";

const ARABIC = [
  "ا", "ب", "ت", "ث", "ج", "ح", "خ",
  "د", "ذ", "ر", "ز", "س", "ش", "ص",
  "ض", "ط", "ظ", "ع", "غ", "ف", "ق",
  "ك", "ل", "م", "ن", "ه", "و", "ي",
];
const ENGLISH = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

interface TVKeyboardProps {
  value: string;
  onChar: (c: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
}

export function TVKeyboard(props: TVKeyboardProps) {
  const [arabic, setArabic] = createSignal(true);
  const keys = createMemo(() => (arabic() ? ARABIC : ENGLISH));

  return (
    <div style="padding:10px 4px 4px;display:flex;flex-direction:column;gap:10px">
      <div>
        {/* letter rows (7 per row for Arabic, 7 for English) */}
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
          {keys().map((c) => (
            <Key id={`kb-${arabic() ? "a" : "e"}-${c.charCodeAt(0)}`} label={c} onClick={() => props.onChar(c)} />
          ))}
        </div>
      </div>
      {/* control row */}
      <div style="display:flex;gap:8px;justify-content:center;align-items:center">
        <Key id="kb-toggle" label={arabic() ? "EN" : "عربي"} onClick={() => setArabic(!arabic())} />
        <Key id="kb-space" label="␣" onClick={() => props.onChar(" ")} />
        <Key id="kb-backspace" label="⌫" onClick={props.onBackspace} />
        <Key id="kb-clear" label={arabic() ? "مسح" : "Clear"} onClick={props.onClear} />
        <Key id="kb-submit" label={arabic() ? "بحث" : "Search"} accent onClick={props.onSubmit} />
      </div>
      <div style="text-align:center;font-size:15px;color:var(--text-faint)">
        {arabic() ? "اضغط على الحروف، أو أَدخل من لوحة التحكم" : "Type or use the on-screen keys"}
      </div>
    </div>
  );
}

function Key(props: { id: string; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <div
      use:focusable={props.id}
      id={props.id}
      onClick={props.onClick}
      style={{
        "min-width": "66px",
        height: "58px",
        "flex-shrink": 0,
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "font-size": "24px",
        "border-radius": "12px",
        background: props.accent
          ? "linear-gradient(180deg,#f4d488,#c9a253)"
          : "linear-gradient(180deg,var(--surface-2),var(--surface))",
        border: props.accent ? "1px solid #f4d488" : "1px solid #2a3c66",
        color: props.accent ? "#221a08" : "var(--text)",
        "box-shadow": "var(--shadow)",
        cursor: "pointer",
      }}
    >
      {props.label}
    </div>
  );
}
