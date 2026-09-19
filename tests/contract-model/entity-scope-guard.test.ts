/**
 * ENTITY-SCOPE CONSISTENCY GUARD - permanent regression tests (Phase 3 final blocker).
 *
 * 1. unknown entity tag never silently dropped;
 * 2. under-inclusive scope is downgraded;
 * 3. correct scope remains unchanged;
 * 4. ambiguous / silent source does not trigger an invented correction;
 * 5. COMPLETE -> PARTIAL when the guard fires;
 * 6. an already-PARTIAL rule gets the scope-specific reason appended;
 * 7. the frozen blocker replay no longer exposes an unsafe authoritative scope;
 * 8. the normalization audit preserves the original tag.
 *
 * Synthetic drafting only (cases A-F of the mission) plus one replay over the frozen
 * unseen-package fixture; nothing here is a Chewy dictionary and production code carries
 * no rule id, section number or agreement name.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EntityClassTag } from "@prisma/client";
import { SubmitCompilationSchema } from "@/lib/contract-model/compiler/semantic/wire-schema";
import { normalizeSubmission } from "@/lib/contract-model/compiler/semantic/normalize";
import { applyEntityScopeGuard, citedUnitLeadIn, classifyEntityTag, findEntityBindingSignals, replayEntityScopeGuard, TAG_DENOTATION } from "@/lib/contract-model/compiler/semantic/entity-scope-guard";
import type { IRRule } from "@/lib/contract-model/ir/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

const FROZEN = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json";

function rule(overrides: Partial<IRRule> & { excerpt?: string | null }): IRRule {
  const { excerpt, ...rest } = overrides;
  return {
    ruleId: "ir-rule:test", irSchemaVersion: "test", companyId: "c", instrumentKey: "i", sourceDocumentId: "d", sourceSectionRef: "7.02",
    covenantFamily: "DEBT", ruleType: "PROHIBITION", posture: "PROHIBITION", action: "INCUR_DEBT",
    entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: null, conditions: [], exceptions: [], dependsOn: [],
    operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: excerpt === undefined ? null : { documentId: "d", sourceNodeKey: null, sourceCitation: "§7.02", excerpt },
    compilerVersion: null, sourceContentVersion: null,
    ...rest,
  } as IRRule;
}
const noTags = { tagNormalization: [], rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "NOT_PERSISTED" as const } };
const guard = (r: IRRule, leadIn: string | null = null) => applyEntityScopeGuard(r, { ownExcerpt: r.provenance?.excerpt ?? null, citedUnitLeadIn: leadIn }, noTags);

function normalizeOne(wireRule: Record<string, unknown>, sourceSectionRef = "7.02") {
  const submission = SubmitCompilationSchema.parse({ rules: [{ localRef: "r1", sourceSectionRef, covenantFamily: "DEBT", ruleType: "PROHIBITION", posture: "PROHIBITION", sufficiency: "COMPLETE", ...wireRule }] });
  const out = normalizeSubmission(submission, testCompilerInput({ sourceSectionRef }));
  return { rule: out.rules[0]!, warnings: out.warnings };
}

describe("entity-scope guard - vocabulary is total over the enum", () => {
  it("every EntityClassTag has a denotation (adding an enum value without a denotation fails here, never silently at runtime)", () => {
    for (const t of Object.values(EntityClassTag)) expect(TAG_DENOTATION[t], t).toBeDefined();
  });
});

describe("entity-scope guard - §4 unknown tag never silently dropped (test 1, 8)", () => {
  it("case E: an unknown model tag becomes a warning + unspecified scope + PARTIAL, and the raw tag survives in the audit", () => {
    const { rule: r, warnings } = normalizeOne({ entityScope: ["RESTRICTED_SUBS"], excerpt: "No Restricted Subsidiary may incur any Indebtedness." });
    expect(r.entityScope).toEqual([]);
    expect(r.sufficiency).toBe("PARTIAL");
    expect(r.sufficiencyReasons.some((s) => s.startsWith("ENTITY_SCOPE_UNRECOGNIZED_TAG:"))).toBe(true);
    expect(warnings.some((w) => /ENTITY_SCOPE_UNRECOGNIZED_TAG/.test(w.message) && /"RESTRICTED_SUBS"/.test(w.message))).toBe(true);
    const audit = r.entityScopeAudit!;
    expect(audit.status).toBe("UNRECOGNIZED_TAG");
    expect(audit.safeToRely).toBe(false);
    expect(audit.rawEmitted).toEqual({ entityScope: ["RESTRICTED_SUBS"], entityScopeExcluded: [], source: "RULE_FIELD" });
    expect(audit.tagNormalization).toEqual([{ field: "entityScope", raw: "RESTRICTED_SUBS", outcome: "UNRECOGNIZED_ENTITY_TAG", normalized: null, viaAlias: false }]);
  });

  it("an unknown tag inside an ENTITY_SCOPE_REFERENCE node is audited too (never dropped without trace)", () => {
    const { rule: r } = normalizeOne({ entityScope: [], excerpt: "No Subsidiary may incur Indebtedness.", conditions: [{ conditionType: "ENTITY_SCOPE", expression: { kind: "ENTITY_SCOPE_REFERENCE", entityScopeInclude: ["ANY_SUBSIDIARY", "SPV_ENTITY"] } }] });
    const audit = r.entityScopeAudit!;
    expect(audit.tagNormalization.map((t) => [t.field, t.raw, t.outcome])).toEqual([
      ["ENTITY_SCOPE_REFERENCE.include", "ANY_SUBSIDIARY", "RECOGNIZED_ENTITY_TAG"],
      ["ENTITY_SCOPE_REFERENCE.include", "SPV_ENTITY", "UNRECOGNIZED_ENTITY_TAG"],
    ]);
    expect(audit.status).toBe("UNRECOGNIZED_TAG");
    expect(r.sufficiency).toBe("PARTIAL");
  });

  it("every emitted tag receives exactly one outcome; aliases of an exact class are RECOGNIZED and marked viaAlias", () => {
    expect(classifyEntityTag("BORROWER", "entityScope")).toMatchObject({ outcome: "RECOGNIZED_ENTITY_TAG", normalized: "BORROWER", viaAlias: false });
    expect(classifyEntityTag("borrower", "entityScope")).toMatchObject({ outcome: "RECOGNIZED_ENTITY_TAG", normalized: "BORROWER", viaAlias: true });
    expect(classifyEntityTag("COMPANY", "entityScope")).toMatchObject({ outcome: "RECOGNIZED_ENTITY_TAG", normalized: "BORROWER", viaAlias: true });
    expect(classifyEntityTag("Unrestricted Subsidiary", "entityScope")).toMatchObject({ outcome: "RECOGNIZED_ENTITY_TAG", normalized: "UNRESTRICTED_SUB", viaAlias: true });
    // a generic restricted-subsidiary tag maps to no single exact class - never guessed
    expect(classifyEntityTag("RESTRICTED_SUBSIDIARY", "entityScope")).toMatchObject({ outcome: "UNRECOGNIZED_ENTITY_TAG", normalized: null });
    expect(classifyEntityTag("GUARANTOR", "entityScope")).toMatchObject({ outcome: "UNRECOGNIZED_ENTITY_TAG", normalized: null });
  });
});

describe("entity-scope guard - §5/§6 under-inclusive scope is downgraded, never widened (tests 2, 5, 6)", () => {
  it("case B: 'The Borrower and each Restricted Subsidiary may ...' with scope BORROWER only -> unspecified + PARTIAL + reason", () => {
    const g = guard(rule({ ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", entityScope: ["BORROWER"], excerpt: "The Borrower and each Restricted Subsidiary may incur Indebtedness in an aggregate principal amount not to exceed $50,000,000." }));
    expect(g.entityScope).toEqual([]);
    expect(g.sufficiency).toBe("PARTIAL");
    expect(g.sufficiencyReasons.some((s) => s.startsWith("ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE:"))).toBe(true);
    expect(g.entityScopeAudit!.status).toBe("UNDERINCLUSIVE_VS_SOURCE");
    expect(g.entityScopeAudit!.safeToRely).toBe(false);
    expect(g.entityScopeAudit!.before).toEqual({ entityScope: ["BORROWER"], entityScopeExcluded: [], sufficiency: "COMPLETE" });
    // never widened by guess
    expect(g.entityScope).not.toContain("GUARANTOR_RS");
    expect(g.entityScope).not.toContain("NON_GUARANTOR_RS");
  });

  it("case D: 'The Issuer shall not permit any Guarantor to ...' with scope ISSUER (alias of BORROWER) only -> downgrade", () => {
    const { rule: r } = normalizeOne({ entityScope: ["ISSUER"], excerpt: "The Issuer shall not permit any Guarantor to incur any Indebtedness." });
    expect(r.entityScopeAudit!.tagNormalization[0]).toMatchObject({ raw: "ISSUER", normalized: "BORROWER", viaAlias: true });
    expect(r.entityScope).toEqual([]);
    expect(r.sufficiency).toBe("PARTIAL");
    expect(r.entityScopeAudit!.status).toBe("UNDERINCLUSIVE_VS_SOURCE");
    expect(r.entityScopeAudit!.witness.signals.find((s) => s.phrase === "Guarantor")).toMatchObject({ satisfied: false, excludedContext: false });
  });

  it("test 5: a COMPLETE rule does not stay COMPLETE when the guard fires", () => {
    const g = guard(rule({ sufficiency: "COMPLETE", entityScope: ["BORROWER"], excerpt: "The Borrower shall not, and shall not permit any Restricted Subsidiary to, create any Lien." }));
    expect(g.sufficiency).toBe("PARTIAL");
  });

  it("test 6: an already-PARTIAL rule keeps its prior reasons and gains the scope-specific reason (not a generic review flag)", () => {
    const g = guard(rule({ sufficiency: "PARTIAL", sufficiencyReasons: ["prior: an operand is UNSUPPORTED"], entityScope: ["BORROWER"], excerpt: "The Borrower shall not, and shall not permit any Restricted Subsidiary to, create any Lien." }));
    expect(g.sufficiency).toBe("PARTIAL");
    expect(g.sufficiencyReasons[0]).toBe("prior: an operand is UNSUPPORTED");
    expect(g.sufficiencyReasons.filter((s) => s.startsWith("ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE:"))).toHaveLength(1);
    expect(g.entityScopeAudit!.reasonCodes).toEqual(["ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE"]);
  });

  it("an AMBIGUOUS / UNSUPPORTED rule is not promoted or demoted by the guard - only COMPLETE is downgraded", () => {
    const g = guard(rule({ sufficiency: "AMBIGUOUS", entityScope: ["BORROWER"], excerpt: "The Borrower shall not permit any Restricted Subsidiary to incur Indebtedness." }));
    expect(g.sufficiency).toBe("AMBIGUOUS");
    expect(g.entityScope).toEqual([]);
  });

  it("the lead-in of the cited unit governs a fragment: an incidental Borrower mention in the excerpt cannot mask the unit's joint binding", () => {
    const leadIn = "(a) The Borrower shall not, and shall not permit any Restricted Subsidiary to, incur Indebtedness; provided that the Borrower and any Restricted Subsidiary may incur Indebtedness if, after giving effect thereto,";
    const g = guard(rule({ sourceSectionRef: "7.02(a)", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", entityScope: ["BORROWER"], excerpt: "(2) at the Borrower's sole discretion, the Total Leverage Ratio does not exceed 4.00:1.00" }), leadIn);
    expect(g.entityScopeAudit!.status).toBe("UNDERINCLUSIVE_VS_SOURCE");
    expect(g.entityScopeAudit!.witness.decidedBy).toBe("CITED_UNIT_LEAD_IN");
    expect(g.entityScope).toEqual([]);
    expect(g.sufficiency).toBe("PARTIAL");
  });
});

describe("entity-scope guard - §10 do not over-guard (tests 3, 4)", () => {
  it("case A: 'The Company shall not ...' with scope COMPANY -> recognized alias, confirmed, unchanged", () => {
    const { rule: r } = normalizeOne({ entityScope: ["COMPANY"], excerpt: "The Company shall not incur any Indebtedness other than Permitted Indebtedness." });
    expect(r.entityScope).toEqual(["BORROWER"]);
    expect(r.sufficiency).toBe("COMPLETE");
    expect(r.entityScopeAudit!.status).toBe("SOURCE_MATCH_CONFIRMED");
    expect(r.entityScopeAudit!.safeToRely).toBe(true);
  });

  it("source = Borrower only, scope = BORROWER -> unchanged", () => {
    const g = guard(rule({ entityScope: ["BORROWER"], excerpt: "The Borrower shall not create, incur or assume any Indebtedness." }));
    expect(g.entityScope).toEqual(["BORROWER"]);
    expect(g.sufficiency).toBe("COMPLETE");
    expect(g.entityScopeAudit!.status).toBe("SOURCE_MATCH_CONFIRMED");
  });

  it("case C: 'No Subsidiary may ...' with scope SUBSIDIARY -> recognized as ANY_SUBSIDIARY, safe", () => {
    const { rule: r } = normalizeOne({ entityScope: ["SUBSIDIARY"], excerpt: "No Subsidiary may incur any Indebtedness owed to a Person other than the Borrower." });
    // "the Borrower" here is an exclusion-context mention ("other than the Borrower"), not a binding
    expect(r.entityScope).toEqual(["ANY_SUBSIDIARY"]);
    expect(r.sufficiency).toBe("COMPLETE");
    expect(r.entityScopeAudit!.status).toBe("SOURCE_MATCH_CONFIRMED");
  });

  it("source = Restricted Subsidiaries only, scope = a recognized restricted-subsidiary class -> unchanged", () => {
    const g = guard(rule({ entityScope: ["NON_GUARANTOR_RS"], excerpt: "No Restricted Subsidiary that is not a Guarantor may incur Indebtedness." }));
    expect(g.entityScope).toEqual(["NON_GUARANTOR_RS"]);
    expect(g.entityScopeAudit!.status).toBe("SOURCE_MATCH_CONFIRMED");
    expect(g.entityScopeAudit!.witness.signals.find((s) => s.phrase === "Guarantor")!.excludedContext).toBe(true);
  });

  it("source = Borrower + Restricted Subsidiaries, scope contains both recognized classes -> unchanged", () => {
    const g = guard(rule({ entityScope: ["BORROWER", "GUARANTOR_RS", "NON_GUARANTOR_RS"], excerpt: "The Borrower shall not, and shall not permit any Restricted Subsidiary to, incur Indebtedness." }));
    expect(g.entityScope).toEqual(["BORROWER", "GUARANTOR_RS", "NON_GUARANTOR_RS"]);
    expect(g.sufficiency).toBe("COMPLETE");
    expect(g.entityScopeAudit!.status).toBe("SOURCE_MATCH_CONFIRMED");
  });

  it("case F: source has no entity phrase -> no invented correction (UNWITNESSED, scope and sufficiency untouched, but not safe to rely on)", () => {
    const g = guard(rule({ entityScope: ["BORROWER"], excerpt: "Indebtedness in respect of Capital Lease Obligations in an aggregate principal amount not to exceed $25,000,000." }), "(b) The foregoing shall not apply to:");
    expect(g.entityScope).toEqual(["BORROWER"]);
    expect(g.sufficiency).toBe("COMPLETE");
    expect(g.entityScopeAudit!.status).toBe("UNWITNESSED");
    expect(g.entityScopeAudit!.safeToRely).toBe(false);
    expect(g.sufficiencyReasons).toEqual([]);
  });

  it("scope covered only through a qualified subset class is AMBIGUOUS: kept, not downgraded, not safe to rely on", () => {
    const g = guard(rule({ entityScope: ["FOREIGN_RS"], excerpt: "No Restricted Subsidiary may incur Indebtedness denominated in a currency other than Dollars." }));
    expect(g.entityScope).toEqual(["FOREIGN_RS"]);
    expect(g.sufficiency).toBe("COMPLETE");
    expect(g.entityScopeAudit!.status).toBe("AMBIGUOUS_VS_SOURCE");
    expect(g.entityScopeAudit!.safeToRely).toBe(false);
  });

  it("an empty scope claims nothing: UNSPECIFIED, untouched", () => {
    const g = guard(rule({ entityScope: [], excerpt: "The Borrower shall not permit any Restricted Subsidiary to incur Indebtedness." }));
    expect(g.entityScope).toEqual([]);
    expect(g.sufficiency).toBe("COMPLETE");
    expect(g.entityScopeAudit!.status).toBe("UNSPECIFIED");
  });

  it("lowercase prose words are not binding classes (case-sensitive defined-term vocabulary)", () => {
    expect(findEntityBindingSignals("any subsidiary of the company or any guarantor thereof")).toEqual([]);
    expect(findEntityBindingSignals("Loan Documents and Loan Party").map((s) => s.phrase)).toEqual(["Loan Party"]);
  });
});

describe("entity-scope guard - cited-unit lead-in extraction is structural, not a dictionary", () => {
  const region = "Section 7.02 Indebtedness.\n(a) The Borrower shall not, and shall not permit any Restricted Subsidiary to, incur Indebtedness; provided that the Borrower and any Restricted Subsidiary may incur Indebtedness if (1) the Leverage Ratio is below 4.00:1.00 or (2) the Interest Coverage Ratio exceeds 2.00:1.00.\n(b) The provisions of Section 7.02(a) shall not apply to:\n(1) Indebtedness under the Loan Documents;\n(2) Indebtedness of any Subsidiary owed to the Borrower;";
  it("locates the cited unit and stops at its first child enumerator", () => {
    expect(citedUnitLeadIn(region, "7.02", "7.02(a)")).toMatch(/^\(a\) The Borrower shall not.*after|^\(a\) The Borrower shall not.*if$/s);
    expect(citedUnitLeadIn(region, "7.02", "7.02(a)")).not.toMatch(/Leverage Ratio/);
    expect(citedUnitLeadIn(region, "7.02", "7.02(b)")).toBe("(b) The provisions of Section 7.02(a) shall not apply to:");
    expect(citedUnitLeadIn(region, "7.02", "7.02(b)(2)")).toBe("(2) Indebtedness of any Subsidiary owed to the Borrower;");
  });
  it("returns null rather than guessing when the unit cannot be located or belongs to another section", () => {
    expect(citedUnitLeadIn(region, "7.02", "7.03(a)")).toBeNull();
    expect(citedUnitLeadIn(region, "7.02", "7.02(z)")).toBeNull();
    expect(citedUnitLeadIn(region, "7.02", null)).toBeNull();
  });
});

describe("entity-scope guard - frozen blocker replay (test 7; zero-cost, no model call)", () => {
  const frozen = JSON.parse(readFileSync(FROZEN, "utf8")) as { rules: IRRule[]; sourceContext: { regions: Parameters<typeof replayEntityScopeGuard>[1] } };
  const F0_RULES = ["ir-rule:170e314ceb35e54072b7ddba", "ir-rule:49f22aee601dde5b8b8162d5", "ir-rule:31ef4cb0be0026182f97f8ea", "ir-rule:01c9a005fd9c7649ddc26012", "ir-rule:6d2acc86b7f3dede7305f5df", "ir-rule:b21ac832418c33bcf91d0625", "ir-rule:8df2fec30e5afda652c94c04"];

  it("the frozen witnesses really are the blocker shape before the guard (red baseline)", () => {
    const byId = new Map(frozen.rules.map((r) => [r.ruleId, r]));
    const borrowerOnly = F0_RULES.map((id) => byId.get(id)!).filter((r) => JSON.stringify(r.entityScope) === '["BORROWER"]');
    expect(borrowerOnly.length).toBe(6);
    expect(borrowerOnly.filter((r) => r.sufficiency === "COMPLETE").length).toBe(2);
    expect(frozen.rules.every((r) => r.entityScopeAudit === undefined)).toBe(true);
  });

  it("after the guard no rule keeps a confident BORROWER-only scope when its own bound source binds Restricted Subsidiaries", () => {
    const after = frozen.rules.map((r) => replayEntityScopeGuard(r, frozen.sourceContext.regions));
    const byId = new Map(after.map((r) => [r.ruleId, r]));
    for (const id of F0_RULES) {
      const r = byId.get(id)!;
      const a = r.entityScopeAudit!;
      // allowed end states: reset + limited, confirmed against source, or unwitnessed but not COMPLETE
      const ok = (a.status === "UNDERINCLUSIVE_VS_SOURCE" && r.entityScope.length === 0 && r.sufficiency !== "COMPLETE")
        || a.status === "UNSPECIFIED"
        || a.status === "SOURCE_MATCH_CONFIRMED"
        || (a.status === "UNWITNESSED" && r.sufficiency !== "COMPLETE");
      expect(ok, `${id} ${a.status} ${JSON.stringify(r.entityScope)} ${r.sufficiency}`).toBe(true);
    }
    const underinclusive = after.filter((r) => r.entityScopeAudit!.status === "UNDERINCLUSIVE_VS_SOURCE");
    expect(underinclusive.map((r) => r.ruleId).sort()).toEqual(F0_RULES.slice(0, 6).filter((id) => id !== "ir-rule:31ef4cb0be0026182f97f8ea").sort());
    expect(underinclusive.every((r) => r.entityScope.length === 0 && r.sufficiency === "PARTIAL" && r.sufficiencyReasons.some((s) => s.startsWith("ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE:")))).toBe(true);
    // the two Permitted-Ratio-style permissions that were COMPLETE are no longer COMPLETE
    expect(byId.get("ir-rule:01c9a005fd9c7649ddc26012")!.sufficiency).toBe("PARTIAL");
    expect(byId.get("ir-rule:b21ac832418c33bcf91d0625")!.sufficiency).toBe("PARTIAL");
    // and nothing anywhere in the transformed IR carries an UNDERINCLUSIVE/UNRECOGNIZED status with a surviving scope
    expect(after.filter((r) => ["UNDERINCLUSIVE_VS_SOURCE", "UNRECOGNIZED_TAG"].includes(r.entityScopeAudit!.status) && r.entityScope.length > 0)).toEqual([]);
    // the guard never widens: no rule gained a tag it did not have
    for (const r of after) expect(r.entityScope.every((t) => frozen.rules.find((f) => f.ruleId === r.ruleId)!.entityScope.includes(t))).toBe(true);
  });

  it("the replay is deterministic and idempotent", () => {
    const once = frozen.rules.map((r) => replayEntityScopeGuard(r, frozen.sourceContext.regions));
    const twice = frozen.rules.map((r) => replayEntityScopeGuard(r, frozen.sourceContext.regions));
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
    const again = once.map((r) => replayEntityScopeGuard(r, frozen.sourceContext.regions));
    expect(again.map((r) => [r.entityScope, r.sufficiency])).toEqual(once.map((r) => [r.entityScope, r.sufficiency]));
  });
});
