/**
 * Independent legal-challenger integrity checks for amendment-chain research.
 *
 * Does NOT edit or depend on flipping source-author expectations / ground-truth
 * fields in docs/amendment-chain-research/test-specs/. Those remain
 * PENDING_INDEPENDENT_REVIEW by design until research remediates AMBIGUOUS items.
 *
 * Challenger dispositions live in:
 *   docs/amendment-chain-legal-challenge/
 */
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "docs/amendment-chain-research");
const CHALLENGE = join(process.cwd(), "docs/amendment-chain-legal-challenge");
const CONMED = join(
  process.cwd(),
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility",
);
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

describe("independent amendment-chain legal challenger", () => {
  it("records dispositions without promoting source-author expectations", () => {
    const verdicts = readJson(join(CHALLENGE, "vc-verdicts.json"));
    expect(verdicts.reviewedSha).toBe(
      "ce07b1525972d1dea00792a2058900fa56291163",
    );
    expect(verdicts.promotionStatus).toBe("NOT_INDEPENDENTLY_LEGALLY_VERIFIED");
    expect(verdicts.sourceAuthorExpectationsEdited).toBe(false);
    expect(verdicts.frozenCertificationEvidenceEdited).toBe(false);

    const expected = {
      "VC-001": "PASS",
      "VC-002": "PASS",
      "VC-003": "PASS",
      "VC-004": "PASS",
      "VC-005": "AMBIGUOUS",
      "VC-006": "PASS",
      "VC-007": "PASS",
      "VC-008": "AMBIGUOUS",
    } as const;
    for (const [id, v] of Object.entries(expected)) {
      expect(verdicts.verdicts[id].verdict).toBe(v);
    }

    // Research test-specs must still separate expectations from ground truth
    for (let i = 1; i <= 8; i++) {
      const spec = readJson(join(ROOT, `test-specs/VC-00${i}-spec.json`));
      expect(spec.sourceAuthorExpectation.notLegalGroundTruth).toBe(true);
      expect(spec.independentlyReviewedLegalGroundTruth.status).toBe(
        "PENDING_INDEPENDENT_REVIEW",
      );
    }
  });

  it("flags AZZ absence from Knowledge Factory export as integration risk", () => {
    const exp = readJson(
      join(ROOT, "knowledge-factory-export/amendment-chains-export.json"),
    );
    expect(exp.importContract.competingProductionSchema).toBe(false);
    expect(exp.verificationStatus).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(exp.chainIdentities).not.toContain("azz-2022-05-13-credit-agreement");
    const azzDocs = exp.documents.filter(
      (d: { instrumentIdentity?: string; researchDocId?: string }) =>
        String(d.instrumentIdentity || "").includes("azz") ||
        String(d.researchDocId || "").includes("azz"),
    );
    expect(azzDocs.length).toBe(0);
  });

  it("preserves DSGR Am2 wrapper gap and non-operative 10-Q tagging", () => {
    const exp = readJson(
      join(ROOT, "knowledge-factory-export/amendment-chains-export.json"),
    );
    const missing = exp.missingAuthority.find(
      (m: { item: string }) => m.item === "dsgr-am2-wrapper-text",
    );
    expect(missing?.status).toBe("MISSING_DOCUMENT");

    const tenQLink = exp.parentChildAuthorityLinks.find(
      (l: { kind?: string; child?: string }) =>
        l.kind === "FILING_BODY_FOR" || l.child === "dsgr-am2-10q",
    );
    expect(tenQLink?.authorityStatus).toBe("NOT_OPERATIVE");

    const docC = readFileSync(
      join(DSGR, "extracted-text/doc-c-2025-fourth-amendment.txt"),
      "utf8",
    );
    expect(docC).toMatch(/deemed effect[\s\S]{0,80}January 1/);
    expect(docC).toMatch(/shall not operate as a waiver/);

    const docB = readFileSync(
      join(DSGR, "extracted-text/doc-b-2024-third-amendment.txt"),
      "utf8",
    );
    expect(docB).toMatch(/not to exceed \$10,000,000/);
    expect(docB).toMatch(/shall not operate as a waiver/);
  });

  it("confirms CONMED Am2 targets Seventh A&R cash-netting tokens (WP-003)", () => {
    const am2 = readFileSync(
      join(CONMED, "curated/second-amendment-2022-full.txt"),
      "utf8",
    );
    expect(am2).toMatch(/Seventh Amended and Restated Credit Agreement/);
    expect(am2).toMatch(/\$75,000,000/);
    expect(am2).toMatch(/\$100,000,000/);

    const cash = readJson(
      join(ROOT, "before-after/cnmd-am1-am2-cash-netting-chain.json"),
    );
    const timeline = cash.comparisons[0].timeline;
    expect(timeline[0].text).toMatch(/\$25,000,000/);
    expect(timeline[1].authority.quote).toMatch(/\$25,000,000/);
    expect(timeline[1].authority.quote).toMatch(/\$75,000,000/);
    expect(timeline[2].authority.quote).toMatch(/\$75,000,000/);
    expect(timeline[2].authority.quote).toMatch(/\$100,000,000/);

    const proofs = readJson(join(ROOT, "wrong-parent-proofs/proofs.json"));
    const wp003 = proofs.proofs.find((p: { id: string }) => p.id === "WP-003");
    expect(wp003.evidence.wrongBehavior).toMatch(/\$25M/);
  });

  it("confirms Omnibus curated requires fail-closed without blackline exhibits", () => {
    const omn = readFileSync(
      join(CONMED, "curated/first-omnibus-amendment-2026-curated.txt"),
      "utf8",
    );
    expect(omn).toMatch(/Term A-2 Commitments/);
    expect(omn).toMatch(/Exhibit A/);
    expect(omn).toMatch(/intentionally excluded from this fixture/i);

    const vc006 = readJson(
      join(ROOT, "verification-candidates/VC-006-omnibus-incorporation-cnmd.json"),
    );
    expect(vc006.expectedFailClosedBehavior).toMatch(/fail closed|REVIEW_REQUIRED/i);
  });

  it("detects AZZ defined-term mislabel Applicable Margin vs Applicable Rate", () => {
    const ba = readJson(
      join(ROOT, "before-after/azz-am4-applicable-margin.json"),
    );
    expect(ba.comparisons[0].target.definedTerm).toBe("Applicable Margin");
    const vc = readJson(
      join(
        ROOT,
        "verification-candidates/VC-005-multi-era-definition-azz-margin.json",
      ),
    );
    expect(vc.purpose).toMatch(/Applicable Margin/);
    // Challenger disposition for this defect
    const verdicts = readJson(join(CHALLENGE, "vc-verdicts.json"));
    expect(verdicts.verdicts["VC-005"].verdict).toBe("AMBIGUOUS");
  });

  it("detects Internap before-after still claiming MISSING while ledger acquired orig", () => {
    const ba = readJson(
      join(ROOT, "before-after/inap-am7-baskets-and-ratios.json"),
    );
    const before = ba.comparisons[0].authority.before;
    expect(before.status).toBe("UNRESOLVED_AUTHORITY");

    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const orig = ledger.documents.find(
      (d: { docId: string }) => d.docId === "inap-ca-orig",
    );
    expect(orig.acquisitionStatus).toBe("ACQUIRED");
    expect(orig.sha256).toMatch(/^[a-f0-9]{64}$/);

    const manifest = readJson(
      join(ROOT, "chains/internap-2017-credit/manifest.json"),
    );
    const manifestOrig = manifest.documents.find(
      (d: { docId: string }) => d.docId === "inap-ca-orig",
    );
    // Stale Phase-1 MISSING — challenger flags dual truth
    expect(manifestOrig.retrievalStatus).toBe("MISSING");

    const verdicts = readJson(join(CHALLENGE, "vc-verdicts.json"));
    expect(verdicts.verdicts["VC-008"].verdict).toBe("AMBIGUOUS");
  });

  it("confirms CONMED Seventh manifest MISSING conflicts with ledger ACQUIRED", () => {
    const manifest = readJson(
      join(ROOT, "chains/conmed-seventh-eighth/manifest.json"),
    );
    const seventh = manifest.documents.find(
      (d: { docId: string }) => d.docId === "cnmd-seventh-ar",
    );
    expect(seventh.retrievalStatus).toBe("MISSING");

    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const acquired = ledger.documents.find(
      (d: { docId: string }) => d.docId === "cnmd-seventh-ar",
    );
    expect(acquired.acquisitionStatus).toBe("ACQUIRED");
    expect(acquired.filename).toBe("d170717dex101.htm");
  });

  it("hashes CONMED fixture raw Am2 when present (representative source identity)", () => {
    const raw = join(
      CONMED,
      "raw-source/ex10-2-second-amendment-2022-08-02.htm",
    );
    if (!existsSync(raw)) return;
    const hash = sha256File(raw);
    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const am2 = ledger.documents.find(
      (d: { docId: string }) => d.docId === "cnmd-second-am-2022",
    );
    expect(am2.sha256).toBe(hash);
  });

  it("challenge report exists and boxes mandatory return topics", () => {
    const report = readFileSync(
      join(CHALLENGE, "INDEPENDENT-CHALLENGE-REPORT.md"),
      "utf8",
    );
    expect(report).toMatch(/ce07b1525972d1dea00792a2058900fa56291163/);
    expect(report).toMatch(/NOT INDEPENDENTLY LEGALLY VERIFIED/);
    for (const n of [
      "Source completeness",
      "VC-001",
      "VC-008",
      "wrong-parent",
      "Effective-date",
      "Missing operative",
      "Export integration",
      "Test results",
      "Blocking defects",
    ]) {
      expect(report.toLowerCase()).toContain(n.toLowerCase());
    }
  });
});
