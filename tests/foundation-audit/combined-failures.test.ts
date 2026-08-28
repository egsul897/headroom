/**
 * Foundation Audit (Section 20) - Part 2: Combined/Compound Failures.
 * Two faults injected together, testing specifically for FALSE CERTAINTY
 * that neither individual fault would have produced on its own - the
 * highest-value part of this workstream per the audit brief. AUDIT-ONLY,
 * no production code modified.
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { AmendmentEffectCandidate } from "../../lib/contract-model/compiler/amendment/types";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { DetectedDefinition } from "../../lib/contract-model/compiler/structural-definitions";

function n(overrides: Partial<StructuralNode> & Pick<StructuralNode, "documentId" | "nodeType" | "sectionRef" | "charStart" | "charEnd">): StructuralNode {
  return {
    documentId: overrides.documentId,
    nodeType: overrides.nodeType,
    heading: overrides.heading ?? overrides.sectionRef,
    sectionRef: overrides.sectionRef,
    nodeKey: overrides.nodeKey ?? `${overrides.documentId}::${overrides.sectionRef.replace(/\s+/g, "")}`,
    nodeId: overrides.nodeId ?? `synthetic:${overrides.documentId}:${overrides.nodeType}:${overrides.charStart}`,
    charStart: overrides.charStart,
    charEnd: overrides.charEnd,
    ordinal: overrides.ordinal ?? 0,
    parentSectionRef: overrides.parentSectionRef ?? null,
    parentNodeId: overrides.parentNodeId ?? null,
  };
}

function effect(overrides: Partial<AmendmentEffectCandidate> & { effectId: string; targetSectionRef?: string; targetDefinedTermRef?: string; targetInstrumentKey?: string }): AmendmentEffectCandidate {
  return {
    effectId: overrides.effectId,
    amendmentDocumentId: overrides.amendmentDocumentId ?? "amend-doc",
    target: {
      kind: overrides.targetSectionRef ? "SECTION" : "DEFINITION",
      targetDocumentId: overrides.target?.targetDocumentId ?? "base-doc",
      targetInstrumentKey: overrides.targetInstrumentKey ?? "instrument-1",
      targetStructuralNodeKey: null,
      targetSectionRef: overrides.targetSectionRef ?? null,
      targetDefinedTermRef: overrides.targetDefinedTermRef ?? null,
      targetHint: null,
    },
    operation: overrides.operation ?? "MODIFY_THRESHOLD",
    effectiveDate: overrides.effectiveDate ?? { date: "2024-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "effective as of January 1, 2024", reason: "explicit" },
    newText: overrides.newText ?? null,
    oldText: overrides.oldText ?? null,
    sourceCitation: overrides.sourceCitation ?? "Amendment §1",
    sourceExcerpt: overrides.sourceExcerpt ?? "excerpt",
    confidence: overrides.confidence ?? 0.9,
    status: overrides.status ?? "RESOLVED",
    unresolvedReason: overrides.unresolvedReason ?? null,
    resolutionMethod: overrides.resolutionMethod ?? "DETERMINISTIC_EXPLICIT_PATTERN",
  };
}

describe("Combined failure: extraction corruption + amendment", () => {
  it("a badly-extracted base document (INVALID_SOURCE_SPAN health finding on the exact node) + a real resolved amendment effect targeting it -> operative-state confidently reports OPERATIVE_STATE_RESOLVED, NEVER consulting the index's own health diagnostics", () => {
    const shortText = "x".repeat(30); // deliberately short so the section's own charEnd below is invalid
    const corruptedSection = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "6.01", charStart: 0, charEnd: 500, nodeId: "sec-601" }); // charEnd(500) >> shortText.length(30) - truncated/corrupted extraction
    const index = buildStructuralIndex(new Map([["base-doc", { text: shortText, nodes: [corruptedSection] }]]), [], []);

    const health = index.healthDiagnostics();
    const corruptionFinding = health.find((f) => f.code === "INVALID_SOURCE_SPAN" && f.nodeId === "sec-601");
    expect(corruptionFinding).toBeDefined();
    expect(corruptionFinding!.severity).toBe("ERROR"); // fault #1, individually detected.

    // Fault #2: a real, dated, resolved amendment effect targeting exactly this corrupted section, with a captured newText (so resolveBaseText's own null-base-text path never masks this).
    const amendEffect = effect({ effectId: "eff-1", targetSectionRef: "6.01", newText: "The threshold is hereby increased to $10,000,000." });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [amendEffect] });

    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED"); // CONFIRMED: confident RESOLVED status, computed from a node the index's OWN health pass had already flagged as structurally corrupted.
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
    // operative-state.ts never calls index.healthDiagnostics() anywhere (confirmed by inspection) - the two subsystems never compose.
    // This is exactly the emergent risk the audit brief describes: extraction corruption alone is flagged (ERROR); amendment resolution alone
    // is flagged RESOLVED correctly for a healthy node; TOGETHER, the corruption signal is silently lost and the amendment layer reports full
    // confidence in a section whose own physical extraction is already known-bad.
  });
});

describe("Combined failure: ambiguous amendment target (via duplicate label) + no CURRENTLY-applying effect as of the query date - FIXED", () => {
  it("a duplicate-labeled base section (AMBIGUOUS under resolveUniqueNodeByRef) + a real amendment effect whose effective date is AFTER the query asOfDate -> FIXED: no longer masked as RESOLVED merely because nothing has applied yet", () => {
    const sectionA = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "6.04", charStart: 0, charEnd: 100, nodeId: "sec-604-a" });
    const sectionB = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "6.04", charStart: 500, charEnd: 600, nodeId: "sec-604-b" }); // same label, second physical occurrence - genuine ambiguity
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(1000), nodes: [sectionA, sectionB] }]]), [], []);
    expect(index.resolveUniqueNodeByRef("base-doc", "6.04").status).toBe("AMBIGUOUS"); // fault #1 confirmed individually.

    // Fault #2: a real amendment effect targets this same ambiguous section, but its effective date is in the FUTURE relative to the query's asOfDate, so it never enters appliedChain.
    const futureEffect = effect({ effectId: "eff-2", targetSectionRef: "6.04", effectiveDate: { date: "2030-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-01-01", index, allEffects: [futureEffect] });

    // FIXED (Phase 3F.1.4 §6A/§6B): the provision's own base target
    // resolution status is now checked independently of appliedChain -
    // an AMBIGUOUS base reference is disclosed regardless of whether any
    // effect has applied yet, closing exactly the "false certainty" gap
    // this combined-failure scenario proved.
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(state.provisions[0]!.unresolvedIssues.length).toBeGreaterThan(0);
    expect(state.provisions[0]!.unresolvedIssues.join(" ")).toMatch(/ambiguous/i); // a reviewer can now tell WHY, not just THAT.
    expect(state.provisions[0]!.candidateSourceNodeIds.sort()).toEqual(["sec-604-a", "sec-604-b"]);
  });
});

describe("Combined failure: amendment target ambiguity/missing-definition + cross-document definition leakage in resolveBaseText's own fallback", () => {
  const defOtherDoc: DetectedDefinition = {
    documentId: "unrelated-other-doc",
    exactTerm: "Excluded Subsidiary",
    normalizedTerm: "excluded subsidiary",
    sourceNodeKey: null,
    sourceNodeId: null,
    charStart: 0,
    charEnd: 20,
    definitionExcerpt: "means, with respect to UNRELATED INSTRUMENT, any Subsidiary designated under a COMPLETELY DIFFERENT agreement's own Section 9.09",
  };

  it("base document does NOT define the amended term (missing definition) - FIXED: operative-state.ts's own independent, document-scoped ambiguity/uniqueness check (§6A) now gates currentText, so the cross-document fallback's leaked value is never trusted as a confident answer even though the fallback line itself is untouched", () => {
    const baseDocText = "x".repeat(500); // base-doc's own text - genuinely contains NO definition of "Excluded Subsidiary" (a dropped/missing definition)
    const otherDocText = "TEXT FROM A COMPLETELY UNRELATED DOCUMENT, NEVER PART OF base-doc's OWN OWN INSTRUMENT. " + "y".repeat(400);
    const index = buildStructuralIndex(
      new Map([
        ["base-doc", { text: baseDocText, nodes: [] }],
        ["unrelated-other-doc", { text: otherDocText, nodes: [] }],
      ]),
      [defOtherDoc], // ONLY the unrelated document defines this term; base-doc's own definitions list is genuinely empty (missing definition).
      []
    );
    expect(index.getDefinition("Excluded Subsidiary", "base-doc")).toBeUndefined(); // fault #1 (missing definition), confirmed in isolation.

    // Effective date set in the FUTURE relative to asOfDate, so this effect never enters appliedChain and never overwrites currentText itself -
    // this isolates resolveBaseText's own leaked value (the base/unamended text the view falls back to) from the amendment-application loop.
    const amendEffect = effect({ effectId: "eff-3", targetDefinedTermRef: "Excluded Subsidiary", effectiveDate: { date: "2030-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [amendEffect] });

    const provision = state.provisions[0]!;
    // FIXED (Phase 3F.1.4 §6A - Workstream D, not the narrow line-63
    // fallback fix itself, which remains untouched and is a separate
    // workstream's own remediation): resolveBaseText's DEFINITION branch
    // now derives targetResolutionStatus independently, from
    // index.allDefinitions() scoped strictly to baseDocumentId - since
    // "Excluded Subsidiary" has ZERO matches in base-doc specifically,
    // this is NOT_FOUND regardless of what the line-63 fallback's `def`
    // value resolves to. currentText is therefore never populated from
    // the leaked cross-document text, as a direct (and correct) side
    // effect of the P0 fix's own "only UNIQUE may confidently attach"
    // discipline applying uniformly to both SECTION and DEFINITION kinds.
    expect(provision.currentSourceDocumentId).toBe("base-doc");
    expect(provision.currentText).toBeNull(); // no leaked cross-document text - the P0 fix closes this incidentally.
    expect(provision.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    expect(provision.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(provision.targetResolutionStatus).toBe("NOT_FOUND");
    expect(provision.unresolvedIssues.some((i) => i.toLowerCase().includes("not found"))).toBe(true);
  });
});

describe("Combined failure: out-of-order amendment ingestion + same-day effective dates - FIXED (§6D)", () => {
  it("AMENDMENT_CONFLICT status IS correctly order-independent (both ingestion orders reach CONFLICTED), and currentText is now ALSO order-invariant - withheld entirely, with the real competing candidates exposed via candidateTexts in a stable (effectId-sorted) order regardless of ingestion order", () => {
    const sectionNode = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "8.01", charStart: 0, charEnd: 100, nodeId: "sec-801" });
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(200), nodes: [sectionNode] }]]), [], []);

    const effect1 = effect({ effectId: "eff-A-first-amendment", targetSectionRef: "8.01", newText: "Text from Amendment A.", effectiveDate: { date: "2024-03-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } });
    const effect2 = effect({ effectId: "eff-B-second-amendment", targetSectionRef: "8.01", newText: "Text from Amendment B.", effectiveDate: { date: "2024-03-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } }); // IDENTICAL effective date

    const orderAB = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [effect1, effect2] });
    const orderBA = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [effect2, effect1] }); // same two effects, reversed ingestion order

    expect(orderAB.status).toBe("OPERATIVE_STATE_CONFLICTED"); // correctly detected regardless of order - GOOD, invariant 21 holds at the STATUS level.
    expect(orderBA.status).toBe("OPERATIVE_STATE_CONFLICTED");

    // FIXED: currentText no longer follows ingestion order - it is
    // withheld entirely (null) in BOTH orders, and candidateTexts (sorted
    // by effectId, never by array/chain position) is byte-identical
    // regardless of which order the same two real amendment documents
    // were ingested in - proving input-order invariance directly.
    expect(orderAB.provisions[0]!.currentText).toBeNull();
    expect(orderBA.provisions[0]!.currentText).toBeNull();
    expect(orderAB.provisions[0]!.candidateTexts).toEqual(["Text from Amendment A.", "Text from Amendment B."]);
    expect(orderBA.provisions[0]!.candidateTexts).toEqual(orderAB.provisions[0]!.candidateTexts);
  });
});
