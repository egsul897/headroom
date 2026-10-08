/**
 * Natural-language + structured query parsing for covenant precedent research.
 * Pure, deterministic, no model calls.
 */

import { normalizeMoneyToken, tokenize } from "./lexical";
import type { ParsedResearchQuery, ResearchFilters, ResearchIntent } from "./types";

const UNSUPPORTED_PATTERNS: { re: RegExp; reason: string }[] = [
  {
    re: /\b(is (this|that)(?:\s+\S+){0,6}\s+(allowed|permitted)|is (this|that)( transaction)? (allowed|permitted)|is the transaction (allowed|permitted)|can we (do|make|incur|pay)|are we allowed|approve(d)? capacity|legal opinion|should we|recommend|is it safe to)\b/i,
    reason:
      "This interface retrieves source-backed precedent excerpts only. It does not opine on whether a transaction is permitted or approve capacity.",
  },
  {
    re: /\b(how much capacity|remaining capacity|headroom (left|available)|maximum we can|calculate (the )?capacity|unsupported capacity)\b/i,
    reason:
      "Capacity computation is out of scope for the research interface. Use the capacity/solver surfaces for calculation; this tool only retrieves comparable source language.",
  },
  {
    re: /\b(draft|rewrite|mark[- ]up|negotiate)\b/i,
    reason: "Drafting and negotiation advice are unsupported. Ask for comparable source excerpts instead.",
  },
  {
    re: /\b(certify|promote .{0,40} to verified|mark as verified|override unresolved|infer (the )?missing financial|approve (the )?transaction)\b/i,
    reason:
      "Read-only research surface: it cannot certify covenants, promote hypotheses to verified, override unresolved restrictions, infer financial inputs, or approve transactions.",
  },
];

function parseMoneyAmount(raw: string): number | null {
  const million = raw.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*million\b/i);
  if (million) return Math.round(parseFloat(million[1]!) * 1_000_000);

  const plain = raw.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\b/);
  if (plain) return Number(plain[1]!.replace(/,/g, ""));

  return null;
}

function detectIntent(raw: string, amount: number | null): ResearchIntent | null {
  const q = raw.toLowerCase();

  if (
    (q.includes("general debt") || (q.includes("debt basket") && q.includes("general"))) &&
    (amount != null || q.includes("basket"))
  ) {
    return "GENERAL_DEBT_BASKET_AMOUNT";
  }
  if (
    (q.includes("ebitda") || q.includes("consolidated ebitda") || q.includes("adjusted ebitda")) &&
    (q.includes("synergy") || q.includes("synergies") || q.includes("add-back") || q.includes("addback")) &&
    (q.includes("uncapped") || q.includes("no cap") || q.includes("without a cap") || q.includes("unlimited"))
  ) {
    return "EBITDA_UNCAPPED_SYNERGY";
  }
  if (
    (q.includes("restricted payment") || q.includes("restricted-payment") || q.includes(" rp ")) &&
    (q.includes("no default") || q.includes("no event of default") || q.includes("conditioned on no default"))
  ) {
    return "RP_NO_DEFAULT";
  }
  if (
    (q.includes("investment") && (q.includes("junior") || q.includes("restricted debt") || q.includes("prepay"))) ||
    (q.includes("shared") && q.includes("junior"))
  ) {
    return "INVESTMENT_SHARED_JUNIOR_PREPAY";
  }
  if (
    (q.includes("incremental") || q.includes("ratio debt") || q.includes("ratio-based")) &&
    (q.includes("debt") || q.includes("indebtedness"))
  ) {
    return "RATIO_INCREMENTAL_DEBT";
  }
  if (
    q.includes("amendment") &&
    (q.includes("restricted payment") || q.includes("restricted-payment") || q.includes(" rp ")) &&
    (q.includes("reduc") || q.includes("decreas") || q.includes("cut") || q.includes("lower"))
  ) {
    return "AMENDMENT_REDUCES_RP";
  }
  if (q.includes("springing") && (q.includes("leverage") || q.includes("covenant") || q.includes("fccr") || q.includes("coverage"))) {
    return "SPRINGING_LEVERAGE";
  }
  if (
    (q.includes("non-guarantor") || q.includes("nonguarantor") || q.includes("non guarantor") || q.includes("not a loan party")) &&
    (q.includes("debt") || q.includes("indebtedness") || q.includes("subsidiary"))
  ) {
    return "NON_GUARANTOR_SUBSIDIARY_DEBT";
  }
  if (q.includes("unusual") && q.includes("reclass")) {
    return "UNUSUAL_RECLASSIFICATION";
  }
  if (q.includes("reclassif") && (q.includes("unusual") || q.includes("overlapping") || q.includes("provision"))) {
    return q.includes("unusual") ? "UNUSUAL_RECLASSIFICATION" : "OVERLAPPING_BASKETS";
  }
  if (q.includes("overlapping basket") || q.includes("overlapping baskets")) {
    return "OVERLAPPING_BASKETS";
  }

  return amount != null ? "GENERAL_DEBT_BASKET_AMOUNT" : "GENERIC_LEXICAL";
}

function familyFromIntent(intent: ResearchIntent | null): string[] {
  switch (intent) {
    case "GENERAL_DEBT_BASKET_AMOUNT":
    case "RATIO_INCREMENTAL_DEBT":
    case "NON_GUARANTOR_SUBSIDIARY_DEBT":
      return ["INDEBTEDNESS"];
    case "EBITDA_UNCAPPED_SYNERGY":
      return ["DEFINITIONS_CALCULATION_RULES"];
    case "RP_NO_DEFAULT":
    case "AMENDMENT_REDUCES_RP":
      return ["RESTRICTED_PAYMENTS"];
    case "INVESTMENT_SHARED_JUNIOR_PREPAY":
      return ["INVESTMENTS", "RESTRICTED_PAYMENTS"];
    case "SPRINGING_LEVERAGE":
      return ["SPRINGING_COVENANTS", "FINANCIAL_COVENANTS"];
    case "UNUSUAL_RECLASSIFICATION":
    case "OVERLAPPING_BASKETS":
      return [];
    default:
      return [];
  }
}

export interface StructuredQueryInput {
  text?: string;
  issuer?: string | string[];
  agreementType?: string | string[];
  dateFrom?: string;
  dateTo?: string;
  asOfDate?: string;
  family?: string | string[];
  operativeOnly?: boolean;
  amountUsd?: number;
  conditionType?: string | string[];
  intent?: ResearchIntent;
}

function asArray(v: string | string[] | undefined): string[] | undefined {
  if (v == null) return undefined;
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse a natural-language research question and/or structured flags.
 */
export function parseResearchQuery(input: string | StructuredQueryInput): ParsedResearchQuery {
  const structured: StructuredQueryInput = typeof input === "string" ? { text: input } : input;
  const raw = (structured.text ?? "").trim();

  for (const { re, reason } of UNSUPPORTED_PATTERNS) {
    if (raw && re.test(raw)) {
      return {
        raw,
        lexicalTerms: [],
        phrases: [],
        filters: {},
        intent: null,
        unsupportedReason: reason,
      };
    }
  }

  const amountFromText = raw ? parseMoneyAmount(raw) : null;
  const moneyAmountUsd = structured.amountUsd ?? amountFromText;
  const intent = structured.intent ?? (raw ? detectIntent(raw, moneyAmountUsd) : null);

  const phrases: string[] = [];
  const lexicalTerms = raw ? tokenize(raw) : [];

  if (moneyAmountUsd != null) {
    phrases.push(...normalizeMoneyToken(moneyAmountUsd));
  }
  if (/no default|no event of default/i.test(raw)) {
    phrases.push("no default", "no event of default");
  }
  if (/synerg/i.test(raw)) phrases.push("synergies", "synergy", "run rate");
  if (/springing/i.test(raw)) phrases.push("springing", "availability block");
  if (/non-?guarantor|not a loan party/i.test(raw)) {
    phrases.push("not a loan party", "non-guarantor", "subsidiary that is not a loan party");
  }
  if (/reclassif/i.test(raw)) phrases.push("reclassify", "classify or reclassify");
  if (/incremental|ratio-based incremental|ratio debt/i.test(raw)) {
    phrases.push("incremental", "unlimited amount", "ratio debt");
  }
  if (/available amount/i.test(raw)) phrases.push("available amount");
  if (/junior|restricted debt payment/i.test(raw)) {
    phrases.push("restricted debt payments", "junior lien");
  }

  const filters: ResearchFilters = {
    issuers: asArray(structured.issuer),
    agreementTypes: asArray(structured.agreementType),
    dateFrom: structured.dateFrom ?? null,
    dateTo: structured.dateTo ?? null,
    asOfDate: structured.asOfDate ?? null,
    covenantFamilies: asArray(structured.family) ?? familyFromIntent(intent),
    operativeOnly: structured.operativeOnly ?? false,
    moneyAmountUsd: moneyAmountUsd,
    conditionTypes: asArray(structured.conditionType),
    intents: intent ? [intent] : undefined,
  };

  if (/no default|no event of default/i.test(raw)) {
    filters.conditionTypes = [...(filters.conditionTypes ?? []), "NO_DEFAULT"];
  }

  return {
    raw,
    lexicalTerms,
    phrases,
    filters,
    intent,
    unsupportedReason: null,
  };
}
