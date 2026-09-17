"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Todo, TeamMember } from "@/lib/types";
import { Calendar, Check, CheckCircle2, ChevronDown, Pencil, Plus, Trash2, UserCircle2, X } from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { usePanelState } from "@/lib/panel-cache";
import { refreshNav } from "@/lib/ui-events";
import { Button, IconButton } from "@/components/ui/button";
import { confirmDialog, toast } from "@/components/ui/host";
import { Badge, Card, EmptyState, SectionHeader } from "@/components/ui/display";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { DueBadge, MemberAvatar, dueBucket, type DueBucket } from "@/components/team-panel";

type Priority = "low" | "medium" | "high";
type TodoPatch = { title?: string; due_date?: string | null; priority?: Priority };

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const GROUPS: { key: DueBucket; title: string }[] = [
  { key: "overdue", title: "Overdue" },
  { key: "today", title: "Today" },
  { key: "week", title: "This week" },
  { key: "later", title: "Later" },
  { key: "none", title: "No date" },
];

/** Same ordering the server uses: priority, then due date (undated last), then newest. */
function byPriorityThenDate(a: Todo, b: Todo) {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
    b.created_at - a.created_at
  );
}

const COMPLETE_DELAY_MS = 320;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function TodosPanel({
  businessId,
  initial,
  members,
  openId,
  autoNew,
}: {
  businessId: string;
  initial: Todo[];
  members: TeamMember[];
  openId?: number;
  autoNew?: boolean;
}) {
  const [todos, setTodos] = usePanelState("todos", initial);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [composerActive, setComposerActive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState<Set<number>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const todosRef = useRef(todos);
  const shareHeaders = useShareHeaders();

  // Latest todos for async handlers (rollbacks, undo) without stale closures.
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  // Collapse the composer when the pointer goes elsewhere (not on blur, so
  // clicks on its own controls never race with an unmount).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (composerRef.current && !composerRef.current.contains(e.target as Node)) setComposerActive(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!autoNew) return;
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [autoNew]);

  // Deep link: reveal, scroll to and briefly highlight the requested todo.
  useEffect(() => {
    if (openId == null) return;
    const target = todosRef.current.find((t) => t.id === openId);
    if (!target) return;
    if (target.status === "done") setShowDone(true);
    setHighlightId(openId);
    const scroll = setTimeout(() => {
      document.getElementById(`todo-${openId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    const clear = setTimeout(() => setHighlightId(null), 2400);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, [openId]);

  function focusComposer() {
    setComposerActive(true);
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function resetComposer() {
    setTitle("");
    setDueDate("");
    setPriority("medium");
    setAssigneeIds([]);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({
          business_id: businessId,
          title: title.trim(),
          due_date: dueDate || undefined,
          priority,
          assignee_ids: assigneeIds,
        }),
      });
      if (!res.ok) throw new Error("failed");
      const created: Todo = await res.json();
      setTodos((prev) => [created, ...prev]);
      resetComposer();
      refreshNav();
      titleRef.current?.focus();
    } catch {
      toast("Could not add todo", { tone: "error" });
    } finally {
      setAdding(false);
    }
  }

  /** The API toggles status; `next` is what we expect it to become. */
  async function setStatus(id: number, next: "open" | "done") {
    const before = todosRef.current.find((t) => t.id === id);
    if (!before || before.status === next) return;
    const request = fetch(`/api/todos/${id}`, { method: "PATCH", headers: shareHeaders }).catch(() => null);

    if (next === "done") {
      // Hold the row for a beat with a strike-through before it leaves the list.
      setCompleting((prev) => new Set(prev).add(id));
      await sleep(COMPLETE_DELAY_MS);
    }
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: next, completed_at: next === "done" ? Math.floor(Date.now() / 1000) : null }
          : t
      )
    );
    setCompleting((prev) => {
      if (!prev.has(id)) return prev;
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
    if (next === "done") {
      toast("Completed", { action: { label: "Undo", onClick: () => setStatus(id, "open") } });
    }

    const res = await request;
    if (res?.ok) {
      const updated: Todo = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
      refreshNav();
    } else {
      setTodos((prev) => prev.map((t) => (t.id === id ? before : t)));
      toast(next === "done" ? "Could not complete todo" : "Could not reopen todo", { tone: "error" });
    }
  }

  async function update(id: number, patch: TodoPatch) {
    const before = todosRef.current.find((t) => t.id === id);
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res?.ok) {
      const updated: Todo = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } else {
      if (before) setTodos((prev) => prev.map((t) => (t.id === id ? before : t)));
      toast("Could not save todo", { tone: "error" });
    }
  }

  async function setAssignees(id: number, ids: number[]) {
    const before = todosRef.current.find((t) => t.id === id);
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, assignee_ids: ids } : t)));
    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ assignee_ids: ids }),
    }).catch(() => null);
    if (!res?.ok) {
      if (before) setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, assignee_ids: before.assignee_ids } : t)));
      toast("Could not update assignees", { tone: "error" });
    }
  }

  async function remove(id: number) {
    const ok = await confirmDialog({ title: "Delete this todo?", destructive: true, confirmLabel: "Delete" });
    if (!ok) return;
    const snapshot = todosRef.current;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE", headers: shareHeaders }).catch(() => null);
    if (res?.ok) {
      refreshNav();
    } else {
      const removed = snapshot.find((t) => t.id === id);
      if (removed) setTodos((prev) => (prev.some((t) => t.id === id) ? prev : [removed, ...prev]));
      toast("Could not delete todo", { tone: "error" });
    }
  }

  const { open, done, groups, overdueCount } = useMemo(() => {
    const open = todos.filter((t) => t.status === "open").sort(byPriorityThenDate);
    const done = todos
      .filter((t) => t.status === "done")
      .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));
    const buckets: Record<DueBucket, Todo[]> = { overdue: [], today: [], week: [], later: [], none: [] };
    for (const t of open) buckets[dueBucket(t.due_date)].push(t);
    const groups = GROUPS.map((g) => ({ ...g, items: buckets[g.key] })).filter((g) => g.items.length > 0);
    return { open, done, groups, overdueCount: buckets.overdue.length };
  }, [todos]);

  const expanded = composerActive || title.length > 0 || dueDate !== "" || assigneeIds.length > 0;

  const rowProps = { members, onDelete: remove, onSetAssignees: setAssignees, onUpdate: update };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
        <span>
          <span className="font-medium tabular-nums text-ink">{open.length}</span> open
        </span>
        {overdueCount > 0 && (
          <span className="text-red-600 dark:text-red-400">
            <span className="font-medium tabular-nums">{overdueCount}</span> overdue
          </span>
        )}
      </div>

      {/* Composer */}
      <Card className="mb-6 overflow-visible! transition-shadow focus-within:shadow-lift">
        <form
          ref={composerRef}
          onSubmit={add}
          onFocus={() => setComposerActive(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              resetComposer();
              setComposerActive(false);
              (document.activeElement as HTMLElement | null)?.blur();
            }
          }}
        >
          <label className="flex h-12 cursor-text items-center gap-3 px-4 md:h-11">
            <Plus size={15} className="shrink-0 text-ink-3" />
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a todo…"
              aria-label="New todo"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
            />
          </label>
          {expanded && (
            <div className="fade-in flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
              <TodoControls
                priority={priority}
                onPriority={setPriority}
                dueDate={dueDate}
                onDueDate={setDueDate}
                members={members}
                assigneeIds={assigneeIds}
                onAssignees={setAssigneeIds}
              />
              <Button type="submit" variant="primary" size="sm" className="ml-auto" disabled={!title.trim()} loading={adding}>
                Add
              </Button>
            </div>
          )}
        </form>
      </Card>

      {/* Open todos, grouped by urgency */}
      {open.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={18} />}
          title="All clear"
          body="Nothing open right now. Add the next thing on your mind."
          action={
            <Button onClick={focusComposer}>
              <Plus size={14} /> Add a todo
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <SectionHeader title={g.title} count={g.items.length} />
              <Card className="overflow-visible!">
                <div className="divide-y divide-line">
                  {g.items.map((t) => (
                    <TodoRow
                      key={t.id}
                      todo={t}
                      completing={completing.has(t.id)}
                      highlighted={highlightId === t.id}
                      onToggle={(id) => setStatus(id, "done")}
                      {...rowProps}
                    />
                  ))}
                </div>
              </Card>
            </section>
          ))}
        </div>
      )}

      {/* Done */}
      {done.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <ChevronDown size={13} className={cn("transition-transform", !showDone && "-rotate-90")} />
            {showDone ? "Hide completed" : `Show ${done.length} completed`}
          </button>
          {showDone && (
            <Card className="mt-2 overflow-visible!">
              <div className="divide-y divide-line">
                {done.map((t) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    highlighted={highlightId === t.id}
                    onToggle={(id) => setStatus(id, "open")}
                    {...rowProps}
                  />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared controls (composer and inline edit) ───────────────────────────────

const compactDateClass =
  "h-8 md:h-7 rounded-lg border border-line-strong bg-raised pl-7 pr-2 text-xs outline-none " +
  "transition-[border-color,box-shadow] duration-150 hover:border-ink-4 focus:border-ink-3 focus:ring-[3px] focus:ring-ink/10";

function TodoControls({
  priority,
  onPriority,
  dueDate,
  onDueDate,
  members,
  assigneeIds,
  onAssignees,
}: {
  priority: Priority;
  onPriority: (p: Priority) => void;
  dueDate: string;
  onDueDate: (d: string) => void;
  members: TeamMember[];
  assigneeIds: number[];
  onAssignees: (ids: number[]) => void;
}) {
  return (
    <>
      <Segmented size="sm" options={PRIORITY_OPTIONS} value={priority} onChange={onPriority} />
      <div className="relative">
        <Calendar size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => onDueDate(e.target.value)}
          aria-label="Due date"
          title="Due date"
          className={cn(compactDateClass, dueDate ? "text-ink" : "text-ink-3")}
        />
      </div>
      {members.length > 0 && (
        <AssigneeMenu members={members} selected={assigneeIds} onChange={onAssignees}>
          {(toggle) => {
            const picked = members.filter((m) => assigneeIds.includes(m.id));
            return (
              <Button size="sm" onClick={toggle} aria-label="Assignees">
                {picked.length === 0 ? (
                  <>
                    <UserCircle2 size={13} className="text-ink-3" /> Assign
                  </>
                ) : (
                  <AvatarStack members={picked} />
                )}
              </Button>
            );
          }}
        </AssigneeMenu>
      )}
    </>
  );
}

/** Overlapping assignee initials, capped at three. */
function AvatarStack({ members }: { members: TeamMember[] }) {
  return (
    <span className="flex items-center -space-x-1.5">
      {members.slice(0, 3).map((m) => (
        <MemberAvatar key={m.id} member={m} size="sm" className="ring-2 ring-raised" />
      ))}
      {members.length > 3 && (
        <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-sunken px-1 text-[11px] font-medium tabular-nums text-ink-2 ring-2 ring-raised">
          +{members.length - 3}
        </span>
      )}
    </span>
  );
}

// ── Assignee picker ──────────────────────────────────────────────────────────

/** Trigger plus multi-select popover. Closes on outside click or Esc. */
function AssigneeMenu({
  members,
  selected,
  onChange,
  align = "left",
  children,
}: {
  members: TeamMember[];
  selected: number[];
  onChange: (ids: number[]) => void;
  align?: "left" | "right";
  children: (toggle: () => void, open: boolean) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function toggleMember(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="relative" ref={ref}>
      {children(() => setOpen((v) => !v), open)}
      {open && (
        <div
          role="menu"
          className={cn(
            "pop-in absolute top-full z-30 mt-1.5 min-w-[200px] rounded-xl border border-line bg-raised p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {members.map((m) => {
            const checked = selected.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                onClick={() => toggleMember(m.id)}
                className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-ink transition-colors hover:bg-hover md:h-8"
              >
                <MemberAvatar member={m} size="sm" />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {checked && <Check size={13} className="shrink-0 text-ink-2" />}
              </button>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg border-t border-line px-2 text-left text-xs text-ink-3 transition-colors hover:bg-hover hover:text-ink md:h-8"
            >
              <X size={12} /> Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Todo row ─────────────────────────────────────────────────────────────────

function TodoRow({
  todo,
  members,
  completing = false,
  highlighted = false,
  onToggle,
  onDelete,
  onSetAssignees,
  onUpdate,
}: {
  todo: Todo;
  members: TeamMember[];
  completing?: boolean;
  highlighted?: boolean;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onSetAssignees: (id: number, ids: number[]) => void;
  onUpdate: (id: number, patch: TodoPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDueDate, setEditDueDate] = useState(todo.due_date ?? "");
  const [editPriority, setEditPriority] = useState<Priority>(todo.priority);
  const editTitleRef = useRef<HTMLInputElement>(null);
  const isDone = todo.status === "done";
  const struck = isDone || completing;
  const assignees = members.filter((m) => todo.assignee_ids?.includes(m.id));

  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => editTitleRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [editing]);

  function startEdit() {
    setEditTitle(todo.title);
    setEditDueDate(todo.due_date ?? "");
    setEditPriority(todo.priority);
    setEditing(true);
  }

  function saveEdit() {
    if (!editTitle.trim()) return;
    onUpdate(todo.id, {
      title: editTitle.trim(),
      due_date: editDueDate || null,
      priority: editPriority,
    });
    setEditing(false);
  }

  const shell = cn(
    "first:rounded-t-xl last:rounded-b-xl transition-[background-color,box-shadow] duration-300",
    highlighted && "relative z-10 bg-brand-soft ring-2 ring-brand/40"
  );

  // ── Edit mode ──
  if (editing) {
    return (
      <form
        id={`todo-${todo.id}`}
        className={cn(shell, "bg-sunken/60 px-4 py-3")}
        onSubmit={(e) => {
          e.preventDefault();
          saveEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      >
        <input
          ref={editTitleRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          aria-label="Todo title"
          className="h-10 w-full rounded-lg border border-line-strong bg-raised px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-4 hover:border-ink-4 focus:border-ink-3 focus:ring-[3px] focus:ring-ink/10 md:h-9"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TodoControls
            priority={editPriority}
            onPriority={setEditPriority}
            dueDate={editDueDate}
            onDueDate={setEditDueDate}
            members={members}
            assigneeIds={todo.assignee_ids ?? []}
            onAssignees={(ids) => onSetAssignees(todo.id, ids)}
          />
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={!editTitle.trim()}>
              Save
            </Button>
          </div>
        </div>
      </form>
    );
  }

  // ── Normal view ──
  return (
    <div id={`todo-${todo.id}`} className={cn(shell, "group flex items-start gap-3 px-4 py-3 hover:bg-hover")}>
      <button
        type="button"
        onClick={() => !completing && onToggle(todo.id)}
        aria-label={isDone ? "Reopen todo" : "Complete todo"}
        title={isDone ? "Reopen" : "Complete"}
        className="group/check -m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      >
        <span
          className={cn(
            "flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] transition-colors",
            completing
              ? "border-emerald-500 bg-emerald-500 text-white"
              : isDone
                ? "border-transparent bg-ink-4 text-raised group-hover/check:bg-ink-3"
                : "border-line-strong text-transparent group-hover/check:border-ink-3 group-hover/check:text-ink-3"
          )}
        >
          <Check size={11} strokeWidth={3} />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          onDoubleClick={startEdit}
          className={cn(
            "min-w-0 break-words text-sm leading-5 transition-colors",
            struck ? "text-ink-3 line-through" : "font-medium text-ink"
          )}
        >
          {todo.title}
        </span>
        {todo.due_date && <DueBadge dueDate={todo.due_date} muted={struck} />}
        {!struck && todo.priority === "high" && <Badge tone="amber">High</Badge>}
        {!struck && todo.priority === "low" && <span className="text-xs text-ink-3">Low</span>}
        {assignees.length > 0 && (
          <span className={cn(struck && "opacity-60")}>
            <AvatarStack members={assignees} />
          </span>
        )}
      </div>

      <div className="-my-1 flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
        <IconButton label="Edit" size="sm" onClick={startEdit}>
          <Pencil size={13} />
        </IconButton>
        {members.length > 0 && (
          <AssigneeMenu
            members={members}
            selected={todo.assignee_ids ?? []}
            onChange={(ids) => onSetAssignees(todo.id, ids)}
            align="right"
          >
            {(toggle) => (
              <IconButton label="Assign" size="sm" onClick={toggle}>
                <UserCircle2 size={14} />
              </IconButton>
            )}
          </AssigneeMenu>
        )}
        <IconButton label="Delete" size="sm" variant="danger" onClick={() => onDelete(todo.id)}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}
