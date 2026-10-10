/**
 * Question answering over persisted covenant analyses (same objects as summaries).
 * Retrieves relevant provisions, composes an explanation, cites sections.
 * Does not invent capacity, permissions, or amendment conclusions.
 *
 * For lawyer-grade complete retrieval + independent verification + Phase 3
 * bridging, prefer `runLegalExcellence` from `./legal-excellence` (extends
 * this ranking with recursive expansion and omission detection).
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
  | "INVESTMENTS_UNRESTRICTED"
  | "INCREMENTAL_FACILITY"
  | "DEBT_LIEN_CROSS"
  | "FINANCIAL_INPUTS_CAPACITY"
  | "NON_GUARANTOR_DEBT"
  | "GUARANTEES"
  | "RATIO_PERMISSIONS"
  | "SHARED_CAPACITY"
  | "ASSET_SALES"
  | "AMENDMENT_CHANGES"
  | "LEVERAGE_DEFINITIONS"
  | "DEBT_INCURRENCE"
  | "GENERAL";

function classifyIntent(q: string): QuestionIntent {
  const s = q.toLowerCase();
  if (/amend|changed|latest amendment|what changed/.test(s)) return "AMENDMENT_CHANGES";
  if (
    /financial inputs?|calculate capacity|required.*(ebitda|financial)|what.*(needed|required).*capacity|capacity.*(require|need|input)/.test(
      s,
    )
  ) {
    return "FINANCIAL_INPUTS_CAPACITY";
  }
  if (
    /secured under|lien.*(basket|exception|permission)|debt incurred under.*secur|can.*be secured|cross.?default.*lien/.test(
      s,
    )
  ) {
    return "DEBT_LIEN_CROSS";
  }
  if (/incremental|accordion|additional (term|revolving|facility)|incremental facility/.test(s)) {
    return "INCREMENTAL_FACILITY";
  }
  if (
    /unrestricted subsidiar|invest(ment|s)? in (an )?unrestricted|designate.*unrestricted|investment basket/.test(s)
  ) {
    return "INVESTMENTS_UNRESTRICTED";
  }
  if (/shared.?cap|aggregate.?cap|in the aggregate|shared basket|builder basket|available amount/.test(s)) {
    return "SHARED_CAPACITY";
  }
  if (/ratio.?based|ratio debt|leverage.?test|pro forma.*ratio|incurrence.?test/.test(s)) {
    return "RATIO_PERMISSIONS";
  }
  if (/guarant(ee|y)|guarantee.?limitation|guarantor/.test(s) && !/non.?guarantor/.test(s)) {
    return "GUARANTEES";
  }
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
    case "DEBT_LIEN_CROSS":
      return ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"];
    case "RESTRICTED_PAYMENTS":
      return ["RESTRICTED_PAYMENTS_INVESTMENTS", "BASKETS_EXCEPTIONS_CONDITIONS"];
    case "INVESTMENTS_UNRESTRICTED":
      return ["RESTRICTED_PAYMENTS_INVESTMENTS", "BASKETS_EXCEPTIONS_CONDITIONS", "OTHER", "GUARANTEES"];
    case "INCREMENTAL_FACILITY":
      return ["DEBT_INCURRENCE", "FINANCIAL_MAINTENANCE", "BASKETS_EXCEPTIONS_CONDITIONS", "OTHER"];
    case "FINANCIAL_INPUTS_CAPACITY":
      return [
        "DEBT_INCURRENCE",
        "LIENS_SECURED_DEBT",
        "RESTRICTED_PAYMENTS_INVESTMENTS",
        "FINANCIAL_MAINTENANCE",
        "BASKETS_EXCEPTIONS_CONDITIONS",
      ];
    case "NON_GUARANTOR_DEBT":
      return ["DEBT_INCURRENCE", "GUARANTEES", "OTHER"];
    case "GUARANTEES":
      return ["GUARANTEES", "DEBT_INCURRENCE", "OTHER"];
    case "RATIO_PERMISSIONS":
      return ["DEBT_INCURRENCE", "FINANCIAL_MAINTENANCE", "BASKETS_EXCEPTIONS_CONDITIONS", "LIENS_SECURED_DEBT"];
    case "SHARED_CAPACITY":
      return [
        "DEBT_INCURRENCE",
        "LIENS_SECURED_DEBT",
        "RESTRICTED_PAYMENTS_INVESTMENTS",
        "BASKETS_EXCEPTIONS_CONDITIONS",
      ];
    case "ASSET_SALES":
      return ["ASSET_SALES", "OTHER", "BASKETS_EXCEPTIONS_CONDITIONS"];
    case "LEVERAGE_DEFINITIONS":
      return ["FINANCIAL_MAINTENANCE", "DEBT_INCURRENCE", "BASKETS_EXCEPTIONS_CONDITIONS", "OTHER"];
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
    case "DEBT_LIEN_CROSS":
      extra.push("lien", "secured", "collateral", "indebtedness", "permitted", "exception", "basket");
      break;
    case "RESTRICTED_PAYMENTS":
      extra.push("restricted", "payment", "dividend", "distribution", "repurchase");
      break;
    case "INVESTMENTS_UNRESTRICTED":
      extra.push("investment", "unrestricted", "subsidiary", "designate", "restricted", "subsidiary");
      break;
    case "INCREMENTAL_FACILITY":
      extra.push("incremental", "accordion", "facility", "term", "revolving", "leverage", "pro", "forma");
      break;
    case "FINANCIAL_INPUTS_CAPACITY":
      extra.push("ebitda", "leverage", "ratio", "debt", "cash", "interest", "assets", "pro", "forma");
      break;
    case "NON_GUARANTOR_DEBT":
      extra.push("foreign", "subsidiary", "guarantor", "loan", "party", "indebtedness");
      break;
    case "GUARANTEES":
      extra.push("guarantee", "guarantor", "guaranty", "subsidiary", "indebtedness");
      break;
    case "RATIO_PERMISSIONS":
      extra.push("ratio", "leverage", "pro", "forma", "consolidated", "ebitda", "coverage");
      break;
    case "SHARED_CAPACITY":
      extra.push("aggregate", "shared", "builder", "available", "amount", "basket", "cap");
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
  if (intent === "SECURED_DEBT" || intent === "DEBT_LIEN_CROSS") {
    if (/lien|secured|collateral/i.test(hay)) score += 4;
    if (item.category === "LIENS_SECURED_DEBT") score += 3;
    if (item.posture === "GENERAL_PROHIBITION" && item.category === "DEBT_INCURRENCE") score += 2;
  }
  if (intent === "DEBT_LIEN_CROSS") {
    if (item.category === "DEBT_INCURRENCE") score += 2;
    if (item.category === "LIENS_SECURED_DEBT") score += 3;
    if (/permitted lien|secures?|secured by/i.test(hay)) score += 3;
  }
  if (intent === "RESTRICTED_PAYMENTS" && item.category === "RESTRICTED_PAYMENTS_INVESTMENTS") {
    score += 5;
  }
  if (intent === "INVESTMENTS_UNRESTRICTED") {
    if (/unrestricted subsidiar|investment/i.test(hay)) score += 6;
    if (item.category === "RESTRICTED_PAYMENTS_INVESTMENTS") score += 3;
    if (/designate|unrestricted/i.test(hay)) score += 3;
  }
  if (intent === "INCREMENTAL_FACILITY") {
    if (/incremental|accordion|additional (term|revolving|commitment)/i.test(hay)) score += 7;
    if (/pro forma|leverage/i.test(hay) && item.category === "DEBT_INCURRENCE") score += 2;
  }
  if (intent === "FINANCIAL_INPUTS_CAPACITY") {
    if (/ebitda|leverage|ratio|greater of|grower|builder|available amount/i.test(hay)) score += 4;
    if ((item.materialBasketsThresholds ?? []).length > 0) score += 2;
  }
  if (intent === "GUARANTEES") {
    if (/guarant/i.test(hay)) score += 6;
    if (item.category === "GUARANTEES") score += 4;
  }
  if (intent === "RATIO_PERMISSIONS") {
    if (/ratio|leverage|pro forma|consolidated ebitda/i.test(hay)) score += 5;
    if ((item.conditions ?? []).some((c) => /ratio|leverage|pro forma/i.test(c))) score += 3;
  }
  if (intent === "SHARED_CAPACITY") {
    // Prefer relationship language; bare "aggregate amount" is ordinary ceiling noise.
    if (
      /shared\s+(?:capacity|basket|pool)|combined\s+with|together\s+with.{0,120}(?:pursuant\s+to|under)\s+(?:section|clause)|without\s+duplication|anti[-\s]?stack/i.test(
        hay,
      )
    ) {
      score += 8;
    } else if (/builder|available amount/i.test(hay)) {
      score += 3;
    } else if (/\baggregate\b/i.test(hay)) {
      score += 1;
    }
  }
  if (intent === "ASSET_SALES") {
    if (item.category === "ASSET_SALES") score += 8;
    if (/\b(asset sale|disposition|sell.*property|sale of assets)\b/i.test(hay)) score += 6;
    // Do not let RP/builder baskets masquerade as asset-sale answers
    if (item.category === "RESTRICTED_PAYMENTS_INVESTMENTS" && !/disposition|asset sale/i.test(hay)) {
      score -= 6;
    }
  }
  if (intent === "NON_GUARANTOR_DEBT") {
    if (/foreign subsidiar|not a loan party|non-guarantor/i.test(hay)) score += 5;
  }
  if (intent === "LEVERAGE_DEFINITIONS") {
    const defHit = (item.applicableDefinitions ?? []).some((d) =>
      /leverage|ebitda|coverage|consolidated total debt|total net leverage/i.test(d.term),
    );
    if (defHit) score += 10;
    if (/definition|means|shall mean/i.test(hay) && /leverage|ebitda|coverage/i.test(hay)) score += 8;
    if (item.category === "FINANCIAL_MAINTENANCE") score += 5;
    // Penalize RP baskets that merely mention leverage in a ratio-debt exception
    if (
      item.category === "RESTRICTED_PAYMENTS_INVESTMENTS" &&
      !defHit &&
      !/financial condition covenant|leverage ratio means/i.test(hay)
    ) {
      score -= 8;
    }
    if (item.category === "BASKETS_EXCEPTIONS_CONDITIONS" && !defHit) score -= 4;
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

function parseProposedAmount(question: string): string | null {
  const m =
    question.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion)?/i) ||
    question.match(/\b([\d,]+(?:\.\d+)?)\s*(million|billion)\s+(?:of\s+)?(?:secured\s+)?debt\b/i);
  if (!m) return null;
  const n = Number((m[1] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "billion") return `$${n} billion`;
  if (unit === "million") return `$${n} million`;
  return `$${n.toLocaleString("en-US")}`;
}

function composeAnswer(params: {
  question: string;
  intent: QuestionIntent;
  items: Array<CovenantSummaryItem & { sourceId: string; score: number }>;
  researchOnly: boolean;
  amendmentNote?: string;
}): AskRetrieveAnswer {
  const top = params.items.slice(0, 6);
  const proposedAmount = parseProposedAmount(params.question);
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

  const amountLead =
    proposedAmount && (params.intent === "SECURED_DEBT" || params.intent === "DEBT_INCURRENCE")
      ? `Proposed amount ${proposedAmount}: Headroom can identify the contractual path (debt + lien regimes, baskets, conditions) but cannot determine whether ${proposedAmount} is available without approved financial inputs, basket utilization, and an executable rulebook. `
      : "";

  const intentLead: Record<QuestionIntent, string> = {
    SECURED_DEBT:
      amountLead +
      "Additional secured debt is governed by the agreement’s indebtedness and liens regimes. Both regimes typically apply — permission under a debt basket does not alone authorize a Lien. The source-backed analysis of matching provisions is:",
    DEBT_LIEN_CROSS:
      "Whether debt incurred under one indebtedness exception may be secured under a separate liens exception is a cross-covenant question. Permission under Indebtedness does not automatically create a Permitted Lien, and vice versa. Matching debt and lien analyses say:",
    RESTRICTED_PAYMENTS:
      "Restricted payments are generally prohibited except for enumerated baskets. Matching analyzed provisions say:",
    INVESTMENTS_UNRESTRICTED:
      "Investments in unrestricted subsidiaries (and designations of unrestricted subsidiaries) are typically controlled by the Investments / Restricted Payments regime and related designation conditions. Matching analyzed provisions say:",
    INCREMENTAL_FACILITY:
      "Incremental / accordion facilities are typically gated by indebtedness baskets, leverage or pro forma tests, and lien capacity if secured. Matching analyzed provisions say:",
    FINANCIAL_INPUTS_CAPACITY:
      "Contractual capacity is not determinable from discovery summaries alone. Financial inputs that are commonly required (only when the operative rulebook uses them) include: Consolidated EBITDA / Adjusted EBITDA, total and secured debt, cash for netting where the definition allows, interest expense / fixed charges, total assets for grower baskets, pro forma adjustments, and the testing date. Matching provisions that imply those inputs say:",
    NON_GUARANTOR_DEBT:
      "Debt at non-guarantor / non-Loan-Party subsidiaries depends on specific indebtedness baskets and entity-scope language. Matching analyzed provisions say:",
    GUARANTEES:
      "Guarantee limitations typically restrict Loan Party / Restricted Subsidiary guarantees of third-party or non-guarantor indebtedness, subject to enumerated exceptions. Matching analyzed provisions say:",
    RATIO_PERMISSIONS:
      "Ratio-based permissions (for example leverage or coverage tests) are conditional — they are not available capacity without approved contractual financial inputs and operative definitions. Matching analyzed provisions say:",
    SHARED_CAPACITY:
      "Shared-capacity / aggregate-cap language can link multiple baskets. Permission under one clause may consume capacity shared with another. Matching analyzed provisions say:",
    ASSET_SALES:
      "Asset sales / dispositions are typically prohibited except enumerated exceptions. Matching analyzed provisions say:",
    AMENDMENT_CHANGES:
      "Amendment effects are reported only from analyzed package documents. Precedence may be unresolved. Matching analyzed provisions say:",
    LEVERAGE_DEFINITIONS:
      "Leverage and related ratios are controlled by the cited maintenance covenants and any matched definitions. Matching analyzed provisions say:",
    DEBT_INCURRENCE:
      amountLead +
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
    const defs = (item.applicableDefinitions ?? []).slice(0, 3);
    if (defs.length > 0) {
      bits.push(
        `Material definitions: ${defs
          .map((d) => `${d.term}${d.excerpt ? ` — “${d.excerpt.slice(0, 160)}”` : ""}`)
          .join("; ")}.`,
      );
    } else if ((item.relatedDefinedTerms ?? []).length > 0) {
      bits.push(`Related defined terms: ${(item.relatedDefinedTerms ?? []).slice(0, 5).join(", ")}.`);
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
      proposedAmount
      ? `Numerical capacity for ${proposedAmount}: conditional / NOT DETERMINABLE until inputs exist. AI identified the contractual pathways above; required for a supported amount: (1) operative amendment resolution, (2) counsel-reviewed rulebook for selected baskets, (3) financial snapshot matching contractual definitions, (4) ledger utilization for shared/fixed baskets.`
      : "",
    params.intent === "FINANCIAL_INPUTS_CAPACITY"
      ? "AI analysis of permissions/baskets is available for counsel review even without a financial snapshot. Numerical capacity remains conditional until (1) amendment resolution, (2) counsel-reviewed executable rules, (3) user-confirmed financial inputs matching contractual definitions (GAAP ≠ contract metrics), and (4) ledger utilization where usage-tracked."
      : "",
    params.intent === "DEBT_LIEN_CROSS"
      ? "Cross-covenant conclusion: do not treat an Indebtedness basket as a Lien permission. Both regimes must independently support the structure, subject to shared caps and conditions."
      : "",
    params.intent === "RATIO_PERMISSIONS" || params.intent === "SHARED_CAPACITY"
      ? "AI identifies ratio/shared-capacity language for counsel review. Numerical results remain conditional on a counsel-reviewed rulebook, financial snapshot, and ledger utilization where applicable — Headroom does not invent missing figures."
      : "",
    params.amendmentNote ? params.amendmentNote : "",
    "These are AI-generated, source-backed interpretations for customer counsel review. They are not a substitute for counsel judgment, do not invent capacity figures, and do not establish that a transaction is permitted until counsel accepts the controlling reading and required inputs exist.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const counselTouched = top.some(
    (i) => i.reviewerDecision === "ACCEPTED" || i.reviewerDecision === "EDITED",
  );

  return {
    kind: "answered",
    headline: counselTouched
      ? "Source-backed covenant analysis (includes counsel-approved interpretations)"
      : "AI source-backed covenant analysis (for counsel review — not a legal determination)",
    detail,
    citations,
    restrictions: uniqRestrictions,
    permissions: uniqPermissions,
    unresolved: uniqUnresolved,
    limitations: [
      "AI-first interpretation composed from persisted provision analyses — counsel reviews and controls the workspace reading",
      "Permissions listed are textual exceptions/baskets, not confirmed available capacity",
      params.researchOnly
        ? "Precedents are not governing authority for any customer agreement"
        : "Workspace-isolated — public corpus language is not substituted for this package",
      "Missing financial inputs yield conditional analysis, not invented numbers",
      "promotedToLegalTruth remains 0 until counsel/compiler promotion",
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
  let scored = params.items
    .map((item) => {
      let score = scoreItem(item, intent, tokens);
      // Prefer counsel-accepted / edited interpretations in the workspace.
      if (item.reviewerDecision === "ACCEPTED" || item.reviewerDecision === "EDITED") score += 4;
      return { ...item, score };
    })
    .filter((i) => i.score >= 3)
    .sort((a, b) => b.score - a.score);
  // Sync helper keeps ranking+compose; the customer-facing async path
  // (`answerFromCorpus`) runs full legal excellence (retrieval + adversarial verify).

  // Prefer at least one debt + one lien hit for cross-regime questions.
  if (intent === "SECURED_DEBT" || intent === "DEBT_LIEN_CROSS") {
    const debt = scored.find((i) => i.category === "DEBT_INCURRENCE");
    const lien = scored.find((i) => i.category === "LIENS_SECURED_DEBT");
    const rest = scored.filter((i) => i !== debt && i !== lien);
    const preferred = [debt, lien, ...rest].filter(Boolean) as typeof scored;
    if (preferred.length > 0) scored = preferred;
  }

  // Financial-inputs questions remain answerable even without strong matches.
  if (intent === "FINANCIAL_INPUTS_CAPACITY" && scored.length === 0) {
    scored = params.items
      .map((item) => ({ ...item, score: scoreItem(item, intent, tokens) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(3, params.limit ?? 6));
  }

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
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const approvals = Array.isArray(meta.reviewerApprovals)
      ? (meta.reviewerApprovals as import("../customer-intelligence/reviewer-approvals").ReviewerApproval[])
      : [];
    const { applyReviewerOverlayToItems } = await import(
      "../customer-intelligence/reviewer-approvals"
    );
    const overlaid = researchOnly
      ? summary.items
      : applyReviewerOverlayToItems(
          summary.items.map((i) => ({ ...i, sourceId: summary.sourceId })),
          approvals,
        );
    for (const item of overlaid) {
      items.push({ ...item, sourceId: summary.sourceId });
    }
  }

  // Customer-facing Ask path: complete retrieval + independent adversarial
  // verification + certification bridge (never invent executable capacity).
  const { runLegalExcellence } = await import("./legal-excellence");
  const excellence = runLegalExcellence({
    question: q,
    items,
    researchOnly,
    amendmentNote,
    transactionDescription: q,
    limit: params.limit ?? 6,
  });
  return excellence.bridged.ask;
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
