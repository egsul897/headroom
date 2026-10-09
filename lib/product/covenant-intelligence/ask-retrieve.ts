/**
 * Question answering over persisted covenant analyses (same objects as summaries).
 * Retrieves relevant provisions, composes an explanation, cites sections.
 * Does not invent capacity, permissions, or amendment conclusions.
 */

import { prisma } from "../../prisma";
import { summarizeFromStoredMetadata, type CovenantSummaryItem, type DocumentCovenantSummary } from "./summarize";
import type { AmendmentPackageView } from "../customer-intelligence/amendment-package";
import { isSubstantiveFinancingPrecedent } from "./corpus-quality";

export interface AskCitation {
  sourceId: string;
  governingAgreement: string;
  sectionRef: string;
  excerpt: string;
  epistemicStatus: string;
  posture?: string;
}

export interface AskRetrieveAnswer {
  kind: "answered" | "insufficient_evidence" | "refused";
  headline: string;
  detail: string;
  citations: AskCitation[];
  limitations: string[];
  amendmentNote?: string;
  restrictions?: string[];
  permissions?: string[];
  unresolved?: string[];
  promotedToLegalTruth: 0;
}

type QuestionIntent =
  | "SECURED_DEBT"
  | "RESTRICTED_PAYMENTS"
  | "NON_GUARANTOR_DEBT"
  | "ASSET_SALES"
  | "AMENDMENT_CHANGES"
  | "LEVERAGE_DEFINITIONS"
  | "DEBT_INCURRENCE"
  | "GENERAL";

function classifyIntent(q: string): QuestionIntent {
  const s = q.toLowerCase();
  if (/amend|changed|latest amendment|what changed/.test(s)) return "AMENDMENT_CHANGES";
  if (/leverage|coverage ratio|definition.*(ratio|leverage)|(ratio|leverage).*definition/.test(s)) {
    return "LEVERAGE_DEFINITIONS";
  }
  if (/secured debt|additional secured|lien|collateral/.test(s)) return "SECURED_DEBT";
  if (/restricted.?payment|dividend|rp basket|distribution/.test(s)) return "RESTRICTED_PAYMENTS";
  if (/non.?guarantor|unguaranteed|foreign subsidiar/.test(s)) return "NON_GUARANTOR_DEBT";
  if (/asset.?sale|disposition/.test(s)) return "ASSET_SALES";
  if (/debt|indebtedness|incur/.test(s)) return "DEBT_INCURRENCE";
  return "GENERAL";
}

function intentCategories(intent: QuestionIntent): string[] {
  switch (intent) {
    case "SECURED_DEBT":
      return ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"];
    case "RESTRICTED_PAYMENTS":
      return ["RESTRICTED_PAYMENTS_INVESTMENTS", "BASKETS_EXCEPTIONS_CONDITIONS"];
    case "NON_GUARANTOR_DEBT":
      return ["DEBT_INCURRENCE", "GUARANTEES", "OTHER"];
    case "ASSET_SALES":
      return ["ASSET_SALES"];
    case "LEVERAGE_DEFINITIONS":
      return ["FINANCIAL_MAINTENANCE", "BASKETS_EXCEPTIONS_CONDITIONS", "DEBT_INCURRENCE"];
    case "DEBT_INCURRENCE":
      return ["DEBT_INCURRENCE"];
    case "AMENDMENT_CHANGES":
      return Object.keys({
        DEBT_INCURRENCE: 1,
        LIENS_SECURED_DEBT: 1,
        RESTRICTED_PAYMENTS_INVESTMENTS: 1,
        FINANCIAL_MAINTENANCE: 1,
        OTHER: 1,
      });
    default:
      return [];
  }
}

function intentTokens(intent: QuestionIntent, question: string): string[] {
  const base = question
    .toLowerCase()
    .split(/[^a-z0-9$%]+/)
    .filter((t) => t.length > 2);
  const extra: string[] = [];
  switch (intent) {
    case "SECURED_DEBT":
      extra.push("lien", "secured", "collateral", "indebtedness", "security");
      break;
    case "RESTRICTED_PAYMENTS":
      extra.push("restricted", "payment", "dividend", "distribution", "repurchase");
      break;
    case "NON_GUARANTOR_DEBT":
      extra.push("foreign", "subsidiary", "guarantor", "loan", "party", "indebtedness");
      break;
    case "ASSET_SALES":
      extra.push("asset", "sale", "disposition", "property");
      break;
    case "LEVERAGE_DEFINITIONS":
      extra.push("leverage", "consolidated", "ebitda", "ratio", "coverage");
      break;
    case "DEBT_INCURRENCE":
      extra.push("indebtedness", "debt", "incur", "basket");
      break;
    case "AMENDMENT_CHANGES":
      extra.push("amendment", "amended", "restated");
      break;
  }
  return Array.from(new Set([...base, ...extra]));
}

function scoreItem(item: CovenantSummaryItem, intent: QuestionIntent, tokens: string[]): number {
  const cats = intentCategories(intent);
  let score = 0;
  if (cats.length === 0 || cats.includes(item.category)) score += 4;
  else score -= 3;

  const hay =
    `${item.heading} ${item.plainEnglish} ${item.operativeLanguageExcerpt} ${item.categoryLabel} ${(item.relatedDefinedTerms ?? []).join(" ")} ${(item.permissions ?? []).join(" ")}`.toLowerCase();

  for (const t of tokens) {
    if (hay.includes(t)) score += 1;
  }

  // Intent-specific boosts from structured fields
  if (intent === "SECURED_DEBT") {
    if (/lien|secured|collateral/i.test(hay)) score += 4;
    if (item.category === "LIENS_SECURED_DEBT") score += 3;
    if (item.posture === "GENERAL_PROHIBITION" && item.category === "DEBT_INCURRENCE") score += 2;
  }
  if (intent === "RESTRICTED_PAYMENTS" && item.category === "RESTRICTED_PAYMENTS_INVESTMENTS") {
    score += 5;
  }
  if (intent === "ASSET_SALES" && item.category === "ASSET_SALES") score += 6;
  if (intent === "NON_GUARANTOR_DEBT") {
    if (/foreign subsidiar|not a loan party|non-guarantor/i.test(hay)) score += 5;
  }
  if (intent === "LEVERAGE_DEFINITIONS") {
    if (/leverage|coverage|consolidated ebitda/i.test(hay)) score += 4;
    if ((item.applicableDefinitions ?? []).some((d) => /leverage|ebitda|coverage/i.test(d.term))) {
      score += 4;
    }
  }
  if (intent === "AMENDMENT_CHANGES") {
    if (/amend|restat/i.test(item.governingAgreement + item.heading)) score += 3;
  }

  // Demote EOD noise for non-default questions
  if (item.category === "EVENTS_OF_DEFAULT" && intent !== "GENERAL") score -= 4;

  // Prefer provisions with substantive analysis fields
  if (item.restriction) score += 1;
  if ((item.permissions?.length ?? 0) > 0) score += 1;
  if ((item.materialBasketsThresholds?.length ?? 0) > 0) score += 1;
  if (item.plainEnglish && !/appears to address/.test(item.plainEnglish)) score += 2;

  return score;
}

function amendmentFromMetadata(metadata: unknown): AmendmentPackageView | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const ap = (metadata as Record<string, unknown>).amendmentPackage;
  if (!ap || typeof ap !== "object") return null;
  return ap as AmendmentPackageView;
}

function composeAnswer(params: {
  question: string;
  intent: QuestionIntent;
  items: Array<CovenantSummaryItem & { sourceId: string; score: number }>;
  researchOnly: boolean;
  amendmentNote?: string;
}): AskRetrieveAnswer {
  const top = params.items.slice(0, 6);
  if (top.length === 0) {
    return {
      kind: "insufficient_evidence",
      headline: "Insufficient analyzed provisions",
      detail: params.researchOnly
        ? "No matching substantive financing-covenant analyses were found in the public research corpus. Headroom will not invent an answer."
        : "No matching substantive covenant analyses were found in this workspace’s uploaded documents. Headroom will not invent an answer.",
      citations: [],
      limitations: [
        "Answer requires persisted provision analysis",
        "DISCOVERED candidates are not verified legal conclusions",
      ],
      amendmentNote: params.amendmentNote,
      promotedToLegalTruth: 0,
    };
  }

  const restrictions: string[] = [];
  const permissions: string[] = [];
  const unresolved: string[] = [];
  const citations: AskCitation[] = [];

  for (const item of top) {
    if (item.restriction) {
      restrictions.push(`${item.sectionRef}: ${item.restriction}`);
    } else if (item.posture === "GENERAL_PROHIBITION" || item.posture === "MAINTENANCE_TEST") {
      restrictions.push(`${item.sectionRef}: ${item.plainEnglish.split(". ")[0]}.`);
    }
    for (const p of (item.permissions ?? []).slice(0, 3)) {
      permissions.push(`${item.sectionRef}: ${p}`);
    }
    for (const b of (item.materialBasketsThresholds ?? []).slice(0, 2)) {
      permissions.push(`${item.sectionRef} basket/threshold: ${b}`);
    }
    for (const u of (item.unresolvedQuestions ?? []).slice(0, 2)) {
      unresolved.push(`${item.sectionRef}: ${u}`);
    }
    citations.push({
      sourceId: item.sourceId,
      governingAgreement: item.governingAgreement,
      sectionRef: item.sectionRef,
      excerpt: item.operativeLanguageExcerpt.slice(0, 400),
      epistemicStatus: item.epistemicStatus,
      posture: item.posture,
    });
  }

  // Deduplicate unresolved
  const uniqUnresolved = Array.from(new Set(unresolved)).slice(0, 8);
  const uniqRestrictions = Array.from(new Set(restrictions)).slice(0, 6);
  const uniqPermissions = Array.from(new Set(permissions)).slice(0, 10);

  const intentLead: Record<QuestionIntent, string> = {
    SECURED_DEBT:
      "Additional secured debt is governed by the agreement’s indebtedness and liens regimes. The source-backed analysis of matching provisions is:",
    RESTRICTED_PAYMENTS:
      "Restricted payments are generally prohibited except for enumerated baskets. Matching analyzed provisions say:",
    NON_GUARANTOR_DEBT:
      "Debt at non-guarantor / non-Loan-Party subsidiaries depends on specific indebtedness baskets and entity-scope language. Matching analyzed provisions say:",
    ASSET_SALES:
      "Asset sales / dispositions are typically prohibited except enumerated exceptions. Matching analyzed provisions say:",
    AMENDMENT_CHANGES:
      "Amendment effects are reported only from analyzed package documents. Precedence may be unresolved. Matching analyzed provisions say:",
    LEVERAGE_DEFINITIONS:
      "Leverage and related ratios are controlled by the cited maintenance covenants and any matched definitions. Matching analyzed provisions say:",
    DEBT_INCURRENCE:
      "Debt incurrence is typically a general prohibition with enumerated exceptions. Matching analyzed provisions say:",
    GENERAL: "Matching analyzed provisions say:",
  };

  const explanationBlocks = top.map((item, i) => {
    const bits = [
      `(${i + 1}) §${item.sectionRef} — ${item.heading} [${item.posture}]`,
      item.plainEnglish,
    ];
    if (item.coveredEntities?.length) {
      bits.push(`Covered entities: ${item.coveredEntities.join(", ")}.`);
    }
    if (item.dependencies?.length) {
      bits.push(`Dependencies: ${item.dependencies.slice(0, 2).join("; ")}.`);
    }
    bits.push(`Citation: ${item.sourceCitation}`);
    return bits.join("\n");
  });

  const detail = [
    intentLead[params.intent],
    "",
    explanationBlocks.join("\n\n"),
    "",
    "Contractual restrictions identified:",
    uniqRestrictions.length ? uniqRestrictions.map((r) => `• ${r}`).join("\n") : "• None clearly segmented — see explanations and unresolved items.",
    "",
    "Available permissions / baskets identified (not capacity):",
    uniqPermissions.length ? uniqPermissions.map((p) => `• ${p}`).join("\n") : "• None clearly segmented from retrieved analyses.",
    "",
    "Unresolved:",
    uniqUnresolved.length ? uniqUnresolved.map((u) => `• ${u}`).join("\n") : "• None flagged beyond general discovery limits.",
    "",
    params.amendmentNote ? params.amendmentNote : "",
    "These statements are DISCOVERED_CANDIDATE analyses shared with the covenant-summary store. They do not establish that a transaction is permitted, that capacity exists, or that language is currently operative after amendments.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return {
    kind: "answered",
    headline: "Source-backed covenant analysis (not a legal determination)",
    detail,
    citations,
    restrictions: uniqRestrictions,
    permissions: uniqPermissions,
    unresolved: uniqUnresolved,
    limitations: [
      "Composed from persisted provision analyses — not a second legal engine",
      "Permissions listed are textual exceptions/baskets, not confirmed available capacity",
      params.researchOnly
        ? "Precedents are not governing authority for any customer agreement"
        : "Workspace-isolated — public corpus language is not substituted for this package",
      "promotedToLegalTruth remains 0",
    ],
    amendmentNote: params.amendmentNote,
    promotedToLegalTruth: 0,
  };
}

/** Answer from already-loaded summary items (shared with summarize persistence). */
export function answerFromSummaryItems(params: {
  question: string;
  items: Array<CovenantSummaryItem & { sourceId: string }>;
  researchOnly?: boolean;
  amendmentNote?: string;
  limit?: number;
}): AskRetrieveAnswer {
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
  const intent = classifyIntent(q);
  const tokens = intentTokens(intent, q);
  const scored = params.items
    .map((item) => ({ ...item, score: scoreItem(item, intent, tokens) }))
    .filter((i) => i.score >= 3)
    .sort((a, b) => b.score - a.score);
  return composeAnswer({
    question: q,
    intent,
    items: scored.slice(0, params.limit ?? 6),
    researchOnly: params.researchOnly ?? true,
    amendmentNote: params.amendmentNote,
  });
}

export async function answerFromCorpus(params: {
  question: string;
  sourceId?: string;
  companyId?: string;
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

  const researchOnly = params.researchOnly === true || !params.companyId;

  const where = params.sourceId
    ? {
        sourceId: params.sourceId,
        ...(researchOnly ? { companyId: null as string | null } : { companyId: params.companyId }),
      }
    : researchOnly
      ? { storageRef: { not: null }, companyId: null as string | null }
      : { storageRef: { not: null }, companyId: params.companyId };

  const rows = await prisma.knowledgeSource.findMany({
    where,
    take: params.sourceId ? 1 : 120,
    orderBy: { filingDate: "desc" },
  });

  const scoped = researchOnly
    ? rows.filter((r) => r.companyId == null && isSubstantiveFinancingPrecedent(r))
    : rows.filter((r) => r.companyId === params.companyId);

  let amendmentNote: string | undefined;
  for (const row of scoped) {
    const ap = amendmentFromMetadata(row.metadata);
    if (ap?.operativeResolution === "UNRESOLVED_PRECEDENCE") {
      amendmentNote =
        `Amendment precedence is UNRESOLVED (${ap.unresolvedReasons.join("; ")}). ` +
        `Do not treat retrieved historical language as operative without package resolution.`;
      break;
    }
  }

  const items: Array<CovenantSummaryItem & { sourceId: string }> = [];
  for (const row of scoped) {
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary) continue;
    for (const item of summary.items) {
      items.push({ ...item, sourceId: summary.sourceId });
    }
  }

  return answerFromSummaryItems({
    question: q,
    items,
    researchOnly,
    amendmentNote,
    limit: params.limit ?? 6,
  });
}

export async function listSummariesInNeon(limit = 50): Promise<
  Array<{ sourceId: string; title: string; categories: string[]; candidateCount: number }>
> {
  const rows = await prisma.knowledgeSource.findMany({
    where: { storageRef: { not: null }, companyId: null },
    take: Math.max(limit * 3, 80),
    orderBy: { filingDate: "desc" },
  });
  const out: Array<{ sourceId: string; title: string; categories: string[]; candidateCount: number }> = [];
  for (const row of rows) {
    if (!isSubstantiveFinancingPrecedent(row)) continue;
    const summary = summarizeFromStoredMetadata(row.metadata) as DocumentCovenantSummary | null;
    if (!summary) {
      out.push({
        sourceId: row.sourceId,
        title: row.documentTitle,
        categories: [],
        candidateCount: 0,
      });
    } else {
      out.push({
        sourceId: row.sourceId,
        title: summary.governingAgreement,
        categories: Object.keys(summary.countsByCategory),
        candidateCount: summary.items.length,
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}
