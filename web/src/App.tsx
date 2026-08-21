import { createEffect, createMemo, createSignal, onMount, For } from "solid-js";
import "./ui/theme.css";
import { createNavigator, type Screen } from "./ui/navigation";
import { activateFocused, moveFocus } from "./ui/focus";
import { onRemoteKey } from "./ui/keys";
import { dispatchMediaKey } from "./ui/mediaKeys";
import { makeT, isRtl, type Lang } from "./i18n/strings";
import { appContainer } from "./data/AppContainer";
import { HomeScreen } from "./ui/HomeScreen";
import { SurahGridScreen } from "./ui/SurahGridScreen";
import { SettingsScreen } from "./ui/SettingsScreen";
import { PlayerScreen } from "./ui/player/PlayerScreen";
import type { Moshaf, Reciter, QuranSurah } from "./domain/Models";

export function App() {
  const c = appContainer();
  const [lang, setLang] = createSignal<Lang>(c.session.settings().language);
  const nav = createNavigator();
  const t = createMemo(() => makeT(lang()));

  function applyLang(l: Lang) {
    setLang(l);
    document.documentElement.lang = l;
    document.documentElement.dir = isRtl(l) ? "rtl" : "ltr";
  }
  onMount(() => applyLang(lang()));

  onMount(() =>
    onRemoteKey((key, raw) => {
      const target = raw.target as HTMLElement | null;
      if (target && target.tagName === "INPUT" && key === "ok") {
        // The search input handles its own Enter (open first match); arrows
        // still drive D-pad navigation so the user can leave the search bar.
        return;
      }
      switch (key) {
        case "up":
          moveFocus("up");
          break;
        case "down":
          moveFocus("down");
          break;
        case "left":
          moveFocus("left");
          break;
        case "right":
          moveFocus("right");
          break;
        case "ok":
          activateFocused();
          break;
        case "back":
          // If a dialog is open, close it instead of navigating (TV Back).
          if (document.querySelector(".dialog-scrim")) {
            window.dispatchEvent(new CustomEvent("qurantv-close-dialog"));
          } else {
            nav.back();
          }
          break;
        case "playPause":
          dispatchMediaKey("playPause");
          break;
        case "mediaNext":
          dispatchMediaKey("next");
          break;
        case "mediaPrev":
          dispatchMediaKey("prev");
          break;
        case "info":
          dispatchMediaKey("info");
          break;
        default:
          break;
      }
    }),
  );

  function openReciter(reciter: Reciter, moshaf: Moshaf) {
    nav.push({ kind: "surahs", reciter, moshaf });
  }

  const screen = createMemo(() => nav.current());

  const content = createMemo(() => {
    const s = screen();
    switch (s.kind) {
      case "home":
        return (
          <HomeScreen
            t={t()}
            lang={lang()}
            nav={nav}
            onOpenReciter={openReciter}
            onOpenSettings={() => nav.push({ kind: "settings" })}
          />
        );
      case "surahs": {
        const reciter = s.reciter;
        return (
          <SurahGridScreen
            t={t()}
            reciter={reciter}
            moshaf={s.moshaf}
            onBack={() => nav.back()}
            onMoshafChange={(moshaf) => nav.replaceTop({ kind: "surahs", reciter, moshaf })}
            onOpenSurah={(surah, available) =>
              nav.push({ kind: "player", reciter, moshaf: s.moshaf, surah, availableSurahs: available })
            }
          />
        );
      }
      case "player":
        // The player renders persistently below (retained layer) so audio
        // keeps running when the user backs out of the view.
        return null;
      case "settings":
        return (
          <SettingsScreen
            t={t()}
            lang={lang()}
            onBack={() => nav.back()}
            onLanguageChange={(l) => applyLang(l)}
          />
        );
      default:
        return null;
    }
  });

  // Retained player: the LAST player route stays mounted (hidden) when the
  // user backs out of the player view, so audio keeps running until the app
  // exits or a NEW recitation is opened (a different recitation remounts the
  // keyed layer, which stops the old audio).
  const [retainedPlayer, setRetainedPlayer] = createSignal<Extract<Screen, { kind: "player" }> | null>(null);
  createEffect(() => {
    const st = nav.stack();
    for (let i = st.length - 1; i >= 0; i--) {
      const s = st[i];
      if (s.kind === "player") {
        setRetainedPlayer(s);
        return;
      }
    }
    // Backed out of the player: keep whatever was retained (signal unchanged).
  });

  // Keyed by RECITATION identity, not route-object identity: re-opening the
  // same surah keeps the layer mounted (audio continues); a different surah /
  // reciter / moshaf / resume point remounts it (fresh recitation).
  const [playerItem, setPlayerItem] = createSignal<{ key: string; route: Extract<Screen, { kind: "player" }> } | null>(null);
  createEffect(() => {
    const p = retainedPlayer();
    if (!p) return;
    const key = playerKey(p);
    setPlayerItem((prev) => (prev && prev.key === key ? prev : { key, route: p }));
  });
  // Recitation identity for the retained-player key (remount boundary).
  const playerKey = (p: Extract<Screen, { kind: "player" }>): string =>
    `${p.reciter.id}-${p.moshaf.id}-${p.surah.id}-${p.startAyahIndex ?? ""}-${p.resumeOffsetMs ?? ""}`;

  const retainedList = createMemo(() => {
    const item = playerItem();
    return item ? [item] : [];
  });

  // Read at App level (NOT inside the For callback — For callbacks aren't
  // reactive to external signals, which left the retained chrome visible on
  // other screens).
  const playerVisible = createMemo(() => screen().kind === "player");

  return (
    <>
      {content()}
      <div
        style={playerVisible() ? "width:100%;height:100%" : "display:none"}
        aria-hidden={!playerVisible()}
      >
        <For each={retainedList()}>
          {(item) => (
            <PlayerScreen
              t={t()}
              lang={lang()}
              nav={nav}
              reciter={item.route.reciter}
              moshaf={item.route.moshaf}
              surah={item.route.surah}
              availableSurahs={item.route.availableSurahs}
              startAyahIndex={item.route.startAyahIndex}
              hidden={!playerVisible()}
            />
          )}
        </For>
      </div>
    </>
  );
}

export type { QuranSurah };
