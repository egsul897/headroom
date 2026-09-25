/**
 * Harness R1 - the forensic runners must inherit production's grounding semantics rather than
 * maintaining a weaker copy of them.
 *
 * The copy they used to maintain (attributionCheck) reported `unsourced: ["100%"]` for 7.2(f) for
 * a figure that is real source text in an authenticated definition the compiler had retrieved, and
 * could not equate "$50 million" with "$50,000,000". These tests pin that the harness now calls the
 * production grounder, that its evidence universe obeys production's admissibility rules, and that
 * the legacy vocabulary survives only as a mechanical derivation.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyForensicGrounding, groundCompiledResult, GROUNDING_STATUSES } from "../../scripts/p3-conmed-pilot/forensic-grounding";
import { attributionCheck } from "../../scripts/p3-conmed-pilot/span-validation";
import {
  caseR2_relatedDefinitionAssertion,
  caseR2_unrelatedDefinitionAssertion,
  caseD_supportedContextControl,
} from "../contract-model/numeric-grounding-fixtures";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRRule } from "../../lib/contract-model/ir/types";

const ground = (input: { compilerInput: never; compilationResult: never }) => groundCompiledResult(input.compilerInput, input.compilationResult);
const run = (build: () => { compilerInput: unknown; compilationResult: unknown }) => {
  const i = build() as unknown as { compilerInput: never; compilationResult: never };
  return ground(i);
};

describe("R1 - the forensic harness delegates to production", () => {
  it("reports the production vocabulary, not a harness-local one", () => {
    const r = run(caseR2_relatedDefinitionAssertion);
    expect(r.assertions.length).toBeGreaterThan(0);
    for (const a of r.assertions) expect(GROUNDING_STATUSES).toContain(a.status);
    expect(Object.keys(r.countsByStatus).sort()).toEqual([...GROUNDING_STATUSES].sort());
  });

  it("neither runner still calls the legacy substring test to decide anything", () => {
    for (const f of ["scripts/p3-conmed-pilot/span-validation.ts", "scripts/p3-conmed-pilot/span-validation-b2.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      const callSites = src.split("\n").filter((l) => /attributionCheck\(/.test(l) && !/export function attributionCheck/.test(l));
      expect(callSites, `${f} still calls attributionCheck`).toHaveLength(0);
      expect(src).toMatch(/groundCompiledResult/);
    }
  });

  it("keeps the legacy fields as a MECHANICAL derivation of the grounding result - disjoint, complete, and marked deprecated", () => {
    const r = run(caseD_supportedContextControl);
    expect(r.legacy.deprecated).toBe(true);
    expect(r.legacy.derivedFrom).toMatch(/never computed independently/);
    const union = [...r.legacy.supportedByAnchor, ...r.legacy.violations, ...r.legacy.unsourced];
    expect([...new Set(union)].sort()).toEqual([...r.legacy.assertedAmounts].sort());
    // a figure cannot be simultaneously anchor-owned and unsourced
    expect(r.legacy.supportedByAnchor.filter((v) => r.legacy.unsourced.includes(v))).toHaveLength(0);
  });

  it("a failed execution yields an empty, same-shaped result rather than a missing field", () => {
    const e = emptyForensicGrounding("candidate-x");
    expect(e.assertions).toHaveLength(0);
    expect(Object.values(e.countsByStatus).every((n) => n === 0)).toBe(true);
    expect(e.legacy.deprecated).toBe(true);
  });
});

describe("R1 §3 - the evidence universe obeys production's admissibility rules", () => {
  it("admits an authenticated retrieval and reports its identity", () => {
    const r = run(caseR2_relatedDefinitionAssertion);
    expect(r.authenticatedEvidence.map((e) => e.requestKey)).toContain("Subsidiary Guarantor");
    for (const e of r.authenticatedEvidence) expect(e.contentHash.length).toBeGreaterThan(16);
  });

  it("never admits a refused or unresolved tool result as evidence", () => {
    const base = caseR2_relatedDefinitionAssertion();
    const refused = { toolName: "getDefinition", input: { term: "Nonexistent Term" }, outputSummary: 'refused: no defined term matching "Nonexistent Term" found in this instrument\'s documents', charsReturned: 60, timestamp: "2026-01-01T00:00:00.000Z", evidenceUnresolved: true, evidenceTruncated: false };
    const compilation = { ...base.compilationResult, toolCallLog: [...base.compilationResult.toolCallLog, refused] } as SemanticCompilationResult;
    const r = groundCompiledResult(base.compilerInput, compilation);
    expect(r.authenticatedEvidence.map((e) => e.requestKey)).not.toContain("Nonexistent Term");
  });

  it("a context-bundle excerpt carries no retrieval identity, so it can never ground an assertion on its own", () => {
    const r = run(caseR2_unrelatedDefinitionAssertion);
    const g = r.assertions.find((a) => a.value === "100%");
    expect(["UNGROUNDED", "AMBIGUOUS"]).toContain(g?.status);
    expect(g?.matchedEvidenceId).toBeNull();
  });
});

describe("R1 §5/§6 - the two historical defects, reproduced and corrected", () => {
  it("7.2(f): the legacy helper calls the related 100% unsourced; the harness now grounds it through the authenticated definition", () => {
    const input = caseR2_relatedDefinitionAssertion();
    const anchorText = input.compilerInput.operativeSourceText;
    const legacy = attributionCheck(input.compilationResult, anchorText, "");
    expect(legacy.unsourced).toContain("100%");

    const g = groundCompiledResult(input.compilerInput, input.compilationResult).assertions.find((a) => a.value === "100%");
    expect(g?.status).toBe("GROUNDED_TOOL_EVIDENCE");
    expect(g?.relation).toMatch(/Subsidiary Guarantor/);
  });

  it("7.2(f): the UNRELATED proposition is still not grounded by that definition - the correction does not become a blanket amnesty", () => {
    const input = caseR2_unrelatedDefinitionAssertion();
    const g = groundCompiledResult(input.compilerInput, input.compilationResult).assertions.find((a) => a.value === "100%");
    expect(["UNGROUNDED", "AMBIGUOUS"]).toContain(g?.status);
    expect(g?.groundedIn).toBeNull();
  });

  it("rendering equivalence: the legacy helper calls $50,000,000 unsourced against a source that says $50 million; the harness does not", () => {
    const SOURCE = "The Borrower shall not permit Liquidity to be less than $50 million at any time.";
    const rule = {
      ruleId: "r1-render", irSchemaVersion: "v1", companyId: "r1", instrumentKey: "r1", sourceDocumentId: "r1",
      sourceSectionRef: "1.01", covenantFamily: "OTHER", ruleType: "FINANCIAL_COVENANT", posture: "OBLIGATION", action: null,
      entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: null,
      conditions: [{ conditionId: "c0", conditionType: "OTHER", expression: null, referencesDefinitionId: null, description: "Liquidity must be at least $50,000,000 at all times", provenance: null }],
      exceptions: [], dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null,
      compilerVersion: "r1", sourceContentVersion: null,
    } as unknown as IRRule;

    const legacy = attributionCheck({ rules: [rule], definitions: [] } as unknown as SemanticCompilationResult, SOURCE, "");
    expect(legacy.unsourced).toContain("$50,000,000");

    const base = caseR2_relatedDefinitionAssertion();
    const input = { ...base.compilerInput, operativeSourceText: SOURCE };
    const g = groundCompiledResult(input, { ...base.compilationResult, rules: [rule], definitions: [], toolCallLog: [] } as SemanticCompilationResult).assertions.find((a) => a.value === "$50,000,000");
    expect(g?.status).toBe("NORMALIZED_EQUIVALENT");
    expect(g?.groundedIn).toBe("OPERATIVE");
    expect(g?.matchedText).toBe("$50 million");
  });
});

describe("R1 §7 - the forensic result stays diagnostic", () => {
  it("no production or benchmark path imports the harness grounding", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && /forensic-grounding|span-validation/.test(fs.readFileSync(full, "utf8"))) offenders.push(full);
      }
    };
    for (const root of ["lib", "app"]) if (fs.existsSync(root)) walk(root);
    expect(offenders).toHaveLength(0);
  });
});
