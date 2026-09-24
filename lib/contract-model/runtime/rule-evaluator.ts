/**
 * PHASE 4A - minimal rule-evaluation shell (mission §22-§23, §29-§30).
 *
 * Keeps generic expression evaluation separate from legal rule evaluation.
 * This shell evaluates a rule's capacity expression and each condition
 * expression INDIVIDUALLY and reports the Phase-3 states around them
 * (sufficiency, entity scope). It does NOT decide whether a transaction is
 * permitted, does not consume ledger usage, does not execute reclassification
 * and does not solve for a maximum amount - those are later Phase-4
 * subphases, held here as explicit placeholders so they can be added without
 * changing expression semantics.
 */
import type { IRRule } from "../ir/types";
import { evaluateExpression } from "./evaluate-expression";
import type { EvaluationContext, EvaluationResult, InputResolver, RuntimeStatus } from "./types";
import type { VerificationBlock } from "./verification-envelope";
import { blocksUnit, gateIsActive } from "./verification-gate";
import { CONTRACT_RUNTIME_VERSION } from "./version";

/** How confidently the runtime may attach a computed capacity to the rule's entityScope - derived from the Phase-3 entity-scope audit, never repaired here. */
export type EntityScopeApplicability = "SCOPE_CONFIRMED_BY_SOURCE" | "SCOPE_UNSPECIFIED" | "SCOPE_NOT_SAFE_TO_RELY_ON" | "SCOPE_UNAUDITED";

export interface RuleEvaluation {
  runtimeVersion: string;
  ruleId: string;
  /** AMBIGUOUS when the Phase-3 rule itself is AMBIGUOUS / MISSING_CONTEXT / CONFLICTED - nothing is evaluated in that case. */
  status: RuntimeStatus;
  phase3: { sufficiency: IRRule["sufficiency"]; sufficiencyReasons: string[]; posture: IRRule["posture"]; ruleType: IRRule["ruleType"] };
  capacity: EvaluationResult | null;
  conditions: { conditionId: string; conditionType: IRRule["conditions"][number]["conditionType"]; description: string; evaluation: EvaluationResult | null; note: string | null }[];
  entityScope: { entityScope: IRRule["entityScope"]; entityScopeExcluded: IRRule["entityScopeExcluded"]; auditStatus: string | null; safeToRely: boolean | null; applicability: EntityScopeApplicability; note: string };
  /** Explicit later-subphase boundaries. */
  permissionDecision: "NOT_COMPUTED_IN_PHASE_4A";
  reclassification: { status: "NOT_IMPLEMENTED_IN_PHASE_4A"; edgeType: "RECLASSIFIABLE_TO"; edgesPresentOnRule: number; note: string };
  solveForX: { status: "NOT_IMPLEMENTED_IN_PHASE_4A"; note: string };
  ledgerConsumption: { status: "NOT_IMPLEMENTED_IN_PHASE_4A"; note: string };
  /** PHASE-4 VERIFICATION GATE: present only when the whole rule was refused by verification (UNIT finding, identity mismatch, or REQUIRE without a record). */
  verificationBlock?: VerificationBlock;
}

function scopeApplicability(rule: IRRule): RuleEvaluation["entityScope"] {
  const audit = rule.entityScopeAudit;
  if (!audit) return { entityScope: rule.entityScope, entityScopeExcluded: rule.entityScopeExcluded, auditStatus: null, safeToRely: null, applicability: "SCOPE_UNAUDITED", note: "rule carries no entity-scope audit; the runtime does not assert who a computed capacity applies to" };
  const applicability: EntityScopeApplicability = audit.status === "SOURCE_MATCH_CONFIRMED" ? "SCOPE_CONFIRMED_BY_SOURCE" : audit.status === "UNSPECIFIED" ? "SCOPE_UNSPECIFIED" : "SCOPE_NOT_SAFE_TO_RELY_ON";
  return { entityScope: rule.entityScope, entityScopeExcluded: rule.entityScopeExcluded, auditStatus: audit.status, safeToRely: audit.safeToRely, applicability, note: applicability === "SCOPE_CONFIRMED_BY_SOURCE" ? "scope confirmed against the rule's own source by the Phase-3 guard" : "the runtime must not claim the computed value applies confidently to a specific entity set; scope is not repaired here" };
}

export function evaluateRule(rule: IRRule, inputs: InputResolver, context: EvaluationContext = {}): RuleEvaluation {
  // unitId is the STABLE compiled-unit id, never an array position; the verification gate looks the
  // rule's record up by it and checks the record's identity against the rule's own version trio.
  const identity = { ruleOrDefinitionId: rule.ruleId, companyId: rule.companyId, instrumentKey: rule.instrumentKey, irSchemaVersion: rule.irSchemaVersion, compilerVersion: rule.compilerVersion, sourceContentVersion: rule.sourceContentVersion };
  const ctx: EvaluationContext = { ...context, ruleId: rule.ruleId, unitId: rule.ruleId, unitIdentity: identity, companyId: rule.companyId, instrumentKey: rule.instrumentKey };
  // PHASE-4 VERIFICATION GATE (whole rule): asked of the gate module, never re-derived here. A
  // UNIT-scope refusal fails the rule before any of its expressions is treated as legally usable;
  // NODE-scope findings stay node-local and are handled inside evaluateExpression.
  const verificationBlock = gateIsActive(context.verification, context.policy) ? blocksUnit(rule.ruleId, context.verification, context.policy, identity) : null;
  const blockedBySufficiency = rule.sufficiency === "AMBIGUOUS" || rule.sufficiency === "MISSING_CONTEXT" || rule.sufficiency === "CONFLICTED";
  const blocked = blockedBySufficiency || verificationBlock !== null;
  const capacity = blocked || !rule.capacityExpression ? null : evaluateExpression({ expression: rule.capacityExpression, inputs, context: ctx });
  const conditions = rule.conditions.map((c) => ({
    conditionId: c.conditionId,
    conditionType: c.conditionType,
    description: c.description,
    evaluation: blocked || !c.expression ? null : evaluateExpression({ expression: c.expression, inputs, context: ctx }),
    note: blockedBySufficiency ? "not evaluated: rule blocked by its Phase-3 sufficiency" : verificationBlock ? `not evaluated: rule refused by verification (${verificationBlock.reason})` : c.expression ? null : c.referencesDefinitionId ? `condition references definition ${c.referencesDefinitionId}; not expanded by the shell` : "condition carries no boolean expression (real but not reducible in the IR)",
  }));
  const statuses: RuntimeStatus[] = [...(capacity ? [capacity.status] : []), ...conditions.flatMap((c) => (c.evaluation ? [c.evaluation.status] : []))];
  const order: RuntimeStatus[] = ["ERROR", "UNSUPPORTED", "AMBIGUOUS", "NEEDS_INPUT", "EXECUTABLE"];
  const status: RuntimeStatus = blocked ? "AMBIGUOUS" : statuses.length === 0 ? "UNSUPPORTED" : order.find((s) => statuses.includes(s))!;
  return {
    runtimeVersion: CONTRACT_RUNTIME_VERSION,
    ruleId: rule.ruleId,
    status,
    phase3: { sufficiency: rule.sufficiency, sufficiencyReasons: rule.sufficiencyReasons, posture: rule.posture, ruleType: rule.ruleType },
    capacity,
    conditions,
    entityScope: scopeApplicability(rule),
    permissionDecision: "NOT_COMPUTED_IN_PHASE_4A",
    reclassification: { status: "NOT_IMPLEMENTED_IN_PHASE_4A", edgeType: "RECLASSIFIABLE_TO", edgesPresentOnRule: rule.dependsOn.filter((d) => d.relationshipType === "RECLASSIFIABLE_TO").length, note: "reclassification execution is a later Phase-4 subphase; the legal right, where represented, stays on the rule's conditions/dependsOn untouched" },
    solveForX: { status: "NOT_IMPLEMENTED_IN_PHASE_4A", note: "ratio literals and comparisons evaluate; solving a ratio test for a maximum incurrence amount is the later solver subphase" },
    ledgerConsumption: { status: "NOT_IMPLEMENTED_IN_PHASE_4A", note: "LEDGER_USAGE_REFERENCE resolves only through the InputResolver; no consumption ledger exists yet" },
    ...(verificationBlock ? { verificationBlock } : {}),
  };
}
