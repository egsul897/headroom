/**
 * Authentic CONMED multi-family: fidelity + hypo gross; no false certification.
 */
import { describe, expect, it } from "vitest";
import {
  compileConmedAuthenticMultiFamily,
  evaluateAuthenticTransaction,
  extractConmedMultiFamilyCandidates,
  HYPOTHETICAL_CTA_USD,
} from "@/lib/product/authentic-multi-family";
import { parseTransactionDraft } from "@/lib/product/north-star-workflow/transaction-analysis";

describe("authentic multi-family CONMED", () => {
  it("extracts source-backed RP / Investments / Asset Sale candidates from fixture", () => {
    const c = extractConmedMultiFamilyCandidates();
    expect(c.map((x) => x.family).sort()).toEqual(
      ["ASSET_SALES", "INVESTMENTS", "RESTRICTED_PAYMENTS"].sort(),
    );
    expect(c.every((x) => x.operativeSourceText.length > 40)).toBe(true);
  });

  it("compiles fidelity-pass hypo-gross candidates without Phase-3 VEP or CERTIFIED_4E", () => {
    const compiled = compileConmedAuthenticMultiFamily("2024-12-31");
    expect(compiled.verifiedPackage).toBeNull();
    expect(compiled.independentlyExecutableFamilies).toEqual([]);
    expect(compiled.certificationIntegrity.fabricatedVerificationArtifacts).toBe(false);
    expect(compiled.certificationIntegrity.phase3EvidencePresent).toBe(false);
    expect(compiled.certificationIntegrity.certified4eClaimed).toBe(false);
    expect(compiled.certificationIntegrity.hypotheticalCtaIsApprovedNs4).toBe(false);
    expect(compiled.certificationIntegrity.hypotheticalCtaUsd).toBe(HYPOTHETICAL_CTA_USD);
    expect(compiled.fidelityPassHypotheticalGrossFamilies.sort()).toEqual(
      ["ASSET_SALES", "INVESTMENTS", "RESTRICTED_PAYMENTS"].sort(),
    );
    expect(compiled.candidateRules.length).toBe(3);
    for (const u of compiled.units) {
      expect(u.capability.fidelityPass).toBe(true);
      expect(u.capability.hypotheticalGrossCalculable).toBe(true);
      expect(u.capability.semanticCertification).toBe("ABSENT_NO_PHASE3_EVIDENCE");
      expect(u.capability.operativeState).toBe("UNRESOLVED_AMENDMENTS");
      expect(u.capability.productionRemaining).toBe("REFUSED_NULL_NO_COMPLETENESS");
      expect(u.capability.rollup).toBe("FIDELITY_PASS_HYPOTHETICAL_GROSS_NOT_CERTIFIED");
      expect(u.verifiedRemainingUsd).toBeNull();
      expect(u.capability.authoritativeBlockers.length).toBeGreaterThan(0);
      expect(u.capability.authoritativeBlockers.some((b) => /SEMANTIC_CERTIFICATION_ABSENT/.test(b))).toBe(
        true,
      );
    }
    const inv = compiled.units.find((u) => u.family === "INVESTMENTS")!;
    const as = compiled.units.find((u) => u.family === "ASSET_SALES")!;
    expect(inv.diagnosticEvidence.some((d) => /PROVENANCE_EXCERPT_UNRESOLVED|SUFFICIENCY_PARTIAL/.test(d))).toBe(
      true,
    );
    expect(as.diagnosticEvidence.some((d) => /PROVENANCE_EXCERPT_UNRESOLVED|SUFFICIENCY_PARTIAL/.test(d))).toBe(
      true,
    );
  });

  it("evaluation is NOT_CERTIFIED_4E; no simulate; PATH_NOT_FOUND without Phase-3 VEP", () => {
    const compiled = compileConmedAuthenticMultiFamily("2024-12-31");
    for (const kind of ["RESTRICTED_PAYMENT", "INVESTMENT", "ASSET_SALE"] as const) {
      const ev = evaluateAuthenticTransaction({
        compiled,
        kind,
        amountMillions: 20,
        evaluationDate: "2024-12-31",
      });
      expect(ev.pathEnumerationAuthority).toBe("NOT_CERTIFIED_4E");
      expect(ev.pathCount).toBe(0);
      expect(ev.selectedPathId).toBeNull();
      expect(ev.simulationOutcome).toBeNull();
      expect(ev.capacityOutcome).toBeNull();
      expect(ev.verifiedRemainingUsd).toBeNull();
      expect(ev.hypotheticalGrossProbeUsd).toBeGreaterThan(0);
      expect(ev.truthfulBlocker).toMatch(/PATH_NOT_FOUND|NOT_CERTIFIED_4E/);
      expect(ev.overallConclusion).toMatch(/not CERTIFIED_4E/);
      expect(ev.overallConclusion).toMatch(/simulate not invoked/);
    }
  });

  it("parseTransactionDraft classifies asset sale asks", () => {
    const d = parseTransactionDraft(
      "Can we complete a $40 million asset sale disposition on 2024-12-31?",
    );
    expect(d.kind).toBe("ASSET_SALE");
    expect(d.amountMillions).toBe(40);
  });
});
