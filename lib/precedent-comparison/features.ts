/**
 * Drafting-feature profiles — wraps existing SemanticSignals and adds
 * comparison-specific, source-evidence-backed feature flags.
 */
import type { SemanticSignals } from "../contract-model/evaluation-v2/types";
import { signalsForProvision, normalizeText } from "./knowledge";
import type { DraftingFeature, DraftingFeatureProfile, PrecedentProvision } from "./types";

function evidence(re: RegExp, text: string): string | null {
  const m = text.match(re);
  return m ? m[0] : null;
}

export function detectDraftingFeatures(sourceText: string, signals?: SemanticSignals): {
  features: DraftingFeature[];
  featureEvidence: Partial<Record<DraftingFeature, string>>;
  signals: SemanticSignals;
} {
  const text = normalizeText(sourceText);
  const sig = signals ?? signalsForProvision(text);
  const featureEvidence: Partial<Record<DraftingFeature, string>> = {};
  const features = new Set<DraftingFeature>();

  const add = (f: DraftingFeature, ev: string | null | undefined) => {
    if (!ev) return;
    features.add(f);
    featureEvidence[f] = ev;
  };

  if (sig.capStructure === "GREATER_OF") add("GREATER_OF_BASKET", evidence(/\bgreater of\b/i, text));
  if (sig.capStructure === "LESSER_OF") add("LESSER_OF_BASKET", evidence(/\bless(?:er)? of\b/i, text));
  if (sig.amounts.length > 0 && sig.capStructure === "SINGLE") {
    add("FLAT_DOLLAR_CAP", sig.amounts[0]?.raw ?? "amount");
  }
  if (sig.percentages.length > 0 || sig.metrics.length > 0) {
    const pct = evidence(/\b\d+(?:\.\d+)?\s?%\s+of\b/i, text);
    if (pct) add("PERCENT_OF_METRIC", pct);
  }
  if (sig.ratios.length > 0 || sig.metrics.some((m) => m.includes("LEVERAGE") || m.includes("COVERAGE"))) {
    add("RATIO_GATE", sig.ratios[0]?.raw ?? evidence(/\b\d+(?:\.\d+)?\s*(?:to|:)\s*\d+/i, text) ?? "ratio");
  }
  if (/\bunlimited\b/i.test(text) && (/\bratio\b/i.test(text) || /\bso long as\b/i.test(text))) {
    add("UNLIMITED_WHEN_RATIO_MET", evidence(/\bunlimited\b.{0,80}\b(ratio|so long as)\b|\b(so long as|ratio).{0,80}\bunlimited\b/i, text) ?? "unlimited + ratio");
  }
  if (sig.capSharing) add("SHARED_CAPACITY", evidence(/\bshared with\b|\btogether with (any )?amounts\b|\bin reliance on\b|\bshared (basket|cap|capacity)\b|\baggregate(d)? with\b/i, text) ?? "shared capacity");
  if (sig.reclassification) add("RECLASSIFICATION_RIGHT", evidence(/\breclassif\w*\b|\bdivide and classify\b|\bredesignat\w*\b/i, text) ?? "reclassification");
  if (sig.builderGrower) add("BUILDER_GROWER", evidence(/\bavailable amount\b|\bbuilder basket\b|\bcumulative (credit|amount)\b|\bgrower\b/i, text) ?? "builder/grower");
  add("PROVISO", evidence(/\bprovided(?:\s*,?\s*that|\s+further)\b/i, text));
  add("NOTWITHSTANDING", evidence(/\bnotwithstanding\b/i, text));
  if (sig.exceptions.includes("EXCEPT_AS_PERMITTED_ELSEWHERE") || /\bexcept\b/i.test(text)) {
    add("EXCEPT_AS_PERMITTED", evidence(/\bexcept\b/i, text) ?? "except");
  }
  if (sig.conditions.includes("NO_DEFAULT") || /\bno\s+(?:Event of )?Default\b/i.test(text)) {
    add("NO_DEFAULT_CONDITION", evidence(/\bno\s+(?:Event of )?Default\b/i, text) ?? "no default");
  }
  if (sig.conditions.includes("PRO_FORMA_COMPLIANCE") || /\bpro\s+forma\b/i.test(text)) {
    add("PRO_FORMA_COMPLIANCE", evidence(/\bpro\s+forma\b/i, text) ?? "pro forma");
  }
  add("BORROWER_SCOPE", evidence(/\b(?:Parent )?Borrower\b/i, text));
  add("GUARANTOR_SCOPE", evidence(/\bGuarantor\b|\bSubsidiary Guarantor\b|\bLoan Party\b/i, text));
  add("RESTRICTED_SUBSIDIARY_SCOPE", evidence(/\bRestricted Subsidiar(?:y|ies)\b/i, text));
  add("NON_GUARANTOR_SCOPE", evidence(/\bnon[- ]Guarantor\b|\bnot a (?:Loan Party|Guarantor)\b|\bRestricted Subsidiary that is not a Loan Party\b/i, text));
  if (sig.metrics.includes("EBITDA") || /\bEBITDA\b/i.test(text)) {
    add("EBITDA_METRIC", evidence(/\b(?:Consolidated\s+)?(?:Adjusted\s+)?EBITDA\b/i, text) ?? "EBITDA");
  }
  if (
    sig.metrics.some((m) => m.includes("LEVERAGE")) ||
    /\b(?:Total|Senior|Secured|First Lien).{0,20}Leverage Ratio\b/i.test(text)
  ) {
    add("LEVERAGE_RATIO_METRIC", evidence(/\b(?:Total|Senior|Secured|First Lien|Consolidated).{0,40}Leverage Ratio\b/i, text) ?? "leverage ratio");
  }
  if (sig.stepChange === "STEP_UP") add("STEP_UP", evidence(/\bstep[- ]?up\b|\bshall increase to\b/i, text) ?? "step-up");
  if (sig.stepChange === "STEP_DOWN") add("STEP_DOWN", evidence(/\bstep[- ]?down\b/i, text) ?? "step-down");
  if (sig.exceptions.includes("INTERCOMPANY_CARVEOUT") || /\bintercompany\b/i.test(text)) {
    add("INTERCOMPANY_CARVEOUT", evidence(/\bintercompany\b/i, text) ?? "intercompany");
  }
  if (sig.exceptions.includes("ORDINARY_COURSE") || /\bordinary course\b/i.test(text)) {
    add("ORDINARY_COURSE_CARVEOUT", evidence(/\bordinary course\b/i, text) ?? "ordinary course");
  }
  if (
    /\b(?:subordinated|junior|Restricted Debt|Permitted Subordinated|Permitted Unsecured).{0,60}(?:prepay|payment|redeem|repurchase)/i.test(text) ||
    /\b(?:prepay|payment|redeem|repurchase).{0,60}(?:subordinated|junior|Restricted Debt|Permitted Subordinated)/i.test(text) ||
    /\bOptional Payments?\b/i.test(text)
  ) {
    add(
      "JUNIOR_DEBT_PREPAYMENT",
      evidence(
        /\b(?:subordinated|junior|Restricted Debt|Permitted Subordinated|Optional Payments?).{0,80}/i,
        text,
      ) ?? "junior/subordinated debt payment",
    );
  }

  return { features: [...features].sort(), featureEvidence, signals: sig };
}

export function profileProvision(provision: PrecedentProvision): DraftingFeatureProfile {
  const hints = [provision.covenantFamily, ...provision.tags, provision.locator.sourceSectionRef];
  const detected = detectDraftingFeatures(provision.sourceText, signalsForProvision(provision.sourceText, hints));
  return {
    provisionId: provision.provisionId,
    features: detected.features,
    signals: detected.signals,
    featureEvidence: detected.featureEvidence,
  };
}

export function featureOverlap(a: DraftingFeature[], b: DraftingFeature[]): {
  shared: DraftingFeature[];
  leftOnly: DraftingFeature[];
  rightOnly: DraftingFeature[];
} {
  const setA = new Set(a);
  const setB = new Set(b);
  const shared = a.filter((f) => setB.has(f));
  const leftOnly = a.filter((f) => !setB.has(f));
  const rightOnly = b.filter((f) => !setA.has(f));
  return { shared, leftOnly, rightOnly };
}
