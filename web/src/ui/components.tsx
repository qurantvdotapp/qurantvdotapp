// Shared UI components + the `focusable` SolidJS directive.
// use:focusable="id" registers an element with the focus engine and applies
// the .focused class when it is the current focus target.

import { createEffect, createUniqueId, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { focusedId, registerFocusable, unregisterFocusable } from "./focus";
import type { TFunction } from "../i18n/strings";

declare module "solid-js" {
  namespace JSX {
    interface DirectiveFunctions {
      focusable: (el: HTMLElement, value: string | (() => string)) => void;
    }
  }
}

export function focusable(el: HTMLElement, value: string | (() => string)): void {
  const id = typeof value === "function" ? value() : value ?? `f-${createUniqueId()}`;
  el.setAttribute("data-focus-id", id);
  el.setAttribute("data-focusable", "");
  el.setAttribute("tabindex", "-1");
  createEffect(() => {
    if (focusedId() === id) {
      el.classList.add("focused");
    } else {
      el.classList.remove("focused");
    }
  });
  onMount(() => registerFocusable(id, el));
  onCleanup(() => unregisterFocusable(id));
}

/* ---------------- TvCard ---------------- */

export function TvCard(props: {
  id: string;
  onClick?: () => void;
  dim?: boolean;
  children: JSX.Element;
  style?: string;
  class?: string;
}) {
  return (
    <div
      use:focusable={props.id}
      id={props.id}
      class={`tv-card ${props.dim ? "dim" : ""} ${props.class ?? ""}`}
      style={props.style}
      onClick={() => props.onClick?.()}
    >
      {props.children}
    </div>
  );
}

/* ---------------- Chip ---------------- */

export function Chip(props: { id: string; label: string; onClick?: () => void; dim?: boolean; badge?: boolean }) {
  return (
    <div
      use:focusable={props.id}
      id={props.id}
      class={`tv-chip ${props.dim ? "dim" : ""}`}
      onClick={() => props.onClick?.()}
    >
      {props.label}
      {props.badge ? <span class="badge" style="margin-inline-start:10px">بدون توقيت</span> : null}
    </div>
  );
}

/* ---------------- States ---------------- */

export function LoadingState(props: { t: TFunction }) {
  return (
    <div class="state-box">
      <div class="spin">⟳</div>
      <div>{props.t("loading")}</div>
    </div>
  );
}

export function ErrorState(props: { t: TFunction; message?: string; onRetry: () => void }) {
  const retryId = `retry-${createUniqueId()}`;
  return (
    <div class="state-box">
      <div>{props.message ?? props.t("error_network")}</div>
      <div use:focusable={retryId} class="tv-chip" onClick={() => props.onRetry()}>
        {props.t("retry_action")}
      </div>
    </div>
  );
}

/* ---------------- Simple dialog shell ---------------- */

export function Dialog(props: {
  title: string;
  hint?: string;
  onClose: () => void;
  children: JSX.Element;
}) {
  // Close on the global close request (the TV Back key routes here).
  onMount(() => {
    const onCloseReq = () => props.onClose();
    window.addEventListener("qurantv-close-dialog", onCloseReq as EventListener);
    onCleanup(() => window.removeEventListener("qurantv-close-dialog", onCloseReq as EventListener));
  });
  return (
    <div class="dialog-scrim" onClick={() => props.onClose()}>
      <div class="dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-title">{props.title}</div>
        {props.hint ? <div class="dialog-hint">{props.hint}</div> : null}
        {props.children}
      </div>
    </div>
  );
}

export function DialogRow(props: {
  id: string;
  label: string;
  sub?: string;
  checked?: boolean;
  dim?: boolean;
  /** Trailing element (e.g. a favourite star); stops click propagation. */
  action?: JSX.Element;
  onClick: () => void;
}) {
  return (
    <div
      use:focusable={props.id}
      id={props.id}
      class={`dialog-row ${props.dim ? "dim" : ""}`}
      onClick={() => props.onClick()}
    >
      {props.checked ? <span style="color:var(--gold)">✓</span> : null}
      <span>{props.label}</span>
      {props.sub ? <span class="badge" style="color:var(--text-faint)">{props.sub}</span> : null}
      <span style="flex:1" />
      {props.action}
    </div>
  );
}

/** Focusable star toggle (favourites). Whole section shouldn't re-click. */
export function StarButton(props: {
  id: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      use:focusable={props.id}
      id={props.id}
      class="star-btn"
      classList={{ active: props.active }}
      onClick={(e) => {
        e.stopPropagation(); // don't trigger the row's onClick
        props.onClick();
      }}
      aria-label={props.active ? "unfavourite" : "favourite"}
      style={{
        "font-size": "26px",
        color: props.active ? "var(--gold)" : "var(--text-faint)",
        padding: "4px 10px",
        "border-radius": "10px",
      }}
    >
      {props.active ? "★" : "☆"}
    </div>
  );
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = sec.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
