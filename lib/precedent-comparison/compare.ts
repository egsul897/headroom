/**
 * Source-backed pairwise precedent comparison (Phase 2).
 *
 * Emits stratified claims with explicit evidence. Never upgrades a heuristic
 * summary to reviewed precedent. REVIEWER_VERIFIED_CONCLUSION requires a
 * ClaimReviewRecord bound to claimId + sourceVersionHash.
 */
import { asymmetricPhraseDiff, exactTextDiff } from "./diff";
import { applyClaimReviews, evidenceFromExcerpts, makeClaim, maxStandingAmongClaims } from "./epistemic";
import { featureOverlap, profileProvision } from "./features";
import { shortHash } from "./hash";
import type { ClaimReviewRecord, PrecedentComparisonRecord, PrecedentProvision } from "./types";
import { COMPARISON_DISCLAIMER, PRECEDENT_COMPARISON_SCHEMA_VERSION, STANDING_ROLLUP_NOTE } from "./types";

function comparisonId(leftId: string, rightId: string, leftHash: string, rightHash: string): string {
  const [a, b] = [`${leftId}:${leftHash}`, `${rightId}:${rightHash}`].sort();
  return `cmp_${shortHash(`${a}|${b}`, 16)}`;
}

export interface CompareOptions {
  /** Optional claim-level reviews to apply after automatic claim generation. */
  claimReviews?: ClaimReviewRecord[];
  /**
   * Optional definition overlays supplied by the caller (not inferred by the engine).
   * Used to surface missing/divergent controlling definitions as qualified DEPENDENCY claims.
   */
  definitionOverlays?: { left: string | null; right: string | null };
  /** Force qualification (e.g. Atlas/Encyclopedia unavailable). */
  forceQualifiedReasons?: string[];
}

export function compareProvisions(
  left: PrecedentProvision,
  right: PrecedentProvision,
  options: CompareOptions = {},
): PrecedentComparisonRecord {
  const leftFeatures = profileProvision(left);
  const rightFeatures = profileProvision(right);
  const overlap = featureOverlap(leftFeatures.features, rightFeatures.features);
  const textual = exactTextDiff(left.provisionId, left.sourceText, right.provisionId, right.sourceText);
  const phrases = asymmetricPhraseDiff(left.sourceText, right.sourceText);
  const cmpId = comparisonId(left.provisionId, right.provisionId, left.sourceVersionHash, right.sourceVersionHash);

  const ex = (p: PrecedentProvision, excerpt: string) => ({
    provisionId: p.provisionId,
    excerpt,
    sourceVersionHash: p.sourceVersionHash,
  });

  const claims = [
    makeClaim({
      standing: "TEXTUAL_SIMILARITY",
      dimension: "TEXT",
      summary: textual.identical
        ? "Source texts are identical after whitespace normalization."
        : `Token Jaccard similarity is ${textual.tokenJaccard.toFixed(3)} via ${textual.algorithm}; texts are not identical.`,
      evidence: evidenceFromExcerpts(
        [ex(left, left.sourceText.slice(0, 180)), ex(right, right.sourceText.slice(0, 180))],
        `algorithm=${textual.algorithm}; jaccard=${textual.tokenJaccard.toFixed(3)}; bounded=${textual.bounded}`,
        ["tokenJaccard"],
      ),
    }),
  ];

  if (overlap.shared.length > 0) {
    claims.push(
      makeClaim({
        standing: "STRUCTURAL_SIMILARITY",
        dimension: "STRUCTURE",
        summary: `Shared drafting features: ${overlap.shared.join(", ")}. Structural similarity is not identical legal effect.`,
        evidence: evidenceFromExcerpts(
          overlap.shared.slice(0, 4).map((f) =>
            ex(
              leftFeatures.featureEvidence[f] ? left : right,
              leftFeatures.featureEvidence[f] ?? rightFeatures.featureEvidence[f] ?? f,
            ),
          ),
          `shared features: ${overlap.shared.join(",")}`,
          overlap.shared,
        ),
      }),
    );
  }

  if (overlap.leftOnly.length > 0 || overlap.rightOnly.length > 0) {
    claims.push(
      makeClaim({
        standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        dimension: "STRUCTURE",
        summary: `Drafting-feature divergence — left-only: [${overlap.leftOnly.join(", ") || "none"}]; right-only: [${overlap.rightOnly.join(", ") || "none"}].`,
        evidence: evidenceFromExcerpts(
          [
            ...overlap.leftOnly.slice(0, 3).map((f) => ex(left, leftFeatures.featureEvidence[f] ?? f)),
            ...overlap.rightOnly.slice(0, 3).map((f) => ex(right, rightFeatures.featureEvidence[f] ?? f)),
          ],
          "feature presence differs in cited source excerpts",
          [...overlap.leftOnly, ...overlap.rightOnly],
        ),
        featuresOnlyIn: { left: overlap.leftOnly, right: overlap.rightOnly },
      }),
    );
  }

  for (const excerpt of phrases.onlyLeft) {
    claims.push(
      makeClaim({
        standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        dimension: /provided/i.test(excerpt) ? "PROVISOS" : /except/i.test(excerpt) ? "EXCEPTIONS" : "CONDITIONS",
        summary: "Additional condition/proviso/exception language appears in the left provision and was not matched on the right.",
        evidence: evidenceFromExcerpts([ex(left, excerpt)], "asymmetric phrase present only on left"),
      }),
    );
  }
  for (const excerpt of phrases.onlyRight) {
    claims.push(
      makeClaim({
        standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        dimension: /provided/i.test(excerpt) ? "PROVISOS" : /except/i.test(excerpt) ? "EXCEPTIONS" : "CONDITIONS",
        summary: "Additional condition/proviso/exception language appears in the right provision and was not matched on the left.",
        evidence: evidenceFromExcerpts([ex(right, excerpt)], "asymmetric phrase present only on right"),
      }),
    );
  }

  const scopeFeatures = ["BORROWER_SCOPE", "GUARANTOR_SCOPE", "RESTRICTED_SUBSIDIARY_SCOPE", "NON_GUARANTOR_SCOPE"] as const;
  const leftScope = scopeFeatures.filter((f) => leftFeatures.features.includes(f));
  const rightScope = scopeFeatures.filter((f) => rightFeatures.features.includes(f));
  const scopeOverlap = featureOverlap([...leftScope], [...rightScope]);
  if (scopeOverlap.leftOnly.length > 0 || scopeOverlap.rightOnly.length > 0) {
    claims.push(
      makeClaim({
        standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        dimension: "SCOPE",
        summary: `Entity-scope drafting differs. Left: [${leftScope.join(", ") || "none"}]; right: [${rightScope.join(", ") || "none"}].`,
        evidence: evidenceFromExcerpts(
          [
            ...scopeOverlap.leftOnly.map((f) => ex(left, leftFeatures.featureEvidence[f] ?? f)),
            ...scopeOverlap.rightOnly.map((f) => ex(right, rightFeatures.featureEvidence[f] ?? f)),
          ],
          "scope markers diverge in source",
          [...scopeOverlap.leftOnly, ...scopeOverlap.rightOnly],
        ),
        featuresOnlyIn: { left: [...scopeOverlap.leftOnly], right: [...scopeOverlap.rightOnly] },
      }),
    );
  }

  for (const f of ["SHARED_CAPACITY", "RECLASSIFICATION_RIGHT"] as const) {
    const inL = leftFeatures.features.includes(f);
    const inR = rightFeatures.features.includes(f);
    if (inL !== inR) {
      claims.push(
        makeClaim({
          standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
          dimension: f === "SHARED_CAPACITY" ? "SHARED_CAPACITY" : "RECLASSIFICATION",
          summary: `${f} is present in the ${inL ? "left" : "right"} provision and absent in the other.`,
          evidence: evidenceFromExcerpts(
            [ex(inL ? left : right, (inL ? leftFeatures : rightFeatures).featureEvidence[f] ?? f)],
            `${f} asymmetry in source`,
            [f],
          ),
          featuresOnlyIn: { left: inL ? [f] : [], right: inR ? [f] : [] },
        }),
      );
    } else if (inL && inR) {
      claims.push(
        makeClaim({
          standing: "STRUCTURAL_SIMILARITY",
          dimension: f === "SHARED_CAPACITY" ? "SHARED_CAPACITY" : "RECLASSIFICATION",
          summary: `Both provisions draft ${f}. Shared feature presence is not proof of identical mechanics.`,
          evidence: evidenceFromExcerpts(
            [ex(left, leftFeatures.featureEvidence[f] ?? f), ex(right, rightFeatures.featureEvidence[f] ?? f)],
            `both sides contain ${f}`,
            [f],
          ),
        }),
      );
    }
  }

  if (
    left.covenantFamily === "DEFINITIONS_CALCULATION_RULES" ||
    right.covenantFamily === "DEFINITIONS_CALCULATION_RULES" ||
    leftFeatures.features.includes("EBITDA_METRIC") ||
    rightFeatures.features.includes("EBITDA_METRIC")
  ) {
    const econLeft = leftFeatures.features.filter((f) =>
      f === "EBITDA_METRIC" || f === "LEVERAGE_RATIO_METRIC" || f === "STEP_UP" || f === "STEP_DOWN",
    );
    const econRight = rightFeatures.features.filter((f) =>
      f === "EBITDA_METRIC" || f === "LEVERAGE_RATIO_METRIC" || f === "STEP_UP" || f === "STEP_DOWN",
    );
    const econ = featureOverlap(econLeft, econRight);
    if (econ.leftOnly.length || econ.rightOnly.length || econ.shared.length) {
      claims.push(
        makeClaim({
          standing: econ.leftOnly.length || econ.rightOnly.length ? "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" : "STRUCTURAL_SIMILARITY",
          dimension: "DEFINITIONS",
          summary: `EBITDA / leverage-ratio drafting markers — shared: [${econ.shared.join(", ") || "none"}]; left-only: [${econ.leftOnly.join(", ") || "none"}]; right-only: [${econ.rightOnly.join(", ") || "none"}].`,
          evidence: evidenceFromExcerpts(
            [ex(left, left.sourceText.slice(0, 160)), ex(right, right.sourceText.slice(0, 160))],
            "definition/metric marker comparison from source excerpts",
            [...econ.shared, ...econ.leftOnly, ...econ.rightOnly],
          ),
          featuresOnlyIn: { left: econ.leftOnly, right: econ.rightOnly },
        }),
      );
    }
  }

  // Numeric / ratio threshold asymmetries (source-backed economics).
  const moneyRe = /\$\s?[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?|\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*(?:to\s*)?1\.0{0,2}\b|\b\d+(?:\.\d+)?x\b/gi;
  const leftMoney = [...left.sourceText.matchAll(moneyRe)].map((m) => m[0]!.replace(/\s+/g, " "));
  const rightMoney = [...right.sourceText.matchAll(moneyRe)].map((m) => m[0]!.replace(/\s+/g, " "));
  const normM = (s: string) => s.toLowerCase().replace(/,/g, "");
  const leftMSet = new Set(leftMoney.map(normM));
  const rightMSet = new Set(rightMoney.map(normM));
  const moneyOnlyLeft = leftMoney.filter((m) => !rightMSet.has(normM(m)));
  const moneyOnlyRight = rightMoney.filter((m) => !leftMSet.has(normM(m)));
  if (moneyOnlyLeft.length || moneyOnlyRight.length) {
    claims.push(
      makeClaim({
        standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        dimension: "ECONOMICS",
        summary: `Numerical thresholds differ — left-only: [${moneyOnlyLeft.slice(0, 4).join("; ") || "none"}]; right-only: [${moneyOnlyRight.slice(0, 4).join("; ") || "none"}].`,
        evidence: evidenceFromExcerpts(
          [
            ...moneyOnlyLeft.slice(0, 2).map((m) => ex(left, m)),
            ...moneyOnlyRight.slice(0, 2).map((m) => ex(right, m)),
          ],
          "dollar/ratio/percent tokens differ in source text",
          ["numeric-threshold"],
        ),
      }),
    );
  }

  if (left.documentRole !== right.documentRole || left.amendsProvisionId || right.amendsProvisionId) {
    claims.push(
      makeClaim({
        standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        dimension: "AMENDMENT",
        summary: `Amendment/version status differs (left=${left.documentRole}, right=${right.documentRole}; amends=${right.amendsProvisionId ?? left.amendsProvisionId ?? "none"}).`,
        evidence: evidenceFromExcerpts(
          [ex(left, left.sourceText.slice(0, 120)), ex(right, right.sourceText.slice(0, 160))],
          "documentRole / amendsProvisionId asymmetry from source records",
          ["amendment-status"],
        ),
      }),
    );
  }

  const qualificationReasons: string[] = [...(options.forceQualifiedReasons ?? [])];
  const overlays = options.definitionOverlays;
  if (overlays && (overlays.left || overlays.right)) {
    const lDef = overlays.left ?? "";
    const rDef = overlays.right ?? "";
    if (lDef && rDef && normalizeLoose(lDef) !== normalizeLoose(rDef)) {
      claims.push(
        makeClaim({
          standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
          dimension: "DEFINITIONS",
          summary:
            "Caller-supplied controlling definitions diverge while operative provision text may match — legal effect may differ; comparison is qualified pending definition closure.",
          evidence: evidenceFromExcerpts(
            [
              ex({ ...left, sourceText: lDef, sourceVersionHash: left.sourceVersionHash }, lDef.slice(0, 200)),
              ex({ ...right, sourceText: rDef, sourceVersionHash: right.sourceVersionHash }, rDef.slice(0, 200)),
            ],
            "definition overlays supplied by caller; not inferred by PCI",
            ["definition-overlay"],
          ),
        }),
      );
      qualificationReasons.push("controlling definitions diverge (caller overlay)");
    } else if (!lDef || !rDef) {
      claims.push(
        makeClaim({
          standing: "SEMANTIC_HYPOTHESIS",
          dimension: "DEPENDENCY",
          summary:
            "Controlling definition context is missing on at least one side — comparison is qualified; no definitive legal-effect conclusion.",
          evidence: evidenceFromExcerpts(
            [ex(left, left.sourceText.slice(0, 100)), ex(right, right.sourceText.slice(0, 100))],
            "missing definition overlay",
            ["missing-definition"],
          ),
        }),
      );
      qualificationReasons.push("missing controlling definition overlay");
    }
  }

  // Cross-document references without resolution → qualify
  const controllingTerms = [
    "Available Amount",
    "Available Equity Amount",
    "Maximum Incremental Amount",
    "Free and Clear Amount",
    "Ratio Amount",
    "Consolidated EBITDA",
    "First Lien Net Leverage",
  ];
  for (const term of controllingTerms) {
    const hit = left.sourceText.includes(term) || right.sourceText.includes(term);
    if (!hit) continue;
    const overlayCovers =
      overlays &&
      ((overlays.left && overlays.left.includes(term.split(" ")[0]!)) ||
        (overlays.right && overlays.right.includes(term.split(" ")[0]!)));
    if (!overlayCovers) {
      qualificationReasons.push(`controlling definition for "${term}" not closed in comparison inputs`);
    }
  }
  if (qualificationReasons.some((r) => r.includes("controlling definition"))) {
    claims.push(
      makeClaim({
        standing: "SEMANTIC_HYPOTHESIS",
        dimension: "DEPENDENCY",
        summary:
          "Operative text references financial/builder defined terms whose controlling definitions are not closed here — qualified comparison only; not a definitive legal conclusion.",
        evidence: evidenceFromExcerpts(
          [ex(left, left.sourceText.slice(0, 120)), ex(right, right.sourceText.slice(0, 120))],
          "missing closed definition context for builder/financial terms",
          ["unclosed-definition"],
        ),
      }),
    );
  }

  if (/\bIntercreditor Agreement\b|\bGuarantee and Collateral Agreement\b|\bCollateral Documents\b/i.test(left.sourceText + " " + right.sourceText)) {
    const leftHas = /\bIntercreditor Agreement\b|\bGuarantee and Collateral Agreement\b|\bCollateral Documents\b/i.test(left.sourceText);
    const rightHas = /\bIntercreditor Agreement\b|\bGuarantee and Collateral Agreement\b|\bCollateral Documents\b/i.test(right.sourceText);
    if (leftHas !== rightHas) {
      claims.push(
        makeClaim({
          standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
          dimension: "DEPENDENCY",
          summary: "Cross-document restriction appears on only one side; controlling instrument text is not closed in this comparison.",
          evidence: evidenceFromExcerpts(
            [ex(leftHas ? left : right, (leftHas ? left : right).sourceText.slice(0, 180))],
            "cross-document reference asymmetry",
            ["cross-document"],
          ),
        }),
      );
      qualificationReasons.push("cross-document controlling instrument not closed");
    } else {
      qualificationReasons.push("cross-document reference present — Atlas/ACR closure required for definitive conclusion");
    }
  }

  if (textual.tokenJaccard >= 0.35 && overlap.shared.length >= 2) {
    claims.push(
      makeClaim({
        standing: "SEMANTIC_HYPOTHESIS",
        dimension: "STRUCTURE",
        summary:
          "Heuristic: provisions may address a similar covenant concept, but this is an unverified semantic hypothesis — not reviewed precedent and not a legal-effect conclusion.",
        evidence: evidenceFromExcerpts(
          [ex(left, left.locator.sourceSectionRef), ex(right, right.locator.sourceSectionRef)],
          "jaccard and shared-feature heuristic only; no claim-level review",
          overlap.shared.slice(0, 5),
        ),
      }),
    );
  }

  // Provision-level APPROVED_PRECEDENT alone does NOT emit REVIEWER_VERIFIED claims.
  const reviews = options.claimReviews ?? [];
  const finalClaims = applyClaimReviews(
    claims,
    reviews,
    left.provisionId,
    right.provisionId,
    left.sourceVersionHash,
    right.sourceVersionHash,
    cmpId,
  );

  const maxStanding = maxStandingAmongClaims(finalClaims);
  const comparisonQualified = qualificationReasons.length > 0;
  return {
    comparisonId: cmpId,
    schemaVersion: PRECEDENT_COMPARISON_SCHEMA_VERSION,
    leftProvisionId: left.provisionId,
    rightProvisionId: right.provisionId,
    leftSourceVersionHash: left.sourceVersionHash,
    rightSourceVersionHash: right.sourceVersionHash,
    covenantFamily: left.covenantFamily,
    textual,
    leftFeatures,
    rightFeatures,
    structuralOverlap: overlap.shared,
    structuralDivergence: { leftOnly: overlap.leftOnly, rightOnly: overlap.rightOnly },
    claims: finalClaims,
    maxStandingAmongClaims: maxStanding,
    maxStanding,
    standingRollupNote: STANDING_ROLLUP_NOTE,
    claimReviews: reviews.filter(
      (r) =>
        r.leftProvisionId === left.provisionId &&
        r.rightProvisionId === right.provisionId &&
        r.leftSourceVersionHash === left.sourceVersionHash &&
        r.rightSourceVersionHash === right.sourceVersionHash,
    ),
    disclaimer: comparisonQualified
      ? `${COMPARISON_DISCLAIMER} QUALIFIED COMPARISON: controlling context incomplete (${qualificationReasons.join("; ")}).`
      : COMPARISON_DISCLAIMER,
    createdAt: new Date().toISOString(),
    comparisonQualified,
    qualificationReasons,
  };
}

function normalizeLoose(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
