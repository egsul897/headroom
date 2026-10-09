/**
 * Source-backed entity-scope interpretation for exception candidates.
 * Does not infer that a permission for one entity group applies to another.
 */

export type EntityClass =
  | "BORROWER"
  | "PARENT_BORROWER"
  | "RESTRICTED_SUBSIDIARIES"
  | "UNRESTRICTED_SUBSIDIARIES"
  | "LOAN_PARTIES"
  | "LOAN_PARTY_OTHER_THAN_BORROWER"
  | "GUARANTORS"
  | "NON_LOAN_PARTY_SUBSIDIARIES"
  | "SUBSIDIARIES"
  | "OTHER_DEFINED_GROUP"
  | "UNKNOWN";

export interface EntityScopeAtom {
  entityClass: EntityClass;
  exactPhrase: string;
  role: "INCLUDE" | "EXCLUDE" | "LIMIT";
  sourceBacked: true;
  evidence: string;
}

export interface EntityScopeResult {
  includes: EntityScopeAtom[];
  excludes: EntityScopeAtom[];
  /** True when scope phrases conflict or cannot be grounded. */
  ambiguous: boolean;
  notes: string[];
}

const PATTERNS: Array<{ re: RegExp; entityClass: EntityClass; role?: "INCLUDE" | "EXCLUDE" | "LIMIT" }> = [
  {
    re: /any\s+Loan\s+Party\s+other\s+than\s+the\s+Borrower/gi,
    entityClass: "LOAN_PARTY_OTHER_THAN_BORROWER",
    role: "INCLUDE",
  },
  { re: /\bNon[- ]Loan\s+Party\s+Subsidiaries\b/gi, entityClass: "NON_LOAN_PARTY_SUBSIDIARIES" },
  { re: /\bUnrestricted\s+Subsidiaries\b/gi, entityClass: "UNRESTRICTED_SUBSIDIARIES" },
  { re: /\bRestricted\s+Subsidiaries\b/gi, entityClass: "RESTRICTED_SUBSIDIARIES" },
  { re: /\bLoan\s+Parties\b/gi, entityClass: "LOAN_PARTIES" },
  { re: /\bLoan\s+Party\b/gi, entityClass: "LOAN_PARTIES" },
  { re: /\bGuarantors?\b/gi, entityClass: "GUARANTORS" },
  { re: /\bParent\s+Borrower\b/gi, entityClass: "PARENT_BORROWER" },
  { re: /\bthe\s+Borrower\b/gi, entityClass: "BORROWER" },
  { re: /\bSubsidiaries\b/gi, entityClass: "SUBSIDIARIES" },
];

export function interpretEntityScope(texts: string[]): EntityScopeResult {
  const includes: EntityScopeAtom[] = [];
  const excludes: EntityScopeAtom[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    for (const { re, entityClass, role } of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const phrase = m[0];
        const key = `${entityClass}:${phrase.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // "other than the Borrower" also implies Borrower exclusion from that grant.
        if (entityClass === "LOAN_PARTY_OTHER_THAN_BORROWER") {
          includes.push({
            entityClass,
            exactPhrase: phrase,
            role: "INCLUDE",
            sourceBacked: true,
            evidence: phrase,
          });
          excludes.push({
            entityClass: "BORROWER",
            exactPhrase: "other than the Borrower",
            role: "EXCLUDE",
            sourceBacked: true,
            evidence: phrase,
          });
          continue;
        }

        const atom: EntityScopeAtom = {
          entityClass,
          exactPhrase: phrase,
          role: role ?? "INCLUDE",
          sourceBacked: true,
          evidence: phrase,
        };
        if (atom.role === "EXCLUDE") excludes.push(atom);
        else includes.push(atom);
      }
    }
  }

  // Do not infer Loan Parties ⇒ Guarantors or Borrower ⇒ Restricted Subsidiaries.
  if (includes.some((i) => i.entityClass === "LOAN_PARTIES") && !includes.some((i) => i.entityClass === "GUARANTORS")) {
    notes.push("Loan Parties present; Guarantors not inferred without source phrase");
  }
  if (includes.some((i) => i.entityClass === "BORROWER") && !includes.some((i) => i.entityClass === "RESTRICTED_SUBSIDIARIES")) {
    notes.push("Borrower permission does not imply Restricted Subsidiaries without source phrase");
  }

  const ambiguous =
    includes.length === 0 ||
    (includes.some((i) => i.entityClass === "SUBSIDIARIES") &&
      !includes.some((i) =>
        ["RESTRICTED_SUBSIDIARIES", "UNRESTRICTED_SUBSIDIARIES", "NON_LOAN_PARTY_SUBSIDIARIES"].includes(
          i.entityClass,
        ),
      ));

  if (includes.length === 0) {
    notes.push("No source-backed entity class matched — scope unresolved");
  }

  return { includes, excludes, ambiguous, notes };
}

/** Map GT phrases like "Loan Party other than Borrower" onto EntityClass. */
export function gtPhraseToEntityClasses(phrase: string): EntityClass[] {
  const p = phrase.toLowerCase();
  const out: EntityClass[] = [];
  if (p.includes("loan party") && p.includes("other than") && p.includes("borrower")) {
    out.push("LOAN_PARTY_OTHER_THAN_BORROWER");
  }
  if (p.includes("non-loan party") || p.includes("non loan party")) {
    out.push("NON_LOAN_PARTY_SUBSIDIARIES");
  }
  if (p.includes("restricted subsidiar")) out.push("RESTRICTED_SUBSIDIARIES");
  if (p.includes("unrestricted subsidiar")) out.push("UNRESTRICTED_SUBSIDIARIES");
  if (/\bborrower\b/.test(p) && !p.includes("other than")) out.push("BORROWER");
  if (p.includes("guarantor")) out.push("GUARANTORS");
  if (p.includes("loan part") && !out.includes("LOAN_PARTY_OTHER_THAN_BORROWER")) out.push("LOAN_PARTIES");
  return out;
}

export function entityScopeOverlaps(
  predicted: EntityScopeResult,
  expectedPhrases: string[],
): boolean {
  const predictedClasses = new Set([
    ...predicted.includes.map((i) => i.entityClass),
    ...predicted.excludes.map((i) => i.entityClass),
  ]);
  for (const phrase of expectedPhrases) {
    const wanted = gtPhraseToEntityClasses(phrase);
    if (wanted.some((w) => predictedClasses.has(w))) return true;
    // also accept exact phrase containment in evidence
    const blob = [...predicted.includes, ...predicted.excludes].map((a) => a.exactPhrase.toLowerCase()).join(" | ");
    if (phrase.toLowerCase().split(/\s+/).every((tok) => blob.includes(tok))) return true;
  }
  return false;
}
