/**
 * Pure maintenance-ratio parsing (Rule 180). Kept free of prisma
 * imports so it is unit-testable in isolation (same reason as
 * grant-types.ts / shared-cap.ts).
 *
 * A financial-maintenance covenant is a TEST, not a grant of
 * capacity — it must never mint a Permission. It compiles to a
 * CovenantProvision that the legacy ratio-test path
 * (buildDebtRatioTests) evaluates pro forma for a transaction.
 *
 * Minting is deliberately narrow: exactly ONE distinct ratio
 * threshold, exactly ONE test type (leverage OR coverage), and
 * exactly ONE comparison direction. Anything else — a stepped
 * schedule (several thresholds), two conflated tests (a coverage
 * test and a leverage test in one item, as in a real §6.14 that
 * carries both (a) and (b)), or an ambiguous direction — returns
 * null (fail-closed: no provision, the item stays visible with
 * its schedule, and counsel must split or clarify it). Collapsing
 * a stepped schedule to its first value would silently test the
 * wrong threshold for every other period.
 */
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import { parseRatio } from "./money";

export interface MaintenanceRatio {
  formulaType: "LEVERAGE_RATIO_ROOM" | "COVERAGE_RATIO_ROOM";
  thresholdValue: number;
  /** Leverage only: which debt basis the test applies to. */
  debtBasis?: "secured" | "total";
}

export function parseMaintenanceRatio(item: CovenantSummaryItem): MaintenanceRatio | null {
  // Rule 192: a truncated excerpt may show one test while the
  // tail hides others — no single-test provision from a partial
  // excerpt. EDITED items are exempt (counsel-supplied text).
  if (item.operativeExcerptTruncated && item.reviewerDecision !== "EDITED") return null;
  // Exactly one distinct ratio threshold across the item's baskets.
  const basketRatios = [...new Set(
    (item.materialBasketsThresholds ?? [])
      .map((b) => /Ratio threshold:\s*([\d.]+)\s*to\s*1/i.exec(b)?.[1])
      .filter((v): v is string => Boolean(v))
      .map(Number),
  )];
  if (basketRatios.length !== 1) return null;
  const threshold = basketRatios[0];
  if (threshold === undefined) return null; // noUncheckedIndexedAccess guard

  const text = [
    ...(item.materialBasketsThresholds ?? []),
    ...(item.permissions ?? []),
    item.plainEnglish,
    item.operativeLanguageExcerpt ?? "",
  ].join("\n");

  // The full text must agree: a ratio the baskets missed (or a
  // second ratio outside the baskets) means the item is not the
  // single clean test this rule requires. parseRatio returns only
  // the FIRST ratio, so a stepped schedule whose baskets list one
  // threshold (e.g. the analyzer captured only the first leg,
  // "4.50 to 1.00", while the text also carries "4.25 to 1.00",
  // "4.00 to 1.00") would pass that check and compile flat at the
  // first leg — silently testing the wrong threshold for every
  // other period. Count EVERY distinct ratio in the text instead:
  // more than one distinct value is a stepped schedule (or an
  // ambiguous item) and must not compile to a single flat test.
  // A single-test item that merely mentions a second ratio in
  // passing is genuinely ambiguous for single-threshold
  // compilation, so fail-closed (null — counsel splits it) is the
  // correct outcome for it too.
  const allRatios = [...new Set([...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:to|:)\s*1(?:\.0+)?/gi)].map((m) => Number(m[1])))].filter(Number.isFinite);
  if (allRatios.length !== 1 || allRatios[0] !== threshold) return null;
  if (parseRatio(text) !== threshold) return null;

  const coverageWords = /\binterest coverage\b|\bfixed charge coverage\b|\bEBITDA to\b.{0,40}\binterest\b|\bcoverage ratio\b/i.test(text);
  const leverageWords = /\bleverage ratio\b|\btotal net leverage\b|\bsenior secured\b.{0,40}\bleverage\b|\bdebt to EBITDA\b|\bdebt\b.{0,40}\bEBITDA\b/i.test(text);
  // Exactly one test type — both means conflated tests (e.g. a
  // Financial Covenants section carrying (a) coverage and (b)
  // leverage in one item); neither means unclassifiable.
  if (coverageWords === leverageWords) return null;

  const atOrAbove = /\bnot less than\b|\bat least\b/i.test(text);
  const atOrBelow =
    /\bshall not exceed\b|\bnot greater than\b|\bnot more than\b|\bnot exceed\b|\bnot permit\b.{0,80}\bexceed\b/i.test(text);
  // Exactly one direction — both/neither is ambiguous.
  if (atOrAbove === atOrBelow) return null;

  if (coverageWords) {
    if (!atOrAbove) return null; // a coverage floor must be "not less than"
    return { formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: threshold };
  }
  if (!atOrBelow) return null; // a leverage cap must be "shall not exceed"
  return {
    formulaType: "LEVERAGE_RATIO_ROOM",
    thresholdValue: threshold,
    debtBasis: /\bsecured\b|\bfirst.?lien\b/i.test(text) ? "secured" : "total",
  };
}
