/**
 * Robustly extract a JSON object from an LLM response that may contain
 * surrounding narrative, markdown fences, or tool-call reasoning.
 *
 * Strategy:
 *   1. Try parsing the raw string as-is.
 *   2. If that fails, look for a ```json ... ``` fenced block and parse.
 *   3. If that fails, find the outermost balanced { ... } block and parse.
 *   4. Throws if nothing valid is found.
 */
export function extractJSON<T = unknown>(raw: string): T {
  const trimmed = raw.trim();

  // Attempt 1: bare JSON
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue
  }

  // Attempt 2: ```json ... ``` fenced block
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  // Attempt 3: outermost balanced { ... }
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace !== -1) {
    let depth = 0;
    let inString = false;
    let stringChar = "";
    let escape = false;
    for (let i = firstBrace; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (inString) {
        if (ch === stringChar) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const slice = trimmed.slice(firstBrace, i + 1);
          try {
            return JSON.parse(slice) as T;
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("No valid JSON object found in LLM response");
}
