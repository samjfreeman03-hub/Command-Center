"use client";

import { Tag, Plus, Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shared UI for the custom category/tag pool that a business defines once and
 * reuses across features (pipeline leads + CRM partners). Categories live in
 * the lead_categories table; this module just renders + edits the string names.
 */

// Distinct, readable badge colors assigned to categories by their position.
export const CATEGORY_COLORS = [
  "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-500/20",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20",
  "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-500/20",
  "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/25",
  "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-500/20",
  "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-500/20",
  "bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-1 ring-inset ring-orange-500/20",
  "bg-pink-500/10 text-pink-700 dark:text-pink-300 ring-1 ring-inset ring-pink-500/20",
];

const NEUTRAL_COLOR = "bg-sunken text-ink-2 ring-1 ring-inset ring-line";

/** Stable badge color for a category name, by its index in the canonical list. */
export function categoryColor(allNames: string[], name: string): string {
  const idx = allNames.indexOf(name);
  return idx >= 0 ? CATEGORY_COLORS[idx % CATEGORY_COLORS.length] : NEUTRAL_COLOR;
}

/** Read-only row of category badges. Same shape as <Badge>. */
export function CategoryBadges({
  names,
  allNames,
  size = "sm",
}: {
  names: string[];
  allNames: string[];
  size?: "sm" | "xs";
}) {
  if (names.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap", size === "xs" ? "gap-1" : "gap-1.5")}>
      {names.map((name) => (
        <span
          key={name}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
            categoryColor(allNames, name)
          )}
        >
          <Tag size={10} /> {name}
        </span>
      ))}
    </div>
  );
}

/** Toggle-pill multi-select for assigning categories to an item. */
export function CategoryMultiSelect({
  all,
  selected,
  onChange,
  emptyHint = "No categories yet. Add some with Manage categories in the Pipeline tab.",
}: {
  all: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
}) {
  if (all.length === 0) {
    return <p className="text-xs text-ink-3">{emptyHint}</p>;
  }
  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((c) => c !== name) : [...selected, name]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((name) => {
        const on = selected.includes(name);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(name)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors md:h-7",
              on
                ? "border-transparent bg-inverse text-on-inverse"
                : "border-line-strong bg-raised text-ink-2 hover:bg-hover hover:text-ink"
            )}
          >
            {on ? <Check size={12} /> : <Plus size={12} />}
            {name}
          </button>
        );
      })}
    </div>
  );
}

/** Filter pill used above a list (All / each category / Uncategorized). */
export function CatPill({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-[background-color,color,opacity] md:h-7",
        active
          ? "bg-inverse text-on-inverse"
          : color
            ? cn(color, "hover:opacity-80")
            : "bg-raised text-ink-2 ring-1 ring-inset ring-line-strong hover:bg-hover hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
