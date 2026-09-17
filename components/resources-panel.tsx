"use client";

import { useRef, useState } from "react";
import type { BusinessResource } from "@/lib/types";
import { Link2, FileText, Upload, ExternalLink, Download, Trash2, FolderOpen } from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { usePanelState } from "@/lib/panel-cache";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog, toast } from "@/components/ui/host";
import { Card, EmptyState, SectionHeader } from "@/components/ui/display";

const ACCEPT = ".pdf,.txt,.md,.csv,.json,.xml,.docx,.xlsx,.pptx,image/*";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hostName(url: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

function fileKind(r: BusinessResource) {
  const ext = r.filename?.includes(".") ? r.filename.split(".").pop() : null;
  if (ext) return ext.toUpperCase();
  if (r.mime_type?.startsWith("image/")) return "Image";
  return r.mime_type ?? "File";
}

export function ResourcesPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: BusinessResource[];
}) {
  const [resources, setResources] = usePanelState("resources", initial);
  // Add link modal
  const [linkOpen, setLinkOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  // Upload: pick a file first, then confirm its label
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareHeaders = useShareHeaders();

  function closeLink() {
    setLinkOpen(false);
    setLabel("");
    setUrl("");
  }

  async function addLink() {
    if (!label.trim() || !url.trim() || savingLink) return;
    setSavingLink(true);
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ business_id: businessId, label: label.trim(), url: url.trim() }),
    }).catch(() => null);
    if (res?.ok) {
      const created: BusinessResource = await res.json();
      setResources((prev) => [...prev, created]);
      closeLink();
    } else {
      const data = (await res?.json().catch(() => ({}))) ?? {};
      toast(data.error ?? "Could not add link", { tone: "error" });
    }
    setSavingLink(false);
  }

  function pickFile(file: File) {
    setPendingFile(file);
    setFileLabel(file.name.replace(/\.[^.]+$/, ""));
  }

  async function uploadFile() {
    if (!pendingFile || !fileLabel.trim() || uploading) return;
    setUploading(true);
    const form = new FormData();
    form.append("business_id", businessId);
    form.append("label", fileLabel.trim());
    form.append("file", pendingFile);
    const res = await fetch("/api/resources", { method: "POST", headers: shareHeaders, body: form }).catch(() => null);
    if (res?.ok) {
      const created: BusinessResource = await res.json();
      setResources((prev) => [...prev, created]);
      setPendingFile(null);
      setFileLabel("");
    } else {
      const data = (await res?.json().catch(() => ({}))) ?? {};
      toast(data.error ?? "Upload failed", { tone: "error" });
    }
    setUploading(false);
  }

  async function remove(r: BusinessResource) {
    const ok = await confirmDialog({
      title: "Delete this resource?",
      description: `"${r.label}" will be removed for everyone on this business.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const snapshot = resources;
    setResources((prev) => prev.filter((x) => x.id !== r.id));
    const res = await fetch(`/api/resources/${r.id}`, { method: "DELETE", headers: shareHeaders }).catch(() => null);
    if (!res?.ok) {
      setResources(snapshot);
      toast("Could not delete resource", { tone: "error" });
    }
  }

  const links = resources.filter((r) => r.type === "link");
  const files = resources.filter((r) => r.type === "file");

  const addButtons = (primary: boolean) => (
    <>
      <Button onClick={() => fileInputRef.current?.click()}>
        <Upload size={14} /> Upload file
      </Button>
      <Button variant={primary ? "primary" : "secondary"} onClick={() => setLinkOpen(true)}>
        <Link2 size={14} /> Add link
      </Button>
    </>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-ink-3">
          <span className="font-medium tabular-nums text-ink">{resources.length}</span>{" "}
          {resources.length === 1 ? "resource" : "resources"}
        </div>
        <div className="flex items-center gap-2">{addButtons(true)}</div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) pickFile(file);
          e.target.value = "";
        }}
      />

      {resources.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderOpen size={18} />}
            title="No resources yet"
            body="Save key links and files here. They also feed the AI chat's context for this business."
            action={<div className="flex flex-wrap items-center justify-center gap-2">{addButtons(false)}</div>}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {links.length > 0 && (
            <section>
              <SectionHeader title="Links" count={links.length} />
              <Card>
                <div className="divide-y divide-line">
                  {links.map((r) => (
                    <ResourceRow key={r.id} resource={r} onDelete={() => remove(r)} />
                  ))}
                </div>
              </Card>
            </section>
          )}
          {files.length > 0 && (
            <section>
              <SectionHeader title="Files" count={files.length} />
              <Card>
                <div className="divide-y divide-line">
                  {files.map((r) => (
                    <ResourceRow key={r.id} resource={r} onDelete={() => remove(r)} />
                  ))}
                </div>
              </Card>
            </section>
          )}
        </div>
      )}

      {/* Add link */}
      <Modal
        open={linkOpen}
        onClose={closeLink}
        size="sm"
        title="Add link"
        onSubmit={addLink}
        footer={
          <>
            <span />
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={closeLink}>Cancel</Button>
              <Button variant="primary" type="submit" loading={savingLink} disabled={!label.trim() || !url.trim()}>
                Add link
              </Button>
            </div>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Label" required>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Investor deck" autoFocus />
          </Field>
          <Field label="URL" required>
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </Field>
        </div>
      </Modal>

      {/* Upload: confirm the label for the chosen file */}
      <Modal
        open={!!pendingFile}
        onClose={() => { if (!uploading) setPendingFile(null); }}
        size="sm"
        title="Upload file"
        description={pendingFile ? `${pendingFile.name}, ${formatBytes(pendingFile.size)}` : undefined}
        onSubmit={uploadFile}
        footer={
          <>
            <span />
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setPendingFile(null)} disabled={uploading}>Cancel</Button>
              <Button variant="primary" type="submit" loading={uploading} disabled={!fileLabel.trim()}>
                Upload
              </Button>
            </div>
          </>
        }
      >
        <Field label="Label" required hint="Shown in the list and used by the AI chat to refer to this file.">
          <Input value={fileLabel} onChange={(e) => setFileLabel(e.target.value)} placeholder="Q1 report" autoFocus />
        </Field>
      </Modal>
    </div>
  );
}

function ResourceRow({ resource: r, onDelete }: { resource: BusinessResource; onDelete: () => void }) {
  const isLink = r.type === "link";
  const meta = isLink
    ? hostName(r.url)
    : [r.filename, r.file_size ? formatBytes(r.file_size) : null, fileKind(r)].filter(Boolean).join(" · ");
  return (
    <div className="group flex items-center gap-1 pr-3 transition-colors hover:bg-hover">
      <a
        href={isLink ? r.url! : `/api/resources/${r.id}/file`}
        {...(isLink ? { target: "_blank", rel: "noopener noreferrer" } : { download: r.filename ?? undefined })}
        title={isLink ? "Open link" : "Download file"}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-3 ring-1 ring-inset ring-line">
          {isLink ? <Link2 size={15} /> : <FileText size={15} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
          {meta && <span className="mt-0.5 block truncate text-xs text-ink-3">{meta}</span>}
        </span>
        <span className="shrink-0 text-ink-3 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          {isLink ? <ExternalLink size={14} /> : <Download size={14} />}
        </span>
      </a>
      <IconButton
        label="Delete resource"
        size="sm"
        onClick={onDelete}
        className="md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
      >
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}
