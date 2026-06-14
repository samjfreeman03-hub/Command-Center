"use client";

import { Tag, Plus, Check } from "lucide-react";

/**
 * Shared UI for the custom category/tag pool that a business defines once and
 * reuses across features (pipeline leads + CRM partners). Categories live in
 * the lead_categories table; this module just renders + edits the string names.
 */

// Distinct, readable badge colors assigned to categories by their position.
export const CATEGORY_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
];

/** Stable badge color for a category name, by its index in the canonical list. */
export function categoryColor(allNames: string[], name: string): string {
  const idx = allNames.indexOf(name);
  return idx >= 0
    ? CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}

/** Read-only row of category badges. */
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
  const cls = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-1.5 py-0.5";
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} className={`inline-flex items-center gap-1 rounded-md font-medium ${cls} ${categoryColor(allNames, name)}`}>
          <Tag size={9} /> {name}
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
  emptyHint = "No categories yet — add some via Manage in the Pipeline tab.",
}: {
  all: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
}) {
  if (all.length === 0) {
    return <p className="text-xs text-zinc-400">{emptyHint}</p>;
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
            onClick={() => toggle(name)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
              on
                ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {on ? <Check size={11} /> : <Plus size={11} />}
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
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
        active
          ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          : color
            ? `border-transparent ${color} hover:opacity-80`
            : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
