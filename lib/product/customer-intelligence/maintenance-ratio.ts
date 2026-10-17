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
import {
  findRatioTokens,
  isRatioShapedToken,
  parseCovenantLevel,
  type CovenantLevelMetric,
} from "../../contract-model/covenant-computation/covenant-levels";
import { rationalFromString, toCanonicalString } from "../../contract-model/runtime/decimal";

export interface MaintenanceRatio {
  formulaType: "LEVERAGE_RATIO_ROOM" | "COVERAGE_RATIO_ROOM";
  thresholdValue: number;
  /** Leverage only: which debt basis the test applies to. */
  debtBasis?: "secured" | "total";
  /**
   * The agreement-defined metric the unified covenant-level parser
   * identified for this test — recorded ONLY when the parser fully
   * agrees with this rule (DETERMINED, MAINTENANCE, same level, same
   * direction) AND the parser's metric is exactly the measure the
   * engine computes for the row (net leverage on the total basis,
   * secured leverage on the secured basis, interest coverage for a
   * coverage test). A Fixed Charge Coverage test, for example, is
   * never recorded: the engine computes interest coverage, so the
   * agreement-defined metric stays unset rather than mislabeled.
   */
  agreementMetric?: CovenantLevelMetric;
}

/**
 * The unified parser's metric for this item when it agrees with Rule
 * 180 on kind, level and direction and names the measure the engine
 * actually computes; otherwise undefined (metric stays unset).
 */
function agreementMetricFor(
  item: CovenantSummaryItem,
  formulaType: MaintenanceRatio["formulaType"],
  threshold: number,
  debtBasis: "secured" | "total" | undefined,
): CovenantLevelMetric | undefined {
  const parsed = parseCovenantLevel({
    text: item.operativeLanguageExcerpt ?? "",
    sectionHeading: item.heading,
    sectionFamily: item.category,
  });
  if (parsed.status !== "DETERMINED" || parsed.testKind !== "MAINTENANCE" || !parsed.metric) return undefined;
  let expectedLevel: string;
  try {
    expectedLevel = toCanonicalString(rationalFromString(String(threshold)));
  } catch {
    return undefined;
  }
  if (parsed.level !== expectedLevel) return undefined;
  if (formulaType === "LEVERAGE_RATIO_ROOM") {
    if (parsed.direction !== "MAX") return undefined;
    if (parsed.metric === "NET_LEVERAGE" && debtBasis === "total") return parsed.metric;
    if (parsed.metric === "SECURED_LEVERAGE" && debtBasis === "secured") return parsed.metric;
    return undefined;
  }
  if (parsed.direction !== "MIN") return undefined;
  return parsed.metric === "INTEREST_COVERAGE" ? parsed.metric : undefined;
}

export function parseMaintenanceRatio(item: CovenantSummaryItem): MaintenanceRatio | null {
  // Rule 192: a truncated excerpt may show one test while the
  // tail hides others — no single-test provision from a partial
  // excerpt. EDITED items are exempt (counsel-supplied text).
  if (item.operativeExcerptTruncated && item.reviewerDecision !== "EDITED") return null;
  // Redline port (from PR #428): redline-ambiguous text may be text
  // the parties deleted — no maintenance ratio from it. EDITED
  // items are exempt (counsel-supplied text), as under Rule 192.
  if (item.redlineAmbiguous && item.reviewerDecision !== "EDITED") return null;
  // Exactly one distinct ratio threshold across the item's baskets.
  // The labels are read with the unified covenant-level tokenizer, so
  // a threshold the analyzer labeled from "4.50:1.00" or "9.00:2.00"
  // counts the same as one labeled from "4.50 to 1" (the old label
  // regex only understood the "N to 1" spelling and missed the rest).
  const basketRatios = [...new Set(
    (item.materialBasketsThresholds ?? [])
      .filter((b) => /Ratio threshold:/i.test(b))
      .flatMap((b) => findRatioTokens(b).filter((t) => !t.bare && isRatioShapedToken(t)).map((t) => t.numericValue)),
  )].filter(Number.isFinite);
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
  const allRatios = [...new Set(findRatioTokens(text).filter((t) => !t.bare && isRatioShapedToken(t)).map((t) => t.numericValue))].filter(Number.isFinite);
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
    const agreementMetric = agreementMetricFor(item, "COVERAGE_RATIO_ROOM", threshold, undefined);
    return {
      formulaType: "COVERAGE_RATIO_ROOM",
      thresholdValue: threshold,
      ...(agreementMetric ? { agreementMetric } : {}),
    };
  }
  if (!atOrBelow) return null; // a leverage cap must be "shall not exceed"
  const debtBasis: "secured" | "total" = /\bsecured\b|\bfirst.?lien\b/i.test(text) ? "secured" : "total";
  const agreementMetric = agreementMetricFor(item, "LEVERAGE_RATIO_ROOM", threshold, debtBasis);
  return {
    formulaType: "LEVERAGE_RATIO_ROOM",
    thresholdValue: threshold,
    debtBasis,
    ...(agreementMetric ? { agreementMetric } : {}),
  };
}
