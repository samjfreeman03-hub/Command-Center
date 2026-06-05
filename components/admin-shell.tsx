"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
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
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-13 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-1.5 -ml-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shrink-0">
            <span className="text-[9px] font-bold text-zinc-50 dark:text-zinc-900">CC</span>
          </div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Command Center</span>
        </div>
      </header>

      {/* Mobile sidebar drawer */}
      {drawerOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-60 shadow-2xl">
            <Sidebar onLogout={logout} onClose={() => setDrawerOpen(false)} />
          </div>
        </>
      )}

      <div className="flex min-h-screen">
        <div className="hidden md:block sticky top-0 h-screen">
          <Sidebar onLogout={logout} />
        </div>
        <main className="flex-1 min-w-0 pt-13 md:pt-0">{children}</main>
      </div>
    </>
  );
}
