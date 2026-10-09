/**
 * Explicit verbatim → named selector registry.
 * Unknown contract wording is never guessed — caller gets NEEDS_INPUT.
 */
import type { NamedContractualSelector } from "./types";

const VERBATIM_MAP: ReadonlyArray<{ pattern: RegExp; kind: NamedContractualSelector }> = [
  {
    pattern: /^most recently ended fiscal quarter(?:\s+for which financial statements (?:are|have been) available)?$/i,
    kind: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
  },
  {
    pattern: /^(?:the\s+)?last day of the most recently ended fiscal quarter(?:\s+for which financial statements (?:are|have been) available)?$/i,
    kind: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
  },
  {
    pattern: /^most recently ended fiscal year$/i,
    kind: "MOST_RECENTLY_ENDED_FISCAL_YEAR",
  },
  {
    pattern: /^(?:the\s+)?four consecutive fiscal quarters most recently ended$/i,
    kind: "FOUR_CONSECUTIVE_FISCAL_QUARTERS_MOST_RECENTLY_ENDED",
  },
  {
    pattern: /^most recently (?:ended|completed) testing period$/i,
    kind: "FOUR_CONSECUTIVE_FISCAL_QUARTERS_MOST_RECENTLY_ENDED",
  },
  {
    pattern: /^most recently delivered financial statements$/i,
    kind: "MOST_RECENTLY_DELIVERED_FINANCIAL_STATEMENTS",
  },
  {
    pattern: /^most recently delivered compliance certificate$/i,
    kind: "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
  },
  {
    pattern: /^(?:the\s+)?date of (?:such|the) transaction$/i,
    kind: "DATE_OF_TRANSACTION",
  },
];

/** Normalize whitespace for registry lookup. */
export function normalizeSelectorText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function lookupNamedSelector(verbatim: string): NamedContractualSelector | null {
  const t = normalizeSelectorText(verbatim);
  // Strip leading "the " for broader match after pattern tries
  for (const { pattern, kind } of VERBATIM_MAP) {
    if (pattern.test(t)) return kind;
  }
  const withoutThe = t.replace(/^the\s+/i, "");
  if (withoutThe !== t) {
    for (const { pattern, kind } of VERBATIM_MAP) {
      if (pattern.test(withoutThe)) return kind;
    }
  }
  return null;
}
