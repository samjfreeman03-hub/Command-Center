"use client";

import { useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { brandVars, type Business } from "@/lib/businesses";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { BrandTile } from "@/components/ui/display";

/** Quick horizontal shake. Skipped when the visitor prefers reduced motion. */
function shake(el: HTMLElement | null) {
  if (!el || typeof el.animate !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 320, easing: "ease-out" }
  );
}

/**
 * Client-side password gate shown when a visitor lands on /s/[token] without
 * a valid share-auth cookie. Submits to /api/share-auth/[business_id], which
 * sets the cookie on success, then reloads to render the SharedView.
 */
export function SharePasswordGate({ business }: { business: Business }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLFormElement>(null);

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
        // Cookie is now set. Reload so the server-rendered page picks it up.
        window.location.reload();
      } else {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data.error === "Wrong password" ? "Wrong password. Ask Sam for the team password." : (data.error ?? "Login failed."));
        setSubmitting(false);
        shake(cardRef.current);
      }
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
      shake(cardRef.current);
    }
  }

  return (
    <div
      className="brand-scope flex min-h-screen items-center justify-center bg-shell px-4 py-10"
      style={brandVars(business)}
    >
      <form
        ref={cardRef}
        onSubmit={submit}
        className="pop-in w-full max-w-[380px] rounded-2xl border border-line bg-raised p-8 shadow-pop"
      >
        <div className="mb-7">
          <div className="mb-5">
            <BrandTile business={business} size="lg" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{business.name}</h1>
          <p className="mt-1 text-[13px] leading-snug text-ink-3">
            Team workspace. Enter the team password to continue.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                disabled={submitting}
                aria-invalid={error ? true : undefined}
              />
            </Field>
            {error && (
              <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertCircle size={13} className="mt-px shrink-0" />
                {error}
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="brand"
            size="lg"
            className="w-full"
            loading={submitting}
            disabled={!password.trim()}
          >
            Continue
          </Button>
        </div>

        <p className="mt-5 text-center text-xs text-ink-3">
          Need access? Ask Sam for the team password.
        </p>
      </form>
    </div>
  );
}
