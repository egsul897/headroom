/**
 * Pure formula parsing for counsel-accepted interpretations.
 * Kept free of prisma imports so it is unit-testable in isolation
 * (same reason as grant-types.ts / shared-cap.ts). Moved here from
 * compile-accepted.ts so the exception-based review classifier
 * (routine-review.ts) can use it without pulling in the Prisma
 * client. compile-accepted.ts re-exports the public helpers.
 */
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import { parseMoneyMillions, parsePctOf, parseRatio } from "./money";
import { resolveDefinedTermCap } from "./grant-types";

export interface ParsedFormula {
  formulaType:
    | "FLAT_AMOUNT"
    | "GREATER_OF_FLAT_OR_PCT_EBITDA"
    | "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS"
    | "GREATER_OF_FLAT_OR_PCT_NET_WORTH"
    | "LEVERAGE_RATIO_ROOM"
    | "RATIO_GATE"
    | "BUILDER_BASKET";
  thresholdValue: number;
  params?: Record<string, unknown>;
  amountKind: "FIXED" | "INCURRENCE_BASED";
  measurementBasis: "CUMULATIVE_INCURRED" | "CURRENTLY_OUTSTANDING";
  notes: string[];
  modelingStatus: "MODELED" | "KNOWN_NOT_MODELED";
  missingFields: string[];
}

export function parseFormulaFromItem(item: CovenantSummaryItem): ParsedFormula {
  // Rule 192: the item's excerpt is a PREFIX of a longer operative
  // span (4000-char cap) — tail clauses are missing. A formula
  // parsed from it would attribute an early clause's amount to
  // the whole section (Aon 6.11 minted a FLAT $5M LIEN Permission
  // from an early clause while the (t) greater-of basket sat
  // beyond the cap). Fail closed: no formula from a truncated
  // excerpt. EDITED items are exempt — counsel supplied the
  // controlling text, so the analyzer's excerpt is not what
  // the formula parses.
  if (item.operativeExcerptTruncated && item.reviewerDecision !== "EDITED") {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Operative excerpt truncated — tail clauses not visible; no formula minted from a partial excerpt."],
      modelingStatus: "KNOWN_NOT_MODELED",
      missingFields: ["thresholdValue", "formulaType", "operativeExcerptTruncated"],
    };
  }
  const basketText = [
    ...(item.materialBasketsThresholds ?? []),
    ...(item.permissions ?? []),
    item.plainEnglish,
    item.operativeLanguageExcerpt ?? "",
  ].join("\n");

  const notes: string[] = [];
  const missingFields: string[] = [];
  const money = parseMoneyMillions(basketText);
  // Grower %s are base-attached: the % modifying EBITDA / Total
  // Assets — never the first % anywhere in the text (an unrelated
  // "50% ownership" in the same section is not the grower).
  const pctEbitda = parsePctOf(basketText, "EBITDA");
  const pctAssets = parsePctOf(basketText, "TOTAL_ASSETS");
  const pctNetWorth = parsePctOf(basketText, "NET_WORTH");
  const ratio = parseRatio(basketText);
  const greaterOf = /greater of/i.test(basketText);
  const ebitdaBase = /EBITDA/i.test(basketText);
  const assetsBase = /Total Assets|Consolidated Total Assets/i.test(basketText);
  const netWorthBase = /Net Worth/i.test(basketText);
  const builder = /Available Amount|builder basket|Cumulative Credit/i.test(basketText);
  const outstanding = /outstanding amount at any time|currently outstanding/i.test(basketText);

  if (builder && money != null) {
    const cniMentioned = /net income|CNI/i.test(basketText);
    const cniShare = parsePctOf(basketText, "CNI");
    return {
      formulaType: "BUILDER_BASKET",
      thresholdValue: money,
      params: {
        // Rule 58: never invent percentages. An unparseable
        // grower % is undefined + missingFields, NOT 0 (which
        // silently zeroes the grower) and NOT 0.5 for CNI
        // (which ADDED 0.5 × max(0, CNI) of invented capacity).
        pctEbitda: ebitdaBase && pctEbitda != null ? pctEbitda : undefined,
        cniSharePct: cniShare ?? undefined,
        includeEquityProceeds: /equity/i.test(basketText),
      },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Compiled builder/available-amount starter from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [
        ...(ebitdaBase && pctEbitda == null ? ["builder pct of EBITDA"] : []),
        ...(cniMentioned && cniShare == null ? ["builder cni share %"] : []),
      ],
    };
  }

  if (greaterOf && money != null && ebitdaBase && pctEbitda != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: money,
      params: { pctEbitda },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % EBITDA basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && assetsBase && pctAssets != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: money,
      params: { pctTotalAssets: pctAssets },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: [
        "Compiled greater-of flat / % Consolidated Total Assets basket from counsel-accepted analysis",
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && assetsBase) {
    // Grower % present in structure but not parseable — model floor only; require counsel % completion.
    notes.push(
      "Grower component (% of Consolidated Total Assets) referenced but percentage not parsed; fixed-dollar floor modeled only.",
    );
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes,
      modelingStatus: "MODELED",
      missingFields: ["grower_%_total_assets"],
    };
  }

  // Rule 186: greater-of flat / % Consolidated Net Worth (the
  // Aon 6.16(l) / 6.11(t) shape: "greater of $1,000,000,000 or
  // ten percent (10%) of Consolidated Net Worth"). Previously
  // fell through to a silent FLAT_AMOUNT — the grower leg was
  // dropped with no disclosure, understating capacity whenever
  // Net Worth made the % leg the larger one.
  if (greaterOf && money != null && netWorthBase && pctNetWorth != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_NET_WORTH",
      thresholdValue: money,
      params: { pctNetWorth },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % Consolidated Net Worth basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && netWorthBase) {
    // Same floor-only fallback as the Total Assets branch.
    notes.push(
      "Grower component (% of Consolidated Net Worth) referenced but percentage not parsed; fixed-dollar floor modeled only.",
    );
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes,
      modelingStatus: "MODELED",
      missingFields: ["grower_%_net_worth"],
    };
  }

  if (ratio != null && /leverage|incurrence|ratio debt|pro forma/i.test(basketText)) {
    return {
      formulaType: /unlimited|so long as/i.test(basketText) ? "RATIO_GATE" : "LEVERAGE_RATIO_ROOM",
      thresholdValue: ratio,
      params: { debtBasis: /secured|first.?lien/i.test(basketText) ? "secured" : "total" },
      amountKind: "INCURRENCE_BASED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Compiled ratio permission/gate from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (money != null) {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled fixed-dollar basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  // Rule 197: the clause caps by a defined term whose definition is
  // a bare dollar amount (Strata 6.01(k): "not exceeding the
  // Threshold Amount" + "Threshold Amount means $ 750,000.").
  // Resolve it to a FLAT_AMOUNT. A formula/conditional
  // definition does not resolve — fail closed below.
  const definedCap = resolveDefinedTermCap(item);
  if (definedCap != null) {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: definedCap,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled fixed-dollar basket from a defined-term cap resolved against the document's definitions"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  missingFields.push("thresholdValue", "formulaType");
  return {
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 0,
    amountKind: "FIXED",
    measurementBasis: "CUMULATIVE_INCURRED",
    notes: ["Could not parse a numeric basket/threshold — not minting MODELED Permission"],
    modelingStatus: "KNOWN_NOT_MODELED",
    missingFields,
  };
}

const INDEPENDENT_REQUIREMENT_RE =
  /\bno\s+(?:default|event\s+of\s+default)\b|\bpro\s+forma\s+compliance\b|\brepresentation|\bwarrant|\bsolvency|\bsolvent\b|\bno\s+(?:breach|violation)\b|\bcompliance\s+with\s+(?:the\s+)?(?:covenants?|terms|provisions)/i;

export function isCapRestatementCondition(text: string, thresholdValue: number | null): boolean {
  if (thresholdValue == null) return false;
  // Rule 206 tightening: a mixed condition (cap + an independent
  // requirement) is not a pure cap restatement — keep it.
  if (INDEPENDENT_REQUIREMENT_RE.test(text)) return false;
  const capVerb = /\b(?:not\s+exceed(?:ing)?|does\s+not\s+exceed|shall\s+not\s+exceed|up\s+to\s+\$|maximum\b[^.]{0,40}\$|no\s+more\s+than\s+\$|capped\s+at\s+\$)/i.test(text);
  if (!capVerb) return false;
  const amounts = text.match(/\$\s*[\d,]+(?:\.\d+)?/g) ?? [];
  return amounts.some((a) => {
    const v = parseMoneyMillions(a);
    return v != null && Math.abs(v - thresholdValue) < 1e-6;
  });
}

export function parseCounselFormulaForTest(item: CovenantSummaryItem) {
  return parseFormulaFromItem(item);
}
