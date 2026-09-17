"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BUSINESSES, type Business } from "@/lib/businesses";
import { LayoutDashboard, Mail, Calendar, ExternalLink, LogOut, Sun, Moon, X, ChevronRight, Eye } from "lucide-react";

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

  const visible = BUSINESSES.filter((b) => !hiddenBusinessIds.includes(b.id));
  const hidden = BUSINESSES.filter((b) => hiddenBusinessIds.includes(b.id));
  const isActive = (b: Business) => pathname === `/b/${b.id}` || pathname.startsWith(`/b/${b.id}/`);
  // Open the Hidden group automatically while viewing one of its businesses
  const [showHidden, setShowHidden] = useState(false);
  const hiddenOpen = showHidden || hidden.some(isActive);

  async function unhide(id: string) {
    await fetch(`/api/businesses/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hidden: false }),
    });
    router.refresh();
  }

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    const initial: "light" | "dark" =
      stored ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");
    setTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  }

  return (
    <aside className="w-full h-full shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col overflow-y-auto safe-bottom">

      {/* Logo — pushes down by safe-area-inset-top when drawer on mobile */}
      <div className="mobile-header md:pt-0 px-4 pt-5">
      <div className="h-14 md:h-auto md:py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-[11px] font-bold text-zinc-50 dark:text-zinc-900 tracking-tight">CC</span>
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Command</div>
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 -mt-0.5 tracking-tight">Center</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <X size={16} />
          </button>
        )}
      </div>
      </div>

      {/* Main nav */}
      <div className="px-3 space-y-0.5">
        <NavItem href="/" active={pathname === "/"} icon={<LayoutDashboard size={15} />}>
          Dashboard
        </NavItem>
      </div>

      {/* Quick links */}
      <div className="mt-1 px-3 space-y-0.5">
        <a
          href="https://mail.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2.5 md:py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group"
        >
          <Mail size={15} className="shrink-0" />
          <span className="truncate flex-1">Email</span>
          <ExternalLink size={12} className="shrink-0 opacity-40 md:opacity-0 md:group-hover:opacity-60 transition-opacity" />
        </a>
        <a
          href="https://calendar.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2.5 md:py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group"
        >
          <Calendar size={15} className="shrink-0" />
          <span className="truncate flex-1">Calendar</span>
          <ExternalLink size={12} className="shrink-0 opacity-40 md:opacity-0 md:group-hover:opacity-60 transition-opacity" />
        </a>
      </div>

      {/* Businesses */}
      <div className="mt-5 px-3 flex-1">
        <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-400 dark:text-zinc-600">
          Businesses
        </div>
        <div className="space-y-0.5">
          {visible.map((b) => (
            <NavItem key={b.id} href={`/b/${b.id}`} active={isActive(b)} icon={<BrandTile business={b} />}>
              {b.name}
            </NavItem>
          ))}
        </div>

        {/* Hidden businesses: out of the way, one click to reach or restore */}
        {hidden.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
              aria-expanded={hiddenOpen}
            >
              <ChevronRight size={11} className={`transition-transform ${hiddenOpen ? "rotate-90" : ""}`} />
              Hidden · {hidden.length}
            </button>
            {hiddenOpen && (
              <div className="space-y-0.5">
                {hidden.map((b) => (
                  <div key={b.id} className="flex items-center gap-1">
                    <div className="flex-1 min-w-0 opacity-60 hover:opacity-100 transition-opacity">
                      <NavItem href={`/b/${b.id}`} active={isActive(b)} icon={<BrandTile business={b} />}>
                        {b.name}
                      </NavItem>
                    </div>
                    <button
                      onClick={() => unhide(b.id)}
                      title={`Unhide ${b.name}`}
                      aria-label={`Unhide ${b.name}`}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <Eye size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="px-3 pt-3 pb-safe-3 mt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <button
          onClick={toggleTheme}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {onLogout && (
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 h-10 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <LogOut size={13} /> Log out
          </button>
        )}
      </div>
    </aside>
  );
}

function BrandTile({ business }: { business: Business }) {
  return (
    <span
      className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-white text-[10px] font-bold shadow-sm"
      style={{ backgroundColor: business.hex }}
    >
      {business.name.charAt(0)}
    </span>
  );
}

function NavItem({
  href,
  active,
  children,
  icon,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2.5 md:py-2 rounded-lg text-sm transition-colors ${
        active
          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium shadow-sm ring-1 ring-zinc-200/70 dark:ring-zinc-700/50"
          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/70 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}
