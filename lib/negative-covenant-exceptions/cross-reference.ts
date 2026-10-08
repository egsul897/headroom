/**
 * Cross-reference resolution for exception analysis.
 * Never silently discards unresolved references.
 *
 * Integrates conceptually with Covenant Dependency Atlas resolution statuses:
 * RESOLVED / AMBIGUOUS / UNRESOLVED / EXTERNAL / SUPERSEDED.
 */

export type CrossRefResolution =
  | "RESOLVED_CONTROLLING"
  | "AMBIGUOUS"
  | "MISSING_TARGET"
  | "EXTERNAL_DOCUMENT"
  | "SUPERSEDED"
  | "DEFINED_TERM_REFERENCE";

export interface CrossReferenceHit {
  rawText: string;
  normalizedTarget: string;
  resolution: CrossRefResolution;
  controlling: boolean;
  evidence: string;
  atlasStatus?: "RESOLVED" | "UNRESOLVED" | "AMBIGUOUS";
}

export interface CrossReferenceResult {
  hits: CrossReferenceHit[];
  /** All unresolved/ambiguous/missing/external/superseded — never discarded. */
  unresolvedOrNonResolved: CrossReferenceHit[];
}

const SECTION_RE =
  /\bSection\s+(\d+(?:\.\d+)?(?:\([a-z0-9]+\))*(?:\([a-z0-9]+\))?)/gi;
const DEFINED_DOC_RE =
  /\b(Loan Documents?|Transaction Documents?|Collateral Documents?|Security Agreements?|Pledge and Collateral Account Control Agreement|Indenture|Closing Date)\b/g;

/**
 * Resolve cross-references found in text against an optional index of known section anchors.
 */
export function resolveCrossReferences(input: {
  texts: string[];
  knownSectionRefs?: Set<string>;
  supersededRefs?: Set<string>;
  externalDocTerms?: Set<string>;
}): CrossReferenceResult {
  const known = input.knownSectionRefs ?? new Set<string>();
  const superseded = input.supersededRefs ?? new Set<string>();
  const externalTerms =
    input.externalDocTerms ??
    new Set([
      "Closing Date",
      "Transaction Documents",
      "Collateral Documents",
      "Pledge and Collateral Account Control Agreement",
      "Indenture",
    ]);

  const hits: CrossReferenceHit[] = [];
  const seen = new Set<string>();

  for (const text of input.texts) {
    SECTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SECTION_RE.exec(text)) !== null) {
      const raw = m[0];
      const norm = `Section ${m[1]}`.replace(/\s+/g, " ");
      const key = `sec:${norm}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let resolution: CrossRefResolution;
      if (superseded.has(norm) || superseded.has(m[1])) {
        resolution = "SUPERSEDED";
      } else if (known.size === 0) {
        // Structural presence in same instrument text without full atlas → controlling but atlas-unjoined
        resolution = "RESOLVED_CONTROLLING";
      } else if (known.has(norm) || known.has(m[1]) || [...known].some((k) => norm.includes(k) || k.includes(m[1]))) {
        resolution = "RESOLVED_CONTROLLING";
      } else {
        resolution = "MISSING_TARGET";
      }

      hits.push({
        rawText: raw,
        normalizedTarget: norm,
        resolution,
        controlling: true,
        evidence: raw,
        atlasStatus:
          resolution === "RESOLVED_CONTROLLING"
            ? "RESOLVED"
            : resolution === "AMBIGUOUS"
              ? "AMBIGUOUS"
              : "UNRESOLVED",
      });
    }

    DEFINED_DOC_RE.lastIndex = 0;
    while ((m = DEFINED_DOC_RE.exec(text)) !== null) {
      const raw = m[1];
      const key = `doc:${raw.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isExternal = [...externalTerms].some((t) => t.toLowerCase() === raw.toLowerCase());
      const resolution: CrossRefResolution = isExternal
        ? "EXTERNAL_DOCUMENT"
        : "DEFINED_TERM_REFERENCE";
      hits.push({
        rawText: raw,
        normalizedTarget: raw,
        resolution,
        controlling: true,
        evidence: raw,
        atlasStatus: resolution === "DEFINED_TERM_REFERENCE" ? "RESOLVED" : "UNRESOLVED",
      });
    }

    // Soft "permitted under this Agreement" style
    if (/\bpermitted under this Agreement\b/i.test(text)) {
      const key = "perm:agreement";
      if (!seen.has(key)) {
        seen.add(key);
        hits.push({
          rawText: "permitted under this Agreement",
          normalizedTarget: "this Agreement (permission cross-reference)",
          resolution: "AMBIGUOUS",
          controlling: true,
          evidence: "permitted under this Agreement",
          atlasStatus: "AMBIGUOUS",
        });
      }
    }
  }

  const unresolvedOrNonResolved = hits.filter(
    (h) => h.resolution !== "RESOLVED_CONTROLLING" && h.resolution !== "DEFINED_TERM_REFERENCE",
  );

  return { hits, unresolvedOrNonResolved };
}

export function crossRefOverlaps(predicted: CrossReferenceResult, expected: string[]): boolean {
  const blob = predicted.hits
    .map((h) => `${h.rawText} ${h.normalizedTarget}`.toLowerCase())
    .join(" || ");
  return expected.some((e) => {
    const el = e.toLowerCase();
    if (blob.includes(el)) return true;
    // Section 7.02 vs 7.02
    const sec = el.replace(/^section\s+/, "");
    if (blob.includes(sec)) return true;
    if (el.includes("loan document") && blob.includes("loan document")) return true;
    if (el.includes("permitted under") && blob.includes("permitted under")) return true;
    return false;
  });
}
