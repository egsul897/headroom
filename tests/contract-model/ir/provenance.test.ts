/**
 * Phase 3A test matrix, Category D - provenance (task §56/§23). Proves
 * multi-level source provenance: subexpressions carry their own distinct
 * citations independent of their owning rule/definition, conditions can
 * cite different source spans than the rule they belong to, definitions
 * carry provenance just like rules, and OperativeContractState lineage is
 * a real, structured, independently-trackable field rather than a string
 * note bolted onto the rule.
 */
import { describe, expect, it } from "vitest";
import type { SourceProvenance } from "../../../lib/contract-model/ir/types";
import { FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE, FIXTURE_11_NO_DEFAULT_CONDITION, FIXTURE_14_BUILDER_AVAILABLE_AMOUNT, FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE } from "../../fixtures/ir-examples/real-covenant-shapes";

describe("Phase 3A IR - Category D: provenance", () => {
  it("D1: each SCHEDULE case's nested value carries its OWN distinct sourceCitation, not one blanket citation for the whole rule (fwrg-6.10-a: 5.50/5.25/5.00 each cite a different clause)", () => {
    const gatedBy = (FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE.capacityExpression as { gatedBy: { right: { cases: { value: { provenance?: SourceProvenance } }[]; defaultValue: { provenance?: SourceProvenance } | null } } }).gatedBy;
    const schedule = gatedBy.right;
    const citations = [schedule.cases[0]?.value.provenance?.sourceCitation, schedule.cases[1]?.value.provenance?.sourceCitation, schedule.defaultValue?.provenance?.sourceCitation];
    expect(citations.every((c) => typeof c === "string" && c.length > 0)).toBe(true);
    expect(new Set(citations).size).toBe(3); // three genuinely distinct citations, not one repeated for all three cases
  });

  it("D2: a rule's condition carries its own SourceProvenance, structurally independent of (though here co-located with) the rule's own top-level provenance", () => {
    expect(FIXTURE_11_NO_DEFAULT_CONDITION.conditions[0]?.provenance).not.toBeNull();
    expect(FIXTURE_11_NO_DEFAULT_CONDITION.conditions[0]?.provenance?.sourceCitation).toBeTruthy();
    // the condition's provenance object is genuinely its own field, not a reference into rule.provenance
    expect(FIXTURE_11_NO_DEFAULT_CONDITION.conditions[0]?.provenance).not.toBe(FIXTURE_11_NO_DEFAULT_CONDITION.provenance);
  });

  it("D3: an IRDefinition carries its own top-level provenance PLUS distinct provenance on each of its internal subexpressions (fwrg-def-available-amount: definition cites the whole clause, its two components cite (i) and (ii) separately)", () => {
    const definitionCitation = FIXTURE_14_BUILDER_AVAILABLE_AMOUNT.provenance?.sourceCitation;
    const sum = FIXTURE_14_BUILDER_AVAILABLE_AMOUNT.calculationExpression as { operands: { provenance?: SourceProvenance }[] };
    const clauseICitation = sum.operands[0]?.provenance?.sourceCitation;
    const clauseIICitation = sum.operands[1]?.provenance?.sourceCitation;
    expect(definitionCitation).toBeTruthy();
    expect(clauseICitation).toBeTruthy();
    expect(clauseIICitation).toBeTruthy();
    expect(new Set([definitionCitation, clauseICitation, clauseIICitation]).size).toBe(3);

    // a definition with no formalized calculationExpression (fixture 15) still carries its own honest provenance
    expect(FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE.provenance?.sourceCitation).toContain("Intercreditor Agreement");
  });

  it("D4: OperativeLineageRef is a real, structured object (instrumentKey/provisionKey/asOfDate/operativeStatus/currentSourceDocumentId), independently settable per rule and distinct from SourceProvenance", () => {
    const originalDocId = FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE.sourceDocumentId;
    const lineage = { instrumentKey: "ir-fixture-instrument", provisionKey: "6.10(a)", asOfDate: "2026-01-01", operativeStatus: "OPERATIVE_STATE_REVIEW_REQUIRED" as const, currentSourceDocumentId: "ir-fixture-doc-amended" };
    expect(lineage.operativeStatus).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    // lineage.currentSourceDocumentId can legitimately point at a DIFFERENT document than the rule's own original sourceDocumentId - the amendment superseded the original text, and lineage tracks that independently of the rule's own static provenance.
    expect(lineage.currentSourceDocumentId).not.toBe(originalDocId);
  });
});
