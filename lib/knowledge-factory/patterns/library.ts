/**
 * Searchable drafting-pattern library.
 * A drafting pattern is NOT automatically an executable legal rule.
 */

import type { PatternLibraryEntry } from "../types";

export const PATTERN_LIBRARY_VERSION = "covenant-patterns.v1";

export const SEED_PATTERNS: PatternLibraryEntry[] = [
  {
    patternId: "fixed-dollar-basket",
    name: "Fixed-dollar basket",
    structuralCharacteristics: ["dollar amount", "permission/exception clause", "often capped"],
    supportedSemanticHypotheses: ["fixed capacity quantum"],
    counterexamples: ["ratio-only baskets with no dollar floor"],
    knownFailureModes: ["confusing thresholds with permissions"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "greater-of-basket",
    name: "Greater-of basket",
    structuralCharacteristics: ["greater of", "dollar amount", "percentage of EBITDA/assets"],
    supportedSemanticHypotheses: ["max of fixed and growth component"],
    counterexamples: ["lesser-of constructions"],
    knownFailureModes: ["misreading comparator direction"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "ratio-basket",
    name: "Ratio basket",
    structuralCharacteristics: ["leverage/coverage ratio test", "pro forma language"],
    supportedSemanticHypotheses: ["ratio-conditioned permission"],
    counterexamples: ["maintenance covenants without permission effect"],
    knownFailureModes: ["confusing maintenance tests with incurrence permissions"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "builder-basket",
    name: "Builder basket",
    structuralCharacteristics: ["Available Amount / Cumulative Credit", "starter amount", "builder components"],
    supportedSemanticHypotheses: ["accumulating capacity"],
    counterexamples: ["one-time fixed baskets"],
    knownFailureModes: ["missing shared-cap interactions"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "general-debt-basket",
    name: "General debt basket",
    structuralCharacteristics: ["catch-all indebtedness exception", "often dollar/greater-of"],
    supportedSemanticHypotheses: ["residual debt capacity"],
    counterexamples: ["category-specific acquisition debt only"],
    knownFailureModes: ["over-attributing general basket to specific categories"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
  {
    patternId: "purchase-money-debt",
    name: "Purchase-money debt",
    structuralCharacteristics: ["purchase money", "capital lease", "acquired asset financing"],
    supportedSemanticHypotheses: ["asset-linked debt permission"],
    counterexamples: ["general unsecured debt"],
    knownFailureModes: ["entity-scope misidentification"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
  {
    patternId: "acquisition-debt",
    name: "Acquisition debt",
    structuralCharacteristics: ["acquired indebtedness", "permitted acquisition financing"],
    supportedSemanticHypotheses: ["acquisition-conditioned debt"],
    counterexamples: ["ordinary working-capital debt"],
    knownFailureModes: ["missing conditions precedent"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
  {
    patternId: "refinancing-debt",
    name: "Refinancing debt",
    structuralCharacteristics: ["refinance/refund/replace", "principal not increased beyond permitted cushion"],
    supportedSemanticHypotheses: ["refinancing permission"],
    counterexamples: ["new-money incremental facilities"],
    knownFailureModes: ["ignoring maturity/priority constraints"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
  {
    patternId: "incremental-equivalent-debt",
    name: "Incremental equivalent debt",
    structuralCharacteristics: ["Incremental Equivalent Debt", "shares incremental cap"],
    supportedSemanticHypotheses: ["shared incremental capacity"],
    counterexamples: ["standalone general debt basket"],
    knownFailureModes: ["missing shared caps with Incremental Facilities"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "permitted-liens",
    name: "Permitted liens",
    structuralCharacteristics: ["Permitted Liens definition or schedule of exceptions"],
    supportedSemanticHypotheses: ["lien exception catalog"],
    counterexamples: ["negative pledge without enumerated exceptions"],
    knownFailureModes: ["treating definition list as operative permission without parent covenant"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "restricted-payment-builder",
    name: "Restricted-payment builder",
    structuralCharacteristics: ["RP builder", "Available Amount usage for dividends/buybacks"],
    supportedSemanticHypotheses: ["RP capacity from builder"],
    counterexamples: ["ratio-only RP baskets"],
    knownFailureModes: ["shared capacity with investments/junior debt missed"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "asset-sale-reinvestment",
    name: "Asset-sale reinvestment",
    structuralCharacteristics: ["reinvestment right", "time window", "prepayment alternative"],
    supportedSemanticHypotheses: ["conditional prepayment deferral"],
    counterexamples: ["mandatory prepay with no reinvestment"],
    knownFailureModes: ["misparenting reinvestment exceptions"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
  {
    patternId: "no-default-condition",
    name: "No-default condition",
    structuralCharacteristics: ["no Default / no Event of Default condition on permission"],
    supportedSemanticHypotheses: ["permission gated on default status"],
    counterexamples: ["unconditional baskets"],
    knownFailureModes: ["missing condition attachment"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "pro-forma-compliance",
    name: "Pro forma compliance",
    structuralCharacteristics: ["pro forma", "as if transaction occurred", "ratio compliance"],
    supportedSemanticHypotheses: ["pro forma ratio gate"],
    counterexamples: ["historical-ratio-only tests"],
    knownFailureModes: ["wrong measurement date assumptions"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "shared-capacity",
    name: "Shared capacity",
    structuralCharacteristics: ["aggregate/combined/shared basket language across categories"],
    supportedSemanticHypotheses: ["cross-category capacity sharing"],
    counterexamples: ["independent siloed baskets"],
    knownFailureModes: ["under-detecting shared caps"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "reclassification",
    name: "Reclassification",
    structuralCharacteristics: ["reclassify", "deemed incurred under", "redesignate basket usage"],
    supportedSemanticHypotheses: ["basket reclassification right"],
    counterexamples: ["static basket allocation"],
    knownFailureModes: ["unusual reclassification provisions missed"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
  {
    patternId: "conditional-amendment-effectiveness",
    name: "Conditional amendment effectiveness",
    structuralCharacteristics: ["amendment effective upon", "conditions precedent", "consent thresholds"],
    supportedSemanticHypotheses: ["conditional effectiveness"],
    counterexamples: ["immediately effective amendments"],
    knownFailureModes: ["inferring legal effectiveness from filing chronology alone"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
  {
    patternId: "ratio-lien",
    name: "Ratio lien permission",
    structuralCharacteristics: ["Permitted Lien", "leverage / secured leverage ratio", "pro forma"],
    supportedSemanticHypotheses: ["ratio-conditioned lien capacity"],
    counterexamples: ["fixed-dollar lien baskets only"],
    knownFailureModes: ["treating ratio debt permission as automatic lien permission"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "available-amount-definition",
    name: "Available Amount definition",
    structuralCharacteristics: ["Available Amount means", "starter", "builder components", "reductions for usage"],
    supportedSemanticHypotheses: ["definitional builder capacity"],
    counterexamples: ["fixed RP basket with no builder"],
    knownFailureModes: ["missing reduction for prior RP/investments"],
    verificationStatus: "STRUCTURALLY_OBSERVED",
    sourceExampleIds: [],
  },
  {
    patternId: "subsidiary-designation",
    name: "Subsidiary designation mechanics",
    structuralCharacteristics: ["designate Unrestricted Subsidiary", "redesignate Restricted Subsidiary", "investment capacity for designation"],
    supportedSemanticHypotheses: ["entity-status election with investment implications"],
    counterexamples: ["static restricted group with no designation rights"],
    knownFailureModes: ["ignoring investment cost of designation"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
  {
    patternId: "financial-covenant-cure",
    name: "Financial covenant equity cure",
    structuralCharacteristics: ["cure", "equity contribution", "EBITDA add-back for cure", "limited number of cures"],
    supportedSemanticHypotheses: ["maintenance-covenant cure right"],
    counterexamples: ["incurrence-only covenants with no cure"],
    knownFailureModes: ["assuming cure available without contractual grant"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
  {
    patternId: "liability-management",
    name: "Liability management / debt exchange",
    structuralCharacteristics: ["exchange offer", "open market purchase", "debt repurchase", "refinancing with different creditors"],
    supportedSemanticHypotheses: ["LME pathway under refinancing / RP / investment rules"],
    counterexamples: ["ordinary scheduled amortization"],
    knownFailureModes: ["missing concurrent lien and RP analysis"],
    verificationStatus: "UNVERIFIED",
    sourceExampleIds: [],
  },
];

const PATTERN_DETECT: { patternId: string; re: RegExp }[] = [
  { patternId: "greater-of-basket", re: /\bgreater of\b/i },
  { patternId: "ratio-basket", re: /\b(?:Leverage|Coverage)\s+Ratio\b/i },
  { patternId: "builder-basket", re: /\bAvailable\s+Amount\b|\bbuilder\s+basket\b/i },
  // A bare dollar amount is not a basket (purchase prices, fees, thresholds
  // all carry dollar amounts). Require permission/exception language within
  // 240 chars on either side — the pattern's own structural characteristic.
  {
    patternId: "fixed-dollar-basket",
    re: /(?:\bexcept\b|\bpermitted\b)[\s\S]{0,240}\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?|\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?[\s\S]{0,240}(?:\bexcept\b|\bpermitted\b)/i,
  },
  { patternId: "incremental-equivalent-debt", re: /\bIncremental\s+Equivalent\s+Debt\b/i },
  { patternId: "permitted-liens", re: /\bPermitted\s+Liens?\b/i },
  { patternId: "restricted-payment-builder", re: /\bRestricted\s+Payments?\b[\s\S]{0,200}\bAvailable\s+Amount\b/i },
  // "Reinvest" alone is generic (R&D, profits). Require asset-sale context
  // on either side: asset / sale / proceeds / prepay.
  {
    patternId: "asset-sale-reinvestment",
    re: /(?:\basset\b|\bsale\b|\bproceeds\b|\bprepay\w*\b)[\s\S]{0,120}\breinvest\w*|\breinvest\w*[\s\S]{0,120}(?:\basset\b|\bsale\b|\bproceeds\b|\bprepay\w*)/i,
  },
  { patternId: "no-default-condition", re: /\bno\s+(?:Default|Event of Default)\b/i },
  { patternId: "pro-forma-compliance", re: /\bpro\s+forma\s+compliance\b/i },
  // "Aggregate principal amount" is the standard phrasing of a SINGLE
  // siloed basket — the old "aggregate(d) amount" branch fired on nearly
  // every basket clause and labeled it shared capacity. Shared capacity
  // requires "shared"/"combined" language, or "in the aggregate" with
  // cross-category language.
  {
    patternId: "shared-capacity",
    re: /\b(?:shared|combined)\s+(?:basket|capacity|amount)\b|\bin the aggregate\b[\s\S]{0,120}\b(?:across|together|combined)\b/i,
  },
  // Accounting reclassification ("reclassified prior period amounts")
  // is not basket reclassification. Require basket/incurred/deemed context.
  {
    patternId: "reclassification",
    re: /\breclassif\w*\b[\s\S]{0,120}\b(?:basket|incurred|deemed)\b/i,
  },
  // "Refinancing risk" in risk factors is not a refinancing permission.
  // Require a debt noun nearby.
  {
    patternId: "refinancing-debt",
    re: /\brefinanc\w*\b[\s\S]{0,120}\b(?:indebtedness|debt|notes|loans|facility)\b/i,
  },
  { patternId: "purchase-money-debt", re: /\bpurchase\s+money\b/i },
  { patternId: "acquisition-debt", re: /\bacquisition\s+(?:debt|indebtedness)\b|\bAcquired\s+Indebtedness\b/i },
  { patternId: "general-debt-basket", re: /\bother\s+Indebtedness\b|\bgeneral\s+(?:debt|basket)\b/i },
  { patternId: "conditional-amendment-effectiveness", re: /\bshall\s+become\s+effective\s+(?:upon|on)\b/i },
  { patternId: "ratio-lien", re: /\bPermitted\s+Liens?\b[\s\S]{0,240}\b(?:Secured\s+)?(?:Net\s+)?Leverage\s+Ratio\b/i },
  { patternId: "available-amount-definition", re: /\bAvailable\s+Amount\s+means\b/i },
  { patternId: "subsidiary-designation", re: /\b(?:designate|designat(?:ion|ed))\b[\s\S]{0,80}\bUnrestricted\s+Subsidiary\b/i },
  // A default cure period ("30 days to cure such Default") is not an
  // equity cure. Require equity / contribution / add-back language nearby.
  {
    patternId: "financial-covenant-cure",
    re: /\bcure\b[\s\S]{0,160}\b(?:equity|contribution|add-?back)\b/i,
  },
  { patternId: "liability-management", re: /\b(?:exchange\s+offer|open[\s-]market\s+purchase|debt\s+repurchase|liability\s+management)\b/i },
];

export function detectPatternsInText(text: string): string[] {
  return PATTERN_DETECT.filter((p) => p.re.test(text)).map((p) => p.patternId);
}

export function getPattern(patternId: string): PatternLibraryEntry | undefined {
  return SEED_PATTERNS.find((p) => p.patternId === patternId);
}

export function allPatterns(): PatternLibraryEntry[] {
  return SEED_PATTERNS;
}
