"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import type { Todo, TeamMember } from "@/lib/types";
import { Check, Plus, Trash2, UserCircle2, Calendar, Flag, ChevronDown, X, Pencil } from "lucide-react";
import { format, parseISO, isPast, isToday } from "date-fns";
import { useShareHeaders } from "@/lib/share-context";
import { MemberAvatar, MEMBER_COLORS, memberInitials } from "@/components/team-panel";

export function TodosPanel({
  businessId,
  initial,
  members,
}: {
  businessId: string;
  initial: Todo[];
  members: TeamMember[];
}) {
  const [todos, setTodos] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();
  const shareHeaders = useShareHeaders();

  useEffect(() => {
    if (showAdd) setTimeout(() => titleRef.current?.focus(), 50);
  }, [showAdd]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowAssignPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
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
    if (res.ok) {
      const created: Todo = await res.json();
      setTodos((prev) => [created, ...prev]);
      setTitle("");
      setDueDate("");
      setPriority("medium");
      setAssigneeIds([]);
      titleRef.current?.focus();
    }
  }

  function cancelAdd() {
    setShowAdd(false);
    setTitle("");
    setDueDate("");
    setPriority("medium");
    setAssigneeIds([]);
    setShowAssignPicker(false);
  }

  async function toggle(id: number) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t))
    );
    startTransition(async () => {
      const res = await fetch(`/api/todos/${id}`, { method: "PATCH", headers: shareHeaders });
      if (res.ok) {
        const updated: Todo = await res.json();
        setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
      }
    });
  }

  async function update(id: number, patch: { title?: string; due_date?: string | null; priority?: "low" | "medium" | "high" }) {
    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated: Todo = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }

  async function setAssignees(id: number, ids: number[]) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, assignee_ids: ids } : t)));
    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ assignee_ids: ids }),
    });
  }

  async function remove(id: number) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/todos/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  const open = todos.filter((t) => t.status === "open");
  const done = todos.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">

      {/* ── Add form / trigger ── */}
      {showAdd ? (
        <form
          onSubmit={add}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm"
        >
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && cancelAdd()}
            placeholder="What needs to get done?"
            className="w-full px-4 py-4 text-sm bg-transparent outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-900"
          />
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap bg-zinc-50/50 dark:bg-zinc-900/30">
            {/* Due date */}
            <div className="relative">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-8 pl-8 pr-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
              />
              <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>

            {/* Priority */}
            <div className="relative">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
                className="h-8 pl-8 pr-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-zinc-400 dark:focus:border-zinc-600 appearance-none transition-colors"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <Flag size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>

            {/* Assign */}
            {members.length > 0 && (
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setShowAssignPicker((v) => !v)}
                  className="h-8 px-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  {assigneeIds.length === 0 ? (
                    <><UserCircle2 size={13} /> Assign</>
                  ) : (
                    <div className="flex items-center gap-1">
                      {assigneeIds.slice(0, 3).map((mid) => {
                        const m = members.find((x) => x.id === mid);
                        return m ? <MemberAvatar key={mid} member={m} size="sm" /> : null;
                      })}
                      {assigneeIds.length > 3 && <span>+{assigneeIds.length - 3}</span>}
                    </div>
                  )}
                </button>
                {showAssignPicker && (
                  <AssigneePicker members={members} selected={assigneeIds} onChange={setAssigneeIds} />
                )}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={cancelAdd}
                className="h-8 px-3 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="h-8 px-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
              >
                <Plus size={13} /> Add
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full h-11 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 text-sm text-zinc-400 dark:text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-all inline-flex items-center justify-center gap-2"
        >
          <Plus size={15} />
          Add todo
        </button>
      )}

      {/* ── Open todos ── */}
      <Section title="Open" count={open.length}>
        {open.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-600">
            Nothing open. Nice work.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {open.map((t) => (
              <TodoRow key={t.id} todo={t} members={members} onToggle={toggle} onDelete={remove} onSetAssignees={setAssignees} onUpdate={update} />
            ))}
          </div>
        )}
      </Section>

      {/* ── Done todos ── */}
      {done.length > 0 && (
        <Section title="Done" count={done.length} muted>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {done.map((t) => (
              <TodoRow key={t.id} todo={t} members={members} onToggle={toggle} onDelete={remove} onSetAssignees={setAssignees} onUpdate={update} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Assignee picker ───────────────────────────────────────────────────────────

function AssigneePicker({
  members,
  selected,
  onChange,
}: {
  members: TeamMember[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="absolute left-0 top-full mt-1.5 z-20 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg py-1.5 min-w-[168px]">
      {selected.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-900 mb-1 flex items-center gap-1.5"
        >
          <X size={10} /> Clear all
        </button>
      )}
      {members.map((m) => {
        const color = MEMBER_COLORS[m.color_index % MEMBER_COLORS.length];
        const checked = selected.includes(m.id);
        return (
          <button
            key={m.id}
            onClick={() => toggle(m.id)}
            className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center gap-2.5"
          >
            <div className={`w-5 h-5 rounded-full ${color.bg} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}>
              {memberInitials(m.name)}
            </div>
            <span className="flex-1">{m.name}</span>
            {checked && <Check size={11} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

// ── Todo row ──────────────────────────────────────────────────────────────────

const PRIORITY_META = {
  high:   { dot: "bg-amber-500",  chip: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30" },
  medium: { dot: "bg-zinc-400",   chip: "text-zinc-500 bg-zinc-100 dark:bg-zinc-900" },
  low:    { dot: "bg-zinc-300 dark:bg-zinc-700", chip: "text-zinc-400 bg-zinc-50 dark:bg-zinc-900" },
};

function TodoRow({
  todo,
  members,
  onToggle,
  onDelete,
  onSetAssignees,
  onUpdate,
}: {
  todo: Todo;
  members: TeamMember[];
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onSetAssignees: (id: number, ids: number[]) => void;
  onUpdate: (id: number, patch: { title?: string; due_date?: string | null; priority?: "low" | "medium" | "high" }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDueDate, setEditDueDate] = useState(todo.due_date ?? "");
  const [editPriority, setEditPriority] = useState<"low" | "medium" | "high">(todo.priority);
  const [showAssign, setShowAssign] = useState(false);
  const [showEditAssign, setShowEditAssign] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const editPickerRef = useRef<HTMLDivElement>(null);
  const editTitleRef = useRef<HTMLInputElement>(null);
  const isDone = todo.status === "done";
  const overdue =
    todo.due_date && !isDone
      ? isPast(parseISO(todo.due_date)) && !isToday(parseISO(todo.due_date))
      : false;
  const assignees = members.filter((m) => todo.assignee_ids?.includes(m.id));
  const pm = PRIORITY_META[todo.priority];

  useEffect(() => {
    if (editing) setTimeout(() => editTitleRef.current?.focus(), 30);
  }, [editing]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowAssign(false);
      if (editPickerRef.current && !editPickerRef.current.contains(e.target as Node)) setShowEditAssign(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function startEdit() {
    setEditTitle(todo.title);
    setEditDueDate(todo.due_date ?? "");
    setEditPriority(todo.priority);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setShowEditAssign(false);
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

  // ── Edit mode ──
  if (editing) {
    return (
      <div className="py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm my-1">
        <input
          ref={editTitleRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
          className="w-full px-4 py-3 text-sm bg-transparent outline-none text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-900"
        />
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap bg-zinc-50/50 dark:bg-zinc-900/30">
          {/* Due date */}
          <div className="relative">
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="h-8 pl-8 pr-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
            />
            <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
          {/* Priority */}
          <div className="relative">
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value as "low" | "medium" | "high")}
              className="h-8 pl-8 pr-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-zinc-400 dark:focus:border-zinc-600 appearance-none transition-colors"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <Flag size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
          {/* Assign */}
          {members.length > 0 && (
            <div className="relative" ref={editPickerRef}>
              <button
                type="button"
                onClick={() => setShowEditAssign((v) => !v)}
                className="h-8 px-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                {(todo.assignee_ids?.length ?? 0) === 0 ? (
                  <><UserCircle2 size={13} /> Assign</>
                ) : (
                  <div className="flex items-center gap-1">
                    {assignees.slice(0, 3).map((m) => <MemberAvatar key={m.id} member={m} size="sm" />)}
                    {assignees.length > 3 && <span>+{assignees.length - 3}</span>}
                  </div>
                )}
              </button>
              {showEditAssign && (
                <AssigneePicker
                  members={members}
                  selected={todo.assignee_ids ?? []}
                  onChange={(ids) => { onSetAssignees(todo.id, ids); setShowEditAssign(false); }}
                />
              )}
            </div>
          )}
          {/* Actions */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={cancelEdit}
              className="h-8 px-3 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={!editTitle.trim()}
              className="h-8 px-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal view ──
  return (
    <div className="flex items-start gap-3 py-3.5 group">
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo.id)}
        className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
          isDone
            ? "bg-emerald-500 border-emerald-500"
            : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-500"
        }`}
      >
        {isDone && <Check size={10} className="text-white" strokeWidth={3} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm leading-snug ${isDone ? "line-through text-zinc-400 dark:text-zinc-600" : "text-zinc-900 dark:text-zinc-100"}`}>
          {todo.title}
        </div>
        {(todo.due_date || todo.priority !== "medium" || assignees.length > 0) && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {todo.due_date && (
              <span className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-md font-medium ${
                overdue
                  ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                  : isDone ? "text-zinc-400 bg-zinc-50 dark:bg-zinc-900"
                  : "text-zinc-500 bg-zinc-50 dark:bg-zinc-900"
              }`}>
                {overdue ? "⚠ " : ""}{format(parseISO(todo.due_date), "MMM d")}
              </span>
            )}
            {todo.priority !== "medium" && !isDone && (
              <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-medium ${pm.chip}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pm.dot} shrink-0`} />
                {todo.priority}
              </span>
            )}
            {assignees.length > 0 && (
              <div className="flex -space-x-1 ml-0.5">
                {assignees.slice(0, 3).map((m) => <MemberAvatar key={m.id} member={m} size="sm" />)}
                {assignees.length > 3 && (
                  <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-white dark:border-zinc-950 flex items-center justify-center text-[9px] font-medium">
                    +{assignees.length - 3}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
        <button
          onClick={startEdit}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        {members.length > 0 && (
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowAssign((v) => !v)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              title="Assign"
            >
              <UserCircle2 size={14} />
            </button>
            {showAssign && (
              <div className="absolute right-0 top-8 z-20">
                <AssigneePicker
                  members={members}
                  selected={todo.assignee_ids ?? []}
                  onChange={(ids) => { onSetAssignees(todo.id, ids); setShowAssign(false); }}
                />
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => onDelete(todo.id)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  count,
  muted,
  children,
}: {
  title: string;
  count: number;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${muted ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-500"}`}>
          {title}
        </h2>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full text-zinc-500 bg-zinc-100 dark:bg-zinc-900">
          {count}
        </span>
      </div>
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4">
        {children}
      </div>
    </div>
  );
}
