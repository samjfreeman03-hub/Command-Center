"use client";

import { useState } from "react";
import type { TeamMember, Todo } from "@/lib/types";
import { AlertCircle, Calendar, ChevronDown, Plus, Trash2, Users } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { useShareHeaders } from "@/lib/share-context";
import { usePanelState, usePanelValue } from "@/lib/panel-cache";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog, toast } from "@/components/ui/host";
import { Badge, Card, EmptyState, SectionHeader } from "@/components/ui/display";
import { cn } from "@/lib/cn";

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
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function MemberAvatar({
  member,
  size = "md",
  className,
}: {
  member: TeamMember;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const color = MEMBER_COLORS[member.color_index % MEMBER_COLORS.length];
  const sz =
    size === "sm" ? "h-[22px] w-[22px] text-[11px]" : size === "lg" ? "h-10 w-10 text-base" : "h-8 w-8 text-xs";
  return (
    <span
      title={member.name}
      className={cn(sz, color.bg, "flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
    >
      {memberInitials(member.name)}
    </span>
  );
}

// ── Due date helpers (shared with the Todos panel) ───────────────────────────

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

/** Buckets a `YYYY-MM-DD` due date against the local calendar day. */
export function dueBucket(dueDate: string | null | undefined): DueBucket {
  if (!dueDate) return "none";
  const d = dueDate.slice(0, 10);
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  if (d < today) return "overdue";
  if (d === today) return "today";
  if (d <= format(addDays(now, 7), "yyyy-MM-dd")) return "week";
  return "later";
}

/** Due date chip: red with an alert icon when overdue, amber today, neutral otherwise. */
export function DueBadge({ dueDate, muted }: { dueDate: string; muted?: boolean }) {
  const bucket = muted ? "later" : dueBucket(dueDate);
  const label = format(parseISO(dueDate.slice(0, 10)), "MMM d");
  if (bucket === "overdue") {
    return (
      <Badge tone="red">
        <AlertCircle size={11} /> {label}
      </Badge>
    );
  }
  return (
    <Badge tone={bucket === "today" ? "amber" : "neutral"} className={muted ? "opacity-60" : undefined}>
      <Calendar size={11} /> {bucket === "today" ? "Today" : label}
    </Badge>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

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
  const [members, setMembers] = usePanelState("members", initialMembers);
  const todos = usePanelValue<Todo[]>("todos", initialTodos);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const shareHeaders = useShareHeaders();

  function updateMembers(next: TeamMember[]) {
    setMembers(next);
    onMembersChange(next);
  }

  function closeAdd() {
    setShowAdd(false);
    setName("");
    setTitle("");
  }

  async function addMember() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({ business_id: businessId, name: name.trim(), title: title.trim() || undefined }),
      });
      if (!res.ok) throw new Error("failed");
      const created: TeamMember = await res.json();
      updateMembers([...members, created]);
      closeAdd();
    } catch {
      toast("Could not add member", { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(m: TeamMember) {
    const ok = await confirmDialog({
      title: `Remove ${m.name}?`,
      description: "Their todo assignments will be cleared.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const prev = members;
    updateMembers(members.filter((x) => x.id !== m.id));
    try {
      const res = await fetch(`/api/team/${m.id}`, { method: "DELETE", headers: shareHeaders });
      if (!res.ok) throw new Error("failed");
    } catch {
      updateMembers(prev);
      toast("Could not remove member", { tone: "error" });
    }
  }

  function toggleCollapsed(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const memberIds = new Set(members.map((m) => m.id));
  const openTodos = todos.filter((t) => t.status === "open");
  // A todo whose only assignees were removed counts as unassigned.
  const unassigned = openTodos.filter((t) => !(t.assignee_ids ?? []).some((id) => memberIds.has(id)));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-ink-3">
          <span className="font-medium tabular-nums text-ink">{members.length}</span>{" "}
          {members.length === 1 ? "member" : "members"},{" "}
          <span className="font-medium tabular-nums text-ink">{openTodos.length}</span> open{" "}
          {openTodos.length === 1 ? "todo" : "todos"}
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add member
        </Button>
      </div>

      {members.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={18} />}
            title="No team members yet"
            body="Add the people you work with so todos can be assigned to them."
            action={
              <Button onClick={() => setShowAdd(true)}>
                <Plus size={14} /> Add member
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="divide-y divide-line">
              {members.map((m) => {
                const mTodos = openTodos.filter((t) => t.assignee_ids?.includes(m.id));
                const isOpen = mTodos.length > 0 && !collapsed.has(m.id);
                return (
                  <div key={m.id}>
                    <div className="group flex items-center gap-1 pr-3 transition-colors hover:bg-hover">
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(m.id)}
                        disabled={mTodos.length === 0}
                        aria-expanded={isOpen}
                        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left"
                      >
                        <MemberAvatar member={m} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">{m.name}</div>
                          {m.title && <div className="truncate text-xs text-ink-3">{m.title}</div>}
                        </div>
                        <Badge className={mTodos.length === 0 ? "opacity-60" : undefined}>
                          <span className="tabular-nums">{mTodos.length}</span> open
                        </Badge>
                        <ChevronDown
                          size={14}
                          className={cn(
                            "shrink-0 text-ink-3 transition-transform",
                            !isOpen && "-rotate-90",
                            mTodos.length === 0 && "invisible"
                          )}
                        />
                      </button>
                      <IconButton
                        label="Remove member"
                        size="sm"
                        variant="danger"
                        onClick={() => removeMember(m)}
                        className="md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                    {isOpen && (
                      <div className="border-t border-line bg-sunken/50 py-1">
                        {mTodos.map((t) => (
                          <TaskRow key={t.id} todo={t} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {unassigned.length > 0 && (
            <div>
              <SectionHeader title="Unassigned" count={unassigned.length} hint="Open todos with no owner" />
              <Card>
                <div className="py-1">
                  {unassigned.map((t) => (
                    <TaskRow key={t.id} todo={t} flush />
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showAdd}
        onClose={closeAdd}
        title="Add member"
        size="sm"
        onSubmit={addMember}
        footer={
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={closeAdd}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!name.trim()} loading={saving}>
              Add member
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoFocus />
          </Field>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Role or title" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function TaskRow({ todo, flush }: { todo: Todo; flush?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5 py-2 pr-4", flush ? "pl-4" : "pl-[60px]")}>
      <span
        className={cn(
          "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
          todo.priority === "high" ? "bg-amber-500" : todo.priority === "low" ? "bg-ink-4/50" : "bg-ink-4"
        )}
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 text-[13px] leading-5 text-ink">{todo.title}</span>
        {todo.due_date && <DueBadge dueDate={todo.due_date} />}
        {todo.priority === "high" && <Badge tone="amber">High</Badge>}
        {todo.priority === "low" && <span className="text-xs text-ink-3">Low</span>}
      </div>
    </div>
  );
}
