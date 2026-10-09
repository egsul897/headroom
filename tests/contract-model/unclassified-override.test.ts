/**
 * A side letter, consent, or waiver that names a section is an unresolved
 * override. Side letters with a single clear capacity figure derive that
 * superseding language; consents and ambiguous windows stay fail-closed
 * with newText null. Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { countAmbiguousEffectsNeedingInterpretation, runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { captureSafeOverrideNewText } from "../../lib/contract-model/compiler/amendment/unclassified-override";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

const CREDIT = `CREDIT AGREEMENT dated as of February 10, 2026, among Northfield Components Corp., as Borrower.

SECTION 7.01 Indebtedness. The Borrower shall not incur Indebtedness, except:
(a) Indebtedness under the Loan Documents; and
(b) other Indebtedness in an aggregate principal amount not to exceed $30,000,000 at any time outstanding.`;

const SIDE_LETTER = `SIDE LETTER dated as of March 1, 2026 to the Credit Agreement dated as of February 10, 2026, among Northfield Components Corp., as Borrower.

SECTION 1. Agreement. Notwithstanding Section 7.01(b) of the Credit Agreement, the Borrower agrees that it shall not incur other Indebtedness under Section 7.01(b) of the Credit Agreement in an aggregate principal amount exceeding $10,000,000 at any time outstanding.

SECTION 2. Effectiveness. This letter shall become effective on March 1, 2026.
`;

async function compile(documents: PackageDocumentInput[], asOfDate = "2026-06-30") {
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
  const unresolved = result.effects.filter((e) => e.target.targetInstrumentKey === null);
  const state = computeOperativeContractState({ instrumentKey, baseDocumentId: "credit-agreement", asOfDate, index, allEffects: result.effects, unresolvedTargetEffectsForThisInstrument: unresolved });
  return { result, state, calls: countAmbiguousEffectsNeedingInterpretation({ documents, packageGraph, index }), index, instrumentKey };
}

describe("unclassified side-letter and consent overrides", () => {
  it("captureSafeOverrideNewText returns the verbatim unique-amount override window", () => {
    const got = captureSafeOverrideNewText(SIDE_LETTER, "7.01(b)");
    expect(got).toContain("$10,000,000");
    expect(got).toMatch(/^Notwithstanding Section 7\.01\(b\)/i);
    expect(got).toContain("shall not incur");
    expect(captureSafeOverrideNewText(SIDE_LETTER, "7.01(c)")).toBeNull();
  });

  it("a notwithstanding side letter derives the superseding capacity and stays REVIEW_REQUIRED", async () => {
    const { result, state, calls } = await compile([doc("credit-agreement", "Credit Agreement", CREDIT), doc("side-letter", "Side Letter", SIDE_LETTER)]);
    const effect = result.effects.find((e) => e.amendmentDocumentId === "side-letter");
    expect(effect?.target.targetSectionRef).toBe("7.01(b)");
    expect(effect?.operation).toBe("UNKNOWN_CHANGE");
    expect(effect?.newText).toContain("$10,000,000");
    expect(effect?.newText).toMatch(/Notwithstanding Section 7\.01\(b\)/i);
    expect(effect?.status).toBe("REVIEW_REQUIRED");
    expect(effect?.unresolvedReason).toMatch(/^UNCLASSIFIED_OVERRIDE:/);
    expect(effect?.unresolvedReason).toContain("documentId=side-letter");
    expect(effect?.unresolvedReason).toContain('label="Side Letter"');
    expect(effect?.unresolvedReason).toContain(`effectId=${effect!.effectId}`);
    expect(effect?.unresolvedReason).not.toMatch(/\$10,000,000|shall not incur/);
    expect(calls).toBe(0);
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    const provision = state.provisions.find((p) => p.sectionRef === "7.01(b)");
    expect(provision?.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(provision?.currentText).toContain("$10,000,000");
    expect(provision?.currentText).not.toContain("$30,000,000");
    expect(provision?.currentSourceDocumentId).toBe("side-letter");
    expect(provision?.appliedChain.map((e) => e.amendmentDocumentId)).toEqual(["side-letter"]);
    expect(provision?.unresolvedIssues.join(" ")).toMatch(/UNCLASSIFIED_OVERRIDE/);
    expect(provision?.unresolvedIssues.join(" ")).toContain("documentId=side-letter");
  });

  it("a lender consent that names a section is the same unresolved override without inventing capacity", async () => {
    const consent = `CONSENT dated as of October 1, 2026 under the Credit Agreement dated as of February 10, 2026, among Northfield Components Corp., as Borrower.

SECTION 1. Consent. The Required Lenders hereby consent to Liens securing Indebtedness in an aggregate principal amount not to exceed $30,000,000, notwithstanding the limitation in Section 7.01(b) of the Credit Agreement.

SECTION 2. Effectiveness. This Consent shall become effective on October 1, 2026.
`;
    const { result, state } = await compile([doc("credit-agreement", "Credit Agreement", CREDIT), doc("consent", "Lender Consent", consent)]);
    const effect = result.effects.find((e) => e.amendmentDocumentId === "consent");
    expect(effect?.target.targetSectionRef).toBe("7.01(b)");
    expect(effect?.newText).toBeNull();
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    const provision = state.provisions.find((p) => p.sectionRef === "7.01(b)");
    expect(provision?.currentText).toContain("$30,000,000");
    expect(provision?.currentSourceDocumentId).toBe("credit-agreement");
    expect(provision?.appliedChain).toEqual([]);
  });

  it("a covenant's own notwithstanding clause is not an override document", async () => {
    const credit = CREDIT.replace("(b) other", "(b) Notwithstanding Section 7.02, other");
    const { result, state } = await compile([doc("credit-agreement", "Credit Agreement", credit)]);
    expect(result.effects.filter((e) => e.unresolvedReason?.startsWith("UNCLASSIFIED_OVERRIDE:"))).toEqual([]);
    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("a later side letter supersedes a prior amendment's capacity when the override amount is uniquely clear", async () => {
    const amendment = `AMENDMENT NO. 1 dated as of June 1, 2026 to the Credit Agreement dated as of February 10, 2026, among Northfield Components Corp., as Borrower.

SECTION 1. Amendments. Section 7.01(b) of the Credit Agreement is hereby amended and restated in its entirety to read as follows:

(b) other Indebtedness in an aggregate principal amount not to exceed $40,000,000 at any time outstanding.

SECTION 2. Effectiveness. This Amendment shall become effective on June 1, 2026.
`;
    const laterLetter = SIDE_LETTER.replaceAll("March 1, 2026", "August 1, 2026");
    const docs = [
      doc("credit-agreement", "Credit Agreement", CREDIT),
      doc("amendment-1", "Amendment No. 1", amendment),
      doc("side-letter", "Side Letter", laterLetter),
    ];
    const before = await compile(docs, "2026-06-30");
    const beforeProvision = before.state.provisions.find((p) => p.sectionRef === "7.01(b)");
    expect(beforeProvision?.currentText).toContain("$40,000,000");
    expect(beforeProvision?.currentText).not.toContain("$10,000,000");
    expect(beforeProvision?.currentSourceDocumentId).toBe("amendment-1");
    expect(beforeProvision?.appliedChain.map((entry) => entry.amendmentDocumentId)).toEqual(["amendment-1"]);

    const { state } = await compile(docs, "2026-09-30");
    const provision = state.provisions.find((p) => p.sectionRef === "7.01(b)");
    expect(state.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(provision?.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(provision?.currentText).toContain("$10,000,000");
    expect(provision?.currentText).not.toContain("$40,000,000");
    expect(provision?.currentSourceDocumentId).toBe("side-letter");
    expect(provision?.appliedChain.map((entry) => entry.amendmentDocumentId)).toEqual(["amendment-1", "side-letter"]);
  });

  it("an override whose section exists in two agreements stays unattached and still blocks a resolved instrument", async () => {
    const indenture = CREDIT.replace("CREDIT AGREEMENT", "INDENTURE").replace("credit-agreement", "indenture");
    const { result, state } = await compile([
      doc("credit-agreement", "Credit Agreement", CREDIT),
      doc("indenture", "Indenture", indenture),
      doc("side-letter", "Side Letter", SIDE_LETTER),
    ]);
    const effect = result.effects.find((e) => e.amendmentDocumentId === "side-letter");
    expect(effect?.target.targetDocumentId).toBeNull();
    expect(effect?.newText).toMatch(/\$10,000,000/);
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("ambiguous multi-amount side-letter windows do not invent a capacity", async () => {
    const ambiguous = `SIDE LETTER dated as of March 1, 2026 to the Credit Agreement dated as of February 10, 2026, among Northfield Components Corp., as Borrower.

SECTION 1. Agreement. Notwithstanding Section 7.01(b) of the Credit Agreement, the Borrower agrees that it shall not incur other Indebtedness under Section 7.01(b) exceeding $10,000,000, provided that Availability is at least $5,000,000.

SECTION 2. Effectiveness. This letter shall become effective on March 1, 2026.
`;
    const { result, state } = await compile([doc("credit-agreement", "Credit Agreement", CREDIT), doc("side-letter", "Side Letter", ambiguous)]);
    const effect = result.effects.find((e) => e.amendmentDocumentId === "side-letter");
    expect(effect?.newText).toBeNull();
    const provision = state.provisions.find((p) => p.sectionRef === "7.01(b)");
    expect(provision?.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(provision?.currentText).toContain("$30,000,000");
    expect(provision?.currentText).not.toContain("$10,000,000");
    expect(provision?.appliedChain).toEqual([]);
  });
});
