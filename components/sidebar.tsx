"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BUSINESSES } from "@/lib/businesses";
import { LayoutDashboard, LogOut } from "lucide-react";

export function Sidebar({ onLogout }: { onLogout?: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 px-3 py-5 flex flex-col gap-1">
      <div className="px-3 mb-4">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Command</div>
        <div className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Center</div>
      </div>

      <NavItem href="/" active={pathname === "/"} icon={<LayoutDashboard size={16} />}>
        Dashboard
      </NavItem>

      <div className="mt-4 mb-1 px-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        Businesses
      </div>

      {BUSINESSES.map((b) => {
        const href = `/b/${b.id}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <NavItem key={b.id} href={href} active={active} dot={b.dot}>
            {b.name}
          </NavItem>
        );
      })}

      <div className="mt-auto flex items-center justify-between px-3 py-3">
        <span className="text-[10px] text-zinc-400 dark:text-zinc-600">v0.1</span>
        {onLogout && (
          <button
            onClick={onLogout}
            className="text-[10px] text-zinc-400 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 inline-flex items-center gap-1"
          >
            <LogOut size={10} /> Log out
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
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60 hover:text-zinc-900 dark:hover:text-zinc-200"
      }`}
    >
      {icon}
      {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
      <span className="truncate">{children}</span>
    </Link>
  );
}
