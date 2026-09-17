"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-lg select-none " +
  "transition-[background-color,border-color,color,opacity,box-shadow] duration-150 " +
  "disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-inverse text-on-inverse shadow-card hover:opacity-90",
  secondary: "bg-raised text-ink border border-line-strong shadow-card hover:bg-sunken",
  ghost: "text-ink-2 hover:text-ink hover:bg-hover",
  danger: "text-red-600 dark:text-red-400 hover:bg-red-500/10",
  brand: "bg-brand text-on-brand shadow-card hover:opacity-90",
};

// Touch-first heights on small screens, denser on desktop.
const sizes: Record<Size, string> = {
  sm: "h-8 md:h-7 px-2.5 text-xs",
  md: "h-10 md:h-8 px-3.5 md:px-3 text-sm md:text-[13px]",
  lg: "h-11 md:h-10 px-4 text-sm",
};

const iconSizes: Record<Size, string> = {
  sm: "h-8 w-8 md:h-7 md:w-7",
  md: "h-10 w-10 md:h-8 md:w-8",
  lg: "h-11 w-11 md:h-10 md:w-10",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, disabled, className, children, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
});

type IconButtonProps = Omit<ButtonProps, "children"> & {
  /** Required: used for aria-label and the hover tooltip. */
  label: string;
  children: React.ReactNode;
};

/** Square icon-only button. Defaults to the ghost variant. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "ghost", size = "md", label, className, children, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], iconSizes[size], "shrink-0", className)}
      {...rest}
    >
      {children}
    </button>
  );
});
