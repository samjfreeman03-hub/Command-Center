import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { BUSINESSES } from "./businesses";
import type { Todo, Lead, Note, ChatMessage } from "./types";

const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  : path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "command-center.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
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
  `);
}

function seed(db: Database.Database) {
  const now = Date.now();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO businesses (id, name, created_at) VALUES (?, ?, ?)"
  );
  for (const b of BUSINESSES) insert.run(b.id, b.name, now);
}

export const db = {
  // ---- Todos ----
  listTodos(opts?: { businessId?: string; status?: "open" | "done"; limit?: number }): Todo[] {
    const conds: string[] = [];
    const args: unknown[] = [];
    if (opts?.businessId) {
      conds.push("business_id = ?");
      args.push(opts.businessId);
    }
    if (opts?.status) {
      conds.push("status = ?");
      args.push(opts.status);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const limit = opts?.limit ? `LIMIT ${opts.limit}` : "";
    const sql = `SELECT * FROM todos ${where} ORDER BY
      CASE status WHEN 'open' THEN 0 ELSE 1 END,
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      COALESCE(due_date, '9999-12-31'),
      created_at DESC ${limit}`;
    return getDb().prepare(sql).all(...args) as Todo[];
  },

  createTodo(input: {
    business_id: string;
    title: string;
    notes?: string;
    priority?: "low" | "medium" | "high";
    due_date?: string;
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
    return getDb().prepare("SELECT * FROM todos WHERE id = ?").get(result.lastInsertRowid) as Todo;
  },

  toggleTodo(id: number): Todo {
    const existing = getDb().prepare("SELECT * FROM todos WHERE id = ?").get(id) as Todo | undefined;
    if (!existing) throw new Error("Todo not found");
    const nextStatus = existing.status === "open" ? "done" : "open";
    const completedAt = nextStatus === "done" ? Date.now() : null;
    getDb()
      .prepare("UPDATE todos SET status = ?, completed_at = ? WHERE id = ?")
      .run(nextStatus, completedAt, id);
    return getDb().prepare("SELECT * FROM todos WHERE id = ?").get(id) as Todo;
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
