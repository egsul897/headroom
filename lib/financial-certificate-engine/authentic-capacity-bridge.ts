/**
 * Bridge APPROVED FCE financial inputs → authentic covenant capacity (Agent 3).
 *
 * Coordinates with PR #230 authentic Neon execution:
 * - Uses approved contractual metrics as FinancialSnapshotInput
 * - Evaluates authentic CovenantProvision rows via evaluateProvision
 * - Reports gross capacity separately from remaining capacity
 * - Never claims remaining capacity without attributed historical utilization
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
import type { SharedFinancialCertificationView } from "./financial-view";
import { buildSharedFinancialViewFromVerified } from "./financial-view";

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

function attributedUtilizationFor(
  provision: CovenantProvisionInput,
  ledger: Array<{ basket: string; amount: number; direction: string }>,
): { attributed: boolean; note: string; usedMillions: number | null } {
  // Agent 3 finding: ledger rows are family-level, not provision-id attributed.
  // Without path-level attribution we refuse remaining-capacity claims.
  void provision;
  void ledger;
  return {
    attributed: false,
    note: "No attributed historical utilization bound to this provision id — remaining capacity not claimed (gross reported separately).",
    usedMillions: null,
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

  for (const p of provisions) {
    const evaluated = evaluateProvision(p, fin, metrics);
    const util = attributedUtilizationFor(p, covenantData.ledger);

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

    // Incorrect favorable outcome guard: never set remaining = gross when unattributed.
    let remaining: number | null = null;
    if (util.attributed && util.usedMillions != null && gross != null) {
      remaining = Math.max(0, gross - util.usedMillions);
      remainingClaimable += 1;
    } else if (!util.attributed && gross != null) {
      // Explicitly refuse — counting a silent remaining=gross would be incorrect-favorable.
      remaining = null;
    }

    // Tripwire: if any path equated remaining to gross without attribution, count defect.
    if (remaining !== null && !util.attributed && remaining === gross) {
      incorrectFavorableClaims += 1;
      remaining = null;
    }

    rows.push({
      provisionCode: p.code,
      sectionRef: p.sectionRef,
      basketName: p.basketName,
      formulaType: p.formulaType,
      evaluationStatus: evaluated.status,
      grossCapacityMillions: gross,
      unlimited,
      remainingCapacityMillions: remaining,
      utilizationAttributed: util.attributed,
      utilizationNote: util.note,
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
): AuthenticProvisionCapacityRow {
  const unlimited =
    evaluated.status === "modeled" &&
    evaluated.capacity !== undefined &&
    !Number.isFinite(evaluated.capacity);
  const gross =
    evaluated.status === "modeled" && evaluated.capacity !== undefined && Number.isFinite(evaluated.capacity)
      ? evaluated.capacity
      : null;
  let remaining: number | null = null;
  if (utilizationAttributed && usedMillions != null && gross != null) {
    remaining = Math.max(0, gross - usedMillions);
  }
  return {
    provisionCode: p.code,
    sectionRef: p.sectionRef,
    basketName: p.basketName,
    formulaType: p.formulaType,
    evaluationStatus: evaluated.status,
    grossCapacityMillions: gross,
    unlimited,
    remainingCapacityMillions: remaining,
    utilizationAttributed,
    utilizationNote: utilizationAttributed
      ? "Attributed utilization applied."
      : "No attributed historical utilization — remaining not claimed.",
    reason: evaluated.reason ?? null,
  };
}
