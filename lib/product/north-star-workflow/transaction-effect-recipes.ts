/**
 * Product-layer recipes that compose Phase 4D typed effects for common business
 * transaction forms. Labels/categories are metadata only — the Phase 4D engine
 * never branches on them. No per-form engine is introduced here.
 *
 * Restore / release effects require an explicit contractualAuthorityRef; recipes
 * refuse to emit RESTORE_CAPACITY without it.
 */
import type {
  HypotheticalTransaction,
  SelectedPath,
  TransactionEffect,
  TransactionQuantity,
  ReclassificationElection,
} from "@/lib/contract-model/sequential-execution";
import { formatRestoreReason } from "@/lib/contract-model/verified-execution";
import type { EntityClassTag } from "@prisma/client";

export const TRANSACTION_EFFECT_RECIPES_VERSION = "transaction-effect-recipes.v1" as const;

/** Business forms the product layer can compose into Phase 4D effects. */
export type BusinessTransactionType =
  | "DEBT_INCURRENCE"
  | "DEBT_REPAYMENT"
  | "SECURED_BORROWING"
  | "DIVIDEND_PAYMENT"
  | "RESTRICTED_INVESTMENT"
  | "EQUITY_CONTRIBUTION"
  | "INVESTMENT_RETURN"
  | "ASSET_SALE"
  | "REINVESTMENT"
  | "BASKET_RECLASSIFICATION"
  | "AMENDMENT_AFFECTING_CAPACITY"
  | "SEQUENTIAL_TRANSACTIONS";

export type RecipeApprovalStatus = "HYPOTHETICAL" | "PROPOSED" | "APPROVED";

export interface RecipeLimitation {
  code:
    | "MISSING_CONTRACTUAL_AUTHORITY"
    | "MISSING_CAPACITY_NODE"
    | "MISSING_USAGE_IDENTITY"
    | "MISSING_METRIC_KEY"
    | "MISSING_RECLASSIFICATION_ELECTION"
    | "AMENDMENT_REQUIRES_NEW_CAPACITY_GRAPH"
    | "UNSUPPORTED_RECIPE_SHAPE";
  message: string;
  refs: string[];
}

export interface CapacityDrawSpec {
  effectId: string;
  capacityNodeId: string;
  amount: TransactionQuantity;
  ruleId?: string;
}

export interface MetricAdjustmentSpec {
  effectId: string;
  metricKey: string;
  adjustment: { kind: "DELTA" | "SET"; value: TransactionQuantity };
  period?: string | null;
  asOf?: string | null;
}

export interface RestoreSpec {
  effectId: string;
  usageId: string;
  reason: string;
  /** Required. Without contractual authority, restore is refused. */
  contractualAuthorityRef: string;
}

export interface RecipeIdentity {
  transactionId: string;
  companyId: string;
  instrumentKey: string;
  effectiveAsOf: string;
  entities?: EntityClassTag[];
  intendedAmount?: TransactionQuantity | null;
  unallocatedAmount?: TransactionQuantity | null;
  provenance: {
    source: string;
    sourceVersion: string | null;
    approvalRef: string | null;
  };
  approvalStatus: RecipeApprovalStatus;
}

export interface RecipeBuildResult {
  ok: boolean;
  businessType: BusinessTransactionType;
  recipesVersion: typeof TRANSACTION_EFFECT_RECIPES_VERSION;
  /** Display metadata only — never used for Phase 4D behavioural branching. */
  category: string;
  label: string;
  effects: TransactionEffect[];
  selectedPath: SelectedPath;
  transaction: HypotheticalTransaction | null;
  applicableEntities: EntityClassTag[];
  contractualPathway: string[];
  financialChanges: MetricAdjustmentSpec[];
  basketConsumption: CapacityDrawSpec[];
  basketRestoration: RestoreSpec[];
  sharedCapacityIds: string[];
  limitations: RecipeLimitation[];
  approvalStatus: RecipeApprovalStatus;
  provenance: RecipeIdentity["provenance"];
  notes: string[];
}

function baseResult(
  businessType: BusinessTransactionType,
  category: string,
  label: string,
  identity: RecipeIdentity,
): RecipeBuildResult {
  return {
    ok: true,
    businessType,
    recipesVersion: TRANSACTION_EFFECT_RECIPES_VERSION,
    category,
    label,
    effects: [],
    selectedPath: {
      capacityNodeIds: [],
      ruleIds: [],
      sharedCapacityIds: [],
      reclassificationElectionIds: [],
    },
    transaction: null,
    applicableEntities: identity.entities ?? [],
    contractualPathway: [],
    financialChanges: [],
    basketConsumption: [],
    basketRestoration: [],
    sharedCapacityIds: [],
    limitations: [],
    approvalStatus: identity.approvalStatus,
    provenance: identity.provenance,
    notes: [],
  };
}

function finalize(result: RecipeBuildResult, identity: RecipeIdentity): RecipeBuildResult {
  result.ok = result.limitations.length === 0;
  if (!result.ok) {
    result.transaction = null;
    return result;
  }
  result.transaction = {
    transactionId: identity.transactionId,
    companyId: identity.companyId,
    instrumentKey: identity.instrumentKey,
    effectiveAsOf: identity.effectiveAsOf,
    category: result.category,
    label: result.label,
    entities: identity.entities,
    intendedAmount: identity.intendedAmount ?? null,
    unallocatedAmount: identity.unallocatedAmount ?? null,
    effects: result.effects,
    provenance: identity.provenance,
  };
  return result;
}

function pushConsume(result: RecipeBuildResult, draw: CapacityDrawSpec): void {
  result.effects.push({
    effectId: draw.effectId,
    kind: "CONSUME_CAPACITY",
    capacityNodeId: draw.capacityNodeId,
    amount: draw.amount,
  });
  result.basketConsumption.push(draw);
  if (!result.selectedPath.capacityNodeIds.includes(draw.capacityNodeId)) {
    result.selectedPath.capacityNodeIds.push(draw.capacityNodeId);
  }
  if (draw.ruleId && !result.selectedPath.ruleIds.includes(draw.ruleId)) {
    result.selectedPath.ruleIds.push(draw.ruleId);
  }
}

function pushMetric(result: RecipeBuildResult, adj: MetricAdjustmentSpec): void {
  result.effects.push({
    effectId: adj.effectId,
    kind: "CHANGE_METRIC",
    metricKey: adj.metricKey,
    period: adj.period ?? null,
    asOf: adj.asOf ?? null,
    adjustment: adj.adjustment,
  });
  result.financialChanges.push(adj);
}

function pushRestore(result: RecipeBuildResult, restore: RestoreSpec): void {
  if (!restore.contractualAuthorityRef.trim()) {
    result.limitations.push({
      code: "MISSING_CONTRACTUAL_AUTHORITY",
      message:
        "RESTORE_CAPACITY refused: capacity may not be restored without an explicit contractualAuthorityRef",
      refs: [restore.effectId, restore.usageId],
    });
    return;
  }
  if (!restore.usageId.trim()) {
    result.limitations.push({
      code: "MISSING_USAGE_IDENTITY",
      message: "RESTORE_CAPACITY requires an existing usage identity",
      refs: [restore.effectId],
    });
    return;
  }
  result.effects.push({
    effectId: restore.effectId,
    kind: "RESTORE_CAPACITY",
    usageId: restore.usageId,
    reason: formatRestoreReason(restore.reason, restore.contractualAuthorityRef),
  });
  result.basketRestoration.push(restore);
  result.contractualPathway.push(restore.contractualAuthorityRef);
}

/** Unsecured (or generic) debt incurrence: consume selected debt capacity + optional pro-forma debt metric. */
export function recipeDebtIncurrence(
  identity: RecipeIdentity,
  args: {
    draws: CapacityDrawSpec[];
    debtMetric?: MetricAdjustmentSpec | null;
    sharedCapacityIds?: string[];
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "DEBT_INCURRENCE",
    "DEBT_INCURRENCE",
    args.label ?? "Debt incurrence",
    identity,
  );
  if (args.draws.length === 0) {
    result.limitations.push({
      code: "MISSING_CAPACITY_NODE",
      message: "Debt incurrence requires at least one explicit capacity draw",
      refs: [identity.transactionId],
    });
  }
  for (const d of args.draws) pushConsume(result, d);
  if (args.debtMetric) pushMetric(result, args.debtMetric);
  result.sharedCapacityIds = args.sharedCapacityIds ?? [];
  result.selectedPath.sharedCapacityIds = [...result.sharedCapacityIds];
  result.contractualPathway.push(...result.selectedPath.ruleIds);
  result.notes.push("Pro-forma debt metrics are caller-stated CHANGE_METRIC effects; never inferred.");
  return finalize(result, identity);
}

/** Debt repayment: restore identified prior usage under contractual authority + optional debt metric reduction. */
export function recipeDebtRepayment(
  identity: RecipeIdentity,
  args: {
    restores: RestoreSpec[];
    debtMetric?: MetricAdjustmentSpec | null;
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "DEBT_REPAYMENT",
    "DEBT_REPAYMENT",
    args.label ?? "Debt repayment",
    identity,
  );
  if (args.restores.length === 0) {
    result.limitations.push({
      code: "MISSING_USAGE_IDENTITY",
      message: "Debt repayment requires at least one usage identity to restore/supersede",
      refs: [identity.transactionId],
    });
  }
  for (const r of args.restores) pushRestore(result, r);
  if (args.debtMetric) pushMetric(result, args.debtMetric);
  result.notes.push("Repayment restores capacity only for the identified prior usage under stated authority.");
  return finalize(result, identity);
}

/** Secured borrowing: explicit multi-node consume (e.g. debt + liens) with stated allocation. */
export function recipeSecuredBorrowing(
  identity: RecipeIdentity,
  args: {
    draws: CapacityDrawSpec[];
    debtMetric?: MetricAdjustmentSpec | null;
    securedDebtMetric?: MetricAdjustmentSpec | null;
    sharedCapacityIds?: string[];
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "SECURED_BORROWING",
    "SECURED_BORROWING",
    args.label ?? "Secured borrowing",
    identity,
  );
  if (args.draws.length < 1) {
    result.limitations.push({
      code: "MISSING_CAPACITY_NODE",
      message: "Secured borrowing requires explicit capacity draws (debt and/or lien paths)",
      refs: [identity.transactionId],
    });
  }
  for (const d of args.draws) pushConsume(result, d);
  if (args.debtMetric) pushMetric(result, args.debtMetric);
  if (args.securedDebtMetric) pushMetric(result, args.securedDebtMetric);
  result.sharedCapacityIds = args.sharedCapacityIds ?? [];
  result.selectedPath.sharedCapacityIds = [...result.sharedCapacityIds];
  result.contractualPathway.push(...result.selectedPath.ruleIds);
  result.notes.push("Secured path is caller-selected; no companion path is inferred.");
  return finalize(result, identity);
}

/** Dividend / restricted payment: consume RP capacity (+ optional builder metric deltas). */
export function recipeDividendPayment(
  identity: RecipeIdentity,
  args: {
    draws: CapacityDrawSpec[];
    builderMetrics?: MetricAdjustmentSpec[];
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "DIVIDEND_PAYMENT",
    "RESTRICTED_PAYMENT",
    args.label ?? "Dividend payment",
    identity,
  );
  if (args.draws.length === 0) {
    result.limitations.push({
      code: "MISSING_CAPACITY_NODE",
      message: "Dividend / restricted payment requires an explicit capacity draw",
      refs: [identity.transactionId],
    });
  }
  for (const d of args.draws) pushConsume(result, d);
  for (const m of args.builderMetrics ?? []) pushMetric(result, m);
  result.contractualPathway.push(...result.selectedPath.ruleIds);
  return finalize(result, identity);
}

/** Restricted investment: consume investment capacity. */
export function recipeRestrictedInvestment(
  identity: RecipeIdentity,
  args: {
    draws: CapacityDrawSpec[];
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "RESTRICTED_INVESTMENT",
    "RESTRICTED_INVESTMENT",
    args.label ?? "Restricted investment",
    identity,
  );
  if (args.draws.length === 0) {
    result.limitations.push({
      code: "MISSING_CAPACITY_NODE",
      message: "Restricted investment requires an explicit capacity draw",
      refs: [identity.transactionId],
    });
  }
  for (const d of args.draws) pushConsume(result, d);
  result.contractualPathway.push(...result.selectedPath.ruleIds);
  return finalize(result, identity);
}

/** Equity contribution: explicit metric adjustments only (never inferred accounting). */
export function recipeEquityContribution(
  identity: RecipeIdentity,
  args: {
    metrics: MetricAdjustmentSpec[];
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "EQUITY_CONTRIBUTION",
    "EQUITY_CONTRIBUTION",
    args.label ?? "Equity contribution",
    identity,
  );
  if (args.metrics.length === 0) {
    result.limitations.push({
      code: "MISSING_METRIC_KEY",
      message: "Equity contribution must state explicit CHANGE_METRIC adjustments; accounting is never inferred",
      refs: [identity.transactionId],
    });
  }
  for (const m of args.metrics) pushMetric(result, m);
  result.notes.push("Builder / available-amount effects require the caller to name the contract inputs.");
  return finalize(result, identity);
}

/**
 * Investment returns: optional restore of prior investment usage (with authority)
 * plus explicit return/proceeds metrics.
 */
export function recipeInvestmentReturn(
  identity: RecipeIdentity,
  args: {
    restores?: RestoreSpec[];
    metrics: MetricAdjustmentSpec[];
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "INVESTMENT_RETURN",
    "INVESTMENT_RETURN",
    args.label ?? "Investment return",
    identity,
  );
  for (const r of args.restores ?? []) pushRestore(result, r);
  if (args.metrics.length === 0 && (args.restores ?? []).length === 0) {
    result.limitations.push({
      code: "UNSUPPORTED_RECIPE_SHAPE",
      message: "Investment return requires at least one metric adjustment or authorized restore",
      refs: [identity.transactionId],
    });
  }
  for (const m of args.metrics) pushMetric(result, m);
  return finalize(result, identity);
}

/** Asset sale: explicit metrics / events; optional capacity consume if proceeds route through a basket. */
export function recipeAssetSale(
  identity: RecipeIdentity,
  args: {
    metrics: MetricAdjustmentSpec[];
    draws?: CapacityDrawSpec[];
    eventDescription?: string | null;
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "ASSET_SALE",
    "ASSET_SALE",
    args.label ?? "Asset sale",
    identity,
  );
  if (args.metrics.length === 0 && (args.draws ?? []).length === 0 && !args.eventDescription) {
    result.limitations.push({
      code: "UNSUPPORTED_RECIPE_SHAPE",
      message: "Asset sale must state metrics, capacity draws, and/or an event activation explicitly",
      refs: [identity.transactionId],
    });
  }
  for (const m of args.metrics) pushMetric(result, m);
  for (const d of args.draws ?? []) pushConsume(result, d);
  if (args.eventDescription) {
    result.effects.push({
      effectId: "evt-asset-sale",
      kind: "ACTIVATE_EVENT",
      eventDescription: args.eventDescription,
      asOf: identity.effectiveAsOf,
    });
  }
  result.contractualPathway.push(...result.selectedPath.ruleIds);
  result.notes.push("Asset-sale accounting treatment is not inferred; only stated effects apply.");
  return finalize(result, identity);
}

/** Reinvestment of sale proceeds: event + investment capacity consume (+ optional metrics). */
export function recipeReinvestment(
  identity: RecipeIdentity,
  args: {
    draws: CapacityDrawSpec[];
    metrics?: MetricAdjustmentSpec[];
    eventDescription?: string | null;
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "REINVESTMENT",
    "REINVESTMENT",
    args.label ?? "Reinvestment",
    identity,
  );
  if (args.draws.length === 0) {
    result.limitations.push({
      code: "MISSING_CAPACITY_NODE",
      message: "Reinvestment requires an explicit investment-capacity draw",
      refs: [identity.transactionId],
    });
  }
  for (const d of args.draws) pushConsume(result, d);
  for (const m of args.metrics ?? []) pushMetric(result, m);
  if (args.eventDescription) {
    result.effects.push({
      effectId: "evt-reinvest",
      kind: "ACTIVATE_EVENT",
      eventDescription: args.eventDescription,
      asOf: identity.effectiveAsOf,
    });
  }
  result.contractualPathway.push(...result.selectedPath.ruleIds);
  return finalize(result, identity);
}

/** Basket reclassification: APPLY_RECLASSIFICATION with encoded Phase-3 edge (election). */
export function recipeBasketReclassification(
  identity: RecipeIdentity,
  args: {
    effectId: string;
    election: ReclassificationElection;
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "BASKET_RECLASSIFICATION",
    "BASKET_RECLASSIFICATION",
    args.label ?? "Basket reclassification",
    identity,
  );
  if (!args.election) {
    result.limitations.push({
      code: "MISSING_RECLASSIFICATION_ELECTION",
      message: "Reclassification requires a caller-supplied election against an encoded edge",
      refs: [identity.transactionId],
    });
    return finalize(result, identity);
  }
  result.effects.push({
    effectId: args.effectId,
    kind: "APPLY_RECLASSIFICATION",
    election: args.election,
  });
  result.selectedPath.reclassificationElectionIds = [args.election.electionId];
  result.selectedPath.ruleIds = [args.election.sourceRuleId, args.election.destinationRuleId];
  result.contractualPathway.push(
    `RECLASSIFIABLE_TO:${args.election.sourceRuleId}->${args.election.destinationRuleId}`,
  );
  result.notes.push("Reclassification executes only when Phase-3 encodes RECLASSIFIABLE_TO authority.");
  return finalize(result, identity);
}

/**
 * Amendments affecting capacity are not Phase 4D effects by themselves.
 * Callers must re-bind IR / capacity graph (Phase 3 operative resolution), then optionally
 * state explicit metric/event effects that the amendment text authorises.
 */
export function recipeAmendmentAffectingCapacity(
  identity: RecipeIdentity,
  args: {
    metrics?: MetricAdjustmentSpec[];
    eventDescription?: string | null;
    amendmentRef: string;
    label?: string;
  },
): RecipeBuildResult {
  const result = baseResult(
    "AMENDMENT_AFFECTING_CAPACITY",
    "AMENDMENT",
    args.label ?? "Amendment affecting capacity",
    identity,
  );
  result.contractualPathway.push(args.amendmentRef);
  result.limitations.push({
    code: "AMENDMENT_REQUIRES_NEW_CAPACITY_GRAPH",
    message:
      "Amendments that change operative capacity must be resolved into a new capacity graph (Phase 3) before Phase 4D simulation; this recipe refuses silent capacity mutation",
    refs: [identity.transactionId, args.amendmentRef],
  });
  for (const m of args.metrics ?? []) pushMetric(result, m);
  if (args.eventDescription) {
    result.effects.push({
      effectId: "evt-amendment",
      kind: "ACTIVATE_EVENT",
      eventDescription: args.eventDescription,
      asOf: identity.effectiveAsOf,
    });
  }
  result.notes.push(
    "ok=false until the caller supplies a re-bound capacity graph and clears AMENDMENT_REQUIRES_NEW_CAPACITY_GRAPH by using recipeDebtIncurrence / other recipes against that graph.",
  );
  // Always fail closed: amendment cannot silently alter capacity through this recipe alone.
  result.ok = false;
  result.transaction = null;
  return result;
}

/** All business types this module claims to compose (for inventory / demos). */
export const ALL_BUSINESS_TRANSACTION_TYPES: readonly BusinessTransactionType[] = [
  "DEBT_INCURRENCE",
  "DEBT_REPAYMENT",
  "SECURED_BORROWING",
  "DIVIDEND_PAYMENT",
  "RESTRICTED_INVESTMENT",
  "EQUITY_CONTRIBUTION",
  "INVESTMENT_RETURN",
  "ASSET_SALE",
  "REINVESTMENT",
  "BASKET_RECLASSIFICATION",
  "AMENDMENT_AFFECTING_CAPACITY",
  "SEQUENTIAL_TRANSACTIONS",
] as const;
