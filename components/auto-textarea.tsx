"use client";

import { useCallback, useEffect, useRef } from "react";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  /** Starting height in rows when empty/short. */
  minRows?: number;
  /** Growth cap — beyond this the textarea scrolls internally. */
  maxHeightPx?: number;
};

/**
 * Textarea that auto-grows to fit its content, so notes are never trapped in
 * a tiny scrolling box. Grows as you type, shrinks on delete, caps at
 * maxHeightPx (then scrolls). Use for any notes/description field.
 */
export function AutoTextarea({ value, minRows = 3, maxHeightPx = 420, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight + 2, maxHeightPx);
    el.style.height = `${next}px`;
    // Decide scrollability from the ACTUAL rendered height, not the height we
    // asked for — flex layouts or parent constraints can render the element
    // shorter than the style we set, and clipping without scroll would trap
    // content out of reach.
    const clipped = el.scrollHeight > el.clientHeight + 4;
    el.style.overflowY = clipped ? "auto" : "hidden";
  }, [maxHeightPx]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  // Re-measure when the viewport changes (line wraps shift with width)
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  return <textarea ref={ref} rows={minRows} value={value} {...rest} />;
}
