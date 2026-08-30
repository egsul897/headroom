/**
 * Phase 3F.1.5 Workstream B - P1-11 (Q8 supersession-awareness) regression
 * tests. Covers the new generalized mechanism (amendment/operative-state.ts's
 * buildNodeSupersessionIndex/getNodeSupersessionStatus) and its two named
 * bypass-prone consumers (discovery/pass-a-signals.ts,
 * semantic-verification/source-inventory.ts). All fixture text is invented
 * for this file - no FWRG/LSB/CONMED/DSGR-specific content (this session's
 * own established anti-overfitting discipline).
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState, buildNodeSupersessionIndex, getNodeSupersessionStatus, EMPTY_SUPERSESSION_INDEX } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { OperativeStateForDocument } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

function buildIndex(documents: PackageDocumentInput[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefs = [];
  for (const d of documents) {
    const nodes = parseDocumentStructure(d);
    nodesByDocument.set(d.documentId, { text: d.text, nodes });
    allDefs.push(...detectStructuralDefinitions(d.documentId, d.text, nodes));
  }
  return buildStructuralIndex(nodesByDocument, allDefs, []);
}

async function runPackage(documents: PackageDocumentInput[], caller?: StageCaller) {
  const index = buildIndex(documents);
  const packageGraph = buildPackageGraph("co", "pkg", documents);
  const result = await runAmendmentPipeline(caller ?? getStageCaller(), { documents, packageGraph, index });
  return { index, packageGraph, ...result };
}

function instrumentKeyFor(packageGraph: ReturnType<typeof buildPackageGraph>, documentId: string): string {
  const inst = packageGraph.instruments.find((i) => i.documentIds.includes(documentId));
  return inst?.instrumentKey ?? `instrument:${documentId}`;
}

class ScriptedStageCaller implements StageCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  private callIndex = 0;
  constructor(private scripts: Array<(content: string) => unknown>) {}
  async call<T>(schema: ZodType<T>, _stage: string, _systemPrompt: string, content: string): Promise<T> {
    const script = this.scripts[this.callIndex];
    this.callIndex++;
    if (!script) throw new Error("ScriptedStageCaller: no script left for this call");
    return schema.parse(script(content));
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

describe("P1-11 fix - buildNodeSupersessionIndex/getNodeSupersessionStatus core mechanism", () => {
  it("1. an original, never-amended provision resolves CURRENT_OPERATIVE once its document is covered by a real computed state", async () => {
    const base = doc("orig-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.\n\nSECTION 6.02 Investments. The Borrower will not make Investments except up to $10,000,000.`);
    const { effects, index, packageGraph } = await runPackage([base]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "orig-ca"), baseDocumentId: "orig-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "orig-ca", state }]);
    const node = index.getNodeByRef("orig-ca", "6.01")!;
    const result = getNodeSupersessionStatus(idx, "orig-ca", node.nodeId);
    expect(result.status).toBe("CURRENT_OPERATIVE");
    expect(result.record).toBeNull();
  });

  it("2. an amended provision's ORIGINAL base node resolves KNOWN_SUPERSEDED with real provenance (which effect, which amendment document, what date)", async () => {
    const base = doc("amend-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`);
    const amend = doc(
      "amend-a1",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $75,000,000 in the aggregate.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "amend-ca"), baseDocumentId: "amend-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "amend-ca", state }]);
    const node = index.getNodeByRef("amend-ca", "6.01")!;
    const result = getNodeSupersessionStatus(idx, "amend-ca", node.nodeId);
    expect(result.status).toBe("KNOWN_SUPERSEDED");
    expect(result.record?.supersededByAmendmentDocumentId).toBe("amend-a1");
    expect(result.record?.supersededEffectiveDate).toBe("June 1, 2022");
    expect(result.record?.supersededByEffectId).toBeTruthy();
  });

  it("3. the superseded ORIGINAL text remains fully, byte-identically queryable through the structural index - supersession marks currentness, never deletes/redacts history", async () => {
    const base = doc("hist-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`);
    const amend = doc(
      "hist-a1",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $75,000,000 in the aggregate.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "hist-ca"), baseDocumentId: "hist-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "hist-ca", state }]);
    const node = index.getNodeByRef("hist-ca", "6.01")!;
    // Historical text is still directly, fully queryable...
    expect(index.getNodeText(node.nodeId, "DESCENDANTS")).toContain("$50,000,000");
    // ...while the supersession index correctly says it is no longer operative.
    expect(getNodeSupersessionStatus(idx, "hist-ca", node.nodeId).status).toBe("KNOWN_SUPERSEDED");
    // The amended provision's own currentText (a SEPARATE, provision-level concept) correctly reflects the new figure.
    expect(state.provisions[0]!.currentText).toContain("$75,000,000");
  });

  it("4. an operative consumer (pass-a-signals) receiving the built index reports the amended sibling KNOWN_SUPERSEDED and the never-amended sibling CURRENT_OPERATIVE - siblings are never conflated", async () => {
    const base = doc(
      "sib-ca",
      "CA",
      `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Baskets.\n(a) The Borrower may incur Indebtedness not to exceed $10,000,000.\n(b) The Borrower may make Investments not to exceed $20,000,000.`
    );
    const amend = doc(
      "sib-a1",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSection 6.01(a) of the Credit Agreement is hereby amended and restated in its entirety to read as follows: (a) The Borrower may incur Indebtedness not to exceed $15,000,000.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "sib-ca"), baseDocumentId: "sib-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "sib-ca", state }]);

    const candidates = runPassADeterministicSignals("sib-ca", index, idx);
    const nodeA = index.getNodeByRef("sib-ca", "6.01(a)")!;
    const nodeB = index.getNodeByRef("sib-ca", "6.01(b)")!;
    const candidateA = candidates.find((c) => c.nodeId === nodeA.nodeId)!;
    const candidateB = candidates.find((c) => c.nodeId === nodeB.nodeId)!;
    expect(candidateA.supersessionStatus).toBe("KNOWN_SUPERSEDED");
    expect(candidateB.supersessionStatus).toBe("CURRENT_OPERATIVE");
    // The candidate is still generated for the superseded sibling (history stays discoverable), just honestly labeled.
    expect(candidateA).toBeTruthy();
  });

  it("5. an ambiguous amendment target fails closed: every physically colliding candidate node resolves UNKNOWN_SUPERSESSION_STATUS, never CURRENT_OPERATIVE for either", () => {
    // Two distinct physical SECTION 8.01 occurrences in the same document -
    // a real, disclosed drafting/extraction reality (duplicate/malformed
    // numbering, cross-reference echo) per structural-index.ts's own
    // AMBIGUOUS_LEGAL_REFERENCE health signal.
    const text = `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 8.01 Events of Default. If an Event of Default occurs, the Lender may accelerate.\n\nARTICLE IX Miscellaneous.\n\nSECTION 8.01 Events of Default. If an Event of Default occurs, the Lender may accelerate all Obligations.`;
    const nodes = parseDocumentStructure({ documentId: "amb-ca", label: "CA", text });
    const index = buildStructuralIndex(new Map([["amb-ca", { text, nodes }]]), [], []);
    const resolution = index.resolveUniqueNodeByRef("amb-ca", "8.01");
    expect(resolution.status).toBe("AMBIGUOUS");
    if (resolution.status !== "AMBIGUOUS") throw new Error("expected ambiguous fixture");

    // Simulate an OperativeContractState whose own targetResolutionStatus for this provision is AMBIGUOUS (mirrors resolveBaseText's real AMBIGUOUS branch in operative-state.ts).
    const state = {
      instrumentKey: "amb-instrument",
      asOfDate: "2023-01-01",
      status: "OPERATIVE_STATE_PARTIAL" as const,
      summary: "test",
      unattachedEffects: [],
      provisions: [
        {
          instrumentKey: "amb-instrument",
          provisionKey: "amb-instrument::SECTION::8.01",
          kind: "SECTION" as const,
          documentId: "amb-ca",
          sectionRef: "8.01",
          definedTermRef: null,
          asOfDate: "2023-01-01",
          currentSourceDocumentId: "amb-ca",
          currentSourceNodeKey: null,
          currentSourceNodeId: null,
          currentText: null,
          fullChain: [],
          appliedChain: [],
          supersededSourceNodeKeys: [],
          supersededSourceNodeIds: [],
          status: "OPERATIVE_STATE_PARTIAL" as const,
          unresolvedIssues: ["ambiguous"],
          conflicts: [],
          targetResolutionStatus: "AMBIGUOUS" as const,
          targetResolutionReason: "2 distinct physical occurrences share legal reference 8.01",
          candidateSourceNodeIds: resolution.candidates.map((c) => c.nodeId),
          attemptedText: null,
          reviewRequired: true,
          candidateTexts: [],
          structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT" as const,
          structuralHealthIssues: [],
        },
      ],
    };
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "amb-ca", state }]);
    for (const candidate of resolution.candidates) {
      const result = getNodeSupersessionStatus(idx, "amb-ca", candidate.nodeId);
      expect(result.status).toBe("UNKNOWN_SUPERSESSION_STATUS");
      expect(result.status).not.toBe("CURRENT_OPERATIVE");
    }
  });

  it("6. chained amendments: the base node is superseded by the EARLIEST applied effect (real provenance, not the most recent)", async () => {
    const base = doc("chain-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`);
    const amend1 = doc(
      "chain-a1",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $75,000,000 in the aggregate.`
    );
    const amend2 = doc(
      "chain-a2",
      "Amendment 2",
      `AMENDMENT NO. 2 dated as of June 1, 2023 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $100,000,000 in the aggregate.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend1, amend2]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "chain-ca"), baseDocumentId: "chain-ca", asOfDate: "2024-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.currentText).toContain("$100,000,000");
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "chain-ca", state }]);
    const node = index.getNodeByRef("chain-ca", "6.01")!;
    const result = getNodeSupersessionStatus(idx, "chain-ca", node.nodeId);
    expect(result.status).toBe("KNOWN_SUPERSEDED");
    // The base node was superseded by the FIRST amendment to ever apply to it, not the latest.
    expect(result.record?.supersededByAmendmentDocumentId).toBe("chain-a1");
    expect(result.record?.supersededEffectiveDate).toBe("June 1, 2022");
  });

  it("7. a partial amendment (threshold changed, no capturable replacement text) still marks the base node KNOWN_SUPERSEDED - 'we don't know the new number' must never be conflated with 'the old number is still current'", async () => {
    const base = doc("partial-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.02 Investments. The Borrower will not make Investments except up to $10,000,000.`);
    const amend = doc(
      "partial-a1",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSection 6.02 of the Credit Agreement is hereby amended by increasing the Investments basket threshold.`
    );
    const caller = new ScriptedStageCaller([() => ({ operation: "MODIFY_THRESHOLD", proposedNewText: null, targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: ["Section 6.02"], confidence: 0.8, unresolvedQuestions: [] })]);
    const { effects, index, packageGraph } = await runPackage([base, amend], caller);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "partial-ca"), baseDocumentId: "partial-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.currentText).toBeNull();
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "partial-ca", state }]);
    const node = index.getNodeByRef("partial-ca", "6.02")!;
    const result = getNodeSupersessionStatus(idx, "partial-ca", node.nodeId);
    expect(result.status).toBe("KNOWN_SUPERSEDED");
  });

  it("8. omitting the supersession index entirely (EMPTY_SUPERSESSION_INDEX default) fails closed - UNKNOWN, never CURRENT_OPERATIVE, for a document that was never analyzed", () => {
    const result = getNodeSupersessionStatus(EMPTY_SUPERSESSION_INDEX, "never-checked-doc", "some-node-id");
    expect(result.status).toBe("UNKNOWN_SUPERSESSION_STATUS");
    expect(result.status).not.toBe("CURRENT_OPERATIVE");
  });

  it("9. no nodeId supplied at all fails closed to UNKNOWN, even for a fully-covered document", async () => {
    const base = doc("nonode-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`);
    const { effects, index, packageGraph } = await runPackage([base]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "nonode-ca"), baseDocumentId: "nonode-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "nonode-ca", state }]);
    const result = getNodeSupersessionStatus(idx, "nonode-ca", null);
    expect(result.status).toBe("UNKNOWN_SUPERSESSION_STATUS");
  });

  it("10. a document covered by one instrument's state does not leak coverage to an unrelated, never-analyzed document (generalizes across independent instruments, no cross-document assumption)", async () => {
    const base = doc("multi-ca-a", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`);
    const { effects, index, packageGraph } = await runPackage([base]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "multi-ca-a"), baseDocumentId: "multi-ca-a", asOfDate: "2023-01-01", index, allEffects: effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "multi-ca-a", state }]);
    const result = getNodeSupersessionStatus(idx, "some-other-untouched-doc", "some-node-id-from-that-doc");
    expect(result.status).toBe("UNKNOWN_SUPERSESSION_STATUS");
  });
});

describe("P1-11 fix - discovery/pass-a-signals.ts consumer wiring", () => {
  it("defaults every candidate to UNKNOWN_SUPERSESSION_STATUS when no supersessionIndex is supplied (honest fail-closed default, not a silent 'current')", () => {
    const text = `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`;
    const nodes = parseDocumentStructure({ documentId: "d1", label: "CA", text });
    const index = buildStructuralIndex(new Map([["d1", { text, nodes }]]), [], []);
    const candidates = runPassADeterministicSignals("d1", index);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
      expect(c.supersessionReason).toBeTruthy();
    }
  });
});

describe("P1-11 fix - semantic-verification/source-inventory.ts consumer wiring", () => {
  it("defaults to UNKNOWN_SUPERSESSION_STATUS when structuralNodeId/supersessionIndex are omitted (existing 5-arg call sites keep compiling and stay honest)", () => {
    const inv = buildSourceInventory("cand-1", "not to exceed $1,000,000.", "doc-1", "§9.01", null);
    expect(inv.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
    expect(inv.supersessionReason).toBeTruthy();
  });

  it("reports KNOWN_SUPERSEDED with provenance when a real nodeId + covering supersessionIndex are supplied for a superseded node", async () => {
    const base = doc("si-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`);
    const amend = doc(
      "si-a1",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $75,000,000 in the aggregate.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "si-ca"), baseDocumentId: "si-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "si-ca", state }]);
    const node = index.getNodeByRef("si-ca", "6.01")!;
    // Deliberately passing the ORIGINAL (now-superseded) base text, exactly
    // as a caller reading the structural node directly (without going
    // through operative-state resolution first) would - the pre-fix defect
    // scenario this whole task exists to close.
    const inv = buildSourceInventory("cand-1", "The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.", "si-ca", "§6.01", null, node.nodeId, idx);
    expect(inv.supersessionStatus).toBe("KNOWN_SUPERSEDED");
    expect(inv.supersessionReason).toContain("si-a1");
    // The stale $50,000,000 figure is still extracted (history/queryability preserved) - only now honestly labeled as no longer governing.
    expect(inv.items.some((i) => i.numericValue === 50_000_000)).toBe(true);
  });

  it("reports CURRENT_OPERATIVE for a real, covered, never-amended node", async () => {
    const base = doc("cur-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`);
    const { effects, index, packageGraph } = await runPackage([base]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "cur-ca"), baseDocumentId: "cur-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cur-ca", state } as OperativeStateForDocument]);
    const node = index.getNodeByRef("cur-ca", "6.01")!;
    const inv = buildSourceInventory("cand-1", "The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.", "cur-ca", "§6.01", null, node.nodeId, idx);
    expect(inv.supersessionStatus).toBe("CURRENT_OPERATIVE");
  });
});
