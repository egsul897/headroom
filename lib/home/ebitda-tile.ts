/**
 * Presentation view of AddBackFlag / AddBackLine.
 * Status unions are the engine codes from PR #398. This module does not add a code.
 */

export const ADD_BACK_FLAG_STATUS = ["DETECTED", "NEEDS_INPUT", "CONDITIONAL"] as const;
export const ADD_BACK_LINE_STATUS = ["CLAIMED", "CAPPED", "NEEDS_INPUT"] as const;

export type AddBackFlagStatus = (typeof ADD_BACK_FLAG_STATUS)[number];
export type AddBackLineStatus = (typeof ADD_BACK_LINE_STATUS)[number];

export type EbitdaAddBack = {
  id: string;
  name: string;
  flagStatus: AddBackFlagStatus;
  lineStatus: AddBackLineStatus;
  /** Integer USD from the engine, or null when nothing was evidenced. */
  amount: string | null;
  source: {
    concept: string;
    current: string;
    prior: string | null;
    currentPeriodEnd: string | null;
    priorPeriodEnd: string | null;
  } | null;
  clause: { label: string; text: string };
  cap: { text: string; amount: string | null } | null;
  capHeadroom: string | null;
  conditional?: "LENDER_APPROVAL";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  note: string;
  bindingTier?: "CONFIRMED" | "LOWER_CONFIDENCE";
  /** Debt-capacity impact the engine already computed. Null when it did not. */
  impact: string | null;
};

const INTEGER = /^-?\d+$/;

export function isIntegerAmount(value: string | null | undefined): value is string {
  return typeof value === "string" && INTEGER.test(value);
}

/** Grouped USD. An engine zero is $0. Anything that is not an integer is not formatted. */
export function formatUsd(value: string | null | undefined): string | null {
  if (!isIntegerAmount(value)) return null;
  const negative = value.startsWith("-");
  const digits = (negative ? value.slice(1) : value).replace(/^0+(?=\d)/, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}$${grouped}`;
}

/** One badge on the list. The sheet shows the flag and the line separately. */
export function listBadge(item: EbitdaAddBack): AddBackFlagStatus | AddBackLineStatus {
  if (item.flagStatus === "CONDITIONAL") return "CONDITIONAL";
  if (item.lineStatus === "CAPPED") return "CAPPED";
  return item.flagStatus;
}

/** Confirm only when the flag has an integer amount and a source filing. */
export function canConfirm(item: EbitdaAddBack): boolean {
  return isIntegerAmount(item.amount) && item.source != null;
}

export function ebitdaTotals(base: string, items: readonly EbitdaAddBack[], confirmed: ReadonlySet<string>) {
  if (!isIntegerAmount(base)) return null;
  let total = BigInt(base);
  let additional = 0n;
  let known = 0;
  let attention = 0;
  for (const item of items) {
    if (!confirmed.has(item.id)) attention += 1;
    if (!isIntegerAmount(item.amount)) continue;
    if (confirmed.has(item.id)) total += BigInt(item.amount);
    else {
      additional += BigInt(item.amount);
      known += 1;
    }
  }
  return {
    total: total.toString(),
    additional: known > 0 ? additional.toString() : null,
    attention,
  };
}
