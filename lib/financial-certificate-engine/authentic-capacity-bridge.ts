/**
 * Bridge APPROVED FCE financial inputs → authentic covenant capacity (Agent 3).
 *
 * Coordinates with PR #230 authentic Neon execution and #237 utilization authority:
 * - Uses approved contractual metrics as FinancialSnapshotInput
 * - Evaluates authentic CovenantProvision rows via evaluateProvision
 * - Reports gross capacity separately from remaining capacity
 * - Remaining only via `publishRemainingCapacity` → #237 `computeVerifiedRemaining`
 */

import {
  computeLeverageMetrics,
  evaluateProvision,
  loadCompanyCovenantData,
  type CovenantProvisionInput,
  type EvaluatedProvision,
  type FinancialSnapshotInput,
} from "@/lib/covenant-engine";
import { prisma } from "@/lib/prisma";
import {
  loadVerifiedFinancialCapacityInput,
  type VerifiedFinancialCapacityInput,
} from "./approval-bridge";
import { classifyApprovedSnapshotAuthority } from "./authority";
import type { SharedFinancialCertificationView } from "./financial-view";
import { buildSharedFinancialViewFromVerified } from "./financial-view";
import { publishRemainingCapacity } from "./utilization-honesty";

export type AuthenticCapacityBlockReason =
  | "NO_APPROVED_SNAPSHOT"
  | "NOT_AUTHORITATIVE"
  | "MISSING_CAPACITY_INPUTS"
  | "NO_PROVISIONS";

export interface AuthenticProvisionCapacityRow {
  provisionCode: string;
  sectionRef: string;
  basketName: string;
  formulaType: string;
  evaluationStatus: EvaluatedProvision["status"];
  /** Gross capacity from the contractual formula + approved financials ($M). */
  grossCapacityMillions: number | null;
  unlimited: boolean;
  /**
   * Remaining capacity after attributed utilization.
   * Always null unless utilizationAttributed is true — never equated to gross.
   */
  remainingCapacityMillions: number | null;
  utilizationAttributed: boolean;
  utilizationNote: string;
  reason: string | null;
}

export interface AuthenticCapacityWithApprovedFinancials {
  companyId: string;
  financial: VerifiedFinancialCapacityInput;
  view: SharedFinancialCertificationView;
  rows: AuthenticProvisionCapacityRow[];
  summary: {
    provisionsEvaluated: number;
    grossExecutable: number;
    remainingClaimable: number;
    blockedMissingInputs: number;
    reviewRequired: number;
    incorrectFavorableClaims: number;
  };
}

export type AuthenticCapacityBridgeResult =
  | { status: "OK"; result: AuthenticCapacityWithApprovedFinancials }
  | {
      status: "BLOCKED";
      reason: AuthenticCapacityBlockReason;
      missingInputs: string[];
      view?: SharedFinancialCertificationView;
    };

function remainingForProvision(args: {
  provision: CovenantProvisionInput;
  asOf: string;
  gross: number | null;
  unlimited: boolean;
  ledger: Array<{ basket: string; amount: number; direction: string }>;
}): {
  remaining: number | null;
  attributed: boolean;
  note: string;
  supportsRemainingClaim: boolean;
} {
  // Agent 3 / #234: family-level ledger rows are not provision-attributed.
  // Approved financials alone never establish remaining.
  const unattributedLegacyBasketPresent = args.ledger.length > 0;
  const pub = publishRemainingCapacity({
    capacityRuleId: args.provision.code,
    asOf: args.asOf,
    grossCapacityMillions: args.gross,
    unlimited: args.unlimited,
    records: [],
    completenessCertificate: null,
    unattributedLegacyBasketPresent,
  });
  return {
    remaining: pub.remainingCapacityMillions,
    attributed: false,
    note: pub.reason,
    supportsRemainingClaim: pub.supportsRemainingClaim,
  };
}

/**
 * Evaluate authentic company provisions using an APPROVED FCE capacity snapshot.
 * Gross ≠ remaining unless utilization is attributed.
 */
export async function evaluateAuthenticCapacityWithApprovedFinancials(
  companyId: string,
  opts?: { snapshotId?: string; evaluationDate?: string },
): Promise<AuthenticCapacityBridgeResult> {
  const loaded = await loadVerifiedFinancialCapacityInput(companyId, opts);
  if (loaded.status === "NO_APPROVED_SNAPSHOT") {
    return {
      status: "BLOCKED",
      reason: "NO_APPROVED_SNAPSHOT",
      missingInputs: loaded.missingInputs,
    };
  }
  if (loaded.status === "NOT_AUTHORITATIVE") {
    return {
      status: "BLOCKED",
      reason: "NOT_AUTHORITATIVE",
      missingInputs: loaded.missingInputs,
    };
  }

  const financial = loaded.input;
  const view = buildSharedFinancialViewFromVerified(financial);
  // Test-attributed APPROVED must never be misread as real reviewer approval.
  const approvalAuthority = classifyApprovedSnapshotAuthority({
    reviewedBy: financial.reviewedBy,
    approvalRef: financial.approvalRef,
    productionContext: false,
    trustedProductionApprovalChannel: false,
  });

  if (!financial.capacitySnapshot) {
    return {
      status: "BLOCKED",
      reason: "MISSING_CAPACITY_INPUTS",
      missingInputs: financial.missingInputs,
      view,
    };
  }

  const asOf = financial.asOfDate
    ? new Date(`${financial.asOfDate}T12:00:00.000Z`)
    : new Date();
  const covenantData = await loadCompanyCovenantData(prisma, companyId, asOf);
  const provisions = covenantData.provisions;
  if (provisions.length === 0) {
    return {
      status: "BLOCKED",
      reason: "NO_PROVISIONS",
      missingInputs: ["authentic_covenant_provisions"],
      view,
    };
  }

  // Override leaf financials with APPROVED FCE contractual inputs — not stale legacy zeros.
  const fin: FinancialSnapshotInput = { ...financial.capacitySnapshot };
  const metrics = computeLeverageMetrics(fin);

  const rows: AuthenticProvisionCapacityRow[] = [];
  let grossExecutable = 0;
  let remainingClaimable = 0;
  let blockedMissingInputs = 0;
  let reviewRequired = 0;
  let incorrectFavorableClaims = 0;

  const asOfIso = financial.asOfDate ?? asOf.toISOString().slice(0, 10);

  for (const p of provisions) {
    const evaluated = evaluateProvision(p, fin, metrics);

    let gross: number | null = null;
    let unlimited = false;
    if (evaluated.status === "modeled" && evaluated.capacity !== undefined) {
      if (!Number.isFinite(evaluated.capacity)) {
        unlimited = true;
        gross = null;
      } else {
        gross = evaluated.capacity;
      }
      grossExecutable += 1;
    } else if (evaluated.status === "review_required") {
      reviewRequired += 1;
      blockedMissingInputs += 1;
    }

    const util = remainingForProvision({
      provision: p,
      asOf: asOfIso,
      gross,
      unlimited,
      ledger: covenantData.ledger,
    });
    if (util.supportsRemainingClaim) remainingClaimable += 1;
    // Incorrect-favorable: remaining equals gross with no attribution/completeness.
    if (
      util.remaining !== null &&
      !util.supportsRemainingClaim &&
      gross != null &&
      util.remaining === gross
    ) {
      incorrectFavorableClaims += 1;
    }

    rows.push({
      provisionCode: p.code,
      sectionRef: p.sectionRef,
      basketName: p.basketName,
      formulaType: p.formulaType,
      evaluationStatus: evaluated.status,
      grossCapacityMillions: gross,
      unlimited,
      remainingCapacityMillions: util.remaining,
      utilizationAttributed: util.attributed,
      utilizationNote: `${util.note} [${approvalAuthority.kind}: ${approvalAuthority.disclosure}]`,
      reason: evaluated.reason ?? null,
    });
  }

  return {
    status: "OK",
    result: {
      companyId,
      financial,
      view,
      rows,
      summary: {
        provisionsEvaluated: rows.length,
        grossExecutable,
        remainingClaimable,
        blockedMissingInputs,
        reviewRequired,
        incorrectFavorableClaims,
      },
    },
  };
}

/** Pure helper for tests: map one evaluated provision + utilization into a row. */
export function toAuthenticCapacityRow(
  p: CovenantProvisionInput,
  evaluated: EvaluatedProvision,
  utilizationAttributed: boolean,
  usedMillions: number | null,
  opts?: {
    asOf?: string;
    completenessCertificate?: import("./utilization-honesty").UtilizationCompletenessCertificate | null;
  },
): AuthenticProvisionCapacityRow {
  const unlimited =
    evaluated.status === "modeled" &&
    evaluated.capacity !== undefined &&
    !Number.isFinite(evaluated.capacity);
  const gross =
    evaluated.status === "modeled" && evaluated.capacity !== undefined && Number.isFinite(evaluated.capacity)
      ? evaluated.capacity
      : null;
  const asOf = opts?.asOf ?? "2026-06-30";
  const records =
    utilizationAttributed && usedMillions != null
      ? [
          {
            usageId: `u-${p.code}`,
            capacityRuleId: p.code,
            amountMillions: usedMillions,
            effectiveAsOf: asOf,
            status: "ACTIVE" as const,
          },
        ]
      : [];
  const pub = publishRemainingCapacity({
    capacityRuleId: p.code,
    asOf,
    grossCapacityMillions: gross,
    unlimited,
    records,
    completenessCertificate: opts?.completenessCertificate ?? null,
  });
  return {
    provisionCode: p.code,
    sectionRef: p.sectionRef,
    basketName: p.basketName,
    formulaType: p.formulaType,
    evaluationStatus: evaluated.status,
    grossCapacityMillions: gross,
    unlimited,
    remainingCapacityMillions: pub.remainingCapacityMillions,
    utilizationAttributed: pub.supportsRemainingClaim,
    utilizationNote: pub.reason,
    reason: evaluated.reason ?? null,
  };
}
