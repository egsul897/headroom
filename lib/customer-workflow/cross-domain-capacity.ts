/**
 * Cross-domain capacity selection for Position / Simulate.
 *
 * Maps contemplated transaction kinds onto covenant families and selects
 * SOURCE_BACKED_COMPILED_GROSS via provision-identity-aware selection.
 * Never first-match across families; never publishes verified remaining.
 */

import type { CovenantFamilyId } from "@/lib/product/real-dashboard-vertical-slice/provision-legal-context";
import type { VerifiedExecutableCompileBridgeResult } from "@/lib/product/real-dashboard-vertical-slice/verified-executable-compile-core";
import {
  grossCandidatesFromVerifiedExecutableCompile,
  selectSourceBackedGrossMm,
  type SourceBackedGrossSelection,
  type SourceBackedGrossSelectionScope,
} from "./select-source-backed-gross";

/** Product transaction domains exercised on Position → Simulate. */
export type CrossDomainTransactionKind =
  | "SECURED_DEBT"
  | "UNSECURED_DEBT"
  | "LIEN"
  | "INVESTMENT"
  | "RESTRICTED_PAYMENT"
  | "ASSET_SALE";

/** Primary covenant family that must resolve for the domain's GROSS claim. */
export const CROSS_DOMAIN_PRIMARY_FAMILY: Record<CrossDomainTransactionKind, CovenantFamilyId> = {
  SECURED_DEBT: "INDEBTEDNESS",
  UNSECURED_DEBT: "INDEBTEDNESS",
  LIEN: "LIENS",
  INVESTMENT: "INVESTMENTS",
  RESTRICTED_PAYMENT: "RESTRICTED_PAYMENTS",
  ASSET_SALE: "ASSET_SALES",
};

/**
 * Additional families that must be consulted for the domain (fail-closed when
 * any required family is AMBIGUOUS; missing optional families stay NONE).
 */
export const CROSS_DOMAIN_RELATED_FAMILIES: Record<
  CrossDomainTransactionKind,
  readonly CovenantFamilyId[]
> = {
  SECURED_DEBT: ["INDEBTEDNESS", "LIENS"],
  UNSECURED_DEBT: ["INDEBTEDNESS"],
  LIEN: ["LIENS"],
  INVESTMENT: ["INVESTMENTS"],
  RESTRICTED_PAYMENT: ["RESTRICTED_PAYMENTS"],
  ASSET_SALE: ["ASSET_SALES"],
};

export type CrossDomainGrossSelection = {
  transactionKind: CrossDomainTransactionKind;
  primaryFamily: CovenantFamilyId;
  primary: SourceBackedGrossSelection;
  /** Per-family selections for related domains (lien alongside secured debt, etc.). */
  byFamily: Partial<Record<CovenantFamilyId, SourceBackedGrossSelection>>;
  /**
   * Amount eligible to present as SOURCE_BACKED_COMPILED_GROSS for the primary
   * family only. Null when NONE or AMBIGUOUS. Never verified remaining.
   */
  primaryGrossMm: number | null;
  overallStatus: "RESOLVED" | "AMBIGUOUS" | "NONE";
  reasons: string[];
};

/**
 * Select cross-domain GROSS for a contemplated transaction against a VE compile.
 * Production remaining stays refused — this returns contractual GROSS only.
 */
export function selectCrossDomainSourceBackedGross(args: {
  compile: VerifiedExecutableCompileBridgeResult | null | undefined;
  transactionKind: CrossDomainTransactionKind;
  instrumentKey?: string | null;
  governingDocumentId?: string | null;
  entityScope?: SourceBackedGrossSelectionScope["entityScope"];
}): CrossDomainGrossSelection {
  const candidates = grossCandidatesFromVerifiedExecutableCompile(args.compile);
  const instrumentKey =
    args.instrumentKey?.trim() || args.compile?.instrumentKey || "";
  const primaryFamily = CROSS_DOMAIN_PRIMARY_FAMILY[args.transactionKind];
  const related = CROSS_DOMAIN_RELATED_FAMILIES[args.transactionKind];
  const byFamily: Partial<Record<CovenantFamilyId, SourceBackedGrossSelection>> = {};
  const reasons: string[] = [];

  for (const family of related) {
    const selection = selectSourceBackedGrossMm(candidates, {
      instrumentKey,
      covenantFamily: family,
      governingDocumentId: args.governingDocumentId ?? null,
      entityScope: args.entityScope ?? null,
      requireOperativeSourceOnGoverning: true,
    });
    byFamily[family] = selection;
    if (selection.status !== "RESOLVED" && selection.reason) {
      reasons.push(`${family}: ${selection.reason}`);
    }
  }

  const primary = byFamily[primaryFamily] ?? {
    status: "NONE" as const,
    amountMillions: null,
    selected: null,
    eligible: [],
    reason: `Primary family ${primaryFamily} not evaluated.`,
  };

  let overallStatus: CrossDomainGrossSelection["overallStatus"] = primary.status;
  // Secured debt: lien AMBIGUOUS must not silently proceed as debt-only GROSS.
  if (args.transactionKind === "SECURED_DEBT") {
    const lien = byFamily.LIENS;
    if (lien?.status === "AMBIGUOUS") {
      overallStatus = "AMBIGUOUS";
      reasons.push("SECURED_DEBT refuses while LIENS GROSS is AMBIGUOUS.");
    }
  }

  return {
    transactionKind: args.transactionKind,
    primaryFamily,
    primary,
    byFamily,
    primaryGrossMm:
      overallStatus === "RESOLVED" && primary.status === "RESOLVED"
        ? primary.amountMillions
        : null,
    overallStatus:
      overallStatus === "RESOLVED" && primary.status === "RESOLVED"
        ? "RESOLVED"
        : overallStatus === "AMBIGUOUS" || primary.status === "AMBIGUOUS"
          ? "AMBIGUOUS"
          : "NONE",
    reasons,
  };
}
