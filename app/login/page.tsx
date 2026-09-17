"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

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

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);

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
      shake(cardRef.current);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-shell px-4 py-10">
      <div
        ref={cardRef}
        className="pop-in w-full max-w-[380px] rounded-2xl border border-line bg-raised p-8 shadow-pop"
      >
        <div className="mb-7">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-inverse text-[13px] font-bold tracking-tight text-on-inverse shadow-card">
            CC
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Command Center</h1>
          <p className="mt-1 text-[13px] text-ink-3">Sign in to your operating system</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
                autoComplete="current-password"
                aria-invalid={error ? true : undefined}
              />
            </Field>
            {error && (
              <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertCircle size={13} className="shrink-0" />
                {error}
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={loading}
            disabled={!password}
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
