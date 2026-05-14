"use client";

import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/s/");

  if (isPublic) {
    return <>{children}</>;
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <ThemeToggle />
      <div className="flex min-h-screen">
        <Sidebar onLogout={logout} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </>
  );
}
