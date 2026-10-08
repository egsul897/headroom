/**
 * Structural retrieval — feature overlap against ResearchStructuralFeatures
 * and parsed filters/intents. Complements lexical scoring; no vectors.
 */

import type { ParsedResearchQuery, ResearchCorpusEntry, ResearchIntent } from "./types";

export interface StructuralScore {
  score: number;
  matched: string[];
}

function amountClose(a: number, b: number, tol = 0.01): boolean {
  if (a === 0 || b === 0) return a === b;
  return Math.abs(a - b) / Math.max(a, b) <= tol;
}

function intentBoost(entry: ResearchCorpusEntry, intent: ResearchIntent | null): { score: number; matched: string[] } {
  if (!intent || intent === "GENERIC_LEXICAL") return { score: 0, matched: [] };
  const f = entry.structuralFeatures;
  const matched: string[] = [];
  let score = 0;

  switch (intent) {
    case "GENERAL_DEBT_BASKET_AMOUNT":
      if (f.isGeneralDebtBasket) {
        score += 3;
        matched.push("intent:general_debt_basket");
      } else {
        // Amount-only overlap without a general-debt structural tag is a weak match.
        score -= 1.5;
        matched.push("intent:not_general_debt_basket");
      }
      if (entry.covenantFamily === "INDEBTEDNESS") {
        score += 1;
        matched.push("family:INDEBTEDNESS");
      }
      break;
    case "EBITDA_UNCAPPED_SYNERGY":
      if (f.hasSynergyAddback && f.synergyAddbackCapped === false) {
        score += 4;
        matched.push("intent:uncapped_synergy");
      } else if (f.hasSynergyAddback) {
        score += 1;
        matched.push("intent:synergy_present_but_capped_or_unknown");
      }
      break;
    case "RP_NO_DEFAULT":
      if (
        entry.covenantFamily === "RESTRICTED_PAYMENTS" &&
        f.conditionTypes.some((c) => c === "NO_DEFAULT")
      ) {
        score += 4;
        matched.push("intent:rp_no_default");
      }
      break;
    case "INVESTMENT_SHARED_JUNIOR_PREPAY":
      if (f.sharesWithJuniorDebtPrepay) {
        score += 4;
        matched.push("intent:shared_junior_prepay");
      }
      if (f.hasSharedCapacity && (entry.covenantFamily === "INVESTMENTS" || entry.tags.includes("available-amount"))) {
        score += 1.5;
        matched.push("shared_capacity_signal");
      }
      break;
    case "RATIO_INCREMENTAL_DEBT":
      if (f.hasRatioGate && f.hasUnlimitedCapacity && entry.covenantFamily === "INDEBTEDNESS") {
        score += 4;
        matched.push("intent:ratio_incremental");
      } else if (f.hasRatioGate && entry.covenantFamily === "INDEBTEDNESS") {
        score += 2;
        matched.push("intent:ratio_debt_partial");
      }
      break;
    case "AMENDMENT_REDUCES_RP":
      if (f.amendmentReducesRpCapacity) {
        score += 4;
        matched.push("intent:amendment_reduces_rp");
      }
      break;
    case "SPRINGING_LEVERAGE":
      if (f.hasSpringingTest) {
        score += 4;
        matched.push("intent:springing");
      }
      if (entry.covenantFamily === "SPRINGING_COVENANTS" || entry.covenantFamily === "FINANCIAL_COVENANTS") {
        score += 1;
        matched.push("family:financial_or_springing");
      }
      break;
    case "NON_GUARANTOR_SUBSIDIARY_DEBT":
      if (
        entry.covenantFamily === "INDEBTEDNESS" &&
        f.entityScopeTags.some((t) => /NON_GUARANTOR|NOT_A_LOAN_PARTY|NON_LOAN_PARTY/i.test(t))
      ) {
        score += 4;
        matched.push("intent:non_guarantor_debt");
      }
      break;
    case "UNUSUAL_RECLASSIFICATION":
      if (f.unusualReclassification) {
        score += 4;
        matched.push("intent:unusual_reclass");
      } else if (f.hasReclassification) {
        score += 1.5;
        matched.push("intent:reclass_present");
      }
      break;
    case "OVERLAPPING_BASKETS":
      if (f.hasOverlappingBaskets || (f.hasReclassification && f.hasSharedCapacity)) {
        score += 4;
        matched.push("intent:overlapping_baskets");
      } else if (f.hasReclassification) {
        score += 2;
        matched.push("intent:reclass_as_overlap_signal");
      }
      break;
  }

  return { score, matched };
}

export function scoreStructural(entry: ResearchCorpusEntry, query: ParsedResearchQuery): StructuralScore {
  const f = entry.structuralFeatures;
  const matched: string[] = [];
  let score = 0;

  const intent = query.intent ?? query.filters.intents?.[0] ?? null;
  const boost = intentBoost(entry, intent);
  score += boost.score;
  matched.push(...boost.matched);

  const wantAmount = query.filters.moneyAmountUsd;
  if (wantAmount != null) {
    if (f.moneyAmountsUsd.some((a) => amountClose(a, wantAmount))) {
      score += 2.5;
      matched.push(`amount:${wantAmount}`);
    }
  }

  for (const family of query.filters.covenantFamilies ?? []) {
    if (String(entry.covenantFamily).toUpperCase() === family.toUpperCase()) {
      score += 1.5;
      matched.push(`filter:family:${family}`);
    }
  }

  for (const cond of query.filters.conditionTypes ?? []) {
    if (f.conditionTypes.map((c) => c.toUpperCase()).includes(cond.toUpperCase())) {
      score += 1.5;
      matched.push(`filter:condition:${cond}`);
    }
  }

  return { score, matched };
}

export function passesHardFilters(entry: ResearchCorpusEntry, query: ParsedResearchQuery): boolean {
  const { filters } = query;

  if (filters.issuers && filters.issuers.length > 0) {
    const keys = filters.issuers.map((s) => s.toLowerCase());
    const hay = [
      entry.issuer.companyId,
      entry.issuer.name,
      entry.issuer.ticker ?? "",
      entry.issuer.cik ?? "",
    ].map((s) => s.toLowerCase());
    if (!keys.some((k) => hay.some((h) => h.includes(k)))) return false;
  }

  if (filters.agreementTypes && filters.agreementTypes.length > 0) {
    const want = filters.agreementTypes.map((s) => s.toUpperCase());
    if (!want.includes(String(entry.instrument.agreementType).toUpperCase())) return false;
  }

  if (filters.covenantFamilies && filters.covenantFamilies.length > 0) {
    // Soft: do not hard-fail; structural scoring handles family preference.
  }

  if (filters.operativeOnly) {
    if (entry.operativeVersion.status !== "CURRENT_OPERATIVE") return false;
  }

  if (filters.dateFrom || filters.dateTo) {
    const filed = entry.filing.filedOn;
    if (!filed) return false;
    if (filters.dateFrom && filed < filters.dateFrom) return false;
    if (filters.dateTo && filed > filters.dateTo) return false;
  }

  return true;
}
