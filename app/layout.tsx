import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AdminShell } from "@/components/admin-shell";
import { UIHost } from "@/components/ui/host";
import { db } from "@/lib/db";

/**
 * Hidden businesses for the sidebar. Skipped during `next build` (static pages
 * like /login would otherwise open the database in the build container).
 */
function hiddenBusinessIds(): string[] {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  try {
    return db.hiddenBusinessIds();
  } catch {
    return [];
  }
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Command Center",
  description: "Your personal operating system",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Command Center",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // enables env(safe-area-inset-*) for notch/home bar
};

// Runs before paint to avoid flash of wrong theme.
// Share views (/s/...) always render in light mode — visitors don't have
// access to the sidebar theme toggle, so we force a consistent clean look
// for team members regardless of their OS dark-mode preference.
const themeInit = `
(function() {
  try {
    if (window.location.pathname.startsWith('/s/')) return; // share view → always light
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var useDark = stored ? stored === 'dark' : prefersDark;
    if (useDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full bg-shell text-ink">
        <AdminShell hiddenBusinessIds={hiddenBusinessIds()}>{children}</AdminShell>
        <UIHost />
      </body>
    </html>
  );
}
