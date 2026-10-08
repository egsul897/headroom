/**
 * Independent remediation-replay integrity checks (challenger branch).
 *
 * Asserts CLOSED defects stay closed and remaining blockers stay open.
 * Does NOT modify PR #150 research expectations, frozen certification
 * evidence, or production legal-rule code. Does NOT claim legal verification.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "docs/amendment-chain-research");
const CHALLENGE = join(process.cwd(), "docs/amendment-chain-legal-challenge");
const DSGR = join(
  process.cwd(),
  "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility",
);

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("independent remediation replay against PR #150 tip", () => {
  it("records replay dispositions without promoting legal verification", () => {
    const v = readJson(join(CHALLENGE, "remediation-replay-verdicts.json"));
    expect(v.reviewedSha).toBe("50eb36b9116fee788fe89eaa588875ccb5c2681e");
    expect(v.originalReviewedSha).toBe(
      "ce07b1525972d1dea00792a2058900fa56291163",
    );
    expect(v.promotionStatus).toBe("NOT_INDEPENDENTLY_LEGALLY_VERIFIED");
    expect(v.anyExecutableAmendmentStateLegallyVerified).toBe(false);
    expect(v.safeForNonPromotingResearchIntegration).toBe(true);
    expect(v.safeForCertifiedOperativeLaw).toBe(false);
    expect(v.researchPrModified).toBe(false);
    expect(v.paidInference).toBe(false);

    expect(v.defectDispositions.D1_conmed_internap_manifest_ledger_dual_truth).toBe(
      "CLOSED",
    );
    expect(v.defectDispositions.D2_azz_applicable_rate_vs_margin).toBe("CLOSED");
    expect(v.defectDispositions.D3_azz_kf_export_omission).toBe("CLOSED");
    expect(
      v.defectDispositions.D4_internap_before_text_and_am1_am6_propagation,
    ).toBe("PARTIALLY_REMEDIATED");
    expect(v.defectDispositions.D5_dsgr_10m_before_and_am2_wrapper).toBe(
      "PARTIALLY_REMEDIATED",
    );
    expect(v.verdicts["VC-005"].replay).toBe("PASS");
    expect(v.verdicts["VC-008"].replay).toBe("PASS");
  });

  it("confirms CONMED/Internap dual-truth closed and layers not collapsed", () => {
    const cnmd = readJson(join(ROOT, "chains/conmed-seventh-eighth/manifest.json"));
    const seventh = cnmd.documents.find(
      (d: { docId: string }) => d.docId === "cnmd-seventh-ar",
    );
    expect(seventh.retrievalStatus).toBe("RETRIEVED");
    expect(seventh.authorityLayerStates.SOURCE_ACQUIRED).toBe(true);
    expect(seventh.authorityLayerStates.OPERATIVE_STATE_RESOLVED).toBe(false);
    expect(seventh.authorityLayerStates.INDEPENDENTLY_LEGALLY_VERIFIED).toBe(
      false,
    );

    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const led = ledger.documents.find(
      (d: { docId: string }) => d.docId === "cnmd-seventh-ar",
    );
    expect(led.acquisitionStatus).toBe("ACQUIRED");
    expect(led.filename).toBe("d170717dex101.htm");

    const inap = readJson(join(ROOT, "chains/internap-2017-credit/manifest.json"));
    expect(inap.documents).toHaveLength(8);
    for (const d of inap.documents) {
      expect(d.retrievalStatus).toBe("RETRIEVED");
      expect(d.authorityLayerStates.SOURCE_ACQUIRED).toBe(true);
      expect(d.authorityLayerStates.OPERATIVE_STATE_RESOLVED).toBe(false);
    }
  });

  it("confirms AZZ Applicable Rate + KF export inclusion", () => {
    const ba = readJson(join(ROOT, "before-after/azz-am4-applicable-rate.json"));
    expect(ba.comparisons[0].target.definedTerm).toBe("Applicable Rate");
    const exp = readJson(
      join(ROOT, "knowledge-factory-export/amendment-chains-export.json"),
    );
    expect(exp.chainIdentities).toContain("azz-2022-05-13-credit-agreement");
    const am4 = exp.documents.find(
      (d: { researchDocId: string }) => d.researchDocId === "azz-am4",
    );
    expect(am4.definedTermAmended).toBe("Applicable Rate");
    expect(am4.originalBytesHash).toMatch(/^[a-f0-9]{64}$/);
    expect(am4.effectiveDateStatus).toBe("CONDITIONAL_UNRESOLVED");
  });

  it("confirms Internap before-text closed but propagation still open", () => {
    const ba = readJson(join(ROOT, "before-after/inap-am7-baskets-and-ratios.json"));
    expect(ba.comparisons[0].authority.before.status).toBe("SOURCE_BACKED");
    expect(ba.comparisons[0].beforeText).toMatch(/\$25,000,000/);
    expect(ba.comparisons[1].beforeText).toMatch(/\$15,000,000/);
    expect(ba.propagationDiscipline.completeOperativeStateReconstruction).toBe(
      false,
    );
    const exp = readJson(
      join(ROOT, "knowledge-factory-export/amendment-chains-export.json"),
    );
    const gap = exp.missingAuthority.find(
      (m: { item: string }) => m.item === "am1-am6-basket-propagation",
    );
    expect(gap.status).toBe("UNRESOLVED_DEPENDENCY");
  });

  it("confirms DSGR $10M before-text closed and Am2 wrapper still missing", () => {
    const ba = readJson(join(ROOT, "before-after/dsgr-am4-restricted-payments.json"));
    expect(ba.comparisons[0].beforeText).toMatch(/\$10,000,000/);
    expect(ba.comparisons[0].afterText).toMatch(/\$25,000,000/);
    const docB = readFileSync(
      join(DSGR, "extracted-text/doc-b-2024-third-amendment.txt"),
      "utf8",
    );
    expect(docB).toMatch(/not to exceed \$10,000,000/);

    const exp = readJson(
      join(ROOT, "knowledge-factory-export/amendment-chains-export.json"),
    );
    expect(
      exp.missingAuthority.find(
        (m: { item: string }) => m.item === "dsgr-am2-wrapper-text",
      ).status,
    ).toBe("MISSING_DOCUMENT");
    expect(
      exp.parentChildAuthorityLinks.find(
        (l: { child?: string }) => l.child === "dsgr-am2-10q",
      ).authorityStatus,
    ).toBe("NOT_OPERATIVE");
  });

  it("confirms CONMED Am2 parent instrument is Seventh A&R", () => {
    const exp = readJson(
      join(ROOT, "knowledge-factory-export/amendment-chains-export.json"),
    );
    const link = exp.parentChildAuthorityLinks.find(
      (l: { child?: string; parent?: string }) =>
        l.child === "cnmd-second-am-2022" && l.parent === "cnmd-seventh-ar",
    );
    expect(link.intermediateState).toBe("cnmd-am1-2022");
  });

  it("refuses false legal verification / false operative-state promotion", () => {
    const exp = readJson(
      join(ROOT, "knowledge-factory-export/amendment-chains-export.json"),
    );
    expect(exp.verificationStatus).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(exp.importContract.competingProductionSchema).toBe(false);

    for (let i = 1; i <= 8; i++) {
      const spec = readJson(join(ROOT, `test-specs/VC-00${i}-spec.json`));
      expect(spec.independentlyReviewedLegalGroundTruth.status).toBe(
        "PENDING_INDEPENDENT_REVIEW",
      );
      expect(spec.sourceAuthorExpectation.notLegalGroundTruth).toBe(true);
    }

    // Spot-check: no document claims independent legal verification
    const manifests = [
      "chains/conmed-seventh-eighth/manifest.json",
      "chains/internap-2017-credit/manifest.json",
      "chains/azz-2022-credit/manifest.json",
    ];
    for (const rel of manifests) {
      const m = readJson(join(ROOT, rel));
      for (const d of m.documents) {
        if (d.authorityLayerStates) {
          expect(d.authorityLayerStates.INDEPENDENTLY_LEGALLY_VERIFIED).toBe(
            false,
          );
          expect(d.authorityLayerStates.OPERATIVE_STATE_RESOLVED).toBe(false);
        }
      }
    }
  });

  it("hashes AZZ Am4 when local bytes present", () => {
    const path = join(
      process.cwd(),
      ".local-amendment-research/bytes/azz-2022-05-13-credit-agreement/azz-am4__fourthamendmenttocreditagr.htm",
    );
    if (!existsSync(path)) return;
    const hash = sha256File(path);
    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const am4 = ledger.documents.find(
      (d: { docId: string }) => d.docId === "azz-am4",
    );
    expect(am4.sha256).toBe(hash);
    const body = readFileSync(path, "utf8");
    expect(body).toMatch(/Applicable Rate/);
  });

  it("replay report exists and states not legally verified", () => {
    const report = readFileSync(
      join(CHALLENGE, "REMEDIATION-REPLAY-REPORT.md"),
      "utf8",
    );
    expect(report).toMatch(/50eb36b9116fee788fe89eaa588875ccb5c2681e/);
    expect(report).toMatch(/NOT INDEPENDENTLY LEGALLY_VERIFIED|NOT INDEPENDENTLY LEGALLY VERIFIED/);
    expect(report).toMatch(/No executable amendment state is legally verified/i);
  });
});
