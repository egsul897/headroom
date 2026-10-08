/**
 * Research-corpus integrity tests for amendment-chain Phase 2.
 * Does NOT touch Claude-owned acceptance fixtures or production amendment engine.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "docs/amendment-chain-research");

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("amendment-chain-research phase2 corpus", () => {
  it("acquisition ledger records hashes and does not claim a competing registry", () => {
    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    expect(ledger.competingRegistryCreated).toBe(false);
    expect(ledger.acquisitionMethod).toMatch(/EdgarConnector/);
    expect(ledger.documents.length).toBeGreaterThanOrEqual(20);
    for (const d of ledger.documents) {
      if (d.acquisitionStatus === "FAILED") continue;
      expect(d.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(d.accession).toBeTruthy();
      expect(d.sourceUri).toMatch(/^https:\/\/www\.sec\.gov\//);
    }
  });

  it("CONMED Seventh A&R is EX-10.1 not the GCA fifth amendment", () => {
    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const seventh = ledger.documents.find((d: { docId: string }) => d.docId === "cnmd-seventh-ar");
    expect(seventh.filename).toBe("d170717dex101.htm");
    expect(seventh.title).toMatch(/Seventh Amended and Restated Credit Agreement/);
  });

  it("test specs separate source-author expectations from independent ground truth", () => {
    for (let i = 1; i <= 8; i++) {
      const id = `VC-00${i}`;
      const spec = readJson(join(ROOT, `test-specs/${id}-spec.json`));
      expect(spec.sourceAuthorExpectation.notLegalGroundTruth).toBe(true);
      expect(spec.independentlyReviewedLegalGroundTruth.status).toBe("PENDING_INDEPENDENT_REVIEW");
      expect(spec.notAProductionPatch).toBe(true);
      expect(spec.replay.claudeOwnedFixturesTouched).toBe(false);
    }
  });

  it("as-of scenarios and wrong-parent proofs exist", () => {
    const scenarios = readJson(join(ROOT, "as-of-scenarios/all-chains.json"));
    expect(Object.keys(scenarios.chains).length).toBeGreaterThanOrEqual(5);
    const proofs = readJson(join(ROOT, "wrong-parent-proofs/proofs.json"));
    expect(proofs.proofs.map((p: { id: string }) => p.id)).toEqual(
      expect.arrayContaining(["WP-001", "WP-002", "WP-003", "WP-004", "WP-005", "WP-006"]),
    );
  });

  it("knowledge-factory export uses upsert-by-sourceId contract without competing schema", () => {
    const exp = readJson(join(ROOT, "knowledge-factory-export/amendment-chains-export.json"));
    expect(exp.importContract.competingProductionSchema).toBe(false);
    expect(exp.importContract.mode).toBe("UPSERT_BY_sourceId");
    expect(exp.documents.length).toBeGreaterThan(10);
    expect(exp.parentChildAuthorityLinks.length).toBeGreaterThan(5);
  });

  it("local byte cache is gitignored when present", () => {
    const gi = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    expect(gi).toMatch(/local-amendment-research/);
    // Bytes may or may not exist in CI; if present, ledger paths should resolve for ACQUIRED docs
    const ledger = readJson(join(ROOT, "phase2/acquisition-ledger.json"));
    const acquired = ledger.documents.filter((d: { acquisitionStatus: string }) =>
      String(d.acquisitionStatus).startsWith("ACQUIRED"),
    );
    const anyLocal = acquired.some((d: { bytePath?: string }) => d.bytePath && existsSync(d.bytePath));
    // Soft check: if this environment has the cache, hashes files exist
    if (anyLocal) {
      for (const d of acquired) {
        if (d.bytePath && String(d.bytePath).startsWith(".local-amendment-research")) {
          expect(existsSync(d.bytePath)).toBe(true);
        }
      }
    }
  });
});
