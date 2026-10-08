/**
 * Source-backed pairwise precedent comparison.
 *
 * Emits stratified claims — never upgrades a heuristic summary to reviewed
 * precedent. REVIEWER_VERIFIED_CONCLUSION requires APPROVED_PRECEDENT status
 * with an attributable reviewedBy on at least one side.
 */
import { createHash } from "node:crypto";
import { asymmetricPhraseDiff, exactTextDiff } from "./diff";
import { featureOverlap, profileProvision } from "./features";
import type {
  ComparisonClaim,
  ComparisonStanding,
  PrecedentComparisonRecord,
  PrecedentProvision,
} from "./types";
import { COMPARISON_DISCLAIMER, PRECEDENT_COMPARISON_SCHEMA_VERSION } from "./types";

const STANDING_RANK: Record<ComparisonStanding, number> = {
  TEXTUAL_SIMILARITY: 1,
  STRUCTURAL_SIMILARITY: 2,
  SEMANTIC_HYPOTHESIS: 3,
  SOURCE_SUPPORTED_LEGAL_DIFFERENCE: 4,
  REVIEWER_VERIFIED_CONCLUSION: 5,
};

function maxStanding(claims: ComparisonClaim[]): ComparisonStanding {
  let best: ComparisonStanding = "TEXTUAL_SIMILARITY";
  for (const c of claims) {
    if (STANDING_RANK[c.standing] > STANDING_RANK[best]) best = c.standing;
  }
  return best;
}

function mayEmitReviewerVerified(left: PrecedentProvision, right: PrecedentProvision): boolean {
  const ok = (p: PrecedentProvision) => p.reviewStatus === "APPROVED_PRECEDENT" && !!p.reviewedBy;
  return ok(left) || ok(right);
}

function comparisonId(leftId: string, rightId: string): string {
  const [a, b] = [leftId, rightId].sort();
  return `cmp_${createHash("sha256").update(`${a}|${b}`).digest("hex").slice(0, 16)}`;
}

function claim(
  standing: ComparisonStanding,
  dimension: ComparisonClaim["dimension"],
  summary: string,
  sourceEvidence: ComparisonClaim["sourceEvidence"],
  featuresOnlyIn: ComparisonClaim["featuresOnlyIn"] = null,
): ComparisonClaim {
  const idBase = `${standing}:${dimension}:${summary.slice(0, 48)}`;
  return {
    claimId: `claim_${createHash("sha256").update(idBase).digest("hex").slice(0, 12)}`,
    standing,
    dimension,
    summary,
    sourceEvidence,
    featuresOnlyIn,
  };
}

export function compareProvisions(left: PrecedentProvision, right: PrecedentProvision): PrecedentComparisonRecord {
  if (left.covenantFamily !== right.covenantFamily) {
    // Cross-family comparisons are allowed but flagged as hypothesis-level
    // until a reviewer confirms the family mapping.
  }

  const leftFeatures = profileProvision(left);
  const rightFeatures = profileProvision(right);
  const overlap = featureOverlap(leftFeatures.features, rightFeatures.features);
  const textual = exactTextDiff(left.provisionId, left.sourceText, right.provisionId, right.sourceText);
  const phrases = asymmetricPhraseDiff(left.sourceText, right.sourceText);
  const claims: ComparisonClaim[] = [];

  claims.push(
    claim(
      "TEXTUAL_SIMILARITY",
      "TEXT",
      textual.identical
        ? "Source texts are identical after whitespace normalization."
        : `Token Jaccard similarity is ${textual.tokenJaccard.toFixed(3)}; texts are not identical.`,
      [
        { provisionId: left.provisionId, excerpt: left.sourceText.slice(0, 180) },
        { provisionId: right.provisionId, excerpt: right.sourceText.slice(0, 180) },
      ],
    ),
  );

  if (overlap.shared.length > 0) {
    claims.push(
      claim(
        "STRUCTURAL_SIMILARITY",
        "STRUCTURE",
        `Shared drafting features: ${overlap.shared.join(", ")}. Structural similarity is not identical legal effect.`,
        overlap.shared.slice(0, 4).map((f) => ({
          provisionId: leftFeatures.featureEvidence[f] ? left.provisionId : right.provisionId,
          excerpt: leftFeatures.featureEvidence[f] ?? rightFeatures.featureEvidence[f] ?? f,
        })),
      ),
    );
  }

  if (overlap.leftOnly.length > 0 || overlap.rightOnly.length > 0) {
    claims.push(
      claim(
        "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        "STRUCTURE",
        `Drafting-feature divergence — left-only: [${overlap.leftOnly.join(", ") || "none"}]; right-only: [${overlap.rightOnly.join(", ") || "none"}].`,
        [
          ...overlap.leftOnly.slice(0, 3).map((f) => ({
            provisionId: left.provisionId,
            excerpt: leftFeatures.featureEvidence[f] ?? f,
          })),
          ...overlap.rightOnly.slice(0, 3).map((f) => ({
            provisionId: right.provisionId,
            excerpt: rightFeatures.featureEvidence[f] ?? f,
          })),
        ],
        { left: overlap.leftOnly, right: overlap.rightOnly },
      ),
    );
  }

  // Additional conditions / provisos / exceptions
  for (const excerpt of phrases.onlyLeft) {
    claims.push(
      claim(
        "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        /provided/i.test(excerpt) ? "PROVISOS" : /except/i.test(excerpt) ? "EXCEPTIONS" : "CONDITIONS",
        "Additional condition/proviso/exception language appears in the left provision and was not matched on the right.",
        [{ provisionId: left.provisionId, excerpt }],
      ),
    );
  }
  for (const excerpt of phrases.onlyRight) {
    claims.push(
      claim(
        "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        /provided/i.test(excerpt) ? "PROVISOS" : /except/i.test(excerpt) ? "EXCEPTIONS" : "CONDITIONS",
        "Additional condition/proviso/exception language appears in the right provision and was not matched on the left.",
        [{ provisionId: right.provisionId, excerpt }],
      ),
    );
  }

  // Scope comparison
  const scopeFeatures = [
    "BORROWER_SCOPE",
    "GUARANTOR_SCOPE",
    "RESTRICTED_SUBSIDIARY_SCOPE",
    "NON_GUARANTOR_SCOPE",
  ] as const;
  const leftScope = scopeFeatures.filter((f) => leftFeatures.features.includes(f));
  const rightScope = scopeFeatures.filter((f) => rightFeatures.features.includes(f));
  const scopeOverlap = featureOverlap([...leftScope], [...rightScope]);
  if (scopeOverlap.leftOnly.length > 0 || scopeOverlap.rightOnly.length > 0) {
    claims.push(
      claim(
        "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        "SCOPE",
        `Entity-scope drafting differs (borrower/guarantor/restricted-subsidiary/non-guarantor markers). Left: [${leftScope.join(", ") || "none"}]; right: [${rightScope.join(", ") || "none"}].`,
        [
          ...scopeOverlap.leftOnly.map((f) => ({
            provisionId: left.provisionId,
            excerpt: leftFeatures.featureEvidence[f] ?? f,
          })),
          ...scopeOverlap.rightOnly.map((f) => ({
            provisionId: right.provisionId,
            excerpt: rightFeatures.featureEvidence[f] ?? f,
          })),
        ],
        { left: [...scopeOverlap.leftOnly], right: [...scopeOverlap.rightOnly] },
      ),
    );
  }

  // Shared capacity / reclassification
  for (const f of ["SHARED_CAPACITY", "RECLASSIFICATION_RIGHT"] as const) {
    const inL = leftFeatures.features.includes(f);
    const inR = rightFeatures.features.includes(f);
    if (inL !== inR) {
      claims.push(
        claim(
          "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
          f === "SHARED_CAPACITY" ? "SHARED_CAPACITY" : "RECLASSIFICATION",
          `${f} is present in the ${inL ? "left" : "right"} provision and absent in the other.`,
          [
            {
              provisionId: inL ? left.provisionId : right.provisionId,
              excerpt: (inL ? leftFeatures : rightFeatures).featureEvidence[f] ?? f,
            },
          ],
          { left: inL ? [f] : [], right: inR ? [f] : [] },
        ),
      );
    } else if (inL && inR) {
      claims.push(
        claim(
          "STRUCTURAL_SIMILARITY",
          f === "SHARED_CAPACITY" ? "SHARED_CAPACITY" : "RECLASSIFICATION",
          `Both provisions draft ${f}. Shared feature presence is not proof of identical mechanics.`,
          [
            { provisionId: left.provisionId, excerpt: leftFeatures.featureEvidence[f] ?? f },
            { provisionId: right.provisionId, excerpt: rightFeatures.featureEvidence[f] ?? f },
          ],
        ),
      );
    }
  }

  // Definition / EBITDA / leverage
  if (left.covenantFamily === "DEFINITIONS_CALCULATION_RULES" || right.covenantFamily === "DEFINITIONS_CALCULATION_RULES" || leftFeatures.features.includes("EBITDA_METRIC") || rightFeatures.features.includes("EBITDA_METRIC")) {
    const econLeft = leftFeatures.features.filter((f) => f === "EBITDA_METRIC" || f === "LEVERAGE_RATIO_METRIC" || f === "STEP_UP" || f === "STEP_DOWN");
    const econRight = rightFeatures.features.filter((f) => f === "EBITDA_METRIC" || f === "LEVERAGE_RATIO_METRIC" || f === "STEP_UP" || f === "STEP_DOWN");
    const econ = featureOverlap(econLeft, econRight);
    if (econ.leftOnly.length || econ.rightOnly.length || econ.shared.length) {
      claims.push(
        claim(
          econ.leftOnly.length || econ.rightOnly.length ? "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" : "STRUCTURAL_SIMILARITY",
          "DEFINITIONS",
          `EBITDA / leverage-ratio drafting markers — shared: [${econ.shared.join(", ") || "none"}]; left-only: [${econ.leftOnly.join(", ") || "none"}]; right-only: [${econ.rightOnly.join(", ") || "none"}].`,
          [
            { provisionId: left.provisionId, excerpt: left.sourceText.slice(0, 160) },
            { provisionId: right.provisionId, excerpt: right.sourceText.slice(0, 160) },
          ],
          { left: econ.leftOnly, right: econ.rightOnly },
        ),
      );
    }
  }

  // Soft semantic hypothesis — never reviewed
  if (textual.tokenJaccard >= 0.35 && overlap.shared.length >= 2) {
    claims.push(
      claim(
        "SEMANTIC_HYPOTHESIS",
        "STRUCTURE",
        "Heuristic: provisions may address a similar covenant concept, but this is an unverified semantic hypothesis — not reviewed precedent and not a legal-effect conclusion.",
        [
          { provisionId: left.provisionId, excerpt: left.locator.sourceSectionRef },
          { provisionId: right.provisionId, excerpt: right.locator.sourceSectionRef },
        ],
      ),
    );
  }

  // Reviewer-verified elevation — only with real review records
  if (mayEmitReviewerVerified(left, right)) {
    const reviewed = [left, right].filter((p) => p.reviewStatus === "APPROVED_PRECEDENT" && p.reviewedBy);
    claims.push(
      claim(
        "REVIEWER_VERIFIED_CONCLUSION",
        "STRUCTURE",
        `At least one side carries APPROVED_PRECEDENT review (${reviewed.map((p) => `${p.provisionId} by ${p.reviewedBy}`).join("; ")}). Reviewer notes remain authoritative over heuristic claims.`,
        reviewed.map((p) => ({ provisionId: p.provisionId, excerpt: p.reviewNote ?? "approved precedent" })),
      ),
    );
  }

  // Guard: never label hypothesis-only records as reviewed
  for (const c of claims) {
    if (c.standing === "REVIEWER_VERIFIED_CONCLUSION" && !mayEmitReviewerVerified(left, right)) {
      throw new Error("compareProvisions: refused to emit REVIEWER_VERIFIED_CONCLUSION without approved review records");
    }
    if (c.standing === "SEMANTIC_HYPOTHESIS" && /reviewed precedent/i.test(c.summary) && !/not reviewed precedent/i.test(c.summary)) {
      throw new Error("compareProvisions: refused to describe a semantic hypothesis as reviewed precedent");
    }
  }

  return {
    comparisonId: comparisonId(left.provisionId, right.provisionId),
    schemaVersion: PRECEDENT_COMPARISON_SCHEMA_VERSION,
    leftProvisionId: left.provisionId,
    rightProvisionId: right.provisionId,
    covenantFamily: left.covenantFamily,
    textual,
    leftFeatures,
    rightFeatures,
    structuralOverlap: overlap.shared,
    structuralDivergence: { leftOnly: overlap.leftOnly, rightOnly: overlap.rightOnly },
    claims,
    maxStanding: maxStanding(claims),
    disclaimer: COMPARISON_DISCLAIMER,
    createdAt: new Date().toISOString(),
  };
}
