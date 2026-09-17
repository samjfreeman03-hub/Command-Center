"use client";

import { useEffect, useRef, useState } from "react";
import type { BrandContact, BrandStatus, BrandAttachment, LeadCategory } from "@/lib/types";
import { BRAND_STATUSES } from "@/lib/types";
import {
  Plus, Trash2, X, Mail, Phone, Globe, Search, Copy, Users, Loader2,
  Link2, ExternalLink, Download, Upload, FileText, Tag,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { usePanelState } from "@/lib/panel-cache";
import { categoryColor, CategoryMultiSelect, CategoryBadges, CatPill } from "@/components/category-ui";
import { AutoTextarea } from "@/components/auto-textarea";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Field, textareaClass, FieldGroup } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog, toast } from "@/components/ui/host";
import { Badge, Card, EmptyState, type BadgeTone } from "@/components/ui/display";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";

const EMPTY_FORM = {
  brand_name: "",
  contact_name: "",
  contact_title: "",
  email: "",
  phone: "",
  website: "",
  status: "prospect" as BrandStatus,
  notes: "",
  categories: [] as string[],
};

type FormState = typeof EMPTY_FORM;

const UNCATEGORIZED = "__uncategorized__";

/** Sentence-case labels and badge tones per status (values come from BRAND_STATUSES). */
const STATUS_META: Record<BrandStatus, { label: string; tone: BadgeTone }> = {
  prospect: { label: "Prospect", tone: "neutral" },
  in_network: { label: "In network", tone: "blue" },
  active_partner: { label: "Active partner", tone: "green" },
  past_partner: { label: "Past partner", tone: "amber" },
};

const STATUS_OPTIONS = BRAND_STATUSES.map((s) => ({
  value: s.value as BrandStatus,
  label: STATUS_META[s.value].label,
}));

const stripProtocol = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
const withProtocol = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

type Editor = { mode: "new" } | { mode: "edit"; brand: BrandContact };

export function BrandsPanel({
  businessId,
  initial,
  categories = [],
  categoriesEnabled = false,
  openId,
  autoNew,
}: {
  businessId: string;
  initial: BrandContact[];
  categories?: LeadCategory[];
  categoriesEnabled?: boolean;
  /** Deep link: open this contact's editor on mount and whenever it changes. */
  openId?: number;
  /** Deep link: open the New contact form on mount. */
  autoNew?: boolean;
}) {
  const [brands, setBrands] = usePanelState("brands", initial);
  const [editor, setEditor] = useState<Editor | null>(autoNew ? { mode: "new" } : null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BrandStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const shareHeaders = useShareHeaders();

  const catNames = categories.map((c) => c.name);
  const showCategories = categoriesEnabled && catNames.length > 0;

  useEffect(() => {
    if (openId == null) return;
    const found = brands.find((b) => b.id === openId);
    if (found) setEditor({ mode: "edit", brand: found });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  function handleCreated(created: BrandContact) {
    setBrands((prev) => [created, ...prev]);
    setEditor(null);
  }

  function handleUpdated(updated: BrandContact) {
    setBrands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setEditor(null);
  }

  async function remove(id: number) {
    const ok = await confirmDialog({
      title: "Delete this contact?",
      description: "The contact and its attachments will be removed.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const snapshot = brands;
    setBrands((prev) => prev.filter((b) => b.id !== id));
    setEditor(null);
    const res = await fetch(`/api/brands/${id}`, { method: "DELETE", headers: shareHeaders }).catch(() => null);
    if (!res?.ok) {
      setBrands(snapshot);
      toast("Could not delete contact", { tone: "error" });
    }
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      toast("Email copied");
    } catch {
      toast("Could not copy email", { tone: "error" });
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = brands
    .filter((b) => filter === "all" || b.status === filter)
    .filter((b) =>
      categoryFilter === "all" ||
      (categoryFilter === UNCATEGORIZED ? b.categories.length === 0 : b.categories.includes(categoryFilter))
    )
    .filter((b) =>
      !q ||
      [b.brand_name, b.contact_name, b.contact_title, b.email, b.notes].some((v) => v?.toLowerCase().includes(q))
    );
  const counts = Object.fromEntries(
    BRAND_STATUSES.map((s) => [s.value, brands.filter((b) => b.status === s.value).length])
  ) as Record<BrandStatus, number>;
  const filtersActive = !!q || filter !== "all" || categoryFilter !== "all";

  function clearFilters() {
    setQuery("");
    setFilter("all");
    setCategoryFilter("all");
  }

  const filterOptions = [
    { value: "all" as const, label: <PillLabel text="All" count={brands.length} /> },
    ...STATUS_OPTIONS.map((s) => ({
      value: s.value,
      label: <PillLabel text={s.label} count={counts[s.value]} />,
    })),
  ];

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {/* Local icon input: PrefixInput's `prefix` prop is typed as a string (clashes with the native attribute). */}
            <div className="relative w-full sm:w-60">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input
                className="pl-8"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts"
                aria-label="Search contacts"
              />
            </div>
            <Segmented size="sm" options={filterOptions} value={filter} onChange={setFilter} />
            {filtersActive && (
              <span className="text-xs tabular-nums text-ink-3">
                {filtered.length} of {brands.length}
              </span>
            )}
          </div>
          <Button variant="primary" onClick={() => setEditor({ mode: "new" })} className="shrink-0">
            <Plus size={14} /> New contact
          </Button>
        </div>

        {/* Industries filter (shared tag pool, feature-flagged per business) */}
        {showCategories && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 inline-flex items-center gap-1 text-xs font-medium text-ink-3">
              <Tag size={13} /> Industries
            </span>
            <CatPill active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>All</CatPill>
            {categories.map((c) => {
              const count = brands.filter((b) => b.categories.includes(c.name)).length;
              return (
                <CatPill
                  key={c.id}
                  active={categoryFilter === c.name}
                  color={categoryColor(catNames, c.name)}
                  onClick={() => setCategoryFilter(c.name)}
                >
                  {c.name} <span className="tabular-nums opacity-60">{count}</span>
                </CatPill>
              );
            })}
            {brands.some((b) => b.categories.length === 0) && (
              <CatPill active={categoryFilter === UNCATEGORIZED} onClick={() => setCategoryFilter(UNCATEGORIZED)}>
                Untagged
              </CatPill>
            )}
          </div>
        )}
      </div>

      {/* List */}
      {brands.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={18} />}
            title="No contacts yet"
            body="Keep every brand, partner and key person in one place, with notes and attachments."
            action={
              <Button onClick={() => setEditor({ mode: "new" })}>
                <Plus size={14} /> New contact
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-[13px] text-ink-3">No matches for the current search and filters.</div>
          <Button size="sm" onClick={clearFilters}>Clear filters</Button>
        </div>
      ) : (
        <Card>
          <div className="divide-y divide-line">
            {filtered.map((b) => (
              <BrandRow
                key={b.id}
                brand={b}
                catNames={categoriesEnabled ? catNames : undefined}
                onOpen={() => setEditor({ mode: "edit", brand: b })}
                onCopyEmail={copyEmail}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Create and edit share one modal */}
      {editor && (
        <ContactModal
          key={editor.mode === "edit" ? editor.brand.id : "new"}
          brand={editor.mode === "edit" ? editor.brand : null}
          businessId={businessId}
          shareHeaders={shareHeaders}
          catNames={categoriesEnabled ? catNames : undefined}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
          onDelete={remove}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function PillLabel({ text, count }: { text: string; count: number }) {
  return (
    <>
      {text}
      {count > 0 && <span className="text-[11px] tabular-nums opacity-60">{count}</span>}
    </>
  );
}

// ── List row ─────────────────────────────────────────────────────────────────

function BrandRow({
  brand,
  catNames,
  onOpen,
  onCopyEmail,
}: {
  brand: BrandContact;
  catNames?: string[];
  onOpen: () => void;
  onCopyEmail: (email: string) => void;
}) {
  const status = STATUS_META[brand.status];
  const inlineItem = "inline-flex min-w-0 items-center gap-1 text-xs text-ink-3";
  const inlineLink = cn(inlineItem, "transition-colors hover:text-ink hover:underline");
  return (
    // A div, not a <button>: the row contains real links and an action button.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-ink">{brand.brand_name}</span>
          <Badge tone={status.tone}>{status.label}</Badge>
          {catNames && brand.categories.length > 0 && (
            <CategoryBadges names={brand.categories} allNames={catNames} />
          )}
        </div>
        {(brand.contact_name || brand.contact_title) && (
          <div className="mt-0.5 truncate text-xs text-ink-3">
            {[brand.contact_name, brand.contact_title].filter(Boolean).join(" · ")}
          </div>
        )}
        {(brand.email || brand.phone || brand.website) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {brand.email && (
              <a href={`mailto:${brand.email}`} onClick={(e) => e.stopPropagation()} className={inlineLink}>
                <Mail size={13} className="shrink-0" />
                <span className="truncate">{brand.email}</span>
              </a>
            )}
            {brand.phone && (
              <span className={inlineItem}>
                <Phone size={13} className="shrink-0" />
                {brand.phone}
              </span>
            )}
            {brand.website && (
              <a
                href={withProtocol(brand.website)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={inlineLink}
              >
                <Globe size={13} className="shrink-0" />
                <span className="truncate">{stripProtocol(brand.website)}</span>
              </a>
            )}
          </div>
        )}
        {brand.notes && <p className="mt-1 line-clamp-1 text-xs text-ink-3">{brand.notes}</p>}
      </div>
      {brand.email && (
        <div className="shrink-0 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <IconButton
            label="Copy email"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onCopyEmail(brand.email!);
            }}
          >
            <Copy size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

// ── Create / edit modal ──────────────────────────────────────────────────────


function ContactModal({
  brand,
  businessId,
  shareHeaders,
  catNames,
  onCreated,
  onUpdated,
  onDelete,
  onClose,
}: {
  /** null = creating a new contact. */
  brand: BrandContact | null;
  businessId: string;
  shareHeaders: Record<string, string>;
  catNames?: string[];
  onCreated: (b: BrandContact) => void;
  onUpdated: (b: BrandContact) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FormState>(() =>
    brand
      ? {
          brand_name: brand.brand_name,
          contact_name: brand.contact_name ?? "",
          contact_title: brand.contact_title ?? "",
          email: brand.email ?? "",
          phone: brand.phone ?? "",
          website: brand.website ?? "",
          status: brand.status,
          notes: brand.notes ?? "",
          categories: brand.categories,
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  async function save() {
    if (!draft.brand_name.trim() || saving) return;
    setSaving(true);
    try {
      const res = brand
        ? await fetch(`/api/brands/${brand.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json", ...shareHeaders },
            body: JSON.stringify({
              brand_name: draft.brand_name.trim(),
              contact_name: draft.contact_name.trim() || null,
              contact_title: draft.contact_title.trim() || null,
              email: draft.email.trim() || null,
              phone: draft.phone.trim() || null,
              website: draft.website.trim() || null,
              status: draft.status,
              notes: draft.notes.trim() || null,
              categories: draft.categories,
            }),
          })
        : await fetch("/api/brands", {
            method: "POST",
            headers: { "content-type": "application/json", ...shareHeaders },
            body: JSON.stringify({ business_id: businessId, ...draft }),
          });
      if (!res.ok) throw new Error("save failed");
      const saved: BrandContact = await res.json();
      if (brand) onUpdated(saved);
      else onCreated(saved);
    } catch {
      toast(brand ? "Could not save contact" : "Could not add contact", { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={brand ? brand.brand_name : "New contact"}
      description={brand ? "Edit details, notes and attachments." : undefined}
      onSubmit={save}
      footer={
        <>
          {brand ? (
            <Button variant="danger" onClick={() => onDelete(brand.id)}>
              <Trash2 size={14} /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving} disabled={!draft.brand_name.trim()}>
              {brand ? "Save" : "Add contact"}
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company or brand" required className="sm:col-span-2">
            <Input
              value={draft.brand_name}
              onChange={(e) => setField("brand_name", e.target.value)}
              placeholder="Company, brand or individual"
              autoFocus={!brand}
            />
          </Field>
          <Field label="Contact name">
            <Input
              value={draft.contact_name}
              onChange={(e) => setField("contact_name", e.target.value)}
              placeholder="Jane Smith"
            />
          </Field>
          <Field label="Title">
            <Input
              value={draft.contact_title}
              onChange={(e) => setField("contact_title", e.target.value)}
              placeholder="CEO, Marketing director"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={draft.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="jane@brand.com"
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              value={draft.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="+1 (555) 000-0000"
            />
          </Field>
          <Field label="Website" className="sm:col-span-2">
            <Input
              type="url"
              value={draft.website}
              onChange={(e) => setField("website", e.target.value)}
              placeholder="https://example.com"
            />
          </Field>
        </div>

        <FieldGroup label="Status">
          <Segmented options={STATUS_OPTIONS} value={draft.status} onChange={(v) => setField("status", v)} />
        </FieldGroup>

        {catNames && (
          <FieldGroup label="Industries">
            <CategoryMultiSelect
              all={catNames}
              selected={draft.categories}
              onChange={(next) => setField("categories", next)}
              emptyHint="No industries yet. Add some via Manage in the Pipeline tab."
            />
          </FieldGroup>
        )}

        <Field label="Notes">
          <AutoTextarea
            value={draft.notes}
            onChange={(e) => setField("notes", e.target.value)}
            placeholder="Any context about this contact or relationship"
            minRows={4}
            className={textareaClass}
          />
        </Field>

        {brand ? (
          <Attachments brandId={brand.id} shareHeaders={shareHeaders} />
        ) : (
          <FieldGroup label="Attachments">
            <p className="text-xs text-ink-3">Add the contact first, then reopen it to attach links and files.</p>
          </FieldGroup>
        )}
      </div>
    </Modal>
  );
}

// ── Attachments (links + files per contact) ──────────────────────────────────

function Attachments({ brandId, shareHeaders }: { brandId: number; shareHeaders: Record<string, string> }) {
  const [attachments, setAttachments] = useState<BrandAttachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/brands/${brandId}/attachments`, { headers: shareHeaders })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((data: BrandAttachment[]) => {
        if (cancelled) return;
        setAttachments(data);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  async function addLink() {
    if (!linkUrl.trim() || addingLink) return;
    setAddingLink(true);
    const res = await fetch(`/api/brands/${brandId}/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ url: linkUrl.trim(), label: linkLabel.trim() || null }),
    }).catch(() => null);
    if (res?.ok) {
      const created: BrandAttachment = await res.json();
      setAttachments((prev) => [...prev, created]);
      setLinkUrl("");
      setLinkLabel("");
    } else {
      toast("Could not add link", { tone: "error" });
    }
    setAddingLink(false);
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/brands/${brandId}/attachments`, {
      method: "POST",
      headers: shareHeaders,
      body: fd,
    }).catch(() => null);
    if (res?.ok) {
      const created: BrandAttachment = await res.json();
      setAttachments((prev) => [...prev, created]);
    } else {
      toast("Could not upload file", { tone: "error" });
    }
    setUploading(false);
  }

  async function deleteAttachment(id: number) {
    const snapshot = attachments;
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    const res = await fetch(`/api/brand-attachments/${id}`, { method: "DELETE", headers: shareHeaders }).catch(() => null);
    if (!res?.ok) {
      setAttachments(snapshot);
      toast("Could not remove attachment", { tone: "error" });
    }
  }

  // The modal is a <form>: Enter in these inputs adds the link instead of saving the contact.
  function onLinkKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addLink();
  }

  return (
    <FieldGroup label="Attachments" count={attachments.length} className="border-t border-line pt-4">
      {!loaded ? (
        <div className="flex items-center gap-2 py-1 text-xs text-ink-3">
          <Loader2 size={13} className="animate-spin" /> Loading attachments
        </div>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-ink-3">No attachments yet. Add a link or upload a file below.</p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {attachments.map((a) => {
            const isLink = a.type === "link";
            const name = a.label || (isLink ? stripProtocol(a.url ?? "") : a.filename) || "Attachment";
            return (
              <div key={a.id} className="group flex items-center gap-1 pr-1.5 transition-colors hover:bg-hover">
                <a
                  href={isLink ? a.url! : `/api/brand-attachments/${a.id}/file`}
                  {...(isLink ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2"
                >
                  {isLink ? (
                    <Link2 size={14} className="shrink-0 text-ink-3" />
                  ) : (
                    <FileText size={14} className="shrink-0 text-ink-3" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{name}</span>
                  {isLink ? (
                    <ExternalLink size={13} className="shrink-0 text-ink-3" />
                  ) : (
                    <Download size={13} className="shrink-0 text-ink-3" />
                  )}
                </a>
                <IconButton
                  label="Remove attachment"
                  size="sm"
                  onClick={() => deleteAttachment(a.id)}
                  className="md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                >
                  <X size={14} />
                </IconButton>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]">
        <Field label="Link label">
          <Input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            onKeyDown={onLinkKeyDown}
            placeholder="Optional"
          />
        </Field>
        <Field label="Link URL">
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={onLinkKeyDown}
            placeholder="https://"
            inputMode="url"
          />
        </Field>
        <div className="flex gap-2">
          <Button onClick={addLink} disabled={!linkUrl.trim()} loading={addingLink} className="h-10 flex-1 md:h-9">
            {!addingLink && <Link2 size={14} />} Add link
          </Button>
          <Button onClick={() => fileRef.current?.click()} loading={uploading} className="h-10 flex-1 md:h-9">
            {!uploading && <Upload size={14} />} Upload
          </Button>
        </div>
      </div>
      <input ref={fileRef} type="file" className="hidden" onChange={uploadFile} />
    </FieldGroup>
  );
}
