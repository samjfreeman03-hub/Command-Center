"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BUSINESSES, type Business } from "@/lib/businesses";
import {
  Sun, Moon, LogOut, X, ChevronRight, Eye, Search, Sparkles, Mail, Calendar, ArrowUpRight, LayoutGrid,
} from "lucide-react";
import { BrandTile, Kbd } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { NAV_REFRESH_EVENT, OPEN_PALETTE_EVENT } from "@/lib/ui-events";


export function Sidebar({
  onLogout,
  onClose,
  hiddenBusinessIds,
}: {
  onLogout?: () => void;
  onClose?: () => void;
  hiddenBusinessIds: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [todoCounts, setTodoCounts] = useState<Record<string, number>>({});

  const visible = BUSINESSES.filter((b) => !hiddenBusinessIds.includes(b.id));
  const hidden = BUSINESSES.filter((b) => hiddenBusinessIds.includes(b.id));
  const isActive = (b: Business) => pathname === `/b/${b.id}` || pathname.startsWith(`/b/${b.id}/`);
  // Open the Hidden group automatically while viewing one of its businesses
  const [showHidden, setShowHidden] = useState(false);
  const hiddenOpen = showHidden || hidden.some(isActive);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    setTheme(stored ?? (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  }, []);

  const loadCounts = useCallback(() => {
    fetch("/api/nav")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.todoCounts && setTodoCounts(d.todoCounts))
      .catch(() => {});
  }, []);

  // Refresh counts on navigation and whenever a panel reports a change
  useEffect(() => {
    loadCounts();
    window.addEventListener(NAV_REFRESH_EVENT, loadCounts);
    return () => window.removeEventListener(NAV_REFRESH_EVENT, loadCounts);
  }, [pathname, loadCounts]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  }

  async function unhide(id: string) {
    await fetch(`/api/businesses/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hidden: false }),
    });
    router.refresh();
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col overflow-y-auto bg-shell safe-bottom md:w-60">
      {/* Brand */}
      <div className="mobile-header px-3 md:pt-0">
        <div className="flex h-14 items-center justify-between pl-1.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-inverse text-[10px] font-bold tracking-tight text-on-inverse shadow-card">
              CC
            </span>
            <span className="text-[13px] font-semibold tracking-tight text-ink">Command Center</span>
          </Link>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Search / command palette */}
      <div className="px-3 pb-2">
        <button
          onClick={() => {
            onClose?.();
            window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
          }}
          className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-raised px-2.5 text-[13px] text-ink-3 shadow-card transition-colors hover:border-line-strong hover:text-ink-2 md:h-8"
        >
          <Search size={13} className="shrink-0" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <Kbd className="hidden md:inline-flex">⌘K</Kbd>
        </button>
      </div>

      {/* Main nav */}
      <nav className="space-y-px px-3">
        <NavItem href="/" active={pathname === "/"} icon={<LayoutGrid size={15} />}>
          Today
        </NavItem>
        <NavItem href="/ask" active={pathname.startsWith("/ask")} icon={<Sparkles size={15} />}>
          Ask AI
        </NavItem>
      </nav>

      {/* Businesses */}
      <div className="mt-5 flex-1 px-3">
        <GroupLabel>Businesses</GroupLabel>
        <div className="space-y-px">
          {visible.map((b) => (
            <NavItem
              key={b.id}
              href={`/b/${b.id}`}
              active={isActive(b)}
              icon={<BrandTile business={b} size="xs" />}
              trailing={todoCounts[b.id] ? <span className="text-[11px] tabular-nums text-ink-3">{todoCounts[b.id]}</span> : null}
            >
              {b.name}
            </NavItem>
          ))}
        </div>

        {/* Hidden businesses: out of the way, one click to reach or restore */}
        {hidden.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowHidden((v) => !v)}
              aria-expanded={hiddenOpen}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-ink-3 transition-colors hover:text-ink-2"
            >
              <ChevronRight size={11} className={cn("transition-transform", hiddenOpen && "rotate-90")} />
              Hidden · {hidden.length}
            </button>
            {hiddenOpen && (
              <div className="space-y-px">
                {hidden.map((b) => (
                  <div key={b.id} className="flex items-center gap-0.5">
                    <div className="min-w-0 flex-1 opacity-60 transition-opacity hover:opacity-100">
                      <NavItem href={`/b/${b.id}`} active={isActive(b)} icon={<BrandTile business={b} size="xs" />}>
                        {b.name}
                      </NavItem>
                    </div>
                    <button
                      onClick={() => unhide(b.id)}
                      title={`Unhide ${b.name}`}
                      aria-label={`Unhide ${b.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                    >
                      <Eye size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* External shortcuts */}
        <div className="mt-5">
          <GroupLabel>Shortcuts</GroupLabel>
          <div className="space-y-px">
            <ExternalItem href="https://mail.google.com/" icon={<Mail size={15} />}>Email</ExternalItem>
            <ExternalItem href="https://calendar.google.com/" icon={<Calendar size={15} />}>Calendar</ExternalItem>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pb-safe-3 mt-4 flex items-center justify-between px-3 pt-2">
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink md:h-8 md:w-8"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        {onLogout && (
          <button
            onClick={onLogout}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-ink-3 transition-colors hover:bg-hover hover:text-ink md:h-8"
          >
            <LogOut size={13} /> Log out
          </button>
        )}
      </div>
    </aside>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 px-2 text-[11px] font-medium text-ink-3">{children}</div>;
}

const itemClass =
  "group flex h-10 md:h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors";

function NavItem({
  href,
  active,
  icon,
  trailing,
  children,
}: {
  href: string;
  active: boolean;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        itemClass,
        active ? "bg-raised font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-hover hover:text-ink"
      )}
    >
      <span className={cn("flex w-5 shrink-0 justify-center", !active && "text-ink-3 group-hover:text-ink-2")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </Link>
  );
}

function ExternalItem({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(itemClass, "text-ink-2 hover:bg-hover hover:text-ink")}>
      <span className="flex w-5 shrink-0 justify-center text-ink-3 group-hover:text-ink-2">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ArrowUpRight size={12} className="shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100" />
    </a>
  );
}
