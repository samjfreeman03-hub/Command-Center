import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { BUSINESSES } from "./businesses";
import type { Todo, Lead, Note, ChatMessage, LeadAttachment, BusinessResource, TeamMember, BrandContact, BrandAttachment, OutreachTarget, OutreachStatus } from "./types";

const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  : path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "command-center.db");
export const UPLOADS_DIR = path.join(DB_DIR, "uploads");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  migrateAlter(db);
  seed(db);
  _db = db;
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_todos_business ON todos(business_id);
    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      name TEXT NOT NULL,
      company TEXT,
      contact_email TEXT,
      stage TEXT NOT NULL DEFAULT 'new',
      value_cents INTEGER,
      next_action TEXT,
      next_action_date TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leads_business ON leads(business_id);

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_business ON notes(business_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_business ON chat_messages(business_id);

    CREATE TABLE IF NOT EXISTS share_tokens (
      business_id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todo_assignees (
      todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      PRIMARY KEY (todo_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      title TEXT,
      color_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_team_business ON team_members(business_id);

    CREATE TABLE IF NOT EXISTS business_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('link', 'file')),
      label TEXT NOT NULL,
      url TEXT,
      filename TEXT,
      stored_name TEXT,
      file_size INTEGER,
      mime_type TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_resources_business ON business_resources(business_id);

    CREATE TABLE IF NOT EXISTS lead_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('link', 'file')),
      label TEXT,
      url TEXT,
      filename TEXT,
      stored_name TEXT,
      file_size INTEGER,
      mime_type TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_lead ON lead_attachments(lead_id);

    CREATE TABLE IF NOT EXISTS brand_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      brand_name TEXT NOT NULL,
      contact_name TEXT,
      contact_title TEXT,
      email TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'prospect',
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_brands_business ON brand_contacts(business_id);

    CREATE TABLE IF NOT EXISTS brand_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL REFERENCES brand_contacts(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('link', 'file')),
      label TEXT,
      url TEXT,
      filename TEXT,
      stored_name TEXT,
      file_size INTEGER,
      mime_type TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_brand_attachments_brand ON brand_attachments(brand_id);

    CREATE TABLE IF NOT EXISTS outreach_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      brand_name TEXT NOT NULL,
      brand_category TEXT,
      brand_size TEXT,
      person_name TEXT NOT NULL,
      person_title TEXT,
      linkedin_url TEXT,
      source TEXT DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'queued',
      signals_json TEXT,
      drafts_json TEXT,
      sent_history_json TEXT,
      sent_at INTEGER,
      replied_at INTEGER,
      next_followup_at INTEGER,
      followup_count INTEGER NOT NULL DEFAULT 0,
      converted_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outreach_business_status ON outreach_targets(business_id, status);
    CREATE INDEX IF NOT EXISTS idx_outreach_followup ON outreach_targets(next_followup_at);
  `);
}

function migrateAlter(db: Database.Database) {
  try { db.exec("ALTER TABLE todos ADD COLUMN assigned_to INTEGER"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE businesses ADD COLUMN tagline TEXT"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE brand_contacts ADD COLUMN website TEXT"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE outreach_targets ADD COLUMN person_email TEXT"); } catch { /* already exists */ }
}

function seed(db: Database.Database) {
  const now = Date.now();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO businesses (id, name, created_at) VALUES (?, ?, ?)"
  );
  for (const b of BUSINESSES) insert.run(b.id, b.name, now);
}

function parseTodo(row: Record<string, unknown>): Todo {
  const raw = row as Todo & { assignee_ids_str?: string };
  return {
    ...raw,
    assignee_ids: raw.assignee_ids_str
      ? raw.assignee_ids_str.split(",").map(Number)
      : [],
  };
}

function todoWithAssignees(id: number | bigint): Todo {
  const row = getDb().prepare(`
    SELECT t.*, GROUP_CONCAT(ta.member_id) AS assignee_ids_str
    FROM todos t LEFT JOIN todo_assignees ta ON ta.todo_id = t.id
    WHERE t.id = ? GROUP BY t.id
  `).get(id) as Record<string, unknown>;
  return parseTodo(row);
}

export const db = {
  // ---- Todos ----
  listTodos(opts?: { businessId?: string; status?: "open" | "done"; limit?: number }): Todo[] {
    const conds: string[] = [];
    const args: unknown[] = [];
    if (opts?.businessId) {
      conds.push("t.business_id = ?");
      args.push(opts.businessId);
    }
    if (opts?.status) {
      conds.push("t.status = ?");
      args.push(opts.status);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const limit = opts?.limit ? `LIMIT ${opts.limit}` : "";
    const sql = `
      SELECT t.*, GROUP_CONCAT(ta.member_id) AS assignee_ids_str
      FROM todos t LEFT JOIN todo_assignees ta ON ta.todo_id = t.id
      ${where} GROUP BY t.id
      ORDER BY
        CASE t.status WHEN 'open' THEN 0 ELSE 1 END,
        CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        COALESCE(t.due_date, '9999-12-31'),
        t.created_at DESC ${limit}`;
    return (getDb().prepare(sql).all(...args) as Record<string, unknown>[]).map(parseTodo);
  },

  createTodo(input: {
    business_id: string;
    title: string;
    notes?: string;
    priority?: "low" | "medium" | "high";
    due_date?: string;
    assigned_to?: number | null;
    assignee_ids?: number[];
  }): Todo {
    const now = Date.now();
    const result = getDb()
      .prepare(
        `INSERT INTO todos (business_id, title, notes, priority, due_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.business_id,
        input.title,
        input.notes ?? null,
        input.priority ?? "medium",
        input.due_date ?? null,
        now
      );
    const id = result.lastInsertRowid;
    const ids = input.assignee_ids ?? (input.assigned_to ? [input.assigned_to] : []);
    const ins = getDb().prepare("INSERT OR IGNORE INTO todo_assignees (todo_id, member_id) VALUES (?, ?)");
    for (const mid of ids) ins.run(id, mid);
    return todoWithAssignees(id);
  },

  updateTodo(id: number, patch: { title?: string; due_date?: string | null; priority?: "low" | "medium" | "high" }): Todo {
    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.title !== undefined) { sets.push("title = ?"); args.push(patch.title.trim()); }
    if ("due_date" in patch) { sets.push("due_date = ?"); args.push(patch.due_date ?? null); }
    if (patch.priority !== undefined) { sets.push("priority = ?"); args.push(patch.priority); }
    if (sets.length > 0) {
      args.push(id);
      getDb().prepare(`UPDATE todos SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    }
    return todoWithAssignees(id);
  },

  setTodoAssignees(todoId: number, memberIds: number[]): Todo {
    const db = getDb();
    db.prepare("DELETE FROM todo_assignees WHERE todo_id = ?").run(todoId);
    const ins = db.prepare("INSERT OR IGNORE INTO todo_assignees (todo_id, member_id) VALUES (?, ?)");
    for (const mid of memberIds) ins.run(todoId, mid);
    return todoWithAssignees(todoId);
  },

  assignTodo(id: number, memberId: number | null): Todo {
    const db = getDb();
    db.prepare("DELETE FROM todo_assignees WHERE todo_id = ?").run(id);
    if (memberId) db.prepare("INSERT OR IGNORE INTO todo_assignees (todo_id, member_id) VALUES (?, ?)").run(id, memberId);
    return todoWithAssignees(id);
  },

  toggleTodo(id: number): Todo {
    const existing = getDb().prepare("SELECT * FROM todos WHERE id = ?").get(id) as Todo | undefined;
    if (!existing) throw new Error("Todo not found");
    const nextStatus = existing.status === "open" ? "done" : "open";
    const completedAt = nextStatus === "done" ? Date.now() : null;
    getDb().prepare("UPDATE todos SET status = ?, completed_at = ? WHERE id = ?").run(nextStatus, completedAt, id);
    return todoWithAssignees(id);
  },

  deleteTodo(id: number) {
    getDb().prepare("DELETE FROM todos WHERE id = ?").run(id);
  },

  // ---- Leads ----
  listLeads(opts?: { businessId?: string }): Lead[] {
    const where = opts?.businessId ? "WHERE business_id = ?" : "";
    const args = opts?.businessId ? [opts.businessId] : [];
    const sql = `SELECT * FROM leads ${where} ORDER BY
      CASE stage
        WHEN 'proposal' THEN 0
        WHEN 'qualified' THEN 1
        WHEN 'contacted' THEN 2
        WHEN 'new' THEN 3
        WHEN 'won' THEN 4
        WHEN 'lost' THEN 5
      END,
      updated_at DESC`;
    return getDb().prepare(sql).all(...args) as Lead[];
  },

  createLead(input: {
    business_id: string;
    name: string;
    company?: string;
    contact_email?: string;
    stage?: Lead["stage"];
    value_cents?: number;
    next_action?: string;
    next_action_date?: string;
    notes?: string;
  }): Lead {
    const now = Date.now();
    const result = getDb()
      .prepare(
        `INSERT INTO leads (business_id, name, company, contact_email, stage, value_cents, next_action, next_action_date, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.business_id,
        input.name,
        input.company ?? null,
        input.contact_email ?? null,
        input.stage ?? "new",
        input.value_cents ?? null,
        input.next_action ?? null,
        input.next_action_date ?? null,
        input.notes ?? null,
        now,
        now
      );
    return getDb().prepare("SELECT * FROM leads WHERE id = ?").get(result.lastInsertRowid) as Lead;
  },

  updateLead(id: number, patch: Partial<Lead>): Lead {
    const allowed = [
      "name",
      "company",
      "contact_email",
      "stage",
      "value_cents",
      "next_action",
      "next_action_date",
      "notes",
    ] as const;
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of allowed) {
      if (key in patch) {
        sets.push(`${key} = ?`);
        args.push((patch as Record<string, unknown>)[key] ?? null);
      }
    }
    if (sets.length === 0) {
      return getDb().prepare("SELECT * FROM leads WHERE id = ?").get(id) as Lead;
    }
    sets.push("updated_at = ?");
    args.push(Date.now());
    args.push(id);
    getDb().prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    return getDb().prepare("SELECT * FROM leads WHERE id = ?").get(id) as Lead;
  },

  deleteLead(id: number) {
    getDb().prepare("DELETE FROM leads WHERE id = ?").run(id);
  },

  // ---- Notes ----
  listNotes(opts?: { businessId?: string; limit?: number }): Note[] {
    const where = opts?.businessId ? "WHERE business_id = ?" : "";
    const args = opts?.businessId ? [opts.businessId] : [];
    const limit = opts?.limit ? `LIMIT ${opts.limit}` : "";
    const sql = `SELECT * FROM notes ${where} ORDER BY updated_at DESC ${limit}`;
    return getDb().prepare(sql).all(...args) as Note[];
  },

  createNote(input: { business_id: string; title: string; content: string }): Note {
    const now = Date.now();
    const result = getDb()
      .prepare(
        `INSERT INTO notes (business_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.business_id, input.title, input.content, now, now);
    return getDb().prepare("SELECT * FROM notes WHERE id = ?").get(result.lastInsertRowid) as Note;
  },

  updateNote(id: number, patch: { title?: string; content?: string }): Note {
    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(patch.title);
    }
    if (patch.content !== undefined) {
      sets.push("content = ?");
      args.push(patch.content);
    }
    if (sets.length === 0) {
      return getDb().prepare("SELECT * FROM notes WHERE id = ?").get(id) as Note;
    }
    sets.push("updated_at = ?");
    args.push(Date.now());
    args.push(id);
    getDb().prepare(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    return getDb().prepare("SELECT * FROM notes WHERE id = ?").get(id) as Note;
  },

  deleteNote(id: number) {
    getDb().prepare("DELETE FROM notes WHERE id = ?").run(id);
  },

  // ---- Chat ----
  listChat(businessId: string, limit = 50): ChatMessage[] {
    return getDb()
      .prepare("SELECT * FROM chat_messages WHERE business_id = ? ORDER BY created_at ASC LIMIT ?")
      .all(businessId, limit) as ChatMessage[];
  },

  appendChat(input: { business_id: string; role: "user" | "assistant"; content: string }): ChatMessage {
    const now = Date.now();
    const result = getDb()
      .prepare(
        `INSERT INTO chat_messages (business_id, role, content, created_at) VALUES (?, ?, ?, ?)`
      )
      .run(input.business_id, input.role, input.content, now);
    return getDb().prepare("SELECT * FROM chat_messages WHERE id = ?").get(result.lastInsertRowid) as ChatMessage;
  },

  clearChat(businessId: string) {
    getDb().prepare("DELETE FROM chat_messages WHERE business_id = ?").run(businessId);
  },

  // ---- Business tagline ----
  getBusinessTagline(id: string): string | null {
    const row = getDb().prepare("SELECT tagline FROM businesses WHERE id = ?").get(id) as { tagline: string | null } | undefined;
    return row?.tagline ?? null;
  },

  updateBusinessTagline(id: string, tagline: string) {
    getDb().prepare("UPDATE businesses SET tagline = ? WHERE id = ?").run(tagline.trim(), id);
  },

  // ---- Team members ----
  listTeamMembers(businessId: string): TeamMember[] {
    return getDb()
      .prepare("SELECT * FROM team_members WHERE business_id = ? ORDER BY created_at ASC")
      .all(businessId) as TeamMember[];
  },

  createTeamMember(input: { business_id: string; name: string; title?: string }): TeamMember {
    const count = (getDb().prepare("SELECT COUNT(*) as c FROM team_members WHERE business_id = ?").get(input.business_id) as { c: number }).c;
    const result = getDb()
      .prepare("INSERT INTO team_members (business_id, name, title, color_index, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(input.business_id, input.name.trim(), input.title?.trim() ?? null, count % 8, Date.now());
    return getDb().prepare("SELECT * FROM team_members WHERE id = ?").get(result.lastInsertRowid) as TeamMember;
  },

  getTeamMemberBizId(id: number): string | null {
    const row = getDb().prepare("SELECT business_id FROM team_members WHERE id = ?").get(id) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  deleteTeamMember(id: number) {
    getDb().prepare("DELETE FROM todo_assignees WHERE member_id = ?").run(id);
    getDb().prepare("DELETE FROM team_members WHERE id = ?").run(id);
  },

  // ---- Business resources ----
  listBusinessResources(businessId: string): BusinessResource[] {
    return getDb()
      .prepare("SELECT * FROM business_resources WHERE business_id = ? ORDER BY created_at ASC")
      .all(businessId) as BusinessResource[];
  },

  addBusinessLink(businessId: string, label: string, url: string): BusinessResource {
    const result = getDb()
      .prepare("INSERT INTO business_resources (business_id, type, label, url, created_at) VALUES (?, 'link', ?, ?, ?)")
      .run(businessId, label, url, Date.now());
    return getDb().prepare("SELECT * FROM business_resources WHERE id = ?").get(result.lastInsertRowid) as BusinessResource;
  },

  addBusinessFile(businessId: string, label: string, filename: string, storedName: string, fileSize: number, mimeType: string): BusinessResource {
    const result = getDb()
      .prepare("INSERT INTO business_resources (business_id, type, label, filename, stored_name, file_size, mime_type, created_at) VALUES (?, 'file', ?, ?, ?, ?, ?, ?)")
      .run(businessId, label, filename, storedName, fileSize, mimeType, Date.now());
    return getDb().prepare("SELECT * FROM business_resources WHERE id = ?").get(result.lastInsertRowid) as BusinessResource;
  },

  getResource(id: number): BusinessResource | undefined {
    return getDb().prepare("SELECT * FROM business_resources WHERE id = ?").get(id) as BusinessResource | undefined;
  },

  getResourceBizId(id: number): string | null {
    const row = getDb().prepare("SELECT business_id FROM business_resources WHERE id = ?").get(id) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  deleteResource(id: number): { stored_name: string | null } {
    const row = getDb().prepare("SELECT stored_name FROM business_resources WHERE id = ?").get(id) as { stored_name: string | null } | undefined;
    getDb().prepare("DELETE FROM business_resources WHERE id = ?").run(id);
    return { stored_name: row?.stored_name ?? null };
  },

  // ---- Lead attachments ----
  listLeadAttachments(leadId: number): LeadAttachment[] {
    return getDb()
      .prepare("SELECT * FROM lead_attachments WHERE lead_id = ? ORDER BY created_at ASC")
      .all(leadId) as LeadAttachment[];
  },

  addLeadLink(leadId: number, url: string, label: string | null): LeadAttachment {
    const result = getDb()
      .prepare(
        `INSERT INTO lead_attachments (lead_id, type, url, label, created_at)
         VALUES (?, 'link', ?, ?, ?)`
      )
      .run(leadId, url, label, Date.now());
    return getDb().prepare("SELECT * FROM lead_attachments WHERE id = ?").get(result.lastInsertRowid) as LeadAttachment;
  },

  addLeadFile(leadId: number, filename: string, storedName: string, fileSize: number, mimeType: string): LeadAttachment {
    const result = getDb()
      .prepare(
        `INSERT INTO lead_attachments (lead_id, type, filename, stored_name, file_size, mime_type, created_at)
         VALUES (?, 'file', ?, ?, ?, ?, ?)`
      )
      .run(leadId, filename, storedName, fileSize, mimeType, Date.now());
    return getDb().prepare("SELECT * FROM lead_attachments WHERE id = ?").get(result.lastInsertRowid) as LeadAttachment;
  },

  getAttachment(id: number): LeadAttachment | undefined {
    return getDb().prepare("SELECT * FROM lead_attachments WHERE id = ?").get(id) as LeadAttachment | undefined;
  },

  deleteAttachment(id: number): { stored_name: string | null } {
    const row = getDb().prepare("SELECT stored_name FROM lead_attachments WHERE id = ?").get(id) as { stored_name: string | null } | undefined;
    getDb().prepare("DELETE FROM lead_attachments WHERE id = ?").run(id);
    return { stored_name: row?.stored_name ?? null };
  },

  listLeadAttachmentsForBusiness(businessId: string): (LeadAttachment & { lead_name: string })[] {
    return getDb()
      .prepare(
        `SELECT a.*, l.name AS lead_name
         FROM lead_attachments a
         JOIN leads l ON l.id = a.lead_id
         WHERE l.business_id = ?
         ORDER BY l.id, a.created_at ASC`
      )
      .all(businessId) as (LeadAttachment & { lead_name: string })[];
  },

  getAttachmentBizId(id: number): string | null {
    const row = getDb()
      .prepare(`SELECT l.business_id FROM lead_attachments a JOIN leads l ON l.id = a.lead_id WHERE a.id = ?`)
      .get(id) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  // ---- Item → business_id lookups (for auth in [id] routes) ----
  getTodoBizId(id: number): string | null {
    const row = getDb().prepare("SELECT business_id FROM todos WHERE id = ?").get(id) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  getLeadBizId(id: number): string | null {
    const row = getDb().prepare("SELECT business_id FROM leads WHERE id = ?").get(id) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  getNoteBizId(id: number): string | null {
    const row = getDb().prepare("SELECT business_id FROM notes WHERE id = ?").get(id) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  // ---- Share tokens ----
  getOrCreateShareToken(businessId: string): string {
    const existing = getDb()
      .prepare("SELECT token FROM share_tokens WHERE business_id = ?")
      .get(businessId) as { token: string } | undefined;
    if (existing) return existing.token;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const token: string = require("crypto").randomBytes(32).toString("hex");
    getDb()
      .prepare("INSERT INTO share_tokens (business_id, token) VALUES (?, ?)")
      .run(businessId, token);
    return token;
  },

  getBusinessByShareToken(token: string): string | null {
    const row = getDb()
      .prepare("SELECT business_id FROM share_tokens WHERE token = ?")
      .get(token) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  verifyShareToken(token: string, businessId: string): boolean {
    const row = getDb()
      .prepare("SELECT 1 FROM share_tokens WHERE token = ? AND business_id = ?")
      .get(token, businessId);
    return !!row;
  },

  // ---- Brand contacts ----
  listBrandContacts(businessId: string): BrandContact[] {
    return getDb()
      .prepare(`SELECT * FROM brand_contacts WHERE business_id = ? ORDER BY
        CASE status WHEN 'active_partner' THEN 0 WHEN 'in_network' THEN 1 WHEN 'prospect' THEN 2 ELSE 3 END,
        brand_name ASC`)
      .all(businessId) as BrandContact[];
  },

  createBrandContact(input: {
    business_id: string;
    brand_name: string;
    contact_name?: string;
    contact_title?: string;
    email?: string;
    phone?: string;
    website?: string;
    status?: BrandContact["status"];
    notes?: string;
  }): BrandContact {
    const now = Date.now();
    const result = getDb()
      .prepare(`INSERT INTO brand_contacts (business_id, brand_name, contact_name, contact_title, email, phone, website, status, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        input.business_id,
        input.brand_name.trim(),
        input.contact_name?.trim() ?? null,
        input.contact_title?.trim() ?? null,
        input.email?.trim() ?? null,
        input.phone?.trim() ?? null,
        input.website?.trim() ?? null,
        input.status ?? "prospect",
        input.notes?.trim() ?? null,
        now,
        now
      );
    return getDb().prepare("SELECT * FROM brand_contacts WHERE id = ?").get(result.lastInsertRowid) as BrandContact;
  },

  updateBrandContact(id: number, patch: Partial<BrandContact>): BrandContact {
    const allowed = ["brand_name", "contact_name", "contact_title", "email", "phone", "status", "notes"] as const;
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of allowed) {
      if (key in patch) {
        sets.push(`${key} = ?`);
        args.push((patch as Record<string, unknown>)[key] ?? null);
      }
    }
    if (sets.length === 0) return getDb().prepare("SELECT * FROM brand_contacts WHERE id = ?").get(id) as BrandContact;
    sets.push("updated_at = ?");
    args.push(Date.now(), id);
    getDb().prepare(`UPDATE brand_contacts SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    return getDb().prepare("SELECT * FROM brand_contacts WHERE id = ?").get(id) as BrandContact;
  },

  deleteBrandContact(id: number) {
    getDb().prepare("DELETE FROM brand_contacts WHERE id = ?").run(id);
  },

  getBrandBizId(id: number): string | null {
    const row = getDb().prepare("SELECT business_id FROM brand_contacts WHERE id = ?").get(id) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  // ---- Brand attachments ----
  listBrandAttachments(brandId: number): BrandAttachment[] {
    return getDb()
      .prepare("SELECT * FROM brand_attachments WHERE brand_id = ? ORDER BY created_at ASC")
      .all(brandId) as BrandAttachment[];
  },

  addBrandLink(brandId: number, url: string, label: string | null): BrandAttachment {
    const result = getDb()
      .prepare(`INSERT INTO brand_attachments (brand_id, type, url, label, created_at) VALUES (?, 'link', ?, ?, ?)`)
      .run(brandId, url, label, Date.now());
    return getDb().prepare("SELECT * FROM brand_attachments WHERE id = ?").get(result.lastInsertRowid) as BrandAttachment;
  },

  addBrandFile(brandId: number, filename: string, storedName: string, fileSize: number, mimeType: string): BrandAttachment {
    const result = getDb()
      .prepare(`INSERT INTO brand_attachments (brand_id, type, filename, stored_name, file_size, mime_type, created_at) VALUES (?, 'file', ?, ?, ?, ?, ?)`)
      .run(brandId, filename, storedName, fileSize, mimeType, Date.now());
    return getDb().prepare("SELECT * FROM brand_attachments WHERE id = ?").get(result.lastInsertRowid) as BrandAttachment;
  },

  getBrandAttachment(id: number): BrandAttachment | undefined {
    return getDb().prepare("SELECT * FROM brand_attachments WHERE id = ?").get(id) as BrandAttachment | undefined;
  },

  deleteBrandAttachment(id: number): { stored_name: string | null } {
    const row = getDb().prepare("SELECT stored_name FROM brand_attachments WHERE id = ?").get(id) as { stored_name: string | null } | undefined;
    getDb().prepare("DELETE FROM brand_attachments WHERE id = ?").run(id);
    return { stored_name: row?.stored_name ?? null };
  },

  getBrandAttachmentBizId(id: number): string | null {
    const row = getDb()
      .prepare(`SELECT bc.business_id FROM brand_attachments ba JOIN brand_contacts bc ON bc.id = ba.brand_id WHERE ba.id = ?`)
      .get(id) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  // ---- Outreach targets ----
  listOutreach(opts: { businessId: string; status?: OutreachStatus }): OutreachTarget[] {
    const conds: string[] = ["business_id = ?"];
    const args: unknown[] = [opts.businessId];
    if (opts.status) { conds.push("status = ?"); args.push(opts.status); }
    const sql = `SELECT * FROM outreach_targets WHERE ${conds.join(" AND ")} ORDER BY
      CASE status
        WHEN 'drafted' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'sent' THEN 2
        WHEN 'replied' THEN 3
        WHEN 'converted' THEN 4
        WHEN 'declined' THEN 5
        WHEN 'dead' THEN 6
      END,
      updated_at DESC`;
    return getDb().prepare(sql).all(...args) as OutreachTarget[];
  },

  createOutreach(input: {
    business_id: string;
    brand_name: string;
    person_name: string;
    brand_category?: string;
    brand_size?: "enterprise" | "midsize" | "emerging";
    person_title?: string;
    linkedin_url?: string;
    person_email?: string;
    source?: "manual" | "auto-generated" | "import";
    notes?: string;
  }): OutreachTarget {
    const now = Date.now();
    const result = getDb()
      .prepare(`INSERT INTO outreach_targets
        (business_id, brand_name, brand_category, brand_size, person_name, person_title, linkedin_url, person_email, source, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        input.business_id,
        input.brand_name.trim(),
        input.brand_category?.trim() ?? null,
        input.brand_size ?? null,
        input.person_name.trim(),
        input.person_title?.trim() ?? null,
        input.linkedin_url?.trim() ?? null,
        input.person_email?.trim() ?? null,
        input.source ?? "manual",
        input.notes?.trim() ?? null,
        now,
        now,
      );
    return getDb().prepare("SELECT * FROM outreach_targets WHERE id = ?").get(result.lastInsertRowid) as OutreachTarget;
  },

  getOutreach(id: number): OutreachTarget | undefined {
    return getDb().prepare("SELECT * FROM outreach_targets WHERE id = ?").get(id) as OutreachTarget | undefined;
  },

  getOutreachBizId(id: number): string | null {
    const row = getDb().prepare("SELECT business_id FROM outreach_targets WHERE id = ?").get(id) as { business_id: string } | undefined;
    return row?.business_id ?? null;
  },

  updateOutreach(id: number, patch: Partial<OutreachTarget>): OutreachTarget {
    const allowed = [
      "brand_name", "brand_category", "brand_size",
      "person_name", "person_title", "linkedin_url", "person_email",
      "status", "signals_json", "drafts_json", "sent_history_json",
      "sent_at", "replied_at", "next_followup_at", "followup_count",
      "converted_lead_id", "notes",
    ] as const;
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of allowed) {
      if (key in patch) {
        sets.push(`${key} = ?`);
        args.push((patch as Record<string, unknown>)[key] ?? null);
      }
    }
    if (sets.length === 0) return getDb().prepare("SELECT * FROM outreach_targets WHERE id = ?").get(id) as OutreachTarget;
    sets.push("updated_at = ?");
    args.push(Date.now(), id);
    getDb().prepare(`UPDATE outreach_targets SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    return getDb().prepare("SELECT * FROM outreach_targets WHERE id = ?").get(id) as OutreachTarget;
  },

  deleteOutreach(id: number) {
    getDb().prepare("DELETE FROM outreach_targets WHERE id = ?").run(id);
  },

  /**
   * Daily queue for the morning surface.
   * - newTargets: queued or drafted but never sent, oldest first (up to limit)
   * - followups: targets with a follow-up due now (next_followup_at <= now and not replied/dead)
   */
  listDailyQueue(opts: { businessId: string; limit?: number }): {
    newTargets: OutreachTarget[];
    followups: OutreachTarget[];
  } {
    const now = Date.now();
    const limit = opts.limit ?? 10;
    const newTargets = getDb()
      .prepare(
        `SELECT * FROM outreach_targets
         WHERE business_id = ? AND status IN ('queued', 'drafted') AND sent_at IS NULL
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .all(opts.businessId, limit) as OutreachTarget[];
    const followups = getDb()
      .prepare(
        `SELECT * FROM outreach_targets
         WHERE business_id = ?
           AND status = 'sent'
           AND next_followup_at IS NOT NULL
           AND next_followup_at <= ?
           AND followup_count < 3
         ORDER BY next_followup_at ASC`
      )
      .all(opts.businessId, now) as OutreachTarget[];
    return { newTargets, followups };
  },

  /** Cadence map: follow-up #N is sent {DAYS[N]} days after first send. */
  outreachCadenceDays(n: 1 | 2 | 3): number {
    return ({ 1: 3, 2: 7, 3: 14 } as const)[n];
  },

  /** Mark first send. Sets sent_at, schedules follow-up #1 at +3d, appends to history. */
  markOutreachSent(id: number, payload: { text: string; template: "A" | "B" }): OutreachTarget {
    const target = getDb().prepare("SELECT * FROM outreach_targets WHERE id = ?").get(id) as OutreachTarget | undefined;
    if (!target) throw new Error("Target not found");
    const now = Date.now();
    const history = target.sent_history_json ? JSON.parse(target.sent_history_json) : [];
    history.push({ at: now, follow_up_n: 0, template: payload.template, text: payload.text });
    return this.updateOutreach(id, {
      status: "sent",
      sent_at: now,
      next_followup_at: now + 3 * 86400_000,
      sent_history_json: JSON.stringify(history),
    });
  },

  /** Mark a follow-up sent. Advances followup_count and schedules the next, or clears cadence after #3. */
  markFollowupSent(id: number, payload: { text: string }): OutreachTarget {
    const target = getDb().prepare("SELECT * FROM outreach_targets WHERE id = ?").get(id) as OutreachTarget | undefined;
    if (!target) throw new Error("Target not found");
    if (!target.sent_at) throw new Error("Cannot send follow-up before first send");
    const now = Date.now();
    const nextN = (target.followup_count + 1) as 1 | 2 | 3;
    const history = target.sent_history_json ? JSON.parse(target.sent_history_json) : [];
    history.push({ at: now, follow_up_n: nextN, text: payload.text });
    const nextScheduledN = (nextN + 1) as 2 | 3 | 4;
    const next_followup_at =
      nextScheduledN <= 3
        ? target.sent_at + this.outreachCadenceDays(nextScheduledN as 2 | 3) * 86400_000
        : null;
    return this.updateOutreach(id, {
      followup_count: nextN,
      next_followup_at,
      sent_history_json: JSON.stringify(history),
    });
  },

  /** Reply received — cancel cadence, flag as replied. */
  markOutreachReplied(id: number): OutreachTarget {
    return this.updateOutreach(id, {
      status: "replied",
      replied_at: Date.now(),
      next_followup_at: null,
    });
  },

  // ---- Dashboard helpers ----
  pipelineSummary(): { business_id: string; open_count: number; pipeline_cents: number }[] {
    return getDb()
      .prepare(
        `SELECT business_id,
                COUNT(*) FILTER (WHERE stage NOT IN ('won', 'lost')) AS open_count,
                COALESCE(SUM(value_cents) FILTER (WHERE stage NOT IN ('won', 'lost')), 0) AS pipeline_cents
         FROM leads GROUP BY business_id`
      )
      .all() as { business_id: string; open_count: number; pipeline_cents: number }[];
  },

  todoCounts(): { business_id: string; open_count: number }[] {
    return getDb()
      .prepare(
        `SELECT business_id, COUNT(*) AS open_count
         FROM todos WHERE status = 'open' GROUP BY business_id`
      )
      .all() as { business_id: string; open_count: number }[];
  },
};
