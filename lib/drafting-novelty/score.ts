/**
 * Novelty scoring and failure-mode heuristics.
 *
 * Prioritizes rare drafting that could cause FALSE_PERMISSION or MISSING_RESTRICTION.
 * Lexical neighbors are comparison aids only — never semantic equivalence.
 */
import { signatureDistance } from "./signatures";
import { jaccard } from "./similarity";
import { clusterBySignature } from "./cluster";
import type {
  AcquisitionRecommendation,
  DraftingCategory,
  DraftingUnit,
  LexicalNeighbor,
  NoveltyFinding,
  ReviewerQueueItem,
  SignatureToken,
  SuspectedFailureMode,
} from "./types";

const HIGH_RISK_TOKENS: SignatureToken[] = [
  "PROVISO_AFTER_PERMISSION",
  "RECLASSIFY_AUTOMATIC",
  "FIXED_VS_INCURRENCE",
  "IN_THE_AGGREGATE_WITH",
  "TOGETHER_WITH_SECTIONS",
  "ENTITY_NON_LOAN_PARTY",
  "CROSS_DOC_CAP_REFERENCE",
  "INTERCREDITOR_STANDSTILL",
  "INTERCREDITOR_TURNOVER",
  "STEP_UP_WITH_LIMITS",
  "AMENDMENT_SACRED_RIGHT",
  "NOTWITHSTANDING_OVERRIDE",
];

function failureModeFor(tokens: SignatureToken[], category: DraftingCategory): { mode: SuspectedFailureMode; rationale: string } {
  // Category-first: keep failure modes diversified and aligned with what the unit was labeled for.
  switch (category) {
    case "RECLASSIFICATION":
      return {
        mode: "CAPACITY_OVERSTATEMENT",
        rationale: "Automatic or Fixed/Incurrence reclassification can expand usable capacity if the engine treats baskets as static silos.",
      };
    case "SHARED_CAPACITY":
      return {
        mode: "CAPACITY_OVERSTATEMENT",
        rationale: "Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.",
      };
    case "ENTITY_SCOPE":
      return {
        mode: "SCOPE_MISBIND",
        rationale: "Entity-scope narrowing (non-loan party / foreign / unrestricted) can disappear into borrower-group defaults.",
      };
    case "CROSS_DOCUMENT_RESTRICTION":
      return {
        mode: "CROSS_INSTRUMENT_SILENCE",
        rationale: "Cross-document cap or refinancing-lineage limits are invisible to single-agreement compilers.",
      };
    case "INTERCREDITOR_LIMITATION":
      return {
        mode: "PRIORITY_MISORDER",
        rationale: "Intercreditor limitations restrict enforcement/priority even when the credit agreement appears to permit the lien.",
      };
    case "AMENDMENT_MECHANISM":
      return {
        mode: "AMENDMENT_BYPASS",
        rationale: "Sacred-right / affected-lender / yank-a-bank mechanics can be missed by Required-Lender-only amendment models.",
      };
    case "PROVISO_PLACEMENT":
      if (tokens.includes("PROVISO_AFTER_PERMISSION") || tokens.includes("STEP_UP_WITH_LIMITS")) {
        return {
          mode: "FALSE_PERMISSION",
          rationale: "Permission lead-in with trailing proviso/step-up limits is a classic false-permission pattern if the proviso is dropped.",
        };
      }
      return {
        mode: "MISSING_RESTRICTION",
        rationale: "Proviso placement can hide a restriction outside the clause the discovery pass anchors.",
      };
    case "BASKET_FORMULA":
      return {
        mode: "CAPACITY_UNDERSTATEMENT",
        rationale: "Unusual basket formulas risk under-counting available capacity or ignoring builder components.",
      };
    case "DEFINITION_FORMULATION":
      if (tokens.includes("PROVISO_AFTER_PERMISSION") || tokens.includes("NOTWITHSTANDING_OVERRIDE")) {
        return {
          mode: "FALSE_PERMISSION",
          rationale: "Definitional notwithstanding/proviso can silently expand a defined set (e.g. Cash Equivalents) beyond the enumerated limbs.",
        };
      }
      return {
        mode: "MISSING_RESTRICTION",
        rationale: "Rare definition formulation may omit builder reductions, exclusions, or measurement-date constraints.",
      };
    case "COVENANT_STRUCTURE":
      if (tokens.includes("PROVISO_AFTER_PERMISSION") || tokens.includes("NOTWITHSTANDING_OVERRIDE")) {
        return {
          mode: "FALSE_PERMISSION",
          rationale: "Covenant structure with permission override + proviso risks compiling the override without the limiting limbs.",
        };
      }
      if (tokens.includes("FIXED_VS_INCURRENCE") || tokens.includes("IN_THE_AGGREGATE_WITH")) {
        return {
          mode: "CAPACITY_OVERSTATEMENT",
          rationale: "Covenant-adjacent capacity mechanics (reclass / shared aggregate) can overstate headroom if treated as ordinary exceptions.",
        };
      }
      return {
        mode: "MISSING_RESTRICTION",
        rationale: "Unusual covenant structure may bury restrictions in chapeau, trailing compliance paragraphs, or exception interactions.",
      };
  }
}

function riskBoost(tokens: SignatureToken[]): number {
  let boost = 0;
  for (const t of tokens) if (HIGH_RISK_TOKENS.includes(t)) boost += 0.06;
  return Math.min(0.3, boost);
}

function nearestCorpusDistance(unit: DraftingUnit, corpus: DraftingUnit[]): number {
  let best = 1;
  for (const c of corpus) {
    if (c.category !== unit.category) continue;
    const d = signatureDistance(unit.signature, c.signature);
    if (d < best) best = d;
  }
  return best;
}

function neighborsFor(unit: DraftingUnit, pool: DraftingUnit[], limit: number): LexicalNeighbor[] {
  // Same-category only; prefer corpus. Cap scan size for determinism + speed.
  const sameCat = pool.filter((o) => o.unitId !== unit.unitId && o.category === unit.category);
  const corpus = sameCat.filter((o) => o.role === "CORPUS");
  const probe = sameCat.filter((o) => o.role === "PROBE");
  const candidates = [...corpus, ...probe.slice(0, 400)];

  const scored = candidates
    .map((o) => ({ o, j: jaccard(unit.shingles, o.shingles) }))
    .filter((x) => x.j >= 0.08)
    .sort((a, b) => b.j - a.j || a.o.unitId.localeCompare(b.o.unitId));

  const out: LexicalNeighbor[] = [];
  const seen = new Set<string>();
  for (const { o, j } of scored) {
    if (seen.has(o.unitId)) continue;
    seen.add(o.unitId);
    out.push({
      unitId: o.unitId,
      documentId: o.documentId,
      packageId: o.packageId,
      role: o.role,
      jaccard: Number(j.toFixed(4)),
      signatureKey: o.signature.key,
      excerpt: o.span.excerpt.slice(0, 280),
      equivalenceClaim: "NONE_LEXICAL_ONLY",
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function scoreNovelty(units: DraftingUnit[]): NoveltyFinding[] {
  const clusters = clusterBySignature(units);
  const corpus = units.filter((u) => u.role === "CORPUS");
  const probe = units.filter((u) => u.role === "PROBE");
  const findings: NoveltyFinding[] = [];

  // Score probe units (and corpus-only ultra-rare shapes that are still useful for acquisition).
  const candidates = probe.length > 0 ? probe : units;

  for (const unit of candidates) {
    const cluster = clusters.get(unit.signature.key) ?? [unit];
    const corpusSupport = cluster.filter((m) => m.role === "CORPUS").length;
    const probeSupport = cluster.filter((m) => m.role === "PROBE").length;
    const totalSupport = cluster.length;
    const rarity = 1 / (1 + corpusSupport);
    const specificity = unit.signature.tokens.length / (1 + unit.signature.tokens.length);
    const dist = nearestCorpusDistance(unit, corpus);
    const { mode, rationale } = failureModeFor(unit.signature.tokens, unit.category);
    const falsePermissionBias =
      mode === "FALSE_PERMISSION" || mode === "CAPACITY_OVERSTATEMENT" || mode === "MISSING_RESTRICTION" ? 0.12 : 0.04;

    const raw =
      rarity * 0.42 +
      dist * 0.22 +
      specificity * 0.08 +
      riskBoost(unit.signature.tokens) +
      falsePermissionBias +
      (corpusSupport === 0 ? 0.1 : 0) +
      Math.min(0.08, unit.signature.tokens.filter((t) => HIGH_RISK_TOKENS.includes(t)).length * 0.02);
    // Keep headroom below 1.0 so ranking stays informative.
    const noveltyScore = Number(Math.min(0.99, raw).toFixed(4));

    // Keep findings that are actually rare or high-risk.
    if (noveltyScore < 0.38 && corpusSupport > 1) continue;
    // Drop weak multi-label noise: category with only a single generic fallback token and no hotspot tokens.
    const hotspot = unit.signature.tokens.some((t) => HIGH_RISK_TOKENS.includes(t));
    if (!hotspot && unit.signature.tokens.length <= 1 && corpusSupport > 0) continue;

    findings.push({
      findingId: `novelty:${unit.unitId.replace("draft-unit:", "")}`,
      unitId: unit.unitId,
      category: unit.category,
      noveltyScore,
      rarityRank: 0,
      corpusSupport,
      probeSupport,
      clusterSize: totalSupport,
      signatureKey: unit.signature.key,
      signatureTokens: unit.signature.tokens,
      suspectedFailureMode: mode,
      failureRationale: rationale,
      span: unit.span,
      comparisonExamples: neighborsFor(unit, units, 3),
      nearestCorpusSignatureDistance: Number(dist.toFixed(4)),
      notes: [
        "Lexical neighbors are comparison examples only; do not treat Jaccard overlap as semantic equivalence.",
        "Structural signature match means similar drafting shape, not identical legal effect.",
      ],
    });
  }

  findings.sort((a, b) => b.noveltyScore - a.noveltyScore || a.findingId.localeCompare(b.findingId));
  // Dedup near-identical findings: same signature + overlapping span start within 40 chars on same doc.
  const deduped: NoveltyFinding[] = [];
  for (const f of findings) {
    const dup = deduped.find(
      (d) =>
        d.signatureKey === f.signatureKey &&
        d.span.documentId === f.span.documentId &&
        Math.abs(d.span.charStart - f.span.charStart) < 40,
    );
    if (dup) continue;
    deduped.push(f);
  }

  // Cap per category while preserving high-risk diversity.
  const perCat = new Map<DraftingCategory, number>();
  const capped: NoveltyFinding[] = [];
  for (const f of deduped) {
    const n = perCat.get(f.category) ?? 0;
    if (n >= 8) continue;
    perCat.set(f.category, n + 1);
    capped.push(f);
  }

  capped.forEach((f, i) => {
    f.rarityRank = i + 1;
  });
  return capped;
}

const QUEUE_PRIORITY_CATEGORIES: DraftingCategory[] = [
  "RECLASSIFICATION",
  "SHARED_CAPACITY",
  "PROVISO_PLACEMENT",
  "CROSS_DOCUMENT_RESTRICTION",
  "INTERCREDITOR_LIMITATION",
  "ENTITY_SCOPE",
  "AMENDMENT_MECHANISM",
  "BASKET_FORMULA",
  "COVENANT_STRUCTURE",
  "DEFINITION_FORMULATION",
];

export function buildReviewerQueue(findings: NoveltyFinding[], limit = 40): ReviewerQueueItem[] {
  // Round-robin across categories so false-permission / missing-restriction families stay visible.
  const buckets = new Map<DraftingCategory, NoveltyFinding[]>();
  for (const f of findings) {
    const list = buckets.get(f.category) ?? [];
    list.push(f);
    buckets.set(f.category, list);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => b.noveltyScore - a.noveltyScore || a.findingId.localeCompare(b.findingId));
  }

  const picked: NoveltyFinding[] = [];
  let progressed = true;
  while (picked.length < limit && progressed) {
    progressed = false;
    for (const cat of QUEUE_PRIORITY_CATEGORIES) {
      const list = buckets.get(cat);
      if (!list || list.length === 0) continue;
      picked.push(list.shift()!);
      progressed = true;
      if (picked.length >= limit) break;
    }
  }

  return picked.map((f, i) => ({
    queueRank: i + 1,
    findingId: f.findingId,
    category: f.category,
    noveltyScore: f.noveltyScore,
    suspectedFailureMode: f.suspectedFailureMode,
    sourceSpan: f.span,
    signatureKey: f.signatureKey,
    comparisonExamples: f.comparisonExamples,
    reviewerPrompt:
      `Verify whether this ${f.category} drafting is modeled correctly. ` +
      `Suspected failure mode: ${f.suspectedFailureMode}. ` +
      `Check the exact source span [${f.span.charStart}, ${f.span.charEnd}) in ${f.span.path}. ` +
      `Compare shape (not wording) to the listed examples; do not assume lexical similarity means same legal effect.`,
  }));
}

export function buildAcquisitionRecommendations(findings: NoveltyFinding[]): AcquisitionRecommendation[] {
  const byCategory = new Map<DraftingCategory, NoveltyFinding[]>();
  for (const f of findings) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  const corpusHeavy = [
    "standard leverage step-up with election notice",
    "ordinary greater-of flat-or-EBITDA basket",
    "vanilla Restricted Subsidiary / Loan Party scope",
  ];

  const categoryHints: Record<DraftingCategory, { shape: string; searches: string[]; diversifies: string[] }> = {
    COVENANT_STRUCTURE: {
      shape: "Chapeau + lettered exception list with trailing compliance/reclass paragraph outside the last letter",
      searches: ['"For purposes of determining compliance with this Section" reclassify 8-K exhibit', "credit agreement negative covenant chapeau EDGAR"],
      diversifies: corpusHeavy,
    },
    DEFINITION_FORMULATION: {
      shape: "Builder / Available Amount definitions with cross-article reduction hooks",
      searches: ['"Available Amount" "builder" credit agreement exhibit 10', '"Cumulative Credit" definition credit agreement'],
      diversifies: ["simple means-definitions without builder mechanics"],
    },
    BASKET_FORMULA: {
      shape: "Lesser-of / multi-leg formulas and non-EBITDA denominators",
      searches: ['"lesser of" "Consolidated Total Assets" permitted indebtedness', '"sum of" "without duplication" basket credit agreement'],
      diversifies: ["greater-of $X and Y% EBITDA only"],
    },
    PROVISO_PLACEMENT: {
      shape: "Permission sentence with multi-limb proviso (x)/(y)/(z) after a Notwithstanding override",
      searches: ['"Notwithstanding the foregoing" "provided that (x)" leverage', "Material Acquisition step-up provided that only twice"],
      diversifies: ["standalone prohibition without trailing proviso"],
    },
    ENTITY_SCOPE: {
      shape: "Non-Loan Party / Foreign Restricted Subsidiary shared sub-caps",
      searches: ['"Non-Loan Parties" "in the aggregate" Incremental Equivalent', '"Foreign Restricted Subsidiary" sublimit credit agreement'],
      diversifies: ["Borrower and Restricted Subsidiaries undifferentiated scope"],
    },
    AMENDMENT_MECHANISM: {
      shape: "Affected-lender / sacred-right / yank-a-bank clusters",
      searches: ['"yank-a-bank" OR "non-consenting Lender" credit agreement', '"all Lenders" "pro rata sharing" amendments'],
      diversifies: ["Required Lenders majority amendment only"],
    },
    SHARED_CAPACITY: {
      shape: "Multi-clause shared pools and external-instrument balance caps",
      searches: ['"in the aggregate with" Section permitted indebtedness', '"outstanding under" Indenture cap credit agreement'],
      diversifies: ["single-clause hard caps"],
    },
    RECLASSIFICATION: {
      shape: "Automatic Fixed Amount → Incurrence-Based reclass unless elect otherwise",
      searches: ['"Fixed Amounts" "Incurrence-Based Amounts" reclassified', '"automatically and immediately reclassified" credit agreement'],
      diversifies: ["sole-discretion classify among enumerated baskets only"],
    },
    CROSS_DOCUMENT_RESTRICTION: {
      shape: "Credit agreement caps referencing notes indenture balances / refinancing lineage",
      searches: ['"Incurred pursuant to any Credit Facility" maximum aggregate principal indenture', "refinancing indebtedness redesignated credit agreement"],
      diversifies: ["intra-agreement baskets only"],
    },
    INTERCREDITOR_LIMITATION: {
      shape: "ABL/Term split-priority, standstill, payments-over, DIP subordination",
      searches: ["ABL Intercreditor Agreement standstill exhibit", '"Payments Over" intercreditor agreement 8-K', "Junior Lien Intercreditor Agreement release of liens"],
      diversifies: ["credit-agreement-only lien permissions without ICA text"],
    },
  };

  const recs: AcquisitionRecommendation[] = [];
  let priority = 1;
  const categories = [...byCategory.keys()].sort((a, b) => {
    const sa = Math.max(...(byCategory.get(a)?.map((f) => f.noveltyScore) ?? [0]));
    const sb = Math.max(...(byCategory.get(b)?.map((f) => f.noveltyScore) ?? [0]));
    return sb - sa || a.localeCompare(b);
  });

  for (const category of categories) {
    const list = byCategory.get(category) ?? [];
    const top = list.slice(0, 3);
    const hint = categoryHints[category];
    const zeroCorpus = top.filter((f) => f.corpusSupport === 0);
    recs.push({
      recommendationId: `acq:${category.toLowerCase()}:${priority}`,
      priority: priority++,
      category,
      rationale:
        zeroCorpus.length > 0
          ? `${zeroCorpus.length} high-scoring ${category} shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.`
          : `Corpus support exists but remains thin for ${category}; diversify toward the rare tokens seen in probe packages.`,
      targetDraftingShape: hint.shape,
      suggestedPublicSearchHints: hint.searches,
      diversifiesAwayFrom: hint.diversifies,
      relatedFindingIds: top.map((f) => f.findingId),
    });
  }

  // Extra diversification picks for failure-mode coverage gaps.
  const modes = new Set(findings.map((f) => f.suspectedFailureMode));
  if (!modes.has("PRIORITY_MISORDER")) {
    recs.push({
      recommendationId: `acq:gap-intercreditor:${priority}`,
      priority: priority++,
      category: "INTERCREDITOR_LIMITATION",
      rationale: "No PRIORITY_MISORDER finding dominated the queue — still acquire freestanding ICA text (not just CA references).",
      targetDraftingShape: "Freestanding ABL/Term intercreditor with standstill + payments-over",
      suggestedPublicSearchHints: ["Intercreditor Agreement exhibit 4 standstill payments over"],
      diversifiesAwayFrom: ["joinder-only ICA coverage"],
      relatedFindingIds: [],
    });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}
