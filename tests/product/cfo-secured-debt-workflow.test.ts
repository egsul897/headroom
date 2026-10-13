/**
 * CFO secured-debt customer workflow — Matthews authentic package.
 *
 * Acceptance: orchestrates citations, operative/amendment state, baskets,
 * financial provenance, utilization honesty, verified simulate refusal,
 * defensible result, and exportable audit trail — without fabricating
 * PERMITTED, verified remaining, or Phase-3 certification.
 */
import { describe, expect, it } from "vitest";
import { evaluateCfoSecuredDebtWorkflow } from "@/lib/product/cfo-secured-debt-workflow";

const ASK =
  "As of 2024-12-31, is a proposed $50 million secured debt transaction permitted under our Indenture and Credit Agreement?";

describe("CFO secured-debt workflow (Matthews authentic)", () => {
  it("returns the eight customer outputs with exportable audit trail", async () => {
    const r = await evaluateCfoSecuredDebtWorkflow({
      ask: ASK,
      amountMillions: 50,
      evaluationDate: "2024-12-31",
    });

    expect(r.schema).toBe("cfo-secured-debt-workflow.v1");
    expect(r.package.authenticity).toBe("AUTHENTIC_SOURCE_BACKED");
    expect(r.package.key).toBe("matthews-international-q1-fy2025");

    // 1. Applicable covenants + citations
    expect(r.applicableCovenants.length).toBeGreaterThanOrEqual(5);
    for (const c of r.applicableCovenants) {
      expect(c.sourceCitation).toMatch(/—/);
      expect(c.governingDocument.length).toBeGreaterThan(0);
      expect(c.remainingCapacityMm).toBeNull();
    }

    // 2. Operative + amendment state (honest partial)
    expect(r.operativeAndAmendmentState.documents.length).toBeGreaterThanOrEqual(2);
    expect(r.operativeAndAmendmentState.operativeStateStatus).toBe("PARTIAL_LEAF_ENCODED");
    expect(r.operativeAndAmendmentState.amendmentNotes.length).toBeGreaterThan(0);

    // 3. Baskets / ratio conditions
    expect(r.debtBasketsAndRatioConditions.length).toBe(r.applicableCovenants.length);
    expect(r.debtBasketsAndRatioConditions.every((b) => b.remainingPublished === null)).toBe(
      true,
    );

    // 4. Financial inputs — never claimed APPROVED
    expect(r.approvedFinancialInputs.ns4ApprovedPresent).toBe(false);
    expect(r.approvedFinancialInputs.fixtureProvenance).toContain("AUTHENTIC_SOURCE_BACKED");
    expect(r.approvedFinancialInputs.lines.length).toBeGreaterThan(0);

    // 5. Utilization honesty — remaining null
    expect(r.utilizationAndRemaining.completenessCertificatePresent).toBe(false);
    expect(r.utilizationAndRemaining.supportsRemainingClaim).toBe(false);
    expect(r.utilizationAndRemaining.verifiedRemainingUsd).toBeNull();
    expect(r.utilizationAndRemaining.productionHandoffRefused).toBe(true);

    // 6. Verified simulate on REQUIRE spine — refused without VEP
    expect(r.pathAndSimulation.verifiedSimulateInvoked).toBe(true);
    expect(r.pathAndSimulation.verifiedSimulateExecutable).toBe(false);
    expect(r.pathAndSimulation.pathEnumerationAuthority).toBe("NOT_CERTIFIED_4E");
    expect(r.pathAndSimulation.selectedPathId).toBeNull();
    expect(r.pathAndSimulation.refusalSummary.length).toBeGreaterThan(0);

    // 7. Defensible result — never false PERMITTED
    expect(r.result).not.toBe("PERMITTED");
    expect(["NOT_PERMITTED", "NEEDS_INPUT", "REVIEW_REQUIRED"]).toContain(r.result);

    // 8. Audit trail
    expect(r.auditTrail.sources.length).toBeGreaterThanOrEqual(3);
    expect(r.auditTrail.gates.some((g) => g.gate === "VERIFIED_SIMULATE")).toBe(true);
    expect(r.auditTrail.unresolvedConditions).toContain("NO_MATTHEWS_VERIFIED_EXECUTION_PACKAGE");

    expect(r.workflowVerdict).toBe("CUSTOMER_WORKFLOW_PARTIAL");
    expect(r.constraintsHonored).toContain("no PERMITTED without genuine gates");
  });

  it("fail-closes to UNSUPPORTED when authentic package is omitted", async () => {
    const r = await evaluateCfoSecuredDebtWorkflow({
      ask: ASK,
      omitAuthenticPackage: true,
    });

    expect(r.result).toBe("UNSUPPORTED");
    expect(r.package.authenticity).toBe("NONE");
    expect(r.applicableCovenants).toHaveLength(0);
    expect(r.utilizationAndRemaining.verifiedRemainingUsd).toBeNull();
    expect(r.pathAndSimulation.verifiedSimulateExecutable).toBe(false);
    expect(r.workflowVerdict).toBe("CUSTOMER_WORKFLOW_BLOCKED_BY_EVIDENCE");
    expect(r.auditTrail.unresolvedConditions).toContain("MISSING_AUTHENTIC_PACKAGE");
  });

  it("needs input when draft lacks date/amount/kind", async () => {
    const r = await evaluateCfoSecuredDebtWorkflow({
      ask: "Can we borrow more?",
    });

    expect(r.draft.missingConfirmations.length).toBeGreaterThan(0);
    expect(r.result).toBe("NEEDS_INPUT");
    expect(r.result).not.toBe("PERMITTED");
  });

  it("lists exact required external evidence rather than fabricating gates", async () => {
    const r = await evaluateCfoSecuredDebtWorkflow({ ask: ASK });
    const statuses = r.requiredExternalEvidence.map((e) => e.status);
    expect(statuses).toContain("ABSENT");
    expect(
      r.requiredExternalEvidence.some((e) =>
        e.evidence.includes("VerifiedExecutionPackage"),
      ),
    ).toBe(true);
    expect(
      r.requiredExternalEvidence.every((e) => e.status !== "ABSENT" || e.whyRequired.length > 0),
    ).toBe(true);
  });
});
