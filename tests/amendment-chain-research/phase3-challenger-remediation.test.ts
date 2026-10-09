/**
 * Phase 3 remediation regressions for independent-challenger defects (PR #156).
 *
 * Does NOT edit PR #156 challenger expectations. Does NOT flip research
 * independentlyReviewedLegalGroundTruth away from PENDING_INDEPENDENT_REVIEW.
 * Does NOT claim LEGALLY_VERIFIED.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "docs/amendment-chain-research");
const DSGR = join(
  process.cwd(),
  "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility",
);

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const LAYER_KEYS = [
  "SOURCE_ACQUIRED",
  "TEXT_EXTRACTED",
  "AMENDMENT_EFFECT_MODELED",
  "OPERATIVE_STATE_RESOLVED",
  "INDEPENDENTLY_LEGALLY_VERIFIED",
] as const;

describe("phase3 challenger remediation", () => {
  it("eliminates CONMED Seventh MISSING vs ledger ACQUIRED dual truth", () => {
    const manifest = readJson(join(ROOT, "chains/conmed-seventh-eighth/manifest.json"));
    const seventh = manifest.documents.find(
      (d: { docId: string }) => d.docId === "cnmd-seventh-ar",
    );
    expect(seventh.retrievalStatus).toBe("RETRIEVED");
    expect(seventh.accession).toBe("0001193125-21-217426");
    expect(seventh.exhibit).toMatch(/10\.1/);
    expect(seventh.authorityLayerStates.SOURCE_ACQUIRED).toBe(true);
    expect(seventh.authorityLayerStates.INDEPENDENTLY_LEGALLY_VERIFIED).toBe(false);
    expect(seventh.authorityLayerStates.OPERATIVE_STATE_RESOLVED).toBe(false);

    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const acquired = ledger.documents.find(
      (d: { docId: string }) => d.docId === "cnmd-seventh-ar",
    );
    expect(acquired.acquisitionStatus).toBe("ACQUIRED");
    expect(acquired.filename).toBe("d170717dex101.htm");
  });

  it("eliminates Internap orig/Am1–6 MISSING dual truth without claiming full propagation", () => {
    const manifest = readJson(join(ROOT, "chains/internap-2017-credit/manifest.json"));
    const ids = manifest.documents.map((d: { docId: string }) => d.docId);
    expect(ids).toEqual([
      "inap-ca-orig",
      "inap-am1",
      "inap-am2",
      "inap-am3",
      "inap-am4",
      "inap-am5",
      "inap-am6",
      "inap-am7",
    ]);
    for (const d of manifest.documents) {
      expect(d.retrievalStatus).toBe("RETRIEVED");
      expect(d.authorityLayerStates.SOURCE_ACQUIRED).toBe(true);
      expect(d.authorityLayerStates.OPERATIVE_STATE_RESOLVED).toBe(false);
      expect(d.authorityLayerStates.INDEPENDENTLY_LEGALLY_VERIFIED).toBe(false);
    }
    const am7 = manifest.documents.find((d: { docId: string }) => d.docId === "inap-am7");
    expect(am7.authorityLayerStates.AMENDMENT_EFFECT_MODELED).toBe(true);
    const am3 = manifest.documents.find((d: { docId: string }) => d.docId === "inap-am3");
    expect(am3.authorityLayerStates.AMENDMENT_EFFECT_MODELED).toBe(false);

    const ba = readJson(join(ROOT, "before-after/inap-am7-baskets-and-ratios.json"));
    expect(ba.comparisons[0].authority.before.status).toBe("SOURCE_BACKED");
    expect(ba.comparisons[0].beforeText).toMatch(/\$25,000,000/);
    expect(ba.comparisons[0].beforeText).toMatch(/30%/);
    expect(ba.comparisons[1].beforeText).toMatch(/\$15,000,000/);
    expect(ba.comparisons[1].beforeText).toMatch(/18%/);
    expect(ba.propagationDiscipline.completeOperativeStateReconstruction).toBe(false);
    expect(ba.propagationDiscipline.unresolvedDependencies.length).toBeGreaterThan(0);
  });

  it("corrects AZZ defined term to Applicable Rate and includes AZZ in KF export", () => {
    const ba = readJson(join(ROOT, "before-after/azz-am4-applicable-rate.json"));
    expect(ba.comparisons[0].target.definedTerm).toBe("Applicable Rate");
    expect(ba.comparisons[0].authority.quote).toMatch(/Applicable Rate/);
    expect(ba.comparisons[0].authority.quote).toMatch(/Applicable Margin/);

    const vc = readJson(
      join(ROOT, "verification-candidates/VC-005-multi-era-definition-azz-margin.json"),
    );
    expect(vc.definedTerm).toBe("Applicable Rate");
    expect(vc.purpose).toMatch(/Applicable Rate/);
    expect(vc.purpose).toMatch(/Applicable Margin.*non-controlling|colloquial/i);

    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    expect(exp.chainIdentities).toContain("azz-2022-05-13-credit-agreement");
    const am4 = exp.documents.find((d: { researchDocId: string }) => d.researchDocId === "azz-am4");
    expect(am4.acquisitionStatus).toBe("ACQUIRED");
    expect(am4.originalBytesHash).toMatch(/^[a-f0-9]{64}$/);
    expect(am4.definedTermAmended).toBe("Applicable Rate");
    expect(am4.effectiveDateStatus).toBe("CONDITIONAL_UNRESOLVED");
  });

  it("records DSGR $10M before-text from Doc B and keeps Am2 wrapper MISSING", () => {
    const ba = readJson(join(ROOT, "before-after/dsgr-am4-restricted-payments.json"));
    expect(ba.comparisons[0].beforeText).toMatch(/\$10,000,000/);
    expect(ba.comparisons[0].afterText).toMatch(/\$25,000,000/);
    expect(ba.comparisons[0].authority.before.status).toBe("SOURCE_BACKED");
    expect(ba.comparisons[0].authority.status).toBe("SOURCE_BACKED");

    const docB = readFileSync(
      join(DSGR, "extracted-text/doc-b-2024-third-amendment.txt"),
      "utf8",
    );
    expect(docB).toMatch(/not to exceed \$10,000,000/);

    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    const missing = exp.missingAuthority.find(
      (m: { item: string }) => m.item === "dsgr-am2-wrapper-text",
    );
    expect(missing.status).toBe("MISSING_DOCUMENT");
    const tenQ = exp.parentChildAuthorityLinks.find(
      (l: { child?: string }) => l.child === "dsgr-am2-10q",
    );
    expect(tenQ.authorityStatus).toBe("NOT_OPERATIVE");
  });

  it("encodes CONMED Am2 parent instrument as Seventh A&R (Am1 intermediate)", () => {
    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    const link = exp.parentChildAuthorityLinks.find(
      (l: { child?: string; parent?: string }) =>
        (l.child === "cnmd-second-am-2022" || l.child === "cnmd-am2") &&
        l.parent === "cnmd-seventh-ar",
    );
    expect(link).toBeTruthy();
    expect(link.intermediateState).toBe("cnmd-am1-2022");

    const al = readJson(join(ROOT, "authority-layers/cnmd-seventh-ar-to-eighth-ar.json"));
    const am2 = al.events.find(
      (e: { docId: string }) =>
        e.docId === "cnmd-second-am-2022" || e.docId === "cnmd-am2",
    );
    if (am2) {
      expect(am2.parentInstrument || am2.parent).toBe("cnmd-seventh-ar");
    }
  });

  it("keeps authority layers distinct and never claims independent legal verification", () => {
    const manifests = [
      "chains/conmed-seventh-eighth/manifest.json",
      "chains/internap-2017-credit/manifest.json",
      "chains/azz-2022-credit/manifest.json",
    ];
    for (const rel of manifests) {
      const m = readJson(join(ROOT, rel));
      for (const d of m.documents) {
        expect(d.authorityLayerStates).toBeTruthy();
        for (const k of LAYER_KEYS) {
          expect(typeof d.authorityLayerStates[k]).toBe("boolean");
        }
        expect(d.authorityLayerStates.INDEPENDENTLY_LEGALLY_VERIFIED).toBe(false);
      }
    }
  });

  it("preserves CONDITIONAL_UNRESOLVED effective-date discipline in export and scenarios", () => {
    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    expect(exp.verificationStatus).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(exp.importContract.competingProductionSchema).toBe(false);
    const edGaps = exp.missingAuthority.filter((m: { status: string }) =>
      ["CONDITIONAL_UNRESOLVED", "UNRESOLVED_DEPENDENCY", "MISSING_DOCUMENT"].includes(
        m.status,
      ),
    );
    expect(edGaps.length).toBeGreaterThanOrEqual(4);

    for (let i = 1; i <= 8; i++) {
      const spec = readJson(join(ROOT, `test-specs/VC-00${i}-spec.json`));
      expect(spec.sourceAuthorExpectation.notLegalGroundTruth).toBe(true);
      expect(spec.independentlyReviewedLegalGroundTruth.status).toBe(
        "PENDING_INDEPENDENT_REVIEW",
      );
    }
  });

  it("negative controls: wrong-parent, era overlay, 10-Q≠operative, waiver≠amendment retained", () => {
    const proofs = readJson(join(ROOT, "wrong-parent-proofs/proofs.json"));
    const ids = proofs.proofs.map((p: { id: string }) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(["WP-002", "WP-003", "WP-005", "WP-006", "WP-008"]),
    );
    const wp003 = proofs.proofs.find((p: { id: string }) => p.id === "WP-003");
    expect(wp003.evidence.wrongBehavior).toMatch(/\$25M/);

    const vc007 = readJson(
      join(ROOT, "verification-candidates/VC-007-waiver-vs-amendment-separation.json"),
    );
    expect(JSON.stringify(vc007)).toMatch(/waiver/i);

    const scenarios = readJson(join(ROOT, "as-of-scenarios/all-chains.json"));
    const dsgr = scenarios.chains["dsgr-2022-04-01-ar-credit"];
    expect(
      dsgr.some(
        (s: { status?: string }) =>
          String(s.status).includes("MISSING_WRAPPER") ||
          String(s.status).includes("REVIEW_REQUIRED"),
      ),
    ).toBe(true);
  });

  it("phase3 handoff artifact exists for independent re-review", () => {
    const handoffPath = join(
      ROOT,
      "independent-review-handoff/PHASE3-REMEDIATION-HANDOFF.json",
    );
    expect(existsSync(handoffPath)).toBe(true);
    const h = readJson(handoffPath);
    expect(h.startingShaReviewedByChallenger).toBe(
      "ce07b1525972d1dea00792a2058900fa56291163",
    );
    expect(h.promotionStatus).toBe("NOT_INDEPENDENTLY_LEGALLY_VERIFIED");
    expect(h.challengerPr).toBe(156);
    expect(h.researchPr).toBe(150);
  });
});
