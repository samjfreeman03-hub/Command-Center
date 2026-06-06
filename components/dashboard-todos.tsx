"use client";

import { useState } from "react";
import Link from "next/link";
import type { Todo } from "@/lib/types";
import { BUSINESSES } from "@/lib/businesses";
import { Check, ChevronDown } from "lucide-react";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function DashboardTodos({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState(initialTodos);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function toggle(id: number) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/todos/${id}`, { method: "PATCH" });
  }

  const groups = BUSINESSES.map((b) => ({
    business: b,
    todos: todos
      .filter((t) => t.business_id === b.id)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
  })).filter((g) => g.todos.length > 0);

  if (groups.length === 0) {
    return (
      <div className="text-sm text-zinc-400 dark:text-zinc-600 py-4 text-center">
        All clear. 🎉
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
      {groups.map(({ business: b, todos: bTodos }) => {
        const isOpen = expanded === b.id;
        const hasHigh = bTodos.some((t) => t.priority === "high");

        return (
          <div key={b.id}>
            {/* Company row */}
            <button
              onClick={() => setExpanded(isOpen ? null : b.id)}
              className="w-full flex items-center gap-3 py-3 text-left group"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${b.dot}`} />
              <span className={`text-sm font-semibold flex-1 ${b.accent}`}>{b.name}</span>
              {hasHigh && !isOpen && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Has high-priority tasks" />
              )}
              <span className="text-xs text-zinc-400 tabular-nums">{bTodos.length}</span>
              <ChevronDown
                size={14}
                className={`text-zinc-400 transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Expanded todo list */}
            {isOpen && (
              <div className="pb-3 space-y-0.5 pl-5">
                {bTodos.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 -mx-2 rounded-lg text-left group/item hover:bg-zinc-50 dark:hover:bg-zinc-900/50 active:bg-zinc-100 dark:active:bg-zinc-900 transition-colors"
                  >
                    <span className="shrink-0 w-4 h-4 rounded-full border-2 border-zinc-300 dark:border-zinc-700 group-hover/item:border-emerald-500 flex items-center justify-center transition-colors">
                      <Check size={9} className="text-emerald-500 opacity-0 group-hover/item:opacity-100 transition-opacity" strokeWidth={3} />
                    </span>
                    <span className={`flex-1 text-sm leading-snug group-hover/item:line-through group-hover/item:text-zinc-400 transition-all min-w-0 truncate ${
                      t.priority === "low" ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-700 dark:text-zinc-300"
                    }`}>
                      {t.title}
                    </span>
                    {t.priority === "high" && (
                      <span className="shrink-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400">HIGH</span>
                    )}
                  </button>
                ))}
                <Link
                  href={`/b/${b.id}?tab=todos`}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mt-1 px-2 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open in {b.name} →
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
