/**
 * Phase 3A - narrow legacy adapters (task §38/§57). Maps ONLY the legacy
 * shapes that translate faithfully into the IR; everything else is
 * refused with an honest reason rather than guessed. Two source
 * generations exist in this codebase (docs/HEADROOM-ROADMAP.md §3's own
 * migration table) and both get a narrow adapter here:
 *
 *   (A) the LEGACY PRODUCTION engine's own CovenantProvisionInput
 *       (lib/covenant-engine.ts, FormulaType-driven) - what actually
 *       serves Coherent/Matthews today.
 *   (B) Phase B's CandidateContractRule (lib/contract-model/types.ts,
 *       CalculationRuleKind-driven) - the representation-first schema a
 *       future Phase 3B compiler would eventually replace as the
 *       authoritative output, but which the legacy Phase C compiler and
 *       its evaluator-registry.ts already populate today for two shapes.
 *
 * NEITHER adapter is authoritative (task §57's own explicit instruction).
 * Calling code must not treat adapter output as compiled-by-AI/verified -
 * every IRRule this module produces carries compilerVersion: null and
 * sufficiency reasons explicitly noting its origin is a legacy adapter,
 * never SEMANTIC_INTERPRETATION-shaped provenance.
 */
import type { CovenantFamily, ContractRuleType } from "@prisma/client";
import type { CovenantProvisionInput, FormulaType } from "../../covenant-engine";
import type { CandidateContractRule } from "../types";
import type { IRRule, IRCapacityExpression, SourceProvenance } from "./types";
import { computeRuleId, withExpressionId } from "./identity";

export const LEGACY_ADAPTER_VERSION = "phase-3a-legacy-adapter.v1";

export interface LegacyAdapterResult {
  rule: IRRule | null;
  /** Present whenever `rule` is null, or whenever a rule WAS produced but with reduced fidelity - always honest about what could not be faithfully translated. */
  refusalReason: string | null;
}

function provenanceFor(companyId: string, documentId: string, sectionRef: string): SourceProvenance {
  return { documentId, sourceNodeKey: null, sourceCitation: `Provision ${sectionRef} (company ${companyId})`, excerpt: null };
}

/**
 * (A) Legacy CovenantProvisionInput -> IR. Supports exactly the three
 * FormulaType shapes whose full economics are captured by the provision
 * row alone: FLAT_AMOUNT, GREATER_OF_FLAT_OR_PCT_EBITDA, FLAT_NET_OF_DEBT.
 * Refuses LEVERAGE_RATIO_ROOM/COVERAGE_RATIO_ROOM/RATIO_GATE (their real
 * "how much room remains" economics depend on the live solver/ratio
 * machinery in lib/covenant-engine.ts - translating them here would mean
 * re-deriving that machinery, not adapting a value, which is exactly the
 * "do not try to translate every rule" instruction) and BUILDER_BASKET
 * (a genuine multi-component basket whose own params can reference OTHER
 * provisions by sectionRef - starterSectionRef/cniSectionRef/
 * equitySectionRef - which this narrow, single-provision adapter cannot
 * safely resolve without the whole document's provision set).
 */
export function adaptLegacyCovenantProvision(provision: CovenantProvisionInput, companyId: string, instrumentKey: string): LegacyAdapterResult {
  const provenance = provenanceFor(companyId, provision.documentId, provision.sectionRef);
  const baseRule = (capacityExpression: IRCapacityExpression, sufficiencyReasons: string[]): IRRule => ({
    ruleId: computeRuleId(companyId, instrumentKey, provision.sectionRef, `legacy:${provision.code}`),
    irSchemaVersion: "headroom-covenant-ir.v1",
    companyId,
    instrumentKey,
    sourceDocumentId: provision.documentId,
    sourceSectionRef: provision.sectionRef,
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "PARTIAL",
    sufficiencyReasons: [`produced by ${LEGACY_ADAPTER_VERSION} from legacy CovenantProvision "${provision.code}" - a narrow, non-authoritative translation, not a real Phase 3B semantic compilation`, ...sufficiencyReasons],
    provenance,
    compilerVersion: null,
    sourceContentVersion: null,
  });

  const type: FormulaType = provision.formulaType;
  switch (type) {
    case "FLAT_AMOUNT": {
      const capacity = withExpressionId({ kind: "MONEY", type: "MONEY", amount: provision.thresholdValue, currency: "USD", provenance });
      return { rule: baseRule(capacity, [`basketName "${provision.basketName}"`]), refusalReason: null };
    }
    case "GREATER_OF_FLAT_OR_PCT_EBITDA": {
      const pct = provision.params?.pctEbitda;
      if (pct === undefined) return { rule: null, refusalReason: `FormulaType GREATER_OF_FLAT_OR_PCT_EBITDA requires params.pctEbitda, which provision "${provision.code}" does not carry - refusing rather than guessing a percentage` };
      const flat = withExpressionId({ kind: "MONEY", type: "MONEY", amount: provision.thresholdValue, currency: "USD", provenance });
      const percentNode = withExpressionId({ kind: "PERCENT", type: "PERCENT", value: pct, provenance });
      const metric = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "EBITDA", companyId, instrumentKey, resolvedDefinitionId: null });
      const multiplied = withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands: [percentNode, metric] });
      const capacity = withExpressionId({ kind: "MAX", type: "MONEY", operands: [flat, multiplied], provenance });
      return { rule: baseRule(capacity, [`basketName "${provision.basketName}"`, 'metricName "EBITDA" is the legacy engine\'s own flat financial-snapshot field, not a per-instrument defined term - a real Phase 3B compilation would resolve this against the instrument\'s own actual EBITDA definition instead']), refusalReason: null };
    }
    case "FLAT_NET_OF_DEBT": {
      const basis = provision.params?.netOfBasis ?? "total";
      const flat = withExpressionId({ kind: "MONEY", type: "MONEY", amount: provision.thresholdValue, currency: "USD", provenance });
      const metric = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: basis === "secured" ? "Secured Debt" : "Total Debt", companyId, instrumentKey, resolvedDefinitionId: null });
      const capacity = withExpressionId({ kind: "SUBTRACT", type: "MONEY", left: flat, right: metric, provenance });
      return { rule: baseRule(capacity, [`basketName "${provision.basketName}"`, `netOfBasis "${basis}"`]), refusalReason: null };
    }
    case "LEVERAGE_RATIO_ROOM":
    case "COVERAGE_RATIO_ROOM":
    case "RATIO_GATE":
      return { rule: null, refusalReason: `FormulaType ${type} depends on the legacy solver/ratio machinery (live financial inputs, debtBasis-scoped debt figures) to compute real remaining headroom - translating it here would mean re-deriving that machinery, not adapting one provision's own stored fields, so this narrow adapter refuses rather than approximate it` };
    case "BUILDER_BASKET":
      return { rule: null, refusalReason: `FormulaType BUILDER_BASKET is a genuine multi-component basket whose params can reference OTHER provisions by sectionRef (starterSectionRef/cniSectionRef/equitySectionRef) - faithfully representing it requires the whole document's provision set, which this single-provision adapter does not have, so it refuses rather than approximate it` };
  }
}

/**
 * (B) Phase B CandidateContractRule -> IR. Supports exactly the two
 * shapes lib/contract-model/compiler/evaluator-registry.ts already has a
 * registered deterministic evaluator for (FIXED_AMOUNT and a maintenance
 * RATIO_TEST with a parseable comparison operator) - deliberately the
 * SAME boundary the evaluator registry itself already draws, so this
 * adapter never claims fidelity the rest of the codebase does not.
 */
export function adaptCandidateContractRule(rule: CandidateContractRule, companyId: string, instrumentKey: string, sourceDocumentId: string): LegacyAdapterResult {
  const provenance = provenanceFor(companyId, sourceDocumentId, rule.sourceSectionRef);
  const base = (capacityExpression: IRCapacityExpression | null, sufficiencyReasons: string[]): IRRule => ({
    ruleId: computeRuleId(companyId, instrumentKey, rule.sourceSectionRef, `candidate:${rule.ruleType}:${rule.action}`),
    irSchemaVersion: "headroom-covenant-ir.v1",
    companyId,
    instrumentKey,
    sourceDocumentId,
    sourceSectionRef: rule.sourceSectionRef,
    // CandidateContractRule's covenantFamily/ruleType are runtime-validated against the real Prisma enums by
    // zodEnumFromPrismaEnum (lib/contract-model/types.ts) but statically typed as plain `string` by that
    // helper's own signature - the cast below reflects a real, existing runtime guarantee, not a new one.
    covenantFamily: rule.covenantFamily as CovenantFamily,
    ruleType: rule.ruleType as ContractRuleType,
    posture: rule.ruleType === "PROHIBITION" ? "PROHIBITION" : rule.ruleType === "RATIO_TEST" ? "OBLIGATION" : "PERMISSION",
    action: rule.action,
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "PARTIAL",
    sufficiencyReasons: [`produced by ${LEGACY_ADAPTER_VERSION} from a Phase B CandidateContractRule - a narrow, non-authoritative translation, not a real Phase 3B semantic compilation`, ...sufficiencyReasons],
    provenance,
    compilerVersion: null,
    sourceContentVersion: null,
  });

  if (rule.formulaRef === "FIXED_AMOUNT") {
    if (rule.thresholdValue === undefined) return { rule: null, refusalReason: 'formulaRef FIXED_AMOUNT requires thresholdValue, which this candidate rule does not carry - refusing rather than guessing an amount' };
    const capacity = withExpressionId({ kind: "MONEY", type: "MONEY", amount: rule.thresholdValue, currency: "USD", provenance });
    return { rule: base(capacity, [`thresholdUnit "${rule.thresholdUnit ?? "unspecified"}"`]), refusalReason: null };
  }
  if (rule.ruleType === "RATIO_TEST") {
    if (rule.thresholdValue === undefined) return { rule: null, refusalReason: "ruleType RATIO_TEST requires thresholdValue, which this candidate rule does not carry - refusing rather than guessing a threshold" };
    const op = rule.operator?.trim();
    const compareOp = op === "<=" || op === "LTE" ? "LTE" : op === ">=" || op === "GTE" ? "GTE" : op === "<" || op === "LT" ? "LT" : op === ">" || op === "GT" ? "GT" : null;
    if (!compareOp) return { rule: null, refusalReason: `ruleType RATIO_TEST requires a parseable comparison operator (<=, >=, <, >) to know which direction the covenant tests - this candidate rule's own operator field ("${rule.operator ?? "(none)"}") is not one, so this adapter refuses rather than guess whether the covenant is a maximum or minimum test` };
    const metricName = rule.definedTermRefs[0] ?? rule.beneficiary ?? "the tested ratio";
    const metric = withExpressionId({ kind: "METRIC_REFERENCE", type: "RATIO", metricName, companyId, instrumentKey, resolvedDefinitionId: null });
    const threshold = withExpressionId({ kind: "RATIO", type: "RATIO", value: rule.thresholdValue, provenance });
    const compareExpr = withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left: metric, operator: compareOp, right: threshold, provenance });
    // A RATIO_TEST's "capacity" is really a pass/fail boolean, not a dollar amount - represented as an UnlimitedCapacity gated by the comparison, honestly signaling "this rule has no dollar capacity of its own, it is a condition on OTHER capacity" rather than forcing a MONEY-typed node that does not exist in the source.
    const capacity: IRCapacityExpression = { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: compareExpr, provenance };
    return { rule: base(capacity, [`metricName "${metricName}" resolved from definedTermRefs[0]/beneficiary, not a confirmed defined-term reference`]), refusalReason: null };
  }

  return { rule: null, refusalReason: `no registered evaluator exists for formulaRef "${rule.formulaRef ?? "(none)"}"/ruleType "${rule.ruleType}" in lib/contract-model/compiler/evaluator-registry.ts - this adapter only translates the same shapes that registry can already execute, so it refuses rather than translate a shape nothing downstream can calculate anyway` };
}
