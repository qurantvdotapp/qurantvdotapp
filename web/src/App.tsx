import { createSignal } from "solid-js";

/**
 * Quran TV web shell — placeholder until the real screens land (Phase B3/B4).
 * Screens: Home (reciters A-Z) → SurahGrid → Player.
 */
export function App() {
  const [ready] = createSignal(false);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        color: "#e8c877",
        "font-size": "28px",
        gap: "12px",
      }}
    >
      <div style={{ "font-size": "56px" }}>القرآن</div>
      <div>Quran TV — Tizen · Vidaa port shell ({ready() ? "ready" : "booting"})</div>
    </div>
  );
}
