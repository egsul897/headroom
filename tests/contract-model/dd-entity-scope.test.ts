/**
 * PHASE 3 / 6.01 PRECISION AUDIT §17 - entityScope is populated deterministically when the model carries the
 * information anywhere in the rule, and the rule-level fields are honoured when supplied. Zero model calls.
 */
import { describe, expect, it } from "vitest";
import { normalizeSubmission } from "../../lib/contract-model/compiler/semantic/normalize";
import { testCompilerInput } from "./semantic-compiler/test-helpers";
import { EntityClassTag } from "@prisma/client";
import { SEMANTIC_COMPILER_PROMPT_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { buildSystemPrompt } from "../../lib/contract-model/compiler/semantic/prompt";

const tags = Object.values(EntityClassTag) as string[];
const [T1, T2] = [tags[0]!, tags[1] ?? tags[0]!];
const rule = (extra: Record<string, unknown>) => ({ localRef: "r1", sourceSectionRef: "6.02(a)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", capacityExpression: { kind: "MONEY", amount: 1_000_000, currency: "USD", citation: "§6.02(a)" }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: "§6.02(a)", ...extra });
const submission = (r: Record<string, unknown>) => ({ rules: [r], definitions: [], sharedCapacities: [], irExtensionCandidates: [], inventoryDispositions: [], overallNotes: [] }) as never;

describe("§17 entityScope", () => {
  it("rule-level entityScope / entityScopeExcluded supplied by the model are carried into the IR", () => {
    const out = normalizeSubmission(submission(rule({ entityScope: [T1], entityScopeExcluded: [T2] })), testCompilerInput());
    expect(out.rules[0]!.entityScope).toEqual([T1]);
    expect(out.rules[0]!.entityScopeExcluded).toEqual(T2 === T1 ? [T1] : [T2]);
  });
  it("when the rule-level fields are empty, the tags carried by the rule's own ENTITY_SCOPE_REFERENCE nodes are derived deterministically - never invented", () => {
    const withNode = rule({ capacityExpression: { kind: "MONEY", amount: 5, currency: "USD", citation: "§6.02(a)" }, conditions: [{ description: "scope", expression: { kind: "ENTITY_SCOPE_REFERENCE", entityScopeInclude: [T1], entityScopeExclude: [T2], citation: "§6.02(a)" }, citation: "§6.02(a)" }] });
    const out = normalizeSubmission(submission(withNode), testCompilerInput());
    expect(out.rules[0]!.entityScope).toEqual([T1]);
    const none = normalizeSubmission(submission(rule({})), testCompilerInput());
    expect(none.rules[0]!.entityScope).toEqual([]);
    expect(none.rules[0]!.entityScopeExcluded).toEqual([]);
  });
  it("the prompt now instructs the model to fill the rule-level fields, and the prompt version reflects the change", () => {
    const prompt = buildSystemPrompt({ irSchemaVersion: "headroom-covenant-ir.v1", toolPolicyVersion: "tool-policy.v1" });
    expect(prompt).toMatch(/ENTITY SCOPE/);
    expect(prompt).toMatch(/entityScopeExcluded/);
    expect(SEMANTIC_COMPILER_PROMPT_VERSION).toBe("semantic-accountability-compiler-prompt.v5");
  });
});
