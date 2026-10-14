/**
 * Deterministic document-type classifier for scoreboard scoping.
 * In scope: CREDIT_AGREEMENT, INDENTURE_OR_NOTE, CREDIT_SUPPORT (guarantee/collateral docs).
 * Out of scope: OTHER (equity plans, bylaws, consents, certifications, swap confirmations,
 * charters, LLC agreements, filing bodies …). Title first, then sourceId filename, then the
 * opening text. No signal → UNKNOWN, which stays IN scope (never silently dropped).
 */
export type DocType = "CREDIT_AGREEMENT" | "INDENTURE_OR_NOTE" | "CREDIT_SUPPORT" | "OTHER" | "UNKNOWN";

const OTHER_RE =
  /\b(?:plan|by-?laws|consent|opinion|certificat(?:e|ion)|confirmation|articles of incorporation|cert of (?:amend|incorp)|llc agreement|limited liability (?:company|corporation)|registration rights|option agreement|stock option|severance|license agreement|support agreement|10-q body|8-k\b(?!.*credit)|incentive|compensation|section 906|section 302|isda|swap)\b/i;
const INDENTURE_RE = /\b(?:indenture|notes? due|note purchase|senior (?:secured |guaranteed )?notes|convertible)\b/i;
const CREDIT_RE = /\b(?:credit agreement|loan agreement|credit facility|term loan|revolving (?:credit|facility)|incremental amendment|facility activation|credit and guaranty)\b/i;
const SUPPORT_RE = /\b(?:guarantee and collateral|security agreement|pledge agreement|guaranty agreement|intercreditor)\b/i;

export function classifyDocType(args: { sourceId: string; title?: string | null; text?: string | null; excerpts?: string[] }): { type: DocType; basis: string } {
  const title = (args.title ?? "").replace(/&amp;/g, "&");
  const byPatterns = (s: string): DocType | null => {
    if (SUPPORT_RE.test(s)) return "CREDIT_SUPPORT";
    if (CREDIT_RE.test(s)) return "CREDIT_AGREEMENT";
    if (INDENTURE_RE.test(s)) return "INDENTURE_OR_NOTE";
    if (OTHER_RE.test(s)) return "OTHER";
    return null;
  };
  // Title: in-scope patterns beat OTHER only when the title names the credit instrument.
  const t = byPatterns(title);
  if (t) return { type: t, basis: "title" };
  const file = args.sourceId.split(":").pop() ?? "";
  const f = byPatterns(file.replace(/[-_]/g, " ")) ?? (/credit|loan|creditagre|termloan/i.test(file) ? "CREDIT_AGREEMENT" : /indent|notes?pur/i.test(file) ? "INDENTURE_OR_NOTE" : /bylaw|plan|consent|ex32|ex23|ex5\d|confirm/i.test(file) ? "OTHER" : null);
  if (f) return { type: f, basis: "filename" };
  const head = ((args.text ?? "").slice(0, 20000) || (args.excerpts ?? []).join("\n").slice(0, 20000)).replace(/<[^>]+>/g, " ");
  const credit = (head.match(/credit agreement|loan agreement/gi) ?? []).length;
  const ind = (head.match(/\bindenture\b/gi) ?? []).length;
  if (credit >= 3 && credit >= ind) return { type: "CREDIT_AGREEMENT", basis: "text" };
  if (ind >= 3) return { type: "INDENTURE_OR_NOTE", basis: "text" };
  return { type: "UNKNOWN", basis: "no signal" };
}

export const IN_SCOPE: ReadonlySet<DocType> = new Set(["CREDIT_AGREEMENT", "INDENTURE_OR_NOTE", "CREDIT_SUPPORT", "UNKNOWN"]);
