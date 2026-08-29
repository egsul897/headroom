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

describe("Combined failure: extraction corruption + amendment - FIXED (Phase 3F.1.5.R sub-task 3)", () => {
  it("a badly-extracted base document (INVALID_SOURCE_SPAN health finding on the exact node) + a real resolved amendment effect targeting it -> FIXED: operative-state now consults the index's own health diagnostics and withholds confidence", () => {
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

    // FIXED: operative-state.ts now calls index.healthDiagnostics() (via
    // resolveBaseText/buildProvisionView's own structuralHealthForNode) for
    // the exact physical occurrence a provision's base reference resolved
    // to - OPERATIVE_CONFIDENCE requires STRUCTURAL_HEALTH_SUFFICIENT, so a
    // node the index's own health pass already flagged ERROR can no longer
    // support a confident OPERATIVE_STATE_RESOLVED, even though its legal
    // reference ("6.01") is a genuinely UNIQUE match and a real, dated
    // amendment effect resolved against it.
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.status).toBe("OPERATIVE_STATE_PARTIAL");
    const provision = state.provisions[0]!;
    expect(provision.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(provision.reviewRequired).toBe(true);
    // The corrupted node's own identity is still surfaced for a reviewer to
    // find (never hidden) - only CONFIDENCE in its content is withheld.
    expect(provision.targetResolutionStatus).toBe("UNIQUE"); // the legal-reference match itself is genuinely unambiguous - this is a SEPARATE axis from structural health.
    expect(provision.structuralHealthStatus).toBe("STRUCTURAL_HEALTH_UNSAFE");
    expect(provision.structuralHealthIssues.length).toBeGreaterThan(0);
    expect(provision.structuralHealthIssues.join(" ")).toMatch(/INVALID_SOURCE_SPAN/);
    // currentText is withheld - never derived from (nor overwritten with an
    // amendment's own text attached to) a physical occurrence the index
    // itself already flags as corrupted.
    expect(provision.currentText).toBeNull();
    // "What the amendment SAYS" remains visible for a reviewer even though
    // "where it safely applies" does not - the same attemptedText
    // discipline Phase 3F.1.4 §6B already established elsewhere in this
    // module.
    expect(provision.attemptedText).toBe("The threshold is hereby increased to $10,000,000.");
    expect(provision.unresolvedIssues.join(" ")).toMatch(/STRUCTURAL_HEALTH_SUFFICIENT/);
  });

  it("the SAME corrupted section with NO amendment activity at all never enters this module's own scope (unchanged, pre-existing behavior) - structural health composition only ever applies to provisions this module actually builds a view for", () => {
    // Documents this module's own "Scope decision" header comment: a
    // section never amended has no OperativeProvisionView at all (Phase 2A's
    // structural index already answers "the base document's own text
    // governs" directly) - this fix does not change that scope, only what
    // happens once a real amendment DOES target a provision.
    const shortText = "x".repeat(30);
    const corruptedSection = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "6.01", charStart: 0, charEnd: 500, nodeId: "sec-601" });
    const index = buildStructuralIndex(new Map([["base-doc", { text: shortText, nodes: [corruptedSection] }]]), [], []);
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [] });
    expect(state.provisions).toHaveLength(0);
    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED"); // no amendment activity for this instrument at all - genuinely nothing to report, unchanged.
  });

  it("a HEALTHY node targeted by a real resolved amendment effect is completely unaffected by this fix - no regression for genuinely healthy structure", () => {
    const healthySection = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: 100, nodeId: "sec-701" });
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(200), nodes: [healthySection] }]]), [], []);
    expect(index.healthDiagnostics().some((f) => f.severity === "ERROR")).toBe(false);

    const amendEffect = effect({ effectId: "eff-healthy", targetSectionRef: "7.01", newText: "The threshold is hereby increased to $5,000,000." });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [amendEffect] });

    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
    const provision = state.provisions[0]!;
    expect(provision.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(provision.structuralHealthStatus).toBe("STRUCTURAL_HEALTH_SUFFICIENT");
    expect(provision.structuralHealthIssues).toEqual([]);
    expect(provision.currentText).toBe("The threshold is hereby increased to $5,000,000.");
    expect(provision.reviewRequired).toBe(false);
  });

  it("a healthy PARENT section whose own DESCENDANT is corrupted (INVALID_SOURCE_SPAN) is ALSO withheld - the health check is not blind to corruption one level down, since getNodeText(nodeId, \"DESCENDANTS\") pulls the descendant's own text into the parent's reported text", () => {
    const parent = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "6.10", charStart: 0, charEnd: 100, nodeId: "sec-610" });
    const corruptedChild = n({ documentId: "base-doc", nodeType: "CLAUSE", sectionRef: "6.10(a)", charStart: 10, charEnd: 9999, nodeId: "sec-610-a", parentNodeId: "sec-610", parentSectionRef: "6.10" }); // charEnd far exceeds document text length - corrupted
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(150), nodes: [parent, corruptedChild] }]]), [], []);
    expect(index.healthDiagnostics().find((f) => f.code === "INVALID_SOURCE_SPAN" && f.nodeId === "sec-610-a")).toBeDefined();

    const amendEffect = effect({ effectId: "eff-parent", targetSectionRef: "6.10", newText: "New parent text." });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [amendEffect] });

    const provision = state.provisions[0]!;
    expect(provision.structuralHealthStatus).toBe("STRUCTURAL_HEALTH_UNSAFE");
    expect(provision.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(provision.currentText).toBeNull();
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
  // Phase 3F.1.4 (P0-2 remediation) updated this suite's own assertions
  // below: resolveBaseText's DEFINITION branch (lib/contract-model/compiler/
  // amendment/operative-state.ts:63) no longer falls back to a no-documentId
  // `index.getDefinition(group.ref)` call - it was THIS exact fallback that
  // let a missing base-document definition silently resolve to an unrelated
  // document's own same-named definition, which is the bug this test
  // originally documented. Asserting the leak's continued presence after it
  // has been deliberately fixed would be asserting the wrong thing, not
  // preserving a real safety gate - matching the precedent set by
  // tests/contract-model/architecture-proposal-node-identity.test.ts's own
  // header comment for the same situation. The test still proves the
  // SAME two faults individually (missing base definition; a real,
  // not-yet-effective amendment targeting it) - it now proves the honest,
  // fixed outcome (null/not-found, never a wrong-but-confident cross-document
  // answer) rather than the leak.
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

  it("base document does NOT define the amended term (missing definition) - FIXED: operative-state.ts's own independent, document-scoped ambiguity/uniqueness check (§6A) now gates currentText, AND the cross-document fallback line itself (§6A's Workstream B counterpart) no longer falls back to an unrelated document at all", () => {
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
    // FIXED (Phase 3F.1.4 §6A - Workstream D's independent
    // targetResolutionStatus gate, layered on top of Workstream B's own
    // narrow fix removing the line-63 cross-document fallback entirely):
    // resolveBaseText's DEFINITION branch derives targetResolutionStatus
    // independently, from index.allDefinitions() scoped strictly to
    // baseDocumentId - since "Excluded Subsidiary" has ZERO matches in
    // base-doc specifically, this is NOT_FOUND. currentText is therefore
    // never populated from the leaked cross-document text - doubly so now,
    // since the line-63 fallback itself no longer even attempts a
    // cross-document lookup (Workstream B) AND the independent status gate
    // would have caught it even if it had (Workstream D).
    expect(provision.currentSourceDocumentId).toBe("base-doc");
    expect(provision.currentText).toBeNull(); // no leaked cross-document text - both fixes independently close this.
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
