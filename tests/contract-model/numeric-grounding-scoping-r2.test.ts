/**
 * R2 - free-text numeric evidence SCOPING.
 *
 * The defect these tests exist for was measured on real CONMED evidence, not imagined: with the
 * authenticated "Subsidiary Guarantor" definition (whose text really does read "... Pledge
 * Eligible Foreign Subsidiary (100%)") in scope, Fix B returned GROUNDED_CONTEXT for BOTH
 *
 *   "may cover up to 100% of the obligations of any Subsidiary Guarantor"   (related)
 *   "may prepay up to 100% of the outstanding Revolving Loans"              (unrelated)
 *
 * Numeric equality alone is not evidence of anything. The structured path already knew this -
 * reconciliation.ts's irItemScopedToEvidence requires a retrieved figure to be SCOPED to the IR
 * value it supports - and R2 gives the free-text path the same discipline, reusing that module's
 * own citation/term scoping helpers rather than inventing a second notion of relatedness.
 *
 * Nothing here calls a model.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticVerificationResult, VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import {
  caseR2_ambiguousDuplicateEvidence,
  caseR2_duplicateValueEvidence,
  caseR2_relatedConvertibleNotes,
  caseR2_relatedDefinitionAssertion,
  caseR2_unrelatedConvertibleNotes,
  caseR2_unrelatedDefinitionAssertion,
} from "./numeric-grounding-fixtures";

const stub = (response: unknown): StageCaller => ({ providerName: "test", model: "test", isSynthetic: false, async call<T>(schema: ZodType<T>): Promise<T> { return schema.parse(response); }, lastTelemetry: () => null });
const verify = (input: VerificationInput): Promise<SemanticVerificationResult> =>
  verifyCompiledCandidate(input, { reviewCaller: stub({ findings: [], overallNotes: [] }), conditionSuspicionCaller: stub({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }) });

const groundings = (r: SemanticVerificationResult) => r.numericAssertions?.groundings ?? [];
const one = (r: SemanticVerificationResult, raw: string) => groundings(r).find((g) => g.assertion.rawText === raw);
const unsupportedFindings = (r: SemanticVerificationResult) => r.findings.filter((f) => f.findingType === "UNSUPPORTED_NUMERIC_ASSERTION");
const GROUNDED = ["GROUNDED_OPERATIVE", "GROUNDED_CONTEXT", "GROUNDED_TOOL_EVIDENCE", "NORMALIZED_EQUIVALENT"];
const VERIFIED = ["VERIFIED_NO_MATERIAL_GAP_FOUND", "VERIFIED_WITH_NON_MATERIAL_FINDINGS"];

describe("R2 §3 - the measured counterexample", () => {
  it("A: an assertion that really is about the retrieved definition is grounded THROUGH that definition, and says why", async () => {
    const result = await verify(caseR2_relatedDefinitionAssertion());
    const g = one(result, "100%");
    expect(g?.status).toBe("GROUNDED_TOOL_EVIDENCE");
    expect(g?.groundedIn).toBe("CONTEXT");
    expect(g?.matchedEvidenceId).toBeTruthy();
    expect(g?.relation).toMatch(/Subsidiary Guarantor/);
    expect(unsupportedFindings(result)).toHaveLength(0);
  });

  it("B: the SAME figure and the SAME authenticated definition, asserted about something the definition says nothing about, is NOT grounded by it", async () => {
    const result = await verify(caseR2_unrelatedDefinitionAssertion());
    const g = one(result, "100%");
    expect(GROUNDED).not.toContain(g?.status);
    expect(["UNGROUNDED", "AMBIGUOUS"]).toContain(g?.status);
    expect(g?.groundedIn).toBeNull();
    expect(unsupportedFindings(result)).toHaveLength(1);
    expect(VERIFIED).not.toContain(result.status);
  });

  it("numeric equality alone is never sufficient: the two assertions above differ ONLY in what they are about", async () => {
    const [related, unrelated] = await Promise.all([verify(caseR2_relatedDefinitionAssertion()), verify(caseR2_unrelatedDefinitionAssertion())]);
    expect(one(related, "100%")?.assertion.normalizedValue).toBe(one(unrelated, "100%")?.assertion.normalizedValue);
    expect(one(related, "100%")?.status).not.toBe(one(unrelated, "100%")?.status);
  });
});

describe("R2 §9 - the definition control, both halves", () => {
  it("figures that really derive from the Convertible Notes definition stay grounded", async () => {
    const result = await verify(caseR2_relatedConvertibleNotes());
    for (const raw of ["$800,000,000", "2.25%"]) {
      const g = one(result, raw);
      expect(GROUNDED, raw).toContain(g?.status);
      expect(g?.groundedIn, raw).toBe("CONTEXT");
    }
    expect(unsupportedFindings(result)).toHaveLength(0);
  });

  it("the same two figures, asserted about an unrelated covenant concept, are NOT grounded by that definition", async () => {
    const result = await verify(caseR2_unrelatedConvertibleNotes());
    for (const raw of ["$800,000,000", "2.25%"]) {
      expect(GROUNDED, raw).not.toContain(one(result, raw)?.status);
    }
    expect(unsupportedFindings(result).length).toBeGreaterThan(0);
  });
});

describe("R2 §10/§11 - several sources carrying the same figure", () => {
  it("grounds through the RELEVANT source and records the unrelated ones rather than reporting 'the number is there somewhere'", async () => {
    const result = await verify(caseR2_duplicateValueEvidence());
    const g = one(result, "100%");
    expect(g?.status).toBe("GROUNDED_TOOL_EVIDENCE");
    expect(g?.relation).toMatch(/Subsidiary Guarantor/);
    expect(g?.matchedEvidenceId).toBeTruthy();
    // The two retrieved provisions also contain 100%; neither may be mistaken for the support.
    expect(g?.unrelatedEvidenceIds.length).toBeGreaterThanOrEqual(2);
    expect(g?.unrelatedEvidenceIds).not.toContain(g?.matchedEvidenceId);
  });

  it("fails CLOSED when the figure sits in two authenticated sources and no relation to either can be established", async () => {
    const result = await verify(caseR2_ambiguousDuplicateEvidence());
    const g = one(result, "100%");
    expect(g?.status).toBe("AMBIGUOUS");
    expect(g?.groundedIn).toBeNull();
    expect(g?.unrelatedEvidenceIds.length).toBeGreaterThanOrEqual(2);
    expect(VERIFIED).not.toContain(result.status);
  });
});
