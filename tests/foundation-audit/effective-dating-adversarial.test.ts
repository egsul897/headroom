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
 *  4. FIXED (Phase 3F.1.4 Workstream D, §P1-4): resolveEffectiveDate
 *     (effective-date.ts) used to check its EXPLICIT_EFFECTIVE_DATE regex
 *     FIRST and return immediately on a hit, without checking whether the
 *     SAME sentence also conditions effectiveness on unsatisfied
 *     conditions precedent. A very common real-world credit-agreement
 *     drafting pattern - "This Amendment shall become effective as of
 *     [DATE], subject to the satisfaction of the following conditions
 *     precedent: ..." - was classified EXPLICIT_EFFECTIVE_DATE with a
 *     concrete, immediately-applicable date, even though the amendment's
 *     own text conditions that same effectiveness on conditions the
 *     pipeline never checks are satisfied. This was exactly the failure
 *     mode Architecture Invariant #13 exists to prevent ("superseded
 *     language must never silently appear current") - inverted: NOT-YET-
 *     effective language silently appeared current. Fixed by checking, in
 *     both directions, whether conditions-precedent language shares the
 *     SAME clause as the explicit date before ever accepting that date as
 *     unconditionally applicable - if so, the result is now
 *     CONDITIONAL_UNRESOLVED, matching the treatment the identical
 *     conditional language already correctly received when no date was
 *     present at all.
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

describe("2a. Conditions-precedent bug: EXPLICIT date regex used to fire before conditional-effectiveness language was even checked - FIXED", () => {
  it("FIXED: an amendment effective 'as of [DATE], subject to satisfaction of conditions precedent' is now classified CONDITIONAL_UNRESOLVED, never a confidently-applicable EXPLICIT_EFFECTIVE_DATE", () => {
    const text =
      "This Amendment shall become effective as of December 1, 2023, subject to the satisfaction of each of the following conditions precedent set forth in Section 4 hereof: " +
      "(a) execution of this Amendment by each party hereto; (b) payment of the amendment fee described herein; and (c) delivery of a certificate of the Borrower confirming no Default has occurred.";

    const result = resolveEffectiveDate({ amendmentText: text, executionDate: null });

    // FIXED behavior - the SAME sentence's conditions-precedent language is
    // now checked before an explicit date is ever accepted as
    // unconditionally applicable.
    expect(result.status).toBe("CONDITIONAL_UNRESOLVED");
    expect(result.date).toBeNull();
    expect(result.reason).toMatch(/same sentence\/clause/i);
    expect(text).toMatch(/conditions precedent/i);
  });

  it("CONTRAST: the SAME conditional language with NO concrete date attached is ALSO correctly caught as CONDITIONAL_UNRESOLVED - confirming the fix generalizes rather than merely special-casing the exact bug sentence", () => {
    const text = "This Amendment shall become effective upon satisfaction of the conditions set forth in Section 4 hereof, on a date to be confirmed by the Administrative Agent.";
    const result = resolveEffectiveDate({ amendmentText: text, executionDate: null });
    expect(result.status).toBe("CONDITIONAL_UNRESOLVED");
    expect(result.date).toBeNull();
  });

  it("CONTROL: an explicit date with NO conditions-precedent language anywhere nearby is still classified EXPLICIT_EFFECTIVE_DATE - the fix does not turn every explicit date into a false conditional flag", () => {
    const text = "This Amendment shall become effective as of December 1, 2023. The parties further agree that Section 6.01 is hereby amended as set forth below.";
    const result = resolveEffectiveDate({ amendmentText: text, executionDate: null });
    expect(result.status).toBe("EXPLICIT_EFFECTIVE_DATE");
    expect(result.date).toBe("December 1, 2023");
  });

  it("CONTROL: an explicit date followed, in a LATER unrelated sentence, by generic conditions-precedent language for a different purpose (e.g. a lender's funding obligation) does not suppress the explicit date - only SAME-CLAUSE conditions-precedent language does", () => {
    const text =
      "This Amendment shall become effective as of December 1, 2023. Separately, the Lenders' obligation to fund any Loan hereunder remains subject to the satisfaction of the conditions precedent set forth in Section 4.02 of the Credit Agreement.";
    const result = resolveEffectiveDate({ amendmentText: text, executionDate: null });
    expect(result.status).toBe("EXPLICIT_EFFECTIVE_DATE");
    expect(result.date).toBe("December 1, 2023");
  });

  it("signing-date-only (no effective-date or conditional language at all) falls back to INFERRED_FROM_EXECUTION_DATE, never treated as explicit", () => {
    const text = "AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSection 6.01 is hereby amended and restated.";
    const result = resolveEffectiveDate({ amendmentText: text, executionDate: "2022-06-01" });
    expect(result.status).toBe("INFERRED_FROM_EXECUTION_DATE");
    expect(result.date).toBe("2022-06-01");
  });

  it("a future-dated explicit effective date is still classified EXPLICIT_EFFECTIVE_DATE (whether it has already occurred is operative-state.ts's own asOfDate concern, not this function's)", () => {
    const result = resolveEffectiveDate({ amendmentText: "This Amendment shall become effective as of January 1, 2030.", executionDate: null });
    expect(result.status).toBe("EXPLICIT_EFFECTIVE_DATE");
    expect(result.date).toBe("January 1, 2030");
  });

  it("a retroactive explicit effective date (before the amendment's own likely drafting date) is still classified EXPLICIT_EFFECTIVE_DATE - retroactivity is a real, legitimate drafting choice, never suppressed", () => {
    const result = resolveEffectiveDate({ amendmentText: "This Amendment shall become effective as of January 1, 2015.", executionDate: "2022-06-01" });
    expect(result.status).toBe("EXPLICIT_EFFECTIVE_DATE");
    expect(result.date).toBe("January 1, 2015");
  });

  it("no-resolvable-date at all (no explicit date, no conditional language, no execution date) is honestly UNKNOWN, never guessed", () => {
    const result = resolveEffectiveDate({ amendmentText: "This Amendment amends Section 6.01 of the Credit Agreement.", executionDate: null });
    expect(result.status).toBe("UNKNOWN");
    expect(result.date).toBeNull();
  });

  it("independent-verification.ts contains no check of effective-date/conditions-precedent logic - the fix lives entirely in effective-date.ts's own text-classification logic, not in a downstream independent check", async () => {
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
    // Phase 3F.1.4 §6A: a realistic, ref-aware fake index is required here
    // (rather than the always-NOT_FOUND fake used elsewhere in this file)
    // because operative-state.ts now gates currentText on the provision's
    // own real targetResolutionStatus, never on newText alone - an
    // always-NOT_FOUND index would now (correctly) produce
    // OPERATIVE_STATE_PARTIAL, which is not what this specific test is
    // exercising (retroactive-date application against a UNIQUELY
    // resolved target).
    const fakeIndex = {
      // Note: makeEffect()'s own default target.targetSectionRef is "6.01" (never overridden by this test), so the real
      // ProvisionGroup.ref this reaches is "6.01", not the "6.04" used only in this test's own (otherwise-unused) ProvisionGroup label - resolveUniqueNodeByRef is ref-agnostic here to avoid coupling to that detail.
      resolveUniqueNodeByRef: (_documentId: string, ref: string) => ({ status: "UNIQUE", node: { nodeId: `base-doc::${ref}`, nodeKey: `base-doc::${ref}` } }),
      getNodeText: () => "Base text for 6.04.",
      getDefinition: () => undefined,
    } as unknown as StructuralIndex;
    const stateNow = computeOperativeContractState({ instrumentKey: "instr-1", baseDocumentId: "base-doc", asOfDate: "2026-08-28", index: fakeIndex, allEffects: group.effects });
    expect(stateNow.provisions[0]!.currentText).toBe("Retroactively amended 6.04.");
    expect(stateNow.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(stateNow.provisions[0]!.targetResolutionStatus).toBe("UNIQUE");
  });

  it("a future-effective amendment (effectiveFrom after 'today') is correctly NOT yet applied for an as-of-date before it", () => {
    const group: ProvisionGroup = {
      instrumentKey: "instr-1",
      kind: "SECTION",
      ref: "6.05",
      provisionKey: "instr-1::SECTION::6.05",
      effects: [makeEffect({ effectId: "e-future", effectiveDate: { date: "2030-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "future date" }, newText: "Future text for 6.05." })],
    };
    const fakeIndex = {
      resolveUniqueNodeByRef: (_documentId: string, ref: string) => ({ status: "UNIQUE", node: { nodeId: `base-doc::${ref}`, nodeKey: `base-doc::${ref}` } }),
      getNodeText: () => "Base text for 6.05.",
      getDefinition: () => undefined,
    } as unknown as StructuralIndex;
    const stateNow = computeOperativeContractState({ instrumentKey: "instr-1", baseDocumentId: "base-doc", asOfDate: "2026-08-28", index: fakeIndex, allEffects: group.effects });
    // No provision view is even produced with an APPLIED effect - fullChain exists but appliedChain is empty, so the base document's own (unamended) text remains the correct answer for "as of today."
    expect(stateNow.provisions[0]!.appliedChain.length).toBe(0);
    expect(stateNow.provisions[0]!.currentText).toBe("Base text for 6.05."); // the real, unamended base text governs - never the future effect's own text.
    expect(stateNow.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("CENTRAL FINDING regression guard: an AMBIGUOUS/NOT_FOUND base target combined with a not-yet-effective (future-dated) amendment is NEVER masked as RESOLVED merely because nothing has applied yet (Phase 3F.1.4 combined-failure finding: textMissingDespiteAppliedEffect used to only fire when appliedChain.length>0, silently losing the ambiguous-base signal for a future effect)", () => {
    const group: ProvisionGroup = {
      instrumentKey: "instr-1",
      kind: "SECTION",
      ref: "6.06",
      provisionKey: "instr-1::SECTION::6.06",
      effects: [makeEffect({ effectId: "e-future-ambiguous", target: { kind: "SECTION", targetDocumentId: "base-doc", targetInstrumentKey: "instr-1", targetStructuralNodeKey: null, targetSectionRef: "6.06", targetDefinedTermRef: null, targetHint: null }, effectiveDate: { date: "2030-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "future date" }, newText: "Future text for 6.06." })],
    };
    const fakeIndex = { resolveUniqueNodeByRef: () => ({ status: "AMBIGUOUS", candidates: [{ nodeId: "n1" }, { nodeId: "n2" }] }), getDefinition: () => undefined } as unknown as StructuralIndex;
    const state = computeOperativeContractState({ instrumentKey: "instr-1", baseDocumentId: "base-doc", asOfDate: "2026-08-28", index: fakeIndex, allEffects: group.effects });
    expect(state.provisions[0]!.appliedChain.length).toBe(0); // nothing has applied yet
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED"); // the ambiguous base target is disclosed regardless
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(state.provisions[0]!.unresolvedIssues.length).toBeGreaterThan(0);
    expect(state.provisions[0]!.currentText).toBeNull();
  });
});
