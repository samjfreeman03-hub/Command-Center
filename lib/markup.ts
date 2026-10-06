/**
 * Inline formatting for every multi-line text box in the app.
 *
 * Storage stays plain text, with two markers: `**bold**` and `__underline__`.
 * That keeps the database, the AI context blocks, search, and every API
 * exactly as they were; only the editor (components/rich-textarea.tsx) and
 * the <FormattedText> renderer know the markers mean anything.
 */

const BOLD = /\*\*([^*][\s\S]*?)\*\*/g;
const UNDERLINE = /__([^_][\s\S]*?)__/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Markup → HTML for a contentEditable editor (only <b>, <u>, <br> ever come out). */
export function markupToHtml(text: string): string {
  return escapeHtml(text)
    .replace(BOLD, "<b>$1</b>")
    .replace(UNDERLINE, "<u>$1</u>")
    .replace(/\n/g, "<br>");
}

type Segment = { text: string; bold: boolean; underline: boolean };

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "PRE"]);

/** Editor DOM → markup. Tolerates whatever block/inline soup the browser produced. */
export function htmlToMarkup(root: HTMLElement): string {
  const segs: Segment[] = [];
  const push = (text: string, bold: boolean, underline: boolean) => {
    if (!text) return;
    const last = segs[segs.length - 1];
    if (last && last.bold === bold && last.underline === underline) last.text += text;
    else segs.push({ text, bold, underline });
  };
  const endsWithNewline = () => segs.length === 0 || segs[segs.length - 1].text.endsWith("\n");

  function walk(node: Node, bold: boolean, underline: boolean) {
    if (node.nodeType === Node.TEXT_NODE) {
      push(node.textContent ?? "", bold, underline);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === "BR") {
      push("\n", false, false);
      return;
    }
    const style = el.style;
    const b = bold || tag === "B" || tag === "STRONG" || style.fontWeight === "bold" || Number(style.fontWeight) >= 600;
    const u = underline || tag === "U" || (style.textDecoration ?? "").includes("underline");
    const block = BLOCK_TAGS.has(tag);
    if (block && segs.length > 0 && !endsWithNewline()) push("\n", false, false);
    el.childNodes.forEach((child) => walk(child, b, u));
    // A block that ended without its own line break still ends the line
    if (block && !endsWithNewline() && el.nextSibling) push("\n", false, false);
  }
  root.childNodes.forEach((n) => walk(n, false, false));

  return segs
    .map(({ text, bold, underline }) => {
      if (!bold && !underline) return text;
      // Markers hug the words: leading/trailing whitespace stays outside
      const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      let core = m[2];
      if (!core) return text;
      if (underline) core = `__${core}__`;
      if (bold) core = `**${core}**`;
      return m[1] + core + m[3];
    })
    .join("")
    .replace(/ /g, " ");
}

/** Markup → plain text (for previews, search, anything that must not show markers). */
export function stripMarkup(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(BOLD, "$1").replace(UNDERLINE, "$1");
}
