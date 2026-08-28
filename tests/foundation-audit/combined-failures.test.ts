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

describe("Combined failure: ambiguous amendment target (via duplicate label) + no CURRENTLY-applying effect as of the query date", () => {
  it("a duplicate-labeled base section (AMBIGUOUS under resolveUniqueNodeByRef) + a real amendment effect whose effective date is AFTER the query asOfDate -> still reports OPERATIVE_STATE_RESOLVED with null text, silently indistinguishable from 'never amended, base text is authoritative'", () => {
    const sectionA = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "6.04", charStart: 0, charEnd: 100, nodeId: "sec-604-a" });
    const sectionB = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "6.04", charStart: 500, charEnd: 600, nodeId: "sec-604-b" }); // same label, second physical occurrence - genuine ambiguity
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(1000), nodes: [sectionA, sectionB] }]]), [], []);
    expect(index.resolveUniqueNodeByRef("base-doc", "6.04").status).toBe("AMBIGUOUS"); // fault #1 confirmed individually.

    // Fault #2: a real amendment effect targets this same ambiguous section, but its effective date is in the FUTURE relative to the query's asOfDate, so it never enters appliedChain.
    const futureEffect = effect({ effectId: "eff-2", targetSectionRef: "6.04", effectiveDate: { date: "2030-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-01-01", index, allEffects: [futureEffect] });

    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED"); // CONFIRMED false certainty: textMissingDespiteAppliedEffect only fires when appliedChain.length>0; a not-yet-effective amendment means appliedChain is empty, so the ambiguous-base signal (base.text===null because AMBIGUOUS, not because "no amendment ever touched it") is completely lost.
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.unresolvedIssues).toHaveLength(0); // nothing tells a caller WHY currentText is null - it is indistinguishable from "this section legitimately has no captured text yet."
    // Contrast: an UNAMBIGUOUS section with zero amendment activity at all would never even generate a provision (task's own documented V1 scope:
    // "only provisions with >=1 recorded amendment effect are represented") - so a caller reading `status: RESOLVED, currentText: null` for THIS
    // provision has no way to tell "ambiguous base, unresolved" apart from any other RESOLVED-with-a-future-effect provision. This is the
    // "does the missing/ambiguous-region signal get lost, making it look like a clean case" failure mode the audit brief specifically names.
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

  it("base document does NOT define the amended term (missing definition) - operative-state's resolveBaseText silently falls back to a DIFFERENT, unrelated document's own same-named definition, with zero signal that this happened", () => {
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
    // CONFIRMED cross-document leakage: resolveBaseText's DEFINITION branch is `index.getDefinition(group.ref, baseDocumentId) ?? index.getDefinition(group.ref)`
    // (lib/contract-model/compiler/amendment/operative-state.ts:63) - the second, no-documentId call silently matches the UNRELATED document's own definition.
    expect(provision.currentSourceDocumentId).toBe("base-doc"); // the view's OWN documentId field still claims base-doc (never overwritten - no applied effect ran)...
    expect(provision.currentText).toContain("COMPLETELY UNRELATED DOCUMENT"); // ...but the text substance is fetched from a wholly unrelated document (in fact its ENTIRE raw text, since getDefinitionFullText spans to the next definition or document end and this fixture doc has no other definition) once def itself is the wrong-document match.
    expect(provision.status).toBe("OPERATIVE_STATE_RESOLVED"); // no applied effect + no conflict + no review-flagged effect -> confidently RESOLVED, carrying leaked cross-document text.
    expect(provision.unresolvedIssues.some((i) => i.toLowerCase().includes("cross-document") || i.toLowerCase().includes("different document"))).toBe(false);
  });
});

describe("Combined failure: out-of-order amendment ingestion + same-day effective dates", () => {
  it("AMENDMENT_CONFLICT status IS correctly order-independent (both ingestion orders reach CONFLICTED) - but the reported currentText is NOT: it reflects whichever effect happens to sort last among same-day ties, which is ingestion order, not legal precedence", () => {
    const sectionNode = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "8.01", charStart: 0, charEnd: 100, nodeId: "sec-801" });
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(200), nodes: [sectionNode] }]]), [], []);

    const effect1 = effect({ effectId: "eff-A-first-amendment", targetSectionRef: "8.01", newText: "Text from Amendment A.", effectiveDate: { date: "2024-03-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } });
    const effect2 = effect({ effectId: "eff-B-second-amendment", targetSectionRef: "8.01", newText: "Text from Amendment B.", effectiveDate: { date: "2024-03-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } }); // IDENTICAL effective date

    const orderAB = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [effect1, effect2] });
    const orderBA = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [effect2, effect1] }); // same two effects, reversed ingestion order

    expect(orderAB.status).toBe("OPERATIVE_STATE_CONFLICTED"); // correctly detected regardless of order - GOOD, invariant 21 holds at the STATUS level.
    expect(orderBA.status).toBe("OPERATIVE_STATE_CONFLICTED");

    // But the underlying currentText differs by ingestion order alone (stable-sort ties preserve original array order) - a real, if narrower,
    // invariant-21 concern: "re-running the same inputs" (the same two real amendment documents) with a different arrival order (a genuine
    // real-world possibility - two amendments uploaded/processed in parallel) produces a DIFFERENT currentText value for a byte-identical
    // legal question, even though both are correctly gated behind CONFLICTED status.
    expect(orderAB.provisions[0]!.currentText).toBe("Text from Amendment B.");
    expect(orderBA.provisions[0]!.currentText).toBe("Text from Amendment A.");
    expect(orderAB.provisions[0]!.currentText).not.toBe(orderBA.provisions[0]!.currentText);
  });
});
