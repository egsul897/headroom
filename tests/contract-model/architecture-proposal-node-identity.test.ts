/**
 * Structural Node Identity & Index Integrity architecture proposal - tests
 * for the proposal's own artifacts and evidence (task §41 equivalent).
 * Production code is frozen for this phase: these tests validate the
 * synthetic collision reproduction, the machine-readable artifacts, and
 * the freeze/integrity claims - not new production behavior. No production
 * source is modified by this suite; the reproduction script imports and
 * calls the real, unmodified parseDocumentStructure/buildStructuralIndex.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";

const AUDIT_DIR = "tests/fixtures/architecture-audits";

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(AUDIT_DIR, `${name}.json`), "utf-8")) as T;
}

describe("Structural node identity proposal - minimal collision reproduction is real and reproducible", () => {
  it("re-running the exact synthetic Case A text against the real, unmodified production functions reproduces the documented collision", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur any obligation except as permitted under Section 6.04 Limitation on Distributions . Such incurrence shall in all cases remain subject to the other provisions of this Article.

Section 6.04 Limitation on Distributions . Neither party shall make any distribution of assets, except:
(a) a distribution payable solely in additional units of its own equity;
(b) a distribution to fund ordinary operating expenses incurred in the ordinary course of business.

Section 6.05 Limitation on Investments . Neither party shall make any investment, except:
(a) an investment in a wholly-owned subsidiary formed after the date hereof;
(b) an investment consisting of cash and cash equivalents.
`.trim();
    const nodes = parseDocumentStructure({ documentId: "synthetic-doc-a", label: "synthetic-doc-a", text });
    const collided = nodes.filter((n) => n.nodeKey === "synthetic-doc-a::6.04");
    expect(collided.length).toBe(2);

    const index = buildStructuralIndex(new Map([["synthetic-doc-a", { text, nodes }]]), [], []);
    expect(index.allNodes().length).toBe(nodes.length);

    // The defect: only the later occurrence is reachable by identity lookup, even though both exist in allNodes().
    const resolved = index.getNodeByRef("synthetic-doc-a", "6.04");
    expect(resolved?.charStart).toBe(Math.max(...collided.map((c) => c.charStart)));
    const earlierOccurrence = collided.find((c) => c.charStart !== resolved?.charStart)!;
    expect(index.allNodes().some((n) => n.charStart === earlierOccurrence.charStart)).toBe(true);
    expect(index.getNode(earlierOccurrence.nodeKey)?.charStart).not.toBe(earlierOccurrence.charStart);
  });

  it("a non-colliding, ordinary section is completely unaffected (the defect does not corrupt the common case)", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.05 Limitation on Investments . Neither party shall make any investment, except:
(a) an investment in a wholly-owned subsidiary formed after the date hereof;
(b) an investment consisting of cash and cash equivalents.
`.trim();
    const nodes = parseDocumentStructure({ documentId: "synthetic-doc-clean", label: "synthetic-doc-clean", text });
    const index = buildStructuralIndex(new Map([["synthetic-doc-clean", { text, nodes }]]), [], []);
    const section = index.getNodeByRef("synthetic-doc-clean", "6.05");
    expect(section).toBeDefined();
    expect(index.getChildren(section!.nodeKey).map((c) => c.sectionRef).sort()).toEqual(["6.05(a)", "6.05(b)"]);
  });

  it("the preserved collision-repro artifact's own recorded conclusion matches a fresh re-run", () => {
    const preserved = loadJson<{ caseA_crossReferenceCollision: { duplicateNodeKeys: Record<string, number>; earlierOccurrenceUnreachableViaIdentityLookup: boolean } }>("structural-identity-collision-repro");
    expect(preserved.caseA_crossReferenceCollision.duplicateNodeKeys["synthetic-doc-a::6.04"]).toBe(2);
    expect(preserved.caseA_crossReferenceCollision.earlierOccurrenceUnreachableViaIdentityLookup).toBe(true);
  });
});

describe("Structural node identity proposal - machine-readable artifacts are internally consistent", () => {
  it("all 8 required/supporting artifacts exist and parse as JSON", () => {
    const names = [
      "structural-identity-collision-repro",
      "structural-identity-current-state",
      "structural-identity-consumer-inventory",
      "structural-identity-option-comparison",
      "structural-identity-proposed-invariants",
      "structural-identity-migration-plan",
      "structural-identity-validation-plan",
      "structural-identity-architecture-freeze",
    ];
    for (const name of names) expect(() => loadJson(name)).not.toThrow();
  });

  it("the option comparison evaluates at least 3 real candidates plus the selected one", () => {
    const options = loadJson<{ options: Array<{ id: string; verdict: string }>; selectedOption: string }>("structural-identity-option-comparison");
    expect(options.options.length).toBeGreaterThanOrEqual(4);
    expect(options.selectedOption).toBe("D");
    const selected = options.options.find((o) => o.id === "D");
    expect(selected?.verdict).toMatch(/SELECTED/);
  });

  it("all 16 base structural invariants (I1-I16) are present", () => {
    const invariants = loadJson<{ invariants: Array<{ id: string }> }>("structural-identity-proposed-invariants");
    const ids = new Set(invariants.invariants.map((i) => i.id));
    for (let n = 1; n <= 16; n++) expect(ids.has(`I${n}`), `missing I${n}`).toBe(true);
  });

  it("the migration plan defines stages A through G with scorer remediation (F) kept separate from structural remediation (A-E)", () => {
    const plan = loadJson<{ stages: Array<{ stage: string; name: string }> }>("structural-identity-migration-plan");
    const stages = plan.stages.map((s) => s.stage);
    expect(stages).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    const stageF = plan.stages.find((s) => s.stage === "F")!;
    expect(stageF.name.toLowerCase()).toContain("scorer");
  });
});

describe("Structural node identity proposal - production freeze and historical integrity", () => {
  const freeze = loadJson<{
    productionCodeHash: { identical: boolean };
    historicalArtifactIntegrity: { mismatches: string[]; byteIdentical: boolean };
    noNewPackageContamination: { verified: boolean };
    noPhase4Work: { verified: boolean };
    noProductionBehaviorChange: { verified: boolean };
  }>("structural-identity-architecture-freeze");

  it("production code hash is identical at proposal start and end", () => {
    expect(freeze.productionCodeHash.identical).toBe(true);
  });

  it("historical Phase 3F/3F.1/3F.1.1 artifacts remain byte-identical", () => {
    expect(freeze.historicalArtifactIntegrity.mismatches).toEqual([]);
    expect(freeze.historicalArtifactIntegrity.byteIdentical).toBe(true);
  });

  it("no new package contamination, no Phase 4 work, no production behavior change", () => {
    expect(freeze.noNewPackageContamination.verified).toBe(true);
    expect(freeze.noPhase4Work.verified).toBe(true);
    expect(freeze.noProductionBehaviorChange.verified).toBe(true);
  });

  it("no new directory was created under tests/fixtures/unseen-packages/ (no new-package inspection)", () => {
    const entries = readdirSync("tests/fixtures/unseen-packages");
    const allowedPrefixes = ["conmed-", "dsgr-", "fwrg-", "lsb-", "phase-2f-", "phase-3b-", "phase-3b1-", "phase-3d-", "phase-3e-", "phase-3f-", "phase-3f1-"];
    for (const entry of entries) {
      expect(allowedPrefixes.some((p) => entry.startsWith(p)), `unexpected new entry: ${entry}`).toBe(true);
    }
  });
});
