/**
 * Operative-source authentication. No provider call.
 * A contents line is never an operative covenant because it is the only match or the longest match.
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import { parseDocumentStructure } from "../../../lib/contract-model/compiler/stage-structure";
import { authenticateStructuralOccurrence, operativeModelDispatchBlock, selectAuthenticatedSectionBodies, sha256Utf8, type OperativeAuthorityDecision } from "../../../lib/contract-model/compiler/operative-authority";
import type { StructuralNode } from "../../../lib/contract-model/compiler/types";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCaller } from "../../../lib/contract-model/compiler/semantic/caller";
import { emptyContextBundle, testCompilerInput } from "../semantic-compiler/test-helpers";

function node(partial: Pick<StructuralNode, "documentId" | "nodeId" | "nodeType" | "sectionRef" | "charStart" | "charEnd" | "parentNodeId"> & { ordinal?: number }): StructuralNode {
  return {
    heading: "",
    nodeKey: `${partial.documentId}::${partial.sectionRef}`,
    ordinal: partial.ordinal ?? 0,
    parentSectionRef: null,
    ...partial,
  };
}

function indexFor(documentId: string, text: string, nodes: StructuralNode[]) {
  return buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
}

describe("operative source authentication", () => {
  const toc = "Section 7.04 Asset Dispositions 233\n";
  const gap = "\n";
  const body = "Section 7.04 Asset Dispositions. The Borrower shall not sell any asset.\n";
  const child = "(a) The Borrower may sell inventory.\n";
  const text = toc + gap + body + child;
  const tocStart = 0;
  const bodyStart = toc.length + gap.length;
  const childStart = bodyStart + body.length;
  const doc = "unseen-synthetic-credit-agreement";
  const tocNode = node({ documentId: doc, nodeId: "toc", nodeType: "SECTION", sectionRef: "7.04", charStart: tocStart, charEnd: toc.length, parentNodeId: null });
  const bodyNode = node({ documentId: doc, nodeId: "body", nodeType: "SECTION", sectionRef: "7.04", charStart: bodyStart, charEnd: text.length, parentNodeId: null, ordinal: 1 });
  const childNode = node({ documentId: doc, nodeId: "child", nodeType: "CLAUSE", sectionRef: "7.04(a)", charStart: childStart, charEnd: text.length, parentNodeId: "body", ordinal: 0 });
  const index = indexFor(doc, text, [tocNode, bodyNode, childNode]);

  it("does not treat a contents line as operative when it is the only match", () => {
    const only = indexFor(doc, toc, [node({ documentId: doc, nodeId: "only", nodeType: "SECTION", sectionRef: "7.04", charStart: 0, charEnd: toc.length, parentNodeId: null })]);
    const decision = authenticateStructuralOccurrence({ node: only.getNodeById("only")!, index: only, supersessionStatus: "CURRENT_OPERATIVE" });
    expect(decision.structuralKind).toBe("CONTENTS_LISTING");
    expect(decision.authoritativeCurrent).toBe(false);
    expect(decision.refuseModelDispatch).toBe(true);
    expect(selectAuthenticatedSectionBodies([{ normalizedSourceRef: "7.04", structuralKind: decision.structuralKind, supersessionStatus: "CURRENT_OPERATIVE", sourceHashOk: true }], ["7.04"])).toEqual([]);
  });

  it("keeps the operative body when a longer contents line shares the label", () => {
    const longToc = `Section 12.03 ${"Very Long Contents Title ".repeat(20)} 14\n`;
    const shortBody = "Section 12.03 Payments. The Borrower shall pay.\n";
    const combined = longToc + shortBody;
    const longNode = node({ documentId: doc, nodeId: "long-toc", nodeType: "SECTION", sectionRef: "12.03", charStart: 0, charEnd: longToc.length, parentNodeId: null });
    const shortNode = node({ documentId: doc, nodeId: "short-body", nodeType: "SECTION", sectionRef: "12.03", charStart: longToc.length, charEnd: combined.length, parentNodeId: null, ordinal: 1 });
    const local = indexFor(doc, combined, [longNode, shortNode]);
    const listing = authenticateStructuralOccurrence({ node: local.getNodeById("long-toc")!, index: local, supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS" });
    const operative = authenticateStructuralOccurrence({ node: local.getNodeById("short-body")!, index: local, supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS" });
    expect(longToc.length).toBeGreaterThan(shortBody.length);
    expect(listing.structuralKind).toBe("CONTENTS_LISTING");
    expect(operative.structuralKind).toBe("OPERATIVE_OCCURRENCE");
    expect(operative.authoritativeCurrent).toBe(false);
    expect(operative.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
    const selected = selectAuthenticatedSectionBodies([
      { normalizedSourceRef: "12.03", structuralKind: listing.structuralKind, supersessionStatus: listing.supersessionStatus, sourceHashOk: true },
      { normalizedSourceRef: "12.03", structuralKind: operative.structuralKind, supersessionStatus: operative.supersessionStatus, sourceHashOk: true },
    ], ["12.03"]);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.structuralKind).toBe("OPERATIVE_OCCURRENCE");
  });

  it("refuses to choose between two operative bodies", () => {
    const a = "Section 4.01 First. The Borrower shall pay.\n";
    const b = "Section 4.01 Second. The Borrower shall not pay.\n";
    const combined = a + b;
    const local = indexFor(doc, combined, [
      node({ documentId: doc, nodeId: "a", nodeType: "SECTION", sectionRef: "4.01", charStart: 0, charEnd: a.length, parentNodeId: null }),
      node({ documentId: doc, nodeId: "b", nodeType: "SECTION", sectionRef: "4.01", charStart: a.length, charEnd: combined.length, parentNodeId: null, ordinal: 1 }),
    ]);
    const rows = ["a", "b"].map((id) => {
      const decision = authenticateStructuralOccurrence({ node: local.getNodeById(id)!, index: local, supersessionStatus: "CURRENT_OPERATIVE" });
      return { normalizedSourceRef: "4.01", structuralKind: decision.structuralKind, supersessionStatus: decision.supersessionStatus, sourceHashOk: true };
    });
    expect(rows.every((row) => row.structuralKind === "OPERATIVE_OCCURRENCE")).toBe(true);
    expect(selectAuthenticatedSectionBodies(rows, ["4.01"])).toEqual([]);
    expect(selectAuthenticatedSectionBodies(rows.map((row, index) => ({ ...row, occurrenceId: index === 0 ? "node-a" : "node-b" })), ["4.01"])).toEqual([]);
  });

  it("counts repeated discovery rows on one physical node as one body", () => {
    const repeated = [
      { normalizedSourceRef: "7.01", structuralKind: "OPERATIVE_OCCURRENCE" as const, supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS" as const, sourceHashOk: true, occurrenceId: "structural-node:same" },
      { normalizedSourceRef: "7.01", structuralKind: "OPERATIVE_OCCURRENCE" as const, supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS" as const, sourceHashOk: true, occurrenceId: "structural-node:same" },
      { normalizedSourceRef: "7.01", structuralKind: "CONTENTS_LISTING" as const, supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS" as const, sourceHashOk: true, occurrenceId: "structural-node:toc" },
    ];
    const selected = selectAuthenticatedSectionBodies(repeated, ["7.01"]);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.occurrenceId).toBe("structural-node:same");
    expect(selected[0]!.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
  });

  it("classifies a contents row whose title states a dollar amount, a ratio, or a month", () => {
    const dollarTitle = "Section 7.01 Minimum Liquidity of $50,000,000 225\n";
    const ratioTitle = "Section 7.11 Interest Coverage of 2.00 to 1 88\n";
    const monthTitle = "Section 2.01 Closing Date May 15 12\n";
    const titles = [dollarTitle, ratioTitle, monthTitle];
    for (const title of titles) {
      const local = indexFor(doc, title, [node({ documentId: doc, nodeId: "title-toc", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: title.length, parentNodeId: null })]);
      const decision = authenticateStructuralOccurrence({ node: local.getNodeById("title-toc")!, index: local, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(decision.structuralKind).toBe("CONTENTS_LISTING");
      expect(decision.refuseModelDispatch).toBe(true);
      expect(decision.authoritativeCurrent).toBe(false);
    }
    const basket = "Section 7.01 Minimum Liquidity. The basket is $50,000,000.\n";
    const basketIndex = indexFor(doc, basket, [node({ documentId: doc, nodeId: "basket", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: basket.length, parentNodeId: null })]);
    expect(authenticateStructuralOccurrence({ node: basketIndex.getNodeById("basket")!, index: basketIndex, supersessionStatus: "CURRENT_OPERATIVE" }).structuralKind).toBe("OPERATIVE_OCCURRENCE");
    const permission = "The Borrower may sell inventory.\n";
    const permissionIndex = indexFor(doc, permission, [node({ documentId: doc, nodeId: "permission", nodeType: "CLAUSE", sectionRef: "7.01(a)", charStart: 0, charEnd: permission.length, parentNodeId: null })]);
    expect(authenticateStructuralOccurrence({ node: permissionIndex.getNodeById("permission")!, index: permissionIndex, supersessionStatus: "CURRENT_OPERATIVE" }).structuralKind).toBe("OPERATIVE_OCCURRENCE");
  });

  it("does not refuse a raw-text fixture that supplies an index and no anchor", () => {
    expect(operativeModelDispatchBlock({ index, anchorNodeId: null, supersessionStatus: "CURRENT_OPERATIVE" })).toBeNull();
    expect(operativeModelDispatchBlock({ index: null, anchorNodeId: "body", supersessionStatus: "CURRENT_OPERATIVE" })).toBeNull();
    expect(operativeModelDispatchBlock({ index, anchorNodeId: "", supersessionStatus: "CURRENT_OPERATIVE" })).toBeNull();
  });

  it("classifies a contents row whose extraction split the label, title, and page number", () => {
    const extracted = "Section\u00a07.01\n\nIndebtedness\n\n225\n\n";
    const local = indexFor(doc, extracted, [node({ documentId: doc, nodeId: "split-toc", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: extracted.length, parentNodeId: null })]);
    const decision = authenticateStructuralOccurrence({ node: local.getNodeById("split-toc")!, index: local, supersessionStatus: "CURRENT_OPERATIVE" });
    expect(decision.structuralKind).toBe("CONTENTS_LISTING");
    expect(decision.refuseModelDispatch).toBe(true);
    expect(decision.authoritativeCurrent).toBe(false);
    const operative = "Section 7.01\n\nIndebtedness. The Borrower shall not incur debt.\n";
    const operativeIndex = indexFor(doc, operative, [node({ documentId: doc, nodeId: "split-body", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: operative.length, parentNodeId: null })]);
    expect(authenticateStructuralOccurrence({ node: operativeIndex.getNodeById("split-body")!, index: operativeIndex, supersessionStatus: "CURRENT_OPERATIVE" }).structuralKind).toBe("OPERATIVE_OCCURRENCE");
  });

  it("treats a definitions section as operative when it declares terms and contains no covenant predicate", () => {
    const definitions = [
      "SECTION 1.01 Defined Terms . As used in this Agreement, the following terms have the meanings specified below:",
      "",
      "\"Consolidated EBITDA\" means, for any period, Consolidated Net Income for such period.",
      "",
    ].join("\n");
    const local = indexFor(doc, definitions, [node({ documentId: doc, nodeId: "defs", nodeType: "SECTION", sectionRef: "1.01", charStart: 0, charEnd: definitions.length, parentNodeId: null })]);
    const decision = authenticateStructuralOccurrence({ node: local.getNodeById("defs")!, index: local, supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS" });
    expect(decision.structuralKind).toBe("OPERATIVE_OCCURRENCE");
    expect(decision.authoritativeCurrent).toBe(false);
    expect(decision.refuseModelDispatch).toBe(false);
    const colon = "\"Applicable Rate\": the rate described in this paragraph.\n";
    const colonIndex = indexFor(doc, colon, [node({ documentId: doc, nodeId: "colon", nodeType: "SECTION", sectionRef: "1.01", charStart: 0, charEnd: colon.length, parentNodeId: null })]);
    expect(authenticateStructuralOccurrence({ node: colonIndex.getNodeById("colon")!, index: colonIndex, supersessionStatus: "CURRENT_OPERATIVE" }).structuralKind).toBe("OPERATIVE_OCCURRENCE");
  });

  it("does not collapse the same label across documents", () => {
    const leftText = "Section 3.01 Use. The Borrower shall use proceeds.\n";
    const rightText = "Section 3.01 Use. The Guarantor shall use proceeds.\n";
    const left = node({ documentId: "doc-left", nodeId: "left", nodeType: "SECTION", sectionRef: "3.01", charStart: 0, charEnd: leftText.length, parentNodeId: null });
    const right = node({ documentId: "doc-right", nodeId: "right", nodeType: "SECTION", sectionRef: "3.01", charStart: 0, charEnd: rightText.length, parentNodeId: null });
    const both = buildStructuralIndex(new Map([["doc-left", { text: leftText, nodes: [left] }], ["doc-right", { text: rightText, nodes: [right] }]]), [], []);
    const leftDecision = authenticateStructuralOccurrence({ node: both.getNodeById("left")!, index: both, supersessionStatus: "CURRENT_OPERATIVE" });
    const rightDecision = authenticateStructuralOccurrence({ node: both.getNodeById("right")!, index: both, supersessionStatus: "CURRENT_OPERATIVE" });
    expect(leftDecision.sourceSha256).not.toBe(rightDecision.sourceSha256);
    expect(both.findNodesByRef("doc-left", "3.01").map((item) => item.nodeId)).toEqual(["left"]);
    expect(both.findNodesByRef("doc-right", "3.01").map((item) => item.nodeId)).toEqual(["right"]);
  });

  it("does not call unknown supersession current and does not dispatch a superseded base span", () => {
    const unknown = authenticateStructuralOccurrence({ node: index.getNodeById("body")!, index, supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS" });
    expect(unknown.structuralKind).toBe("OPERATIVE_OCCURRENCE");
    expect(unknown.authoritativeCurrent).toBe(false);
    expect(unknown.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
    expect(unknown.refuseModelDispatch).toBe(false);
    const superseded = authenticateStructuralOccurrence({ node: index.getNodeById("body")!, index, supersessionStatus: "KNOWN_SUPERSEDED" });
    expect(superseded.authoritativeCurrent).toBe(false);
    expect(superseded.refuseModelDispatch).toBe(true);
    expect(selectAuthenticatedSectionBodies([{ normalizedSourceRef: "7.04", structuralKind: "OPERATIVE_OCCURRENCE", supersessionStatus: "KNOWN_SUPERSEDED", sourceHashOk: true }], ["7.04"])).toEqual([]);
  });

  it("detects a source hash mismatch and a nested reference that is not itself a covenant", () => {
    const decision = authenticateStructuralOccurrence({ node: index.getNodeById("body")!, index, supersessionStatus: "CURRENT_OPERATIVE", expectedSha256: "0".repeat(64) });
    expect(decision.reason.startsWith("SOURCE_HASH_MISMATCH")).toBe(true);
    expect(decision.refuseModelDispatch).toBe(true);
    const nestedText = "the foregoing clause (y)\n";
    const nested = indexFor(doc, nestedText, [node({ documentId: doc, nodeId: "nested", nodeType: "SUBCLAUSE", sectionRef: "7.05(a)(4)(ii)(vi)(B)", charStart: 0, charEnd: nestedText.length, parentNodeId: null })]);
    const pointer = authenticateStructuralOccurrence({ node: nested.getNodeById("nested")!, index: nested, supersessionStatus: "CURRENT_OPERATIVE" });
    expect(pointer.structuralKind).toBe("NO_OPERATIVE_EVIDENCE");
    expect(pointer.authoritativeCurrent).toBe(false);
    expect(sha256Utf8(index.getNodeText("body", "DESCENDANTS"))).toBe(authenticateStructuralOccurrence({ node: index.getNodeById("body")!, index, supersessionStatus: "CURRENT_OPERATIVE" }).sourceSha256);
  });

  it("refuses a model dispatch for a contents-listing anchor and does not call the model", async () => {
    let calls = 0;
    const caller: SemanticCaller = { providerName: "test", model: "test", isSynthetic: true, compile: async () => { calls += 1; throw new Error("dispatched"); } };
    const input = testCompilerInput({
      operativeSourceText: toc.trim(),
      contextBundle: emptyContextBundle({ originatingStructuralNodeIds: ["toc"], originatingSupersessionStatus: "UNKNOWN_SUPERSESSION_STATUS" }),
      toolAccess: { structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() },
    });
    const result = await compileCovenantToIR(input, { caller });
    expect(result.status).toBe("FAILED");
    expect(result.failureReasons).toEqual(["OPERATIVE_AUTHORITY_REFUSED"]);
    expect(result.rules).toEqual([]);
    expect(calls).toBe(0);
    const missing = operativeModelDispatchBlock({ index, anchorNodeId: "missing-node", supersessionStatus: "CURRENT_OPERATIVE" });
    expect(missing?.refuseModelDispatch).toBe(true);
    expect(missing?.reason.startsWith("MISSING_OPERATIVE_AUTHORITY")).toBe(true);
  });

  it("classifies a parsed unseen document without using a character-count cutoff", () => {
    const parsedText = ["TABLE OF CONTENTS", "", "Section 8.02 Insurance 88", "", "ARTICLE VIII", "", "Section 8.02 Insurance. The Borrower shall maintain insurance.", ""].join("\n");
    const nodes = parseDocumentStructure({ documentId: "unseen-parser-doc", label: "unseen", text: parsedText });
    const parsed = buildStructuralIndex(new Map([["unseen-parser-doc", { text: parsedText, nodes }]]), [], []);
    const decisions = parsed.findNodesByRef("unseen-parser-doc", "8.02").map((item) => authenticateStructuralOccurrence({ node: item, index: parsed, supersessionStatus: "CURRENT_OPERATIVE" }));
    const listings = decisions.filter((item: OperativeAuthorityDecision) => item.structuralKind === "CONTENTS_LISTING");
    const operative = decisions.filter((item) => item.structuralKind === "OPERATIVE_OCCURRENCE");
    expect(listings.length + operative.length).toBeGreaterThan(0);
    expect(listings.every((item) => item.authoritativeCurrent === false)).toBe(true);
    if (operative.length === 1 && listings.length === 1) {
      expect(selectAuthenticatedSectionBodies(decisions.map((item) => ({ normalizedSourceRef: "8.02", structuralKind: item.structuralKind, supersessionStatus: item.supersessionStatus, sourceHashOk: true })), ["8.02"])).toHaveLength(1);
    }
  });
});
