"use client";

import { forwardRef } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

/** Shared look for every text control. Also usable on AutoTextarea via `textareaClass`. */
const control =
  "w-full rounded-lg border border-line-strong bg-raised text-sm text-ink placeholder:text-ink-4 outline-none " +
  "transition-[border-color,box-shadow] duration-150 " +
  "hover:border-ink-4 focus:border-ink-3 focus:ring-[3px] focus:ring-ink/10 disabled:opacity-50";

export const inputClass = cn(control, "h-10 md:h-9 px-3");
export const textareaClass = cn(control, "px-3 py-2 leading-relaxed resize-none");

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...rest} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(textareaClass, className)} {...rest} />;
  }
);

/** Native select (best on mobile) with a consistent shell and chevron. */
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(inputClass, "appearance-none pr-9 cursor-pointer", className)} {...rest}>
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
      </div>
    );
  }
);

/** Text input with a leading adornment such as "$" or an icon. */
export const PrefixInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> & { prefix: React.ReactNode }
>(function PrefixInput({ prefix, className, ...rest }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3 flex items-center">
        {prefix}
      </span>
      <input ref={ref} className={cn(inputClass, "pl-8", className)} {...rest} />
    </div>
  );
});

/** Search box with a leading icon. Use in panel toolbars. */
export const SearchInput = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix">>(
  function SearchInput({ placeholder = "Search…", ...rest }, ref) {
    return <PrefixInput ref={ref} prefix={<Search size={14} />} placeholder={placeholder} {...rest} />;
  }
);

/**
 * Like <Field>, but for controls made of buttons (Segmented, pill pickers,
 * chip editors). <Field> renders a <label>, which would forward a click on
 * the label text to the first button inside it.
 */
export function FieldGroup({
  label,
  count,
  hint,
  className,
  children,
}: {
  label: string;
  /** Optional item count shown after the label (e.g. attachments). */
  count?: number;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={cn("block", className)}>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-2">
        {label}
        {!!count && <span className="tabular-nums text-ink-3">{count}</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </div>
  );
}

/** Label + control + optional hint. Every form field in the app goes through this. */
export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-ink-2">
        {label}
        {required && <span className="text-ink-4">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}
