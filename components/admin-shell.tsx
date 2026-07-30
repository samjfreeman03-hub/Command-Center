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
      {/* Mobile top bar — sits behind status bar, uses safe-area padding */}
      <header className="mobile-header md:hidden fixed top-0 inset-x-0 z-30 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="h-13 flex items-center px-4 gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center justify-center w-10 h-10 -ml-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-zinc-50 dark:text-zinc-900">CC</span>
            </div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Command Center</span>
          </div>
        </div>
      </header>

      {/* Mobile sidebar drawer */}
      {drawerOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer — adds safe-area padding at top and bottom */}
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-[280px] shadow-2xl safe-left">
            <Sidebar onLogout={logout} onClose={() => setDrawerOpen(false)} />
          </div>
        </>
      )}

      <div className="flex min-h-screen">
        <div className="hidden md:block sticky top-0 h-screen shrink-0">
          <Sidebar onLogout={logout} />
        </div>
        {/* mobile-content-offset handles notch via CSS */}
        <main className="flex-1 min-w-0 mobile-content-offset md:pt-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    </>
  );
}
