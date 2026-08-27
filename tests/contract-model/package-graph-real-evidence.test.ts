/**
 * Phase 2C §17 - real-package evidence. Uses the LSB 2023 ABL Credit
 * Agreement unseen-package fixture's own `intercreditor-joinder.txt` (a
 * real, complete, previously-committed SEC exhibit - see that fixture
 * directory's README.md "Exhibit 10.3" entry) alongside its already-used
 * `definitions-excerpt.txt` + `article-6-negative-covenants.txt`. This is
 * NOT a third unseen package - it is additional, already-committed
 * material from the SAME second unseen package used throughout Phase 2B,
 * simply never previously run through anything (the discovery/compiler
 * runs only ever used the two negative-covenants/definitions files). Zero
 * new LLM calls; classification/relationship-resolution are both fully
 * deterministic.
 *
 * What this DOES validate: real classification of a real, messily-
 * PDF-extracted filed document, and honest UNRESOLVED reporting when a
 * real reference names an agreement (the 2013 Intercreditor Agreement)
 * that is not itself part of the two-document package under test.
 *
 * What this does NOT validate (disclosed honestly, task §17's own "report
 * precisely what real multi-document behavior can actually be validated"):
 * the LSB Credit Agreement excerpt itself (definitions-excerpt.txt +
 * article-6-negative-covenants.txt) has no title page in this curated
 * scope - real classification of an actual base Credit Agreement document
 * against real title-page text, and a real RESOLVED cross-document edge
 * connecting two in-package documents, are NOT exercised by this fixture.
 * Neither FWRG nor LSB's committed fixtures contain two OR MORE documents
 * that a) both have real title-page text AND b) genuinely relate to each
 * other - that combination is only validated by the synthetic packages
 * A-E in package-graph-pipeline.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";

const FIXTURE_DIR = path.join(__dirname, "..", "fixtures", "unseen-packages", "lsb-2023-abl-credit-agreement");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf-8");
}

describe("Real-package evidence: LSB 2023 ABL Credit Agreement + its real Joinder-to-Intercreditor-Agreement exhibit (task §17)", () => {
  const caText = readFixture("definitions-excerpt.txt") + "\n\n" + readFixture("article-6-negative-covenants.txt");
  const joinderText = readFixture("intercreditor-joinder.txt");

  const result = buildPackageGraph("lsb-real-evidence-co", "lsb-real-evidence-package", [
    { documentId: "lsb-real-ca", label: "LSB Credit Agreement (curated excerpt)", text: caText },
    { documentId: "lsb-real-joinder", label: "LSB Intercreditor Joinder (real, complete Exhibit 10.3)", text: joinderText },
  ]);

  it("classifies the real Joinder exhibit as JOINDER from its own real title text, despite a real PDF-extraction line break splitting the words 'JOINDER' and 'AGREEMENT'", () => {
    const classification = result.classifications.find((c) => c.documentId === "lsb-real-joinder");
    expect(classification?.type).toBe("JOINDER");
    expect(classification!.confidence).toBeGreaterThan(0);
  });

  it("honestly reports the Credit Agreement excerpt as UNKNOWN - the curated fixture's own scope has no title page, and no forced guess is made", () => {
    const classification = result.classifications.find((c) => c.documentId === "lsb-real-ca");
    expect(classification?.type).toBe("UNKNOWN");
    expect(classification?.evidence).toHaveLength(0);
  });

  it("detects the Joinder's real reference to 'that certain INTERCREDITOR AGREEMENT dated as of August 7, 2013' and correctly leaves it UNRESOLVED - the referenced Intercreditor Agreement is not itself part of this two-document package", () => {
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "lsb-real-joinder");
    expect(edge).toBeDefined();
    expect(edge?.relationshipType).toBe("JOINS");
    expect(edge?.targetHint).toMatch(/INTERCREDITOR AGREEMENT/i);
    expect(edge?.targetHint).toMatch(/August 7, 2013/);
    expect(edge?.targetDocumentId).toBeNull();
    expect(edge?.status).toBe("UNRESOLVED");
    expect(edge?.unresolvedReason).toMatch(/no document in this package is classified as INTERCREDITOR_AGREEMENT/);
  });

  it("does not fabricate an instrument grouping between the two documents given no resolved relationship connects them", () => {
    const grouped = result.instruments.find((i) => i.documentIds.includes("lsb-real-ca") && i.documentIds.includes("lsb-real-joinder"));
    expect(grouped).toBeUndefined();
  });
});
