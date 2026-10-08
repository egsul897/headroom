/**
 * Operative-state properties that must not depend on effect-array order.
 * Same-day replacements stay conflicted. An effect with no instrument key
 * never becomes a provision's applied amendment.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { AmendmentEffectCandidate } from "../../lib/contract-model/compiler/amendment/types";

const BASE = `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`;

function index() {
  const document = { documentId: "base-1", label: "CA", text: BASE };
  const nodes = parseDocumentStructure(document);
  return buildStructuralIndex(new Map([[document.documentId, { text: BASE, nodes }]]), detectStructuralDefinitions(document.documentId, BASE, nodes), []);
}

function effect(args: { id: string; date: string; text: string; status?: AmendmentEffectCandidate["status"] }): AmendmentEffectCandidate {
  return {
    effectId: args.id,
    amendmentDocumentId: `amend-${args.id}`,
    target: { kind: "SECTION", targetDocumentId: "base-1", targetInstrumentKey: "inst-1", targetStructuralNodeKey: "base-1::6.01", targetSectionRef: "6.01", targetDefinedTermRef: null, targetHint: null },
    operation: "REPLACE_TEXT",
    effectiveDate: { date: args.date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: args.date, reason: "explicit effective date stated" },
    newText: args.text,
    oldText: null,
    sourceCitation: "Amendment §2",
    sourceExcerpt: "Section 6.01 is hereby amended and restated",
    confidence: 0.9,
    status: args.status ?? "RESOLVED",
    unresolvedReason: args.status === "RESOLVED" ? null : "the replacement text is not the only candidate",
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
  };
}

function unattached(id: string): AmendmentEffectCandidate {
  return {
    ...effect({ id, date: "2024-01-01", text: "unused" }),
    target: { kind: "SECTION", targetDocumentId: null, targetInstrumentKey: null, targetStructuralNodeKey: null, targetSectionRef: "6.02", targetDefinedTermRef: null, targetHint: "the Existing Credit Agreement" },
    newText: null,
    status: "UNRESOLVED",
    unresolvedReason: "the instrument was not identified",
  };
}

function snapshot(effects: AmendmentEffectCandidate[], unresolved: AmendmentEffectCandidate[] = []) {
  const state = computeOperativeContractState({
    instrumentKey: "inst-1",
    baseDocumentId: "base-1",
    asOfDate: "2025-01-01",
    index: index(),
    allEffects: effects,
    unresolvedTargetEffectsForThisInstrument: unresolved,
  });
  return {
    status: state.status,
    provisions: state.provisions.map((p) => ({ status: p.status, currentText: p.currentText, candidateTexts: [...(p.candidateTexts ?? [])] })),
    unattached: state.unattachedEffects.map((e) => e.effectId).sort(),
    applied: state.provisions.flatMap((p) => p.appliedChain.map((e) => e.effectId)).sort(),
  };
}

describe("operative-state order properties", () => {
  const structural = index();

  it("reversing a dated chain does not change the operative text", () => {
    const chain = [
      effect({ id: "a", date: "2024-01-01", text: "SECTION 6.01 Indebtedness. The cap is $60,000,000." }),
      effect({ id: "b", date: "2024-06-01", text: "SECTION 6.01 Indebtedness. The cap is $70,000,000." }),
      effect({ id: "c", date: "2024-12-01", text: "SECTION 6.01 Indebtedness. The cap is $80,000,000." }),
    ];
    const forward = snapshot(chain);
    const backward = snapshot([...chain].reverse());
    expect(backward).toEqual(forward);
    expect(forward.provisions[0]?.currentText).toContain("$80,000,000");
    expect(forward.status).toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("two replacements on the same date stay conflicted in either order", () => {
    const left = effect({ id: "left", date: "2024-06-01", text: "SECTION 6.01 Indebtedness. The cap is $60,000,000." });
    const right = effect({ id: "right", date: "2024-06-01", text: "SECTION 6.01 Indebtedness. The cap is $90,000,000." });
    for (const order of [[left, right], [right, left]]) {
      const state = computeOperativeContractState({ instrumentKey: "inst-1", baseDocumentId: "base-1", asOfDate: "2025-01-01", index: structural, allEffects: order });
      expect(state.provisions[0]?.status).toBe("OPERATIVE_STATE_CONFLICTED");
      expect(state.provisions[0]?.currentText).toBeNull();
      expect(state.provisions[0]?.candidateTexts?.slice().sort()).toEqual([left.newText, right.newText].sort());
    }
  });

  it("an effect with no instrument key never enters an applied chain", () => {
    const loose = unattached("loose");
    const dated = effect({ id: "dated", date: "2024-06-01", text: "SECTION 6.01 Indebtedness. The cap is $70,000,000." });
    const state = computeOperativeContractState({
      instrumentKey: "inst-1",
      baseDocumentId: "base-1",
      asOfDate: "2025-01-01",
      index: structural,
      allEffects: [loose, dated, loose],
      unresolvedTargetEffectsForThisInstrument: [loose],
    });
    const applied = state.provisions.flatMap((p) => p.appliedChain.map((e) => e.effectId));
    expect(applied).not.toContain("loose");
    expect(state.unattachedEffects.map((e) => e.effectId)).toContain("loose");
    expect(state.provisions.some((p) => p.status === "OPERATIVE_STATE_RESOLVED" && p.currentText?.includes("$70,000,000"))).toBe(true);
  });
});
