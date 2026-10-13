/**
 * Independent source-coverage audit for operative covenant compilation.
 *
 * Compares compiler-discovered units against a separately established
 * structural/legal inventory. Expected provisions MUST come from hand-authored
 * fixtures or independent legal references — never from the discovery
 * implementation under test.
 */

export type IndependentCoverageDisposition =
  | "DISCOVERED_AND_EXECUTABLE"
  | "DISCOVERED_BUT_UNSUPPORTED"
  | "EXPECTED_BUT_NOT_DISCOVERED"
  | "NOT_ASSESSED";

export interface IndependentExpectedProvision {
  id: string;
  /** Regex or exact sourceRef matcher against compiled units. */
  matchSourceRef: RegExp | string;
  documentId?: string | null;
  expectedKind?: string;
  mustBeExecutable?: boolean;
  notes?: string;
}

export interface IndependentCoverageUnitView {
  sourceRef: string;
  documentId: string;
  executableAuthority: "VERIFIED_EXECUTABLE" | "REFUSED" | string;
  provisionKind?: string;
}

export interface IndependentCoverageFinding {
  expectedId: string;
  disposition: IndependentCoverageDisposition;
  expectedSourceRef: string;
  matchedSourceRef: string | null;
  documentId: string | null;
  notes: string;
}

export interface IndependentSourceCoverageReport {
  expectedCount: number;
  discoveredAndExecutable: number;
  discoveredButUnsupported: number;
  expectedButNotDiscovered: number;
  notAssessed: number;
  findings: IndependentCoverageFinding[];
  /** True when any EXPECTED_BUT_NOT_DISCOVERED remains. */
  hasOmissionGaps: boolean;
  /** Honesty: discovered-but-unsupported is NOT counted as omission coverage. */
  omissionCoverageComplete: boolean;
}

function matchesRef(matcher: RegExp | string, sourceRef: string): boolean {
  if (typeof matcher === "string") return matcher === sourceRef;
  return matcher.test(sourceRef);
}

function matcherLabel(matcher: RegExp | string): string {
  return typeof matcher === "string" ? matcher : matcher.source;
}

/**
 * Audit discovered/compiled units against an independent expected inventory.
 */
export function auditIndependentSourceCoverage(args: {
  expected: readonly IndependentExpectedProvision[];
  units: readonly IndependentCoverageUnitView[];
}): IndependentSourceCoverageReport {
  const findings: IndependentCoverageFinding[] = [];

  for (const exp of args.expected) {
    const matched = args.units.find(
      (u) =>
        matchesRef(exp.matchSourceRef, u.sourceRef) &&
        (exp.documentId == null || exp.documentId === u.documentId),
    );
    if (!matched) {
      findings.push({
        expectedId: exp.id,
        disposition: "EXPECTED_BUT_NOT_DISCOVERED",
        expectedSourceRef: matcherLabel(exp.matchSourceRef),
        matchedSourceRef: null,
        documentId: exp.documentId ?? null,
        notes: exp.notes ?? "Independent inventory entry not found in compiler output",
      });
      continue;
    }
    if (matched.executableAuthority === "VERIFIED_EXECUTABLE") {
      findings.push({
        expectedId: exp.id,
        disposition: "DISCOVERED_AND_EXECUTABLE",
        expectedSourceRef: matcherLabel(exp.matchSourceRef),
        matchedSourceRef: matched.sourceRef,
        documentId: matched.documentId,
        notes: exp.notes ?? "Discovered and elevated to verified executable IR",
      });
      continue;
    }
    findings.push({
      expectedId: exp.id,
      disposition: "DISCOVERED_BUT_UNSUPPORTED",
      expectedSourceRef: matcherLabel(exp.matchSourceRef),
      matchedSourceRef: matched.sourceRef,
      documentId: matched.documentId,
      notes:
        exp.notes ??
        "Discovered but not executable — do not treat as omission; unsupported/incomplete semantics",
    });
  }

  const discoveredAndExecutable = findings.filter((f) => f.disposition === "DISCOVERED_AND_EXECUTABLE").length;
  const discoveredButUnsupported = findings.filter((f) => f.disposition === "DISCOVERED_BUT_UNSUPPORTED").length;
  const expectedButNotDiscovered = findings.filter((f) => f.disposition === "EXPECTED_BUT_NOT_DISCOVERED").length;

  return {
    expectedCount: args.expected.length,
    discoveredAndExecutable,
    discoveredButUnsupported,
    expectedButNotDiscovered,
    notAssessed: 0,
    findings,
    hasOmissionGaps: expectedButNotDiscovered > 0,
    // Complete omission coverage only when every expected item was at least discovered.
    // Discovered-but-unsupported must NOT be labeled as omission success.
    omissionCoverageComplete: expectedButNotDiscovered === 0,
  };
}
