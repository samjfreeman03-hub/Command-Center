"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/cn";

/**
 * App-wide replacements for window.confirm()/alert(). Call from anywhere:
 *
 *   if (!(await confirmDialog({ title: "Delete this lead?", destructive: true }))) return;
 *   toast("Link copied");
 *   toast("Could not save", { tone: "error" });
 *
 * <UIHost /> is mounted once in the root layout and renders both.
 */

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deletes. */
  destructive?: boolean;
};

type ToastTone = "default" | "success" | "error";
type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
};

type State = {
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  toasts: ToastItem[];
};

let state: State = { confirm: null, toasts: [] };
const listeners = new Set<() => void>();
let nextId = 1;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const getSnapshot = () => state;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // A second confirm while one is open cancels the first.
    state.confirm?.resolve(false);
    set({ confirm: { ...options, resolve } });
  });
}

export function toast(
  message: string,
  options?: { tone?: ToastTone; action?: ToastItem["action"]; durationMs?: number }
) {
  const id = nextId++;
  set({ toasts: [...state.toasts.slice(-3), { id, message, tone: options?.tone ?? "default", action: options?.action }] });
  setTimeout(() => dismissToast(id), options?.durationMs ?? (options?.action ? 6000 : 3200));
}

function dismissToast(id: number) {
  if (state.toasts.some((t) => t.id === id)) set({ toasts: state.toasts.filter((t) => t.id !== id) });
}

export function UIHost() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <>
      {snap.confirm && <ConfirmView key={snap.confirm.title} {...snap.confirm} />}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:items-end sm:px-6 sm:pb-6"
        aria-live="polite"
      >
        {snap.toasts.map((t) => (
          <div
            key={t.id}
            className="pop-in pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl bg-inverse py-2.5 pl-3.5 pr-2 text-[13px] font-medium text-on-inverse shadow-pop"
          >
            {t.tone === "success" && <Check size={14} className="shrink-0 text-emerald-400 dark:text-emerald-600" />}
            {t.tone === "error" && <AlertTriangle size={14} className="shrink-0 text-amber-400 dark:text-amber-600" />}
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismissToast(t.id);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold underline-offset-2 hover:underline"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-60 hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}

function ConfirmView({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  resolve,
}: NonNullable<State["confirm"]>) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  function finish(ok: boolean) {
    set({ confirm: null });
    resolve(ok);
  }

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(false);
      }
    }
    // Capture phase so an open Modal underneath doesn't also close on Esc.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fade-in fixed inset-0 z-[70] flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="sheet-in w-full rounded-t-2xl border border-line bg-raised p-5 shadow-pop sm:max-w-sm sm:rounded-2xl pb-safe-4"
      >
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{description}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => finish(false)}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant="primary"
            onClick={() => finish(true)}
            className={cn(destructive && "bg-red-600 text-white dark:bg-red-500 dark:text-white")}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
