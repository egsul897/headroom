/**
 * Retrieval-grounded Ask answers over Neon KnowledgeSource covenant summaries.
 * Returns cited excerpts only — does not invent capacity or permissions.
 *
 * Isolation: public research queries use companyId IS NULL.
 * Customer workspace queries require companyId and never mix other tenants or public corpus.
 */

import { prisma } from "../../prisma";
import { summarizeFromStoredMetadata, type DocumentCovenantSummary } from "./summarize";
import type { AmendmentPackageView } from "../customer-intelligence/amendment-package";

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
  amendmentNote?: string;
  promotedToLegalTruth: 0;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9$%]+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "with", "what", "does", "can", "may"].includes(t));
}

function amendmentFromMetadata(metadata: unknown): AmendmentPackageView | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const ap = (metadata as Record<string, unknown>).amendmentPackage;
  if (!ap || typeof ap !== "object") return null;
  return ap as AmendmentPackageView;
}

function scoreItem(hay: string, tokens: string[], categoryLabel: string): number {
  if (tokens.length === 0) return 1;
  let score = tokens.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0);
  const cat = categoryLabel.toLowerCase();
  // Prefer category alignment over long unrelated excerpts.
  if (/secured|lien|collateral/.test(tokens.join(" ")) && /lien|secured/.test(cat)) score += 3;
  if (/restricted|payment|dividend|basket/.test(tokens.join(" ")) && /restricted|basket/.test(cat)) {
    score += 3;
  }
  if (/asset|sale|disposition/.test(tokens.join(" ")) && /asset/.test(cat)) score += 3;
  if (/debt|incur|indebtedness/.test(tokens.join(" ")) && /debt/.test(cat)) score += 3;
  if (/leverage|ratio|definition/.test(tokens.join(" ")) && /financial|basket|other/.test(cat)) {
    score += 2;
  }
  if (/amend|changed|latest/.test(tokens.join(" "))) score += 1;
  // Penalize events-of-default noise for non-default questions.
  if (/event of default|events of default/.test(hay) && !/default/.test(tokens.join(" "))) {
    score -= 2;
  }
  return score;
}

/** Boost tokens for common product questions. */
function expandTokens(tokens: string[]): string[] {
  const extra: string[] = [];
  const joined = tokens.join(" ");
  if (/secured|lien|collateral/.test(joined)) extra.push("lien", "secured", "collateral");
  if (/restricted.?payment|dividend|rp\b/.test(joined)) {
    extra.push("restricted", "payment", "dividend", "distribution");
  }
  if (/non.?guarantor|unguaranteed|subsidiary/.test(joined)) {
    extra.push("subsidiary", "guarantor", "restricted");
  }
  if (/asset.?sale|disposition/.test(joined)) extra.push("asset", "sale", "disposition");
  if (/amend|changed|latest/.test(joined)) extra.push("amendment", "amended", "restated");
  if (/leverage|ratio|definition/.test(joined)) extra.push("leverage", "ratio", "consolidated");
  if (/debt|indebtedness|incur/.test(joined)) extra.push("indebtedness", "debt", "incur");
  return Array.from(new Set([...tokens, ...extra]));
}

export async function answerFromCorpus(params: {
  question: string;
  sourceId?: string;
  /** When set, answers only from that company's uploads. When omitted, public research corpus only. */
  companyId?: string;
  /** Explicit research mode — never includes customer uploads. */
  researchOnly?: boolean;
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

  const tokens = expandTokens(tokenize(q));
  const researchOnly = params.researchOnly === true || !params.companyId;

  const where = params.sourceId
    ? {
        sourceId: params.sourceId,
        ...(researchOnly
          ? { companyId: null as string | null }
          : { companyId: params.companyId }),
      }
    : researchOnly
      ? { storageRef: { not: null }, companyId: null as string | null }
      : { storageRef: { not: null }, companyId: params.companyId };

  const rows = await prisma.knowledgeSource.findMany({
    where,
    take: params.sourceId ? 1 : 80,
    orderBy: { filingDate: "desc" },
  });

  // Defense: never leak another tenant even if sourceId was guessed.
  const scoped = researchOnly
    ? rows.filter((r) => r.companyId == null)
    : rows.filter((r) => r.companyId === params.companyId);

  let amendmentNote: string | undefined;
  for (const row of scoped) {
    const ap = amendmentFromMetadata(row.metadata);
    if (ap && ap.operativeResolution === "UNRESOLVED_PRECEDENCE") {
      amendmentNote =
        `Amendment precedence is UNRESOLVED for this workspace (${ap.unresolvedReasons.join("; ")}). ` +
        `Retrieved excerpts may include historical language — do not treat them as operative without package resolution.`;
      break;
    }
    if (ap && ap.operativeResolution === "SINGLE_DOCUMENT") {
      amendmentNote = "Single analyzed document in package — no amendment precedence graph yet.";
    }
  }

  const scored: Array<AskCitation & { score: number }> = [];
  for (const row of scoped) {
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary) continue;
    for (const item of summary.items) {
      const hay =
        `${item.heading} ${item.plainEnglish} ${item.operativeLanguageExcerpt} ${item.categoryLabel} ${(item.relatedDefinedTerms ?? []).join(" ")}`.toLowerCase();
      const score = scoreItem(hay, tokens, item.categoryLabel);
      if (score <= 0) continue;
      scored.push({
        sourceId: summary.sourceId,
        governingAgreement: summary.governingAgreement,
        sectionRef: item.sectionRef,
        excerpt: item.operativeLanguageExcerpt.slice(0, 400),
        epistemicStatus: item.epistemicStatus,
        score,
      });
    }
  }

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.excerpt.length - a.excerpt.length));
  const top: AskCitation[] = scored.slice(0, params.limit ?? 8).map(({ score: _s, ...c }) => c);

  if (top.length === 0) {
    return {
      kind: "insufficient_evidence",
      headline: "Insufficient retrieved evidence",
      detail: researchOnly
        ? "No matching covenant excerpts were found in the public research corpus for this question. Headroom will not invent an answer."
        : "No matching covenant excerpts were found in this workspace’s uploaded documents. Upload and analyze financing documents, or refine the question. Headroom will not invent an answer.",
      citations: [],
      limitations: [
        "Answer requires retrieved contractual text",
        "DISCOVERED candidates are not verified legal conclusions",
        researchOnly
          ? "Public corpus only — customer uploads excluded"
          : "Workspace-isolated — public precedents not treated as governing authority",
      ],
      amendmentNote,
      promotedToLegalTruth: 0,
    };
  }

  const lines = top.map(
    (c, i) =>
      `(${i + 1}) ${c.governingAgreement} — ${c.sectionRef}: “${c.excerpt.replace(/\s+/g, " ").trim()}” [${c.sourceId}]`,
  );

  const scopeLine = researchOnly
    ? "Based only on discovered covenant excerpts in the public research corpus"
    : "Based only on discovered covenant excerpts in this workspace’s uploaded document package";

  return {
    kind: "answered",
    headline: "Retrieved contractual text (not a legal determination)",
    detail:
      `${scopeLine}:\n\n` +
      lines.join("\n\n") +
      `\n\nThese excerpts are DISCOVERED_CANDIDATE material. They do not establish that a transaction is permitted, that capacity exists, or that the provision is currently operative.` +
      (amendmentNote ? `\n\n${amendmentNote}` : ""),
    citations: top,
    limitations: [
      "Retrieval-grounded only — no model invention of permissions",
      "Amendment operative state may not be fully resolved",
      researchOnly
        ? "Precedents are not governing authority for any customer agreement"
        : "Workspace-isolated — public corpus language is not substituted for this package",
      "promotedToLegalTruth remains 0",
    ],
    amendmentNote,
    promotedToLegalTruth: 0,
  };
}

export async function listSummariesInNeon(limit = 50): Promise<
  Array<{ sourceId: string; title: string; categories: string[]; candidateCount: number }>
> {
  const rows = await prisma.knowledgeSource.findMany({
    where: { storageRef: { not: null }, companyId: null },
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
