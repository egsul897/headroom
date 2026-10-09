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
import type { IRRule, IRCapacityExpression, IRExpression, SourceProvenance } from "./types";
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
 * (A) Legacy CovenantProvisionInput -> IR.
 *
 * Supports shapes whose full economics are captured by the provision row
 * plus named METRIC_REFERENCE trees isomorphic to the leaf evaluator:
 * FLAT_AMOUNT, GREATER_OF_*, FLAT_NET_OF_DEBT, LEVERAGE_RATIO_ROOM,
 * COVERAGE_RATIO_ROOM (when rate metric is representable), RATIO_GATE,
 * BUILDER_BASKET (sectionRef params are citation labels, not cross-rule
 * lookups — confirmed against evaluateProvision).
 *
 * Still PARTIAL / compilerVersion null — never a certification bypass.
 * Refuses only when params are incomplete or mechanics are not representable.
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
    case "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS": {
      const pct = provision.params?.pctTotalAssets;
      if (pct === undefined) {
        return {
          rule: null,
          refusalReason: `FormulaType GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS requires params.pctTotalAssets, which provision "${provision.code}" does not carry - refusing rather than guessing a percentage`,
        };
      }
      const flat = withExpressionId({ kind: "MONEY", type: "MONEY", amount: provision.thresholdValue, currency: "USD", provenance });
      const percentNode = withExpressionId({ kind: "PERCENT", type: "PERCENT", value: pct, provenance });
      const metric = withExpressionId({
        kind: "METRIC_REFERENCE",
        type: "MONEY",
        metricName: "Consolidated Total Assets",
        companyId,
        instrumentKey,
        resolvedDefinitionId: null,
      });
      const multiplied = withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands: [percentNode, metric] });
      const capacity = withExpressionId({ kind: "MAX", type: "MONEY", operands: [flat, multiplied], provenance });
      return {
        rule: baseRule(capacity, [
          `basketName "${provision.basketName}"`,
          'metricName "Consolidated Total Assets" is projected from FinancialState.balanceSheetFacts when present',
        ]),
        refusalReason: null,
      };
    }
    case "FLAT_NET_OF_DEBT": {
      const basis = provision.params?.netOfBasis ?? "total";
      const flat = withExpressionId({ kind: "MONEY", type: "MONEY", amount: provision.thresholdValue, currency: "USD", provenance });
      const metric = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: basis === "secured" ? "Secured Debt" : "Total Debt", companyId, instrumentKey, resolvedDefinitionId: null });
      const capacity = withExpressionId({ kind: "SUBTRACT", type: "MONEY", left: flat, right: metric, provenance });
      return { rule: baseRule(capacity, [`basketName "${provision.basketName}"`, `netOfBasis "${basis}"`]), refusalReason: null };
    }
    case "LEVERAGE_RATIO_ROOM": {
      // Leaf: max(0, threshold × EBITDA − netDebt|netSecured). Net = Debt − Cash.
      const basis = provision.params?.debtBasis ?? "total";
      const debtMetricName = basis === "secured" ? "Secured Debt" : "Total Debt";
      const multiple = withExpressionId({ kind: "NUMBER", type: "NUMBER", value: provision.thresholdValue, provenance });
      const ebitda = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "EBITDA", companyId, instrumentKey, resolvedDefinitionId: null });
      const grossDebt = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: debtMetricName, companyId, instrumentKey, resolvedDefinitionId: null });
      const cash = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "Cash", companyId, instrumentKey, resolvedDefinitionId: null });
      const netDebt = withExpressionId({ kind: "SUBTRACT", type: "MONEY", left: grossDebt, right: cash, provenance });
      const room = withExpressionId({ kind: "SUBTRACT", type: "MONEY", left: withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands: [multiple, ebitda] }), right: netDebt, provenance });
      const zero = withExpressionId({ kind: "MONEY", type: "MONEY", amount: 0, currency: "USD", provenance });
      const capacity = withExpressionId({ kind: "MAX", type: "MONEY", operands: [zero, room], provenance });
      return {
        rule: baseRule(capacity, [
          `basketName "${provision.basketName}"`,
          `debtBasis "${basis}" → net (${debtMetricName} − Cash)`,
          "IR tree matches leaf LEVERAGE_RATIO_ROOM; PARTIAL until Phase 3B certification",
        ]),
        refusalReason: null,
      };
    }
    case "COVERAGE_RATIO_ROOM": {
      // Leaf: max(0, (EBITDA/threshold − interest) / rate).
      // IR DIVIDE cannot declare MONEY, so express as MULTIPLY by reciprocal rate metric.
      if (!(provision.thresholdValue > 0)) {
        return {
          rule: null,
          refusalReason: `FormulaType COVERAGE_RATIO_ROOM requires a positive coverage threshold; provision "${provision.code}" has thresholdValue ${provision.thresholdValue} — refusing rather than dividing by zero`,
        };
      }
      const invThreshold = withExpressionId({ kind: "NUMBER", type: "NUMBER", value: 1 / provision.thresholdValue, provenance });
      const ebitda = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "EBITDA", companyId, instrumentKey, resolvedDefinitionId: null });
      const interest = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "Interest Expense", companyId, instrumentKey, resolvedDefinitionId: null });
      const maxInterest = withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands: [invThreshold, ebitda] });
      const headroomInterest = withExpressionId({ kind: "SUBTRACT", type: "MONEY", left: maxInterest, right: interest, provenance });
      const rateReciprocal = withExpressionId({
        kind: "METRIC_REFERENCE",
        type: "NUMBER",
        metricName: "Assumed New Debt Rate Reciprocal",
        companyId,
        instrumentKey,
        resolvedDefinitionId: null,
      });
      const room = withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands: [rateReciprocal, headroomInterest] });
      const zero = withExpressionId({ kind: "MONEY", type: "MONEY", amount: 0, currency: "USD", provenance });
      const capacity = withExpressionId({ kind: "MAX", type: "MONEY", operands: [zero, room], provenance });
      return {
        rule: baseRule(capacity, [
          `basketName "${provision.basketName}"`,
          "requires metrics EBITDA, Interest Expense, Assumed New Debt Rate Reciprocal; missing rate → NEEDS_INPUT",
          "IR tree matches leaf COVERAGE_RATIO_ROOM economics; PARTIAL until Phase 3B certification",
        ]),
        refusalReason: null,
      };
    }
    case "RATIO_GATE": {
      // Leaf: unlimited if leverage ≤ threshold, else 0. Represent as UnlimitedCapacity gated by COMPARE.
      const basis = provision.params?.debtBasis ?? "total";
      const debtMetricName = basis === "secured" ? "Secured Debt" : "Total Debt";
      const grossDebt = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: debtMetricName, companyId, instrumentKey, resolvedDefinitionId: null });
      const cash = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "Cash", companyId, instrumentKey, resolvedDefinitionId: null });
      const netDebt = withExpressionId({ kind: "SUBTRACT", type: "MONEY", left: grossDebt, right: cash, provenance });
      const ebitda = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "EBITDA", companyId, instrumentKey, resolvedDefinitionId: null });
      const leverage = withExpressionId({ kind: "DIVIDE", type: "RATIO", numerator: netDebt, denominator: ebitda, provenance });
      const threshold = withExpressionId({ kind: "RATIO", type: "RATIO", value: provision.thresholdValue, provenance });
      const gate = withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left: leverage, operator: "LTE", right: threshold, provenance });
      const capacity: IRCapacityExpression = { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: gate, provenance };
      return {
        rule: baseRule(capacity, [
          `basketName "${provision.basketName}"`,
          `debtBasis "${basis}" net leverage gate`,
          "IR UnlimitedCapacity+COMPARE matches leaf RATIO_GATE; PARTIAL until Phase 3B certification",
        ]),
        refusalReason: null,
      };
    }
    case "BUILDER_BASKET": {
      // Leaf: max(threshold, pct×EBITDA) + cniShare×max(0,CNI) + optional equity.
      // starterSectionRef/cniSectionRef/equitySectionRef are citation labels only (evaluateProvision),
      // not cross-provision value lookups — classification was (1) missing representation support, now fixed.
      const pct = provision.params?.pctEbitda ?? 0;
      const flat = withExpressionId({ kind: "MONEY", type: "MONEY", amount: provision.thresholdValue, currency: "USD", provenance });
      const percentNode = withExpressionId({ kind: "PERCENT", type: "PERCENT", value: pct, provenance });
      const ebitda = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "EBITDA", companyId, instrumentKey, resolvedDefinitionId: null });
      const grower = withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands: [percentNode, ebitda] });
      const starter = withExpressionId({ kind: "MAX", type: "MONEY", operands: [flat, grower], provenance });
      const operands: IRExpression[] = [starter];
      const reasons = [
        `basketName "${provision.basketName}"`,
        `starterSectionRef "${provision.params?.starterSectionRef ?? provision.sectionRef}" (citation label)`,
      ];
      if (provision.params?.cniSharePct) {
        const cniShare = withExpressionId({ kind: "PERCENT", type: "PERCENT", value: provision.params.cniSharePct, provenance });
        const cni = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "Cumulative Net Income", companyId, instrumentKey, resolvedDefinitionId: null });
        const zero = withExpressionId({ kind: "MONEY", type: "MONEY", amount: 0, currency: "USD", provenance });
        const cniFloor = withExpressionId({ kind: "MAX", type: "MONEY", operands: [zero, cni] });
        operands.push(withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands: [cniShare, cniFloor] }));
        reasons.push(`cniSharePct ${provision.params.cniSharePct}; cniSectionRef "${provision.params.cniSectionRef ?? provision.sectionRef}" (citation)`);
      }
      if (provision.params?.includeEquityProceeds) {
        operands.push(
          withExpressionId({
            kind: "METRIC_REFERENCE",
            type: "MONEY",
            metricName: "Equity Proceeds Since Issue",
            companyId,
            instrumentKey,
            resolvedDefinitionId: null,
          }),
        );
        reasons.push(`includeEquityProceeds; equitySectionRef "${provision.params.equitySectionRef ?? provision.sectionRef}" (citation)`);
      }
      const capacity: IRCapacityExpression =
        operands.length === 1
          ? operands[0]!
          : withExpressionId({ kind: "ADD", type: "MONEY", operands, provenance });
      reasons.push("IR tree matches leaf BUILDER_BASKET; PARTIAL until Phase 3B certification");
      return { rule: baseRule(capacity, reasons), refusalReason: null };
    }
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
