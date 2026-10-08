/**
 * A section candidate must not compile a clause an amendment has already
 * replaced or deleted. Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { resolveOperativeSource } from "../../lib/contract-model/compiler/candidate-span";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { OperativeContractState } from "../../lib/contract-model/compiler/amendment/types";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

const CREDIT = `CREDIT AGREEMENT dated as of January 15, 2026, among Harbor Lane Industries, Inc., as Borrower.

SECTION 1.01 Defined Terms. As used in this Agreement:
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, Interest Expense, income tax expense and depreciation and amortization expense for such period.
"Indebtedness" means, as to any Person, all obligations of such Person for borrowed money.

SECTION 7.01 Indebtedness. The Borrower shall not incur Indebtedness, except:
(a) Indebtedness under the Loan Documents;
(b) Indebtedness in an aggregate principal amount not to exceed $25,000,000;
(c) Indebtedness of any Subsidiary in an aggregate principal amount not to exceed $5,000,000; and
(d) Indebtedness incurred to finance a Permitted Acquisition in an aggregate principal amount not to exceed $15,000,000.

SECTION 7.02 Liens. The Borrower shall not create any Lien, except Liens securing Indebtedness in an aggregate principal amount not to exceed $8,000,000.`;

const REPLACEMENT = `(b) Indebtedness of the Borrower in an aggregate principal amount not to exceed $40,000,000, so long as no Default has occurred and is continuing;`;
const SMALLER = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, Interest Expense and depreciation and amortization expense for such period.`;

function amendment(documentId: string, label: string, dated: string, body: string): PackageDocumentInput {
  return doc(documentId, label, `${label.toUpperCase()} dated as of ${dated} to the Credit Agreement dated as of January 15, 2026, among Harbor Lane Industries, Inc., as Borrower.\n\n${body}\n\nSECTION 9. Effectiveness. This Amendment shall become effective on ${dated}.\n`);
}

async function compile(documents: PackageDocumentInput[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefs = [];
  for (const d of documents) {
    const nodes = parseDocumentStructure(d);
    nodesByDocument.set(d.documentId, { text: d.text, nodes });
    allDefs.push(...detectStructuralDefinitions(d.documentId, d.text, nodes));
  }
  const index = buildStructuralIndex(nodesByDocument, allDefs, []);
  const packageGraph = buildPackageGraph("co", "pkg", documents);
  const result = await runAmendmentPipeline(getStageCaller(), { documents, packageGraph, index });
  const instrumentKey = packageGraph.instruments.find((i) => i.documentIds.includes("credit-agreement"))?.instrumentKey ?? "instrument:credit-agreement";
  const state = computeOperativeContractState({ instrumentKey, baseDocumentId: "credit-agreement", asOfDate: "2026-06-30", index, allEffects: result.effects });
  return { result, state, index };
}

function source(index: StructuralIndex, state: OperativeContractState, sectionRef: string) {
  const node = index.getNodeByRef("credit-agreement", sectionRef);
  if (!node) throw new Error(`missing ${sectionRef}`);
  return resolveOperativeSource({ structuralNodeIds: [node.nodeId], documentId: "credit-agreement", normalizedSourceRef: sectionRef }, index, state);
}

function candidate(index: StructuralIndex, sectionRef: string): DiscoveredCandidate {
  const node = index.getNodeByRef("credit-agreement", sectionRef);
  if (!node) throw new Error(`missing ${sectionRef}`);
  return {
    discoveryId: `discovery:${sectionRef}`,
    documentId: "credit-agreement",
    structuralNodeKeys: [node.nodeKey],
    structuralNodeIds: [node.nodeId],
    normalizedSourceRef: sectionRef,
    families: ["INDEBTEDNESS"],
    role: "BASKET",
    roleRaw: "BASKET",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: ["INDEBTEDNESS"],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: sectionRef,
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 1,
    sourceCitation: sectionRef,
    discoveryRunVersion: "test-v1",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "test fixture",
  };
}

describe("section operative text follows clause amendments", () => {
  it("drops a replaced cap and a deleted basket from the parent section, and keeps the unamended clauses", async () => {
    const { state, index } = await compile([
      doc("credit-agreement", "Credit Agreement", CREDIT),
      amendment("amendment-1", "Amendment No. 1", "March 1, 2026", `SECTION 1. Amendments. Section 7.01(b) of the Credit Agreement is hereby amended and restated in its entirety to read as follows: ${REPLACEMENT}`),
      amendment("amendment-2", "Amendment No. 2", "April 1, 2026", `SECTION 1. Amendments. Section 7.01(d) of the Credit Agreement is hereby deleted in its entirety.`),
    ]);
    const section = source(index, state, "7.01");
    expect(section.withheld).toBe(false);
    expect(section.origin).toBe("OPERATIVE_STATE_CURRENT_TEXT");
    expect(section.text).toContain("$40,000,000");
    expect(section.text).toContain("no Default has occurred");
    expect(section.text).not.toContain("$25,000,000");
    expect(section.text).not.toContain("$15,000,000");
    expect(section.text).toContain("$5,000,000");
    expect(section.text).toContain("Loan Documents");

    const clause = source(index, state, "7.01(b)");
    expect(clause.text).toContain("$40,000,000");
    expect(clause.text).not.toContain("$25,000,000");
    expect(source(index, state, "7.01(d)").text).toBe("");
    expect(source(index, state, "7.02").text).toContain("$8,000,000");
    expect(source(index, state, "7.02").origin).toBe("STRUCTURAL_NODE");

    const bundle = buildCovenantContextBundle(
      { candidate: candidate(index, "7.01"), packageKey: "pkg", companyId: "co", instrumentKey: state.instrumentKey },
      { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state },
    );
    const operative = bundle.items.find((item) => item.type === "OPERATIVE_SOURCE");
    const childB = bundle.items.find((item) => item.type === "CHILD_RULE" && item.normalizedRef === "7.01(b)");
    const childE = bundle.items.find((item) => item.type === "CHILD_RULE" && item.normalizedRef === "7.01(d)");
    expect(operative?.excerptText).toContain("$40,000,000");
    expect(operative?.excerptText).not.toContain("$25,000,000");
    expect(operative?.excerptText).not.toContain("$15,000,000");
    expect(childB?.excerptText ?? "").not.toContain("$25,000,000");
    expect(childE).toBeUndefined();
    const clauseBundle = buildCovenantContextBundle(
      { candidate: candidate(index, "7.01(b)"), packageKey: "pkg", companyId: "co", instrumentKey: state.instrumentKey },
      { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state },
    );
    expect(clauseBundle.items.find((item) => item.type === "OPERATIVE_SOURCE")?.excerptText).toContain("Default");
  });

  it("does not confirm the base section when a clause amendment has no replacement text", async () => {
    const { state, index } = await compile([
      doc("credit-agreement", "Credit Agreement", CREDIT),
      amendment("amendment-1", "Amendment No. 1", "March 1, 2026", `SECTION 1. Amendments. Section 7.01(b) of the Credit Agreement is hereby amended.`),
    ]);
    const section = source(index, state, "7.01");
    expect(section.withheld).toBe(true);
    expect(section.text).toBe("");
    expect(section.text).not.toContain("$25,000,000");
    const bundle = buildCovenantContextBundle(
      { candidate: candidate(index, "7.01"), packageKey: "pkg", companyId: "co", instrumentKey: state.instrumentKey },
      { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state },
    );
    const operative = bundle.items.find((item) => item.type === "OPERATIVE_SOURCE");
    expect(operative?.excerptText).toBe("");
    expect(operative?.evidenceState?.isCurrentTruth).toBe(false);
  });

  it("a definition amendment does not become the operative text of the whole definitions section", async () => {
    const { state, index } = await compile([
      doc("credit-agreement", "Credit Agreement", CREDIT),
      amendment("amendment-1", "Amendment No. 1", "May 1, 2026", `SECTION 1. Amendments. The definition of "Consolidated EBITDA" in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: ${SMALLER}`),
    ]);
    const section = source(index, state, "1.01");
    expect(section.withheld).toBe(false);
    expect(section.text).toMatch(/"Indebtedness" means/);
    expect(section.text).not.toMatch(/income tax expense/);
    expect(section.text).toMatch(/depreciation and amortization/);
  });

  it("withholds the parent when the old clause text occurs more than once, and still replaces the clause itself", () => {
    const oldClause = "(b) other Indebtedness not to exceed $25,000,000.\n";
    const sectionText = `SECTION 7.01 Indebtedness.\n${oldClause}${oldClause}`;
    const index = {
      getNodeText: (id: string) => (id === "sec" ? sectionText : oldClause),
      getDescendants: (id: string) => (id === "sec" ? [{ nodeId: "b" }] : []),
      getNodeById: (id: string) => ({ nodeId: id, documentId: "credit-agreement", sectionRef: id === "sec" ? "7.01" : "7.01(b)", nodeKey: id }),
    } as unknown as StructuralIndex;
    const provision = {
      instrumentKey: "instrument:credit-agreement",
      provisionKey: "instrument:credit-agreement::SECTION::7.01(b)",
      kind: "SECTION",
      documentId: "credit-agreement",
      sectionRef: "7.01(b)",
      definedTermRef: null,
      asOfDate: "2026-06-30",
      currentSourceDocumentId: "amendment-1",
      currentSourceNodeKey: null,
      currentSourceNodeId: null,
      currentText: "(b) other Indebtedness not to exceed $10,000,000.",
      fullChain: [],
      appliedChain: [{ effectId: "e1", amendmentDocumentId: "amendment-1", operation: "REPLACE_TEXT", effectiveDate: { date: "2026-03-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "" }, sourceCitation: "7.01(b)", appliedAsOfQuery: true }],
      supersededSourceNodeKeys: ["b"],
      supersededSourceNodeIds: ["b"],
      status: "OPERATIVE_STATE_RESOLVED",
      unresolvedIssues: [],
      conflicts: [],
      targetResolutionStatus: "UNIQUE",
      targetResolutionReason: null,
      candidateSourceNodeIds: [],
      structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
      structuralHealthIssues: [],
      attemptedText: "(b) other Indebtedness not to exceed $10,000,000.",
      reviewRequired: false,
      candidateTexts: [],
    };
    const state = { instrumentKey: "instrument:credit-agreement", asOfDate: "2026-06-30", provisions: [provision], status: "OPERATIVE_STATE_RESOLVED", summary: "", unattachedEffects: [], operativeDocument: null } as unknown as OperativeContractState;
    const section = resolveOperativeSource({ structuralNodeIds: ["sec"], documentId: "credit-agreement", normalizedSourceRef: "7.01" }, index, state);
    const clause = resolveOperativeSource({ structuralNodeIds: ["b"], documentId: "credit-agreement", normalizedSourceRef: "7.01(b)" }, index, state);
    expect(section.withheld).toBe(true);
    expect(section.text).toBe("");
    expect(clause.origin).toBe("OPERATIVE_STATE_CURRENT_TEXT");
    expect(clause.text).toContain("$10,000,000");
    expect(clause.text).not.toContain("$25,000,000");
  });

  it("applies the outer clause replacement once when a nested clause was also amended", () => {
    const inner = "(i) inner basket $5,000,000.\n";
    const outer = `(b) outer basket $30,000,000.\n${inner}`;
    const sectionText = `SECTION 7.01 Indebtedness.\n${outer}`;
    const replacement = "(b) outer basket $40,000,000, including (i) inner basket $1,000,000.";
    const index = {
      getNodeText: (id: string) => (id === "sec" ? sectionText : id === "b" ? outer : inner),
      getDescendants: (id: string) => (id === "sec" ? [{ nodeId: "b" }, { nodeId: "i" }] : id === "b" ? [{ nodeId: "i" }] : []),
    } as unknown as StructuralIndex;
    const chain = (effectId: string, operation: "REPLACE_TEXT") => [{ effectId, amendmentDocumentId: "amendment-1", operation, effectiveDate: { date: "2026-03-01", status: "EXPLICIT_EFFECTIVE_DATE" as const, evidence: null, reason: "" }, sourceCitation: effectId, appliedAsOfQuery: true }];
    const view = (sectionRef: string, nodeId: string, currentText: string): OperativeContractState["provisions"][number] => ({
      instrumentKey: "instrument:credit-agreement",
      provisionKey: `instrument:credit-agreement::SECTION::${sectionRef}`,
      kind: "SECTION",
      documentId: "credit-agreement",
      sectionRef,
      definedTermRef: null,
      asOfDate: "2026-06-30",
      currentSourceDocumentId: "amendment-1",
      currentSourceNodeKey: null,
      currentSourceNodeId: null,
      currentText,
      fullChain: [],
      appliedChain: chain(nodeId, "REPLACE_TEXT"),
      supersededSourceNodeKeys: [nodeId],
      supersededSourceNodeIds: [nodeId],
      status: "OPERATIVE_STATE_RESOLVED",
      unresolvedIssues: [],
      conflicts: [],
      targetResolutionStatus: "UNIQUE",
      targetResolutionReason: null,
      candidateSourceNodeIds: [],
      structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
      structuralHealthIssues: [],
      attemptedText: currentText,
      reviewRequired: false,
      candidateTexts: [],
    });
    const state = { instrumentKey: "instrument:credit-agreement", asOfDate: "2026-06-30", provisions: [view("7.01(b)", "b", replacement), view("7.01(b)(i)", "i", "(i) inner basket $99,000,000.")], status: "OPERATIVE_STATE_RESOLVED", summary: "", unattachedEffects: [] } as unknown as OperativeContractState;
    const section = resolveOperativeSource({ structuralNodeIds: ["sec"], documentId: "credit-agreement", normalizedSourceRef: "7.01" }, index, state);
    expect(section.withheld).toBe(false);
    expect(section.text).toContain("$40,000,000");
    expect(section.text).toContain("$1,000,000");
    expect(section.text).not.toContain("$30,000,000");
    expect(section.text).not.toContain("$5,000,000");
    expect(section.text).not.toContain("$99,000,000");
  });

  it("does not keep the base section when the section amendment is unresolved and a child clause was replaced", () => {
    const oldClause = "(b) other Indebtedness not to exceed $25,000,000.\n";
    const sectionText = `SECTION 7.01 Indebtedness.\n${oldClause}`;
    const index = {
      getNodeText: (id: string) => (id === "sec" ? sectionText : oldClause),
      getDescendants: (id: string) => (id === "sec" ? [{ nodeId: "b" }] : []),
    } as unknown as StructuralIndex;
    const chain = (effectId: string, operation: "REPLACE_TEXT" | "MODIFY_PROVISION") => [{ effectId, amendmentDocumentId: "amendment-1", operation, effectiveDate: { date: "2026-03-01", status: "EXPLICIT_EFFECTIVE_DATE" as const, evidence: null, reason: "" }, sourceCitation: effectId, appliedAsOfQuery: true }];
    const view = (sectionRef: string, nodeId: string, status: "OPERATIVE_STATE_RESOLVED" | "OPERATIVE_STATE_REVIEW_REQUIRED", currentText: string | null, operation: "REPLACE_TEXT" | "MODIFY_PROVISION"): OperativeContractState["provisions"][number] => ({
      instrumentKey: "instrument:credit-agreement",
      provisionKey: `instrument:credit-agreement::SECTION::${sectionRef}`,
      kind: "SECTION",
      documentId: "credit-agreement",
      sectionRef,
      definedTermRef: null,
      asOfDate: "2026-06-30",
      currentSourceDocumentId: "amendment-1",
      currentSourceNodeKey: null,
      currentSourceNodeId: null,
      currentText,
      fullChain: [],
      appliedChain: chain(nodeId, operation),
      supersededSourceNodeKeys: [nodeId],
      supersededSourceNodeIds: [nodeId],
      status,
      unresolvedIssues: status === "OPERATIVE_STATE_RESOLVED" ? [] : ["section amendment has no replacement text"],
      conflicts: [],
      targetResolutionStatus: "UNIQUE",
      targetResolutionReason: null,
      candidateSourceNodeIds: [],
      structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
      structuralHealthIssues: [],
      attemptedText: currentText,
      reviewRequired: status !== "OPERATIVE_STATE_RESOLVED",
      candidateTexts: [],
    });
    const state = {
      instrumentKey: "instrument:credit-agreement",
      asOfDate: "2026-06-30",
      provisions: [view("7.01", "sec", "OPERATIVE_STATE_REVIEW_REQUIRED", null, "MODIFY_PROVISION"), view("7.01(b)", "b", "OPERATIVE_STATE_RESOLVED", "(b) other Indebtedness not to exceed $10,000,000.", "REPLACE_TEXT")],
      status: "OPERATIVE_STATE_REVIEW_REQUIRED",
      summary: "",
      unattachedEffects: [],
    } as unknown as OperativeContractState;
    const section = resolveOperativeSource({ structuralNodeIds: ["sec"], documentId: "credit-agreement", normalizedSourceRef: "7.01" }, index, state);
    expect(section.withheld).toBe(true);
    expect(section.text).toBe("");
    expect(section.text).not.toContain("$25,000,000");
  });
});
