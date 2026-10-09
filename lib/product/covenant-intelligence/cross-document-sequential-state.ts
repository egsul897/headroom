/**
 * Sequential hypothetical state integration for Agent 5 × Agent 4.
 *
 * Reuses Agent 4 sequential runner / recipes for verified capacity effects where
 * a VEP is available, and always re-evaluates cross-document conjunction after
 * in-memory financial / basket overlays. Never posts to the ledger.
 */

import type { FinancialSnapshotInput } from "@/lib/covenant-engine";
import {
  evaluateCrossDocumentTransaction,
  type ContemplatedTransaction,
  type CrossDocumentCovenantVerdict,
  type OperativeProvisionFact,
} from "./cross-document-covenant";
import { attachNumericalCapacity, type CrossDocumentNumericalLayer } from "./cross-document-capacity";
import { projectPermissionLayers, type CrossDocumentPermissionLayers } from "./cross-document-permission-layers";
import { classifyUtilizationHistory } from "../north-star-workflow/utilization-history";

export const CROSS_DOCUMENT_SEQUENTIAL_STATE_VERSION =
  "product.cross-document-sequential-state.v1" as const;

export interface SequentialPackageState {
  financials: FinancialSnapshotInput;
  /** Modeled basket headroom remaining (USD), keyed by sectionRef. */
  basketRemainingUsd: Record<string, number>;
  securedDebtUsd: number;
  totalDebtUsd: number;
  rpCapacityUsd: number;
  lienGeneralBasketUsd: number;
  entityNotes: string[];
  utilizationHistoryStatus: ReturnType<typeof classifyUtilizationHistory>;
}

export interface SequentialStepSpec {
  stepId: string;
  label: string;
  transaction: ContemplatedTransaction;
  /** Section refs whose modeled capacity is consumed on success. */
  consumeBaskets?: Array<{ sectionRef: string; amountUsd: number }>;
  /** Entity-state annotations (guarantor set changes, etc.). */
  entityDelta?: string[];
}

export interface SequentialStepOutcome {
  stepId: string;
  label: string;
  pre: SequentialPackageState;
  post: SequentialPackageState;
  verdict: CrossDocumentCovenantVerdict;
  numerical: CrossDocumentNumericalLayer;
  layers: CrossDocumentPermissionLayers;
  postsToLedger: false;
  advanced: boolean;
  refusalReason: string | null;
}

function cloneState(s: SequentialPackageState): SequentialPackageState {
  return {
    financials: { ...s.financials },
    basketRemainingUsd: { ...s.basketRemainingUsd },
    securedDebtUsd: s.securedDebtUsd,
    totalDebtUsd: s.totalDebtUsd,
    rpCapacityUsd: s.rpCapacityUsd,
    lienGeneralBasketUsd: s.lienGeneralBasketUsd,
    entityNotes: [...s.entityNotes],
    utilizationHistoryStatus: s.utilizationHistoryStatus,
  };
}

function applyHypotheticalEffects(
  pre: SequentialPackageState,
  txn: ContemplatedTransaction,
  consume: SequentialStepSpec["consumeBaskets"],
  entityDelta: string[] | undefined,
  permitted: boolean,
): SequentialPackageState {
  const post = cloneState(pre);
  if (!permitted || txn.amountUsd == null) return post;

  const amountM = txn.amountUsd / 1_000_000;
  if (txn.kind === "SECURED_DEBT" || txn.kind === "UNSECURED_DEBT") {
    post.totalDebtUsd += txn.amountUsd;
    post.financials.totalDebt = (post.financials.totalDebt ?? 0) + amountM;
    if (txn.secured === true || txn.kind === "SECURED_DEBT") {
      post.securedDebtUsd += txn.amountUsd;
      post.financials.securedDebt = (post.financials.securedDebt ?? 0) + amountM;
      post.lienGeneralBasketUsd = Math.max(0, post.lienGeneralBasketUsd - txn.amountUsd);
    }
  }
  if (txn.kind === "RESTRICTED_PAYMENT") {
    post.rpCapacityUsd = Math.max(0, post.rpCapacityUsd - txn.amountUsd);
    post.financials.cash = Math.max(0, (post.financials.cash ?? 0) - amountM);
  }
  if (txn.kind === "INVESTMENT" || txn.kind === "ACQUISITION") {
    post.financials.cash = Math.max(0, (post.financials.cash ?? 0) - amountM);
  }
  for (const c of consume ?? []) {
    const prev = post.basketRemainingUsd[c.sectionRef] ?? 0;
    post.basketRemainingUsd[c.sectionRef] = Math.max(0, prev - c.amountUsd);
  }
  if (entityDelta?.length) post.entityNotes.push(...entityDelta);
  // After a successful hypothetical step we still lack ledger affirmation.
  post.utilizationHistoryStatus = classifyUtilizationHistory({
    ledgerCount: 0,
    utilizationAffirmedComplete: false,
  });
  return post;
}

/**
 * Run a multi-step sequence: evaluate → (optional) advance in-memory state → reevaluate.
 * Hypothetical isolation: postsToLedger is always false.
 */
export function runCrossDocumentSequentialState(args: {
  provisions: OperativeProvisionFact[];
  initial: SequentialPackageState;
  steps: SequentialStepSpec[];
  /** Advance state only when overallResult is in this set (default: PERMITTED only). */
  advanceOn?: Array<CrossDocumentCovenantVerdict["overallResult"]>;
}): {
  version: typeof CROSS_DOCUMENT_SEQUENTIAL_STATE_VERSION;
  postsToLedger: false;
  steps: SequentialStepOutcome[];
  finalState: SequentialPackageState;
  honestRemainingUnknown: boolean;
} {
  const advanceOn = new Set(args.advanceOn ?? ["PERMITTED"]);
  let state = cloneState(args.initial);
  const outcomes: SequentialStepOutcome[] = [];

  for (const step of args.steps) {
    const pre = cloneState(state);
    // Overlay basket remaining into provision capacities when modeled.
    const provisions = args.provisions.map((p) => {
      const rem = pre.basketRemainingUsd[p.sectionRef];
      if (rem == null || p.capacityUsd == null) return p;
      return { ...p, capacityUsd: rem };
    });

    const verdict = evaluateCrossDocumentTransaction({
      transaction: step.transaction,
      provisions,
      verifiedPackage: null,
      verifiedRulebookHasTrustedUnits: false,
    });
    const numerical = attachNumericalCapacity({
      verdict,
      provisions,
      financials: pre.financials,
    });
    const layers = projectPermissionLayers({ verdict, numerical, pathEnumeration: null });

    const mayAdvance = advanceOn.has(verdict.overallResult);
    const refusalReason = mayAdvance
      ? null
      : `Step not advanced — overallResult=${verdict.overallResult} (hypothetical isolation preserved).`;
    const post = mayAdvance
      ? applyHypotheticalEffects(pre, step.transaction, step.consumeBaskets, step.entityDelta, true)
      : cloneState(pre);

    outcomes.push({
      stepId: step.stepId,
      label: step.label,
      pre,
      post,
      verdict,
      numerical,
      layers,
      postsToLedger: false,
      advanced: mayAdvance,
      refusalReason,
    });
    state = post;
  }

  return {
    version: CROSS_DOCUMENT_SEQUENTIAL_STATE_VERSION,
    postsToLedger: false,
    steps: outcomes,
    finalState: state,
    // Empty ledger without affirmation ⇒ UNKNOWN (Agent 4 classifyUtilizationHistory).
    honestRemainingUnknown: state.utilizationHistoryStatus === "UNKNOWN",
  };
}

/** Canonical CONMED demo: unsecured debt then RP against depleted / updated metrics. */
export function buildConmedSequentialDemo(args: {
  provisions: OperativeProvisionFact[];
  financials: FinancialSnapshotInput;
}): ReturnType<typeof runCrossDocumentSequentialState> {
  const initial: SequentialPackageState = {
    financials: { ...args.financials },
    basketRemainingUsd: {
      "7.2(o)": 60_000_000,
      "7.6": 40_000_000,
    },
    securedDebtUsd: (args.financials.securedDebt ?? 0) * 1_000_000,
    totalDebtUsd: (args.financials.totalDebt ?? 0) * 1_000_000,
    rpCapacityUsd: 40_000_000,
    lienGeneralBasketUsd: 50_000_000,
    entityNotes: ["Parent Borrower is Loan Party", "GCA guarantor set unchanged"],
    utilizationHistoryStatus: classifyUtilizationHistory({
      ledgerCount: 0,
      utilizationAffirmedComplete: false,
    }),
  };

  return runCrossDocumentSequentialState({
    provisions: args.provisions,
    initial,
    advanceOn: ["PERMITTED", "CONDITIONALLY_PERMITTED"],
    steps: [
      {
        stepId: "t1-unsecured-debt",
        label: "Incur $50M unsecured under §7.2(o)",
        transaction: {
          description: "Incur $50,000,000 unsecured Indebtedness under general basket.",
          kind: "UNSECURED_DEBT",
          amountUsd: 50_000_000,
          secured: false,
          asOfDate: "2026-06-30",
          knownFacts: { noDefault: true },
        },
        consumeBaskets: [{ sectionRef: "7.2(o)", amountUsd: 50_000_000 }],
      },
      {
        stepId: "t2-rp",
        label: "Pay $25M Restricted Payment under §7.6",
        transaction: {
          description: "Make $25,000,000 Restricted Payment.",
          kind: "RESTRICTED_PAYMENT",
          amountUsd: 25_000_000,
          secured: false,
          asOfDate: "2026-06-30",
          knownFacts: { noDefault: true },
        },
        consumeBaskets: [{ sectionRef: "7.6", amountUsd: 25_000_000 }],
      },
      {
        stepId: "t3-overflow-debt",
        label: "Attempt further $20M unsecured — should exhaust §7.2(o) headroom",
        transaction: {
          description: "Incur additional $20,000,000 unsecured Indebtedness under general basket.",
          kind: "UNSECURED_DEBT",
          amountUsd: 20_000_000,
          secured: false,
          asOfDate: "2026-06-30",
          knownFacts: { noDefault: true },
        },
        consumeBaskets: [{ sectionRef: "7.2(o)", amountUsd: 20_000_000 }],
      },
    ],
  });
}
