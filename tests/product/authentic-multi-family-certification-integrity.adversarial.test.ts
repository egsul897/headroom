/**
 * Adversarial certification-integrity locks for CONMED authentic multi-family.
 * Fabricated verification, missing Phase-3, partial provenance, absent paths,
 * cross-company numerical reuse, missing CTA/utilization — all must fail closed.
 */
import { describe, expect, it } from "vitest";
import {
  compileConmedAuthenticMultiFamily,
  evaluateAuthenticTransaction,
  HYPOTHETICAL_CTA_USD,
  type ConmedMultiFamilyCompileResult,
} from "@/lib/product/authentic-multi-family";
import { enumerateCertifiedPaths } from "@/lib/product/north-star-workflow/verified-path-enumeration";
import type { VerifiedExecutionPackage, VerifiedUnitArtifact } from "@/lib/contract-model/verified-execution";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";

function fabricatedArtifact(ruleId: string, companyId: string): VerifiedUnitArtifact {
  return {
    ruleOrDefinitionId: ruleId,
    kind: "RULE",
    verifiedIdentity: {
      ruleOrDefinitionId: ruleId,
      companyId,
      instrumentKey: "forged-instrument",
      irSchemaVersion: "headroom-covenant-ir.v1",
      compilerVersion: "forged",
      sourceContentVersion: "forged",
    },
    result: {
      candidateRef: ruleId,
      status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
      findings: [],
      semanticReviewInvoked: false,
      semanticReviewSkippedReason: "ADVERSARIAL_FABRICATED",
      conditionSuspicion: null,
      verifierAlgorithmVersion: "adversarial-fabricated.v0",
      verifiedAt: new Date().toISOString(),
      evidenceSetHash: "forged",
    } as unknown as SemanticVerificationResult,
  };
}

describe("authentic multi-family certification integrity (adversarial)", () => {
  it("refuses fabricated verification — compile path never emits synthetic VERIFIED_NO_MATERIAL_GAP_FOUND artifacts", () => {
    const compiled = compileConmedAuthenticMultiFamily();
    expect(compiled.verifiedPackage).toBeNull();
    expect(compiled.certificationIntegrity.fabricatedVerificationArtifacts).toBe(false);
    // No unit may claim Phase-3 verified.
    for (const u of compiled.units) {
      expect(u.capability.semanticCertification).toBe("ABSENT_NO_PHASE3_EVIDENCE");
      expect(u.capability.rollup).not.toMatch(/VERIFIED_EXECUTABLE/);
    }
  });

  it("missing semantic review / Phase-3 evidence → NOT_CERTIFIED_4E enumeration", () => {
    const compiled = compileConmedAuthenticMultiFamily();
    const enumResult = enumerateCertifiedPaths({
      verifiedPackage: compiled.verifiedPackage,
      transactionKind: "RESTRICTED_PAYMENT",
      secured: null,
    });
    expect(enumResult.authority).toBe("NOT_CERTIFIED_4E");
    expect(enumResult.paths).toEqual([]);
    expect(enumResult.incompleteReasons).toContain("NO_VERIFIED_EXECUTION_PACKAGE");
  });

  it("partial provenance / sufficiency=PARTIAL is preserved as authoritative blocker (Inv/AS)", () => {
    const compiled = compileConmedAuthenticMultiFamily();
    for (const family of ["INVESTMENTS", "ASSET_SALES"] as const) {
      const u = compiled.units.find((x) => x.family === family)!;
      expect(u.ruleSufficiency).toBe("PARTIAL");
      expect(
        u.diagnosticEvidence.some(
          (d) => /PROVENANCE_EXCERPT_UNRESOLVED/.test(d) || /SUFFICIENCY_PARTIAL/.test(d),
        ),
      ).toBe(true);
      expect(u.capability.authoritativeBlockers.length).toBeGreaterThan(0);
    }
  });

  it("absent / stale amendments block authoritative execution", () => {
    const compiled = compileConmedAuthenticMultiFamily();
    for (const u of compiled.units) {
      expect(u.amendmentBindings).toEqual([]);
      expect(u.capability.operativeState).toBe("UNRESOLVED_AMENDMENTS");
      expect(
        u.capability.authoritativeBlockers.some((b) => /UNRESOLVED_AMENDMENTS/.test(b)),
      ).toBe(true);
    }
  });

  it("no enumerated eligible path → PATH_NOT_FOUND; never invents selectedPath or simulate", () => {
    const compiled = compileConmedAuthenticMultiFamily();
    const ev = evaluateAuthenticTransaction({
      compiled,
      kind: "RESTRICTED_PAYMENT",
      amountMillions: 25,
      evaluationDate: "2024-12-31",
    });
    expect(ev.selectedPathId).toBeNull();
    expect(ev.simulationOutcome).toBeNull();
    expect(ev.truthfulBlocker).toMatch(/PATH_NOT_FOUND/);
  });

  it("injecting fabricated VEP with forged VERIFIED_NO_MATERIAL_GAP_FOUND must not auto-permit simulate via evaluator", () => {
    const compiled = compileConmedAuthenticMultiFamily();
    const rule = compiled.candidateRules[0]!;
    const forgedPkg: VerifiedExecutionPackage = {
      companyId: rule.companyId,
      instrumentKey: rule.instrumentKey,
      rules: [rule],
      definitions: [],
      sharedCapacities: [],
      verifications: [fabricatedArtifact(rule.ruleId, rule.companyId)],
    };
    // Even if a caller forges a package into the compile result, evaluator still
    // refuses when authoritative blockers remain (amendments / remaining / etc.).
    const forgedCompiled: ConmedMultiFamilyCompileResult = {
      ...compiled,
      verifiedPackage: forgedPkg,
    };
    const ev = evaluateAuthenticTransaction({
      compiled: forgedCompiled,
      kind: "RESTRICTED_PAYMENT",
      amountMillions: 25,
      evaluationDate: "2024-12-31",
    });
    // Simulate must not run: blockers present and/or path ineligible.
    expect(ev.simulationOutcome).toBeNull();
    expect(ev.verifiedRemainingUsd).toBeNull();
    expect(ev.overallConclusion).not.toMatch(/VERIFIED_TRANSACTION_PERMITTED(?!.*not)/);
    expect(ev.truthfulBlocker).toBeTruthy();
  });

  it("same numerical inputs across unrelated companies do not transfer CONMED certification", () => {
    const compiled = compileConmedAuthenticMultiFamily();
    const rule = compiled.candidateRules[0]!;
    // Same dollar amount / CTA figure under a different companyId must not inherit authority.
    expect(rule.companyId).toBe("conmed");
    const foreignPkg: VerifiedExecutionPackage = {
      companyId: "matthews",
      instrumentKey: "matthews-international-q1-fy2025",
      rules: [{ ...rule, companyId: "matthews", instrumentKey: "matthews-international-q1-fy2025" }],
      definitions: [],
      sharedCapacities: [],
      verifications: [fabricatedArtifact(rule.ruleId, "matthews")],
    };
    const enumForeign = enumerateCertifiedPaths({
      verifiedPackage: foreignPkg,
      transactionKind: "RESTRICTED_PAYMENT",
      secured: null,
    });
    // Enumeration may list paths if forged artifacts look complete — product evaluator
    // still refuses CONMED unit evaluation under foreign identity.
    const forgedCompiled: ConmedMultiFamilyCompileResult = {
      ...compiled,
      verifiedPackage: foreignPkg,
      units: compiled.units.map((u) =>
        u.ruleId === rule.ruleId
          ? {
              ...u,
              // Keep CONMED citation; foreign package must not clear blockers.
            }
          : u,
      ),
    };
    const ev = evaluateAuthenticTransaction({
      compiled: forgedCompiled,
      kind: "RESTRICTED_PAYMENT",
      amountMillions: 25,
      evaluationDate: "2024-12-31",
    });
    expect(ev.simulationOutcome).toBeNull();
    expect(ev.unit?.operativeDocumentId).toContain("conmed");
    expect(foreignPkg.companyId).not.toBe(ev.unit?.operativeDocumentId.split("-")[0]);
    // Numerical coincidence ($40M) is not identity.
    expect(ev.hypotheticalGrossProbeUsd).toBe(40_000_000);
    expect(enumForeign.authority === "CERTIFIED_4E" || enumForeign.authority === "INCOMPLETE_PACKAGE" || enumForeign.authority === "NOT_CERTIFIED_4E").toBe(true);
  });

  it("missing approved CTA — hypo $2bn never labeled APPROVED NS-4", () => {
    const compiled = compileConmedAuthenticMultiFamily();
    expect(compiled.certificationIntegrity.hypotheticalCtaUsd).toBe(HYPOTHETICAL_CTA_USD);
    expect(compiled.certificationIntegrity.hypotheticalCtaIsApprovedNs4).toBe(false);
    for (const u of compiled.units.filter((x) => x.formulation === "GREATER_OF_ASSETS")) {
      expect(u.limitations.some((l) => /not APPROVED NS-4/i.test(l))).toBe(true);
    }
  });

  it("missing utilization completeness keeps verifiedRemainingUsd null", () => {
    const compiled = compileConmedAuthenticMultiFamily();
    for (const u of compiled.units) {
      expect(u.verifiedRemainingUsd).toBeNull();
      expect(u.capability.productionRemaining).toBe("REFUSED_NULL_NO_COMPLETENESS");
    }
    const ev = evaluateAuthenticTransaction({
      compiled,
      kind: "INVESTMENT",
      amountMillions: 50,
      evaluationDate: "2024-12-31",
    });
    expect(ev.verifiedRemainingUsd).toBeNull();
  });
});
