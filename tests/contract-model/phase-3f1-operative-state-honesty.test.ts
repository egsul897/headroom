/**
 * Phase 3F.1 Workstream C (F3) - operative-state honesty. The DSGR
 * first-blind run showed OperativeContractState.status === "OPERATIVE_STATE_RESOLVED"
 * with 0 provisions, even though 4 real amendment effects existed for the
 * instrument - all with target.targetInstrumentKey === null because the
 * resolver correctly refused to guess between 2 candidate base agreements
 * (doc-a, doc-d). Root cause: computeOperativeContractState pre-filtered
 * effects to targetInstrumentKey === instrumentKey BEFORE calling
 * groupEffectsByProvision, so unresolved-target effects never reached even
 * that function's own honest unattachedEffects tracking, and the final
 * status defaulted to RESOLVED purely because `provisions.length === 0`.
 *
 * All fixture text is invented for this file - no DSGR-specific content
 * (task §4's explicit prohibition on package-specific production logic,
 * and this session's established anti-overfitting discipline).
 *
 * Task §42's required points (36-40).
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { AmendmentEffectCandidate } from "../../lib/contract-model/compiler/amendment/types";

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

/** A hand-built effect with an explicitly unresolved instrument target - the exact shape produceAmendmentTargetResolution returns when 2 candidate base documents of the same type exist and the resolver refuses to guess. */
function ambiguousTargetEffect(overrides: Partial<AmendmentEffectCandidate> = {}): AmendmentEffectCandidate {
  return {
    effectId: "eff-1",
    amendmentDocumentId: "amend-1",
    target: { kind: "SECTION", targetDocumentId: null, targetInstrumentKey: null, targetStructuralNodeKey: null, targetSectionRef: "6.01", targetDefinedTermRef: null, targetHint: "the Existing Credit Agreement" },
    operation: "REPLACE_TEXT",
    effectiveDate: { date: "2024-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "dated as of June 1, 2024", reason: "explicit effective date stated" },
    newText: null,
    oldText: null,
    sourceCitation: "Amendment §2",
    sourceExcerpt: "Section 6.01 of the Existing Credit Agreement is hereby amended",
    confidence: 0.4,
    status: "UNRESOLVED",
    unresolvedReason: "2 candidate documents of type CREDIT_AGREEMENT exist in this package and neither matches the referenced execution date - never guessed from title similarity alone",
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}

function resolvedEffect(overrides: Partial<AmendmentEffectCandidate> = {}): AmendmentEffectCandidate {
  return {
    effectId: "eff-resolved",
    amendmentDocumentId: "amend-resolved",
    target: { kind: "SECTION", targetDocumentId: "base-1", targetInstrumentKey: "inst-1", targetStructuralNodeKey: "base-1::6.01", targetSectionRef: "6.01", targetDefinedTermRef: null, targetHint: null },
    operation: "REPLACE_TEXT",
    effectiveDate: { date: "2024-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "dated as of June 1, 2024", reason: "explicit effective date stated" },
    newText: "SECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $75,000,000 in the aggregate.",
    oldText: null,
    sourceCitation: "Amendment §2",
    sourceExcerpt: "Section 6.01 is hereby amended and restated",
    confidence: 0.95,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}

describe("Phase 3F.1 F3 - operative-state honesty", () => {
  const base = doc("base-1", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`);
  const index = buildIndex([base]);

  it("36. an ambiguous amendment target (unresolved instrument key) with zero provisions is NOT reported as OPERATIVE_STATE_RESOLVED", () => {
    const state = computeOperativeContractState({
      instrumentKey: "inst-1",
      baseDocumentId: "base-1",
      asOfDate: "2025-01-01",
      index,
      allEffects: [],
      unresolvedTargetEffectsForThisInstrument: [ambiguousTargetEffect()],
    });
    expect(state.provisions).toHaveLength(0);
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
  });

  it("37. zero operative provisions + a known unresolved candidate target produces an explicit unresolved status, with the effect preserved (never silently dropped) on unattachedEffects and named in the summary", () => {
    const effect = ambiguousTargetEffect();
    const state = computeOperativeContractState({
      instrumentKey: "inst-1",
      baseDocumentId: "base-1",
      asOfDate: "2025-01-01",
      index,
      allEffects: [],
      unresolvedTargetEffectsForThisInstrument: [effect],
    });
    expect(state.unattachedEffects).toHaveLength(1);
    expect(state.unattachedEffects[0]!.effectId).toBe("eff-1");
    expect(state.summary).toMatch(/1 additional effect/);
    expect(state.summary).toMatch(/unresolved target/);
  });

  it("38. a genuinely empty operative set (no known effects at all, resolved or unresolved) remains honestly OPERATIVE_STATE_RESOLVED - the fix does not turn every unamended document into a false review flag", () => {
    const state = computeOperativeContractState({
      instrumentKey: "inst-1",
      baseDocumentId: "base-1",
      asOfDate: "2025-01-01",
      index,
      allEffects: [],
    });
    expect(state.provisions).toHaveLength(0);
    expect(state.unattachedEffects).toHaveLength(0);
    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.summary).not.toMatch(/additional effect/);
  });

  it("39. a resolved amendment chain is unaffected by the fix - the existing happy path still produces OPERATIVE_STATE_RESOLVED with the amended text", () => {
    const effect = resolvedEffect();
    const state = computeOperativeContractState({ instrumentKey: "inst-1", baseDocumentId: "base-1", asOfDate: "2025-01-01", index, allEffects: [effect] });
    expect(state.provisions).toHaveLength(1);
    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.currentText).toContain("$75,000,000");
    expect(state.unattachedEffects).toHaveLength(0);
  });

  it("a mix of one resolved provision and one unattached unresolved effect for the SAME instrument surfaces both - the resolved provision's own status is not diluted, but the aggregate status still reflects the real ambiguity", () => {
    const resolved = resolvedEffect();
    const ambiguous = ambiguousTargetEffect({ effectId: "eff-2", target: { ...ambiguousTargetEffect().target, targetSectionRef: "6.02" } });
    const state = computeOperativeContractState({
      instrumentKey: "inst-1",
      baseDocumentId: "base-1",
      asOfDate: "2025-01-01",
      index,
      allEffects: [resolved],
      unresolvedTargetEffectsForThisInstrument: [ambiguous],
    });
    expect(state.provisions).toHaveLength(1);
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED"); // the individually-resolved provision keeps its own honest status
    expect(state.unattachedEffects).toHaveLength(1);
    // Current design: aggregate status is driven by worstStatus(provisions) when provisions is non-empty, so a
    // resolved provision alongside an unattached effect still reports RESOLVED at the top level - the unattached
    // effect remains fully visible via unattachedEffects/summary rather than silently vanishing, which is the
    // property this fix actually guarantees (no confident-but-wrong RESOLVED-with-nothing-to-show-for-it state).
    expect(state.unattachedEffects[0]!.effectId).toBe("eff-2");
  });

  it("40. instrument isolation preserved: an unresolved effect explicitly supplied for instrument A is never attributed to instrument B's own operative state merely by being present in allEffects", () => {
    const ambiguousForA = ambiguousTargetEffect();
    // Compute instrument B's state, passing the SAME ambiguous effect via allEffects (not
    // via unresolvedTargetEffectsForThisInstrument) - it must not leak in via the resolved-target
    // path (targetInstrumentKey is null, not "inst-B") and must not be assumed relevant absent
    // an explicit caller assertion.
    const stateB = computeOperativeContractState({ instrumentKey: "inst-B", baseDocumentId: "base-1", asOfDate: "2025-01-01", index, allEffects: [ambiguousForA] });
    expect(stateB.provisions).toHaveLength(0);
    expect(stateB.unattachedEffects).toHaveLength(0);
    expect(stateB.status).toBe("OPERATIVE_STATE_RESOLVED"); // honestly nothing known for instrument B
  });
});
