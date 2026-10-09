/**
 * First 1,000-case plan — combinatorial expansion across dimensions.
 *
 * These are ENGINEERING TARGETS for meaningful executions, not 1,000 file copies
 * of existing demos. Deduplication keys prevent artificial inflation.
 */

export interface DimensionAxis {
  id: string;
  values: string[];
  note: string;
}

export interface PlannedCaseFamily {
  familyId: string;
  axes: string[];
  estimatedExecutions: number;
  dedupeKey: string;
  requiresNewGt: boolean;
  lane: string;
}

/** Axes for progressive scale (1k → 5k → 25k → 100k+). */
export const MATRIX_AXES: DimensionAxis[] = [
  {
    id: "issuer_package",
    values: [
      "conmed-2025",
      "dsgr-2022-2025",
      "gibraltar-2026",
      "chwy-2026",
      "fwrg-2021",
      "lsb-2023-abl",
      "riot-2025-2026",
      "synthetic-pkg-b",
      "synthetic-pkg-i",
      "synthetic-pkg-f",
    ],
    note: "Unique financing packages — prefer structure diversity over repeats.",
  },
  {
    id: "txn_kind",
    values: [
      "SECURED_DEBT",
      "UNSECURED_DEBT",
      "RESTRICTED_PAYMENT",
      "INVESTMENT",
      "ACQUISITION",
      "REPAYMENT",
      "EQUITY_CONTRIBUTION",
    ],
    note: "Business transaction forms.",
  },
  {
    id: "threshold_position",
    values: ["below", "at", "above"],
    note: "Boundary values vs contractual thresholds.",
  },
  {
    id: "utilization",
    values: ["complete", "partial", "missing", "conflicting", "unknown_empty"],
    note: "Ledger completeness / honesty.",
  },
  {
    id: "operative_date",
    values: ["pre_amendment", "on_effective", "post_amendment"],
    note: "Amendment / restatement selection.",
  },
  {
    id: "entity_scope",
    values: ["borrower", "guarantor", "non_loan_party", "restricted_sub", "unrestricted"],
    note: "Guarantor and restricted-subsidiary scope.",
  },
  {
    id: "metamorphic",
    values: [
      "baseline",
      "remove_source",
      "remove_utilization",
      "add_restriction",
      "flip_operative_date",
      "replay",
    ],
    note: "Adversarial mutations — only where legal assumptions hold.",
  },
];

/**
 * Planned families totaling ~1,000 first-wave executions without cloning demos.
 * Counts are estimates for the expansion engine; GT must be authored per family.
 */
export const FIRST_1000_FAMILIES: PlannedCaseFamily[] = [
  {
    familyId: "xd-authentic-boundary",
    axes: ["issuer_package", "txn_kind", "threshold_position"],
    // 5 authentic × 4 debt/rp/invest kinds × 3 thresholds ≈ 60 (subset of axes)
    estimatedExecutions: 60,
    dedupeKey: "pkg|kind|threshold",
    requiresNewGt: true,
    lane: "CROSS_DOCUMENT",
  },
  {
    familyId: "xd-synthetic-regression",
    axes: ["issuer_package", "txn_kind"],
    estimatedExecutions: 40,
    dedupeKey: "synthetic-pkg|kind",
    requiresNewGt: false,
    lane: "CROSS_DOCUMENT",
  },
  {
    familyId: "capacity-a8-matrix",
    axes: ["threshold_position", "utilization"],
    estimatedExecutions: 50,
    dedupeKey: "gate|utilization|shared",
    requiresNewGt: false,
    lane: "CAPACITY_GATE_STATUS",
  },
  {
    familyId: "shared-capacity-reclass",
    axes: ["issuer_package", "txn_kind", "utilization"],
    estimatedExecutions: 80,
    dedupeKey: "pkg|shared-pool|reclass",
    requiresNewGt: true,
    lane: "SHARED_CAPACITY",
  },
  {
    familyId: "builder-ratio-debt",
    axes: ["issuer_package", "threshold_position", "operative_date"],
    estimatedExecutions: 90,
    dedupeKey: "pkg|builder|ratio|date",
    requiresNewGt: true,
    lane: "BUILDER_BASKET",
  },
  {
    familyId: "rp-investment-scope",
    axes: ["issuer_package", "entity_scope", "threshold_position"],
    estimatedExecutions: 100,
    dedupeKey: "pkg|rp-invest|entity|threshold",
    requiresNewGt: true,
    lane: "RESTRICTED_PAYMENT",
  },
  {
    familyId: "sequential-chains",
    axes: ["issuer_package", "txn_kind", "utilization"],
    // Multi-step: incur→rp→invest→repay variants
    estimatedExecutions: 120,
    dedupeKey: "pkg|sequence-shape|utilization",
    requiresNewGt: true,
    lane: "SEQUENTIAL_TRANSACTION",
  },
  {
    familyId: "metamorphic-invariants",
    axes: ["issuer_package", "metamorphic"],
    estimatedExecutions: 150,
    dedupeKey: "pkg|invariant|baseline-hash",
    requiresNewGt: false,
    lane: "ADVERSARIAL_METAMORPHIC",
  },
  {
    familyId: "amendment-operative-date",
    axes: ["issuer_package", "operative_date", "txn_kind"],
    estimatedExecutions: 90,
    dedupeKey: "pkg|asof|kind",
    requiresNewGt: true,
    lane: "OPERATIVE_AMENDMENT_SELECTION",
  },
  {
    familyId: "position-simulate-ask",
    axes: ["txn_kind", "threshold_position"],
    estimatedExecutions: 70,
    dedupeKey: "draft|surface|asof",
    requiresNewGt: false,
    lane: "POSITION_SIMULATE_ASK",
  },
  {
    familyId: "financial-calc-boundary",
    axes: ["issuer_package", "threshold_position"],
    estimatedExecutions: 80,
    dedupeKey: "pkg|metric|boundary",
    requiresNewGt: true,
    lane: "FINANCIAL_CALCULATION",
  },
  {
    familyId: "ledger-utilization-honesty",
    axes: ["utilization", "txn_kind"],
    estimatedExecutions: 70,
    dedupeKey: "utilization|kind|affirmed",
    requiresNewGt: false,
    lane: "LEDGER_UTILIZATION",
  },
];

export function summarizeFirst1000Plan(): {
  estimatedTotal: number;
  families: number;
  requiresNewGtFamilies: number;
  antiInflation: string[];
  note: string;
} {
  const estimatedTotal = FIRST_1000_FAMILIES.reduce((n, f) => n + f.estimatedExecutions, 0);
  return {
    estimatedTotal,
    families: FIRST_1000_FAMILIES.length,
    requiresNewGtFamilies: FIRST_1000_FAMILIES.filter((f) => f.requiresNewGt).length,
    antiInflation: [
      "Deduplicate by dedupeKey — do not count isomorphic clones.",
      "Track structureFamilies and unique packages, not raw file counts.",
      "New GT required before a family may score incorrectFavorable.",
      "Do not expand by copying Agent 5 demos 1000 times.",
      "Holdouts remain sealed; public expansion uses PUBLIC_DEVELOPMENT / FROZEN_REGRESSION only.",
    ],
    note: `First-wave plan ≈ ${estimatedTotal} executions across ${FIRST_1000_FAMILIES.length} families (engineering target, not claimed legal correctness).`,
  };
}
