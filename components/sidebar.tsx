"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BUSINESSES } from "@/lib/businesses";
import { LayoutDashboard, Inbox, LogOut, Sun, Moon, X } from "lucide-react";

export function Sidebar({ onLogout, onClose }: { onLogout?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

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
    <aside className="w-full h-full shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-col overflow-y-auto safe-bottom">

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
        <NavItem href="/inbox" active={pathname === "/inbox"} icon={<Inbox size={15} />}>
          Inbox
        </NavItem>
      </div>

      {/* Businesses */}
      <div className="mt-5 px-3 flex-1">
        <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-400 dark:text-zinc-600">
          Businesses
        </div>
        <div className="space-y-0.5">
          {BUSINESSES.map((b) => {
            const href = `/b/${b.id}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <NavItem key={b.id} href={href} active={active} dot={b.dot}>
                {b.name}
              </NavItem>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="px-3 py-3 mt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between safe-bottom">
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

function NavItem({
  href,
  active,
  children,
  icon,
  dot,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  dot?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2.5 md:py-2 rounded-lg text-sm transition-colors ${
        active
          ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {icon}
      {dot && <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />}
      <span className="truncate">{children}</span>
    </Link>
  );
}
