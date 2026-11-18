import { FLAIR_OS_READ_TOOLS, isAllowedReadTool, isAllowedWriteTool, type FlairOsTool } from "./allowlist";

/**
 * Minimal MCP client over HTTP for FLAIR OS (JSON-RPC 2.0, Streamable HTTP
 * transport: JSON or SSE responses). No dependency; the repo rule is no new
 * packages. Reads are always allowed; writes (FLAIR_OS_WRITE_TOOLS) only when
 * the client was built with `allowWrites`, which flairOsClientFromEnv sets
 * from FLAIR_OS_WRITE_ENABLED and never under dry run.
 *
 * Politeness: calls are serialized with a minimum gap (contract: at most one
 * request per second), with exponential backoff on 429 and 5xx.
 */

export class FlairOsError extends Error {
  constructor(message: string, public readonly code: string | number | null = null, public readonly status: number | null = null) {
    super(message);
    this.name = "FlairOsError";
  }
}

export type FlairOsClientOptions = {
  url: string;
  key: string;
  minGapMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  /** Two-way mode. Off: every write tool is refused before any request is made. */
  allowWrites?: boolean;
};

type JsonRpcResponse = { jsonrpc: "2.0"; id: number | string | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

export class FlairOsClient {
  private readonly url: string;
  private readonly key: string;
  private readonly minGapMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  readonly allowWrites: boolean;
  private sessionId: string | null = null;
  private initialized = false;
  private nextId = 1;
  private lastCallAt = 0;
  private chain: Promise<unknown> = Promise.resolve();
  /** Tool names called in this process, for the status panel and tests. */
  readonly calls: { tool: FlairOsTool; at: number; ms: number; ok: boolean }[] = [];

  constructor(opts: FlairOsClientOptions) {
    this.url = opts.url.replace(/\/$/, "");
    this.key = opts.key;
    this.minGapMs = opts.minGapMs ?? 1000;
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.allowWrites = opts.allowWrites === true;
  }

  /** Call an allowlisted tool. Names outside the lists, and writes while writes are off, are refused before any request is made. */
  call<T = unknown>(tool: FlairOsTool, args: Record<string, unknown> = {}): Promise<T> {
    if (!isAllowedReadTool(tool)) {
      if (!isAllowedWriteTool(tool)) {
        return Promise.reject(new FlairOsError(`Tool ${String(tool)} is not on the Command Center allowlist`, "not_allowed"));
      }
      if (!this.allowWrites) {
        return Promise.reject(new FlairOsError(`Writing to FLAIR OS is off (FLAIR_OS_WRITE_ENABLED), so ${tool} was not called`, "writes_off"));
      }
    }
    const run = async (): Promise<T> => {
      await this.ensureInitialized();
      const started = Date.now();
      try {
        const result = await this.rpc("tools/call", { name: tool, arguments: args });
        this.calls.push({ tool, at: started, ms: Date.now() - started, ok: true });
        return unwrapToolResult<T>(result, tool);
      } catch (e) {
        this.calls.push({ tool, at: started, ms: Date.now() - started, ok: false });
        throw e;
      }
    };
    // Serialize so two cycles or a cycle plus a manual call never overlap.
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Lists the tools the server exposes to this key (for the status panel). */
  async listTools(): Promise<string[]> {
    await this.ensureInitialized();
    const result = (await this.rpc("tools/list", {})) as { tools?: { name: string }[] };
    return (result.tools ?? []).map((t) => t.name);
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "command-center", version: "1" },
    });
    this.initialized = true;
    // Best effort; some servers answer 202, some 404. Never fatal.
    try {
      await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, true);
    } catch { /* ignore */ }
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    let attempt = 0;
    for (;;) {
      try {
        const res = await this.post({ jsonrpc: "2.0", id, method, params });
        if (!res) throw new FlairOsError(`Empty response to ${method}`, "empty");
        if (res.error) {
          throw new FlairOsError(`${method}: ${res.error.message}`, res.error.code);
        }
        return res.result;
      } catch (e) {
        const err = e instanceof FlairOsError ? e : new FlairOsError((e as Error).message, "network");
        const retryable = err.code === "network" || err.status === 429 || (err.status !== null && err.status >= 500);
        if (!retryable || attempt >= this.maxRetries) throw err;
        attempt += 1;
        await sleep(Math.min(8000, 500 * 2 ** attempt));
      }
    }
  }

  private async post(body: Record<string, unknown>, notification = false): Promise<JsonRpcResponse | null> {
    const wait = this.lastCallAt + this.minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${this.key}`,
        "mcp-protocol-version": "2025-06-18",
      };
      if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
      const res = await this.fetchImpl(this.url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
      const sid = res.headers.get("mcp-session-id");
      if (sid) this.sessionId = sid;
      if (res.status === 401 || res.status === 403) throw new FlairOsError("FLAIR OS rejected the Command Center key", "unauthorized", res.status);
      if (!res.ok) throw new FlairOsError(`FLAIR OS responded ${res.status}`, "http", res.status);
      if (notification || res.status === 202 || res.status === 204) return null;
      const type = res.headers.get("content-type") ?? "";
      const text = await res.text();
      if (!text.trim()) return null;
      if (type.includes("text/event-stream")) return parseSse(text, body.id as number | undefined);
      return JSON.parse(text) as JsonRpcResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseSse(text: string, wantId?: number): JsonRpcResponse | null {
  let last: JsonRpcResponse | null = null;
  for (const block of text.split(/\n\n+/)) {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("\n");
    if (!data) continue;
    try {
      const msg = JSON.parse(data) as JsonRpcResponse;
      if (wantId === undefined || msg.id === wantId) last = msg;
    } catch { /* keepalive or partial */ }
  }
  return last;
}

function unwrapToolResult<T>(result: unknown, tool: string): T {
  const r = (result ?? {}) as { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean };
  if (r.isError) {
    const msg = r.content?.find((c) => c.type === "text")?.text ?? "tool error";
    throw new FlairOsError(`${tool}: ${msg}`, "tool_error");
  }
  // FLAIR OS also reports refusals as an ordinary result: { ok: false, error }.
  const refused = (v: unknown): string | null => {
    if (v && typeof v === "object" && (v as { ok?: unknown }).ok === false) {
      const err = (v as { error?: unknown }).error;
      return typeof err === "string" ? err : "refused";
    }
    return null;
  };
  if (r.structuredContent !== undefined) {
    const why = refused(r.structuredContent);
    if (why) throw new FlairOsError(`${tool}: ${why}`, "tool_error");
    return r.structuredContent as T;
  }
  const text = r.content?.find((c) => c.type === "text")?.text;
  if (text === undefined) return result as T;
  try {
    const parsed = JSON.parse(text);
    const why = refused(parsed);
    if (why) throw new FlairOsError(`${tool}: ${why}`, "tool_error");
    return parsed as T;
  } catch (e) {
    if (e instanceof FlairOsError) throw e;
    return text as unknown as T;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let shared: FlairOsClient | null = null;
let sharedKey = "";

/** One client per process, rebuilt if the environment changes. */
export function flairOsClientFromEnv(): FlairOsClient | null {
  const url = process.env.FLAIR_OS_MCP_URL;
  const key = process.env.FLAIR_OS_MCP_KEY;
  if (!url || !key) return null;
  const gap = Number(process.env.FLAIR_OS_MIN_GAP_MS ?? 1000);
  const allowWrites = process.env.FLAIR_OS_WRITE_ENABLED === "1" && process.env.FLAIR_OS_SYNC_DRY_RUN !== "1";
  const fingerprint = `${url}|${key}|${gap}|${allowWrites ? "rw" : "ro"}`;
  if (!shared || sharedKey !== fingerprint) {
    shared = new FlairOsClient({ url, key, minGapMs: Number.isFinite(gap) ? gap : 1000, allowWrites });
    sharedKey = fingerprint;
  }
  return shared;
}

export { FLAIR_OS_READ_TOOLS };
