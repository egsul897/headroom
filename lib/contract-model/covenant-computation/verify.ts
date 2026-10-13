/**
 * Cite-bound replay. A COMPUTED figure that does not re-evaluate from the
 * stored expression, or that uses the wrong contractual operand, is a mistake.
 * Computed is never certified.
 */

import { fixtureInputResolver } from "../runtime/input-resolver";
import { evaluateLeverageOrCoverageRatio } from "../runtime/leverage-ratio";
import { subtract, toCanonicalString } from "../runtime/decimal";
import type { MetricInput } from "../runtime/types";
import type { ComputationMistake, ComputationPackage, ComputationResult } from "./types";
import { canonicalOf, parseCanonical } from "./ratios";
import { citedIn, millionsToUsd } from "./text";

export function verifyComputation(args: {
  pkg: ComputationPackage;
  result: ComputationResult;
  metrics: readonly MetricInput[];
}): ComputationMistake[] {
  const mistakes: ComputationMistake[] = [];
  if (args.result.certification !== "COMPUTED_NOT_CERTIFIED") {
    mistakes.push({
      stableKey: args.pkg.packageKey,
      message: "Computation claimed a certification status other than COMPUTED_NOT_CERTIFIED.",
      evidence: { certification: args.result.certification },
    });
  }

  for (const ratio of args.result.ratios) {
    if (ratio.certification !== "COMPUTED_NOT_CERTIFIED") {
      mistakes.push({ stableKey: ratio.stableKey, message: "Ratio row is not marked COMPUTED_NOT_CERTIFIED.", evidence: {} });
    }
    if (ratio.refusedReported && ratio.canonical === ratio.refusedReported.canonical) {
      mistakes.push({
        stableKey: ratio.stableKey,
        message: "A certificate-reported ratio was used as the contract calculation.",
        evidence: { reported: ratio.refusedReported.canonical },
      });
    }
    for (const cite of [...ratio.numerator, ...ratio.denominator]) {
      const doc = args.pkg.documents.find((d) => d.documentId === cite.sourceDocumentId);
      if (!doc || !citedIn(doc.text, cite.citationExcerpt)) {
        mistakes.push({
          stableKey: ratio.stableKey,
          message: `Operand citation does not bind: ${cite.metricName}.`,
          evidence: { metricName: cite.metricName },
        });
      }
    }
    if (ratio.definitionExcerpt && ratio.definitionDocumentId) {
      const doc = args.pkg.documents.find((d) => d.documentId === ratio.definitionDocumentId);
      if (!doc || !citedIn(doc.text, ratio.definitionExcerpt)) {
        mistakes.push({
          stableKey: ratio.stableKey,
          message: "Ratio definition excerpt is not in the cited document.",
          evidence: {},
        });
      }
    }
    if (ratio.ratioKey === "FIXED_CHARGE_COVERAGE" && ratio.status === "COMPUTED") {
      const den = ratio.denominator.map((d) => d.metricName.toLowerCase());
      if (!den.some((n) => n.includes("fixed charge")) || den.some((n) => n.includes("interest"))) {
        mistakes.push({
          stableKey: ratio.stableKey,
          message: "Fixed charge coverage used an interest-expense denominator.",
          evidence: { denominator: ratio.denominator.map((d) => d.metricName) },
        });
      }
    }
    if (ratio.ratioKey.startsWith("FIRST_LIEN") && ratio.status === "COMPUTED") {
      const used = [...ratio.numerator, ...ratio.denominator].map((d) => d.metricName.toLowerCase());
      if (!used.some((n) => n.includes("first lien"))) {
        mistakes.push({
          stableKey: ratio.stableKey,
          message: "First-lien ratio was computed without a first-lien input.",
          evidence: { inputs: used },
        });
      }
    }
    if (ratio.status !== "COMPUTED" || !ratio.expression || !ratio.canonical) continue;
    const replay = evaluateLeverageOrCoverageRatio({
      expression: ratio.expression,
      ratioKind: ratio.ratioKey.includes("COVERAGE") ? "COVERAGE" : "LEVERAGE",
      inputs: fixtureInputResolver({ metrics: [...args.metrics] }),
      context: { companyId: args.pkg.companyId, instrumentKey: args.pkg.instrumentKey, asOf: args.pkg.asOf },
    });
    const replayCanonical = canonicalOf(replay.value);
    if (replay.status !== "EXECUTABLE" || replayCanonical !== ratio.canonical) {
      mistakes.push({
        stableKey: ratio.stableKey,
        message: "Replayed ratio does not match the published canonical value.",
        evidence: { published: ratio.canonical, replay: replayCanonical },
      });
    }
    for (const threshold of ratio.thresholds) {
      if (threshold.headroomStatus !== "COMPUTED" || !threshold.headroomCanonical) continue;
      const actual = parseCanonical(ratio.canonical);
      const limit = parseCanonical(threshold.canonical);
      const expected = toCanonicalString(threshold.direction === "MAX" ? subtract(limit, actual) : subtract(actual, limit));
      if (expected !== threshold.headroomCanonical) {
        mistakes.push({
          stableKey: ratio.stableKey,
          message: "Headroom does not match threshold and actual.",
          evidence: { expected, published: threshold.headroomCanonical },
        });
      }
      const doc = args.pkg.documents.find((d) => d.documentId === threshold.sourceDocumentId);
      if (!doc || !citedIn(doc.text, threshold.citationExcerpt)) {
        mistakes.push({
          stableKey: ratio.stableKey,
          message: "Threshold citation does not bind.",
          evidence: { sectionRef: threshold.sectionRef },
        });
      }
    }
  }

  for (const basket of args.result.baskets) {
    if (basket.remainingStatus === "COMPUTED") {
      mistakes.push({
        stableKey: basket.stableKey,
        message: "Remaining capacity was published without a bound usage ledger.",
        evidence: {},
      });
    }
    if (basket.capStatus === "COMPUTED" && basket.capCanonical && basket.citationExcerpt) {
      if (basket.capKind === "AMOUNT" && !capCited(basket.citationExcerpt, basket.capCanonical)) {
        mistakes.push({
          stableKey: basket.stableKey,
          message: "Gross cap digits are not in the operative text.",
          evidence: { cap: basket.capCanonical },
        });
      }
    }
  }

  for (const omission of args.result.omissions) {
    if (omission.capCanonical !== null || omission.status !== "NEEDS_INPUT") {
      mistakes.push({
        stableKey: omission.stableKey,
        message: "An omitted covenant was given a number.",
        evidence: {},
      });
    }
  }

  return mistakes;
}

function capCited(excerpt: string, canonical: string): boolean {
  const digits = canonical.replace(/[^0-9]/g, "");
  if (!digits) return true;
  if (excerpt.replace(/[^0-9]/g, "").includes(digits)) return true;
  const millions = excerpt.matchAll(/\$\s*([\d,]+(?:\.\d+)?)\s+million\b/gi);
  for (const match of millions) {
    const token = match[1]!.replace(/,/g, "");
    if (millionsToUsd(token) === digits) return true;
  }
  // A greater-of product is not written out; the limbs are. The golden test checks the product.
  return /\bgreater\s+of\b/i.test(excerpt) && /\d+(?:\.\d+)?\s*%/.test(excerpt);
}
