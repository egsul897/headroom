/**
 * "the ABL Credit Agreement dated as of ..." is a reference to that credit
 * agreement. An amendment that cannot be attached must not leave the
 * instrument RESOLVED. Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState, getOperativeDefinition } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

const BASE = `ABL CREDIT AGREEMENT dated as of September 9, 2026, among Harbor Lane Industries, Inc., as Borrower.

SECTION 1.01 Defined Terms. As used in this Agreement:
"Available Amount" means, at any time, the sum of $25,000,000 and retained excess cash flow.
"Indebtedness" means, as to any Person, all obligations of such Person for borrowed money.

SECTION 7.06 Restricted Payments. The Borrower shall not make any Restricted Payment except pursuant to the Available Amount.`;

const SMALLER = `"Available Amount" means, at any time, the sum of $15,000,000.`;

async function compile(documents: PackageDocumentInput[], baseDocumentId: string) {
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
  const instrumentKey = packageGraph.instruments.find((i) => i.documentIds.includes(baseDocumentId))?.instrumentKey ?? `instrument:${baseDocumentId}`;
  const state = computeOperativeContractState({ instrumentKey, baseDocumentId, asOfDate: "2027-03-31", index, allEffects: result.effects });
  return { result, state, packageGraph };
}

describe("qualified credit-agreement targets", () => {
  it("applies a definition amendment that names the ABL Credit Agreement and its execution date", async () => {
    const amendment = doc(
      "amendment-1",
      "First Amendment",
      `FIRST AMENDMENT dated as of December 1, 2026 to the ABL Credit Agreement dated as of September 9, 2026, among Harbor Lane Industries, Inc., as Borrower.\n\nSECTION 1. Amendments. The definition of "Available Amount" in Section 1.01 of the ABL Credit Agreement is hereby amended and restated in its entirety to read as follows: ${SMALLER}\n\nSECTION 2. Effectiveness. This Amendment shall become effective on December 1, 2026.\n`,
    );
    const { result, state } = await compile([doc("abl-credit-agreement", "ABL Credit Agreement", BASE), amendment], "abl-credit-agreement");
    const effect = result.effects.find((e) => e.operation === "REPLACE_DEFINITION");
    expect(effect?.target.targetDocumentId).toBe("abl-credit-agreement");
    expect(effect?.status).not.toBe("UNRESOLVED");
    const available = getOperativeDefinition(state, "Available Amount");
    expect(available?.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(available?.currentText).toContain("$15,000,000");
    expect(available?.currentText).not.toContain("$25,000,000");
    expect(getOperativeDefinition(state, "Indebtedness")).toBeNull();
  });

  it("does not report RESOLVED when an amendment names no agreement", async () => {
    const amendment = doc(
      "amendment-1",
      "First Amendment",
      `FIRST AMENDMENT dated as of December 1, 2026.\n\nSECTION 1. Amendments. The definition of "Available Amount" is hereby amended and restated in its entirety to read as follows: ${SMALLER}\n`,
    );
    const { state } = await compile([doc("abl-credit-agreement", "ABL Credit Agreement", BASE), amendment], "abl-credit-agreement");
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.unattachedEffects.length).toBeGreaterThan(0);
    expect(getOperativeDefinition(state, "Available Amount")).toBeNull();
  });
});
