"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const widths = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

/**
 * The one modal for the whole app: centered dialog on desktop, bottom sheet on
 * phones. Closes on Esc and backdrop click, locks page scroll, and keeps a
 * sticky header/footer so long forms scroll in the middle.
 *
 * Pass `onSubmit` to render the panel as a <form>, so a `type="submit"` button
 * placed in `footer` submits it (Enter in any field works too).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof widths;
  onSubmit?: (e: React.FormEvent) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const Panel = onSubmit ? "form" : "div";

  return createPortal(
    <div
      className="fade-in fixed inset-0 z-[60] flex items-end sm:items-start justify-center bg-black/45 backdrop-blur-[2px] sm:px-4 sm:pt-[9vh] sm:pb-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Panel
        role="dialog"
        aria-modal="true"
        onSubmit={
          onSubmit
            ? (e: React.FormEvent) => {
                e.preventDefault();
                onSubmit(e);
              }
            : undefined
        }
        className={cn(
          "sheet-in flex w-full flex-col overflow-hidden bg-raised shadow-pop",
          "max-h-[92dvh] sm:max-h-[82vh] rounded-t-2xl sm:rounded-2xl border border-line",
          widths[size]
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <footer className="pb-safe-3 flex shrink-0 items-center justify-between gap-2 border-t border-line bg-sunken/60 px-5 pt-3">
            {footer}
          </footer>
        )}
      </Panel>
    </div>,
    document.body
  );
}
