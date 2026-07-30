"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Incorrect password");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[radial-gradient(ellipse_at_top,_#ffffff_0%,_#f4f4f5_55%,_#e4e4e7_100%)] dark:bg-[radial-gradient(ellipse_at_top,_#18181b_0%,_#0a0a0a_60%)]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shadow-lg shadow-zinc-900/20 dark:shadow-zinc-100/10 mb-4">
            <span className="text-sm font-bold text-zinc-50 dark:text-zinc-900 tracking-tight">CC</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Command Center</h1>
          <p className="text-sm text-zinc-500 mt-1">Your personal operating system</p>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-xl shadow-zinc-200/50 dark:shadow-black/40">
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
                className="w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 px-3.5 py-2.5 rounded-lg outline-none border border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-sm"
              />
            </div>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 transition-colors mt-1"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
