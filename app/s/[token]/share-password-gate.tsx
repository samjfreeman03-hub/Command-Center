"use client";

import { useState } from "react";
import type { Business } from "@/lib/businesses";
import { Lock, Loader2 } from "lucide-react";

/**
 * Client-side password gate shown when a visitor lands on /s/[token] without
 * a valid share-auth cookie. Submits to /api/share-auth/[business_id], which
 * sets the cookie on success — then reloads to render the SharedView.
 */
export function SharePasswordGate({ business }: { business: Business }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/share-auth/${business.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Cookie is now set — reload so the server-rendered page picks it up
        window.location.reload();
      } else {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data.error === "Wrong password" ? "Wrong password — ask Sam for the team password." : (data.error ?? "Login failed."));
        setSubmitting(false);
      }
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-white">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-7 space-y-5 shadow-sm"
      >
        <div className="space-y-2.5">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${business.accentBg} ${business.accent} ring-1`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${business.dot}`} />
            <span>{business.fullName}</span>
          </div>
          <h1 className={`text-2xl font-bold tracking-tight ${business.accent}`}>
            {business.name}
          </h1>
          <p className="text-sm text-zinc-500 leading-snug flex items-center gap-1.5">
            <Lock size={12} /> Team password required
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="share-password" className="text-xs text-zinc-500 block">
            Password
          </label>
          <input
            id="share-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder=""
            autoFocus
            autoComplete="current-password"
            disabled={submitting}
            className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:opacity-50"
          />
          {error && (
            <p className="text-xs text-rose-600 pt-1">{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !password.trim()}
          className="w-full inline-flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm font-medium py-2.5 rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitting ? "Checking..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
