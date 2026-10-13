/**
 * debt-intelligence must not attach Coherent/Matthews EBITDA evidence by numeric
 * or as-of-only match. Production path: loadDebtIntelligenceDashboard →
 * bindContractualEbitdaEvidenceByIdentity (same binder as Simulate).
 */
import { describe, expect, it } from "vitest";
import { bindContractualEbitdaEvidenceByIdentity } from "@/lib/product/cross-domain-simulate";
import {
  COHERENT_EBITDA_EVIDENCE,
  MATTHEWS_EBITDA_EVIDENCE,
} from "@/lib/financial-certificate-engine";

describe("debt-intelligence / shared binder — identity, not numeric EBITDA", () => {
  it("identical EBITDA magnitude does not bind foreign company evidence", () => {
    const coherentMm = COHERENT_EBITDA_EVIDENCE.bindingContractualEbitdaMillions;
    expect(coherentMm).toBe(1700);
    // Unrelated company presenting Coherent's figure + Coherent as-of + Coherent docs
    // but wrong companyId must fail closed.
    const r = bindContractualEbitdaEvidenceByIdentity({
      companyId: "foreign-issuer",
      documentIds: COHERENT_EBITDA_EVIDENCE.bindingIdentity!.documentIds,
      evaluationDate: COHERENT_EBITDA_EVIDENCE.bindingIdentity!.asOfDate,
    });
    expect(r.matched).toBeNull();
    expect(r.derivation).toBeNull();
    expect(r.refusalReason).toMatch(/no package matches|fail closed|numeric EBITDA/i);
  });

  it("two unrelated companies with the same numerical EBITDA never inherit each other's packages", () => {
    const coherentEbitda = COHERENT_EBITDA_EVIDENCE.bindingContractualEbitdaMillions;
    const matthewsId = MATTHEWS_EBITDA_EVIDENCE.bindingIdentity!;
    // Matthews companyId + docs + as-of, while "presenting" Coherent's dollar figure in financials
    // (figure is not an input to the binder — prove binder ignores magnitude entirely).
    void coherentEbitda;
    const matthewsBound = bindContractualEbitdaEvidenceByIdentity({
      companyId: matthewsId.companyId,
      documentIds: matthewsId.documentIds,
      evaluationDate: matthewsId.asOfDate,
    });
    expect(matthewsBound.matched).toBe(MATTHEWS_EBITDA_EVIDENCE);
    expect(matthewsBound.matched?.bindingContractualEbitdaMillions).not.toBe(coherentEbitda);

    // Same Coherent dollar amount with Matthews docs but wrong company → refuse
    const spoof = bindContractualEbitdaEvidenceByIdentity({
      companyId: "coherent-lookalike",
      documentIds: matthewsId.documentIds,
      evaluationDate: matthewsId.asOfDate,
    });
    expect(spoof.derivation).toBeNull();
    expect(spoof.matched).toBeNull();
  });

  it("mismatched sourceVersionId fails closed (never falls back to numeric/as-of)", () => {
    const id = COHERENT_EBITDA_EVIDENCE.bindingIdentity!;
    const ok = bindContractualEbitdaEvidenceByIdentity({
      companyId: id.companyId,
      documentIds: id.documentIds,
      evaluationDate: id.asOfDate,
      sourceVersionId: id.sourceVersionId,
    });
    expect(ok.matched).toBe(COHERENT_EBITDA_EVIDENCE);

    const stale = bindContractualEbitdaEvidenceByIdentity({
      companyId: id.companyId,
      documentIds: id.documentIds,
      evaluationDate: id.asOfDate,
      sourceVersionId: "fixture:coherent-ebitda-evidence.STALE",
    });
    expect(stale.matched).toBeNull();
    expect(stale.derivation).toBeNull();
    expect(stale.refusalReason).toMatch(/no package matches|fail closed|numeric EBITDA/i);
  });

  it("stale as-of / mismatched snapshot identity fails closed", () => {
    const id = COHERENT_EBITDA_EVIDENCE.bindingIdentity!;
    const staleAsOf = bindContractualEbitdaEvidenceByIdentity({
      companyId: id.companyId,
      documentIds: id.documentIds,
      evaluationDate: "2099-01-01",
    });
    expect(staleAsOf.derivation).toBeNull();

    const wrongSnap = bindContractualEbitdaEvidenceByIdentity({
      companyId: id.companyId,
      documentIds: id.documentIds,
      evaluationDate: id.asOfDate,
      financialSnapshotId: "snap-not-bound-to-package",
    });
    expect(wrongSnap.derivation).toBeNull();
  });

  it("Matthews identity binds Matthews evidence; Coherent docs do not", () => {
    const ok = bindContractualEbitdaEvidenceByIdentity({
      companyId: "matthews",
      documentIds: MATTHEWS_EBITDA_EVIDENCE.bindingIdentity!.documentIds,
      evaluationDate: MATTHEWS_EBITDA_EVIDENCE.bindingIdentity!.asOfDate,
    });
    expect(ok.matched).toBe(MATTHEWS_EBITDA_EVIDENCE);
    expect(ok.derivation).not.toBeNull();

    const wrongDocs = bindContractualEbitdaEvidenceByIdentity({
      companyId: "matthews",
      documentIds: COHERENT_EBITDA_EVIDENCE.bindingIdentity!.documentIds,
      evaluationDate: MATTHEWS_EBITDA_EVIDENCE.bindingIdentity!.asOfDate,
    });
    expect(wrongDocs.derivation).toBeNull();
  });

  it("as-of alone never selects evidence without company+document identity", () => {
    const r = bindContractualEbitdaEvidenceByIdentity({
      companyId: "",
      documentIds: COHERENT_EBITDA_EVIDENCE.bindingIdentity!.documentIds,
      evaluationDate: COHERENT_EBITDA_EVIDENCE.bindingIdentity!.asOfDate,
    });
    expect(r.derivation).toBeNull();
    expect(r.refusalReason).toMatch(/company identity missing/);
  });
});
