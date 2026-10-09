/**
 * A definition restatement that names the section housing the term is a
 * definition effect. It must not replace that section with the one new
 * definition. Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { detectModificationCandidates } from "../../lib/contract-model/compiler/package-graph/modification-candidates";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState, getOperativeDefinition } from "../../lib/contract-model/compiler/amendment/operative-state";
import { resolveOperativeSource } from "../../lib/contract-model/compiler/candidate-span";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { createRetrievalState } from "../../lib/contract-model/compiler/context-retrieval/state";
import { retrieveDirectDefinitions } from "../../lib/contract-model/compiler/context-retrieval/definition-graph";
import { DEFAULT_RETRIEVAL_BUDGET } from "../../lib/contract-model/compiler/context-retrieval/types";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

const BASE = `CREDIT AGREEMENT dated as of March 3, 2026, among Harbor Lane Industries, Inc., as Borrower.

SECTION 1.01 Defined Terms. As used in this Agreement:
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, Interest Expense, income tax expense and depreciation and amortization expense for such period.
"Indebtedness" means, as to any Person, all obligations of such Person for borrowed money.

SECTION 7.01 Indebtedness. The Borrower shall not incur any Indebtedness except up to $30,000,000.`;

const LARGER = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, Interest Expense, income tax expense, depreciation and amortization expense and non-cash stock compensation expense for such period.`;
const SMALLER = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, Interest Expense and depreciation and amortization expense for such period.`;

function amendment(body: string): PackageDocumentInput {
  return doc("amendment-1", "Amendment No. 1", `AMENDMENT NO. 1 dated as of May 1, 2026 to the Credit Agreement dated as of March 3, 2026, among Harbor Lane Industries, Inc., as Borrower.\n\n${body}\n\nSECTION 2. Effectiveness. This Amendment shall become effective on May 1, 2026.\n`);
}

async function run(body: string) {
  const documents = [doc("credit-agreement", "Credit Agreement", BASE), amendment(body)];
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

describe("definition-level amendments", () => {
  it("detects a definition restatement that names its section, and does not also target that section", () => {
    const f1 = amendment(`SECTION 1. Amendments. The definition of "Consolidated EBITDA" in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: ${LARGER}`);
    const hits = detectModificationCandidates(f1).filter((c) => c.targetDefinedTermRef || c.targetSectionRef);
    expect(hits.map((c) => [c.targetDefinedTermRef, c.targetSectionRef])).toEqual([["Consolidated EBITDA", null]]);

    const f3 = amendment(`SECTION 1. Amendments. The definition of "Consolidated EBITDA" set forth in Section 1.01 of the Credit Agreement is hereby amended and restated to read in its entirety as follows: ${LARGER}`);
    const hits3 = detectModificationCandidates(f3).filter((c) => c.targetDefinedTermRef || c.targetSectionRef);
    expect(hits3.map((c) => [c.targetDefinedTermRef, c.targetSectionRef])).toEqual([["Consolidated EBITDA", null]]);
  });

  it("a section restatement that is not a definition amendment still targets the section", () => {
    const section = amendment(`SECTION 1. Amendments. Section 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $75,000,000.`);
    const hits = detectModificationCandidates(section).filter((c) => c.targetSectionRef || c.targetDefinedTermRef);
    expect(hits.map((c) => [c.targetDefinedTermRef, c.targetSectionRef, c.operation])).toEqual([[null, "6.01", "RESTATE"]]);
  });

  it("F2 'Section 1.01 amended by restating the definition of X' targets the definition, not whole Section 1.01", () => {
    const f2 = amendment(`SECTION 1. Amendments. Section 1.01 of the Credit Agreement is hereby amended by amending and restating the definition of "Consolidated EBITDA" in its entirety to read as follows: ${LARGER}`);
    const hits = detectModificationCandidates(f2).filter((c) => c.targetSectionRef || c.targetDefinedTermRef);
    expect(hits.some((c) => c.targetDefinedTermRef === "Consolidated EBITDA")).toBe(true);
    expect(hits.some((c) => c.targetSectionRef === "1.01")).toBe(false);
    expect(hits.some((c) => c.targetDefinedTermRef === "Consolidated EBITDA" && c.operation === "RESTATE")).toBe(false);
  });

  it("replaces only the named definition and keeps the other definition in the section", async () => {
    const { result, state } = await run(`SECTION 1. Amendments. The definition of "Consolidated EBITDA" in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: ${SMALLER}`);
    const effects = result.effects.filter((e) => e.amendmentDocumentId === "amendment-1" && e.operation !== "REAFFIRM");
    expect(effects.map((e) => [e.target.kind, e.target.targetDefinedTermRef, e.target.targetSectionRef, e.operation])).toEqual([["DEFINITION", "Consolidated EBITDA", null, "REPLACE_DEFINITION"]]);
    expect(effects[0]!.newText).toMatch(/^"Consolidated EBITDA"\s+means/);
    expect(effects[0]!.newText).toContain("depreciation and amortization");
    expect(effects[0]!.newText).not.toContain("income tax expense");
    // IPV-19: keep the opening quote so ownership / inventory can match `"Term" means`.
    expect(effects[0]!.newText).toMatch(/^"Consolidated EBITDA" means/);
    const section = state.provisions.find((p) => p.kind === "SECTION" && p.sectionRef === "1.01");
    expect(section?.currentText).toMatch(/"Indebtedness" means/);
    // IPV-19: opening quote retained in the spliced section / operative definition.
    expect(section?.currentText).toMatch(/"Consolidated EBITDA"\s+means/);
    expect(section?.currentText).not.toMatch(/income tax expense/);
    expect(section?.currentText).toMatch(/depreciation and amortization/);
    const ebitda = getOperativeDefinition(state, "Consolidated EBITDA");
    expect(ebitda?.currentText).toMatch(/^"Consolidated EBITDA"\s+means/);
    expect(ebitda?.currentText).not.toMatch(/income tax expense/);
    expect(ebitda?.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(getOperativeDefinition(state, "Indebtedness")).toBeNull();
  });

  it("an add-back amendment does not erase the rest of the definitions section", async () => {
    const { state } = await run(`SECTION 1. Amendments. The definition of "Consolidated EBITDA" set forth in Section 1.01 of the Credit Agreement is hereby amended and restated to read in its entirety as follows: ${LARGER}`);
    const section = state.provisions.find((p) => p.kind === "SECTION" && p.sectionRef === "1.01");
    expect(section?.currentText).toMatch(/stock compensation/);
    expect(section?.currentText).toMatch(/"Indebtedness" means/);
    expect(getOperativeDefinition(state, "Consolidated EBITDA")?.currentText).toMatch(/stock compensation/);
  });

  it("definition retrieval hands the compiler the amended EBITDA, not the larger base definition", async () => {
    const { state, index } = await run(`SECTION 1. Amendments. The definition of "Consolidated EBITDA" in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: ${SMALLER}`);
    const retrieval = createRetrievalState(DEFAULT_RETRIEVAL_BUDGET, state);
    retrieveDirectDefinitions(retrieval, index, "credit-agreement", "the Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00 after giving effect to such Indebtedness, using Consolidated EBITDA.", "operative");
    const item = [...retrieval.items.values()].find((i) => i.normalizedRef.toLowerCase() === "consolidated ebitda");
    expect(item?.excerptText).not.toMatch(/income tax expense/);
    expect(item?.excerptText).toMatch(/depreciation and amortization/);
    expect(item?.evidenceState?.isCurrentTruth).toBe(true);
  });

  it("does not keep the base definitions section when the amended definition text occurs twice", async () => {
    const duplicated = `CREDIT AGREEMENT dated as of March 3, 2026, among Harbor Lane Industries, Inc., as Borrower.

SECTION 1.01 Defined Terms. As used in this Agreement:
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus income tax expense.
"Indebtedness" means borrowed money. The disclosure repeats "Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus income tax expense.`;
    const documents = [doc("credit-agreement", "Credit Agreement", duplicated), amendment(`SECTION 1. Amendments. The definition of "Consolidated EBITDA" in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: ${SMALLER}`)];
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
    const sectionNode = index.getNodeByRef("credit-agreement", "1.01");
    expect(sectionNode).toBeTruthy();
    const section = resolveOperativeSource({ structuralNodeIds: [sectionNode!.nodeId], documentId: "credit-agreement", normalizedSourceRef: "1.01" }, index, state);
    expect(section.withheld).toBe(true);
    expect(section.text).not.toContain("income tax expense");
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
  });
});
