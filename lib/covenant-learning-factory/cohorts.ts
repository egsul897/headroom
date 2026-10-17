/**
 * Issuer-disjoint cohort assignment.
 * Held-out issuers must never appear in TRAIN_DEV processing that tunes prompts/goldens.
 */

import type { LearningCohort } from "./types";

/**
 * Default held-out issuers for the learning factory evaluation gate.
 * Selected from product-proof holdouts / issuer-disjoint eval packages.
 * Do not add TRAIN_DEV packages from these CIKs.
 */
export const DEFAULT_HELD_OUT_CIKS = new Set<string>([
  "0000851968", // Mohawk Industries (MHK) — product-proof 002 holdout
]);

/** Normalize CIK to 10-digit zero-padded form. */
export function normalizeCik(cik: string | undefined | null): string {
  if (!cik) return "0000000000";
  const digits = cik.replace(/\D/g, "");
  return digits.padStart(10, "0").slice(-10);
}

export function assignCohort(
  issuerCik: string,
  heldOutCiks: Set<string> = DEFAULT_HELD_OUT_CIKS,
): LearningCohort {
  const cik = normalizeCik(issuerCik);
  return heldOutCiks.has(cik) ? "HELD_OUT" : "TRAIN_DEV";
}

export function assertNoHeldOutContamination(
  trainDevCiks: Iterable<string>,
  heldOutCiks: Set<string> = DEFAULT_HELD_OUT_CIKS,
): { ok: true } | { ok: false; contaminated: string[] } {
  const contaminated: string[] = [];
  for (const raw of trainDevCiks) {
    const cik = normalizeCik(raw);
    if (heldOutCiks.has(cik)) contaminated.push(cik);
  }
  return contaminated.length === 0 ? { ok: true } : { ok: false, contaminated };
}
