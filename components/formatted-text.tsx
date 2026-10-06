import { Fragment } from "react";

/**
 * Renders text that may contain `**bold**` and `__underline__` markers (see
 * lib/markup.ts). Newlines are preserved by the caller's `whitespace-pre-wrap`.
 */
export function FormattedText({ text }: { text: string }) {
  return <>{render(text, 0)}</>;
}

const TOKEN = /(\*\*[^*][\s\S]*?\*\*|__[^_][\s\S]*?__)/g;

function render(text: string, depth: number): React.ReactNode[] {
  if (depth > 4) return [text];
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-semibold">{render(part.slice(2, -2), depth + 1)}</strong>;
    }
    if (part.startsWith("__") && part.endsWith("__") && part.length > 4) {
      return <u key={i} className="underline underline-offset-2">{render(part.slice(2, -2), depth + 1)}</u>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
