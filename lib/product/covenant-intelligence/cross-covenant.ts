/**
 * Workstream 3 — Cross-covenant coordinated analysis.
 *
 * A transaction must satisfy every independently applicable restriction.
 * This module identifies the restriction set across covenant families and
 * flags shared capacity / anti-stacking / reclassification interactions.
 * It does not invent permissions or compute remaining capacity.
 */

import type { CovenantSummaryItem } from "./summarize";
import type { ContractualProvisionRepresentation } from "./contractual-representation";
import { representProvision } from "./contractual-representation";

export const CROSS_COVENANT_VERSION = "product.cross-covenant.v1";

export type CrossCovenantFamily =
  | "DEBT_INCURRENCE"
  | "LIENS"
  | "RESTRICTED_PAYMENTS"
  | "INVESTMENTS"
  | "ACQUISITIONS"
  | "ASSET_SALES"
  | "GUARANTEES"
  | "SUBSIDIARY_RESTRICTIONS"
  | "REFINANCING"
  | "RATIO_PERMISSIONS"
  | "FIXED_BASKETS"
  | "SHARED_CAPACITY"
  | "RECLASSIFICATION";

export interface ApplicableRestriction {
  family: CrossCovenantFamily;
  sectionRef: string;
  sourceId: string;
  statement: string;
  independentlyApplicable: true;
  representation: ContractualProvisionRepresentation;
}

export interface CrossCovenantAnalysis {
  version: typeof CROSS_COVENANT_VERSION;
  transactionDescription: string;
  applicableRestrictions: ApplicableRestriction[];
  sharedCapacityLinks: Array<{ from: string; to: string; evidence: string }>;
  antiStackingNotes: string[];
  reclassificationNotes: string[];
  /** Every independently applicable restriction must be satisfied — never OR'd into a single permission. */
  conjunctionRule: "ALL_INDEPENDENT_RESTRICTIONS_MUST_BE_SATISFIED";
  unsupportedAssumptions: string[];
}

const TXN_FAMILY_MAP: Array<{ re: RegExp; families: CrossCovenantFamily[] }> = [
  { re: /secur(?:ed|ity)|lien|collateral/i, families: ["DEBT_INCURRENCE", "LIENS", "GUARANTEES"] },
  { re: /dividend|restricted.?payment|distribution|repurchase.*equity/i, families: ["RESTRICTED_PAYMENTS", "INVESTMENTS", "SHARED_CAPACITY"] },
  { re: /invest(?:ment)?|acquisition|joint venture/i, families: ["INVESTMENTS", "ACQUISITIONS", "RESTRICTED_PAYMENTS", "ASSET_SALES"] },
  { re: /asset.?sale|disposition|proceeds/i, families: ["ASSET_SALES", "RESTRICTED_PAYMENTS", "DEBT_INCURRENCE"] },
  { re: /guarant|non-?guarantor|subsidiary/i, families: ["GUARANTEES", "SUBSIDIARY_RESTRICTIONS", "DEBT_INCURRENCE"] },
  { re: /refinanc|replacement debt|permitted refinancing/i, families: ["REFINANCING", "DEBT_INCURRENCE", "LIENS"] },
  { re: /ratio|leverage|incurrence.?test/i, families: ["RATIO_PERMISSIONS", "DEBT_INCURRENCE", "FIXED_BASKETS"] },
  { re: /debt|indebtedness|incur|borrow/i, families: ["DEBT_INCURRENCE", "LIENS", "RATIO_PERMISSIONS", "FIXED_BASKETS"] },
];

function mapCategory(cat: string): CrossCovenantFamily[] {
  switch (cat) {
    case "DEBT_INCURRENCE":
      return ["DEBT_INCURRENCE", "FIXED_BASKETS", "RATIO_PERMISSIONS"];
    case "LIENS_SECURED_DEBT":
      return ["LIENS"];
    case "RESTRICTED_PAYMENTS_INVESTMENTS":
      return ["RESTRICTED_PAYMENTS", "INVESTMENTS"];
    case "ASSET_SALES":
      return ["ASSET_SALES"];
    case "GUARANTEES":
      return ["GUARANTEES", "SUBSIDIARY_RESTRICTIONS"];
    default:
      return [];
  }
}

function familiesForTransaction(description: string): Set<CrossCovenantFamily> {
  const out = new Set<CrossCovenantFamily>();
  for (const row of TXN_FAMILY_MAP) {
    if (row.re.test(description)) for (const f of row.families) out.add(f);
  }
  if (out.size === 0) {
    out.add("DEBT_INCURRENCE");
    out.add("LIENS");
    out.add("RESTRICTED_PAYMENTS");
  }
  return out;
}

/** Coordinate cross-covenant restrictions for a proposed transaction description. */
export function analyzeCrossCovenant(params: {
  transactionDescription: string;
  items: Array<CovenantSummaryItem & { sourceId: string }>;
  amendmentProvenance?: string | null;
}): CrossCovenantAnalysis {
  const wanted = familiesForTransaction(params.transactionDescription);
  const applicable: ApplicableRestriction[] = [];
  const sharedCapacityLinks: CrossCovenantAnalysis["sharedCapacityLinks"] = [];
  const antiStackingNotes: string[] = [];
  const reclassificationNotes: string[] = [];
  const unsupportedAssumptions: string[] = [];

  for (const item of params.items) {
    const families = mapCategory(item.category);
    const hit = families.some((f) => wanted.has(f));
    const text = `${item.operativeLanguageExcerpt} ${item.plainEnglish}`;
    const shared = /together with|shared (?:cap|capacity|basket)|in the aggregate with/i.test(text);
    const reclass = /reclassif|redesignat|divide and classify/i.test(text);
    if (!hit && !shared && !reclass) continue;

    const representation = representProvision({
      item,
      amendmentProvenance: params.amendmentProvenance,
    });
    for (const f of families.length ? families : (["DEBT_INCURRENCE"] as CrossCovenantFamily[])) {
      if (!wanted.has(f) && !shared && !reclass) continue;
      applicable.push({
        family: shared ? "SHARED_CAPACITY" : reclass ? "RECLASSIFICATION" : f,
        sectionRef: item.sectionRef,
        sourceId: item.sourceId,
        statement: item.restriction ?? item.plainEnglish.split(". ")[0] ?? item.heading,
        independentlyApplicable: true,
        representation,
      });
    }

    for (const m of text.matchAll(/together with[^.;]{0,80}Section\s*([\d.]+(?:\([^)]+\))?)/gi)) {
      sharedCapacityLinks.push({
        from: item.sectionRef,
        to: m[1]!,
        evidence: m[0].replace(/\s+/g, " ").trim(),
      });
      antiStackingNotes.push(
        `§${item.sectionRef} and Section ${m[1]} share a cap — capacity may not be stacked independently.`,
      );
    }
    if (reclass) {
      reclassificationNotes.push(
        `§${item.sectionRef}: reclassification/redesignation language present — redesignation is not automatic executable authority without certification.`,
      );
    }
    for (const a of representation.ambiguityAndUnsupportedMechanics) {
      unsupportedAssumptions.push(`§${item.sectionRef}: ${a}`);
    }
  }

  // Deduplicate by section+family
  const dedup = new Map<string, ApplicableRestriction>();
  for (const a of applicable) {
    const k = `${a.sourceId}::${a.sectionRef}::${a.family}`;
    if (!dedup.has(k)) dedup.set(k, a);
  }

  if (dedup.size === 0) {
    unsupportedAssumptions.push(
      "No independently applicable restrictions were identified from analyzed provisions — transaction permissibility is unresolved.",
    );
  }

  return {
    version: CROSS_COVENANT_VERSION,
    transactionDescription: params.transactionDescription,
    applicableRestrictions: [...dedup.values()],
    sharedCapacityLinks,
    antiStackingNotes: [...new Set(antiStackingNotes)],
    reclassificationNotes: [...new Set(reclassificationNotes)],
    conjunctionRule: "ALL_INDEPENDENT_RESTRICTIONS_MUST_BE_SATISFIED",
    unsupportedAssumptions: [...new Set(unsupportedAssumptions)].slice(0, 20),
  };
}
