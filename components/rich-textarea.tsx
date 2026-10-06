"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Underline } from "lucide-react";
import { htmlToMarkup, markupToHtml } from "@/lib/markup";
import { cn } from "@/lib/cn";

type ChangeEvent = { target: { value: string } };

type Props = {
  value: string;
  /** Same shape as a textarea change handler, so callers swap in without edits. */
  onChange: (e: ChangeEvent) => void;
  placeholder?: string;
  /** Starting height in rows when empty/short. Omit for no minimum. */
  minRows?: number;
  /** Growth cap; beyond it the box scrolls internally. Omit for unlimited. */
  maxHeightPx?: number;
  className?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
  id?: string;
  onFocus?: () => void;
  onBlur?: () => void;
};

/**
 * Multi-line text box with bold and underline. Drop-in for AutoTextarea.
 *
 * Cmd/Ctrl+B and Cmd/Ctrl+U toggle formatting; a small B/U bar appears while
 * focused for touch. The value you get back is plain text with `**` and `__`
 * markers (lib/markup.ts), so storage, search and the AI are unchanged.
 * Paste is always plain text. Grows with content like AutoTextarea.
 */
export function RichTextarea({
  value, onChange, placeholder, minRows, maxHeightPx, className, autoFocus, id, onFocus, onBlur, ...rest
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(!value);

  // Re-render the DOM only when the value changed somewhere other than here
  // (initial mount, autosave reload, switching records). Rewriting innerHTML
  // on every keystroke would throw the caret to the start.
  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    el.innerHTML = markupToHtml(value);
    lastEmitted.current = value;
    setEmpty(!value);
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // A <label> ancestor would make the toolbar's Bold button the label's
  // control: every tap in the box would activate that button instead of
  // placing the caret (and on iOS the keyboard never opens). Use FieldGroup.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && ref.current?.closest("label")) {
      console.warn("RichTextarea must not be wrapped in <Field>/<label>; use <FieldGroup> instead.");
    }
  }, []);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = htmlToMarkup(el);
    lastEmitted.current = next;
    setEmpty(next.length === 0);
    onChange({ target: { value: next } });
  }, [onChange]);

  const exec = (command: "bold" | "underline") => {
    ref.current?.focus();
    document.execCommand(command, false);
    emit();
  };

  return (
    <div className="group/rt relative">
      <div
        ref={ref}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-label={rest["aria-label"]}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? ""}
        data-empty={empty ? "true" : "false"}
        onInput={emit}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        onKeyDown={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return;
          const k = e.key.toLowerCase();
          if (k === "b") { e.preventDefault(); exec("bold"); }
          else if (k === "u") { e.preventDefault(); exec("underline"); }
          else if (k === "i") e.preventDefault(); // italics are not part of the format
        }}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        className={cn("rich-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]", className)}
        style={{
          minHeight: minRows ? `calc(${minRows} * 1.6em + 1rem)` : undefined,
          maxHeight: maxHeightPx ? `${maxHeightPx}px` : undefined,
          overflowY: maxHeightPx ? "auto" : undefined,
        }}
      />
      {/* Formatting bar: visible while focused (touch has no Cmd key) */}
      <div
        className={cn(
          "absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-raised/95 p-0.5 shadow-card ring-1 ring-line backdrop-blur transition-opacity",
          // CSS :focus-within as well as state, so it also shows when the editor
          // is active without a focus event having fired (e.g. restored focus)
          focused ? "opacity-100" : "pointer-events-none opacity-0 group-focus-within/rt:pointer-events-auto group-focus-within/rt:opacity-100"
        )}
        aria-hidden={!focused}
      >
        <FormatButton label="Bold (⌘B)" onClick={() => exec("bold")}><Bold size={12} strokeWidth={2.5} /></FormatButton>
        <FormatButton label="Underline (⌘U)" onClick={() => exec("underline")}><Underline size={12} strokeWidth={2.5} /></FormatButton>
      </div>
    </div>
  );
}

function FormatButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // mousedown, not click: keep the editor's selection alive
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      onTouchEnd={(e) => { e.preventDefault(); onClick(); }}
      className="flex h-7 w-7 items-center justify-center rounded text-ink-2 transition-colors hover:bg-hover hover:text-ink md:h-6 md:w-6"
    >
      {children}
    </button>
  );
}
