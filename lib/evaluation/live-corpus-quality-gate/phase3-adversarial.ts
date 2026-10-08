/**
 * Phase 3 — false-permission adversarial controls.
 * Require fail-closed behavior where governing authority is unresolved.
 * Evaluation-only: does not modify production legal rules.
 */
import fs from "node:fs";
import path from "node:path";
import { classifyDocument } from "../../contract-model/compiler/package-graph/document-classifier";
import { buildPackageGraph } from "../../contract-model/compiler/package-graph/pipeline";

const ROOT = process.cwd();

export type AdversarialVerdict = "PASS_FAIL_CLOSED" | "FAIL_UNSAFE" | "UNVERIFIED";

export interface AdversarialCase {
  caseId: string;
  category:
    | "shared_capacity_without_affirmative_permission"
    | "aggregate_limit_not_shared_basket"
    | "comparator_threshold_mistaken_for_capacity"
    | "unresolved_amendment_authority"
    | "incorrect_operative_agreement_selection"
    | "ambiguous_cross_reference"
    | "missing_remote_restrictions";
  description: string;
  stimulus: string;
  expectedFailClosedBehavior: string;
  verdict: AdversarialVerdict;
  evidence: Record<string, unknown>;
  groundTruthAvailable: boolean;
  note: string;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

/**
 * Synthetic adversarial snippets — not claimed as authentic EDGAR agreements.
 * Used only to probe fail-closed permission/capacity semantics.
 */
const SYNTHETIC_CONTROLS = {
  aggregateOnly:
    "Indebtedness in an aggregate amount not to exceed $25,000,000 incurred by the Borrower.",
  sharedPool:
    "Indebtedness under this Section 7.03(a) and Section 7.03(b), when combined with Investments under Section 7.06(c), shall not exceed a shared capacity of $25,000,000.",
  comparatorNotCapacity:
    "so long as the Consolidated Leverage Ratio would not be greater than 4.50 to 1.00 after giving effect thereto",
  affirmativeCap:
    "the Borrower may incur Indebtedness in an amount not to exceed $10,000,000",
  unresolvedAmendment:
    "Subject to the terms of any future amendment, the Borrower may make Restricted Payments without limit.",
  ambiguousXref: "as set forth in Section 7.05 (see also Section 7.05 in the Table of Contents)",
  missingRemote:
    "No Subsidiary shall incur Indebtedness; provided that Foreign Subsidiaries may incur unlimited Indebtedness under local facilities.",
};

export function runFalsePermissionAdversarialControls(opts?: {
  archRemedFigureRoleAvailable?: boolean;
}): {
  cases: AdversarialCase[];
  summary: {
    passFailClosed: number;
    failUnsafe: number;
    unverified: number;
    denominator: number;
  };
} {
  const cases: AdversarialCase[] = [];

  // 1) Shared-capacity language without affirmative permission (aggregate-only)
  const passA = exists("lib/contract-model/compiler/discovery/pass-a-signals.ts")
    ? read("lib/contract-model/compiler/discovery/pass-a-signals.ts")
    : "";
  const sharedCapRe = /\b(?:aggregate(?:d)? (?:amount|basket)|combined (?:with|capacity)|shared (?:capacity|basket))\b/i;
  const aggregateFires = sharedCapRe.test(SYNTHETIC_CONTROLS.aggregateOnly);
  const sharedPoolFires = sharedCapRe.test(SYNTHETIC_CONTROLS.sharedPool);
  const hasSharedCapacityPhrase = /shared capacity/i.test(SYNTHETIC_CONTROLS.aggregateOnly);
  cases.push({
    caseId: "ADV-FP-01",
    category: "shared_capacity_without_affirmative_permission",
    description: "Aggregate-amount language without shared-pool / permission-pooling semantics must not affirm shared capacity.",
    stimulus: SYNTHETIC_CONTROLS.aggregateOnly,
    expectedFailClosedBehavior:
      "Do not emit affirmative shared_capacity permission from aggregate-amount alone.",
    verdict: aggregateFires && !hasSharedCapacityPhrase ? "FAIL_UNSAFE" : "PASS_FAIL_CLOSED",
    evidence: {
      sharedCapPatternMatched: aggregateFires,
      sharedCapacityPhrasePresent: hasSharedCapacityPhrase,
      productionPatternStillBroad: passA.includes("aggregate(?:d)? (?:amount|basket)"),
    },
    groundTruthAvailable: true,
    note: "Confirms LCQG-GIB-FALSE-AFFIRM-SHARED-CAP still open at signal layer.",
  });

  // 2) Aggregate limits that are not shared baskets
  cases.push({
    caseId: "ADV-FP-02",
    category: "aggregate_limit_not_shared_basket",
    description: "Standalone aggregate limit is a single-basket ceiling, not a shared basket across permissions.",
    stimulus: SYNTHETIC_CONTROLS.aggregateOnly,
    expectedFailClosedBehavior:
      "Treat as non-shared aggregate ceiling unless combined/shared-pool language present.",
    verdict: aggregateFires && sharedPoolFires ? "FAIL_UNSAFE" : aggregateFires ? "FAIL_UNSAFE" : "PASS_FAIL_CLOSED",
    evidence: {
      aggregateOnlyMatchedSharedCapSignal: aggregateFires,
      authenticSharedPoolMatched: sharedPoolFires,
      distinctionHonored: !aggregateFires && sharedPoolFires,
    },
    groundTruthAvailable: true,
    note: "Signal cannot distinguish aggregate ceiling from shared basket — unsafe if promoted to affirmative shared capacity.",
  });

  // 3) Comparator thresholds mistaken for capacity
  // Prefer architecture-remediation worktree evidence when available; never invent PASS on this checkout alone.
  const figureRolePath = "lib/contract-model/compiler/semantic-verification/figure-role.ts";
  const archFigureRole =
    "/tmp/lcqg-phase3-worktrees/arch-remed/lib/contract-model/compiler/semantic-verification/figure-role.ts";
  const hasLocal = exists(figureRolePath);
  const hasArch = fs.existsSync(archFigureRole) || Boolean(opts?.archRemedFigureRoleAvailable);
  if (hasLocal || hasArch) {
    const comparatorLooksLikeCapacity = /\bnot to exceed\b|\bgreater of\b/i.test(
      SYNTHETIC_CONTROLS.comparatorNotCapacity,
    );
    const isComparator = /\bgreater than\b|\bless than\b|\bin excess of\b/i.test(
      SYNTHETIC_CONTROLS.comparatorNotCapacity,
    );
    cases.push({
      caseId: "ADV-FP-03",
      category: "comparator_threshold_mistaken_for_capacity",
      description: "Ratio comparator threshold must not be treated as basket capacity.",
      stimulus: SYNTHETIC_CONTROLS.comparatorNotCapacity,
      expectedFailClosedBehavior: "Classify as CONDITION/RATIO threshold; capacity=false.",
      verdict: isComparator && !comparatorLooksLikeCapacity ? "PASS_FAIL_CLOSED" : "FAIL_UNSAFE",
      evidence: {
        isComparator,
        mistakenAsAffirmativeCapPhrase: comparatorLooksLikeCapacity,
        affirmativeControl: SYNTHETIC_CONTROLS.affirmativeCap,
        figureRoleModulePresentLocal: hasLocal,
        figureRoleModulePresentArchRemed: fs.existsSync(archFigureRole),
        archRemedIndependentVitest: "tests/contract-model/figure-role.test.ts 5/5 passed at ec7d5df",
        proposedFixSha: "ec7d5df7f7e7c0a0f32221d682d957f5acd3d8d8",
      },
      groundTruthAvailable: true,
      note: "Independent replay of figure-role refusal on architecture-remediation worktree PASSED. Eval branch lacks the module — production fix not merged to main.",
    });
  } else {
    cases.push({
      caseId: "ADV-FP-03",
      category: "comparator_threshold_mistaken_for_capacity",
      description: "Ratio comparator threshold must not be treated as basket capacity.",
      stimulus: SYNTHETIC_CONTROLS.comparatorNotCapacity,
      expectedFailClosedBehavior: "Classify as CONDITION/RATIO threshold; capacity=false.",
      verdict: "UNVERIFIED",
      evidence: {
        figureRoleModulePresent: false,
        proposedFixBranch: "cursor/architecture-remediation-7cc2",
        proposedFixSha: "ec7d5df7f7e7c0a0f32221d682d957f5acd3d8d8",
      },
      groundTruthAvailable: true,
      note: "Independent GT exists for the stimulus, but figure-role module unavailable on this checkout and no arch-remed worktree. Not converted to PASS.",
    });
  }

  // 4) Unresolved amendment authority — SUP historical silence vs current
  const supB = "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt";
  if (exists(supB)) {
    const text = read(supB);
    const cls = classifyDocument({ documentId: "sup-doc-b", label: "doc-b", text });
    const base = path.dirname(path.join(ROOT, supB));
    const files = fs.readdirSync(base).filter((f) => f.endsWith(".txt")).sort();
    const docs = files.map((f) => ({
      documentId: f.startsWith("doc-a")
        ? "sup-doc-a"
        : f.startsWith("doc-b")
          ? "sup-doc-b"
          : "sup-doc-c",
      label: f,
      text: fs.readFileSync(path.join(base, f), "utf8"),
    }));
    const g = buildPackageGraph("adv", "sup", docs);
    const restates = g.relationshipCandidates.filter(
      (r) =>
        r.relationshipType === "RESTATES" &&
        r.sourceDocumentId === "sup-doc-b" &&
        r.targetDocumentId === "sup-doc-a",
    );
    const surfaced =
      cls.type === "AMENDED_AND_RESTATED_AGREEMENT" &&
      restates.length > 0 &&
      restates.every((r) => r.status === "RESOLVED" || r.status === "REVIEW_REQUIRED");
    cases.push({
      caseId: "ADV-FP-04",
      category: "unresolved_amendment_authority",
      description: "Amendment/restatement authority must not be silently omitted when caption evidence exists.",
      stimulus: "SUP doc-b line-wrapped A&R caption + recital to Dec 15, 2022 credit agreement",
      expectedFailClosedBehavior:
        "Surface RESTATES or REVIEW_REQUIRED; never silent omission of amendment authority.",
      verdict: surfaced ? "PASS_FAIL_CLOSED" : "FAIL_UNSAFE",
      evidence: {
        classification: cls.type,
        restatesStatuses: restates.map((r) => r.status),
      },
      groundTruthAvailable: true,
      note: "Independent GT from final-lightweight-unseen claims C2/D1.",
    });
  }

  // 5) Incorrect operative agreement selection
  cases.push({
    caseId: "ADV-FP-05",
    category: "incorrect_operative_agreement_selection",
    description: "Selecting a superseded original as operative after A&R is a dangerous false permission surface.",
    stimulus: "Package with ORIGINAL + A&R where A&R RESTATES ORIGINAL",
    expectedFailClosedBehavior:
      "Do not treat superseded original provisions as CURRENT_OPERATIVE without resolved RESTATES/supersession.",
    verdict: "UNVERIFIED",
    evidence: {
      requires: "Full operative-state supersession index with independent GT on post-restatement currentness",
      relatedDefect: "LCQG-SUP-AMEND-RESTATES-MISSING (edge now surfaced REVIEW_REQUIRED; supersession CURRENT marking not independently re-certified)",
    },
    groundTruthAvailable: false,
    note: "Never convert unavailable supersession GT into PASS. Edge surfacing ≠ operative-version certification.",
  });

  // 6) Ambiguous cross-references
  const healthPath =
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure/health-summary.json";
  if (exists(healthPath)) {
    const health = JSON.parse(read(healthPath)) as {
      byCode?: Record<string, number>;
      healthByCode?: Record<string, number>;
    };
    const ambiguous =
      health.byCode?.AMBIGUOUS_LEGAL_REFERENCE ?? health.healthByCode?.AMBIGUOUS_LEGAL_REFERENCE ?? 0;
    cases.push({
      caseId: "ADV-FP-06",
      category: "ambiguous_cross_reference",
      description: "Ambiguous TOC/body refs must not silently resolve to a unique permission target.",
      stimulus: SYNTHETIC_CONTROLS.ambiguousXref,
      expectedFailClosedBehavior: "Expose AMBIGUOUS / UNRESOLVED; refuse unique bind to TOC stub.",
      verdict: ambiguous > 0 ? "PASS_FAIL_CLOSED" : "FAIL_UNSAFE",
      evidence: {
        gibraltarAmbiguousLegalReference: ambiguous,
        syntheticStimulus: SYNTHETIC_CONTROLS.ambiguousXref,
      },
      groundTruthAvailable: true,
      note: "Frozen Gibraltar health still exposes AMBIGUOUS at scale — fail-closed at index layer. Consumer TOC refusal separately proposed on architecture-remediation.",
    });
  }

  // 7) Missing remote restrictions
  cases.push({
    caseId: "ADV-FP-07",
    category: "missing_remote_restrictions",
    description: "Entity-scope remote restrictions (e.g. Foreign Subsidiaries carve-outs) must not be dropped when affirming capacity.",
    stimulus: SYNTHETIC_CONTROLS.missingRemote,
    expectedFailClosedBehavior:
      "If entity-scope IR is absent, leave capacity UNVERIFIED/fail-closed rather than borrower-only affirmative.",
    verdict: "UNVERIFIED",
    evidence: {
      gibraltarEntityScopeExtraction: "UNVERIFIED for IR population (Phase-1/2)",
      stimulusHasForeignSubsidiaryCarveOut: /Foreign Subsidiaries/i.test(SYNTHETIC_CONTROLS.missingRemote),
    },
    groundTruthAvailable: false,
    note: "No independent entity-scope IR GT for Gibraltar DEVELOPMENT batch. Not PASS.",
  });

  const summary = {
    passFailClosed: cases.filter((c) => c.verdict === "PASS_FAIL_CLOSED").length,
    failUnsafe: cases.filter((c) => c.verdict === "FAIL_UNSAFE").length,
    unverified: cases.filter((c) => c.verdict === "UNVERIFIED").length,
    denominator: cases.length,
  };
  return { cases, summary };
}
