/**
 * Persistent analytical knowledge library — drafting patterns for retrieval/interpretation.
 * Wraps KF seed patterns and accumulates source examples + failure associations per issuer scope.
 * Never copies one issuer's permissions into another issuer's rulebook.
 */

import { allPatterns, getPattern, SEED_PATTERNS } from "../../knowledge-factory/patterns/library";
import type { DraftingPattern, GapCategory } from "./types";

const CALCULATION_METHODS: Record<string, string> = {
  "greater-of-basket": "Capacity = max(fixed dollar amount, % of Consolidated EBITDA or Total Assets as defined).",
  "ratio-basket": "Permission if pro forma ratio ≤ / ≥ contractual threshold after giving effect to the transaction.",
  "builder-basket": "Available Amount = starter + builder components − prior usage (subject to shared caps and conditions).",
  "fixed-dollar-basket": "Capacity = contractual fixed dollar quantum minus attributed utilization.",
  "incremental-equivalent-debt": "Shares Incremental Facility / Incremental Equivalent Debt aggregate cap; may require leverage/lien tests.",
  "shared-capacity": "Usage under one basket reduces remaining shared aggregate capacity across linked baskets.",
  "restricted-payment-builder": "RP uses Available Amount / builder; often gated by no Default and ratio tests.",
  "pro-forma-compliance": "Recompute contractual ratios as if the transaction and related adjustments occurred.",
  "reclassification": "Historical basket usage may be redesignated among permitted categories when the agreement allows.",
};

const ASSOCIATED_EXERCISES: Record<string, string[]> = {
  "greater-of-basket": ["debt.fixed_vs_grower", "debt.unsecured.50", "debt.secured.100"],
  "ratio-basket": ["debt.ratio_basket", "debt.term.250", "ratio.total_leverage"],
  "builder-basket": ["rp.available_amount", "rp.builder", "rp.dividend.50"],
  "fixed-dollar-basket": ["debt.fixed_vs_grower", "lien.general_basket"],
  "incremental-equivalent-debt": ["debt.incremental_equivalent", "debt.term.250"],
  "shared-capacity": ["lien.shared_debt_lien", "multi.debt_and_distribute"],
  "restricted-payment-builder": ["rp.available_amount", "rp.builder", "rp.dividend.50"],
  "permitted-liens": ["lien.secure_new_debt", "lien.general_basket", "debt.secured.100"],
  "refinancing-debt": ["amd.refinance", "lien.refinance_secured", "multi.refinance_release"],
  "asset-sale-reinvestment": ["sale.reinvestment", "sale.proceeds"],
  "no-default-condition": ["rp.no_default", "rp.dividend.50"],
  "pro-forma-compliance": ["debt.ratio_basket", "ratio.covenant_cushion"],
  "reclassification": ["multi.reclass"],
  "acquisition-debt": ["inv.acquisition_debt", "multi.secured_acq"],
  "ratio-lien": ["lien.secure_new_debt", "debt.secured.100", "lien.shared_debt_lien"],
  "available-amount-definition": ["rp.available_amount", "rp.builder"],
  "subsidiary-designation": ["entity.designate_unrestricted", "inv.unrestricted_sub"],
  "financial-covenant-cure": ["fc.equity_cure", "ratio.covenant_cushion"],
  "liability-management": ["lme.debt_exchange", "amd.refinance", "multi.refinance_release"],
};

/** Seed the loop knowledge library from KF patterns (idempotent shape). */
export function seedDraftingPatterns(): DraftingPattern[] {
  return SEED_PATTERNS.map((p) => ({
    patternId: p.patternId,
    name: p.name,
    family: p.patternId.includes("lien")
      ? "LIENS"
      : p.patternId.includes("payment") || p.patternId.includes("builder")
        ? "RESTRICTED_PAYMENTS"
        : p.patternId.includes("sale")
          ? "ASSET_SALES"
          : p.patternId.includes("amendment")
            ? "AMENDMENTS"
            : "DEBT_INCURRENCE",
    structuralSummary: p.structuralCharacteristics.join("; "),
    calculationMethod: CALCULATION_METHODS[p.patternId],
    conditions: p.supportedSemanticHypotheses.slice(),
    variations: p.counterexamples.slice(),
    associatedExerciseIds: ASSOCIATED_EXERCISES[p.patternId] ?? [],
    sourceExamples: p.sourceExampleIds.slice(),
    priorFailurePatterns: p.knownFailureModes.map((m): GapCategory => {
      if (/shared/i.test(m)) return "SHARED_CAPACITY_NOT_MODELED";
      if (/definition|ratio/i.test(m)) return "DEFINITION_NOT_RESOLVED";
      if (/condition/i.test(m)) return "FORMULA_NOT_COMPILED";
      return "BASKET_NOT_EXTRACTED";
    }),
  }));
}

export function mergePatternObservation(params: {
  patterns: DraftingPattern[];
  patternId: string;
  sourceId: string;
  exerciseId?: string;
  failure?: GapCategory;
}): DraftingPattern[] {
  const base = params.patterns.length ? params.patterns : seedDraftingPatterns();
  const idx = base.findIndex((p) => p.patternId === params.patternId);
  if (idx < 0) {
    const kf = getPattern(params.patternId);
    if (!kf) return base;
    const created = seedDraftingPatterns().find((p) => p.patternId === params.patternId);
    if (!created) return base;
    if (!created.sourceExamples.includes(params.sourceId)) {
      created.sourceExamples.push(params.sourceId);
    }
    if (params.exerciseId && !created.associatedExerciseIds.includes(params.exerciseId)) {
      created.associatedExerciseIds.push(params.exerciseId);
    }
    if (params.failure && !created.priorFailurePatterns.includes(params.failure)) {
      created.priorFailurePatterns.push(params.failure);
    }
    return [...base, created];
  }
  const next = { ...base[idx]! };
  if (!next.sourceExamples.includes(params.sourceId)) {
    next.sourceExamples = [...next.sourceExamples, params.sourceId].slice(-40);
  }
  if (params.exerciseId && !next.associatedExerciseIds.includes(params.exerciseId)) {
    next.associatedExerciseIds = [...next.associatedExerciseIds, params.exerciseId];
  }
  if (params.failure && !next.priorFailurePatterns.includes(params.failure)) {
    next.priorFailurePatterns = [...next.priorFailurePatterns, params.failure];
  }
  const out = base.slice();
  out[idx] = next;
  return out;
}

export function listKnownPatternIds(): string[] {
  return allPatterns().map((p) => p.patternId);
}
