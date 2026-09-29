"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export type MenuItem = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

/**
 * Small dropdown menu. On phones this is how a row or header folds several
 * actions into one tap target instead of a cramped cluster of icon buttons.
 * Closes on outside click, Esc, or selecting an item.
 */
export function Menu({
  items,
  label = "More actions",
  align = "right",
  size = "md",
  className,
  trigger,
}: {
  items: MenuItem[];
  label?: string;
  align?: "left" | "right";
  size?: "sm" | "md";
  className?: string;
  /** Custom trigger; defaults to a "…" icon button. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover hover:text-ink",
          size === "sm" ? "h-8 w-8 md:h-7 md:w-7" : "h-10 w-10 md:h-8 md:w-8",
          open && "bg-hover text-ink"
        )}
      >
        {trigger ?? <MoreHorizontal size={size === "sm" ? 15 : 17} />}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "pop-in absolute top-full z-50 mt-1 min-w-44 overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] transition-colors disabled:opacity-40 md:py-2",
                item.danger ? "text-red-600 hover:bg-red-500/10 dark:text-red-400" : "text-ink hover:bg-hover"
              )}
            >
              {item.icon && <span className="flex w-4 shrink-0 justify-center text-ink-3">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
