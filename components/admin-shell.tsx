"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { Menu } from "lucide-react";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/s/");

  if (isPublic) return <>{children}</>;

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <ThemeToggle />

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-12 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-900 flex items-center px-4 gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-1 -ml-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Command Center</span>
      </header>

      {/* Mobile sidebar drawer */}
      {drawerOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-60">
            <Sidebar onLogout={logout} onClose={() => setDrawerOpen(false)} />
          </div>
        </>
      )}

      <div className="flex min-h-screen">
        <div className="hidden md:block">
          <Sidebar onLogout={logout} />
        </div>
        <main className="flex-1 min-w-0 pt-12 md:pt-0">{children}</main>
      </div>
    </>
  );
}
