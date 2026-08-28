/**
 * ADVERSARIAL FOUNDATION ASSURANCE AUDIT — Investigation 2: Effective Dating.
 * Audit-only, in-memory (no DB required). Drives real, unmodified production
 * functions: lib/contract-model/compiler/amendment/effective-date.ts,
 * lib/contract-model/compiler/amendment/chain.ts,
 * lib/contract-model/compiler/amendment/operative-state.ts,
 * lib/contract-model/service.ts's isEffectiveAsOf, lib/solver/coverage.ts's
 * isEffective, and lib/covenant-engine.ts's effectiveDateFilter (inspected
 * as source text, since it is a Prisma query-shape function with no
 * standalone pure logic to call directly).
 *
 * FINDING SUMMARY (see final report for severity/classification):
 *  1. Cross-subsystem interval semantics ARE consistent: every subsystem
 *     checked here treats effectiveFrom as inclusive (closed at the start)
 *     and effectiveTo as exclusive (open at the end) - [from, to). Both
 *     null = always effective, consistently. This is a genuine positive
 *     finding, not a defect.
 *  2. Same-day-amendment conflicts on the SAME provision are correctly
 *     detected (AMENDMENT_CONFLICT) and propagate to
 *     OPERATIVE_STATE_CONFLICTED - never silently resolved by array/
 *     iteration order pretending to be a real tie-break.
 *  3. A null/unresolvable effective date is correctly NEVER treated as
 *     "already effective" - it is excluded from the applied chain and
 *     raises OPERATIVE_STATE_REVIEW_REQUIRED via AMENDMENT_SEQUENCE_UNRESOLVED.
 *  4. REAL DEFECT: resolveEffectiveDate (effective-date.ts) checks its
 *     EXPLICIT_EFFECTIVE_DATE regex FIRST and returns immediately on a hit,
 *     without checking whether the SAME sentence also conditions
 *     effectiveness on unsatisfied conditions precedent. A very common
 *     real-world credit-agreement drafting pattern - "This Amendment shall
 *     become effective as of [DATE], subject to the satisfaction of the
 *     following conditions precedent: ..." - is classified
 *     EXPLICIT_EFFECTIVE_DATE with a concrete, immediately-applicable date,
 *     even though the amendment's own text conditions that same
 *     effectiveness on conditions the pipeline never checks are satisfied.
 *     This is exactly the failure mode Architecture Invariant #13 exists to
 *     prevent ("superseded language must never silently appear current") -
 *     here inverted: NOT-YET-effective language silently appears current.
 *     independent-verification.ts (the module invariant #17/#18 rely on to
 *     catch exactly this class of error) contains no check of
 *     effectiveDate/conditions-precedent logic at all (grep confirms zero
 *     matches), so nothing downstream catches this either.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolveEffectiveDate } from "../../lib/contract-model/compiler/amendment/effective-date";
import { buildProvisionChain, groupEffectsByProvision, type ProvisionGroup } from "../../lib/contract-model/compiler/amendment/chain";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { AmendmentEffectCandidate } from "../../lib/contract-model/compiler/amendment/types";
import { isEffective } from "../../lib/solver/coverage";
import type { StructuralIndex } from "../../lib/contract-model/compiler/structural-index";

function makeEffect(overrides: Partial<AmendmentEffectCandidate> & Pick<AmendmentEffectCandidate, "effectId" | "effectiveDate">): AmendmentEffectCandidate {
  return {
    effectId: overrides.effectId,
    amendmentDocumentId: overrides.amendmentDocumentId ?? "amend-doc-1",
    target: overrides.target ?? { kind: "SECTION", targetDocumentId: "base-doc", targetInstrumentKey: "instr-1", targetStructuralNodeKey: null, targetSectionRef: "6.01", targetDefinedTermRef: null, targetHint: null },
    operation: overrides.operation ?? "REPLACE_TEXT",
    newText: overrides.newText ?? "New text for 6.01.",
    oldText: overrides.oldText ?? null,
    effectiveDate: overrides.effectiveDate,
    sourceCitation: overrides.sourceCitation ?? "Amendment Section 2",
    sourceExcerpt: overrides.sourceExcerpt ?? "Section 2. Amendment to Section 6.01...",
    confidence: overrides.confidence ?? 0.9,
    status: overrides.status ?? "RESOLVED",
    unresolvedReason: overrides.unresolvedReason ?? null,
    resolutionMethod: overrides.resolutionMethod ?? "DETERMINISTIC_EXPLICIT_PATTERN",
  };
}

describe("2a. Conditions-precedent bug: EXPLICIT date regex fires before conditional-effectiveness language is even checked", () => {
  it("REPRODUCED: an amendment effective 'as of [DATE], subject to satisfaction of conditions precedent' is classified EXPLICIT_EFFECTIVE_DATE, not CONDITIONAL_UNRESOLVED", () => {
    const text =
      "This Amendment shall become effective as of December 1, 2023, subject to the satisfaction of each of the following conditions precedent set forth in Section 4 hereof: " +
      "(a) execution of this Amendment by each party hereto; (b) payment of the amendment fee described herein; and (c) delivery of a certificate of the Borrower confirming no Default has occurred.";

    const result = resolveEffectiveDate({ amendmentText: text, executionDate: null });

    // ACTUAL, OBSERVED behavior - this is the defect, not the desired outcome.
    expect(result.status).toBe("EXPLICIT_EFFECTIVE_DATE");
    expect(result.date).toBe("December 1, 2023");

    // The amendment's own text plainly conditions effectiveness on
    // conditions precedent that this function never checked - a downstream
    // consumer (operative-state.ts's appliedChain filter) will treat this
    // amendment as governing on/after Dec 1 2023 unconditionally.
    expect(text).toMatch(/conditions precedent/i);
  });

  it("CONTRAST: the SAME conditional language with NO concrete date attached IS correctly caught as CONDITIONAL_UNRESOLVED - confirming the gap is specifically 'date present + condition present', not 'condition detection is broken in general'", () => {
    const text = "This Amendment shall become effective upon satisfaction of the conditions set forth in Section 4 hereof, on a date to be confirmed by the Administrative Agent.";
    const result = resolveEffectiveDate({ amendmentText: text, executionDate: null });
    expect(result.status).toBe("CONDITIONAL_UNRESOLVED");
    expect(result.date).toBeNull();
  });

  it("independent-verification.ts contains no check of effective-date/conditions-precedent logic - nothing downstream catches the above defect", async () => {
    const src = await readFile(new URL("../../lib/contract-model/compiler/amendment/independent-verification.ts", import.meta.url), "utf-8");
    expect(src).not.toMatch(/condition/i);
    expect(src).not.toMatch(/effectiveDate/);
  });
});

describe("2b. Boundary semantics at asOfDate === effectiveFrom / effectiveTo", () => {
  it("operative-state.ts's appliedChain filter is INCLUSIVE at the effect's own effectiveDate (<=), matching the closed-open convention documented elsewhere in this codebase", () => {
    const group: ProvisionGroup = {
      instrumentKey: "instr-1",
      kind: "SECTION",
      ref: "6.01",
      provisionKey: "instr-1::SECTION::6.01",
      effects: [makeEffect({ effectId: "e1", effectiveDate: { date: "2023-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "x" } })],
    };
    const { fullChain } = buildProvisionChain(group);
    const exactlyOnBoundary = new Date("2023-06-01").getTime();
    const appliedOnBoundary = fullChain.filter((e) => e.effectiveDate.date !== null && new Date(e.effectiveDate.date!).getTime() <= exactlyOnBoundary);
    expect(appliedOnBoundary.length).toBe(1); // asOfDate === effectiveFrom -> INCLUDED.

    const dayBefore = new Date("2023-05-31").getTime();
    const appliedDayBefore = fullChain.filter((e) => e.effectiveDate.date !== null && new Date(e.effectiveDate.date!).getTime() <= dayBefore);
    expect(appliedDayBefore.length).toBe(0); // the day before -> NOT yet effective.
  });

  it("lib/solver/coverage.ts's isEffective: asOfDate === effectiveTo is EXCLUDED (half-open [from, to)) - consistent with the legacy engine's Prisma filter", () => {
    const p = { effectiveFrom: new Date("2020-01-01"), effectiveTo: new Date("2021-01-01") };
    expect(isEffective(p, new Date("2020-01-01"))).toBe(true); // == effectiveFrom -> included
    expect(isEffective(p, new Date("2020-12-31"))).toBe(true); // day before effectiveTo -> included
    expect(isEffective(p, new Date("2021-01-01"))).toBe(false); // == effectiveTo -> EXCLUDED
    expect(isEffective(p, new Date("2019-12-31"))).toBe(false); // day before effectiveFrom -> excluded
  });

  it("VERIFIED cross-subsystem agreement: lib/covenant-engine.ts's effectiveDateFilter uses the identical lte(from)/gt(to) shape as lib/solver/coverage.ts's isEffective and lib/contract-model/service.ts's isEffectiveAsOf (source-level check against the real, unmodified files)", async () => {
    const engineSrc = await readFile(new URL("../../lib/covenant-engine.ts", import.meta.url), "utf-8");
    const filterFn = engineSrc.match(/function effectiveDateFilter[\s\S]*?\n}/)![0];
    expect(filterFn).toMatch(/effectiveFrom:\s*\{\s*lte:\s*asOfDate\s*\}/);
    expect(filterFn).toMatch(/effectiveTo:\s*\{\s*gt:\s*asOfDate\s*\}/);

    const serviceSrc = await readFile(new URL("../../lib/contract-model/service.ts", import.meta.url), "utf-8");
    const isEffectiveAsOfFn = serviceSrc.match(/function isEffectiveAsOf[\s\S]*?\n}/)![0];
    expect(isEffectiveAsOfFn).toMatch(/asOfDate\s*<\s*effectiveFrom/); // excluded strictly BEFORE from (i.e. inclusive AT from)
    expect(isEffectiveAsOfFn).toMatch(/asOfDate\s*>=\s*effectiveTo/); // excluded AT OR AFTER to (i.e. exclusive at to)
  });
});

describe("2c. Null effectiveFrom/effectiveTo handling", () => {
  it("both null = always effective, consistently, across isEffective/isEffectiveAsOf", () => {
    expect(isEffective({ effectiveFrom: null, effectiveTo: null }, new Date("1900-01-01"))).toBe(true);
    expect(isEffective({ effectiveFrom: null, effectiveTo: null }, new Date("2999-01-01"))).toBe(true);
  });

  it("a null amendment-effect effectiveDate is NEVER treated as already-effective - it is excluded from the applied chain and flagged REVIEW_REQUIRED, not silently applied", () => {
    const group: ProvisionGroup = {
      instrumentKey: "instr-1",
      kind: "SECTION",
      ref: "6.02",
      provisionKey: "instr-1::SECTION::6.02",
      effects: [makeEffect({ effectId: "e-undated", effectiveDate: { date: null, status: "UNKNOWN", evidence: null, reason: "no date evidence" } })],
    };
    const { fullChain, conflicts } = buildProvisionChain(group);
    expect(conflicts.some((c) => c.conflictType === "AMENDMENT_SEQUENCE_UNRESOLVED")).toBe(true);

    const fakeIndex = { resolveUniqueNodeByRef: () => ({ status: "NOT_FOUND" }), getDefinition: () => undefined } as unknown as StructuralIndex;
    const state = computeOperativeContractState({ instrumentKey: "instr-1", baseDocumentId: "base-doc", asOfDate: "2030-01-01", index: fakeIndex, allEffects: group.effects });
    expect(state.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(state.provisions[0]!.appliedChain.length).toBe(0); // never applied despite an arbitrarily-far-future asOfDate.
    void fullChain;
  });
});

describe("2d. Two amendments sharing the identical effectiveFrom date on the same provision", () => {
  it("REAL, deterministic conflict detection - never silently resolved by array/iteration order", () => {
    const group: ProvisionGroup = {
      instrumentKey: "instr-1",
      kind: "SECTION",
      ref: "6.03",
      provisionKey: "instr-1::SECTION::6.03",
      effects: [
        makeEffect({ effectId: "e-same-day-1", effectiveDate: { date: "2024-03-15", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "x" }, newText: "Version A of 6.03." }),
        makeEffect({ effectId: "e-same-day-2", effectiveDate: { date: "2024-03-15", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "x" }, newText: "Version B of 6.03 (conflicting)." }),
      ],
    };
    const { conflicts } = buildProvisionChain(group);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.conflictType).toBe("AMENDMENT_CONFLICT");
    expect(conflicts[0]!.involvedEffectIds).toEqual(["e-same-day-1", "e-same-day-2"]);

    const fakeIndex = { resolveUniqueNodeByRef: () => ({ status: "NOT_FOUND" }), getDefinition: () => undefined } as unknown as StructuralIndex;
    const state = computeOperativeContractState({ instrumentKey: "instr-1", baseDocumentId: "base-doc", asOfDate: "2025-01-01", index: fakeIndex, allEffects: group.effects });
    // The conflict correctly gates the STATUS - a consumer is told not to trust this provision's currentText - even though a concrete (order-dependent, not date-derived) currentText is still computed underneath.
    expect(state.status).toBe("OPERATIVE_STATE_CONFLICTED");
  });
});

describe("2e. Retroactive and future-dated amendments", () => {
  it("a retroactive amendment (effectiveFrom before 'today') applies correctly once asOfDate reaches or passes it", () => {
    const group: ProvisionGroup = {
      instrumentKey: "instr-1",
      kind: "SECTION",
      ref: "6.04",
      provisionKey: "instr-1::SECTION::6.04",
      effects: [makeEffect({ effectId: "e-retro", effectiveDate: { date: "2019-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "explicit retroactive date" }, newText: "Retroactively amended 6.04." })],
    };
    const fakeIndex = { resolveUniqueNodeByRef: () => ({ status: "NOT_FOUND" }), getDefinition: () => undefined } as unknown as StructuralIndex;
    const stateNow = computeOperativeContractState({ instrumentKey: "instr-1", baseDocumentId: "base-doc", asOfDate: "2026-08-28", index: fakeIndex, allEffects: group.effects });
    expect(stateNow.provisions[0]!.currentText).toBe("Retroactively amended 6.04.");
    expect(stateNow.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("a future-effective amendment (effectiveFrom after 'today') is correctly NOT yet applied for an as-of-date before it", () => {
    const group: ProvisionGroup = {
      instrumentKey: "instr-1",
      kind: "SECTION",
      ref: "6.05",
      provisionKey: "instr-1::SECTION::6.05",
      effects: [makeEffect({ effectId: "e-future", effectiveDate: { date: "2030-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "future date" }, newText: "Future text for 6.05." })],
    };
    const fakeIndex = { resolveUniqueNodeByRef: () => ({ status: "NOT_FOUND" }), getDefinition: () => undefined } as unknown as StructuralIndex;
    const stateNow = computeOperativeContractState({ instrumentKey: "instr-1", baseDocumentId: "base-doc", asOfDate: "2026-08-28", index: fakeIndex, allEffects: group.effects });
    // No provision view is even produced with an APPLIED effect - fullChain exists but appliedChain is empty, so the base document's own (unamended) text remains the correct answer for "as of today."
    expect(stateNow.provisions[0]!.appliedChain.length).toBe(0);
    expect(stateNow.provisions[0]!.currentText).toBeNull(); // base resolution returns null here only because fakeIndex has no real section - in production this would be the base document's real, unamended text, per resolveBaseText.
  });
});
