/**
 * Agent 2 — generalized financial/utilization → capacity integration.
 *
 * Connects financial-state selection, utilization reconstruction, completeness
 * authority, shared-capacity constraints, and the Phase-4C capacity evaluator.
 *
 * A contractual basket ceiling is NOT remaining borrowing capacity.
 * Numeric remaining is published only when completeness authority supports it.
 *
 * Does NOT compile covenants (Agent 1). Accepts an executable-rule handoff.
 * Does NOT activate production trusted-issuer identity.
 */

import { createHash } from "node:crypto";
import type { IRDefinition, IRRule, IRSharedCapacity } from "@/lib/contract-model/ir/types";
import {
  buildCapacityGraph,
  evaluateCapacityState,
} from "@/lib/contract-model/runtime/capacity";
import type {
  CapacityAmount,
  CapacityState,
  CapacityStateEntry,
  LedgerUsageRecord,
  SharedConstraintState,
} from "@/lib/contract-model/runtime/capacity/types";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import type {
  FinancialInput,
  FinancialSnapshot,
  SnapshotStatus,
} from "@/lib/contract-model/runtime/input/types";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "@/lib/contract-model/runtime/types";
import type { TrustedIssuerAuthorizationContext } from "./completeness-issuer-auth";
import {
  selectFinancialState,
  type FinancialEvidenceCatalog,
  type FinancialStateSelectionQuery,
  type FinancialStateSelectionResult,
} from "./financial-state-selection";
import type { FinancialMetricKey } from "./financial-evidence";
import {
  reconstructUtilizationEvidence,
  type HistoricalUtilizationEvent,
  type UtilizationReconstructionResult,
} from "./utilization-evidence-reconstruction";
import {
  classifyUtilizationCompletenessAuthority,
  type UtilizationCompletenessAuthorityResult,
  type UtilizationCompletenessAuthorityStatus,
} from "./utilization-completeness-status";
import {
  historicalEventsToLedgerUsage,
  utilizationRecordsToLedgerUsage,
} from "./ledger-utilization-bridge";
import { resolveUtilization } from "./utilization-resolver";
import type {
  UtilizationCompletenessCertificate,
  UtilizationEvidenceRecord,
  UtilizationResolution,
} from "./utilization-types";
import {
  computeVerifiedRemaining,
  type VerifiedRemainingResult,
} from "./verified-remaining";
import {
  buildVerifiedCapacityInputHandoff,
  type VerifiedCapacityInputHandoff,
} from "./verified-input-contract";
import { TRUSTED_ISSUER_ACTIVATION } from "./trusted-issuer-host";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "./identity/activation";

export const VERIFIED_REMAINING_CAPACITY_CONTRACT_VERSION =
  "verified-remaining-capacity.v1" as const;

/**
 * Executable-rule handoff from Agent 1 — pre-compiled IR only.
 * This module never compiles source documents.
 */
export interface ExecutableRuleHandoff {
  companyId: string;
  instrumentKey: string;
  rules: readonly IRRule[];
  definitions?: readonly IRDefinition[];
  sharedCapacities?: readonly IRSharedCapacity[];
  /**
   * Optional verification artifacts. Absence is recorded as incomplete
   * certification — never invented.
   */
  verificationComplete?: boolean;
}

export type CapacityConfidenceAuthority =
  | "GROSS_CONTRACTUAL_ONLY"
  | "FINANCIALLY_MODELED"
  | "UTILIZATION_PARTIAL"
  | "REMAINING_REVIEWED_DEMO"
  | "VERIFIED_REMAINING"
  | "PRODUCTION_AUTHORITATIVE"
  | "REFUSED";

export interface BindingRestriction {
  code: string;
  message: string;
  sharedCapacityId?: string | null;
  ruleId?: string | null;
  failClosed: boolean;
}

export interface CapacityCalculationTraceEntry {
  stage:
    | "FINANCIAL_SELECTION"
    | "UTILIZATION_RECONSTRUCTION"
    | "COMPLETENESS_AUTHORITY"
    | "CAPACITY_EVALUATION"
    | "SHARED_CAPACITY"
    | "REMAINING_CLAIM"
    | "REFUSAL";
  detail: string;
}

export interface VerifiedRemainingCapacityResult {
  contractVersion: typeof VERIFIED_REMAINING_CAPACITY_CONTRACT_VERSION;
  companyId: string;
  instrumentKey: string;
  capacityRuleId: string;
  asOf: string;
  /** Gross contractual amount from the capacity expression (ceiling). */
  grossContractualAmount: number | null;
  grossUnlimited: boolean;
  /** Financially modeled amount after approved financial inputs (may equal gross). */
  financiallyModeledAmount: number | null;
  /** Historical utilization attributed to the path when known. */
  historicalUtilization: number | null;
  /**
   * Remaining amount when completeness supports it — otherwise null.
   * Never invented when completeness is missing.
   */
  remainingAmount: number | null;
  remainingSupported: boolean;
  bindingRestrictions: BindingRestriction[];
  missingInputs: string[];
  confidenceAuthority: CapacityConfidenceAuthority;
  completenessAuthority: UtilizationCompletenessAuthorityStatus;
  calculationTrace: CapacityCalculationTraceEntry[];
  provenance: {
    financial: FinancialStateSelectionResult["provenance"];
    utilizationEventIds: string[];
    ledgerUsageIds: string[];
    capacityStateHash: string | null;
    inputHash: string;
    executableRuleIds: string[];
    sharedCapacityIds: string[];
  };
  /** Nested engine artifacts for Agent 3 consumers. */
  artifacts: {
    financialSelection: FinancialStateSelectionResult;
    utilizationReconstruction: UtilizationReconstructionResult | null;
    utilizationResolution: UtilizationResolution;
    completeness: UtilizationCompletenessAuthorityResult;
    capacityState: CapacityState | null;
    capacityEntry: CapacityStateEntry | null;
    sharedConstraints: SharedConstraintState[];
    verifiedRemaining: VerifiedRemainingResult | null;
    verifiedInputHandoff: VerifiedCapacityInputHandoff | null;
  };
  blockers: string[];
  note: string;
  /** True only when PRODUCTION_AUTHORITATIVE — always false while IdP activation is BLOCKED. */
  mayPublishProductionRemaining: boolean;
}

export interface EvaluateVerifiedRemainingCapacityArgs {
  companyId: string;
  instrumentKey: string;
  capacityRuleId: string;
  asOf: string;
  currency: string;
  /** Agent 1 executable-rule handoff (required for modeled gross). */
  executableRules: ExecutableRuleHandoff;
  /** Financial evidence catalog (in-memory or loaded from disposable persistence). */
  financialCatalog: FinancialEvidenceCatalog;
  financialQuery?: Partial<
    Omit<FinancialStateSelectionQuery, "companyId" | "asOf" | "metricKeys" | "currency">
  > & {
    metricKeys?: readonly FinancialMetricKey[];
    reportingPeriod?: string | null;
  };
  /** Required metrics for grower / ratio limbs; empty for fixed-dollar baskets. */
  requiredFinancialMetrics?: readonly FinancialMetricKey[];
  /** Historical utilization events (debt, RP, liens, investments, sales, reclass, repayments). */
  utilizationEvents?: readonly HistoricalUtilizationEvent[];
  /** Pre-built utilization records (alternative / additive to events). */
  utilizationRecords?: readonly UtilizationEvidenceRecord[];
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  /** Test/demo only. */
  allowSynthetic?: boolean;
  /** Pre-built Phase-4B snapshots — when omitted, derived from selected financial evidence. */
  financialSnapshots?: readonly FinancialSnapshot[];
  /** Extra ledger rows (e.g. from contract ledger store). */
  additionalLedger?: readonly LedgerUsageRecord[];
}

function moneyValue(amount: number, currency: string): RuntimeValue {
  return {
    type: "MONEY",
    amount: rationalFromString(String(amount)),
    currency,
    lineage: { exprId: null, inputKeys: [] },
  };
}

function capacityAmountToNumber(amount: CapacityAmount): {
  value: number | null;
  unlimited: boolean;
  gateFailed: boolean;
  determined: boolean;
  reason?: string;
} {
  if (amount.kind === "AMOUNT" && amount.value.type === "MONEY") {
    const n = Number(amount.value.amount);
    return {
      value: Number.isFinite(n) ? n : null,
      unlimited: false,
      gateFailed: false,
      determined: Number.isFinite(n),
    };
  }
  if (amount.kind === "UNLIMITED") {
    return { value: null, unlimited: true, gateFailed: false, determined: true };
  }
  if (amount.kind === "GATE_NOT_SATISFIED") {
    return { value: null, unlimited: false, gateFailed: true, determined: false, reason: "gate not satisfied" };
  }
  return {
    value: null,
    unlimited: false,
    gateFailed: false,
    determined: false,
    reason: amount.kind === "NOT_DETERMINED" ? amount.reason : "not determined",
  };
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

function snapshotsFromSelection(
  selection: FinancialStateSelectionResult,
  instrumentKey: string,
  currency: string,
  allowUnapproved: boolean,
): FinancialSnapshot[] {
  if (!selection.snapshot) return [];
  const inputs: FinancialInput[] = [];
  for (const m of selection.snapshot.metrics) {
    inputs.push({
      identity: {
        companyId: selection.companyId,
        scope: { kind: "INSTRUMENT_LEVEL", instrumentKey },
        inputKind: "METRIC",
        key: m.metricKey === "CONSOLIDATED_EBITDA" ? "Consolidated EBITDA" : m.metricKey,
        identityStrength: "CONTRACT_NAME_ONLY",
        period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: selection.snapshot.reportingPeriod },
        asOf: { kind: "EXACT_DATE", isoDate: selection.asOf },
        valueType: "MONEY",
        currency: m.currency,
      },
      value: moneyValue(m.value, m.currency),
      sourceVersion: m.provenanceId,
    });
  }
  // Also emit common metric name aliases used by IR METRIC_REFERENCE nodes.
  for (const m of selection.snapshot.metrics) {
    if (m.metricKey === "TOTAL_ASSETS") {
      inputs.push({
        identity: {
          companyId: selection.companyId,
          scope: { kind: "INSTRUMENT_LEVEL", instrumentKey },
          inputKind: "METRIC",
          key: "Total Assets",
          identityStrength: "CONTRACT_NAME_ONLY",
          period: { kind: "NOT_PERIOD_SPECIFIC" },
          asOf: { kind: "EXACT_DATE", isoDate: selection.asOf },
          valueType: "MONEY",
          currency: m.currency,
        },
        value: moneyValue(m.value, m.currency),
        sourceVersion: m.provenanceId,
      });
    }
  }

  // Only mark APPROVED when selection was under APPROVED filter and complete for provided metrics.
  // Persistence alone never establishes approval — selection already enforced approvalStatus.
  const approvedStatus: SnapshotStatus = selection.complete
    ? "APPROVED"
    : allowUnapproved
      ? "DRAFT"
      : "REVIEW_REQUIRED";

  return [
    {
      snapshotId: selection.snapshot.provenanceId,
      version: "1",
      companyId: selection.companyId,
      asOf: selection.asOf,
      reportingPeriod: selection.snapshot.reportingPeriod,
      status: approvedStatus,
      supersedesSnapshotId: null,
      provenance: {
        source: "financial-state-selection",
        sourceVersion: selection.snapshot.provenanceId,
      },
      review:
        approvedStatus === "APPROVED"
          ? {
              reviewedBy: "financial-state-selection",
              reviewedAt: `${selection.asOf}T00:00:00Z`,
              approvalRef: selection.snapshot.provenanceId,
            }
          : { reviewedBy: null, reviewedAt: null, approvalRef: null },
      inputs,
    },
  ];
}

function collectSharedRestrictions(
  state: CapacityState | null,
  capacityRuleId: string,
): BindingRestriction[] {
  if (!state) return [];
  const restrictions: BindingRestriction[] = [];
  for (const lim of state.limitations) {
    restrictions.push({
      code: lim.code,
      message: lim.message,
      failClosed: true,
    });
  }
  for (const sc of state.sharedConstraints) {
    const unquantified = sc.limitations.some((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED");
    const currencyMismatch = sc.limitations.some(
      (l) => l.code === "CURRENCY_MISMATCH_NO_CONVERSION_MODELED",
    );
    if (unquantified || currencyMismatch || sc.status !== "AVAILABLE") {
      restrictions.push({
        code: unquantified
          ? "SHARED_CAPACITY_NOT_QUANTIFIED"
          : currencyMismatch
            ? "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"
            : `SHARED_CAPACITY_${sc.status}`,
        message: `Shared capacity ${sc.sharedCapacityId} binds members [${sc.memberRuleIds.join(", ")}] with status ${sc.status}`,
        sharedCapacityId: sc.sharedCapacityId,
        failClosed: true,
      });
    }
    if (sc.memberRuleIds.includes(capacityRuleId)) {
      const rem = capacityAmountToNumber(sc.remaining);
      if (!rem.determined) {
        restrictions.push({
          code: "SHARED_CAPACITY_REMAINING_NOT_DETERMINED",
          message: `Shared pool ${sc.sharedCapacityId} remaining not determined — baskets cannot independently spend the same capacity`,
          sharedCapacityId: sc.sharedCapacityId,
          ruleId: capacityRuleId,
          failClosed: true,
        });
      }
    }
  }
  const entry = state.capacities.find((c) => c.ruleId === capacityRuleId);
  if (entry) {
    for (const lim of entry.limitations) {
      restrictions.push({
        code: lim.code,
        message: lim.message,
        ruleId: capacityRuleId,
        failClosed: lim.code === "SHARED_CAPACITY_NOT_QUANTIFIED" ||
          lim.code === "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" ||
          lim.code === "MISSING_FINANCIAL_INPUT",
      });
    }
  }
  return restrictions;
}

function classifyConfidence(args: {
  grossDetermined: boolean;
  financialComplete: boolean;
  completeness: UtilizationCompletenessAuthorityResult;
  remainingSupported: boolean;
  productionRemaining: boolean;
  refused: boolean;
}): CapacityConfidenceAuthority {
  if (args.refused) return "REFUSED";
  if (
    args.productionRemaining &&
    TRUSTED_ISSUER_ACTIVATION.status === "ACTIVE" &&
    TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "ACTIVE"
  ) {
    return "PRODUCTION_AUTHORITATIVE";
  }
  if (args.remainingSupported && args.completeness.status === "TRUSTED_AUTHORIZED_COMPLETENESS") {
    return "VERIFIED_REMAINING";
  }
  if (args.remainingSupported && args.completeness.status === "REVIEWED_COMPLETENESS") {
    return "REMAINING_REVIEWED_DEMO";
  }
  if (args.completeness.status === "SOME_UTILIZATION_RECORDS" ||
      args.completeness.status === "RECONCILED_UTILIZATION_HISTORY") {
    return "UTILIZATION_PARTIAL";
  }
  if (args.financialComplete && args.grossDetermined) return "FINANCIALLY_MODELED";
  if (args.grossDetermined) return "GROSS_CONTRACTUAL_ONLY";
  return "REFUSED";
}

/**
 * Evaluate verified remaining capacity from financial + utilization + executable rules.
 * Fail-closed on unquantified shared restrictions and missing completeness.
 */
export function evaluateVerifiedRemainingCapacity(
  args: EvaluateVerifiedRemainingCapacityArgs,
): VerifiedRemainingCapacityResult {
  const trace: CapacityCalculationTraceEntry[] = [];
  const blockers: string[] = [];
  const missingInputs: string[] = [];

  if (args.executableRules.companyId !== args.companyId) {
    blockers.push(
      `executable rule handoff companyId "${args.executableRules.companyId}" ≠ evaluation companyId "${args.companyId}"`,
    );
  }

  const metricKeys = args.requiredFinancialMetrics ?? args.financialQuery?.metricKeys ?? [];
  const financialSelection = selectFinancialState(args.financialCatalog, {
    companyId: args.companyId,
    asOf: args.asOf,
    currency: args.currency,
    metricKeys,
    reportingPeriod: args.financialQuery?.reportingPeriod ?? null,
    legalEntityKey: args.financialQuery?.legalEntityKey,
    metricDefinitionIncludes: args.financialQuery?.metricDefinitionIncludes,
    sourceDocumentId: args.financialQuery?.sourceDocumentId,
    allowedApprovalStatuses: args.financialQuery?.allowedApprovalStatuses,
    excludeSuperseded: args.financialQuery?.excludeSuperseded,
    trustedIssuerAuth: args.trustedIssuerAuth,
    allowSynthetic: args.allowSynthetic,
    allowCallerStipulated: args.allowSynthetic,
  });
  trace.push({
    stage: "FINANCIAL_SELECTION",
    detail: financialSelection.note,
  });
  blockers.push(...financialSelection.blockers);
  missingInputs.push(...financialSelection.missingInputs);

  // Utilization reconstruction
  let reconstruction: UtilizationReconstructionResult | null = null;
  let utilizationRecords: UtilizationEvidenceRecord[] = [
    ...(args.utilizationRecords ?? []),
  ];
  if (args.utilizationEvents && args.utilizationEvents.length > 0) {
    reconstruction = reconstructUtilizationEvidence({
      companyId: args.companyId,
      capacityRuleId: args.capacityRuleId,
      asOf: args.asOf,
      currency: args.currency,
      events: args.utilizationEvents,
      completenessCertificate: args.completenessCertificate,
      acknowledgeUnknownHistory: true,
    });
    utilizationRecords = [
      ...utilizationRecords,
      ...reconstruction.utilizationRecords,
    ];
    trace.push({
      stage: "UTILIZATION_RECONSTRUCTION",
      detail: reconstruction.note,
    });
    blockers.push(...reconstruction.blockers);
  } else {
    trace.push({
      stage: "UTILIZATION_RECONSTRUCTION",
      detail:
        utilizationRecords.length === 0
          ? "no utilization events or records supplied — empty ledger ≠ unused basket"
          : `using ${utilizationRecords.length} pre-built utilization records without event reconstruction`,
    });
  }

  const completeness = classifyUtilizationCompletenessAuthority({
    capacityRuleId: args.capacityRuleId,
    asOf: args.asOf,
    records: utilizationRecords,
    reconstruction,
    completenessCertificate: args.completenessCertificate,
    trustedIssuerAuth: args.trustedIssuerAuth,
    allowSyntheticRemaining: args.allowSynthetic,
  });
  trace.push({
    stage: "COMPLETENESS_AUTHORITY",
    detail: completeness.note,
  });
  blockers.push(...completeness.blockers);

  const utilizationResolution = resolveUtilization({
    capacityRuleId: args.capacityRuleId,
    asOf: args.asOf,
    currency: args.currency,
    records: utilizationRecords,
    completenessCertificate: args.completenessCertificate,
    trustedIssuerAuth: args.trustedIssuerAuth,
    allowSyntheticRemaining: args.allowSynthetic,
  });

  // Build ledger for Phase-4C (chronology + identity preserved)
  const ledgerFromEvents = args.utilizationEvents
    ? historicalEventsToLedgerUsage(args.utilizationEvents, {
        companyId: args.companyId,
        instrumentKey: args.instrumentKey,
        capacityRuleId: args.capacityRuleId,
      })
    : utilizationRecordsToLedgerUsage(utilizationRecords, {
        companyId: args.companyId,
        instrumentKey: args.instrumentKey,
        capacityRuleId: args.capacityRuleId,
      });
  const ledger: LedgerUsageRecord[] = [
    ...ledgerFromEvents,
    ...(args.additionalLedger ?? []),
  ];

  // Phase-4B snapshots
  const snapshots =
    args.financialSnapshots ??
    snapshotsFromSelection(
      financialSelection,
      args.instrumentKey,
      args.currency,
      args.allowSynthetic === true,
    );

  const rules = args.executableRules.rules;
  const definitions = args.executableRules.definitions ?? [];
  const sharedCapacities = args.executableRules.sharedCapacities ?? [];
  const targetRule = rules.find((r) => r.ruleId === args.capacityRuleId);

  let capacityState: CapacityState | null = null;
  let capacityEntry: CapacityStateEntry | null = null;
  let grossContractualAmount: number | null = null;
  let financiallyModeledAmount: number | null = null;
  let grossUnlimited = false;
  let gateSatisfied = true;
  let modeled = false;

  if (!targetRule) {
    blockers.push(`capacityRuleId "${args.capacityRuleId}" absent from executable-rule handoff`);
    missingInputs.push("executable rule for capacityRuleId");
    trace.push({
      stage: "REFUSAL",
      detail: "executable rule missing — compiler not invoked (Agent 1 contract)",
    });
  } else {
    const inputs = snapshotInputResolver({
      snapshots,
      definitions,
      rules,
      companyId: args.companyId,
      instrumentKey: args.instrumentKey,
    });
    const graph = buildCapacityGraph({
      companyId: args.companyId,
      instrumentKey: args.instrumentKey,
      rules,
      definitions,
      sharedCapacities,
    });
    capacityState = evaluateCapacityState({
      graph,
      rules,
      definitions,
      sharedCapacities,
      inputs,
      ledger,
      asOf: args.asOf,
    });
    capacityEntry = capacityState.capacities.find((c) => c.ruleId === args.capacityRuleId) ?? null;
    trace.push({
      stage: "CAPACITY_EVALUATION",
      detail: capacityEntry
        ? `rule ${args.capacityRuleId} status=${capacityEntry.status} stateHash=${capacityState.stateHash}`
        : `capacity state computed but rule ${args.capacityRuleId} not in capacities`,
    });

    if (capacityEntry) {
      // Prefer published gross; when legal state withholds it, read provisional
      // arithmetic so the contractual ceiling remains visible and distinct from remaining.
      const publishedGross = capacityAmountToNumber(capacityEntry.grossCapacity);
      const provisionalGross = capacityEntry.provisional
        ? capacityAmountToNumber(capacityEntry.provisional.grossCapacity)
        : null;
      const gross =
        publishedGross.determined || publishedGross.unlimited
          ? publishedGross
          : provisionalGross ?? publishedGross;

      grossUnlimited = gross.unlimited;
      gateSatisfied = !publishedGross.gateFailed && capacityEntry.status !== "NOT_SATISFIED";
      // Modeled for remaining purposes requires published (authoritative) gross, not only provisional.
      modeled =
        (publishedGross.determined || publishedGross.unlimited) &&
        capacityEntry.status !== "UNSUPPORTED" &&
        capacityEntry.status !== "ERROR" &&
        capacityEntry.status !== "AMBIGUOUS";

      if (gross.determined) {
        // Contractual ceiling from expression arithmetic (published or provisional).
        grossContractualAmount = gross.value;
        // Financially modeled amount only when published state is safe to rely on.
        financiallyModeledAmount = publishedGross.determined ? publishedGross.value : null;
      } else if (gross.unlimited) {
        grossContractualAmount = null;
        financiallyModeledAmount = null;
      } else {
        missingInputs.push(
          ...(capacityEntry.missingInputKeys.map((k) => `capacity input: ${k}`) ?? []),
        );
        if (gross.reason) missingInputs.push(gross.reason);
      }

      // When financial metrics were required but incomplete, do not pretend modeled amount exists.
      if (metricKeys.length > 0 && !financialSelection.complete) {
        financiallyModeledAmount = null;
        modeled = false;
        trace.push({
          stage: "FINANCIAL_SELECTION",
          detail: "required financial metrics incomplete — financially modeled amount withheld (not zero)",
        });
      }
    }
  }

  const bindingRestrictions = collectSharedRestrictions(capacityState, args.capacityRuleId);
  for (const sc of capacityState?.sharedConstraints ?? []) {
    trace.push({
      stage: "SHARED_CAPACITY",
      detail: `pool ${sc.sharedCapacityId} status=${sc.status} members=${sc.memberRuleIds.join(",")}`,
    });
  }
  // Fail closed: unquantified shared restrictions block remaining publication.
  const sharedFailClosed = bindingRestrictions.some(
    (r) =>
      r.failClosed &&
      (r.code === "SHARED_CAPACITY_NOT_QUANTIFIED" ||
        r.code === "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"),
  );
  if (sharedFailClosed) {
    blockers.push("shared capacity restriction unquantified or FX-incompatible — fail closed");
  }

  // Verified remaining — never invent when completeness missing
  let verifiedRemaining: VerifiedRemainingResult | null = null;
  let remainingAmount: number | null = null;
  let remainingSupported = false;

  if (modeled || grossUnlimited) {
    verifiedRemaining = computeVerifiedRemaining({
      gross: {
        amount: grossContractualAmount,
        unlimited: grossUnlimited,
        gateSatisfied: gateSatisfied && !sharedFailClosed,
        modeled: modeled || grossUnlimited,
        currency: args.currency,
        capacityRuleId: args.capacityRuleId,
      },
      utilization: utilizationResolution,
      allowSyntheticRemaining: args.allowSynthetic,
      crossDocumentConstraints: bindingRestrictions.map((r) => r.message),
      certificationStatus:
        args.executableRules.verificationComplete === true ? "CERTIFIED" : "NOT_CERTIFIED",
    });
    remainingSupported =
      verifiedRemaining.remainingStatus === "REMAINING_SUPPORTED" &&
      verifiedRemaining.supportedRemaining != null &&
      completeness.maySupportRemainingClaim &&
      !sharedFailClosed;
    remainingAmount = remainingSupported ? verifiedRemaining.supportedRemaining : null;
    if (!completeness.maySupportRemainingClaim) {
      remainingAmount = null;
      remainingSupported = false;
      trace.push({
        stage: "REMAINING_CLAIM",
        detail: `remaining withheld — completeness authority ${completeness.status}`,
      });
    } else if (remainingSupported) {
      trace.push({
        stage: "REMAINING_CLAIM",
        detail: `remaining ${remainingAmount} supported under ${completeness.status}`,
      });
    } else {
      trace.push({
        stage: "REMAINING_CLAIM",
        detail: verifiedRemaining.note,
      });
    }
    blockers.push(...verifiedRemaining.blockers);
  } else {
    trace.push({
      stage: "REMAINING_CLAIM",
      detail: "gross not modeled — remaining cannot be claimed",
    });
  }

  // Verified input handoff (Agent 3 / persistence consumers)
  let verifiedInputHandoff: VerifiedCapacityInputHandoff | null = null;
  if (financialSelection.snapshot) {
    verifiedInputHandoff = buildVerifiedCapacityInputHandoff({
      companyId: args.companyId,
      evaluationAsOf: args.asOf,
      financial: financialSelection.snapshot,
      requiredFinancialMetrics: metricKeys,
      utilization: {
        capacityRuleId: args.capacityRuleId,
        asOf: args.asOf,
        currency: args.currency,
        records: utilizationRecords,
        completenessCertificate: args.completenessCertificate,
      },
      trustedIssuerAuth: args.trustedIssuerAuth,
      allowSynthetic: args.allowSynthetic,
      allowCallerStipulated: args.allowSynthetic,
    });
  }

  const productionRemaining =
    remainingSupported &&
    completeness.productionAuthoritative &&
    verifiedRemaining?.utilization.productionAuthoritative === true &&
    TRUSTED_ISSUER_ACTIVATION.status === "ACTIVE" &&
    TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "ACTIVE";

  // Dual gates remain BLOCKED in this repository.
  const mayPublishProductionRemaining = false;

  const confidenceAuthority = classifyConfidence({
    grossDetermined: grossContractualAmount != null || grossUnlimited,
    financialComplete: financialSelection.complete || metricKeys.length === 0,
    completeness,
    remainingSupported,
    productionRemaining,
    refused: Boolean(targetRule) === false || (verifiedRemaining?.remainingStatus === "REFUSED"),
  });

  // Force REFUSED confidence when production would otherwise be claimed while gates blocked.
  const finalConfidence: CapacityConfidenceAuthority =
    confidenceAuthority === "PRODUCTION_AUTHORITATIVE"
      ? "VERIFIED_REMAINING"
      : confidenceAuthority;

  const inputHash = stableHash({
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    capacityRuleId: args.capacityRuleId,
    asOf: args.asOf,
    currency: args.currency,
    financial: financialSelection.provenance.selectedEvidenceIds,
    utilization: utilizationRecords.map((r) => r.usageId).sort(),
    completeness: args.completenessCertificate?.kind ?? null,
    rules: rules.map((r) => r.ruleId).sort(),
    shared: sharedCapacities.map((s) => s.sharedCapId).sort(),
  });

  const uniqueBlockers = [...new Set(blockers)];
  const note =
    remainingSupported && remainingAmount != null
      ? `Gross contractual ${grossContractualAmount} − historical utilization ${utilizationResolution.attributedAmount} = remaining ${remainingAmount} (${completeness.status}).`
      : `Gross contractual ${grossContractualAmount ?? (grossUnlimited ? "UNLIMITED" : "NOT_DETERMINED")}; remaining not published under completeness=${completeness.status}.`;

  return {
    contractVersion: VERIFIED_REMAINING_CAPACITY_CONTRACT_VERSION,
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    capacityRuleId: args.capacityRuleId,
    asOf: args.asOf.slice(0, 10),
    grossContractualAmount,
    grossUnlimited,
    financiallyModeledAmount,
    historicalUtilization: utilizationResolution.attributedAmount,
    remainingAmount,
    remainingSupported,
    bindingRestrictions,
    missingInputs: [...new Set(missingInputs)],
    confidenceAuthority: finalConfidence,
    completenessAuthority: completeness.status,
    calculationTrace: trace,
    provenance: {
      financial: financialSelection.provenance,
      utilizationEventIds: (args.utilizationEvents ?? []).map((e) => e.eventId),
      ledgerUsageIds: ledger.map((l) => l.usageId),
      capacityStateHash: capacityState?.stateHash ?? null,
      inputHash,
      executableRuleIds: rules.map((r) => r.ruleId),
      sharedCapacityIds: sharedCapacities.map((s) => s.sharedCapId),
    },
    artifacts: {
      financialSelection,
      utilizationReconstruction: reconstruction,
      utilizationResolution,
      completeness,
      capacityState,
      capacityEntry,
      sharedConstraints: capacityState?.sharedConstraints ?? [],
      verifiedRemaining,
      verifiedInputHandoff,
    },
    blockers: uniqueBlockers,
    note,
    mayPublishProductionRemaining,
  };
}
