// Home screen — header, Continue card, reciters A–Z (wrapped FlowRows per
// letter, mirroring the Android app), letter rail, search overlay.

import { createMemo, createSignal, onMount, Show } from "solid-js";
import type { Moshaf, Reciter } from "../domain/Models";
import { reciterMatchesQuery } from "../domain/search";
import { arabicCollator, type TFunction } from "../i18n/strings";
import type { LastSession } from "../data/repo/SessionRepository";
import { appContainer } from "../data/AppContainer";
import { Chip, Dialog, DialogRow, ErrorState, LoadingState, TvCard , focusable } from "./components";
import { focusFirst } from "./focus";
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
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [session] = createSignal<LastSession | null>(c.session.lastSession());
  const [recent, setRecent] = createSignal<Reciter[] | null>(null);

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
      // Recently added reads (soft-fail row — hidden on error)
      try {
        setRecent(await c.catalog.recentReads());
      } catch {
        setRecent(null);
      }
      setTimeout(() => {
        const rail = document.querySelector(".h-scroll");
        if (rail) focusFirst(rail);
      }, 150);
    } catch (e) {
      console.error("Home load error:", e);
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

  const filtered = createMemo(() => {
    const list = reciters();
    if (!list) return [];
    return list.filter((r) => reciterMatchesQuery(r, query()));
  });

  function openFirstMatch() {
    const list = filtered();
    if (list.length === 0) return;
    const first = list[0];
    openReciter(first);
  }

  function openReciter(reciter: Reciter) {
    const timed = timedUrls();
    const multi = reciter.moshafs.filter((m) => timed.has(normalizeServer(m.server))).length > 1;
    const candidates =
      reciter.moshafs.length > 1
        ? reciter.moshafs.filter((m) => timed.has(normalizeServer(m.server)))
        : reciter.moshafs;
    const moshaf = candidates.length > 0 ? candidates[0] : reciter.moshafs[0];
    if (!moshaf) return;
    if (reciter.moshafs.length > 1 && multi) {
      openMoshafChooser(reciter);
      return;
    }
    props.onOpenReciter(reciter, moshaf);
  }

  const [chooser, setChooser] = createSignal<Reciter | null>(null);

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
    // Resolve reciter/moshaf/surah ids from the catalog (best effort).
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
      {/* header */}
      <div style="display:flex;align-items:center;gap:24px;padding-bottom:18px">
        <h1 style="margin:0;font-size:46px;font-weight:700;color:var(--gold)">{props.t("app_name")}</h1>
        <div style="flex:1" />
        <Chip id="home-search" label={props.t("search_reciters")} onClick={() => {
          setSearchOpen(true);
          setTimeout(() => {
            const input = document.getElementById("search-input");
            input?.focus();
            const listEl = document.querySelector(".dialog-list");
            if (listEl) focusFirst(listEl);
          }, 80);
        }} />
        <Chip id="home-settings" label={props.t("settings")} onClick={() => props.onOpenSettings()} />
      </div>

      {/* recently added reads */}
      <Show when={recent() !== null && recent()!.length > 0}>
        <div style="margin-bottom:22px">
          <div style="font-size:24px;color:var(--text-dim);padding-bottom:10px">{props.t("recent_reads")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:12px">
            {recent()!.slice(0, 10).map((r) => (
              <Chip
                id={`recent-${r.id}`}
                label={r.name}
                dim={props.lang === "ar" ? !reciterTimed(r) : false}
                onClick={() => openReciter(r)}
              />
            ))}
          </div>
        </div>
      </Show>

      {/* continue card */}
      <Show when={session()}>
        {(s) => (
          <TvCard id="home-continue" onClick={continueResume} style="margin-bottom:22px">
            <span style="font-size:32px">▶</span>
            <div>
              <div style="font-size:20px;color:var(--text-dim)">{props.t("continue_listening")}</div>
              <div>
                {s().reciterName} · {s().surahNameAr}
              </div>
            </div>
          </TvCard>
        )}
      </Show>

      {/* body */}
      {error() ? (
        <ErrorState t={props.t} onRetry={load} />
      ) : reciters() === null ? (
        <LoadingState t={props.t} />
      ) : (
        <div style="display:flex;gap:28px;flex:1;min-height:0">
          {/* letter rail */}
          <div style="display:flex;flex-direction:column;gap:6px;overflow-y:auto;scrollbar-width:none;padding:4px">
            {groups().map((g) => (
              <div
                use:focusable={`rail-${g.letter}`}
                style="width:66px;height:54px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(180deg,var(--surface-2),var(--surface));border:1px solid #2a3c66;font-size:22px;font-weight:700;color:var(--gold);box-shadow:var(--shadow)"
                onClick={() => {
                  document.getElementById(`group-${g.letter}`)?.scrollIntoView({ block: "start" });
                }}
              >
                {g.letter}
              </div>
            ))}
          </div>

          {/* reciter groups */}
          <div class="h-scroll" style="flex:1">
            <div style="font-size:34px;font-weight:700;color:var(--gold);padding-bottom:12px">{props.t("reciters_title")}</div>
            {groups().map((g) => (
              <div id={`group-${g.letter}`} style="margin-bottom:16px">
                <div style="font-size:22px;font-weight:700;color:var(--text-dim);padding:6px 0 8px;letter-spacing:0.08em">{g.letter}</div>
                <div style="display:flex;flex-wrap:wrap;gap:12px">
                  {g.reciters.map((r) => (
                    <Chip
                      id={`rec-${r.id}`}
                      label={r.name}
                      dim={props.lang === "ar" ? !reciterTimed(r) : false}
                      onClick={() => openReciter(r)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* search overlay */}
      <Show when={searchOpen()}>
        <Dialog title={props.t("search_reciters")} hint={props.t("search_enter_hint")} onClose={() => setSearchOpen(false)}>
          <div style="padding:0 28px 14px">
            <input
              id="search-input"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  openFirstMatch();
                }
              }}
              placeholder={props.t("search_hint")}
              style="width:100%;height:64px;font-size:26px;border-radius:12px;border:1px solid #2c3f68;background:var(--bg);color:var(--text);padding:0 18px"
            />
          </div>
          <div style="padding:0 28px 12px;display:flex;gap:14px;align-items:center">
            <Chip id="search-submit" label={props.t("search_action")} onClick={openFirstMatch} />
            <span style="font-size:16px;color:var(--text-dim)">{filtered().length} · {props.t("reciters_title")}</span>
          </div>
          <div class="dialog-list" style="max-height:50vh">
            <Show when={filtered().length > 0} fallback={<div style="padding:20px;color:var(--text-dim)">{props.t("empty_reciters")}</div>}>
              {filtered().map((r) => (
                <DialogRow
                  id={`sr-${r.id}`}
                  label={r.name}
                  dim={!reciterTimed(r)}
                  onClick={() => {
                    setSearchOpen(false);
                    openReciter(r);
                  }}
                />
              ))}
            </Show>
          </div>
        </Dialog>
      </Show>

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
                    setChooser(null);
                    setSearchOpen(false);
                    props.onOpenReciter(rc(), m);
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
