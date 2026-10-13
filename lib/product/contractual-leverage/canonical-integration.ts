/**
 * Canonical integration: APPROVED NS-4 facts → contractual EBITDA build-up →
 * leverage ratio, with Position/Simulate handoff sharing the same financial
 * identity. No parallel calculation engine.
 */

import type { FinancialSnapshot } from "@/lib/contract-model/contractual-metric-execution";
import { buildSimulateHandoffHref } from "@/lib/product/unified-position/simulate-handoff";
import { calculateContractualLeverage } from "./calculate";
import {
  compileCoherentEbitdaBuildup,
  compileMatthewsEbitdaBuildup,
} from "./ebitda-buildup";
import { bindApprovedMetrics, type Ns4BindIdentity } from "./ns4-bind";
import type {
  ContractualLeverageResult,
  EbitdaBuildupKind,
  LeverageCalculationRequest,
} from "./types";

export interface CanonicalFinancialPathResult {
  bindStatus: "BOUND" | "INCOMPLETE" | "REFUSED";
  leverage: ContractualLeverageResult;
  contributingSnapshotIds: string[];
  /** Same financial identity for Position capacity / Simulate deep-link. */
  financialIdentity: {
    companyId: string;
    instrumentKey: string;
    snapshotIds: string[];
    asOf: string | null;
    approvalRefs: string[];
  };
  simulateHref: string | null;
  /** Gross ratio math room — never verified remaining capacity. */
  grossVersusVerified: {
    debtHeadroomIsVerifiedCapacity: false;
    note: string;
  };
}

function buildupKeys(kind: EbitdaBuildupKind, companyId: string, instrumentKey: string): string[] {
  if (kind === "COHERENT_CAPPED_ADDBACK") {
    return compileCoherentEbitdaBuildup({
      companyId,
      instrumentKey,
      documentId: instrumentKey,
      sectionRef: "§1.01",
      excerpt: "Consolidated EBITDA",
    }).requiredMetricKeys;
  }
  return compileMatthewsEbitdaBuildup({
    companyId,
    instrumentKey,
    documentId: instrumentKey,
    sectionRef: "§1.01",
    excerpt: "Consolidated EBITDA",
  }).requiredMetricKeys;
}

/**
 * Bind APPROVED snapshot component metrics → build-up EBITDA → contractual leverage.
 * Caller supplies the leverage request shell (definitions, threshold, debt basis);
 * ebitdaComponents / financials.ebitda are filled from APPROVED facts only.
 */
export function runCanonicalContractualFinancialPath(args: {
  request: LeverageCalculationRequest;
  snapshots: readonly FinancialSnapshot[];
  identity: Ns4BindIdentity;
  amountUnit?: "USD" | "USD_MILLIONS";
  /** Debt / cash keys on the APPROVED snapshot (full dollars or millions per amountUnit). */
  debtCashKeys?: {
    totalDebt?: string;
    securedDebt?: string;
    cash?: string;
  };
  /** Optional Simulate handoff amount ($M) using the same as-of identity. */
  simulateDraft?: { action: "debt" | "rp"; amountMillions: number; secured?: boolean } | null;
}): CanonicalFinancialPathResult {
  const kind = args.request.ebitdaBuildup;
  if (!kind) {
    const empty = calculateContractualLeverage(args.request);
    return {
      bindStatus: "REFUSED",
      leverage: {
        ...empty,
        status: "UNSUPPORTED_DEFINITION_SHAPE",
        missingRequirements: ["ebitdaBuildup required for canonical NS-4 component path"],
        limitations: [
          ...empty.limitations,
          "Canonical path requires COHERENT_CAPPED_ADDBACK or MATTHEWS_UNCAPPED_SUM — not certificate EBITDA as derivation.",
        ],
      },
      contributingSnapshotIds: [],
      financialIdentity: {
        companyId: args.identity.companyId,
        instrumentKey: args.identity.instrumentKey,
        snapshotIds: [],
        asOf: args.identity.asOfIsoDate ?? null,
        approvalRefs: [],
      },
      simulateHref: null,
      grossVersusVerified: {
        debtHeadroomIsVerifiedCapacity: false,
        note: "Mathematical ratio room is never verified available debt capacity.",
      },
    };
  }

  const componentKeys = buildupKeys(kind, args.identity.companyId, args.identity.instrumentKey);
  const debtKeys = [
    args.debtCashKeys?.totalDebt,
    args.debtCashKeys?.securedDebt,
    args.debtCashKeys?.cash,
  ].filter((k): k is string => !!k);
  const allKeys = [...new Set([...componentKeys, ...debtKeys])];

  const bound = bindApprovedMetrics({
    keys: allKeys,
    snapshots: args.snapshots,
    identity: args.identity,
    amountUnit: args.amountUnit ?? "USD",
    leverageKeyMap: {
      totalDebt: args.debtCashKeys?.totalDebt,
      securedDebt: args.debtCashKeys?.securedDebt,
      cash: args.debtCashKeys?.cash,
    },
  });

  const components: Record<string, number | null | undefined> = {};
  for (const k of componentKeys) {
    components[k] = bound.components[k] ?? null;
  }

  const financials = {
    ebitda: null as number | null, // never use certificate EBITDA as build-up substitute
    totalDebt: bound.financials.totalDebt ?? args.request.financials.totalDebt,
    securedDebt: bound.financials.securedDebt ?? args.request.financials.securedDebt,
    cash: bound.financials.cash ?? args.request.financials.cash,
  };

  let leverage: ContractualLeverageResult;
  if (bound.missingKeys.some((k) => componentKeys.includes(k))) {
    leverage = {
      ...calculateContractualLeverage({
        ...args.request,
        financials,
        ebitdaBuildup: kind,
        ebitdaComponents: components,
      }),
      status: "MISSING_INPUTS",
      missingRequirements: bound.facts
        .filter((f) => componentKeys.includes(f.key) && f.fulfillmentState !== "APPROVED_VERIFIED")
        .map((f) => f.requestText ?? f.key),
      informationRequest: {
        executable: bound.informationRequest.executable,
        executionMode: bound.informationRequest.executionMode,
        blockingKeys: bound.informationRequest.blocking.map((b) => b.requestText ?? b.dependency.key),
        summary: bound.informationRequest.summary,
      },
    };
  } else {
    leverage = calculateContractualLeverage({
      ...args.request,
      financials,
      ebitdaBuildup: kind,
      ebitdaComponents: components,
    });
    leverage = {
      ...leverage,
      informationRequest: {
        executable: bound.informationRequest.executable,
        executionMode: bound.informationRequest.executionMode,
        blockingKeys: bound.informationRequest.blocking.map((b) => b.requestText ?? b.dependency.key),
        summary: bound.informationRequest.summary,
      },
    };
  }

  const approvalRefs = [
    ...new Set(bound.facts.map((f) => f.approvalRef).filter((x): x is string => !!x)),
  ];
  const asOf =
    args.identity.asOfIsoDate ??
    bound.facts.find((f) => f.asOf)?.asOf ??
    null;

  const simulateHref =
    args.simulateDraft && leverage.status === "COMPUTED"
      ? buildSimulateHandoffHref(args.identity.companyId, {
          action: args.simulateDraft.action,
          amountMillions: args.simulateDraft.amountMillions,
          secured: args.simulateDraft.secured,
          evaluationDate: asOf,
          source: "ask",
        })
      : null;

  return {
    bindStatus: bound.status,
    leverage,
    contributingSnapshotIds: bound.contributingSnapshotIds,
    financialIdentity: {
      companyId: args.identity.companyId,
      instrumentKey: args.identity.instrumentKey,
      snapshotIds: bound.contributingSnapshotIds,
      asOf,
      approvalRefs,
    },
    simulateHref,
    grossVersusVerified: {
      debtHeadroomIsVerifiedCapacity: false,
      note: "Mathematical ratio room is never verified available debt capacity.",
    },
  };
}

/**
 * Detect whether a newly approved snapshot invalidates prior contributing ids
 * (explicit supersession or replacement of the bound snapshotId).
 */
export function snapshotInvalidatesPriorResults(args: {
  priorContributingSnapshotIds: readonly string[];
  snapshots: readonly FinancialSnapshot[];
}): { invalidated: boolean; supersededIds: string[]; activeApprovedIds: string[] } {
  const byId = new Map(args.snapshots.map((s) => [s.snapshotId, s]));
  const supersededIds: string[] = [];
  for (const id of args.priorContributingSnapshotIds) {
    const snap = byId.get(id);
    if (!snap || snap.status === "SUPERSEDED") {
      supersededIds.push(id);
      continue;
    }
    const replacedBy = args.snapshots.find(
      (s) => s.status === "APPROVED" && s.supersedesSnapshotId === id,
    );
    if (replacedBy) supersededIds.push(id);
  }
  const activeApprovedIds = args.snapshots
    .filter((s) => s.status === "APPROVED")
    .map((s) => s.snapshotId);
  return {
    invalidated: supersededIds.length > 0,
    supersededIds,
    activeApprovedIds,
  };
}
