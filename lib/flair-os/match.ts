/**
 * Reconciliation matcher (v2 design, section 4). Pure functions, shared by
 * the server (reconciliation lane) and the browser (duplicate markers on the
 * FLAIR OS board). Nothing here reads or writes the database.
 *
 * Verdicts, for one Command Center-only FLAIR lead against the mirrored
 * FLAIR OS deals:
 *   same    contact email equal, or company equal (normalized) and contact
 *           name equal (normalized)
 *   likely  email domain equal (not a public mailbox) and company similar,
 *           or company equal with no contact to compare on one side, or
 *           company equal with a different contact
 *   none    nothing matches
 */

export type MatchVerdict = "same" | "likely" | "none";

export type MatchCandidate = {
  id: string;
  company: string | null;
  contactName: string | null;
  email: string | null;
};

export type MatchResult = {
  verdict: MatchVerdict;
  candidate: MatchCandidate | null;
  reason: string;
};

const NOISE = new Set(["the", "inc", "inc.", "llc", "ltd", "co", "corp", "corporation", "company", "group", "brands", "brand", "and", "&"]);
const PUBLIC_MAILBOXES = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "me.com", "aol.com", "live.com", "proton.me", "protonmail.com"]);

/** Lower case, letters and digits only, with corporate suffixes and articles dropped. */
export function normalizeCompany(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NOISE.has(t))
    .join(" ")
    .trim();
}

export function normalizePerson(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toLowerCase().replace(/[^a-z]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase();
}

/** The domain of a work email, or null for a public mailbox or no email. */
export function workDomain(email: string | null | undefined): string | null {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  if (at < 0) return null;
  const domain = e.slice(at + 1);
  if (!domain || PUBLIC_MAILBOXES.has(domain)) return null;
  return domain;
}

/** Equal, or one is a leading part of the other (at least four characters), or they share a first token of four or more characters. */
export function companiesSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  const ta = a.split(" ")[0];
  const tb = b.split(" ")[0];
  return ta.length >= 4 && ta === tb;
}

export function matchLead(
  lead: { company: string | null; contactName: string | null; email: string | null },
  candidates: MatchCandidate[]
): MatchResult {
  const email = normalizeEmail(lead.email);
  const company = normalizeCompany(lead.company);
  const person = normalizePerson(lead.contactName);
  const domain = workDomain(lead.email);

  if (email) {
    const hit = candidates.find((c) => normalizeEmail(c.email) === email);
    if (hit) return { verdict: "same", candidate: hit, reason: "Same contact email" };
  }
  if (company && person) {
    const hit = candidates.find((c) => normalizeCompany(c.company) === company && normalizePerson(c.contactName) === person);
    if (hit) return { verdict: "same", candidate: hit, reason: "Same company and contact" };
  }
  if (company) {
    const sameCompany = candidates.filter((c) => normalizeCompany(c.company) === company);
    if (sameCompany.length) {
      const open = sameCompany.find((c) => !person || !normalizePerson(c.contactName));
      if (open) return { verdict: "likely", candidate: open, reason: "Same company, no contact to compare" };
      return { verdict: "likely", candidate: sameCompany[0], reason: "Same company, different contact" };
    }
  }
  if (domain) {
    const hit = candidates.find((c) => workDomain(c.email) === domain && companiesSimilar(normalizeCompany(c.company), company));
    if (hit) return { verdict: "likely", candidate: hit, reason: "Same email domain and a similar company name" };
  }
  return { verdict: "none", candidate: null, reason: "Not in FLAIR OS" };
}

/**
 * Groups of FLAIR OS deals that share a normalized company name. Returned as
 * a map from deal id to the ids of its twins, so a board can mark each card.
 */
export function duplicateGroups(deals: MatchCandidate[]): Record<string, string[]> {
  const byCompany = new Map<string, string[]>();
  for (const d of deals) {
    const key = normalizeCompany(d.company);
    if (!key) continue;
    const list = byCompany.get(key) ?? [];
    list.push(d.id);
    byCompany.set(key, list);
  }
  const out: Record<string, string[]> = {};
  for (const ids of byCompany.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) out[id] = ids.filter((x) => x !== id);
  }
  return out;
}
