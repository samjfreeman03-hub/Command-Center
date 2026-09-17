"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search, CornerDownLeft, LayoutGrid, Sparkles, Plus, SunMoon, ArrowLeft, Target, ListTodo, TrendingUp,
  Building2, StickyNote, CalendarDays, Send, Loader2,
} from "lucide-react";
import { BUSINESSES, getBusiness, type Business } from "@/lib/businesses";
import { tabsForBusiness } from "@/lib/tabs";
import type { SearchHit } from "@/lib/types";
import { BrandTile, Kbd } from "@/components/ui/display";
import { toast } from "@/components/ui/host";
import { OPEN_PALETTE_EVENT, refreshNav } from "@/lib/ui-events";
import { cn } from "@/lib/cn";

type Item = {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  /** Extra text matched by the filter but not shown. */
  keywords?: string;
  run: () => void;
};

/** What "New …" creates, and which tab it lives on. Todos are created inline; the rest open the tab's add form. */
const CREATABLE = [
  { kind: "todo", label: "New todo", tab: "todos", Icon: ListTodo },
  { kind: "initiative", label: "New initiative", tab: "initiatives", Icon: Target },
  { kind: "lead", label: "New lead", tab: "pipeline", Icon: TrendingUp },
  { kind: "contact", label: "New CRM contact", tab: "brands", Icon: Building2 },
  { kind: "note", label: "New note", tab: "notes", Icon: StickyNote },
] as const;

type CreateKind = (typeof CREATABLE)[number]["kind"];
type Mode =
  | { name: "root" }
  | { name: "pick-business"; kind: CreateKind }
  | { name: "todo-title"; business: Business };

const HIT_ICONS: Record<SearchHit["type"], React.ReactNode> = {
  initiative: <Target size={14} />,
  todo: <ListTodo size={14} />,
  lead: <TrendingUp size={14} />,
  contact: <Building2 size={14} />,
  note: <StickyNote size={14} />,
  event: <CalendarDays size={14} />,
  outreach: <Send size={14} />,
};

const HIT_LABELS: Record<SearchHit["type"], string> = {
  initiative: "Initiatives", todo: "Todos", lead: "Pipeline", contact: "CRM", note: "Notes", event: "Events", outreach: "Outreach",
};

/**
 * ⌘K command palette: jump anywhere, search every record in every business,
 * create things without leaving the keyboard, or hand the query to Ask AI.
 */
export function CommandPalette({ hiddenBusinessIds }: { hiddenBusinessIds: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>({ name: "root" });
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const businesses = useMemo(
    () => [...BUSINESSES].sort((a, b) => Number(hiddenBusinessIds.includes(a.id)) - Number(hiddenBusinessIds.includes(b.id))),
    [hiddenBusinessIds]
  );

  const close = useCallback(() => {
    setOpen(false);
    setMode({ name: "root" });
    setQuery("");
    setHits([]);
    setCursor(0);
  }, []);

  // Open with ⌘K / Ctrl+K or the sidebar's search button
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, mode]);

  // Debounced server search (root mode only)
  useEffect(() => {
    if (!open || mode.name !== "root" || query.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d) => {
          setHits(d.hits ?? []);
          setSearching(false);
        })
        .catch(() => {});
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open, mode.name]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const matches = (text: string) => tokens.every((t) => text.toLowerCase().includes(t));

    if (mode.name === "pick-business") {
      const def = CREATABLE.find((c) => c.kind === mode.kind)!;
      return businesses
        .filter((b) => !q || matches(b.name))
        .map((b) => ({
          id: `pick-${b.id}`,
          group: `${def.label} in…`,
          label: b.name,
          icon: <BrandTile business={b} size="xs" />,
          run: () => {
            if (mode.kind === "todo") {
              setMode({ name: "todo-title", business: b });
              setQuery("");
              setCursor(0);
            } else {
              go(`/b/${b.id}?tab=${def.tab}&new=1`);
            }
          },
        }));
    }

    if (mode.name === "todo-title") return [];

    const nav: Item[] = [
      { id: "nav-today", group: "Go to", label: "Today", icon: <LayoutGrid size={14} />, keywords: "dashboard home", run: () => go("/") },
      { id: "nav-ask", group: "Go to", label: "Ask AI", icon: <Sparkles size={14} />, keywords: "chat assistant", run: () => go("/ask") },
      ...businesses.map((b) => ({
        id: `nav-${b.id}`,
        group: "Go to",
        label: b.name,
        icon: <BrandTile business={b} size="xs" />,
        keywords: b.fullName,
        run: () => go(`/b/${b.id}`),
      })),
    ];

    // "flair pipeline" style jumps only appear once you start typing
    const deep: Item[] = q
      ? businesses.flatMap((b) =>
          tabsForBusiness(b.id).map((t) => ({
            id: `tab-${b.id}-${t.id}`,
            group: "Go to",
            label: `${b.name} · ${t.label}`,
            icon: <BrandTile business={b} size="xs" />,
            keywords: t.id,
            run: () => go(`/b/${b.id}?tab=${t.id}`),
          }))
        )
      : [];

    const create: Item[] = CREATABLE.map((c) => ({
      id: `create-${c.kind}`,
      group: "Create",
      label: `${c.label}…`,
      icon: <Plus size={14} />,
      keywords: `add ${c.kind}`,
      run: () => {
        setMode({ name: "pick-business", kind: c.kind });
        setQuery("");
        setCursor(0);
      },
    }));

    const misc: Item[] = [
      {
        id: "theme",
        group: "Preferences",
        label: "Toggle light / dark",
        icon: <SunMoon size={14} />,
        keywords: "theme mode",
        run: () => {
          const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
          document.documentElement.classList.toggle("dark", next === "dark");
          localStorage.setItem("theme", next);
          close();
        },
      },
    ];

    const staticItems = [...nav, ...deep, ...create, ...misc].filter(
      (i) => !q || matches(`${i.label} ${i.keywords ?? ""}`)
    );

    const found: Item[] = hits.map((h) => {
      const b = getBusiness(h.business_id);
      return {
        id: `hit-${h.type}-${h.id}`,
        group: HIT_LABELS[h.type],
        label: h.title,
        sub: [b?.name, h.subtitle].filter(Boolean).join(" · "),
        icon: HIT_ICONS[h.type],
        run: () => go(`/b/${h.business_id}?tab=${h.tab}&open=${h.id}`),
      };
    });

    const ask: Item[] = q
      ? [{ id: "ask", group: "Ask AI", label: `Ask AI: "${query.trim()}"`, icon: <Sparkles size={14} />, run: () => go(`/ask?q=${encodeURIComponent(query.trim())}`) }]
      : [];

    return [...staticItems.slice(0, q ? 8 : 40), ...found, ...ask];
  }, [mode, query, hits, businesses, go, close]);

  useEffect(() => setCursor(0), [query, mode]);

  // Keep the highlighted row in view
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  async function createTodo(business: Business, title: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business_id: business.id, title }),
      });
      if (!res.ok) throw new Error();
      refreshNav();
      toast(`Added to ${business.name}`, {
        tone: "success",
        action: { label: "Open", onClick: () => router.push(`/b/${business.id}?tab=todos`) },
      });
      router.refresh();
      close();
    } catch {
      toast("Could not add the todo", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setMode(mode.name === "todo-title" ? { name: "pick-business", kind: "todo" } : { name: "root" });
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mode.name === "todo-title") {
        if (query.trim() && !busy) createTodo(mode.business, query.trim());
      } else {
        items[cursor]?.run();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (mode.name === "root") close();
      else back();
    } else if (e.key === "Backspace" && !query && mode.name !== "root") {
      e.preventDefault();
      back();
    }
  }

  if (!open) return null;

  const placeholder =
    mode.name === "todo-title"
      ? `Todo for ${mode.business.name}… press Enter to add`
      : mode.name === "pick-business"
        ? "Which business?"
        : "Search everything, jump anywhere, or type a command…";

  let lastGroup = "";

  return createPortal(
    <div
      className="fade-in fixed inset-0 z-[65] flex items-start justify-center bg-black/45 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-[2px] sm:pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div role="dialog" aria-label="Command palette" className="pop-in flex max-h-[70dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-raised shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          {mode.name === "root" ? (
            searching ? <Loader2 size={15} className="shrink-0 animate-spin text-ink-3" /> : <Search size={15} className="shrink-0 text-ink-3" />
          ) : (
            <button onClick={back} aria-label="Back" className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
              <ArrowLeft size={15} />
            </button>
          )}
          {mode.name === "todo-title" && <BrandTile business={mode.business} size="xs" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="h-13 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4"
            autoComplete="off"
            spellCheck={false}
          />
          {busy && <Loader2 size={14} className="animate-spin text-ink-3" />}
          <Kbd className="hidden sm:inline-flex">esc</Kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {mode.name === "todo-title" ? (
            <div className="px-3 py-6 text-center text-[13px] text-ink-3">
              Type the todo and press <Kbd>↵</Kbd> to add it to {mode.business.name}.
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center text-[13px] text-ink-3">{searching ? "Searching…" : "No matches"}</div>
          ) : (
            items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {header && <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium text-ink-3">{header}</div>}
                  <button
                    data-index={i}
                    onMouseMove={() => setCursor(i)}
                    onClick={item.run}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                      i === cursor ? "bg-hover text-ink" : "text-ink-2"
                    )}
                  >
                    <span className="flex w-5 shrink-0 justify-center text-ink-3">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-ink">{item.label}</span>
                      {item.sub && <span className="ml-2 text-ink-3">{item.sub}</span>}
                    </span>
                    {i === cursor && <CornerDownLeft size={12} className="shrink-0 text-ink-4" />}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-line bg-sunken/60 px-4 py-2 text-[11px] text-ink-3 sm:flex">
          <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>↵</Kbd> select</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>⌘K</Kbd> toggle</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
