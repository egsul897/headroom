/**
 * Retrieval-grounded Ask answers over Neon KnowledgeSource covenant summaries.
 * Returns cited excerpts only — does not invent capacity or permissions.
 */

import { prisma } from "../../prisma";
import { summarizeFromStoredMetadata, type DocumentCovenantSummary } from "./summarize";

export interface AskCitation {
  sourceId: string;
  governingAgreement: string;
  sectionRef: string;
  excerpt: string;
  epistemicStatus: string;
}

export interface AskRetrieveAnswer {
  kind: "answered" | "insufficient_evidence" | "refused";
  headline: string;
  detail: string;
  citations: AskCitation[];
  limitations: string[];
  promotedToLegalTruth: 0;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9$%]+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "with", "what", "does", "can", "may"].includes(t));
}

export async function answerFromCorpus(params: {
  question: string;
  sourceId?: string;
  companyId?: string;
  limit?: number;
}): Promise<AskRetrieveAnswer> {
  const q = params.question.trim();
  if (!q) {
    return {
      kind: "refused",
      headline: "No question",
      detail: "Ask did not run.",
      citations: [],
      limitations: [],
      promotedToLegalTruth: 0,
    };
  }

  const tokens = tokenize(q);
  const rows = await prisma.knowledgeSource.findMany({
    where: params.sourceId
      ? { sourceId: params.sourceId }
      : { storageRef: { not: null } },
    take: params.sourceId ? 1 : 80,
    orderBy: { filingDate: "desc" },
  });

  const citations: AskCitation[] = [];
  for (const row of rows) {
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary) continue;
    for (const item of summary.items) {
      const hay = `${item.heading} ${item.plainEnglish} ${item.operativeLanguageExcerpt} ${item.categoryLabel}`.toLowerCase();
      const score = tokens.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0);
      if (score === 0 && tokens.length > 0) continue;
      citations.push({
        sourceId: summary.sourceId,
        governingAgreement: summary.governingAgreement,
        sectionRef: item.sectionRef,
        excerpt: item.operativeLanguageExcerpt.slice(0, 400),
        epistemicStatus: item.epistemicStatus,
      });
    }
  }

  citations.sort((a, b) => b.excerpt.length - a.excerpt.length);
  const top = citations.slice(0, params.limit ?? 8);

  if (top.length === 0) {
    return {
      kind: "insufficient_evidence",
      headline: "Insufficient retrieved evidence",
      detail:
        "No matching covenant excerpts were found in the persisted corpus for this question. Headroom will not invent an answer.",
      citations: [],
      limitations: [
        "Answer requires retrieved contractual text",
        "DISCOVERED candidates are not verified legal conclusions",
      ],
      promotedToLegalTruth: 0,
    };
  }

  const lines = top.map(
    (c, i) =>
      `(${i + 1}) ${c.governingAgreement} — ${c.sectionRef}: “${c.excerpt.replace(/\s+/g, " ").trim()}” [${c.sourceId}]`,
  );

  return {
    kind: "answered",
    headline: "Retrieved contractual text (not a legal determination)",
    detail:
      `Based only on discovered covenant excerpts in the durable corpus:\n\n` +
      lines.join("\n\n") +
      `\n\nThese excerpts are DISCOVERED_CANDIDATE material. They do not establish that a transaction is permitted, that capacity exists, or that the provision is currently operative.`,
    citations: top,
    limitations: [
      "Retrieval-grounded only — no model invention of permissions",
      "Amendment operative state may not be fully resolved",
      "promotedToLegalTruth remains 0",
    ],
    promotedToLegalTruth: 0,
  };
}

export async function listSummariesInNeon(limit = 50): Promise<
  Array<{ sourceId: string; title: string; categories: string[]; candidateCount: number }>
> {
  const rows = await prisma.knowledgeSource.findMany({
    where: { storageRef: { not: null } },
    take: limit,
    orderBy: { filingDate: "desc" },
  });
  const out: Array<{ sourceId: string; title: string; categories: string[]; candidateCount: number }> = [];
  for (const row of rows) {
    const summary = summarizeFromStoredMetadata(row.metadata) as DocumentCovenantSummary | null;
    if (!summary) {
      out.push({
        sourceId: row.sourceId,
        title: row.documentTitle,
        categories: [],
        candidateCount: 0,
      });
      continue;
    }
    out.push({
      sourceId: row.sourceId,
      title: summary.governingAgreement,
      categories: Object.keys(summary.countsByCategory),
      candidateCount: summary.items.length,
    });
  }
  return out;
}
