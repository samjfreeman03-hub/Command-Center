"use client";

import { useState } from "react";
import Link from "next/link";
import type { Todo } from "@/lib/types";
import { BUSINESSES } from "@/lib/businesses";
import { Check, ChevronDown, CircleCheckBig } from "lucide-react";
import { Badge, BrandTile, EmptyState } from "@/components/ui/display";
import { toast } from "@/components/ui/host";
import { refreshNav } from "@/lib/ui-events";
import { cn } from "@/lib/cn";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Every open todo, grouped by business. Lives inside a <Card> on the dashboard. */
export function DashboardTodos({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState(initialTodos);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function complete(todo: Todo) {
    const snapshot = todos;
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    try {
      const res = await fetch(`/api/todos/${todo.id}`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      refreshNav();
      toast("Completed", {
        tone: "success",
        action: {
          label: "Undo",
          onClick: async () => {
            const undo = await fetch(`/api/todos/${todo.id}`, { method: "PATCH" });
            if (undo.ok) {
              setTodos(snapshot);
              refreshNav();
            } else toast("Could not undo", { tone: "error" });
          },
        },
      });
    } catch {
      setTodos(snapshot);
      toast("Could not complete the todo", { tone: "error" });
    }
  }

  const groups = BUSINESSES.map((b) => ({
    business: b,
    todos: todos
      .filter((t) => t.business_id === b.id)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
  })).filter((g) => g.todos.length > 0);

  if (groups.length === 0) {
    return <EmptyState icon={<CircleCheckBig size={18} />} title="All clear" body="No open todos in any business." className="py-10" />;
  }

  return (
    <div className="divide-y divide-line">
      {groups.map(({ business: b, todos: bTodos }) => {
        const isOpen = expanded === b.id;
        const highCount = bTodos.filter((t) => t.priority === "high").length;
        return (
          <div key={b.id}>
            <button
              onClick={() => setExpanded(isOpen ? null : b.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-hover"
            >
              <BrandTile business={b} size="xs" />
              <span className="flex-1 text-[13px] font-medium text-ink">{b.name}</span>
              {highCount > 0 && !isOpen && <Badge tone="amber">{highCount} high</Badge>}
              <span className="text-xs tabular-nums text-ink-3">{bTodos.length}</span>
              <ChevronDown size={14} className={cn("shrink-0 text-ink-4 transition-transform duration-200", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
              <div className="px-2 pb-2">
                {bTodos.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => complete(t)}
                    title="Mark done"
                    className="group/item flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover"
                  >
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-strong text-transparent transition-colors group-hover/item:border-emerald-500 group-hover/item:text-emerald-500">
                      <Check size={10} strokeWidth={3} />
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", t.priority === "low" ? "text-ink-3" : "text-ink")}>{t.title}</span>
                    {t.priority === "high" && <Badge tone="amber">High</Badge>}
                  </button>
                ))}
                <Link
                  href={`/b/${b.id}?tab=todos`}
                  className="mt-0.5 inline-flex items-center gap-1 px-2 py-1 text-xs text-ink-3 transition-colors hover:text-ink"
                >
                  Open in {b.name}
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
