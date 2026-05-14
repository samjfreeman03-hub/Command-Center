"use client";

import { useState, useTransition } from "react";
import type { Todo } from "@/lib/types";
import { Check, Plus, Trash2, Circle } from "lucide-react";
import { format, parseISO, isPast, isToday } from "date-fns";

export function TodosPanel({ businessId, initial }: { businessId: string; initial: Todo[] }) {
  const [todos, setTodos] = useState(initial);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [, startTransition] = useTransition();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        business_id: businessId,
        title: title.trim(),
        due_date: dueDate || undefined,
        priority,
      }),
    });
    if (res.ok) {
      const created: Todo = await res.json();
      setTodos((prev) => [created, ...prev]);
      setTitle("");
      setDueDate("");
      setPriority("medium");
    }
  }

  async function toggle(id: number) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t))
    );
    startTransition(async () => {
      const res = await fetch(`/api/todos/${id}`, { method: "PATCH" });
      if (res.ok) {
        const updated: Todo = await res.json();
        setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
      }
    });
  }

  async function remove(id: number) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
  }

  const open = todos.filter((t) => t.status === "open");
  const done = todos.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      <form
        onSubmit={add}
        className="flex flex-col sm:flex-row gap-2 rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 p-3"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a todo…"
          className="flex-1 bg-transparent text-sm px-3 py-2 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-zinc-900 dark:text-zinc-100"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="bg-zinc-100 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-700 dark:text-zinc-300 outline-none"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
          className="bg-zinc-100 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-700 dark:text-zinc-300 outline-none"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button
          type="submit"
          className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-white inline-flex items-center gap-1.5"
        >
          <Plus size={14} />
          Add
        </button>
      </form>

      <Section title={`Open (${open.length})`}>
        {open.length === 0 ? (
          <Empty text="No open todos. Nice." />
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-900">
            {open.map((t) => (
              <TodoRow key={t.id} todo={t} onToggle={toggle} onDelete={remove} />
            ))}
          </ul>
        )}
      </Section>

      {done.length > 0 && (
        <Section title={`Done (${done.length})`}>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-900">
            {done.map((t) => (
              <TodoRow key={t.id} todo={t} onToggle={toggle} onDelete={remove} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const overdue =
    todo.due_date && todo.status === "open"
      ? isPast(parseISO(todo.due_date)) && !isToday(parseISO(todo.due_date))
      : false;

  return (
    <li className="py-2.5 flex items-center gap-3 group">
      <button
        onClick={() => onToggle(todo.id)}
        className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-400 flex items-center justify-center"
      >
        {todo.status === "done" ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Circle size={6} className="text-zinc-300 dark:text-zinc-700" />}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm truncate ${
            todo.status === "done"
              ? "line-through text-zinc-400 dark:text-zinc-600"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {todo.title}
        </div>
        {(todo.due_date || todo.priority !== "medium") && (
          <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
            {todo.due_date && (
              <span className={overdue ? "text-red-600 dark:text-red-400" : ""}>
                {overdue && "overdue · "}
                {format(parseISO(todo.due_date), "MMM d")}
              </span>
            )}
            {todo.priority === "high" && <span className="text-amber-700 dark:text-amber-400">high</span>}
            {todo.priority === "low" && <span className="text-zinc-400 dark:text-zinc-600">low</span>}
          </div>
        )}
      </div>
      <button
        onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 p-1"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">{title}</div>
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 px-4">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-zinc-500 py-6 text-center">{text}</div>;
}
