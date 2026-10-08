/**
 * Offline scope comparison. No provider call. Population counts are not dollars.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareCompilationScopes } from "../../../lib/contract-model/compiler/compilation-scope";
import { runPassADeterministicSignals } from "../../../lib/contract-model/compiler/discovery/pass-a-signals";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { XREF_DOCS } from "../certified/xref-harness";

describe("compilation scope", () => {
  it("keeps package inventory, follows explicit references, and discloses what a narrow read skips", () => {
    const documentId = XREF_DOCS[0]!.documentId;
    const index = buildTestIndex(XREF_DOCS);
    const nodes = index.allNodes().filter((node) => node.documentId === documentId);
    const sections = nodes.filter((node) => node.nodeType === "SECTION");
    const units = sections.map((section) => ({ id: section.nodeId, sectionRef: section.sectionRef, text: index.getNodeText(section.nodeId, "DESCENDANTS") }));
    const references = nodes.flatMap((node) => index.findReferencesFrom(node.nodeId).map((reference) => ({
      sourceSectionRef: node.sectionRef,
      normalizedTarget: reference.normalizedTarget,
      targetKind: reference.targetKind,
      resolved: reference.resolved,
      targetAmbiguous: reference.targetAmbiguous,
    })));
    const passA = runPassADeterministicSignals(documentId, index);
    const comparison = compareCompilationScopes({
      units,
      seedSectionRefs: ["7.02"],
      references,
      definitions: index.allDefinitions().map((definition) => ({ term: definition.exactTerm, text: index.getDefinitionFullText(definition.exactTerm, documentId) })),
      requiredTerms: ["Indebtedness", "Payment Conditions", "Lien", "Not A Defined Term"],
    });
    const refsOf = (ids: string[]) => units.filter((unit) => ids.includes(unit.id)).map((unit) => unit.sectionRef);
    expect(passA.length).toBeGreaterThan(0);
    expect(comparison.approachA.compilationUnits).toBe(sections.length);
    expect(refsOf(comparison.approachB.compiledUnitIds)).toEqual(["7.02"]);
    expect(refsOf(comparison.approachB.notExaminedUnitIds)).toEqual(expect.arrayContaining(["7.01", "7.03", "7.04", "7.05", "7.06"]));
    expect(refsOf(comparison.approachC.compiledUnitIds)).toEqual(expect.arrayContaining(["7.01", "7.02", "7.03", "7.04"]));
    expect(refsOf(comparison.approachC.compiledUnitIds)).not.toEqual(expect.arrayContaining(["7.05", "7.06"]));
    expect(refsOf(comparison.approachC.notExaminedUnitIds)).toEqual(expect.arrayContaining(["7.05", "7.06"]));
    expect(comparison.approachC.definitionContext).toEqual(expect.arrayContaining(["Indebtedness", "Lien", "Payment Conditions", "Consolidated EBITDA"]));
    expect(refsOf(comparison.approachC.compiledUnitIds)).not.toContain("1.01");
    expect(comparison.approachC.missingDefinitions).toContain("Not A Defined Term");
    expect(comparison.approachC.omissionAudit).toBe("DISCLOSED");
    expect(comparison.approachC.advancesCertification).toBe(false);
    expect(comparison.approachC.compilationUnits).toBeLessThan(comparison.approachA.compilationUnits);
    expect(comparison.approachB.compilationUnits).toBeLessThan(comparison.approachC.compilationUnits);
  });

  it("does not turn retained Gibraltar population counts into a dollar saving", () => {
    const structure = JSON.parse(readFileSync("tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure/structure-summary.json", "utf8")) as {
      passBExecuted: boolean;
      passACandidates: number;
      passASectionsWithSignals: number;
      definitionsDetected: number;
      referencesDetected: number;
      referencesResolved: number;
      referencesUnresolved: number;
      totalNodes: number;
    };
    const execution = JSON.parse(readFileSync("tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/execution.json", "utf8")) as {
      passB: { modelCalls: number; inputTokens: number; outputTokens: number };
      discoveredCandidates: { role: string }[];
    };
    const verification = JSON.parse(readFileSync("tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/verification.json", "utf8")) as {
      dispatchable: number;
      spend: { exactSpendUsd: number };
    };
    expect(structure.passBExecuted).toBe(false);
    expect(structure.passACandidates).toBe(946);
    expect(structure.passASectionsWithSignals).toBe(86);
    expect(structure.definitionsDetected).toBe(564);
    expect(structure.referencesDetected).toBe(1459);
    expect(structure.referencesResolved).toBe(491);
    expect(structure.referencesUnresolved).toBe(968);
    expect(structure.totalNodes).toBe(2087);
    expect(execution.passB.modelCalls).toBe(140);
    expect(execution.discoveredCandidates).toHaveLength(842);
    expect(execution.discoveredCandidates.filter((row) => row.role === "REPRESENTATION")).toHaveLength(45);
    expect(verification.dispatchable).toBe(788);
    expect(verification.spend.exactSpendUsd).toBe(8.777854);
    expect(structure.passASectionsWithSignals).not.toBe(execution.passB.modelCalls);
  });
});
