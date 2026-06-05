"use client";

import { useState } from "react";
import Link from "next/link";
import type { Todo } from "@/lib/types";
import { BUSINESSES } from "@/lib/businesses";
import { Check } from "lucide-react";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function DashboardTodos({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState(initialTodos);

  async function toggle(id: number) {
    // Optimistically remove from the open list
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
    return <div className="text-sm text-zinc-400 dark:text-zinc-600 py-6 text-center">All clear. 🎉</div>;
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
      {groups.map(({ business: b, todos: bTodos }) => (
        <div key={b.id} className="py-4 first:pt-0 last:pb-0">
          {/* Company header */}
          <Link href={`/b/${b.id}?tab=todos`} className="inline-flex items-center gap-1.5 mb-3 group">
            <span className={`w-2 h-2 rounded-full ${b.dot}`} />
            <span className={`text-xs font-semibold ${b.accent} group-hover:opacity-70 transition-opacity`}>
              {b.name}
            </span>
            <span className="text-xs text-zinc-400 ml-0.5">{bTodos.length}</span>
          </Link>

          {/* Todo items */}
          <div className="space-y-1">
            {bTodos.map((t) => (
              <button
                key={t.id}
                onClick={() => toggle(t.id)}
                className="w-full flex items-start gap-2.5 group/item text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
              >
                {/* Circle checkbox */}
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 border-zinc-300 dark:border-zinc-700 group-hover/item:border-emerald-500 dark:group-hover/item:border-emerald-500 flex items-center justify-center transition-colors">
                  <Check size={9} className="text-emerald-500 opacity-0 group-hover/item:opacity-100 transition-opacity" strokeWidth={3} />
                </span>

                {/* Title + priority badge */}
                <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                  <span className={`text-sm leading-snug ${
                    t.priority === "low"
                      ? "text-zinc-400 dark:text-zinc-600"
                      : "text-zinc-800 dark:text-zinc-200"
                  } group-hover/item:line-through group-hover/item:text-zinc-400 transition-all`}>
                    {t.title}
                  </span>
                  {t.priority === "high" && (
                    <span className="shrink-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-md mt-0.5">
                      HIGH
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
