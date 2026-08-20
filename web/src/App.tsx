import { createMemo, createSignal, onMount } from "solid-js";
import "./ui/theme.css";
import { createNavigator } from "./ui/navigation";
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
      if (target && target.tagName === "INPUT") {
        // A text field has DOM focus (search): let it handle typing, caret
        // moves and its own Enter; still keep media/back keys working.
        if (key === "up" || key === "down" || key === "left" || key === "right" || key === "ok") {
          return;
        }
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
        return (
          <PlayerScreen
            t={t()}
            lang={lang()}
            nav={nav}
            reciter={s.reciter}
            moshaf={s.moshaf}
            surah={s.surah}
            availableSurahs={s.availableSurahs}
            startAyahIndex={s.startAyahIndex}
          />
        );
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

  return <>{content()}</>;
}

export type { QuranSurah };
