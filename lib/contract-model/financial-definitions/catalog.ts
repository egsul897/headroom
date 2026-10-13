/**
 * Catalog of well-known contractual metric kinds and default dependency hints.
 * Hints are NOT issuer-specific formulas and NEVER authorize calculation by themselves.
 */

import type { ContractualMetricKind } from "./types";

export interface MetricKindCatalogEntry {
  kind: ContractualMetricKind;
  /** Common labels — matching is advisory only; instrument definition always controls. */
  commonLabels: string[];
  /**
   * Typical recursive dependencies observed across credit agreements / indentures.
   * Used only to seed missing-input reports when a definition is PARTIAL/UNSUPPORTED.
   */
  typicalDependencyKinds: ContractualMetricKind[];
  /** True when legacy covenant-engine has a flat proxy field (not a contractual definition). */
  legacyFlatProxy: string | null;
  notes: string;
}

export const CONTRACTUAL_METRIC_CATALOG: readonly MetricKindCatalogEntry[] = [
  {
    kind: "CONSOLIDATED_EBITDA",
    commonLabels: ["Consolidated EBITDA", "Consolidated Adjusted EBITDA", "EBITDA"],
    typicalDependencyKinds: ["CONSOLIDATED_NET_INCOME", "INTEREST_EXPENSE"],
    legacyFlatProxy: "FinancialSnapshotInput.ebitda",
    notes: "Never assume GAAP EBITDA equals contractual Consolidated EBITDA.",
  },
  {
    kind: "ADJUSTED_EBITDA",
    commonLabels: ["Adjusted EBITDA", "Consolidated Adjusted EBITDA"],
    typicalDependencyKinds: ["CONSOLIDATED_EBITDA", "CONSOLIDATED_NET_INCOME"],
    legacyFlatProxy: "FinancialSnapshotInput.ebitda",
    notes: "Addbacks/caps/lookbacks must be explicit; unsupported adjustments stay UNSUPPORTED.",
  },
  {
    kind: "CONSOLIDATED_NET_INCOME",
    commonLabels: ["Consolidated Net Income", "Net Income"],
    typicalDependencyKinds: [],
    legacyFlatProxy: "FinancialSnapshotInput.cumulativeNetIncome",
    notes: "Builder baskets often use cumulative CNI — distinct from a single-period CNI definition.",
  },
  {
    kind: "CONSOLIDATED_TOTAL_DEBT",
    commonLabels: ["Consolidated Total Debt", "Consolidated Funded Debt", "Total Debt"],
    typicalDependencyKinds: [],
    legacyFlatProxy: "FinancialSnapshotInput.totalDebt",
    notes: "Funded Indebtedness vs Total Debt are not assumed equivalent across instruments.",
  },
  {
    kind: "CONSOLIDATED_SECURED_DEBT",
    commonLabels: ["Consolidated Secured Debt", "Consolidated Senior Secured Debt", "Secured Debt"],
    typicalDependencyKinds: ["CONSOLIDATED_TOTAL_DEBT"],
    legacyFlatProxy: "FinancialSnapshotInput.securedDebt",
    notes: "Senior Secured vs Secured must follow the operative definition.",
  },
  {
    kind: "FIRST_LIEN_DEBT",
    commonLabels: ["First Lien Debt", "Consolidated First Lien Debt", "Funded First Lien Indebtedness"],
    typicalDependencyKinds: ["CONSOLIDATED_SECURED_DEBT"],
    legacyFlatProxy: null,
    notes: "No first-class field in lib/covenant-engine computeLeverageMetrics today.",
  },
  {
    kind: "CONSOLIDATED_NET_DEBT",
    commonLabels: ["Consolidated Net Debt", "Net Debt"],
    typicalDependencyKinds: ["CONSOLIDATED_TOTAL_DEBT", "CASH_AND_PERMITTED_CASH_NETTING"],
    legacyFlatProxy: "totalDebt - cash (derived)",
    notes: "Legacy subtracts all cash; capped/permitted netting is often UNSUPPORTED.",
  },
  {
    kind: "CASH_AND_PERMITTED_CASH_NETTING",
    commonLabels: ["Unrestricted Cash", "Cash and Cash Equivalents", "permitted cash netting"],
    typicalDependencyKinds: [],
    legacyFlatProxy: "FinancialSnapshotInput.cash",
    notes: "Permitted netting caps/exclusions require explicit representation.",
  },
  {
    kind: "FIXED_CHARGES",
    commonLabels: ["Fixed Charges", "Consolidated Fixed Charges"],
    typicalDependencyKinds: ["INTEREST_EXPENSE"],
    legacyFlatProxy: null,
    notes: "Legacy fixedChargeCoverage incorrectly uses interestExpense as denominator.",
  },
  {
    kind: "INTEREST_EXPENSE",
    commonLabels: ["Interest Expense", "Consolidated Interest Expense"],
    typicalDependencyKinds: [],
    legacyFlatProxy: "FinancialSnapshotInput.interestExpense",
    notes: "Cash vs accrued interest follows the contract — not assumed here.",
  },
  {
    kind: "TOTAL_ASSETS",
    commonLabels: ["Total Assets"],
    typicalDependencyKinds: [],
    legacyFlatProxy: "FinancialSnapshotInput.totalAssets",
    notes: "May differ from Consolidated Total Assets under the agreement.",
  },
  {
    kind: "CONSOLIDATED_TOTAL_ASSETS",
    commonLabels: ["Consolidated Total Assets"],
    typicalDependencyKinds: ["TOTAL_ASSETS"],
    legacyFlatProxy: "FinancialSnapshotInput.totalAssets",
    notes: "Grower baskets often reference this metric.",
  },
  {
    kind: "AVAILABLE_AMOUNT",
    commonLabels: ["Available Amount", "Available Amount Builder Basket"],
    typicalDependencyKinds: ["CONSOLIDATED_NET_INCOME", "CUMULATIVE_CREDIT"],
    legacyFlatProxy: "BUILDER_BASKET components",
    notes: "Full AA programs are instrument-specific; builder proxy is incomplete.",
  },
  {
    kind: "CUMULATIVE_CREDIT",
    commonLabels: ["Cumulative Credit", "Builder Basket Amount"],
    typicalDependencyKinds: ["CONSOLIDATED_NET_INCOME"],
    legacyFlatProxy: "BUILDER_BASKET",
    notes: "Distinct drafting from Available Amount in many packages.",
  },
  {
    kind: "OTHER_DEFINED_TERM",
    commonLabels: [],
    typicalDependencyKinds: [],
    legacyFlatProxy: null,
    notes: "Catch-all for issuer-specific defined terms — never force into a known kind.",
  },
] as const;

export function catalogEntry(kind: ContractualMetricKind): MetricKindCatalogEntry {
  const found = CONTRACTUAL_METRIC_CATALOG.find((e) => e.kind === kind);
  if (!found) throw new Error(`Unknown contractual metric kind: ${kind}`);
  return found;
}

/**
 * Advisory label → kind mapping. Returns OTHER_DEFINED_TERM when no confident match.
 * Never used as calculation authority.
 */
export function inferMetricKindFromTermName(termName: string): ContractualMetricKind {
  const n = termName.trim().toLowerCase();
  for (const entry of CONTRACTUAL_METRIC_CATALOG) {
    if (entry.kind === "OTHER_DEFINED_TERM") continue;
    for (const label of entry.commonLabels) {
      if (n === label.toLowerCase() || n.includes(label.toLowerCase())) return entry.kind;
    }
  }
  return "OTHER_DEFINED_TERM";
}
