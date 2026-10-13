/**
 * Position presentation assembler — consumes dashboard / readiness / facilities
 * outputs. Performs no capacity arithmetic and never invents AVAILABLE.
 *
 * Legacy remainingCapacity is NOT_PRODUCTION_AUTHORITATIVE / MODELED unless
 * `utilizationRemainingAuthority === "PRODUCTION_AUTHORITATIVE"` (#268).
 */

import type { CompanyDashboard } from "@/lib/dashboard-service";
import type { CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import type { RulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import {
  mapEngineLabelToCustomerStatus,
  presentCapacityClaim,
  presentCustomerStatus,
  type CapacityClaimView,
  type CustomerStatusCode,
} from "./status-contract";

export interface PositionInstrumentRow {
  id: string;
  name: string;
  facilityType: string;
  secured: boolean;
  amountMillions: number | null;
  governingDocumentId: string | null;
}

export interface PositionPermissionSummary {
  total: number;
  verified: number;
  unverified: number;
  executableReported: number;
}

export interface PositionSideClaim {
  side: "secured" | "unsecured";
  remaining: CapacityClaimView;
  bindingDocumentName: string | null;
  bindingProvisionCode: string | null;
  sourceCitations: string[];
  methodNotes: string[];
}

export interface PositionViewModel {
  companyId: string;
  asOfDate: string | null;
  lastVerifiedEvidenceDate: string | null;
  overallStatus: CustomerStatusCode;
  overallGuidance: string;
  instruments: PositionInstrumentRow[];
  permissions: PositionPermissionSummary;
  sides: PositionSideClaim[];
  missingInputs: string[];
  reviewBlockers: string[];
  authorityNote: string;
  /** True only when a side has #268 PRODUCTION_AUTHORITATIVE utilization remaining. */
  remainingAuthoritative: boolean;
  /**
   * Separated capacity claims for the CFO Position surface.
   * Populated when callers pass shared capacity state; never invents figures.
   */
  separatedClaims?: {
    secured: import("./capacity-state").SeparatedCapacityClaims;
    unsecured: import("./capacity-state").SeparatedCapacityClaims;
  };
}

function facilityAmountMillions(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  return amount;
}

/**
 * Assemble Position from already-loaded canonical services.
 * `remainingAuthoritative` follows per-side utilizationRemainingAuthority (#268).
 */
export function buildPositionView(args: {
  companyId: string;
  dashboard: CompanyDashboard | null;
  readiness: CapacityReadiness;
  rulebook: RulebookReadiness;
  dashboardError?: string | null;
  /** Optional issuer-neutral separated claims from shared ProductCapacityView. */
  separatedClaims?: PositionViewModel["separatedClaims"];
}): PositionViewModel {
  const { readiness, rulebook, dashboard } = args;
  const missingInputs = [...readiness.blockers];
  if (args.dashboardError) missingInputs.push(args.dashboardError);
  if (!readiness.hasFinancialSnapshot) {
    missingInputs.push("Authenticated / dated financial snapshot required for engine evaluation.");
  }
  if (readiness.ns4ApprovedSnapshotCount === 0 && readiness.approvedNorthStarSnapshotCount === 0) {
    missingInputs.push("No NS-4 APPROVED financial snapshot — North-Star remaining claims unavailable.");
  }
  if (readiness.contractLedgerActiveCount === 0) {
    missingInputs.push("No active attributed utilization ledger rows — utilization completeness unknown.");
  }

  const reviewBlockers = [...rulebook.blockers];
  if (readiness.unverifiedPermissionCount > 0) {
    reviewBlockers.push(
      `${readiness.unverifiedPermissionCount} promoted Permission row(s) remain UNVERIFIED.`,
    );
  }
  if (rulebook.stage !== "EXECUTABLE") {
    reviewBlockers.push(`Rulebook stage is ${rulebook.stage} — not a verified executable rulebook.`);
  }

  const instruments: PositionInstrumentRow[] = (dashboard?.financialPosition.capitalStructure.facilities ?? []).map(
    ({ facility, outstandingPrincipal }) => ({
      id: facility.id,
      name: facility.name,
      facilityType: facility.facilityType,
      secured: facility.secured,
      amountMillions: facilityAmountMillions(outstandingPrincipal),
      governingDocumentId: facility.governingDocumentId ?? null,
    }),
  );

  const asOfDate = dashboard?.asOfDate ? dashboard.asOfDate.toISOString().slice(0, 10) : null;
  // Do not copy legacy dashboard period-end asOf into "Last verified evidence date".
  // Certificate delivery / approval / completeness attestation are distinct temporal axes;
  // until those are loaded for the bound snapshot, leave UNKNOWN (null) — never invent today.
  const lastVerifiedEvidenceDate = null;

  const sides: PositionSideClaim[] = (["secured", "unsecured"] as const).map((side) => {
    const sim = dashboard?.capacity[side];
    const packageAuth = sim?.packageAuthoritative;
    // #328: dashboard utilizationRemainingAuthority / remainingCapacity alone must NEVER
    // publish AVAILABLE remaining. Authoritative remaining requires separatedClaims.
    // PAI-08 refinement (#333 / #330 absorb): legacy remainingCapacity is NOT source-backed
    // gross — never auto-relabel it GROSS_CONTRACTUAL. Publish GROSS only from
    // separatedClaims.grossContractual (ProductCapacityView.grossCapacity); otherwise UNAVAILABLE.
    const separated = args.separatedClaims?.[side];
    const productionAuthoritative = separated?.remainingAuthoritative === true;
    const sourceBackedGrossMm =
      separated?.grossContractual.claimKind === "GROSS_CONTRACTUAL" &&
      separated.grossContractual.amountMillions != null &&
      Number.isFinite(separated.grossContractual.amountMillions)
        ? separated.grossContractual.amountMillions
        : null;

    let claimKind: "REMAINING" | "GROSS_CONTRACTUAL" | "UNAVAILABLE";
    let amountMillions: number | null;
    let publicationLabel: string;
    let unavailableReason: string | null;
    if (productionAuthoritative) {
      claimKind = "REMAINING";
      amountMillions = separated!.verifiedRemaining.amountMillions ?? null;
      publicationLabel = "AVAILABLE";
      unavailableReason = null;
    } else if (sourceBackedGrossMm != null) {
      claimKind = "GROSS_CONTRACTUAL";
      amountMillions = sourceBackedGrossMm;
      publicationLabel = "GROSS_CONTRACTUAL";
      unavailableReason = null;
    } else {
      claimKind = "UNAVAILABLE";
      amountMillions = null;
      publicationLabel = "UNKNOWN";
      unavailableReason =
        "No source-backed gross contractual amount and no production-authoritative remaining for this side — legacy remainingCapacity is withheld (not published as GROSS).";
    }

    const remaining = presentCapacityClaim({
      claimKind,
      amountMillions,
      remainingIsAuthoritative: productionAuthoritative,
      publicationLabel,
      unavailableReason,
    });

    const citations: string[] = [];
    if (packageAuth?.bindingDocumentName && packageAuth.bindingProvisionCode) {
      citations.push(`${packageAuth.bindingDocumentName} · ${packageAuth.bindingProvisionCode}`);
    }
    for (const d of sim?.perDocument ?? []) {
      for (const c of d.bindingConstraint ?? []) {
        citations.push(`${d.documentName} · ${c.sectionRef}${c.permissionId ? ` (${c.permissionId})` : ""}`);
      }
    }

    const methodNotes = (sim?.perDocument ?? []).map(
      (d) => `${d.documentName}: ${d.method}${d.reason ? ` — ${d.reason}` : ""}`,
    );

    return {
      side,
      remaining,
      bindingDocumentName: packageAuth?.bindingDocumentName ?? sim?.binding?.documentName ?? null,
      bindingProvisionCode: packageAuth?.bindingProvisionCode ?? null,
      sourceCitations: citations,
      methodNotes,
    };
  });

  let overallStatus: CustomerStatusCode = "NOT_PRODUCTION_AUTHORITATIVE";
  if (!readiness.canEvaluateExecutableCapacity) {
    overallStatus = mapEngineLabelToCustomerStatus(readiness.status);
  } else if (reviewBlockers.length > 0) {
    overallStatus = "REVIEW_REQUIRED";
  } else if (missingInputs.some((m) => /utilization|NS-4|snapshot/i.test(m))) {
    overallStatus = "PARTIAL";
  }

  const overall = presentCustomerStatus(overallStatus);

  return {
    companyId: args.companyId,
    asOfDate,
    lastVerifiedEvidenceDate,
    overallStatus,
    overallGuidance: overall.customerGuidance,
    instruments,
    permissions: {
      total: readiness.permissionCount,
      verified: dashboard?.legalReview.permissionsVerified ?? 0,
      unverified: readiness.unverifiedPermissionCount,
      executableReported: rulebook.executablePermissions,
    },
    sides,
    missingInputs: [...new Set(missingInputs)],
    reviewBlockers: [...new Set(reviewBlockers)],
    authorityNote:
      "Position remaining figures from the legacy shared capacity engine are MODELED / NOT VERIFIED / NOT_PRODUCTION_AUTHORITATIVE unless utilizationRemainingAuthority is PRODUCTION_AUTHORITATIVE (#268 completeness + trusted issuer). Gross contractual ceilings are never labeled AVAILABLE. Unknown utilization is never zero.",
    remainingAuthoritative: sides.some((s) => s.remaining.status === "VERIFIED_EXECUTABLE"),
    separatedClaims: args.separatedClaims,
  };
}
