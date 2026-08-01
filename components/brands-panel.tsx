"use client";

import { useState, useEffect, useRef } from "react";
import type { BrandContact, BrandStatus, BrandAttachment, LeadCategory } from "@/lib/types";
import { BRAND_STATUSES } from "@/lib/types";
import {
  Plus, Trash2, Pencil, X, Mail, Phone, Globe, ChevronDown,
  Link2, Paperclip, ExternalLink, Download, Upload, FileText, Tag,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { categoryColor, CategoryMultiSelect, CategoryBadges, CatPill } from "@/components/category-ui";
import { AutoTextarea } from "@/components/auto-textarea";

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

const UNCATEGORIZED = "__uncategorized__";

export function BrandsPanel({
  businessId,
  initial,
  categories = [],
  categoriesEnabled = false,
}: {
  businessId: string;
  initial: BrandContact[];
  categories?: LeadCategory[];
  categoriesEnabled?: boolean;
}) {
  const [brands, setBrands] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedBrand, setSelectedBrand] = useState<BrandContact | null>(null);
  const [filter, setFilter] = useState<BrandStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const shareHeaders = useShareHeaders();

  const catNames = categories.map((c) => c.name);

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, val: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand_name.trim()) return;
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ business_id: businessId, ...form }),
    });
    if (res.ok) {
      const created: BrandContact = await res.json();
      setBrands((prev) => [created, ...prev]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
    }
  }

  function handleUpdated(updated: BrandContact) {
    setBrands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setSelectedBrand(updated);
  }

  async function remove(id: number) {
    if (!confirm("Delete this contact and its attachments?")) return;
    setBrands((prev) => prev.filter((b) => b.id !== id));
    setSelectedBrand(null);
    await fetch(`/api/brands/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  const filtered = brands
    .filter((b) => filter === "all" || b.status === filter)
    .filter((b) =>
      categoryFilter === "all" ||
      (categoryFilter === UNCATEGORIZED ? b.categories.length === 0 : b.categories.includes(categoryFilter))
    );
  const counts = Object.fromEntries(BRAND_STATUSES.map((s) => [s.value, brands.filter((b) => b.status === s.value).length]));

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            All ({brands.length})
          </button>
          {BRAND_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value as BrandStatus)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === s.value
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              {s.label} {counts[s.value] > 0 ? `(${counts[s.value]})` : ""}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-700 dark:hover:bg-white transition-colors shrink-0"
        >
          <Plus size={14} /> Add contact
        </button>
      </div>

      {/* Category filter (shared tag pool, feature-flagged per business) */}
      {categoriesEnabled && catNames.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400 mr-0.5 inline-flex items-center gap-1"><Tag size={11} /> Industry</span>
          <CatPill active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>All</CatPill>
          {categories.map((c) => {
            const count = brands.filter((b) => b.categories.includes(c.name)).length;
            return (
              <CatPill key={c.id} active={categoryFilter === c.name} color={categoryColor(catNames, c.name)} onClick={() => setCategoryFilter(c.name)}>
                {c.name} <span className="opacity-60">{count}</span>
              </CatPill>
            );
          })}
          {brands.some((b) => b.categories.length === 0) && (
            <CatPill active={categoryFilter === UNCATEGORIZED} onClick={() => setCategoryFilter(UNCATEGORIZED)}>Untagged</CatPill>
          )}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={add}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Name *</label>
              <input
                value={form.brand_name}
                onChange={(e) => setField("brand_name", e.target.value)}
                placeholder="Company, brand, or individual…"
                className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Status</label>
              <StatusSelect value={form.status} onChange={(v) => setField("status", v)} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Contact name</label>
              <input
                value={form.contact_name}
                onChange={(e) => setField("contact_name", e.target.value)}
                placeholder="Jane Smith"
                className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Title</label>
              <input
                value={form.contact_title}
                onChange={(e) => setField("contact_title", e.target.value)}
                placeholder="CEO, Marketing Director…"
                className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="jane@brand.com"
                className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Website</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => setField("website", e.target.value)}
                placeholder="https://example.com"
                className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Notes</label>
            <AutoTextarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Any context about this contact or relationship…"
              minRows={3}
              className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm leading-relaxed px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 resize-none"
            />
          </div>
          {categoriesEnabled && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5 flex items-center gap-1"><Tag size={11} /> Industries / categories</label>
              <CategoryMultiSelect all={catNames} selected={form.categories} onChange={(next) => setField("categories", next)} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}
              className="text-sm px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.brand_name.trim()}
              className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium px-4 py-1.5 rounded-md hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-sm text-zinc-500 py-12 text-center">
          {brands.length === 0 ? "No contacts yet. Add your first one above." : "No contacts match this filter."}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 divide-y divide-zinc-100 dark:divide-zinc-900 overflow-hidden">
          {filtered.map((b) => (
            <BrandRow
              key={b.id}
              brand={b}
              catNames={categoriesEnabled ? catNames : undefined}
              onClick={() => setSelectedBrand(b)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedBrand && (
        <BrandModal
          brand={selectedBrand}
          shareHeaders={shareHeaders}
          catNames={categoriesEnabled ? catNames : undefined}
          onUpdated={handleUpdated}
          onDelete={remove}
          onClose={() => setSelectedBrand(null)}
        />
      )}
    </div>
  );
}

// ── Compact list row ──────────────────────────────────────────────────────────

function BrandRow({ brand, catNames, onClick }: { brand: BrandContact; catNames?: string[]; onClick: () => void }) {
  const status = BRAND_STATUSES.find((s) => s.value === brand.status)!;
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-4 px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{brand.brand_name}</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
        </div>
        {catNames && brand.categories.length > 0 && (
          <div className="mt-1.5">
            <CategoryBadges names={brand.categories} allNames={catNames} />
          </div>
        )}
        {(brand.contact_name || brand.contact_title) && (
          <div className="text-xs text-zinc-500 mt-0.5">
            {brand.contact_name}{brand.contact_name && brand.contact_title && " · "}{brand.contact_title}
          </div>
        )}
        {(brand.email || brand.phone || brand.website) && (
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {brand.email && <span className="inline-flex items-center gap-1 text-xs text-zinc-400"><Mail size={10} />{brand.email}</span>}
            {brand.phone && <span className="inline-flex items-center gap-1 text-xs text-zinc-400"><Phone size={10} />{brand.phone}</span>}
            {brand.website && <span className="inline-flex items-center gap-1 text-xs text-zinc-400"><Globe size={10} />{brand.website.replace(/^https?:\/\//, "")}</span>}
          </div>
        )}
        {brand.notes && (
          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5 line-clamp-1">{brand.notes}</p>
        )}
      </div>
      <ChevronDown size={14} className="text-zinc-400 shrink-0 mt-1 -rotate-90 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function BrandModal({
  brand: initialBrand,
  shareHeaders,
  catNames,
  onUpdated,
  onDelete,
  onClose,
}: {
  brand: BrandContact;
  shareHeaders: Record<string, string>;
  catNames?: string[];
  onUpdated: (b: BrandContact) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  const [brand, setBrand] = useState(initialBrand);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [attachments, setAttachments] = useState<BrandAttachment[]>([]);
  const [attachmentsLoaded, setAttachmentsLoaded] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Load attachments on first open
  useEffect(() => {
    fetch(`/api/brands/${brand.id}/attachments`, { headers: shareHeaders })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: BrandAttachment[]) => { setAttachments(data); setAttachmentsLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id]);

  function startEdit() {
    setDraft({
      brand_name: brand.brand_name,
      contact_name: brand.contact_name ?? "",
      contact_title: brand.contact_title ?? "",
      email: brand.email ?? "",
      phone: brand.phone ?? "",
      website: brand.website ?? "",
      status: brand.status,
      notes: brand.notes ?? "",
      categories: brand.categories,
    });
    setEditing(true);
  }

  async function saveEdit() {
    const res = await fetch(`/api/brands/${brand.id}`, {
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
    });
    if (res.ok) {
      const updated: BrandContact = await res.json();
      setBrand(updated);
      onUpdated(updated);
      setEditing(false);
    }
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    const res = await fetch(`/api/brands/${brand.id}/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ url: linkUrl.trim(), label: linkLabel.trim() || null }),
    });
    if (res.ok) {
      const created: BrandAttachment = await res.json();
      setAttachments((prev) => [...prev, created]);
      setLinkUrl("");
      setLinkLabel("");
    }
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/brands/${brand.id}/attachments`, {
      method: "POST",
      headers: shareHeaders,
      body: fd,
    });
    if (res.ok) {
      const created: BrandAttachment = await res.json();
      setAttachments((prev) => [...prev, created]);
    }
    e.target.value = "";
  }

  async function deleteAttachment(id: number) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/brand-attachments/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  const status = BRAND_STATUSES.find((s) => s.value === brand.status)!;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-start justify-center bg-black/40 sm:p-8 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-xl bg-white dark:bg-zinc-950 rounded-t-2xl sm:rounded-xl shadow-2xl border-t sm:border border-zinc-200 dark:border-zinc-800 sm:mt-8 sm:mb-8 safe-bottom">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-900">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{brand.brand_name}</h2>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
            </div>
            {(brand.contact_name || brand.contact_title) && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {brand.contact_name}{brand.contact_name && brand.contact_title && " · "}{brand.contact_title}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editing && (
              <button
                onClick={startEdit}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 rounded"
                title="Edit"
              >
                <Pencil size={14} />
              </button>
            )}
            <button
              onClick={() => onDelete(brand.id)}
              className="p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 rounded"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">

          {editing ? (
            /* Edit form */
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Name *</label>
                  <input value={draft.brand_name} onChange={(e) => setDraft((d) => ({ ...d, brand_name: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Status</label>
                  <StatusSelect value={draft.status} onChange={(v) => setDraft((d) => ({ ...d, status: v }))} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Contact name</label>
                  <input value={draft.contact_name} onChange={(e) => setDraft((d) => ({ ...d, contact_name: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Title</label>
                  <input value={draft.contact_title} onChange={(e) => setDraft((d) => ({ ...d, contact_title: e.target.value }))}
                    placeholder="CEO, Marketing Director…"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Email</label>
                  <input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Phone</label>
                  <input type="tel" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-zinc-500 mb-1">Website</label>
                  <input type="url" value={draft.website} onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
                    placeholder="https://example.com"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Notes</label>
                <AutoTextarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  minRows={5}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm leading-relaxed px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 resize-none" />
              </div>
              {catNames && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5 flex items-center gap-1"><Tag size={11} /> Industries / categories</label>
                  <CategoryMultiSelect all={catNames} selected={draft.categories} onChange={(next) => setDraft((d) => ({ ...d, categories: next }))} />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(false)} className="text-sm px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancel</button>
                <button onClick={saveEdit} disabled={!draft.brand_name.trim()}
                  className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium px-4 py-1.5 rounded-md hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-40 transition-colors">
                  Save
                </button>
              </div>
            </div>
          ) : (
            /* Read-only detail view */
            <div className="space-y-4">
              {/* Contact info */}
              {(brand.email || brand.phone || brand.website) && (
                <div className="flex flex-col gap-2">
                  {brand.email && (
                    <a href={`mailto:${brand.email}`} className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                      <Mail size={13} className="text-zinc-400 shrink-0" />{brand.email}
                    </a>
                  )}
                  {brand.phone && (
                    <a href={`tel:${brand.phone}`} className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                      <Phone size={13} className="text-zinc-400 shrink-0" />{brand.phone}
                    </a>
                  )}
                  {brand.website && (
                    <a href={brand.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                      <Globe size={13} className="text-zinc-400 shrink-0" />{brand.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
              )}

              {/* Categories */}
              {catNames && brand.categories.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-zinc-400 mb-1.5">Industries</div>
                  <CategoryBadges names={brand.categories} allNames={catNames} />
                </div>
              )}

              {/* Notes */}
              {brand.notes ? (
                <div>
                  <div className="text-xs uppercase tracking-wider text-zinc-400 mb-1.5">Notes</div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{brand.notes}</p>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 italic">No notes — click the pencil to add some.</p>
              )}
            </div>
          )}

          {/* Attachments */}
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400 mb-3">
              Attachments {attachments.length > 0 && `(${attachments.length})`}
            </div>

            {/* Add link */}
            <form onSubmit={addLink} className="flex gap-2 mb-2 flex-wrap">
              <input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Label (optional)"
                className="w-28 bg-zinc-50 dark:bg-zinc-900 text-xs px-2.5 py-1.5 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-900 text-xs px-2.5 py-1.5 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
              <button
                type="submit"
                disabled={!linkUrl.trim()}
                className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-xs px-2.5 py-1.5 rounded-md text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 shrink-0"
              >
                <Link2 size={11} /> Add link
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-xs px-2.5 py-1.5 rounded-md text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 shrink-0"
              >
                <Upload size={11} /> Upload
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={uploadFile} />
            </form>

            {/* Attachment list */}
            {attachments.length > 0 && (
              <div className="space-y-1 mt-1">
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 py-1.5 px-2.5 rounded-md bg-zinc-50 dark:bg-zinc-900 group">
                    {a.type === "link" ? <Link2 size={12} className="text-zinc-400 shrink-0" /> : <FileText size={12} className="text-zinc-400 shrink-0" />}
                    <span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300 truncate min-w-0">
                      {a.label || (a.type === "link" ? a.url?.replace(/^https?:\/\//, "") : a.filename)}
                    </span>
                    {a.type === "link" ? (
                      <a href={a.url!} target="_blank" rel="noopener noreferrer"
                        className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 shrink-0">
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <a href={`/api/brand-attachments/${a.id}/file`}
                        className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 shrink-0">
                        <Download size={12} />
                      </a>
                    )}
                    <button onClick={() => deleteAttachment(a.id)}
                      className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 dark:hover:text-red-400 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachmentsLoaded && attachments.length === 0 && (
              <p className="text-xs text-zinc-400 italic">No attachments yet.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatusSelect({ value, onChange }: { value: BrandStatus; onChange: (v: BrandStatus) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as BrandStatus)}
        className="w-full appearance-none bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 pr-8 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
      >
        {BRAND_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
    </div>
  );
}
