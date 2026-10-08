/**
 * Evaluates one governing aggregate ceiling.
 *
 * The ceiling expression is ordinary IR arithmetic. The amount incurred under
 * the governing provision is a separate operand supplied here. It is not a
 * metric, a RULE_REFERENCE, or a LEDGER_USAGE_REFERENCE. The result is the
 * ceiling, the usage, and the remaining headroom. It is never AVAILABLE
 * capacity and it never authorizes debt. Several permissions LIMITED_BY the
 * same rule share that one remaining amount.
 */
import type { IRRule } from "../ir/types";
import { rationalFromString, subtract, toCanonicalString } from "./decimal";
import { evaluateExpression } from "./evaluate-expression";
import type { InputResolver } from "./types";

export interface ProvisionAggregateUsage {
  /** Canonical decimal amount already incurred under the governing provision. Null when the fact is absent. */
  amount: string | null;
  currency: string;
  conflicting: boolean;
  conflictDetail?: string;
}

export type GoverningLimitStatus = "DETERMINED" | "NEEDS_INPUT" | "REVIEW_REQUIRED" | "NON_EXECUTABLE";

export interface GoverningLimitMember {
  ruleId: string;
  /** The one shared remaining amount. Never an independent copy of the ceiling. */
  remaining: string | null;
  status: GoverningLimitStatus;
}

export interface GoverningLimitEvaluation {
  limitRuleId: string;
  status: GoverningLimitStatus;
  reasons: string[];
  /** Contractual ceiling. Null unless status is DETERMINED. */
  ceiling: string | null;
  /** Aggregate incurred under the governing provision. Null unless status is DETERMINED. */
  usage: string | null;
  /** ceiling − usage. Null unless status is DETERMINED. Distinct from the ceiling. */
  remaining: string | null;
  /** A governing limit does not authorize incurrence. */
  authorizesDebt: false;
  memberRuleIds: string[];
  memberHeadroom: GoverningLimitMember[];
}

type ReasonKind = "REVIEW_REQUIRED" | "NON_EXECUTABLE" | "NEEDS_INPUT";
interface Reason { kind: ReasonKind; message: string }

function amendmentProblem(rule: IRRule): string | null {
  const status = rule.operativeLineage?.operativeStatus ?? null;
  if (status === "OPERATIVE_STATE_RESOLVED") return null;
  return `${rule.ruleId} amendment authority is ${status ?? "not established"}`;
}

function scopeProblem(rule: IRRule): string | null {
  if (rule.entityScope.length === 0) return `${rule.ruleId} entity scope is not established`;
  if (!rule.entityScopeAudit || rule.entityScopeAudit.safeToRely !== true) return `${rule.ruleId} entity scope is not safe to rely on`;
  return null;
}

function limitedBy(permission: IRRule, limit: IRRule): boolean {
  return permission.dependsOn.some((dependency) => dependency.relationshipType === "LIMITED_BY" && dependency.targetRuleId === limit.ruleId);
}

export function evaluateGoverningLimit(args: {
  limit: IRRule;
  permissions?: readonly IRRule[];
  usage: ProvisionAggregateUsage | null;
  inputs: InputResolver;
  asOf?: string | null;
}): GoverningLimitEvaluation {
  const permissions = args.permissions ?? [];
  const reasons: Reason[] = [];
  const limit = args.limit;
  const governing = limit.governingLimit ?? null;

  if (!governing) {
    reasons.push({ kind: "NON_EXECUTABLE", message: `${limit.ruleId} has no governing limit` });
  } else {
    if (limit.posture === "PERMISSION" || limit.ruleType === "QUANTITATIVE_PERMISSION") {
      reasons.push({ kind: "NON_EXECUTABLE", message: `${limit.ruleId} is an incurrence permission; a governing limit cannot authorize debt` });
    }
    if (!governing.measuredAggregate.measurementBasis.trim()) {
      reasons.push({ kind: "NON_EXECUTABLE", message: `${limit.ruleId} does not state the measurement basis of the aggregate incurred under the governing provision` });
    }
    if (!governing.measuredAggregate.governingSectionRef.trim()) {
      reasons.push({ kind: "NON_EXECUTABLE", message: `${limit.ruleId} does not identify the governing provision` });
    }
    if (governing.measuredAggregate.kind !== "PROVISION_AGGREGATE") {
      reasons.push({ kind: "NON_EXECUTABLE", message: `${limit.ruleId} measured aggregate is not a provision aggregate` });
    }
    if (limit.capacityExpression) {
      reasons.push({ kind: "REVIEW_REQUIRED", message: `${limit.ruleId} also carries capacityExpression; the ceiling would be counted again as available capacity` });
    }
  }

  const amendment = amendmentProblem(limit);
  if (amendment) reasons.push({ kind: "REVIEW_REQUIRED", message: amendment });
  const scope = scopeProblem(limit);
  if (scope) reasons.push({ kind: "REVIEW_REQUIRED", message: scope });

  for (const permission of permissions) {
    if (!limitedBy(permission, limit)) {
      reasons.push({ kind: "REVIEW_REQUIRED", message: `${permission.ruleId} does not record LIMITED_BY ${limit.ruleId}` });
    }
    if (permission.capacityExpression && permission.capacityExpression.kind !== "UNLIMITED_CAPACITY") {
      reasons.push({ kind: "REVIEW_REQUIRED", message: `${permission.ruleId} carries its own capacity beside the governing limit` });
    }
    const permissionAmendment = amendmentProblem(permission);
    if (permissionAmendment) reasons.push({ kind: "REVIEW_REQUIRED", message: permissionAmendment });
    const permissionScope = scopeProblem(permission);
    if (permissionScope) reasons.push({ kind: "REVIEW_REQUIRED", message: permissionScope });
    if (scope === null && permissionScope === null) {
      const outside = permission.entityScope.filter((tag) => !limit.entityScope.includes(tag));
      if (outside.length > 0) reasons.push({ kind: "REVIEW_REQUIRED", message: `${permission.ruleId} entity scope ${outside.join(", ")} is outside ${limit.ruleId}` });
    }
  }

  const usage = args.usage;
  if (usage?.conflicting) {
    reasons.push({ kind: "REVIEW_REQUIRED", message: usage.conflictDetail ?? `aggregate usage under ${governing?.measuredAggregate.governingSectionRef ?? limit.ruleId} conflicts` });
  } else if (!usage || usage.amount === null || usage.amount.trim() === "") {
    reasons.push({ kind: "NEEDS_INPUT", message: `aggregate usage under ${governing?.measuredAggregate.governingSectionRef ?? limit.sourceSectionRef ?? limit.ruleId} is not established` });
  }

  let ceilingAmount: string | null = null;
  let ceilingCurrency: string | null = null;
  if (governing) {
    const evaluated = evaluateExpression({
      expression: governing.ceilingExpression,
      inputs: args.inputs,
      context: { asOf: args.asOf ?? null, ruleId: limit.ruleId, companyId: limit.companyId, instrumentKey: limit.instrumentKey },
    });
    if (evaluated.status === "NEEDS_INPUT") {
      const keys = evaluated.missingInputKeys.length > 0 ? evaluated.missingInputKeys.join(", ") : "a ceiling input";
      reasons.push({ kind: "NEEDS_INPUT", message: `${limit.ruleId} ceiling is missing ${keys}` });
    } else if (evaluated.status !== "EXECUTABLE" || evaluated.value?.type !== "MONEY") {
      reasons.push({ kind: "NON_EXECUTABLE", message: `${limit.ruleId} ceiling is ${evaluated.status} and is not a money amount` });
    } else {
      ceilingAmount = evaluated.value.amount;
      ceilingCurrency = evaluated.value.currency;
    }
  }

  let usageAmount: string | null = null;
  if (usage && !usage.conflicting && usage.amount !== null && usage.amount.trim() !== "") {
    try {
      usageAmount = toCanonicalString(rationalFromString(usage.amount));
    } catch {
      reasons.push({ kind: "REVIEW_REQUIRED", message: `aggregate usage "${usage.amount}" is not a decimal amount` });
      usageAmount = null;
    }
    if (usageAmount !== null && ceilingCurrency && usage.currency !== ceilingCurrency) {
      reasons.push({ kind: "REVIEW_REQUIRED", message: `aggregate usage currency ${usage.currency} does not match ceiling currency ${ceilingCurrency}` });
    }
  }

  const status: GoverningLimitStatus = reasons.some((reason) => reason.kind === "REVIEW_REQUIRED")
    ? "REVIEW_REQUIRED"
    : reasons.some((reason) => reason.kind === "NON_EXECUTABLE")
      ? "NON_EXECUTABLE"
      : reasons.some((reason) => reason.kind === "NEEDS_INPUT")
        ? "NEEDS_INPUT"
        : "DETERMINED";

  const remaining = status === "DETERMINED" && ceilingAmount !== null && usageAmount !== null
    ? toCanonicalString(subtract(rationalFromString(ceilingAmount), rationalFromString(usageAmount)))
    : null;

  return {
    limitRuleId: limit.ruleId,
    status,
    reasons: reasons.map((reason) => reason.message),
    ceiling: status === "DETERMINED" ? ceilingAmount : null,
    usage: status === "DETERMINED" ? usageAmount : null,
    remaining,
    authorizesDebt: false,
    memberRuleIds: permissions.map((permission) => permission.ruleId),
    memberHeadroom: permissions.map((permission) => ({ ruleId: permission.ruleId, remaining, status })),
  };
}
