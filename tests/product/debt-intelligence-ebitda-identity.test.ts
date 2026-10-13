/**
 * debt-intelligence must not attach Coherent/Matthews EBITDA evidence by numeric match.
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
    const matthewsAsOf = MATTHEWS_EBITDA_EVIDENCE.bindingIdentity!.asOfDate;
    // Unrelated company presenting Coherent's figure + Matthews as-of must fail closed.
    const r = bindContractualEbitdaEvidenceByIdentity({
      companyId: "foreign-issuer",
      documentIds: MATTHEWS_EBITDA_EVIDENCE.bindingIdentity!.documentIds,
      evaluationDate: matthewsAsOf,
    });
    expect(r.derivation).toBeNull();
    expect(r.refusalReason).toMatch(/no package matches|fail closed|numeric EBITDA/i);
    void coherentMm;
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
});
