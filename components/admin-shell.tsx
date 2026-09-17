"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { OPEN_PALETTE_EVENT } from "@/lib/ui-events";
import { CommandPalette } from "./command-palette";
import { Menu, Search } from "lucide-react";

export function AdminShell({
  children,
  hiddenBusinessIds,
}: {
  children: React.ReactNode;
  hiddenBusinessIds: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const canvasRef = useRef<HTMLElement>(null);
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/s/");

  // The canvas is its own scroll container on desktop and persists across
  // navigations, so reset it when the page changes.
  useEffect(() => {
    canvasRef.current?.scrollTo(0, 0);
    setDrawerOpen(false);
  }, [pathname]);

  if (isPublic) return <>{children}</>;

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile top bar: sits behind the status bar, uses safe-area padding */}
      <header className="mobile-header fixed inset-x-0 top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md md:hidden">
        <div className="flex h-13 items-center gap-2 px-3">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"
          >
            <Menu size={19} />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-inverse text-[9px] font-bold text-on-inverse">CC</span>
            <span className="text-sm font-semibold tracking-tight text-ink">Command Center</span>
          </div>
          <button
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            aria-label="Search"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"
          >
            <Search size={18} />
          </button>
        </div>
      </header>

      {/* Mobile sidebar drawer */}
      {drawerOpen && (
        <>
          <div className="fade-in fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] md:hidden" onClick={() => setDrawerOpen(false)} />
          <div className="safe-left fixed inset-y-0 left-0 z-50 w-[280px] border-r border-line shadow-pop md:hidden">
            <Sidebar onLogout={logout} onClose={() => setDrawerOpen(false)} hiddenBusinessIds={hiddenBusinessIds} />
          </div>
        </>
      )}

      <div className="flex min-h-dvh md:h-dvh md:overflow-hidden">
        <div className="hidden h-dvh shrink-0 md:block">
          <Sidebar onLogout={logout} hiddenBusinessIds={hiddenBusinessIds} />
        </div>
        {/* Canvas: full-bleed on phones, an inset rounded surface on desktop */}
        <main
          ref={canvasRef}
          id="canvas"
          className="mobile-content-offset min-w-0 flex-1 overflow-x-hidden bg-canvas md:my-2 md:mr-2 md:overflow-y-auto md:rounded-2xl md:border md:border-line md:pt-0 md:shadow-card"
        >
          {children}
        </main>
      </div>

      <CommandPalette hiddenBusinessIds={hiddenBusinessIds} />
    </>
  );
}
