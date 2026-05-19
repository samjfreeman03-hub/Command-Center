"use client";

import { useState } from "react";
import type { BrandContact, BrandStatus } from "@/lib/types";
import { BRAND_STATUSES } from "@/lib/types";
import { Plus, Trash2, Pencil, X, Mail, Phone, ChevronDown } from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";

const EMPTY_FORM = {
  brand_name: "",
  contact_name: "",
  contact_title: "",
  email: "",
  phone: "",
  status: "prospect" as BrandStatus,
  notes: "",
};

export function BrandsPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: BrandContact[];
}) {
  const [brands, setBrands] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState<BrandStatus | "all">("all");
  const shareHeaders = useShareHeaders();

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, val: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }
  function setEditField<K extends keyof typeof EMPTY_FORM>(key: K, val: (typeof EMPTY_FORM)[K]) {
    setEditDraft((f) => ({ ...f, [key]: val }));
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

  function startEdit(b: BrandContact) {
    setEditId(b.id);
    setEditDraft({
      brand_name: b.brand_name,
      contact_name: b.contact_name ?? "",
      contact_title: b.contact_title ?? "",
      email: b.email ?? "",
      phone: b.phone ?? "",
      status: b.status,
      notes: b.notes ?? "",
    });
  }

  async function saveEdit() {
    if (!editId) return;
    const res = await fetch(`/api/brands/${editId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({
        brand_name: editDraft.brand_name.trim(),
        contact_name: editDraft.contact_name.trim() || null,
        contact_title: editDraft.contact_title.trim() || null,
        email: editDraft.email.trim() || null,
        phone: editDraft.phone.trim() || null,
        status: editDraft.status,
        notes: editDraft.notes.trim() || null,
      }),
    });
    if (res.ok) {
      const updated: BrandContact = await res.json();
      setBrands((prev) => prev.map((b) => (b.id === editId ? updated : b)));
      setEditId(null);
    }
  }

  async function remove(id: number) {
    setBrands((prev) => prev.filter((b) => b.id !== id));
    await fetch(`/api/brands/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  const filtered = filter === "all" ? brands : brands.filter((b) => b.status === filter);
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
          <Plus size={14} /> Add brand
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={add}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Brand name *</label>
              <input
                value={form.brand_name}
                onChange={(e) => setField("brand_name", e.target.value)}
                placeholder="Nike, Red Bull…"
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
                placeholder="Brand Partnerships Manager"
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
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Any context about this brand relationship…"
              rows={2}
              className="w-full bg-zinc-50 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 resize-none"
            />
          </div>
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
          {brands.length === 0 ? "No brands yet. Add your first contact above." : "No brands match this filter."}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 divide-y divide-zinc-100 dark:divide-zinc-900 overflow-hidden">
          {filtered.map((b) =>
            editId === b.id ? (
              <EditRow
                key={b.id}
                draft={editDraft}
                setField={setEditField}
                onSave={saveEdit}
                onCancel={() => setEditId(null)}
              />
            ) : (
              <BrandRow key={b.id} brand={b} onEdit={startEdit} onDelete={remove} />
            )
          )}
        </div>
      )}
    </div>
  );
}

function BrandRow({
  brand,
  onEdit,
  onDelete,
}: {
  brand: BrandContact;
  onEdit: (b: BrandContact) => void;
  onDelete: (id: number) => void;
}) {
  const status = BRAND_STATUSES.find((s) => s.value === brand.status)!;
  return (
    <div className="flex items-start gap-4 px-4 py-3.5 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{brand.brand_name}</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
        </div>
        {(brand.contact_name || brand.contact_title) && (
          <div className="text-xs text-zinc-500 mt-0.5">
            {brand.contact_name}{brand.contact_name && brand.contact_title && " · "}{brand.contact_title}
          </div>
        )}
        {(brand.email || brand.phone) && (
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {brand.email && (
              <a
                href={`mailto:${brand.email}`}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                <Mail size={11} />{brand.email}
              </a>
            )}
            {brand.phone && (
              <a
                href={`tel:${brand.phone}`}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                <Phone size={11} />{brand.phone}
              </a>
            )}
          </div>
        )}
        {brand.notes && (
          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1 line-clamp-2">{brand.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
        <button
          onClick={() => onEdit(brand)}
          className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 rounded"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(brand.id)}
          className="p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function EditRow({
  draft,
  setField,
  onSave,
  onCancel,
}: {
  draft: typeof EMPTY_FORM;
  setField: <K extends keyof typeof EMPTY_FORM>(key: K, val: (typeof EMPTY_FORM)[K]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-4 py-4 bg-zinc-50 dark:bg-zinc-900/50 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Brand name *</label>
          <input
            value={draft.brand_name}
            onChange={(e) => setField("brand_name", e.target.value)}
            className="w-full bg-white dark:bg-zinc-950 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Status</label>
          <StatusSelect value={draft.status} onChange={(v) => setField("status", v)} />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Contact name</label>
          <input
            value={draft.contact_name}
            onChange={(e) => setField("contact_name", e.target.value)}
            className="w-full bg-white dark:bg-zinc-950 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Title</label>
          <input
            value={draft.contact_title}
            onChange={(e) => setField("contact_title", e.target.value)}
            className="w-full bg-white dark:bg-zinc-950 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Email</label>
          <input
            type="email"
            value={draft.email}
            onChange={(e) => setField("email", e.target.value)}
            className="w-full bg-white dark:bg-zinc-950 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Phone</label>
          <input
            type="tel"
            value={draft.phone}
            onChange={(e) => setField("phone", e.target.value)}
            className="w-full bg-white dark:bg-zinc-950 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Notes</label>
        <textarea
          value={draft.notes}
          onChange={(e) => setField("notes", e.target.value)}
          rows={2}
          className="w-full bg-white dark:bg-zinc-950 text-sm px-3 py-2 rounded-md text-zinc-900 dark:text-zinc-100 outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 resize-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          <X size={13} /> Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!draft.brand_name.trim()}
          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium px-4 py-1.5 rounded-md hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-40 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: BrandStatus; onChange: (v: BrandStatus) => void }) {
  const current = BRAND_STATUSES.find((s) => s.value === value)!;
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
      <span className={`absolute left-2 top-1/2 -translate-y-1/2 hidden`}>{current.label}</span>
    </div>
  );
}
