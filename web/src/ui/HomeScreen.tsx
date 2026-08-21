// Home screen — header with an inline SEARCH BAR (focused on load), Continue
// card, Favourites row, reciters A–Z (wrapped chips per letter, Amiri names),
// letter rail. Typing in the search bar filters the list live (Arabic + English);
// Enter opens the first match. Favourites are toggled on the reciter's surah
// page (not per-chip stars here).

import { createMemo, createSignal, onMount, Show } from "solid-js";
import type { Moshaf, Reciter } from "../domain/Models";
import { reciterMatchesQuery } from "../domain/search";
import { arabicCollator, type TFunction } from "../i18n/strings";
import type { LastSession } from "../data/repo/SessionRepository";
import { appContainer } from "../data/AppContainer";
import { Chip, Dialog, DialogRow, ErrorState, LoadingState, TvCard, focusable } from "./components";
import { TVKeyboard } from "./components/TVKeyboard";
import { focusFirst, focusElement, focusedId } from "./focus";
import type { Navigator } from "./navigation";

interface HomeProps {
  t: TFunction;
  lang: "ar" | "en";
  nav: Navigator;
  onOpenReciter: (reciter: Reciter, moshaf: Moshaf) => void;
  onOpenSettings: () => void;
}

export function HomeScreen(props: HomeProps) {
  const c = appContainer();
  const [reciters, setReciters] = createSignal<Reciter[] | null>(null);
  const [error, setError] = createSignal(false);
  const [timedUrls, setTimedUrls] = createSignal<Set<string>>(new Set());
  const [query, setQuery] = createSignal("");
  const [session] = createSignal<LastSession | null>(c.session.lastSession());
  const [recent, setRecent] = createSignal<Reciter[] | null>(null);
  const [favourites, setFavourites] = createSignal<Set<number>>(c.session.favouriteReciterIds());

  let searchInput: HTMLInputElement | undefined;

  async function load() {
    setError(false);
    setReciters(null);
    try {
      const settings = c.session.settings();
      const [all, timed] = await Promise.all([c.catalog.reciters(props.lang), c.timing.timedServerUrls()]);
      setTimedUrls(timed);
      const filtered = settings.onlyTimedReciters
        ? all
            .map((r) => ({
              ...r,
              moshafs: r.moshafs.filter((m) => timed.has(normalizeServer(m.server))),
            }))
            .filter((r) => r.moshafs.length > 0)
        : all;
      setReciters(filtered);
      try {
        setRecent(await c.catalog.recentReads());
      } catch {
        setRecent(null);
      }
      // Initial focus: the CONTINUE LISTENING card when a session exists
      // (per user request), otherwise the search bar.
      setTimeout(() => {
        if (c.session.lastSession()) {
          focusElement("home-continue");
        } else {
          searchInput?.focus();
          focusElement("home-search");
        }
      }, 150);
    } catch {
      setError(true);
    }
  }

  onMount(load);

  const collator = createMemo(() => arabicCollator());

  const groups = createMemo(() => {
    const list = reciters();
    if (!list) return [];
    const byLetter = new Map<string, Reciter[]>();
    for (const r of list) {
      const letter = r.letter ?? "؟";
      const arr = byLetter.get(letter) ?? [];
      arr.push(r);
      byLetter.set(letter, arr);
    }
    const letters = [...byLetter.keys()].sort((a, b) => collator().compare(a, b));
    return letters.map((letter) => ({
      letter,
      reciters: byLetter.get(letter)!.slice().sort((a, b) => collator().compare(a.name, b.name)),
    }));
  });

  function reciterTimed(r: Reciter): boolean {
    const timed = timedUrls();
    return r.moshafs.some((m) => timed.has(normalizeServer(m.server)));
  }

  const favouritesList = createMemo(() => {
    const list = reciters();
    if (!list) return [];
    const favs = favourites();
    return list.filter((r) => favs.has(r.id)).sort((a, b) => collator().compare(a.name, b.name));
  });

  const searching = createMemo(() => query().trim().length > 0);
  const [kbOpen, setKbOpen] = createSignal(false);

  function openKb() {
    setKbOpen(true);
    setTimeout(() => {
      const first = document.querySelector("[data-focus-id^='kb-']");
      if (first) focusElement(first.getAttribute("data-focus-id") ?? "");
    }, 80);
  }

  function kbChar(c: string) {
    // Stay on the keyboard — bouncing focus to the search bar after every
    // letter stranded the user (the next D-pad press left the keyboard).
    setQuery((q) => q + c);
  }
  function kbBackspace() {
    setQuery((q) => q.slice(0, -1));
  }
  function kbClear() {
    setQuery("");
  }

  /** Live-filtered results (Arabic normalized + English case-insensitive). */
  const filtered = createMemo(() => {
    const list = reciters();
    if (!list) return [];
    const q = query().trim();
    if (q.length === 0) return [];
    const results = list.filter((r) => reciterMatchesQuery(r, q));
    return results.sort((a, b) => collator().compare(a.name, b.name));
  });

  function openFirstMatch() {
    const list = filtered();
    if (list.length === 0) return;
    openReciter(list[0]);
  }

  function openReciter(reciter: Reciter) {
    // (Don't setQuery synchronously here — navigating away unmounts Home, and a
    // mid-click re-render of the search Show while the chooser/routing runs
    // triggers a SolidJS stale-read.)
    // Close the on-screen keyboard: the moshaf chooser (and surah grid) must
    // not open behind it, and the keyboard's dialog scrim would trap D-pad
    // focus inside the chooser (only the first mushaf row was reachable).
    setKbOpen(false);
    // A reciter with MULTIPLE mushafs always shows the moshaf picker first,
    // then the surah selection page for the chosen moshaf.
    if (reciter.moshafs.length > 1) {
      openMoshafChooser(reciter);
      return;
    }
    const moshaf = reciter.moshafs[0];
    if (!moshaf) return;
    props.onOpenReciter(reciter, moshaf);
  }

  const [chooser, setChooser] = createSignal<Reciter | null>(null);

  /** Letter rail: scroll to the group and land focus on its first reciter. */
  function jumpToLetter(letter: string) {
    document.getElementById(`group-${letter}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    window.setTimeout(() => {
      const group = document.getElementById(`group-${letter}`);
      const first = group?.querySelector<HTMLElement>("[data-focus-id]");
      if (first) focusElement(first.getAttribute("data-focus-id") ?? "");
    }, 300);
  }

  function openMoshafChooser(reciter: Reciter) {
    setChooser(reciter);
    setTimeout(() => {
      const listEl = document.querySelector(".dialog-list");
      if (listEl) focusFirst(listEl);
    }, 50);
  }

  function continueResume() {
    const s = session();
    if (!s) return;
    void c.catalog.reciters(props.lang).then((all) => {
      const reciter = all.find((r) => r.id === s.reciterId);
      if (!reciter) return;
      const moshaf = reciter.moshafs.find((m) => m.id === s.moshafId) ?? reciter.moshafs[0];
      if (!moshaf) return;
      void c.catalog.surahs(props.lang).then((surahs) => {
        const surah = surahs.find((x) => x.id === s.surahId);
        if (!surah) return;
        props.nav.push({
          kind: "player",
          reciter,
          moshaf,
          surah,
          availableSurahs: surahs,
          startAyahIndex: s.ayahIndex,
        });
      });
    });
  }

  return (
    <div class="screen">
      {/* header: app name + SEARCH BAR + settings */}
      <div style="display:flex;align-items:center;gap:20px;padding-bottom:18px">
        <h1 style="margin:0;font-size:40px;font-weight:700;color:var(--gold);white-space:nowrap">{props.t("app_name")}</h1>
        <div
          use:focusable="home-search"
          id="home-search-bar"
          style={`flex:1;display:flex;align-items:center;gap:12px;background:linear-gradient(180deg,var(--surface-2),var(--surface));border:1px solid #2a3c66;border-radius:16px;padding:10px 18px;box-shadow:var(--shadow);min-width:0`}
        >
          <span style="font-size:20px;color:var(--gold)">🔍</span>
          <div
            use:focusable="home-search-open"
            onClick={openKb}
            style="cursor:pointer;font-size:22px;color:var(--gold);padding:4px 8px"
          >⌨</div>
          <input
            ref={searchInput}
            id="search-input"
            value={query()}
            onClick={openKb}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onFocus={() => focusElement("home-search")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                openFirstMatch();
              }
            }}
            placeholder={props.t("search_hint")}
            style="flex:1;min-width:0;background:transparent;border:none;outline:none;color:var(--text);font-size:24px"
          />
          <Show when={filtered().length > 0}>
            <span style="font-size:15px;color:var(--text-dim);white-space:nowrap">{filtered().length} · {props.t("reciters_title")}</span>
          </Show>
        </div>
        <Chip id="home-settings" label={props.t("settings")} onClick={() => props.onOpenSettings()} />
      </div>

      {/* on-screen TV keyboard — a POPUP, opened on click, closed on exit */}
      <Show when={kbOpen()}>
        <Dialog title={props.t("search_reciters")} alignBottom onClose={() => setKbOpen(false)}>
          <TVKeyboard
            value={query()}
            onChar={kbChar}
            onBackspace={kbBackspace}
            onClear={kbClear}
            onSubmit={() => {
              setKbOpen(false);
              openFirstMatch();
            }}
            onClose={() => setKbOpen(false)}
          />
        </Dialog>
      </Show>

      {/* recently added reads — ONE row */}
      <Show when={!searching() && recent() !== null && recent()!.length > 0}>
        <div style="margin-bottom:18px">
          <div style="font-size:22px;color:var(--text-dim);padding-bottom:8px">{props.t("recent_reads")}</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
            {recent()!.slice(0, 5).map((r) => (
              <div
                use:focusable={`recent-${r.id}`}
                id={`recent-${r.id}`}
                class="tv-card qurantv-rec-cell content-text"
                classList={{ dim: props.lang === "ar" ? !reciterTimed(r) : false }}
                style="padding:14px;justify-content:center;text-align:center;font-size:24px;min-height:74px"
                onClick={() => openReciter(r)}
              >
                {r.name}
              </div>
            ))}
          </div>
        </div>
      </Show>

      {/* continue card */}
      <Show when={!searching() && session()}>
        {(s) => (
          <TvCard id="home-continue" onClick={continueResume} style="margin-bottom:18px">
            <span style="font-size:32px">▶</span>
            <div>
              <div style="font-size:18px;color:var(--text-dim)">{props.t("continue_listening")}</div>
              <div>
                {s().reciterName} · <span class="quran-text">{s().surahNameAr}</span>
              </div>
            </div>
          </TvCard>
        )}
      </Show>

      {/* favourites */}
      <Show when={!searching() && favouritesList().length > 0}>
        <div id="favourites-row" style="padding-bottom:18px">
          <div style="font-size:24px;font-weight:700;color:var(--gold);padding-bottom:8px">★ {props.lang === "ar" ? "المفضلة" : "Favourites"}</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
            {favouritesList().map((r) => (
              <div
                use:focusable={`fav-${r.id}`}
                id={`fav-${r.id}`}
                class="tv-card qurantv-rec-cell content-text"
                style="padding:14px;justify-content:center;text-align:center;font-size:24px;min-height:74px"
                onClick={() => openReciter(r)}
              >
                {r.name}
              </div>
            ))}
          </div>
        </div>
      </Show>

      {/* body: search results OR the grouped list */}
      {error() ? (
        <ErrorState t={props.t} onRetry={load} />
      ) : reciters() === null ? (
        <LoadingState t={props.t} />
      ) : searching() ? (
        <div class="h-scroll" style="flex:1">
          <div style="font-size:28px;font-weight:700;color:var(--gold);padding-bottom:12px">{props.t("search_reciters")}</div>
          <Show when={filtered().length > 0} fallback={<div style="padding:20px;color:var(--text-dim)">{props.t("empty_reciters")}</div>}>
            {filtered().map((r) => (
              <div
                use:focusable={`sr-${r.id}`}
                id={`sr-${r.id}`}
                class={`dialog-row ${!reciterTimed(r) ? "dim" : ""}`}
                onClick={() => openReciter(r)}
              >
                <span class="content-text" style="font-size:26px">{r.name}</span>
                <span style="flex:1" />
                {r.nameEn ? <span class="badge" style="color:var(--text-faint)">{r.nameEn}</span> : null}
              </div>
            ))}
          </Show>
        </div>
      ) : (
        <div style="display:flex;flex-direction:column;flex:1;min-height:0">
          {/* reciter groups */}
          <div class="h-scroll" style="flex:1;min-height:0">
            {/* letter rail: jump straight to a reciter group's first letter */}
            <div
              style="display:flex;gap:8px;overflow-x:auto;padding-bottom:14px;margin-bottom:6px"
              class="letter-rail"
            >
              {groups().map((g) => (
                <div
                  use:focusable={`letter-${g.letter}`}
                  id={`letter-${g.letter}`}
                  class="letter-chip"
                  onClick={() => jumpToLetter(g.letter)}
                >
                  {g.letter}
                </div>
              ))}
            </div>
            <div style="font-size:30px;font-weight:700;color:var(--gold);padding-bottom:10px">{props.t("reciters_title")}</div>
            {groups().map((g) => (
              <div id={`group-${g.letter}`} style="margin-bottom:14px">
                <div style="font-size:20px;font-weight:700;color:var(--text-dim);padding:6px 0 8px;letter-spacing:0.08em">{g.letter}</div>
                {/* fixed-column grid → cells align, so D-pad nav is coherent */}
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
                  {g.reciters.map((r) => (
                    <div
                      use:focusable={`rec-${r.id}`}
                      id={`rec-${r.id}`}
                      class="tv-card qurantv-rec-cell content-text"
                      classList={{ dim: props.lang === "ar" ? !reciterTimed(r) : false }}
                      style="padding:14px;justify-content:center;text-align:center;font-size:24px;min-height:74px"
                      onClick={() => openReciter(r)}
                    >
                      {r.name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* moshaf chooser for multi-moshaf reciters */}
      <Show when={chooser()}>
        {(rc) => (
          <Dialog
            title={`${props.t("select_moshaf")} — ${rc().name}`}
            onClose={() => setChooser(null)}
          >
            <div class="dialog-list">
              {rc().moshafs.map((m) => (
                <DialogRow
                  id={`mc-${m.id}`}
                  label={m.name}
                  dim={!timedUrls().has(normalizeServer(m.server))}
                  onClick={() => {
                    // Capture rc() BEFORE setChooser(null) — reading the keyed
                    // Show value after disposal throws a SolidJS stale-read.
                    const rec = rc();
                    setChooser(null);
                    props.onOpenReciter(rec, m);
                  }}
                />
              ))}
            </div>
          </Dialog>
        )}
      </Show>
    </div>
  );
}

export function normalizeServer(server: string): string {
  const trimmed = server.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
