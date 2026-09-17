"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, CircleCheckBig } from "lucide-react";
import { getBusiness } from "@/lib/businesses";
import { BrandTile, Badge, Card, EmptyState, SectionHeader } from "@/components/ui/display";
import { toast } from "@/components/ui/host";
import { refreshNav } from "@/lib/ui-events";
import { cn } from "@/lib/cn";

export type AttentionItem = {
  key: string;
  kind: "todo" | "lead" | "initiative" | "event" | "outreach";
  businessId: string;
  title: string;
  /** e.g. "Todo", "method · proposal" */
  context: string;
  /** Short date label, e.g. "Sep 15" or "Today" */
  when: string;
  overdue: boolean;
  href: string;
  /** Present for todos, so they can be completed right here. */
  todoId?: number;
};

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  todo: "Todo",
  lead: "Deal",
  initiative: "Initiative",
  event: "Event",
  outreach: "Outreach",
};

/** "Needs attention": everything overdue or due today, across all businesses, actionable in place. */
export function TodayAttention({ items: initial }: { items: AttentionItem[] }) {
  const [items, setItems] = useState(initial);
  const overdue = items.filter((i) => i.overdue);
  const today = items.filter((i) => !i.overdue);

  async function toggleTodo(item: AttentionItem) {
    const res = await fetch(`/api/todos/${item.todoId}`, { method: "PATCH" });
    if (!res.ok) throw new Error();
    refreshNav();
  }

  async function complete(item: AttentionItem) {
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.key !== item.key));
    try {
      await toggleTodo(item);
      toast("Completed", {
        tone: "success",
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await toggleTodo(item);
              setItems(snapshot);
            } catch {
              toast("Could not undo", { tone: "error" });
            }
          },
        },
      });
    } catch {
      setItems(snapshot);
      toast("Could not complete the todo", { tone: "error" });
    }
  }

  return (
    <div>
      <SectionHeader title="Needs attention" count={items.length || undefined} />
      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={<CircleCheckBig size={18} />}
            title="You're clear"
            body="Nothing is overdue and nothing is due today."
            className="py-10"
          />
        ) : (
          <div className="divide-y divide-line">
            {overdue.length > 0 && <Group label="Overdue" tone="red" items={overdue} onComplete={complete} />}
            {today.length > 0 && <Group label="Today" tone="amber" items={today} onComplete={complete} />}
          </div>
        )}
      </Card>
    </div>
  );
}

function Group({
  label,
  tone,
  items,
  onComplete,
}: {
  label: string;
  tone: "red" | "amber";
  items: AttentionItem[];
  onComplete: (item: AttentionItem) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 bg-sunken/70 px-4 py-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", tone === "red" ? "bg-red-500" : "bg-amber-500")} />
        <span className="text-xs font-medium text-ink-2">{label}</span>
        <span className="text-xs tabular-nums text-ink-3">{items.length}</span>
      </div>
      <div className="divide-y divide-line">
        {items.map((item) => {
          const business = getBusiness(item.businessId);
          return (
            <div key={item.key} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover">
              {item.todoId ? (
                <button
                  onClick={() => onComplete(item)}
                  aria-label={`Complete: ${item.title}`}
                  title="Mark done"
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-strong text-transparent transition-colors hover:border-emerald-500 hover:text-emerald-500"
                >
                  <Check size={10} strokeWidth={3} />
                </button>
              ) : (
                <span className="flex w-[18px] shrink-0 justify-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-4" />
                </span>
              )}
              <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-ink-3">
                    {business && <BrandTile business={business} size="xs" />}
                    <span className="truncate">
                      {business?.name} · {KIND_LABEL[item.kind]}
                      {item.context ? ` · ${item.context}` : ""}
                    </span>
                  </span>
                </span>
                <Badge tone={item.overdue ? "red" : "neutral"}>{item.when}</Badge>
                <ChevronRight size={14} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
