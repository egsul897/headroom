/**
 * CONMED §7.6(d) evidence→execution path — authentic artifacts only.
 */
import { describe, expect, it } from "vitest";
import {
  CONMED_76D_CANDIDATE_REF,
  evaluateConmed76dEvidenceToExecution,
} from "@/lib/product/evidence-to-execution";
import { attemptAuthenticatedVep } from "../../scripts/product/attempt-authenticated-vep";

describe("evidence-to-execution CONMED §7.6(d)", () => {
  it("binds authentic source and names irreducible Phase-3 blocker", async () => {
    const r = await evaluateConmed76dEvidenceToExecution();

    expect(r.target.candidateRef).toBe(CONMED_76D_CANDIDATE_REF);
    expect(r.family).toBe("RESTRICTED_PAYMENTS");
    expect(r.target.operativeSourceText).toMatch(/\$40,000,000/);
    expect(r.target.operativeSourceText).toMatch(/Parent Borrower/);

    expect(r.stages.compilation.status).toBe("REVIEW_REQUIRED");
    expect(r.stages.semanticVerification.status).toBe("MATERIAL_DISCREPANCY");
    expect(
      r.stages.semanticVerification.materialFindings.some((f) => f.type === "WRONG_ENTITY_SCOPE"),
    ).toBe(true);
    expect(r.stages.certifyCandidate.wouldCertify).toBe(false);
    expect(r.stages.vep.targetCandidateCertified).toBe(false);
    expect(r.stages.eligiblePath.for76d).toBe("NO_VEP");
    expect(r.stages.verifiedCapacity.for76d).toBe("NOT_REACHED");
    expect(r.stages.transactionSimulation.for76d).toBe("NOT_REACHED");

    expect(r.workflowVerdict).toBe("EVIDENCE_TO_EXECUTION_BLOCKED");
    expect(r.irreducibleBlocker.code).toBe("PHASE3_SEMANTIC_VERIFICATION_NOT_CLEAN");
    expect(r.customerCapabilitiesNotClaimed).toContain(
      "Affirmative verified simulate PERMITTED",
    );
  });

  it("inventory separates in-repo evidence from external/paid work", async () => {
    const r = await evaluateConmed76dEvidenceToExecution();
    const classes = new Set(r.evidenceInventory.map((e) => e.class));
    expect(classes.has("IN_REPO")).toBe(true);
    expect(classes.has("EXTERNAL_OR_PAID") || classes.has("ABSENT")).toBe(true);
    expect(
      r.evidenceInventory.some(
        (e) => e.piece.includes("Clean re-compile") && e.class === "EXTERNAL_OR_PAID",
      ),
    ).toBe(true);
    expect(
      r.evidenceInventory.some((e) => e.piece.includes("Authentic operative text")),
    ).toBe(true);
  });

  it("contrasts §7.2(c) CERTIFIED spine without claiming RP execution", async () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.certifiedCount).toBeGreaterThanOrEqual(1);
    expect(scan.adapter.outcome).toBe("DERIVED");

    const r = await evaluateConmed76dEvidenceToExecution();
    expect(r.stages.vep.contrast72cDerived).toBe(true);
    expect(r.stages.eligiblePath.contrast72c?.authority).toBe("CERTIFIED_4E");
    expect(r.stages.eligiblePath.contrast72c?.pathStatuses).toContain("UNSUPPORTED");
    expect(r.stages.transactionSimulation.contrast72cExecutable).toBe(false);
    expect(r.constraintsHonored).toContain(
      "§7.2(c) used only as contrast spine, not as false RP permission",
    );
  });
});
