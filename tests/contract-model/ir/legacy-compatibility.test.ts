/**
 * Phase 3A test matrix, Category F - legacy compatibility (task §56/§38/
 * §57). Proves the two narrow legacy adapters translate exactly the shapes
 * they claim to, refuse everything else with an honest reason rather than
 * guessing, and never mutate the legacy input they read from (task §57's
 * "neither adapter is authoritative" - a read-only, non-authoritative
 * translation must not have side effects on the objects that still drive
 * production Coherent/Matthews behavior).
 */
import { describe, expect, it } from "vitest";
import { adaptCandidateContractRule, adaptLegacyCovenantProvision } from "../../../lib/contract-model/ir/legacy-adapter";
import { validateRule } from "../../../lib/contract-model/ir/validate";
import type { CovenantProvisionInput } from "../../../lib/covenant-engine";
import type { CandidateContractRule } from "../../../lib/contract-model/types";

const COMPANY_ID = "ir-fixture-co";
const INSTRUMENT_KEY = "ir-fixture-instrument";

describe("Phase 3A IR - Category F: legacy compatibility", () => {
  it("F1: a simple legacy FLAT_AMOUNT provision adapts to a valid, well-typed IRRule", () => {
    const provision: CovenantProvisionInput = { id: "prov-1", documentId: "doc-1", code: "flat-basket", basketName: "General debt basket", sectionRef: "6.01(a)", formulaType: "FLAT_AMOUNT", thresholdValue: 5_000_000 };
    const result = adaptLegacyCovenantProvision(provision, COMPANY_ID, INSTRUMENT_KEY);
    expect(result.rule).not.toBeNull();
    expect(result.rule?.capacityExpression?.kind).toBe("MONEY");
    expect(result.rule?.compilerVersion).toBeNull(); // never claims to be a real Phase 3B compilation
    expect(result.rule?.sufficiency).toBe("PARTIAL");
    expect(result.rule && validateRule(result.rule).ok).toBe(true);
  });

  it("F2: a Phase B candidate RATIO_TEST rule with a parseable operator adapts to an UnlimitedCapacity gated by a COMPARE", () => {
    const rule: CandidateContractRule = {
      covenantFamily: "FINANCIAL_COVENANTS",
      ruleType: "RATIO_TEST",
      evaluationClass: "EXECUTABLE",
      action: "SATISFY_RATIO",
      entityScope: [],
      entityScopeExcluded: [],
      thresholdValue: 4.5,
      operator: "LTE",
      conditions: [],
      exceptions: [],
      sourceSectionRef: "6.10(a)",
      definedTermRefs: ["Total Net Leverage Ratio"],
    };
    const result = adaptCandidateContractRule(rule, COMPANY_ID, INSTRUMENT_KEY, "doc-1");
    expect(result.rule).not.toBeNull();
    expect(result.rule?.capacityExpression?.kind).toBe("UNLIMITED_CAPACITY");
    expect((result.rule?.capacityExpression as { gatedBy: { kind: string } }).gatedBy.kind).toBe("COMPARE");
    expect(result.rule && validateRule(result.rule).ok).toBe(true);
  });

  it("F3: an unsupported legacy formula (LEVERAGE_RATIO_ROOM - depends on live solver machinery) refuses with an honest reason rather than guessing", () => {
    const provision: CovenantProvisionInput = { id: "prov-2", documentId: "doc-1", code: "leverage-room", basketName: "Leverage ratio room", sectionRef: "6.10(a)", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.5 };
    const result = adaptLegacyCovenantProvision(provision, COMPANY_ID, INSTRUMENT_KEY);
    expect(result.rule).toBeNull();
    expect(result.refusalReason).toBeTruthy();
    expect(result.refusalReason).toContain("solver");

    const unrouted: CandidateContractRule = { covenantFamily: "LIENS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "JUDGMENT_REQUIRED", action: "CREATE_LIEN", entityScope: [], entityScopeExcluded: [], conditions: [], exceptions: [], sourceSectionRef: "6.02(a)", definedTermRefs: [] };
    const unroutedResult = adaptCandidateContractRule(unrouted, COMPANY_ID, INSTRUMENT_KEY, "doc-1");
    expect(unroutedResult.rule).toBeNull();
    expect(unroutedResult.refusalReason).toBeTruthy();
  });

  it("F4: the adapter never mutates the legacy input object it reads from - a read-only, non-authoritative translation", () => {
    const provision: CovenantProvisionInput = { id: "prov-3", documentId: "doc-1", code: "greater-of", basketName: "Guaranty basket", sectionRef: "6.01(g)(i)", formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", thresholdValue: 2_500_000, params: { pctEbitda: 0.05 } };
    const before = JSON.parse(JSON.stringify(provision));
    adaptLegacyCovenantProvision(provision, COMPANY_ID, INSTRUMENT_KEY);
    expect(JSON.parse(JSON.stringify(provision))).toEqual(before);

    const candidateRule: CandidateContractRule = { covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], thresholdValue: 1_000_000, formulaRef: "FIXED_AMOUNT", conditions: [], exceptions: [], sourceSectionRef: "6.01(a)", definedTermRefs: [] };
    const candidateBefore = JSON.parse(JSON.stringify(candidateRule));
    adaptCandidateContractRule(candidateRule, COMPANY_ID, INSTRUMENT_KEY, "doc-1");
    expect(JSON.parse(JSON.stringify(candidateRule))).toEqual(candidateBefore);
  });
});
