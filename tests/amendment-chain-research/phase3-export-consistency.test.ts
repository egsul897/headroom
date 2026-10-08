/**
 * Phase 3 export consistency checks for amendment-chain research.
 *
 * Fails when contradictory authoritative metadata would mislead a downstream
 * Knowledge Factory consumer. Does NOT edit challenger PR #156, Claude-owned
 * fixtures, frozen certification evidence, or production legal-rule code.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "docs/amendment-chain-research");

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const HASHED_STATUSES = new Set([
  "ACQUIRED",
  "ACQUIRED_CONFORMED_EXHIBIT_A",
  "FIXTURE_RAW_PRESENT",
]);

describe("amendment-chain-research phase3 export consistency", () => {
  it("ledger and export agree on hashed document identity", () => {
    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    const exportById = new Map(
      exp.documents.map((d: { researchDocId: string }) => [d.researchDocId, d]),
    );

    for (const d of ledger.documents) {
      if (!HASHED_STATUSES.has(d.acquisitionStatus) && !String(d.acquisitionStatus).startsWith("ACQUIRED")) {
        continue;
      }
      if (!d.sha256) continue;
      const exported = exportById.get(d.docId) as
        | {
            accessionNumber: string;
            filename: string;
            originalBytesHash: string | null;
            instrumentIdentity: string;
            acquisitionStatus: string;
          }
        | undefined;
      expect(exported, `export missing ledger doc ${d.docId}`).toBeTruthy();
      expect(exported!.accessionNumber).toBe(d.accession);
      expect(exported!.filename).toBe(d.filename);
      expect(exported!.instrumentIdentity).toBe(d.chainId);
      expect(exported!.originalBytesHash).toBe(d.sha256);
    }
  });

  it("rejects stale MISSING manifests for ledger-acquired bodies", () => {
    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const acquired = new Set(
      ledger.documents
        .filter((d: { acquisitionStatus: string }) =>
          String(d.acquisitionStatus).startsWith("ACQUIRED") ||
          d.acquisitionStatus === "FIXTURE_RAW_PRESENT",
        )
        .map((d: { docId: string }) => d.docId),
    );

    const manifests = [
      join(ROOT, "chains/conmed-seventh-eighth/manifest.json"),
      join(ROOT, "chains/internap-2017-credit/manifest.json"),
      join(ROOT, "chains/azz-2022-credit/manifest.json"),
      join(ROOT, "chains/matthews-2020-third-ar/manifest.json"),
      join(ROOT, "chains/coherent-2022-credit/manifest.json"),
      join(ROOT, "chains/dsgr-2022-credit/manifest.json"),
    ];

    for (const path of manifests) {
      if (!existsSync(path)) continue;
      const manifest = readJson(path);
      for (const doc of manifest.documents) {
        if (acquired.has(doc.docId)) {
          expect(
            doc.retrievalStatus,
            `${manifest.chainId}/${doc.docId} stale MISSING despite ledger acquire`,
          ).not.toBe("MISSING");
        }
      }
    }

    // Explicit challenger defects
    const cnmd = readJson(join(ROOT, "chains/conmed-seventh-eighth/manifest.json"));
    const seventh = cnmd.documents.find((d: { docId: string }) => d.docId === "cnmd-seventh-ar");
    expect(seventh.retrievalStatus).toBe("BODY_ACQUIRED");
    expect(seventh.modelingStatus.bodyAcquired).toBe(true);
    expect(seventh.modelingStatus.amendmentEffectApplied).toBe(false);
    expect(seventh.modelingStatus.independentlyLegallyVerified).toBe(false);

    const inap = readJson(join(ROOT, "chains/internap-2017-credit/manifest.json"));
    for (const id of [
      "inap-ca-orig",
      "inap-am1",
      "inap-am2",
      "inap-am3",
      "inap-am4",
      "inap-am5",
      "inap-am6",
      "inap-am7",
    ]) {
      const doc = inap.documents.find((d: { docId: string }) => d.docId === id);
      expect(doc, id).toBeTruthy();
      expect(doc.retrievalStatus).toBe("BODY_ACQUIRED");
      expect(doc.modelingStatus.amendmentEffectApplied).toBe(false);
      expect(doc.modelingStatus.independentlyLegallyVerified).toBe(false);
    }
  });

  it("export includes AZZ chain identity and Applicable Rate (not Margin) evidence", () => {
    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    expect(exp.chainIdentities).toContain("azz-2022-05-13-credit-agreement");
    const azzDocs = exp.documents.filter(
      (d: { instrumentIdentity: string }) =>
        d.instrumentIdentity === "azz-2022-05-13-credit-agreement",
    );
    expect(azzDocs.map((d: { researchDocId: string }) => d.researchDocId).sort()).toEqual([
      "azz-am1",
      "azz-am2",
      "azz-am3",
      "azz-am4",
      "azz-ca-orig",
    ]);

    const ba = readJson(join(ROOT, "before-after/azz-am4-applicable-rate.json"));
    expect(ba.comparisons[0].target.definedTerm).toBe("Applicable Rate");
    expect(ba.comparisons[0].authority.quote).toMatch(/Applicable Rate/);
    expect(existsSync(join(ROOT, "before-after/azz-am4-applicable-margin.json"))).toBe(false);

    const vc = readJson(
      join(ROOT, "verification-candidates/VC-005-multi-era-definition-azz-rate.json"),
    );
    expect(vc.purpose).toMatch(/Applicable Rate/);
    expect(vc.purpose).not.toMatch(/Applicable Margin definition/);
  });

  it("CONMED Am2 parent link targets Seventh A&R instrument with post-Am1 intermediate state", () => {
    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    const am2 = exp.parentChildAuthorityLinks.find(
      (l: { confidenceDocIds?: { child?: string } }) =>
        l.confidenceDocIds?.child === "cnmd-second-am-2022",
    );
    expect(am2).toBeTruthy();
    expect(am2.confidenceDocIds.parent).toBe("cnmd-seventh-ar");
    expect(am2.targetId).toContain("d170717dex101.htm");
    expect(am2.confidenceDocIds.requiredIntermediateState).toBe("post-cnmd-am1-2022");
    expect(am2.confidenceEffectiveDate.status).toBe("CONDITIONAL_UNRESOLVED");
    expect(am2.confidenceEffectiveDate.conditionsVerified).toBe(false);
  });

  it("preserves CONDITIONAL_UNRESOLVED effective dates across export links", () => {
    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    for (const link of exp.parentChildAuthorityLinks) {
      const ed = link.confidenceEffectiveDate;
      if (!ed || typeof ed !== "object") continue;
      if (ed.status === "CONDITIONAL_UNRESOLVED") {
        expect(ed.conditionsVerified, JSON.stringify(link.confidenceDocIds)).toBe(false);
      }
      // Never silently mark satisfied from execution/filing alone
      expect(ed.status).not.toBe("SATISFIED_FROM_EXECUTION_DATE");
      expect(ed.status).not.toBe("SATISFIED_FROM_FILING_DATE");
    }
    expect(exp.verificationStatus).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(exp.phase3Remediation.promotedToIndependentlyLegallyVerified).toBe(false);
    expect(exp.phase3Remediation.failClosedEffectivenessPreserved).toBe(true);
  });

  it("Internap before-after uses orig CA SOURCE_BACKED before-text, not 8-K-only UNRESOLVED", () => {
    const ba = readJson(join(ROOT, "before-after/inap-am7-baskets-and-ratios.json"));
    const inv = ba.comparisons.find(
      (c: { target: { sectionRef: string } }) => c.target.sectionRef === "6.04(m)",
    );
    expect(inv.authority.before.status).toBe("SOURCE_BACKED");
    expect(inv.authority.before.accession).toBe("0001571049-17-003250");
    expect(inv.beforeText).toMatch(/\$25,000,000/);
    expect(inv.beforeText).toMatch(/30%/);
    expect(inv.authority.before.scopeNote).toMatch(/Am1–Am6 propagation/);

    const debt = ba.comparisons.find(
      (c: { target: { sectionRef: string } }) => c.target.sectionRef === "6.01(k)",
    );
    expect(debt.authority.before.status).toBe("SOURCE_BACKED");
    expect(debt.beforeText).toMatch(/\$15,000,000/);

    const ua = readJson(join(ROOT, "chains/internap-2017-credit/unresolved-authority.json"));
    const prop = ua.cases.find((c: { id: string }) => c.id === "inap-ua-1");
    expect(prop.status).toBe("UNRESOLVED_EFFECT_APPLICATION");
  });

  it("DSGR Am4 before-text is $10M SOURCE_BACKED and Am2 wrapper remains MISSING", () => {
    const ba = readJson(join(ROOT, "before-after/dsgr-am4-restricted-payments.json"));
    expect(ba.comparisons[0].beforeText).toMatch(/\$10,000,000/);
    expect(ba.comparisons[0].authority.before.status).toBe("SOURCE_BACKED");
    expect(ba.comparisons[0].authority.before.docId).toBe("dsgr-doc-b");

    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    const missing = exp.missingAuthority.find(
      (m: { item: string }) => m.item === "dsgr-am2-wrapper-text",
    );
    expect(missing.status).toBe("MISSING_DOCUMENT");
    const tenQ = exp.parentChildAuthorityLinks.find(
      (l: { child?: string; kind?: string }) =>
        l.kind === "FILING_BODY_FOR" || l.child === "dsgr-am2-10q",
    );
    expect(tenQ.authorityStatus).toBe("NOT_OPERATIVE");
  });

  it("export chainIdentities cover every VC chain", () => {
    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    const vcDir = join(ROOT, "verification-candidates");
    const files = readdirSync(vcDir).filter((f) => /^VC-00[1-8]-/.test(f));
    expect(files.length).toBe(8);
    const vcChains = new Set<string>();
    for (const f of files) {
      const vc = readJson(join(vcDir, f));
      vcChains.add(vc.chainId);
    }
    for (const chainId of vcChains) {
      expect(exp.chainIdentities, chainId).toContain(chainId);
    }
  });

  it("modelingStatus never claims independent legal verification", () => {
    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    for (const d of exp.documents) {
      if (d.modelingStatus) {
        expect(d.modelingStatus.independentlyLegallyVerified).toBe(false);
        expect(d.modelingStatus.amendmentEffectApplied).toBe(false);
      }
    }
    for (let i = 1; i <= 8; i++) {
      const spec = readJson(join(ROOT, `test-specs/VC-00${i}-spec.json`));
      expect(spec.independentlyReviewedLegalGroundTruth.status).toBe(
        "PENDING_INDEPENDENT_REVIEW",
      );
      expect(spec.sourceAuthorExpectation.notLegalGroundTruth).toBe(true);
    }
  });
});
