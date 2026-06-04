import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { BUSINESSES } from "./businesses";
import type { Todo, Lead, Note, ChatMessage, LeadAttachment, BusinessResource, TeamMember, BrandContact } from "./types";

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
  `);
}

function migrateAlter(db: Database.Database) {
  try { db.exec("ALTER TABLE todos ADD COLUMN assigned_to INTEGER"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE businesses ADD COLUMN tagline TEXT"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE brand_contacts ADD COLUMN website TEXT"); } catch { /* already exists */ }
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
