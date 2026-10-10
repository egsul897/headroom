/**
 * Independent retrieval completeness evaluation against Neon covenant summaries.
 * Measures missing critical provisions, bad citations, stale docs, false confidence.
 * Read-only. DISCOVERED ≠ CERTIFIED.
 */

import { prisma } from "../../prisma";

export interface RetrievalGoldQuestion {
  id: string;
  question: string;
  /** Independent expected signals grounded in authentic public filings / known corpus. */
  expected: {
    /** At least one of these family/category tokens should appear in a hit. */
    categoryOrFamilyAnyOf: string[];
    /** Preferred section citation patterns (regex source). */
    sectionPatterns: string[];
    /** Optional issuer ticker preference (soft). */
    preferredTicker?: string;
    /** If set, hits from these classes are preferred for "current" package language. */
    preferDocumentClasses?: string[];
    /** Classes that indicate likely stale / superseded retrieval when preferred bases exist. */
    staleDocumentClasses?: string[];
  };
  critical: boolean;
}

export interface RetrievalHitEval {
  sourceId: string;
  ticker: string | null;
  documentClass: string;
  representationLevel: string;
  sectionRef: string;
  sourceCitation: string;
  category: string;
  heading: string;
  score: number;
  flags: string[];
}

export interface RetrievalQuestionResult {
  id: string;
  question: string;
  critical: boolean;
  hitsConsidered: number;
  topHits: RetrievalHitEval[];
  foundCriticalProvision: boolean;
  correctCitation: boolean;
  staleDocumentRetrieved: boolean;
  falseConfidence: boolean;
  missingCritical: boolean;
  notes: string[];
}

export const RETRIEVAL_GOLD_QUESTIONS: RetrievalGoldQuestion[] = [
  {
    id: "rp-available-amount",
    question: "Which provisions govern restricted payments funded from an Available Amount / builder basket?",
    expected: {
      categoryOrFamilyAnyOf: ["RESTRICTED_PAYMENTS", "AVAILABLE_AMOUNT", "BUILDER", "restricted payment"],
      sectionPatterns: ["6\\.", "7\\.", "§\\s*6", "§\\s*7", "Section\\s*6", "Section\\s*7"],
      preferDocumentClasses: ["CREDIT_AGREEMENT", "RESTATEMENT", "INDENTURE"],
      staleDocumentClasses: ["SUPPLEMENTAL_INDENTURE", "WAIVER"],
    },
    critical: true,
  },
  {
    id: "indebtedness-incurrence",
    question: "Where is the indebtedness negative covenant and its ratio / basket exceptions?",
    expected: {
      categoryOrFamilyAnyOf: ["INDEBTEDNESS", "indebtedness", "incurrence"],
      sectionPatterns: ["6\\.", "7\\.", "§\\s*6", "§\\s*7"],
      preferDocumentClasses: ["CREDIT_AGREEMENT", "RESTATEMENT", "INDENTURE"],
      staleDocumentClasses: ["SUPPLEMENTAL_INDENTURE"],
    },
    critical: true,
  },
  {
    id: "liens-permission",
    question: "What lien exceptions / permitted liens baskets appear in the package?",
    expected: {
      categoryOrFamilyAnyOf: ["LIENS", "lien", "permitted lien"],
      sectionPatterns: ["6\\.", "7\\.", "§\\s*6", "§\\s*7"],
      preferDocumentClasses: ["CREDIT_AGREEMENT", "RESTATEMENT", "INDENTURE", "SECURITY_AGREEMENT"],
    },
    critical: true,
  },
  {
    id: "investments-basket",
    question: "Identify investment covenant baskets and shared capacity with restricted payments.",
    expected: {
      categoryOrFamilyAnyOf: ["INVESTMENTS", "investment", "SHARED_CAPACITY", "restricted payment"],
      sectionPatterns: ["6\\.", "7\\.", "§\\s*6", "§\\s*7"],
      preferDocumentClasses: ["CREDIT_AGREEMENT", "RESTATEMENT"],
    },
    critical: true,
  },
  {
    id: "incremental-facility",
    question: "Where are incremental facility / incremental equivalent debt mechanics described?",
    expected: {
      categoryOrFamilyAnyOf: ["INCREMENTAL", "incremental"],
      sectionPatterns: ["2\\.", "§\\s*2", "Section\\s*2", "7\\."],
      preferDocumentClasses: ["CREDIT_AGREEMENT", "RESTATEMENT", "AMENDMENT"],
    },
    critical: true,
  },
  {
    id: "asset-sale-prepay",
    question: "How do asset sale proceeds interact with mandatory prepayment?",
    expected: {
      categoryOrFamilyAnyOf: ["ASSET_SALES", "MANDATORY_PREPAYMENT", "asset sale", "prepayment"],
      sectionPatterns: ["2\\.", "6\\.", "7\\.", "§"],
      preferDocumentClasses: ["CREDIT_AGREEMENT", "RESTATEMENT"],
    },
    critical: true,
  },
  {
    id: "intercreditor",
    question: "Does the corpus retrieve intercreditor arrangements when asked about lien priority among facilities?",
    expected: {
      categoryOrFamilyAnyOf: ["INTERCREDITOR", "intercreditor", "first lien", "second lien"],
      sectionPatterns: [".*"],
      preferDocumentClasses: ["INTERCREDITOR_AGREEMENT", "CREDIT_AGREEMENT"],
    },
    critical: false,
  },
  {
    id: "abl-borrowing-base",
    question: "Locate ABL / borrowing-base revolving facility covenant language.",
    expected: {
      categoryOrFamilyAnyOf: ["ABL", "borrowing base", "asset-based", "REVOLVING"],
      sectionPatterns: [".*"],
      preferDocumentClasses: ["ABL_AGREEMENT", "REVOLVING_CREDIT_AGREEMENT", "CREDIT_AGREEMENT"],
    },
    critical: false,
  },
];

function itemText(item: Record<string, unknown>): string {
  const families = Array.isArray(item.families) ? item.families.join(" ") : "";
  return [
    item.sectionRef,
    item.category,
    item.categoryLabel,
    item.heading,
    item.plainEnglish,
    item.restriction,
    item.operativeLanguageExcerpt,
    item.sourceCitation,
    families,
    Array.isArray(item.permissions) ? item.permissions.join(" ") : "",
    Array.isArray(item.materialBasketsThresholds) ? item.materialBasketsThresholds.join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function runRetrievalCompleteness(params?: {
  questions?: RetrievalGoldQuestion[];
  limitPerQuestion?: number;
}): Promise<{
  schema: "kf-retrieval-completeness.v1";
  generatedAt: string;
  readOnly: true;
  corpusPublicSources: number;
  results: RetrievalQuestionResult[];
  metrics: {
    criticalQuestions: number;
    criticalFoundRate: number;
    correctCitationRate: number;
    staleRetrievalRate: number;
    falseConfidenceRate: number;
    missingCriticalCount: number;
  };
  note: string;
}> {
  const questions = params?.questions ?? RETRIEVAL_GOLD_QUESTIONS;
  const limit = params?.limitPerQuestion ?? 8;

  const rows = await prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" },
    select: {
      sourceId: true,
      issuerTicker: true,
      documentClass: true,
      documentTitle: true,
      representationLevel: true,
      filingDate: true,
      metadata: true,
    },
  });

  const results: RetrievalQuestionResult[] = [];

  for (const q of questions) {
    const scored: RetrievalHitEval[] = [];
    for (const row of rows) {
      const m =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const items = Array.isArray((m.covenantSummary as { items?: unknown[] } | undefined)?.items)
        ? ((m.covenantSummary as { items: Record<string, unknown>[] }).items)
        : [];
      for (const item of items) {
        const text = itemText(item);
        let score = 0;
        const flags: string[] = [];
        for (const token of q.expected.categoryOrFamilyAnyOf) {
          if (text.toLowerCase().includes(token.toLowerCase())) score += 3;
        }
        // Soft question-token overlap
        for (const tok of q.question.toLowerCase().split(/\W+/).filter((t) => t.length > 4)) {
          if (text.toLowerCase().includes(tok)) score += 0.25;
        }
        if (q.expected.preferredTicker && row.issuerTicker === q.expected.preferredTicker) score += 1;
        if (q.expected.preferDocumentClasses?.includes(row.documentClass)) score += 1.5;
        if (q.expected.staleDocumentClasses?.includes(row.documentClass)) {
          score -= 0.5;
          flags.push("potentially_stale_class");
        }
        if (row.representationLevel === "CERTIFIED" || row.representationLevel === "REVIEWER_VERIFIED") {
          flags.push("elevated_representation");
        } else if (
          row.representationLevel === "DISCOVERED_CANDIDATE" ||
          row.representationLevel === "STRUCTURALLY_INDEXED"
        ) {
          flags.push("non_certified_ok");
        }
        // False confidence: metadata claiming promotion
        if ((m as { promotedToLegalTruth?: number }).promotedToLegalTruth === 1) {
          flags.push("false_confidence_promoted_flag");
          score -= 5;
        }
        if (score < 3) continue;
        scored.push({
          sourceId: row.sourceId,
          ticker: row.issuerTicker,
          documentClass: row.documentClass,
          representationLevel: row.representationLevel,
          sectionRef: String(item.sectionRef ?? ""),
          sourceCitation: String(item.sourceCitation ?? ""),
          category: String(item.category ?? ""),
          heading: String(item.heading ?? "").slice(0, 120),
          score,
          flags,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);

    const sectionRes = q.expected.sectionPatterns.map((p) => new RegExp(p, "i"));
    const correctCitation = top.some((h) => {
      const cite = `${h.sectionRef} ${h.sourceCitation}`;
      return sectionRes.some((re) => re.test(cite)) && cite.trim().length > 0;
    });
    const foundCriticalProvision = top.some((h) =>
      q.expected.categoryOrFamilyAnyOf.some(
        (t) =>
          h.category.toLowerCase().includes(t.toLowerCase()) ||
          h.heading.toLowerCase().includes(t.toLowerCase()) ||
          `${h.sectionRef} ${h.sourceCitation}`.toLowerCase().includes(t.toLowerCase()),
      ),
    );
    // Broader: any top hit with strong category token in combined fields
    const foundBroad = foundCriticalProvision || top.some((h) => h.score >= 6);
    const staleDocumentRetrieved =
      top.length > 0 &&
      Boolean(q.expected.staleDocumentClasses?.length) &&
      top.slice(0, 3).every((h) => q.expected.staleDocumentClasses!.includes(h.documentClass));
    const falseConfidence = top.some(
      (h) =>
        h.flags.includes("false_confidence_promoted_flag") ||
        h.representationLevel === "CERTIFIED",
    );
    const missingCritical = q.critical && !foundBroad;

    const notes: string[] = [];
    if (missingCritical) notes.push("Critical provision family not found in top hits");
    if (!correctCitation && top.length) notes.push("Top hits lack expected section citation patterns");
    if (staleDocumentRetrieved) notes.push("Top hits dominated by stale/supplemental classes");
    if (falseConfidence) notes.push("Hit claims certified/promoted authority incorrectly");
    if (!top.length) notes.push("Zero retrieval hits above score threshold");

    results.push({
      id: q.id,
      question: q.question,
      critical: q.critical,
      hitsConsidered: scored.length,
      topHits: top,
      foundCriticalProvision: foundBroad,
      correctCitation,
      staleDocumentRetrieved,
      falseConfidence,
      missingCritical,
      notes,
    });
  }

  const critical = results.filter((r) => r.critical);
  const metrics = {
    criticalQuestions: critical.length,
    criticalFoundRate: critical.length
      ? critical.filter((r) => r.foundCriticalProvision).length / critical.length
      : 0,
    correctCitationRate: results.length
      ? results.filter((r) => r.correctCitation).length / results.length
      : 0,
    staleRetrievalRate: results.length
      ? results.filter((r) => r.staleDocumentRetrieved).length / results.length
      : 0,
    falseConfidenceRate: results.length
      ? results.filter((r) => r.falseConfidence).length / results.length
      : 0,
    missingCriticalCount: results.filter((r) => r.missingCritical).length,
  };

  return {
    schema: "kf-retrieval-completeness.v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    corpusPublicSources: rows.length,
    results,
    metrics,
    note: "Independent gold questions; retrieval over DISCOVERED summaries only. Citation presence ≠ legal correctness.",
  };
}
