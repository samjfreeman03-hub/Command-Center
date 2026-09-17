import type { Business } from "@/lib/businesses";
import { cn } from "@/lib/cn";

// ── Badge ────────────────────────────────────────────────────────────────────

const tones = {
  neutral: "bg-sunken text-ink-2 ring-line",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-500/20",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  amber: "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25",
  red: "bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/20",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/20",
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20",
  inverse: "bg-inverse text-on-inverse ring-transparent",
} as const;

export type BadgeTone = keyof typeof tones;

/** Small status/label chip. One shape and size everywhere. */
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// ── Brand tile ───────────────────────────────────────────────────────────────

const tileSizes = {
  xs: "h-5 w-5 rounded-md text-[10px]",
  sm: "h-6 w-6 rounded-md text-[11px]",
  md: "h-8 w-8 rounded-lg text-[13px]",
  lg: "h-10 w-10 rounded-xl text-base",
} as const;

/** The business monogram: brand color, white initial, soft inner highlight. */
export function BrandTile({ business, size = "sm" }: { business: Business; size?: keyof typeof tileSizes }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-bold text-white ring-1 ring-inset ring-white/15",
        tileSizes[size]
      )}
      style={{
        backgroundColor: business.hex,
        backgroundImage: "linear-gradient(135deg, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0) 55%)",
      }}
      aria-hidden
    >
      {business.name.charAt(0)}
    </span>
  );
}

// ── Layout bits ──────────────────────────────────────────────────────────────

/** A titled group: small label, optional count + hint on the left, optional action on the right. */
export function SectionHeader({
  title,
  count,
  hint,
  action,
  className,
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-3 px-1", className)}>
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {count !== undefined && <span className="text-xs tabular-nums text-ink-3">{count}</span>}
        {hint && <span className="truncate text-xs text-ink-3">{hint}</span>}
      </div>
      {action}
    </div>
  );
}

/**
 * Bordered surface for grouped rows or a widget. Rows inside use
 * `divide-y divide-line`. Pass `clip={false}` when a popover or menu inside
 * must be able to overflow the card.
 */
export function Card({
  className,
  clip = true,
  children,
}: {
  className?: string;
  clip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-raised shadow-card", clip && "overflow-hidden", className)}>
      {children}
    </div>
  );
}

/** Friendly blank slate with one clear next step. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-sunken text-ink-3 ring-1 ring-inset ring-line">
        {icon}
      </div>
      <div className="text-sm font-semibold text-ink">{title}</div>
      {body && <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Keyboard key hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-sunken px-1 font-sans text-[10.5px] font-medium text-ink-3",
        className
      )}
    >
      {children}
    </kbd>
  );
}
