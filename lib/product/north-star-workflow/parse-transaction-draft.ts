/**
 * Pure Ask transaction-draft parsing. Kept free of prisma
 * imports so it is unit-testable in isolation.
 */
import { isValidIsoDate } from "@/lib/product/iso-date";

export interface TransactionDraft {
  rawQuestion: string;
  evaluationDate: string | null;
  amountMillions: number | null;
  kind: "SECURED_DEBT" | "UNSECURED_DEBT" | "RESTRICTED_PAYMENT" | "INVESTMENT" | "ACQUISITION" | "UNKNOWN";
  secured: boolean | null;
  missingConfirmations: string[];
}

function extractEvaluationDate(question: string): string | null {
  // Prefer a phrase-attached date ("evaluated as of 2026-06-30",
  // "as of 2026-06-30"). The old code took the FIRST ISO date
  // anywhere, so "maturing 2031-06-01, evaluated as of
  // 2026-06-30" used the maturity date as the evaluation date
  // (rule 53 class). Bare ISO fallback skips maturity-language
  // dates the same way.
  const phrase = question.match(
    /(?:evaluated\s+as\s+of|evaluation\s+date(?:\s+of)?|as\s+of|as\s+at)\s*(20\d{2}-\d{2}-\d{2})\b/i,
  );
  if (phrase && isValidIsoDate(phrase[1]!)) return phrase[1]!;
  for (const m of question.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)) {
    const before = question.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0).toLowerCase();
    if (/\b(due|maturing|maturity|redeemable|payable|expires?)\b/.test(before)) continue;
    if (isValidIsoDate(m[1]!)) return m[1]!;
  }
  return null;
}

function extractAmountMillions(question: string): number | null {
  const m = question.match(/\$?\s*(\d+(?:\.\d+)?)\s*(million|m)\b/i);
  if (m) return Number(m[1]);
  const b = question.match(/\$?\s*(\d+(?:\.\d+)?)\s*(billion|bn)\b/i);
  if (b) return Number(b[1]) * 1000;
  return null;
}

function inferKind(question: string): TransactionDraft["kind"] {
  const q = question.toLowerCase();
  if (/acquisit|purchase.*target|buy.*company/.test(q)) return "ACQUISITION";
  if (/dividend|restricted payment|repurchase|buyback/.test(q)) return "RESTRICTED_PAYMENT";
  if (/investment|contribute|equity infusion/.test(q) && !/equity contribution|eligible equity/.test(q)) {
    return "INVESTMENT";
  }
  // Check unsecured before secured — "unsecured" contains the substring "secured".
  if (/\bunsecured\b/.test(q) && /debt|borrow|incur|loan|notes?/.test(q)) return "UNSECURED_DEBT";
  if (/\bsecured\b|\blien\b|\bcollateral\b/.test(q) && /debt|borrow|incur|loan|notes?/.test(q)) return "SECURED_DEBT";
  if (/debt|borrow|incur|loan|notes?/.test(q)) return "UNSECURED_DEBT";
  return "UNKNOWN";
}

/** Parse a contemplated transaction into a structured draft (no inventing of missing fields). */
export function parseTransactionDraft(question: string): TransactionDraft {
  const evaluationDate = extractEvaluationDate(question);
  const amountMillions = extractAmountMillions(question);
  const kind = inferKind(question);
  const q = question.toLowerCase();
  const secured =
    kind === "SECURED_DEBT"
      ? true
      : kind === "UNSECURED_DEBT"
        ? false
        : kind === "ACQUISITION"
          ? /\bunsecured\b/.test(q)
            ? false
            : true
          : /\bunsecured\b/.test(q)
            ? false
            : /\bsecured\b|\blien\b/.test(q)
              ? true
              : null;
  const missingConfirmations: string[] = [];
  if (!evaluationDate) missingConfirmations.push("evaluationDate (YYYY-MM-DD)");
  if (amountMillions == null) missingConfirmations.push("transaction amount");
  if (kind === "UNKNOWN") missingConfirmations.push("transaction kind (debt / RP / investment / acquisition)");
  if (secured == null && (kind === "SECURED_DEBT" || kind === "UNSECURED_DEBT" || kind === "ACQUISITION")) {
    missingConfirmations.push("secured vs unsecured");
  }
  return {
    rawQuestion: question,
    evaluationDate,
    amountMillions,
    kind,
    secured,
    missingConfirmations,
  };
}
