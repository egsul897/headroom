/**
 * SEC corpus acceptance: substantive relevance and source-byte identity are decided separately;
 * non-financing exhibits are quarantined, never counted as financing precedents; hash drift is
 * UNRECONCILED, not corruption and not confirmation.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideCorpusAcceptance, decideSourceByteIdentity } from "../../lib/knowledge-factory/mass-precedent/corpus-acceptance";
import { isQuarantinedByMetadata, isSubstantiveFinancingPrecedent } from "../../lib/product/covenant-intelligence/corpus-quality";

const row = (over: Partial<Parameters<typeof decideCorpusAcceptance>[0]["source"]>) => ({
  sourceId: "edgar:0000000000-26-000001:x.htm", documentTitle: "x.htm", documentClass: "UNKNOWN", exhibitFilename: "x.htm", provenance: "sec-edgar", issuerName: "Issuer", byteSize: 50_000, ...over,
});

describe("source-byte identity", () => {
  it("matches, no manifest hash, or unreconciled drift — never 'corrupt'", () => {
    expect(decideSourceByteIdentity({ manifestHash: "a", fetchedHash: "a" })).toBe("MATCHES_MANIFEST");
    expect(decideSourceByteIdentity({ manifestHash: "a", fetchedHash: "b", clientHash: "a" })).toBe("MATCHES_MANIFEST");
    expect(decideSourceByteIdentity({ manifestHash: null, fetchedHash: "b" })).toBe("NO_MANIFEST_HASH");
    expect(decideSourceByteIdentity({ manifestHash: "a", fetchedHash: "b", clientHash: "b" })).toBe("UNRECONCILED_MANIFEST_DRIFT");
  });
  it("drift is disclosed on an accepted financing document; it does not change substantive acceptance", () => {
    const a = decideCorpusAcceptance({ source: row({ documentClass: "CREDIT_AGREEMENT", documentTitle: "Credit Agreement" }), manifestHash: "m", fetchedHash: "f" });
    expect(a).toMatchObject({ corpusRole: "SUBSTANTIVE_FINANCING", sourceByteIdentity: "UNRECONCILED_MANIFEST_DRIFT", countsAsFinancingPrecedent: true });
  });
});

describe("substantive relevance", () => {
  it("accepts financing instruments by class or financing title", () => {
    for (const s of [
      row({ documentClass: "CREDIT_AGREEMENT", documentTitle: "Credit Agreement" }),
      row({ documentClass: "INDENTURE", documentTitle: "Indenture dated as of" }),
      row({ documentClass: "UNKNOWN", documentTitle: "Third Amended and Restated Term Loan Credit Agreement", exhibitFilename: "ex10-1.htm" }),
    ]) expect(decideCorpusAcceptance({ source: s, manifestHash: null, fetchedHash: "f" }).corpusRole).toBe("SUBSTANTIVE_FINANCING");
  });
  it("quarantines unrelated Exhibit 10s and non-exhibit bodies: compensation plans, severance, charter amendments, auditor consents, tiny unknowns", () => {
    for (const s of [
      row({ exhibitFilename: "panwex104q417esppplan.htm", documentTitle: "panwex104q417esppplan.htm" }),
      row({ exhibitFilename: "executiveseveranceandreten.htm", documentTitle: "executiveseveranceandreten.htm" }),
      row({ exhibitFilename: "ex-1023amendedgmexecutives.htm", documentTitle: "Amended and Restated Executive Severance Plan" }),
      row({ exhibitFilename: "certificateofamendment-bxe.htm", documentTitle: "Certificate of Amendment" }),
      row({ exhibitFilename: "ex23-12312024.htm", documentTitle: "Consent of Independent Registered Public Accounting Firm", documentClass: "CONSENT" }),
      row({ exhibitFilename: "delta_8k-ex0401.htm", documentTitle: "delta_8k-ex0401.htm", byteSize: 2_000 }),
    ]) {
      const a = decideCorpusAcceptance({ source: s, manifestHash: null, fetchedHash: "f" });
      expect(a, s.exhibitFilename).toMatchObject({ corpusRole: "QUARANTINED_NON_FINANCING", countsAsFinancingPrecedent: false });
    }
  });
  it("an uninformative filename is rescued only by a financing instrument named in the document's own opening text", () => {
    const uninformative = row({ exhibitFilename: "ex10-1.htm", documentTitle: "ex10-1.htm" });
    const credit = "EXHIBIT 10.1  EXECUTION VERSION  AMENDED AND RESTATED CREDIT AGREEMENT dated as of June 16, 2025 among the Borrower, the Lenders party hereto ...";
    const espp = "EXHIBIT 10.1  2017 EMPLOYEE STOCK PURCHASE PLAN  1. Purpose. The purpose of the Plan is to provide employees ... credit agreement is not mentioned here except as a defined term reference";
    expect(decideCorpusAcceptance({ source: uninformative, manifestHash: null, fetchedHash: "f", bodyHeadSample: credit })).toMatchObject({ corpusRole: "SUBSTANTIVE_FINANCING" });
    expect(decideCorpusAcceptance({ source: uninformative, manifestHash: null, fetchedHash: "f", bodyHeadSample: espp })).toMatchObject({ corpusRole: "QUARANTINED_NON_FINANCING" });
    expect(decideCorpusAcceptance({ source: uninformative, manifestHash: null, fetchedHash: "f", bodyHeadSample: null })).toMatchObject({ corpusRole: "QUARANTINED_NON_FINANCING" });
    expect(decideCorpusAcceptance({ source: { ...uninformative, byteSize: 2_000 }, manifestHash: null, fetchedHash: "f", bodyHeadSample: credit })).toMatchObject({ corpusRole: "QUARANTINED_NON_FINANCING" });
  });
  it("an explicit quarantine marker in persisted metadata excludes a row from retrieval even when its title would pass", () => {
    expect(isQuarantinedByMetadata({ corpusRole: "QUARANTINED_NON_FINANCING" })).toBe(true);
    expect(isQuarantinedByMetadata({ corpusRole: "SUBSTANTIVE_FINANCING" })).toBe(false);
    expect(isQuarantinedByMetadata(null)).toBe(false);
    expect(isSubstantiveFinancingPrecedent({ ...row({ documentClass: "CREDIT_AGREEMENT", documentTitle: "Credit Agreement" }), metadata: { corpusRole: "QUARANTINED_NON_FINANCING" } })).toBe(false);
  });
});

describe("the 2026-10-09 SEC batch as recorded (data-driven, read-only)", () => {
  it("documents that are not financing instruments were persisted and counted; the rule now quarantines them", () => {
    const result = JSON.parse(readFileSync("docs/knowledge-factory/mass-precedent/sec-batch-result.json", "utf8")) as { persisted: number; hashMismatchesRecorded: number; persistedSourceIds: string[] };
    const index = JSON.parse(readFileSync("docs/knowledge-factory/mass-precedent/retrieval-index.json", "utf8")) as { entries: Array<{ sourceId: string; documentClass: string; documentTitle: string; byteSize?: number }> };
    const byId = new Map(index.entries.map((e) => [e.sourceId, e]));
    const knownNonFinancing = ["panwex104q417esppplan.htm", "ex-1023amendedgmexecutives.htm", "certificateofamendment-bxe.htm"];
    for (const needle of knownNonFinancing) {
      const sid = result.persistedSourceIds.find((s) => s.endsWith(needle))!;
      expect(sid, needle).toBeDefined();
      const e = byId.get(sid);
      const role = decideCorpusAcceptance({ source: { sourceId: sid, documentTitle: e?.documentTitle ?? needle, documentClass: e?.documentClass ?? "UNKNOWN", exhibitFilename: needle, provenance: "sec-edgar", byteSize: e?.byteSize ?? 50_000 }, manifestHash: "m", fetchedHash: "f" });
      expect(role.corpusRole, needle).toBe("QUARANTINED_NON_FINANCING");
    }
    // Every persisted document drifted from its manifest hash: identity is unreconciled for all 39, not confirmed.
    expect(result.hashMismatchesRecorded).toBe(result.persisted);
  });
});
