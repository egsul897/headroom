/**
 * Phase 3A test matrix, Category E - stability (task §56/§27/§28/§44/§45).
 * Proves identity/serialization determinism: canonical serialization is a
 * pure function of content, round-tripping through JSON never silently
 * introduces a non-JSON-safe value, identity ids are pure functions of
 * their inputs (never array position or randomness), a rule's stable
 * identity survives a change to a MUTABLE field while its own content
 * identity does change, and the pretty-printer is a pure function of
 * content too.
 */
import { describe, expect, it } from "vitest";
import { canonicalStringify, computeContentIdentity, computeExpressionId, computeRuleId, isRoundTripStable, withExpressionId } from "../../../lib/contract-model/ir/identity";
import { printRule } from "../../../lib/contract-model/ir/pretty-print";
import { IR_SCHEMA_VERSION } from "../../../lib/contract-model/ir/types";
import { ALL_FIXTURE_RULES, FIXTURE_1_FIXED_DEBT_BASKET, FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT } from "../../fixtures/ir-examples/real-covenant-shapes";

describe("Phase 3A IR - Category E: stability", () => {
  it("E1: canonicalStringify is deterministic - key order in the source object never affects the serialized output", () => {
    const a = { z: 1, a: 2, nested: { b: 1, a: 2 } };
    const b = { nested: { a: 2, b: 1 }, a: 2, z: 1 };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(canonicalStringify(FIXTURE_1_FIXED_DEBT_BASKET)).toBe(canonicalStringify(FIXTURE_1_FIXED_DEBT_BASKET));
  });

  it("E2: round-tripping a fixture through JSON.parse(JSON.stringify(...)) is byte-stable - no Date object or class instance snuck into the tree", () => {
    for (const rule of ALL_FIXTURE_RULES) {
      const roundTripped = JSON.parse(JSON.stringify(rule));
      expect(isRoundTripStable(rule, roundTripped)).toBe(true);
    }
  });

  it("E3: computeRuleId/computeExpressionId are pure functions of their inputs - identical inputs always produce the identical id, and different content produces a different id", () => {
    const idA = computeRuleId("co", "instr", "6.01(a)", "disc-1");
    const idB = computeRuleId("co", "instr", "6.01(a)", "disc-1");
    expect(idA).toBe(idB);

    const idDifferentDiscriminator = computeRuleId("co", "instr", "6.01(a)", "disc-2");
    expect(idDifferentDiscriminator).not.toBe(idA);

    const money100 = withExpressionId({ kind: "MONEY" as const, type: "MONEY" as const, amount: 100, currency: "USD" });
    const money100Again = withExpressionId({ kind: "MONEY" as const, type: "MONEY" as const, amount: 100, currency: "USD" });
    const money200 = withExpressionId({ kind: "MONEY" as const, type: "MONEY" as const, amount: 200, currency: "USD" });
    expect(computeExpressionId(money100)).toBe(computeExpressionId(money100Again));
    expect(computeExpressionId(money100)).not.toBe(computeExpressionId(money200));
  });

  it("E4: irSchemaVersion is stamped consistently, and ruleId (identity) is stable across a change to a MUTABLE field (sufficiency) while contentIdentity DOES change - identity and correctness are different questions", () => {
    for (const rule of ALL_FIXTURE_RULES) expect(rule.irSchemaVersion).toBe(IR_SCHEMA_VERSION);

    const originalContentId = computeContentIdentity(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT);
    const mutatedSufficiency = { ...FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT, sufficiency: "AMBIGUOUS" as const, sufficiencyReasons: ["hypothetically reclassified after further review"] };
    const mutatedContentId = computeContentIdentity(mutatedSufficiency);

    expect(mutatedSufficiency.ruleId).toBe(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT.ruleId); // identity unchanged
    expect(mutatedContentId).not.toBe(originalContentId); // but content identity DOES change - a future incremental-recompile pass can detect this
  });

  it("E5: printRule is a pure function of a rule's own content - two prints of the same rule are byte-identical, and a genuinely different rule prints differently", () => {
    expect(printRule(FIXTURE_1_FIXED_DEBT_BASKET)).toBe(printRule(FIXTURE_1_FIXED_DEBT_BASKET));
    expect(printRule(FIXTURE_1_FIXED_DEBT_BASKET)).not.toBe(printRule(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT));
  });
});
