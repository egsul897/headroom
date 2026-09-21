/**
 * Evaluation Contract V3.1 — atomic surfacing scope (AMB-1 resolved by
 * specification; see docs/phase-3-final-closure-resolution/02-v31-atomic-
 * surfacing-contract.json).
 *
 * Every scenario here is wholly synthetic and uses invented section numbers,
 * document ids and candidate ids. Nothing in the module or in these tests
 * may key off a real package, covenant, document or case identifier — the
 * anti-enumeration test at the bottom asserts that mechanically.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { deriveSurfacingScope, sectionRefScopeRelation, toBinarySurfacing } from "../../lib/contract-model/evaluation-v2/surfacing-scope";
import type { CandidateSemanticRepresentation, PairAssessment, PairCorrespondence, UnitEvaluationResult } from "../../lib/contract-model/evaluation-v2/types";

const DOC = "synthetic-doc-alpha";

function candidate(candidateId: string, sectionRef: string | null, documentId = DOC): CandidateSemanticRepresentation {
  return { candidateId, documentId, sectionRef } as unknown as CandidateSemanticRepresentation;
}

function pair(candidateId: string, correspondence: PairCorrespondence): PairAssessment {
  return { candidateId, correspondence } as unknown as PairAssessment;
}

function unit(sectionRef: string, flags: { id: string; ref: string | null; corr: PairCorrespondence; doc?: string }[]): {
  unit: UnitEvaluationResult;
  byId: Map<string, CandidateSemanticRepresentation>;
} {
  const u = {
    gtUnitId: "synthetic-unit",
    documentId: DOC,
    sectionRef,
    surfacedAsUnsafeBy: flags.map((f) => f.id),
    pairAssessments: flags.map((f) => pair(f.id, f.corr)),
  } as unknown as UnitEvaluationResult;
  const byId = new Map(flags.map((f) => [f.id, candidate(f.id, f.ref, f.doc ?? DOC)]));
  return { unit: u, byId };
}

describe("V3.1 sectionRefScopeRelation — pure shape comparison", () => {
  const cases: [string, string, string][] = [
    ["9.9", "9.9", "COVERS_WHOLE_UNIT"],
    ["9.9(c)", "9.9", "COVERS_WHOLE_UNIT"],
    ["9.9(c)", "9.9(c)", "COVERS_WHOLE_UNIT"],
    ["9.9", "9.9(c)", "COVERS_SUB_PART"],
    ["9.9", "9.9(c)(iv)", "COVERS_SUB_PART"],
    ["9.9(c)", "9.9(c)(iv)", "COVERS_SUB_PART"],
    ["9.9(c)", "9.9(d)", "NOT_STRUCTURALLY_DECISIVE"],
    ["9.9(c)(i)", "9.9(c)(ii)", "NOT_STRUCTURALLY_DECISIVE"],
    ["9.9", "4.4(a)", "NOT_STRUCTURALLY_DECISIVE"],
  ];
  for (const [gtRef, candRef, expected] of cases) {
    it(`gt ${gtRef} vs flag ${candRef} -> ${expected}`, () => {
      expect(sectionRefScopeRelation(gtRef, DOC, candidate("c", candRef))).toBe(expected);
    });
  }

  it("a flag with no sectionRef is never structurally decisive", () => {
    expect(sectionRefScopeRelation("9.9", DOC, candidate("c", null))).toBe("NOT_STRUCTURALLY_DECISIVE");
  });

  it("a flag in another document is never structurally decisive", () => {
    expect(sectionRefScopeRelation("9.9", DOC, candidate("c", "9.9(a)", "synthetic-doc-beta"))).toBe("NOT_STRUCTURALLY_DECISIVE");
  });

  it("§ and 'Section' prefixes and internal spaces do not change the relation", () => {
    expect(sectionRefScopeRelation("9.9", DOC, candidate("c", "Section 9.9 (a)"))).toBe("COVERS_SUB_PART");
    expect(sectionRefScopeRelation("9.9", DOC, candidate("c", "§9.9"))).toBe("COVERS_WHOLE_UNIT");
  });
});

describe("V3.1 composite surfacing", () => {
  it("THE AMB-1 CASE: every warning sits on a strict sub-part -> PARTIALLY_SURFACED, binary NOT_SPECIFICALLY_SURFACED", () => {
    const { unit: u, byId } = unit("9.9", [{ id: "f1", ref: "9.9(d)", corr: "CORRESPONDS_FULLY" }]);
    const r = deriveSurfacingScope(u, byId, false);
    expect(r.compositeSurfacing).toBe("PARTIALLY_SURFACED");
    expect(toBinarySurfacing(r.compositeSurfacing)).toBe("NOT_SPECIFICALLY_SURFACED");
    expect(r.coverage[0]!.coverage).toBe("SUB_PART");
  });

  it("structural sub-part anchoring OVERRIDES a CORRESPONDS_FULLY claim", () => {
    const { unit: u, byId } = unit("9.9", [{ id: "f1", ref: "9.9(a)(ii)", corr: "CORRESPONDS_FULLY" }]);
    expect(deriveSurfacingScope(u, byId, false).compositeSurfacing).toBe("PARTIALLY_SURFACED");
  });

  it("a warning at the claim's own address covers the whole claim", () => {
    const { unit: u, byId } = unit("9.9", [{ id: "f1", ref: "9.9", corr: "CORRESPONDS_PARTIALLY" }]);
    expect(deriveSurfacingScope(u, byId, false).compositeSurfacing).toBe("FULLY_SURFACED");
  });

  it("a warning at an ANCESTOR address covers the whole claim", () => {
    const { unit: u, byId } = unit("9.9(c)", [{ id: "f1", ref: "9.9", corr: "CORRESPONDS_PARTIALLY" }]);
    expect(deriveSurfacingScope(u, byId, false).compositeSurfacing).toBe("FULLY_SURFACED");
  });

  it("one whole-unit warning DOMINATES any number of sub-part warnings", () => {
    const { unit: u, byId } = unit("9.9", [
      { id: "f1", ref: "9.9(a)", corr: "CORRESPONDS_FULLY" },
      { id: "f2", ref: "9.9(b)", corr: "CORRESPONDS_FULLY" },
      { id: "f3", ref: "9.9", corr: "CORRESPONDS_FULLY" },
    ]);
    expect(deriveSurfacingScope(u, byId, false).compositeSurfacing).toBe("FULLY_SURFACED");
  });

  it("several warnings, all on different sub-parts, still leave the rest unwarned", () => {
    const { unit: u, byId } = unit("9.9", [
      { id: "f1", ref: "9.9(a)", corr: "CORRESPONDS_FULLY" },
      { id: "f2", ref: "9.9(b)", corr: "CORRESPONDS_PARTIALLY" },
    ]);
    expect(deriveSurfacingScope(u, byId, false).compositeSurfacing).toBe("PARTIALLY_SURFACED");
  });

  it("structurally silent + CORRESPONDS_FULLY -> FULLY_SURFACED", () => {
    const { unit: u, byId } = unit("9.9", [{ id: "f1", ref: null, corr: "CORRESPONDS_FULLY" }]);
    expect(deriveSurfacingScope(u, byId, false).compositeSurfacing).toBe("FULLY_SURFACED");
  });

  it("structurally silent + CORRESPONDS_PARTIALLY -> FULLY_SURFACED_UNVERIFIED_SCOPE, which still projects to SPECIFICALLY_SURFACED", () => {
    const { unit: u, byId } = unit("9.9", [{ id: "f1", ref: null, corr: "CORRESPONDS_PARTIALLY" }]);
    const r = deriveSurfacingScope(u, byId, false);
    expect(r.compositeSurfacing).toBe("FULLY_SURFACED_UNVERIFIED_SCOPE");
    expect(toBinarySurfacing(r.compositeSurfacing)).toBe("SPECIFICALLY_SURFACED");
    expect(r.coverage[0]!.coverage).toBe("WHOLE_UNPROVEN");
  });

  it("partial semantic correspondence is NOT read as sub-proposition anchoring (the rejected draft rule)", () => {
    const { unit: u, byId } = unit("9.9", [{ id: "f1", ref: "4.4(a)", corr: "CORRESPONDS_PARTIALLY" }]);
    expect(deriveSurfacingScope(u, byId, false).compositeSurfacing).not.toBe("PARTIALLY_SURFACED");
  });

  it("no corresponding warning at all -> NOT_SPECIFICALLY_SURFACED", () => {
    const { unit: u, byId } = unit("9.9", []);
    expect(deriveSurfacingScope(u, byId, false).compositeSurfacing).toBe("NOT_SPECIFICALLY_SURFACED");
  });

  it("a credited claim is NOT_APPLICABLE and carries no coverage evidence", () => {
    const { unit: u, byId } = unit("9.9", [{ id: "f1", ref: "9.9(a)", corr: "CORRESPONDS_FULLY" }]);
    const r = deriveSurfacingScope(u, byId, true);
    expect(r.compositeSurfacing).toBe("NOT_APPLICABLE");
    expect(r.coverage).toEqual([]);
    expect(toBinarySurfacing(r.compositeSurfacing)).toBe("NOT_APPLICABLE");
  });

  it("coverage evidence is recorded for every flag, never summarised away", () => {
    const { unit: u, byId } = unit("9.9", [
      { id: "f1", ref: "9.9(a)", corr: "CORRESPONDS_FULLY" },
      { id: "f2", ref: null, corr: "CORRESPONDS_PARTIALLY" },
    ]);
    const r = deriveSurfacingScope(u, byId, false);
    expect(r.coverage.map((c) => c.candidateId)).toEqual(["f1", "f2"]);
    expect(r.coverage.map((c) => c.coverage)).toEqual(["SUB_PART", "WHOLE_UNPROVEN"]);
    expect(r.coverage.every((c) => c.groundTruthSectionRef === "9.9")).toBe(true);
  });

  it("the binary projection never invents SPECIFICALLY_SURFACED for an unresolved scope", () => {
    expect(toBinarySurfacing("SURFACING_SCOPE_UNDETERMINED")).toBe("NOT_SPECIFICALLY_SURFACED");
    expect(toBinarySurfacing("PARTIALLY_SURFACED")).toBe("NOT_SPECIFICALLY_SURFACED");
  });

  it("is deterministic: the same input yields an identical result on repeated evaluation", () => {
    const build = () => unit("9.9", [{ id: "f1", ref: "9.9(b)", corr: "CORRESPONDS_FULLY" }, { id: "f2", ref: null, corr: "CORRESPONDS_PARTIALLY" }]);
    const a = deriveSurfacingScope(build().unit, build().byId, false);
    const b = deriveSurfacingScope(build().unit, build().byId, false);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("an unseen identifier shape behaves identically to a familiar one", () => {
    const familiar = unit("6.01", [{ id: "f1", ref: "6.01(b)", corr: "CORRESPONDS_FULLY" }]);
    const unseen = unit("zz.77", [{ id: "q9", ref: "zz.77(qq)", corr: "CORRESPONDS_FULLY" }]);
    expect(deriveSurfacingScope(familiar.unit, familiar.byId, false).compositeSurfacing).toBe(
      deriveSurfacingScope(unseen.unit, unseen.byId, false).compositeSurfacing,
    );
  });
});

describe("V3.1 anti-enumeration", () => {
  it("the module contains no package, document, covenant, dataset or case identifier", () => {
    const src = readFileSync("lib/contract-model/evaluation-v2/surfacing-scope.ts", "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const forbidden = [/fwrg/i, /\blsb\b/i, /conmed/i, /dsgr/i, /chwy/i, /doc-[ab]\b/i, /credit-agreement/i, /covenant/i, /ebitda/i, /\b6\.0\d\b/, /\b7\.1\b/];
    for (const re of forbidden) expect(code).not.toMatch(re);
  });

  it("the module reads only the two declared signals and the frozen flag list", () => {
    const src = readFileSync("lib/contract-model/evaluation-v2/surfacing-scope.ts", "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toContain("surfacedAsUnsafeBy");
    expect(code).toContain("correspondence");
    expect(code).toContain("splitSectionRef");
    // Never reaches for matching/scoring internals or for the unit's own labels.
    expect(code).not.toContain("semanticFamily");
    expect(code).not.toContain("correspondenceStrength");
    expect(code).not.toContain("matchStatus");
  });
});
