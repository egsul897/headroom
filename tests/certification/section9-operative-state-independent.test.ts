/**
 * Phase 3F.1.6 Final Foundation Certification - Section 9 (Operative State).
 *
 * INDEPENDENT certification of amendment target resolution, effective
 * dating (including conditional/P1-4), conflicts, and - the primary focus,
 * per the certification charter - the NEW structural-health composition
 * (Phase 3F.1.5.R sub-task 3, amendment/operative-state.ts's
 * structuralHealthForNode). This file deliberately does NOT reuse
 * tests/foundation-audit/combined-failures.test.ts's own exact scenarios
 * (SECTION-kind INVALID_SOURCE_SPAN corruption) - it builds genuinely
 * different adversarial constructions:
 *
 *   1. A DEFINITION-kind provision (not SECTION) whose declaring physical
 *      occurrence is independently flagged ERROR by healthDiagnostics() -
 *      an untested branch of resolveBaseText (operative-state.ts lines
 *      ~258-264) as of this session.
 *   2. A different ERROR-severity finding code (OVERLAPPING_INCOMPATIBLE_SPAN
 *      via a genuinely mis-nested sibling/child pair) rather than
 *      INVALID_SOURCE_SPAN, to prove the composition is not narrowly
 *      wired to one specific health-finding code.
 *   3. An independent construction of the P1-4 conditional-effective-date
 *      fix, using different drafting language than the original fix's own
 *      regression test, plus a positive control proving the fix does not
 *      over-suppress a genuinely unconditional date merely because
 *      unrelated conditions-precedent language exists elsewhere in the
 *      same amendment (Architecture Invariant #34).
 *
 * All constructions use the REAL, unmodified production functions
 * (buildStructuralIndex, computeOperativeContractState, resolveEffectiveDate)
 * - no production code is modified or mocked at the module level.
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { resolveEffectiveDate } from "../../lib/contract-model/compiler/amendment/effective-date";
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

describe("Section 9 independent adversarial construction #1: DEFINITION-kind structural-health corruption (untested resolveBaseText branch)", () => {
  it("a UNIQUE, resolved DEFINITION target whose declaring physical occurrence is independently ERROR-flagged by healthDiagnostics() FAILS CLOSED - no currentText, structuralHealthStatus reflects the problem, status downgrades", () => {
    const baseDocText = "x".repeat(400);
    // The defined term's OWN declaring node ("sec-def-avail") carries an
    // invalid span (charEnd 9999 >> actual document text length 400) -
    // simulating a real extraction-boundary corruption on a DEFINITIONS
    // article specifically, the class of failure most likely to affect a
    // credit agreement's own dense defined-term block.
    const corruptedDefNode = n({ documentId: "base-doc", nodeType: "CLAUSE", sectionRef: "1.01(Available Amount)", charStart: 50, charEnd: 9999, nodeId: "sec-def-avail" });
    const def: DetectedDefinition = {
      documentId: "base-doc",
      exactTerm: "Available Amount",
      normalizedTerm: "available amount",
      sourceNodeKey: null,
      sourceNodeId: "sec-def-avail",
      charStart: 50,
      charEnd: 9999,
      definitionExcerpt: "means, as of any date of determination, the sum of...",
    };
    const index = buildStructuralIndex(new Map([["base-doc", { text: baseDocText, nodes: [corruptedDefNode] }]]), [def], []);

    // Fault #1 confirmed individually: healthDiagnostics() flags the definition's own declaring node.
    const health = index.healthDiagnostics();
    const finding = health.find((f) => f.nodeId === "sec-def-avail" && f.severity === "ERROR");
    expect(finding).toBeDefined();
    expect(finding!.code).toBe("INVALID_SOURCE_SPAN");

    // Fault #2: a real, dated, resolved amendment effect targets this exact defined term, with captured newText.
    const amendEffect = effect({ effectId: "eff-def-1", targetDefinedTermRef: "Available Amount", newText: "means, as of any date of determination, the sum of (a) $25,000,000 plus (b) the Cumulative Credit." });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [amendEffect] });

    // FAIL CLOSED: even though the definition's own uniqueness (docScoped) is genuinely UNIQUE, the corrupted declaring node must withhold confidence.
    expect(state.status).toBe("OPERATIVE_STATE_PARTIAL");
    const provision = state.provisions[0]!;
    expect(provision.kind).toBe("DEFINITION");
    expect(provision.targetResolutionStatus).toBe("UNIQUE"); // genuinely unique definition match - a separate axis from structural health.
    expect(provision.structuralHealthStatus).toBe("STRUCTURAL_HEALTH_UNSAFE");
    expect(provision.structuralHealthIssues.join(" ")).toMatch(/INVALID_SOURCE_SPAN/);
    expect(provision.currentText).toBeNull(); // never derived from the corrupted declaring occurrence.
    expect(provision.attemptedText).toBe("means, as of any date of determination, the sum of (a) $25,000,000 plus (b) the Cumulative Credit."); // "what the amendment says" stays visible.
    expect(provision.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(provision.reviewRequired).toBe(true);
  });

  it("negative control: the SAME defined term with a HEALTHY declaring node is unaffected - no false positive on ordinary, uncorrupted definitions", () => {
    const baseDocText = "x".repeat(400);
    const healthyDefNode = n({ documentId: "base-doc", nodeType: "CLAUSE", sectionRef: "1.01(Available Amount)", charStart: 50, charEnd: 120, nodeId: "sec-def-avail-ok" });
    const def: DetectedDefinition = { documentId: "base-doc", exactTerm: "Available Amount", normalizedTerm: "available amount", sourceNodeKey: null, sourceNodeId: "sec-def-avail-ok", charStart: 50, charEnd: 120, definitionExcerpt: "means the sum of..." };
    const index = buildStructuralIndex(new Map([["base-doc", { text: baseDocText, nodes: [healthyDefNode] }]]), [def], []);
    expect(index.healthDiagnostics().some((f) => f.severity === "ERROR")).toBe(false);

    const amendEffect = effect({ effectId: "eff-def-2", targetDefinedTermRef: "Available Amount", newText: "means the sum of $10,000,000." });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [amendEffect] });
    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.structuralHealthStatus).toBe("STRUCTURAL_HEALTH_SUFFICIENT");
    expect(state.provisions[0]!.currentText).toBe("means the sum of $10,000,000.");
  });
});

describe("Section 9 independent adversarial construction #2: a DIFFERENT ERROR-severity health-finding code (OVERLAPPING_INCOMPATIBLE_SPAN, not INVALID_SOURCE_SPAN) still gates operative confidence", () => {
  it("a section whose own child clause's span is not nested within its declared parent's span (a genuine mis-nesting, not a truncation) still fails closed for the PARENT'S own amendment", () => {
    // The parent section's span [0,100) does not contain the child's span
    // [150,200) at all - a genuinely different corruption SHAPE than an
    // out-of-bounds charEnd (INVALID_SOURCE_SPAN): here every individual
    // span is independently "valid" (within document length), but the
    // declared parent/child relationship is structurally impossible.
    const parent = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "7.05", charStart: 0, charEnd: 100, nodeId: "sec-705" });
    const misnestedChild = n({ documentId: "base-doc", nodeType: "CLAUSE", sectionRef: "7.05(a)", charStart: 150, charEnd: 200, nodeId: "sec-705-a", parentNodeId: "sec-705", parentSectionRef: "7.05" });
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(300), nodes: [parent, misnestedChild] }]]), [], []);

    const findings = index.healthDiagnostics().filter((f) => f.severity === "ERROR");
    expect(findings.some((f) => f.code === "OVERLAPPING_INCOMPATIBLE_SPAN" && f.nodeId === "sec-705-a")).toBe(true);

    const amendEffect = effect({ effectId: "eff-mis-1", targetSectionRef: "7.05", newText: "New parent text for 7.05." });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [amendEffect] });

    const provision = state.provisions[0]!;
    expect(provision.targetResolutionStatus).toBe("UNIQUE"); // "7.05" itself is an unambiguous physical match.
    expect(provision.structuralHealthStatus).toBe("STRUCTURAL_HEALTH_UNSAFE"); // but its own descendant is structurally impossible - never trusted.
    expect(provision.structuralHealthIssues.join(" ")).toMatch(/OVERLAPPING_INCOMPATIBLE_SPAN/);
    expect(provision.currentText).toBeNull();
    expect(provision.status).toBe("OPERATIVE_STATE_PARTIAL");
  });
});

describe("Section 9 independent adversarial construction #3: P1-4 conditional-effective-date, different drafting language than the original fix's own regression test", () => {
  it("an explicit date immediately followed, in the same clause, by 'upon satisfaction of the conditions set forth in Section 9 hereof' resolves CONDITIONAL_UNRESOLVED, not a confident explicit date", () => {
    const amendmentText =
      `THIRD AMENDMENT TO CREDIT AGREEMENT dated as of February 2, 2025. ` +
      `This Amendment shall become effective as of March 1, 2025, upon satisfaction of the conditions set forth in Section 9 hereof (the date such conditions are satisfied, the "Amendment Effective Date").`;
    const result = resolveEffectiveDate({ amendmentText, executionDate: "February 2, 2025" });
    expect(result.status).toBe("CONDITIONAL_UNRESOLVED");
    expect(result.date).toBeNull();
    // The false-confident outcome this closes: treating "March 1, 2025" as a settled, unconditional effective date.
    expect(result.evidence).toMatch(/March 1, 2025/);
  });

  it("positive control (Architecture Invariant #34 - do not over-suppress): a genuinely unconditional explicit date, with unrelated conditions-precedent language appearing in a LATER, separate sentence about a different subject, still resolves EXPLICIT_EFFECTIVE_DATE", () => {
    const amendmentText =
      `FOURTH AMENDMENT TO CREDIT AGREEMENT dated as of May 1, 2025. ` +
      `This Amendment shall become effective as of June 1, 2025. Separately, the Lenders' obligation to fund any Incremental Facility hereunder is subject to the satisfaction of customary conditions precedent set forth in the applicable Incremental Amendment.`;
    const result = resolveEffectiveDate({ amendmentText, executionDate: "May 1, 2025" });
    expect(result.status).toBe("EXPLICIT_EFFECTIVE_DATE");
    expect(result.date).toBe("June 1, 2025");
  });

  it("conditional language BEFORE the explicit date, in the same clause, is also caught (not just the forward direction)", () => {
    const amendmentText = `FIFTH AMENDMENT dated as of July 1, 2025. Subject to the occurrence of the conditions described in Exhibit A attached hereto, this Amendment is effective on August 1, 2025.`;
    const result = resolveEffectiveDate({ amendmentText, executionDate: "July 1, 2025" });
    expect(result.status).toBe("CONDITIONAL_UNRESOLVED");
    expect(result.date).toBeNull();
  });
});

describe("Section 9 baseline re-certification: ambiguous target, missing target, and genuine conflict remain honestly unresolved (spot-check, real production functions)", () => {
  it("an ambiguous SECTION target (two physical occurrences sharing a label) never populates currentText", () => {
    const a = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "8.02", charStart: 0, charEnd: 50, nodeId: "n-a" });
    const b = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "8.02", charStart: 200, charEnd: 250, nodeId: "n-b" });
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(400), nodes: [a, b] }]]), [], []);
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [effect({ effectId: "e-amb", targetSectionRef: "8.02", newText: "new text" })] });
    expect(state.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(state.provisions[0]!.currentText).toBeNull();
  });

  it("a genuinely missing SECTION target never fabricates a section that does not exist", () => {
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(100), nodes: [] }]]), [], []);
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [effect({ effectId: "e-missing", targetSectionRef: "99.99", newText: "new text" })] });
    expect(state.provisions[0]!.targetResolutionStatus).toBe("NOT_FOUND");
    expect(state.provisions[0]!.currentText).toBeNull();
  });

  it("two genuinely conflicting same-date effects against a UNIQUE target withhold currentText and expose both candidates", () => {
    const sec = n({ documentId: "base-doc", nodeType: "SECTION", sectionRef: "6.15", charStart: 0, charEnd: 50, nodeId: "n-615" });
    const index = buildStructuralIndex(new Map([["base-doc", { text: "x".repeat(200), nodes: [sec] }]]), [], []);
    const e1 = effect({ effectId: "conflict-a", targetSectionRef: "6.15", newText: "Threshold is $10,000,000.", effectiveDate: { date: "2024-03-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } });
    const e2 = effect({ effectId: "conflict-b", targetSectionRef: "6.15", newText: "Threshold is $20,000,000.", effectiveDate: { date: "2024-03-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: "base-doc", asOfDate: "2024-06-01", index, allEffects: [e1, e2] });
    expect(state.status).toBe("OPERATIVE_STATE_CONFLICTED");
    const provision = state.provisions[0]!;
    expect(provision.currentText).toBeNull();
    expect(provision.candidateTexts.sort()).toEqual(["Threshold is $10,000,000.", "Threshold is $20,000,000."]);
  });
});
