"use client";

import { cn } from "@/lib/cn";

/**
 * Single-select pill group. Use for 2 to 5 short options (view toggles, stage,
 * priority, type); use <Select> beyond that.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  wrap = true,
  className,
}: {
  options: readonly { value: T; label: React.ReactNode; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  /** false: keep one row and scroll horizontally (filter rows on phones). */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex max-w-full gap-0.5 rounded-lg bg-sunken p-0.5 ring-1 ring-inset ring-line",
        wrap ? "flex-wrap" : "scrollbar-none flex-nowrap overflow-x-auto",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors",
              size === "sm" ? "h-7 md:h-6 px-2 text-xs" : "h-9 md:h-7 px-3 md:px-2.5 text-[13px]",
              active ? "bg-raised text-ink shadow-card ring-1 ring-line" : "text-ink-3 hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
