"use client";

import { useState } from "react";
import type { TeamMember, Todo } from "@/lib/types";
import { Plus, Trash2, UserCircle2 } from "lucide-react";
import { format, parseISO, isPast, isToday } from "date-fns";
import { useShareHeaders } from "@/lib/share-context";

export const MEMBER_COLORS = [
  { bg: "bg-blue-500",    ring: "ring-blue-500",    light: "bg-blue-50 dark:bg-blue-950/30",    text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-emerald-500", ring: "ring-emerald-500", light: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-violet-500",  ring: "ring-violet-500",  light: "bg-violet-50 dark:bg-violet-950/30",  text: "text-violet-700 dark:text-violet-300" },
  { bg: "bg-amber-500",   ring: "ring-amber-500",   light: "bg-amber-50 dark:bg-amber-950/30",   text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-rose-500",    ring: "ring-rose-500",    light: "bg-rose-50 dark:bg-rose-950/30",    text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-cyan-500",    ring: "ring-cyan-500",    light: "bg-cyan-50 dark:bg-cyan-950/30",    text: "text-cyan-700 dark:text-cyan-300" },
  { bg: "bg-orange-500",  ring: "ring-orange-500",  light: "bg-orange-50 dark:bg-orange-950/30",  text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-pink-500",    ring: "ring-pink-500",    light: "bg-pink-50 dark:bg-pink-950/30",    text: "text-pink-700 dark:text-pink-300" },
] as const;

export function memberInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function MemberAvatar({ member, size = "md" }: { member: TeamMember; size?: "sm" | "md" | "lg" }) {
  const color = MEMBER_COLORS[member.color_index % MEMBER_COLORS.length];
  const sz = size === "sm" ? "w-5 h-5 text-[10px]" : size === "lg" ? "w-10 h-10 text-base" : "w-7 h-7 text-xs";
  return (
    <div className={`${sz} ${color.bg} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}>
      {memberInitials(member.name)}
    </div>
  );
}

export function TeamPanel({
  businessId,
  initialMembers,
  initialTodos,
  onMembersChange,
}: {
  businessId: string;
  initialMembers: TeamMember[];
  initialTodos: Todo[];
  onMembersChange: (members: TeamMember[]) => void;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [todos] = useState(initialTodos);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const shareHeaders = useShareHeaders();

  function updateMembers(next: TeamMember[]) {
    setMembers(next);
    onMembersChange(next);
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ business_id: businessId, name: name.trim(), title: title.trim() || undefined }),
    });
    if (res.ok) {
      const created: TeamMember = await res.json();
      updateMembers([...members, created]);
      setName("");
      setTitle("");
    }
  }

  async function removeMember(id: number) {
    if (!confirm("Remove this team member? Their task assignments will be cleared.")) return;
    await fetch(`/api/team/${id}`, { method: "DELETE", headers: shareHeaders });
    updateMembers(members.filter((m) => m.id !== id));
  }

  const openTodos = todos.filter((t) => t.status === "open");
  const unassigned = openTodos.filter((t) => !t.assignee_ids?.length);

  return (
    <div className="space-y-6">
      {/* Add member */}
      <form
        onSubmit={addMember}
        className="flex flex-col sm:flex-row gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="flex-1 h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 rounded-lg outline-none focus:border-zinc-400 dark:focus:border-zinc-600 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-zinc-900 dark:text-zinc-100 transition-colors"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title / role"
          className="flex-1 h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 rounded-lg outline-none focus:border-zinc-400 dark:focus:border-zinc-600 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-zinc-700 dark:text-zinc-300 transition-colors"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="h-9 px-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus size={14} /> Add member
        </button>
      </form>

      {/* Team breakdown */}
      {members.length === 0 ? (
        <div className="text-sm text-zinc-500 py-10 text-center">No team members yet. Add someone above.</div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            {members.length} {members.length === 1 ? "member" : "members"} · {openTodos.length} open tasks
          </div>

          {members.map((m) => {
            const mTodos = openTodos.filter((t) => t.assignee_ids?.includes(m.id));
            const color = MEMBER_COLORS[m.color_index % MEMBER_COLORS.length];
            return (
              <div key={m.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <MemberAvatar member={m} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.name}</div>
                    {m.title && <div className="text-xs text-zinc-500">{m.title}</div>}
                  </div>
                  <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${color.light} ${color.text} shrink-0`}>
                    {mTodos.length} {mTodos.length === 1 ? "task" : "tasks"}
                  </div>
                  <button
                    onClick={() => removeMember(m.id)}
                    className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 p-1 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {mTodos.length > 0 && (
                  <div className="border-t border-zinc-100 dark:border-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-900">
                    {mTodos.map((t) => (
                      <TaskRow key={t.id} todo={t} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {unassigned.length > 0 && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <UserCircle2 size={20} className="text-zinc-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-zinc-500">Unassigned</div>
                </div>
                <div className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500">
                  {unassigned.length} {unassigned.length === 1 ? "task" : "tasks"}
                </div>
              </div>
              <div className="border-t border-zinc-100 dark:border-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-900">
                {unassigned.map((t) => (
                  <TaskRow key={t.id} todo={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ todo }: { todo: Todo }) {
  const overdue = todo.due_date
    ? isPast(parseISO(todo.due_date)) && !isToday(parseISO(todo.due_date))
    : false;
  return (
    <div className="px-4 py-2.5 flex items-start gap-2">
      <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
        todo.priority === "high" ? "bg-amber-500" : todo.priority === "low" ? "bg-zinc-300 dark:bg-zinc-700" : "bg-zinc-400"
      }`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-800 dark:text-zinc-200">{todo.title}</div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
          {todo.priority !== "medium" && (
            <span className={todo.priority === "high" ? "text-amber-600 dark:text-amber-400" : ""}>{todo.priority}</span>
          )}
          {todo.due_date && (
            <span className={overdue ? "text-red-500 dark:text-red-400" : ""}>
              {overdue ? "overdue · " : ""}{format(parseISO(todo.due_date), "MMM d")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
