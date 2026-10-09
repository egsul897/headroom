/** Shared structural-feature heuristics for discovery/compiled ingest. */

import type { ResearchStructuralFeatures } from "./types";

export function emptyFeatures(partial?: Partial<ResearchStructuralFeatures>): ResearchStructuralFeatures {
  return {
    moneyAmountsUsd: [],
    hasRatioGate: false,
    hasUnlimitedCapacity: false,
    conditionTypes: [],
    entityScopeTags: [],
    hasSharedCapacity: false,
    hasReclassification: false,
    hasSpringingTest: false,
    hasSynergyAddback: false,
    synergyAddbackCapped: null,
    sharesWithJuniorDebtPrepay: false,
    isGeneralDebtBasket: false,
    amendmentReducesRpCapacity: false,
    hasOverlappingBaskets: false,
    unusualReclassification: false,
    ...partial,
  };
}

export function featuresFromText(input: {
  families?: string[];
  description?: string;
  sourceCitation?: string;
}): ResearchStructuralFeatures {
  const text = `${input.description ?? ""} ${input.sourceCitation ?? ""}`.toLowerCase();
  const moneyAmountsUsd: number[] = [];
  for (const m of text.matchAll(/\$([0-9]{1,3}(?:,[0-9]{3})+)/g)) {
    moneyAmountsUsd.push(Number(m[1]!.replace(/,/g, "")));
  }
  const families = (input.families ?? []).map((f) => f.toUpperCase());
  return emptyFeatures({
    moneyAmountsUsd: [...new Set(moneyAmountsUsd)],
    hasRatioGate: /leverage ratio|coverage ratio|ratio (does )?not exceed|pro forma/.test(text),
    hasUnlimitedCapacity: /unlimited amount|\bunlimited\b/.test(text),
    conditionTypes: /no (event of )?default/.test(text) ? ["NO_DEFAULT"] : [],
    entityScopeTags: /not a loan party|non-guarantor/.test(text)
      ? ["NON_GUARANTOR_RS", "NOT_A_LOAN_PARTY"]
      : ["BORROWER"],
    hasSharedCapacity: /available amount|shared|in the aggregate with/.test(text),
    hasReclassification: /reclassif/.test(text),
    hasSpringingTest: /springing|availability block/.test(text),
    hasSynergyAddback: /synerg/.test(text),
    synergyAddbackCapped: /synerg/.test(text) ? (/shall not exceed|%\s*of/.test(text) ? true : null) : null,
    sharesWithJuniorDebtPrepay:
      /restricted debt payment|junior lien|subordinated/.test(text) && /investment|available amount/.test(text),
    isGeneralDebtBasket: families.includes("INDEBTEDNESS") && /other indebtedness|general/.test(text),
    hasOverlappingBaskets: /reclassif|overlapping|available amount/.test(text),
    unusualReclassification: /reclassif/.test(text) && /sole discretion|later divide/.test(text),
  });
}

export function mapSupersessionToOperative(status: unknown): import("./types").OperativeVersionStatus {
  const s = String(status ?? "").toUpperCase();
  if (!s || s === "NULL" || s === "UNDEFINED") return "UNKNOWN";
  if (s.includes("CURRENT") || s.includes("OPERATIVE") && !s.includes("UNRESOLVED")) return "CURRENT_OPERATIVE";
  if (s.includes("SUPERSEDE") || s.includes("KNOWN_SUPERSEDED")) return "SUPERSEDED";
  if (s.includes("UNRESOLVED") || s.includes("CONFLICT")) return "UNRESOLVED_OPERATIVE_STATE";
  if (s.includes("UNKNOWN")) return "UNKNOWN_EFFECTIVE_DATE";
  if (s.includes("MISSING") && s.includes("AMEND")) return "MISSING_AMENDMENT_AUTHORITY";
  return "UNKNOWN";
}
