"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { Lead, LeadAttachment, LeadCategory } from "@/lib/types";
import { LEAD_STAGES } from "@/lib/types";
import {
  Plus,
  Trash2,
  Link2,
  Paperclip,
  X,
  Upload,
  ExternalLink,
  Download,
  TrendingUp,
  Settings2,
  Search,
  CalendarDays,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { usePanelState } from "@/lib/panel-cache";
import { cn } from "@/lib/cn";
import { categoryColor, CategoryBadges, CategoryMultiSelect, CatPill } from "@/components/category-ui";
import { AutoTextarea } from "@/components/auto-textarea";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select, PrefixInput, Field, textareaClass, FieldGroup } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog, toast } from "@/components/ui/host";
import { EmptyState } from "@/components/ui/display";
import { Segmented } from "@/components/ui/segmented";

type Stage = Lead["stage"];

const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

const UNCATEGORIZED = "__uncategorized__";

function money(cents: number | null) {
  if (!cents) return "";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function isClosed(stage: Stage) {
  return stage === "won" || stage === "lost";
}

/** Local YYYY-MM-DD, comparable as a string with next_action_date. */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

type Editor = { mode: "new" } | { mode: "edit"; id: number } | null;

export function PipelinePanel({
  businessId,
  initial,
  categories: initialCategories = [],
  categoriesEnabled = false,
  openId,
  autoNew,
}: {
  businessId: string;
  initial: Lead[];
  categories?: LeadCategory[];
  categoriesEnabled?: boolean;
  openId?: number;
  autoNew?: boolean;
}) {
  const [leads, setLeads] = usePanelState("leads", initial);
  const [editor, setEditor] = useState<Editor>(autoNew ? { mode: "new" } : null);
  const [cats, setCats] = useState<LeadCategory[]>(initialCategories);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [showManageCats, setShowManageCats] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [mobileStage, setMobileStage] = useState<Stage>("new");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  // Attachment counts are only known once a lead's editor has loaded them.
  const [attachmentCounts, setAttachmentCounts] = useState<Record<number, number>>({});
  const shareHeaders = useShareHeaders();

  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  // Deep link: open that lead's editor on mount and whenever openId changes.
  useEffect(() => {
    if (openId == null) return;
    const lead = leadsRef.current.find((l) => l.id === openId);
    if (lead) {
      setEditor({ mode: "edit", id: lead.id });
      setMobileStage(lead.stage);
    }
  }, [openId]);

  const catNames = cats.map((c) => c.name);

  async function addCategory() {
    const name = newCatName.trim();
    if (!name || addingCat) return;
    setAddingCat(true);
    try {
      const res = await fetch("/api/lead-categories", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({ business_id: businessId, name }),
      });
      if (res.ok) {
        const created: LeadCategory = await res.json();
        setCats((prev) => [...prev, created]);
        setNewCatName("");
      } else if (res.status === 409) {
        toast("A category with that name already exists", { tone: "error" });
      } else {
        toast("Could not add the category", { tone: "error" });
      }
    } catch {
      toast("Could not add the category", { tone: "error" });
    } finally {
      setAddingCat(false);
    }
  }

  async function deleteCategory(cat: LeadCategory) {
    const ok = await confirmDialog({
      title: `Delete the "${cat.name}" category?`,
      description: "Leads tagged with it will become uncategorized.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const prevCats = cats;
    const prevLeads = leadsRef.current;
    setCats((prev) => prev.filter((c) => c.id !== cat.id));
    setLeads((prev) =>
      prev.map((l) => (l.categories.includes(cat.name) ? { ...l, categories: l.categories.filter((c) => c !== cat.name) } : l))
    );
    if (categoryFilter === cat.name) setCategoryFilter("all");
    const res = await fetch(`/api/lead-categories/${cat.id}`, { method: "DELETE", headers: shareHeaders }).catch(() => null);
    if (!res?.ok) {
      setCats(prevCats);
      setLeads(prevLeads);
      toast("Could not delete the category", { tone: "error" });
    }
  }

  async function add(form: NewLeadForm): Promise<boolean> {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ business_id: businessId, ...form }),
    }).catch(() => null);
    if (res?.ok) {
      const created: Lead = await res.json();
      setLeads((prev) => [created, ...prev]);
      setMobileStage(created.stage);
      setEditor(null);
      return true;
    }
    toast("Could not create the lead", { tone: "error" });
    return false;
  }

  /** Optimistic PATCH. Rolls back and reports `failMessage` when the request fails. */
  async function update(id: number, patch: Partial<Lead>, failMessage = "Could not save the lead"): Promise<boolean> {
    const before = leadsRef.current.find((l) => l.id === id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res?.ok) {
      const updated: Lead = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === id ? updated : l)));
      return true;
    }
    if (before) setLeads((prev) => prev.map((l) => (l.id === id ? before : l)));
    toast(failMessage, { tone: "error" });
    return false;
  }

  async function moveLead(id: number, stage: Stage) {
    const lead = leadsRef.current.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    const ok = await update(id, { stage }, "Could not move the lead");
    if (ok && stage === "won") toast("Marked as won", { tone: "success" });
  }

  /** Saving from the modal with a stage change: same PATCH, plus the won toast. */
  async function moveLeadWithPatch(id: number, patch: Partial<Lead>) {
    const ok = await update(id, patch);
    if (ok && patch.stage === "won") toast("Marked as won", { tone: "success" });
  }

  async function remove(id: number) {
    const ok = await confirmDialog({
      title: "Delete this lead?",
      description: "Its notes and attachments will be removed too.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const prevLeads = leadsRef.current;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setEditor(null);
    const res = await fetch(`/api/leads/${id}`, { method: "DELETE", headers: shareHeaders }).catch(() => null);
    if (!res?.ok) {
      setLeads(prevLeads);
      toast("Could not delete the lead", { tone: "error" });
    }
  }

  const active = leads.filter((l) => !isClosed(l.stage));
  const totalPipeline = active.reduce((s, l) => s + (l.value_cents ?? 0), 0);
  const won = leads.filter((l) => l.stage === "won");
  const totalWon = won.reduce((s, l) => s + (l.value_cents ?? 0), 0);

  const showSearch = leads.length > 8;
  const q = showSearch ? query.trim().toLowerCase() : "";

  const byStage = useMemo(() => {
    const map: Record<Stage, Lead[]> = { new: [], contacted: [], qualified: [], proposal: [], won: [], lost: [] };
    for (const l of leads) {
      const catOk =
        !categoriesEnabled ||
        categoryFilter === "all" ||
        (categoryFilter === UNCATEGORIZED ? l.categories.length === 0 : l.categories.includes(categoryFilter));
      if (!catOk) continue;
      if (q && ![l.name, l.company, l.notes].some((v) => v?.toLowerCase().includes(q))) continue;
      map[l.stage]?.push(l);
    }
    return map;
  }, [leads, categoriesEnabled, categoryFilter, q]);

  const editingLead = editor?.mode === "edit" ? leads.find((l) => l.id === editor.id) ?? null : null;
  const filtered = q !== "" || (categoriesEnabled && categoryFilter !== "all");

  function renderCard(l: Lead) {
    return (
      <LeadCard
        key={l.id}
        lead={l}
        allCategories={categoriesEnabled ? catNames : undefined}
        attachmentCount={attachmentCounts[l.id] ?? l.attachment_count ?? 0}
        dragging={draggingId === l.id}
        onOpen={() => setEditor({ mode: "edit", id: l.id })}
        onDragStart={() => setDraggingId(l.id)}
        onDragEnd={() => {
          setDraggingId(null);
          setOverStage(null);
        }}
      />
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 md:min-h-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
              <span>
                <span className="font-medium tabular-nums text-ink">{active.length}</span> active
              </span>
              <span>
                <span className="font-medium tabular-nums text-ink">{money(totalPipeline) || "$0"}</span> pipeline
              </span>
              <span>
                <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{money(totalWon) || "$0"}</span>{" "}
                closed, <span className="tabular-nums">{won.length}</span> won
              </span>
            </div>
            {showSearch && (
              <div className="relative w-full sm:w-60">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search leads"
                  aria-label="Search leads"
                  className="pl-8 md:h-8 md:text-[13px]"
                />
              </div>
            )}
          </div>

          {/* Category filter (feature-flagged per business) */}
          {categoriesEnabled && leads.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <CatPill active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>
                All <span className="tabular-nums opacity-60">{leads.length}</span>
              </CatPill>
              {cats.map((c) => (
                <CatPill
                  key={c.id}
                  active={categoryFilter === c.name}
                  color={categoryColor(catNames, c.name)}
                  onClick={() => setCategoryFilter(c.name)}
                >
                  {c.name}{" "}
                  <span className="tabular-nums opacity-60">{leads.filter((l) => l.categories.includes(c.name)).length}</span>
                </CatPill>
              ))}
              {leads.some((l) => l.categories.length === 0) && (
                <CatPill active={categoryFilter === UNCATEGORIZED} onClick={() => setCategoryFilter(UNCATEGORIZED)}>
                  Uncategorized{" "}
                  <span className="tabular-nums opacity-60">{leads.filter((l) => l.categories.length === 0).length}</span>
                </CatPill>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {categoriesEnabled && (
            <Button onClick={() => setShowManageCats(true)}>
              <Settings2 size={14} /> Manage categories
            </Button>
          )}
          <Button variant="primary" onClick={() => setEditor({ mode: "new" })}>
            <Plus size={14} /> New lead
          </Button>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={18} />}
          title="No leads yet"
          body="Add your first lead to start tracking deals from first contact to won."
          action={
            <Button onClick={() => setEditor({ mode: "new" })}>
              <Plus size={14} /> New lead
            </Button>
          }
        />
      ) : (
        <>
          {/* Board (desktop) */}
          <div className="hidden gap-3 overflow-x-auto pb-3 md:flex">
            {LEAD_STAGES.map((stage) => {
              const stageLeads = byStage[stage];
              const quiet = isClosed(stage);
              const isTarget = overStage === stage && draggingId !== null;
              const total = stageLeads.reduce((s, l) => s + (l.value_cents ?? 0), 0);
              return (
                <section
                  key={stage}
                  aria-label={`${STAGE_LABELS[stage]} stage`}
                  onDragOver={(e) => {
                    if (draggingId === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overStage !== stage) setOverStage(stage);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setOverStage((s) => (s === stage ? null : s));
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = draggingId ?? Number(e.dataTransfer.getData("text/plain"));
                    setDraggingId(null);
                    setOverStage(null);
                    if (id) moveLead(id, stage);
                  }}
                  className={cn(
                    "flex min-h-[420px] w-[280px] shrink-0 flex-col rounded-xl border p-2 transition-colors",
                    isTarget
                      ? "border-dashed border-brand bg-brand-soft"
                      : quiet
                        ? "border-dashed border-line bg-transparent"
                        : "border-transparent bg-sunken"
                  )}
                >
                  <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2.5 pt-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <h2 className={cn("text-[13px] font-semibold", quiet ? "text-ink-3" : "text-ink")}>{STAGE_LABELS[stage]}</h2>
                      <span className="text-xs tabular-nums text-ink-3">{stageLeads.length}</span>
                    </div>
                    {total > 0 && (
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          stage === "won" ? "text-emerald-600 dark:text-emerald-400" : quiet ? "text-ink-3" : "text-ink-2"
                        )}
                      >
                        {money(total)}
                      </span>
                    )}
                  </header>
                  <div className={cn("flex flex-1 flex-col gap-2", quiet && !isTarget && "opacity-75")}>
                    {stageLeads.map(renderCard)}
                    {stageLeads.length === 0 && (
                      <div className="flex flex-1 items-start justify-center px-2 pt-6 text-center text-xs text-ink-4">
                        {isTarget ? "Drop here" : filtered ? "No matches" : "No leads"}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Stage picker + list (mobile, where HTML5 drag is unavailable) */}
          <div className="md:hidden">
            <Segmented
              className="flex-nowrap! w-full overflow-x-auto scrollbar-none"
              value={mobileStage}
              onChange={setMobileStage}
              options={LEAD_STAGES.map((s) => ({
                value: s,
                label: (
                  <span className="whitespace-nowrap">
                    {STAGE_LABELS[s]} <span className="ml-0.5 text-[11px] tabular-nums opacity-60">{byStage[s].length}</span>
                  </span>
                ),
              }))}
            />
            <div className="mt-2 flex items-baseline justify-between px-1 text-xs text-ink-3">
              <span>Open a lead to change its stage</span>
              <span className="font-medium tabular-nums text-ink-2">
                {money(byStage[mobileStage].reduce((s, l) => s + (l.value_cents ?? 0), 0))}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {byStage[mobileStage].map(renderCard)}
              {byStage[mobileStage].length === 0 && (
                <p className="py-10 text-center text-[13px] text-ink-3">
                  {filtered ? "No matching leads in this stage." : `No leads in ${STAGE_LABELS[mobileStage].toLowerCase()} yet.`}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {editor && (editor.mode === "new" || editingLead) && (
        <LeadModal
          key={editor.mode === "edit" ? `edit-${editor.id}` : "new"}
          lead={editingLead}
          categories={categoriesEnabled ? catNames : undefined}
          onClose={() => setEditor(null)}
          onCreate={add}
          onSave={(patch) => {
            if (!editingLead) return;
            if (patch.stage && patch.stage !== editingLead.stage) {
              setMobileStage(patch.stage);
              moveLeadWithPatch(editingLead.id, patch);
            } else {
              update(editingLead.id, patch);
            }
            setEditor(null);
          }}
          onDelete={() => editingLead && remove(editingLead.id)}
          onAttachmentCount={(n) =>
            editingLead && setAttachmentCounts((prev) => (prev[editingLead.id] === n ? prev : { ...prev, [editingLead.id]: n }))
          }
        />
      )}

      <Modal
        open={showManageCats}
        onClose={() => setShowManageCats(false)}
        title="Manage categories"
        description="Categories are shared by the pipeline and the CRM."
        size="sm"
        onSubmit={addCategory}
        footer={
          <>
            <span />
            <Button variant="ghost" onClick={() => setShowManageCats(false)}>
              Done
            </Button>
          </>
        }
      >
        <div className="flex items-end gap-2">
          <Field label="New category" className="min-w-0 flex-1">
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Healthcare"
              autoFocus
            />
          </Field>
          <Button type="submit" disabled={!newCatName.trim()} loading={addingCat} className="md:h-9">
            <Plus size={14} /> Add
          </Button>
        </div>
        {cats.length > 0 ? (
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-1.5 pl-3 pr-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <CategoryBadges names={[c.name]} allNames={catNames} />
                  <span className="text-xs tabular-nums text-ink-3">
                    {leads.filter((l) => l.categories.includes(c.name)).length} leads
                  </span>
                </div>
                <IconButton label={`Delete ${c.name}`} size="sm" variant="danger" onClick={() => deleteCategory(c)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-ink-3">No categories yet. Add one above, then tag leads when you create or edit them.</p>
        )}
      </Modal>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  allCategories,
  attachmentCount,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  lead: Lead;
  allCategories?: string[];
  attachmentCount: number;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const overdue = !!lead.next_action_date && !isClosed(lead.stage) && lead.next_action_date < todayKey();
  const hasNext = !!lead.next_action || !!lead.next_action_date;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(lead.id));
        // Defer so the browser snapshots the card at full opacity for the drag image.
        setTimeout(onDragStart, 0);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-pointer select-none rounded-xl border border-line bg-raised p-3 text-left shadow-card outline-none",
        "transition-[box-shadow,border-color,opacity] duration-150 hover:border-line-strong hover:shadow-lift",
        "focus-visible:border-ink-3 focus-visible:ring-[3px] focus-visible:ring-ink/10 md:cursor-grab md:active:cursor-grabbing",
        dragging && "opacity-40 shadow-lift"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{lead.company || lead.name}</div>
          {lead.company && <div className="mt-0.5 truncate text-xs text-ink-3">{lead.name}</div>}
        </div>
        {lead.value_cents ? (
          <span className="shrink-0 text-[13px] font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
            {money(lead.value_cents)}
          </span>
        ) : null}
      </div>

      {hasNext && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-ink-2">
          <ArrowRight size={13} className="mt-px shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 break-words">{lead.next_action || "Follow up"}</span>
        </div>
      )}

      {(lead.next_action_date || attachmentCount > 0 || (allCategories && lead.categories.length > 0)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {lead.next_action_date && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs tabular-nums",
                overdue ? "font-medium text-red-600 dark:text-red-400" : "text-ink-3"
              )}
            >
              <CalendarDays size={13} />
              {shortDate(lead.next_action_date)}
              {overdue && <span className="sr-only">, overdue</span>}
            </span>
          )}
          {attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs tabular-nums text-ink-3" title="Attachments">
              <Paperclip size={13} />
              {attachmentCount}
            </span>
          )}
          {allCategories && lead.categories.length > 0 && (
            <CategoryBadges names={lead.categories} allNames={allCategories} size="xs" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Create / edit modal ──────────────────────────────────────────────────────

type NewLeadForm = {
  name: string;
  company?: string;
  contact_email?: string;
  stage: Stage;
  value_cents?: number;
  next_action?: string;
  next_action_date?: string;
  notes?: string;
  categories?: string[];
};


function LeadModal({
  lead,
  categories,
  onClose,
  onCreate,
  onSave,
  onDelete,
  onAttachmentCount,
}: {
  /** null = create */
  lead: Lead | null;
  categories?: string[];
  onClose: () => void;
  onCreate: (form: NewLeadForm) => Promise<boolean>;
  onSave: (patch: Partial<Lead>) => void;
  onDelete: () => void;
  onAttachmentCount: (n: number) => void;
}) {
  const [name, setName] = useState(lead?.name ?? "");
  const [company, setCompany] = useState(lead?.company ?? "");
  const [email, setEmail] = useState(lead?.contact_email ?? "");
  const [stage, setStage] = useState<Stage>(lead?.stage ?? "new");
  const [value, setValue] = useState(lead?.value_cents ? (lead.value_cents / 100).toString() : "");
  const [nextAction, setNextAction] = useState(lead?.next_action ?? "");
  const [nextDate, setNextDate] = useState(lead?.next_action_date ?? "");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [selectedCats, setSelectedCats] = useState<string[]>(lead?.categories ?? []);
  const [saving, setSaving] = useState(false);

  function parseCents(): number | null {
    const n = parseFloat(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }

  async function submit() {
    if (!name.trim() || saving) return;
    const cents = value.trim() ? parseCents() : null;
    if (lead) {
      onSave({
        name: name.trim(),
        company: company || null,
        contact_email: email || null,
        stage,
        value_cents: cents,
        next_action: nextAction || null,
        next_action_date: nextDate || null,
        notes: notes || null,
        ...(categories ? { categories: selectedCats } : {}),
      });
      return;
    }
    setSaving(true);
    await onCreate({
      name: name.trim(),
      company: company.trim() || undefined,
      contact_email: email.trim() || undefined,
      stage,
      value_cents: cents ?? undefined,
      next_action: nextAction.trim() || undefined,
      next_action_date: nextDate || undefined,
      notes: notes.trim() || undefined,
      categories: categories ? selectedCats : undefined,
    });
    setSaving(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={lead ? "Edit lead" : "New lead"}
      size="lg"
      onSubmit={submit}
      footer={
        <>
          {lead ? (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={14} /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving} disabled={!name.trim()}>
              {lead ? "Save" : "Create lead"}
            </Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" required autoFocus={!lead} />
        </Field>
        <Field label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="text" inputMode="email" autoCapitalize="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Value">
          <PrefixInput prefix="$" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="5000" />
        </Field>
        <Field label="Stage" className="sm:col-span-2">
          <Select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next action">
          <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Send proposal" />
        </Field>
        <Field label="Next action date">
          <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </Field>
        {categories && (
          <FieldGroup label="Categories" className="sm:col-span-2">
            <CategoryMultiSelect
              all={Array.from(new Set([...categories, ...selectedCats]))}
              selected={selectedCats}
              onChange={setSelectedCats}
            />
          </FieldGroup>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <AutoTextarea value={notes} onChange={(e) => setNotes(e.target.value)} minRows={4} className={textareaClass} />
        </Field>
        <div className="sm:col-span-2">
          {lead ? (
            <Attachments leadId={lead.id} onCount={onAttachmentCount} />
          ) : (
            <FieldGroup label="Attachments">
              <p className="text-xs text-ink-3">Create the lead first, then open it to add links and files.</p>
            </FieldGroup>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Attachments ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const attachmentAction =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink md:h-7 md:w-7";

function Attachments({ leadId, onCount }: { leadId: number; onCount: (n: number) => void }) {
  const [attachments, setAttachments] = useState<LeadAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareHeaders = useShareHeaders();
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leads/${leadId}/attachments`, { headers: shareHeaders })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((list: LeadAttachment[]) => {
        if (cancelled) return;
        setAttachments(list);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => {
    if (!loading) onCountRef.current(attachments.length);
  }, [attachments.length, loading]);

  async function addLink() {
    const url = linkUrl.trim();
    if (!url || addingLink) return;
    setAddingLink(true);
    const res = await fetch(`/api/leads/${leadId}/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ url, label: linkLabel.trim() || null }),
    }).catch(() => null);
    if (res?.ok) {
      const created = await res.json();
      setAttachments((prev) => [...prev, created]);
      setLinkUrl("");
      setLinkLabel("");
    } else {
      toast("Could not add the link", { tone: "error" });
    }
    setAddingLink(false);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/leads/${leadId}/attachments`, {
      method: "POST",
      headers: shareHeaders,
      body: form,
    }).catch(() => null);
    if (res?.ok) {
      const created = await res.json();
      setAttachments((prev) => [...prev, created]);
    } else {
      toast("Could not upload the file", { tone: "error" });
    }
    setUploading(false);
  }

  async function removeAttachment(id: number) {
    const before = attachments;
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE", headers: shareHeaders }).catch(() => null);
    if (!res?.ok) {
      setAttachments(before);
      toast("Could not remove the attachment", { tone: "error" });
    }
  }

  /** Enter inside the link fields adds the link instead of saving the whole lead. */
  function linkKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addLink();
    }
  }

  return (
    <div className="border-t border-line pt-4">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold text-ink">Attachments</h3>
        {attachments.length > 0 && <span className="text-xs tabular-nums text-ink-3">{attachments.length}</span>}
        {loading && <Loader2 size={13} className="animate-spin self-center text-ink-3" />}
      </div>

      {attachments.length > 0 && (
        <div className="mb-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 py-1 pl-3 pr-1.5">
              {a.type === "link" ? (
                <Link2 size={14} className="shrink-0 text-ink-3" />
              ) : (
                <Paperclip size={14} className="shrink-0 text-ink-3" />
              )}
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{a.label || a.filename || a.url}</span>
              {a.file_size ? <span className="shrink-0 text-xs tabular-nums text-ink-3">{formatBytes(a.file_size)}</span> : null}
              {a.type === "link" ? (
                <a
                  href={a.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open link"
                  title="Open link"
                  className={attachmentAction}
                >
                  <ExternalLink size={14} />
                </a>
              ) : (
                <a
                  href={`/api/attachments/${a.id}/file`}
                  download={a.filename ?? undefined}
                  aria-label="Download file"
                  title="Download file"
                  className={attachmentAction}
                >
                  <Download size={14} />
                </a>
              )}
              <IconButton label="Remove attachment" size="sm" variant="danger" onClick={() => removeAttachment(a.id)}>
                <X size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label="Link URL">
          <Input
            type="text"
            inputMode="url"
            autoCapitalize="off"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={linkKeyDown}
            placeholder="Paste a link"
          />
        </Field>
        <Field label="Link label">
          <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} onKeyDown={linkKeyDown} placeholder="Optional" />
        </Field>
        <Button onClick={addLink} disabled={!linkUrl.trim()} loading={addingLink} className="md:h-9">
          <Link2 size={14} /> Add link
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-[13px] text-ink-3 transition-colors hover:border-ink-4 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-50"
      >
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {uploading ? "Uploading" : "Upload file"}
      </button>
    </div>
  );
}
