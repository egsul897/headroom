/**
 * Phase 3F.1.1 — tests for the forensic machinery itself (task §41).
 * Production code is frozen for this phase, so these tests validate the
 * forensic scripts' own output artifacts (already generated under
 * tests/fixtures/unseen-packages/phase-3f1-1-forensics/), not new
 * production behavior. Read-only assertions against already-committed
 * JSON artifacts - no live re-computation, so this suite has no
 * dependency on model credentials or a database.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FORENSICS_DIR = "tests/fixtures/unseen-packages/phase-3f1-1-forensics";

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(FORENSICS_DIR, `${name}.json`), "utf-8")) as T;
}

interface LineageRow {
  canonicalCaseId: string;
  originalGroundTruthUnitId: string;
  final3F11Disposition: string;
  residualRootCauseClass: string | null;
}
interface LineageArtifact {
  totalRows: number;
  rows: LineageRow[];
}

describe("Phase 3F.1.1 forensic machinery - case lineage integrity", () => {
  const lineage = loadJson<LineageArtifact>("phase-3f1-1-original-119-lineage");

  it("exactly 119 original cases were loaded", () => {
    expect(lineage.totalRows).toBe(119);
    expect(lineage.rows).toHaveLength(119);
  });

  it("every canonical case ID is unique", () => {
    const ids = new Set(lineage.rows.map((r) => r.canonicalCaseId));
    expect(ids.size).toBe(119);
  });

  it("every original ground-truth unit ID is unique - no case lost or duplicated during joins", () => {
    const gtIds = new Set(lineage.rows.map((r) => r.originalGroundTruthUnitId));
    expect(gtIds.size).toBe(119);
  });

  it("every row has exactly one of the required disposition states - no vague NOT_APPLICABLE bucket", () => {
    const allowed = new Set(["RESOLVED_BY_3F1", "STILL_DANGEROUS", "SCORER_ARTIFACT_CORRECTED", "GROUND_TRUTH_AMBIGUITY", "SOURCE_EXTRACTION_LIMITATION", "OTHER_EXPLICITLY_JUSTIFIED"]);
    for (const row of lineage.rows) {
      expect(allowed.has(row.final3F11Disposition), `unexpected disposition "${row.final3F11Disposition}" for ${row.canonicalCaseId}`).toBe(true);
    }
  });

  it("only STILL_DANGEROUS rows carry a residual root-cause class", () => {
    for (const row of lineage.rows) {
      if (row.final3F11Disposition === "STILL_DANGEROUS") expect(row.residualRootCauseClass).not.toBeNull();
      else expect(row.residualRootCauseClass).toBeNull();
    }
  });
});

describe("Phase 3F.1.1 forensic machinery - bridge and residual-count invariants (task §38)", () => {
  const bridge = loadJson<{ counts: { original119: number; scorerArtifactCorrected: number; resolvedBy3F1Code: number; stillDangerous89: number } }>("phase-3f1-1-scorer-bridge");
  const residual = loadJson<{ count: number }>("phase-3f1-1-residual-cases");
  const taxonomy = loadJson<{ residualPopulation: number; primaryRootCauseCounts: Record<string, number>; invariantCheck: { dispositionBalanced: boolean; primaryRootCauseBalanced: boolean } }>("phase-3f1-1-root-cause-taxonomy");

  it("119 = scorerArtifactCorrected + resolvedBy3F1Code + stillDangerous89 (no silent loss)", () => {
    const { original119, scorerArtifactCorrected, resolvedBy3F1Code, stillDangerous89 } = bridge.counts;
    expect(original119).toBe(119);
    expect(scorerArtifactCorrected + resolvedBy3F1Code + stillDangerous89).toBe(119);
  });

  it("the residual-cases artifact count matches the bridge's own stillDangerous89 figure", () => {
    expect(residual.count).toBe(bridge.counts.stillDangerous89);
  });

  it("primary root-cause counts sum exactly to the residual population (task §10/§38's own required invariant)", () => {
    const sum = Object.values(taxonomy.primaryRootCauseCounts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(taxonomy.residualPopulation);
    expect(taxonomy.invariantCheck.primaryRootCauseBalanced).toBe(true);
    expect(taxonomy.invariantCheck.dispositionBalanced).toBe(true);
  });
});

describe("Phase 3F.1.1 forensic machinery - discovery/audit quadrant + Pareto consistency", () => {
  const quadrants = loadJson<{ A_found_found: number; B_found_missed: number; C_missed_found: number; D_missed_missed: number }>("phase-3f1-1-discovery-audit-quadrants");
  const residual = loadJson<{ count: number }>("phase-3f1-1-residual-cases");
  const pareto = loadJson<Array<{ rank: number; count: number; cumulativeCount: number; cumulativePercent: number }>>("phase-3f1-1-pareto");

  it("the four quadrants sum to the residual population", () => {
    const sum = quadrants.A_found_found + quadrants.B_found_missed + quadrants.C_missed_found + quadrants.D_missed_missed;
    expect(sum).toBe(residual.count);
  });

  it("Pareto cumulative counts are monotonically increasing and the final row reaches 100%", () => {
    for (let i = 1; i < pareto.length; i++) {
      expect(pareto[i]!.cumulativeCount).toBeGreaterThanOrEqual(pareto[i - 1]!.cumulativeCount);
    }
    expect(pareto[pareto.length - 1]!.cumulativeCount).toBe(residual.count);
    expect(pareto[pareto.length - 1]!.cumulativePercent).toBeCloseTo(100, 0);
  });
});

describe("Phase 3F.1.1 forensic machinery - historical/production integrity", () => {
  const integrity = loadJson<{ productionCodeByteIdentical: boolean; historicalArtifactsByteIdentical: boolean; productionMismatches: string[]; historicalMismatches: string[] }>("phase-3f1-1-integrity-manifest");

  it("production code is byte-identical between the start and end of this phase", () => {
    expect(integrity.productionMismatches).toEqual([]);
    expect(integrity.productionCodeByteIdentical).toBe(true);
  });

  it("historical Phase 3F/3F.1 artifacts are byte-identical - never modified by this phase", () => {
    expect(integrity.historicalMismatches).toEqual([]);
    expect(integrity.historicalArtifactsByteIdentical).toBe(true);
  });

  it("the permanent sealed Phase 3F scoring report still reports strict=119, never rewritten to 93 or 89", () => {
    const sealed = loadJson<{ metrics: { dangerousUnflaggedOmissionCount_strictPhase3EAuditorOnly: number; dangerousUnflaggedOmissionCount_broadCreditingDiscoveryUncertainty: number } }>("../phase-3f-ground-truth/phase-3f-scoring-report");
    expect(sealed.metrics.dangerousUnflaggedOmissionCount_strictPhase3EAuditorOnly).toBe(119);
    expect(sealed.metrics.dangerousUnflaggedOmissionCount_broadCreditingDiscoveryUncertainty).toBe(34);
  });
});

describe("Phase 3F.1.1 forensic machinery - no Phase 3F.2 package contamination", () => {
  it("no new package directory was created under tests/fixtures/unseen-packages/ beyond the existing DSGR/FWRG/LSB/CONMED fixtures and this phase's own forensic output", () => {
    const entries = readdirSync("tests/fixtures/unseen-packages");
    const allowedPrefixes = ["conmed-", "dsgr-", "fwrg-", "lsb-", "phase-2f-", "phase-3b-", "phase-3b1-", "phase-3d-", "phase-3e-", "phase-3f-", "phase-3f1-"];
    for (const entry of entries) {
      expect(allowedPrefixes.some((p) => entry.startsWith(p)), `unexpected new entry under tests/fixtures/unseen-packages/: ${entry}`).toBe(true);
    }
  });
});

describe("Phase 3F.1.1 forensic machinery - evidence references resolve", () => {
  it("a sample of case evidence references point to real, loadable artifact files", () => {
    const lineage = loadJson<{ totalRows: number; rows: Array<{ evidenceReferences: string[] }> }>("phase-3f1-1-original-119-lineage");
    const sample = lineage.rows.slice(0, 5);
    for (const row of sample) {
      for (const ref of row.evidenceReferences) {
        const [file] = ref.split("#");
        expect(() => readFileSync(join(FORENSICS_DIR, file!), "utf-8")).not.toThrow();
      }
    }
  });
});
