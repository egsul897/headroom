/**
 * Phase C0 Task 6 - a generalized, independent-structural-evidence
 * negative-detection mechanism. Deliberately NOT based on an LLM's own
 * self-reported confidence (the task's own explicit instruction: "using
 * independent structural evidence, not LLM self-confidence") - this is a
 * plain regex scan for clause markers in the source text, diffed against
 * the set of sourceSectionRef values a set of candidate rules actually
 * cites. Company-agnostic: takes the marker pattern as a parameter so it
 * works against both the FWRG unseen package's "Section 6.0X(y)" style and
 * Coherent's own "§3.3(b)(xviii)" style citations (see
 * tests/contract-model/coverage-structural.test.ts for both).
 *
 * This mechanism answers ONE narrow question - "does every clause-shaped
 * marker in the source text have at least one candidate rule citing it?" -
 * which is necessary but not sufficient for real coverage (a rule citing a
 * clause can still misrepresent it; that is the evaluator's job, not this
 * one's). It is a floor, not a correctness check.
 */

export interface StructuralCoverageGap {
  marker: string;
  /** Character offset the marker was found at, for locating it in the source. */
  offset: number;
}

export interface StructuralCoverageResult {
  totalMarkersFound: number;
  coveredMarkers: string[];
  gaps: StructuralCoverageGap[];
  coverageRatio: number;
}

/**
 * Normalizes a marker/reference to a bare comparable form so
 * "Section 6.04(a)" and "6.04(a)" and "§6.04(a)" all match, and so a
 * candidate citing the parent clause ("6.04(a)") is credited with covering
 * a marker for a sub-clause the regex found nested inside it
 * ("6.04(a)(iii)") is NOT auto-credited - only an exact or a
 * marker-is-a-prefix-of-citation match counts, since crediting a broad
 * citation for every nested sub-clause would silently hide real gaps.
 */
function normalize(ref: string): string {
  return ref.replace(/^§/, "").replace(/^Section\s+/i, "").replace(/\s+/g, "").trim();
}

export function detectStructuralCoverageGaps(sourceText: string, markerPattern: RegExp, citedSectionRefs: readonly (string | null | undefined)[]): StructuralCoverageResult {
  const cited = new Set(citedSectionRefs.filter((r): r is string => !!r).map(normalize));
  const re = new RegExp(markerPattern.source, markerPattern.flags.includes("g") ? markerPattern.flags : markerPattern.flags + "g");

  const found = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(sourceText)) !== null) {
    const marker = normalize(m[0]);
    if (!found.has(marker)) found.set(marker, m.index);
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width matches
  }

  const coveredMarkers: string[] = [];
  const gaps: StructuralCoverageGap[] = [];
  for (const [marker, offset] of found) {
    if (cited.has(marker)) coveredMarkers.push(marker);
    else gaps.push({ marker, offset });
  }

  const total = found.size;
  return {
    totalMarkersFound: total,
    coveredMarkers,
    gaps,
    coverageRatio: total === 0 ? 1 : coveredMarkers.length / total,
  };
}
