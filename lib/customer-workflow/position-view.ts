/**
 * Position presentation assembler — consumes dashboard / readiness / facilities
 * outputs. Performs no capacity arithmetic and never invents AVAILABLE.
 *
 * PR #268 (authenticity + trusted-issuer) is OPEN / unmerged on main: legacy
 * remainingCapacity must be labeled NOT_PRODUCTION_AUTHORITATIVE /
 * MODELED / NOT VERIFIED, not AVAILABLE.
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
  /** Explicit: remaining on this surface is not production-authoritative. */
  remainingAuthoritative: false;
}

function facilityAmountMillions(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  return amount;
}

/**
 * Assemble Position from already-loaded canonical services.
 * `remainingAuthoritative` is always false on current main (PR #268 unmerged).
 */
export function buildPositionView(args: {
  companyId: string;
  dashboard: CompanyDashboard | null;
  readiness: CapacityReadiness;
  rulebook: RulebookReadiness;
  dashboardError?: string | null;
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
  // Last verified evidence: prefer NS-4 / legal-review signal; never invent "today".
  const lastVerifiedEvidenceDate =
    readiness.approvedNorthStarSnapshotCount > 0 || readiness.ns4ApprovedSnapshotCount > 0
      ? asOfDate
      : null;

  const sides: PositionSideClaim[] = (["secured", "unsecured"] as const).map((side) => {
    const sim = dashboard?.capacity[side];
    const remainingAmount = sim?.remainingCapacity;
    const packageAuth = sim?.packageAuthoritative;
    const remaining = presentCapacityClaim({
      claimKind: remainingAmount === undefined ? "UNAVAILABLE" : "REMAINING",
      amountMillions: remainingAmount ?? null,
      // Legacy dashboard remaining is never production-authoritative on main.
      remainingIsAuthoritative: false,
      publicationLabel: packageAuth?.label ?? readiness.capacityAuthority,
      unavailableReason:
        remainingAmount === undefined
          ? "Remaining capacity not determinable from the shared engine for this side."
          : null,
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
      "Position remaining figures from the legacy shared capacity engine are MODELED / NOT VERIFIED / NOT_PRODUCTION_AUTHORITATIVE. PR #268 authenticity + trusted-issuer gates are not merged on main. Gross contractual ceilings are never labeled AVAILABLE. Unknown utilization is never zero.",
    remainingAuthoritative: false,
  };
}
