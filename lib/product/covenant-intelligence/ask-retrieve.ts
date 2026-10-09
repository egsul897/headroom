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
  | "INVESTMENTS_ACQUISITIONS"
  | "REFINANCING"
  | "GUARANTEES"
  | "INCREMENTAL_FACILITIES"
  | "GENERAL";

/** Extract a defined-term query ("What constitutes Consolidated EBITDA?" → term). */
export function extractDefinedTermQuery(q: string): string | null {
  const s = q.trim().replace(/\?+$/, "");
  const patterns = [
    /^what\s+constitutes\s+(.+)$/i,
    /^what\s+is\s+(?:the\s+)?(?:definition\s+of\s+)?(.+)$/i,
    /^definition\s+of\s+(.+)$/i,
    /^how\s+is\s+(.+?)\s+(?:defined|calculated|computed)$/i,
    /^how\s+do(?:es)?\s+(.+?)\s+(?:get\s+)?(?:defined|calculated|computed)$/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) {
      const term = m[1].replace(/\s+/g, " ").trim();
      if (term.length >= 3 && term.length <= 80) return term;
    }
  }
  return null;
}

function classifyIntent(q: string): QuestionIntent {
  const s = q.toLowerCase();
  if (/amend|changed|latest amendment|what changed/.test(s)) return "AMENDMENT_CHANGES";
  // Definitional / ratio-construction questions — including "what constitutes EBITDA"
  // which previously fell through to GENERAL and retrieved unrelated baskets.
  if (
    extractDefinedTermQuery(q) ||
    /leverage|coverage ratio|ebitda|definition.*(ratio|leverage|ebitda|indebtedness)|(ratio|leverage|ebitda).*definition/.test(
      s,
    )
  ) {
    return "LEVERAGE_DEFINITIONS";
  }
  if (/secured debt|additional secured|lien|collateral/.test(s)) return "SECURED_DEBT";
  if (/restricted.?payment|dividend|rp basket|distribution/.test(s)) return "RESTRICTED_PAYMENTS";
  if (/non.?guarantor|unguaranteed|foreign subsidiar/.test(s)) return "NON_GUARANTOR_DEBT";
  if (/asset.?sale|disposition/.test(s)) return "ASSET_SALES";
  if (
    /incremental (?:facilit|amount|equivalent|cap)|ratio incremental|fixed incremental|cash-capped incremental|prepayment-based incremental|ratio-based incremental/.test(
      s,
    )
  ) {
    return "INCREMENTAL_FACILITIES";
  }
  if (/refinanc|refund|extend|replace.*debt|permitted refinancing/.test(s)) return "REFINANCING";
  if (/guarant(?:y|ee)|guarantee obligation/.test(s)) return "GUARANTEES";
  if (/investment|acquisition|acquire|permitted acquisition/.test(s)) return "INVESTMENTS_ACQUISITIONS";
  if (/debt|indebtedness|incur/.test(s)) return "DEBT_INCURRENCE";
  return "GENERAL";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a defined-term query to the definition bank.
 * Prefer exact / shortest whole-phrase hits so "Consolidated EBITDA" does not
 * resolve to "Consolidated First Lien Secured Debt to Consolidated EBITDA Ratio".
 */
function matchDefinedTerm(
  query: string,
  terms: Array<{ term: string; excerpt: string }>,
): { term: string; excerpt: string } | null {
  const q = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!q) return null;
  const normalized = terms.map((t) => ({
    ...t,
    key: t.term.toLowerCase().replace(/\s+/g, " ").trim(),
  }));
  const exact = normalized.find((t) => t.key === q);
  if (exact) return { term: exact.term, excerpt: exact.excerpt };

  const phrase = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(q)}(?:[^a-z0-9]|$)`, "i");
  const termContainsQuery = normalized.filter((t) => phrase.test(t.key));
  if (termContainsQuery.length > 0) {
    termContainsQuery.sort((a, b) => a.key.length - b.key.length);
    return { term: termContainsQuery[0]!.term, excerpt: termContainsQuery[0]!.excerpt };
  }

  const queryContainsTerm = normalized.filter((t) => {
    if (t.key.length < 4) return false;
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(t.key)}(?:[^a-z0-9]|$)`, "i");
    return re.test(q);
  });
  if (queryContainsTerm.length > 0) {
    queryContainsTerm.sort((a, b) => b.key.length - a.key.length);
    return { term: queryContainsTerm[0]!.term, excerpt: queryContainsTerm[0]!.excerpt };
  }
  return null;
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
    case "INVESTMENTS_ACQUISITIONS":
      return ["RESTRICTED_PAYMENTS_INVESTMENTS", "MERGERS_FUNDAMENTAL_CHANGES", "DEBT_INCURRENCE"];
    case "REFINANCING":
      return ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT", "BASKETS_EXCEPTIONS_CONDITIONS"];
    case "GUARANTEES":
      return ["GUARANTEES", "DEBT_INCURRENCE"];
    case "INCREMENTAL_FACILITIES":
      return ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT", "FINANCIAL_MAINTENANCE", "BASKETS_EXCEPTIONS_CONDITIONS"];
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
    case "INVESTMENTS_ACQUISITIONS":
      extra.push("investment", "acquisition", "acquire", "equity", "subsidiary");
      break;
    case "REFINANCING":
      extra.push("refinance", "refinancing", "refund", "extend", "replace", "permitted");
      break;
    case "GUARANTEES":
      extra.push("guarantee", "guaranty", "guarantor", "obligation");
      break;
    case "INCREMENTAL_FACILITIES":
      extra.push(
        "incremental",
        "facility",
        "ratio",
        "fixed",
        "voluntary",
        "prepayment",
        "leverage",
        "reallocated",
      );
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
    if (item.posture === "GENERAL_PROHIBITION" && item.category === "LIENS_SECURED_DEBT") score += 6;
    if (/^(?:limitations?\s+on\s+)?liens?\b/i.test(item.heading)) score += 10;
    if (/^(?:limitations?\s+on\s+)?indebtedness\b/i.test(item.heading)) score += 8;
    if (item.posture === "GENERAL_PROHIBITION" && item.category === "DEBT_INCURRENCE") score += 2;
    // Representations / affirmative / ownership-of-property "Liens" are not the liens covenant.
    if (
      /representation|affirmative|insurance|ownership of propert|title to|properties\b/i.test(item.heading) ||
      /^[45]\.\d+/i.test(item.sectionRef)
    ) {
      score -= 10;
    }
    // Financial-maintenance ratios are not the secured-debt basket regime.
    if (item.posture === "MAINTENANCE_TEST" || item.category === "FINANCIAL_MAINTENANCE") {
      score -= 6;
    }
  }
  if (intent === "RESTRICTED_PAYMENTS") {
    if (item.category === "RESTRICTED_PAYMENTS_INVESTMENTS") {
      score += 5;
      if (item.posture === "GENERAL_PROHIBITION") score += 5;
      if (/\brestricted\s+payments?\b/i.test(item.heading)) score += 6;
    }
    if (item.category === "DEBT_INCURRENCE") score -= 4;
  }
  if (intent === "ASSET_SALES" && item.category === "ASSET_SALES") score += 6;
  if (intent === "NON_GUARANTOR_DEBT") {
    if (/foreign subsidiar|not a loan party|non-guarantor/i.test(hay)) score += 5;
  }
  if (intent === "INVESTMENTS_ACQUISITIONS") {
    if (item.category === "RESTRICTED_PAYMENTS_INVESTMENTS") score += 5;
    if (/^investments?\b|permitted acquisition|limitation on investment/i.test(item.heading)) score += 8;
    if (/acquisition|investments?\b/i.test(hay)) score += 3;
    if ((item.materialBasketsThresholds ?? []).some((b) => /shared|grower|greater-of|available amount/i.test(b))) {
      score += 3;
    }
  }
  if (intent === "REFINANCING") {
    if (/refinanc|refund|extend|replace/i.test(hay)) score += 6;
    if (item.category === "DEBT_INCURRENCE") score += 3;
  }
  if (intent === "GUARANTEES") {
    if (item.category === "GUARANTEES") score += 7;
    if (/guarant/i.test(hay)) score += 4;
  }
  if (intent === "INCREMENTAL_FACILITIES") {
    if (/\bincremental\b/i.test(hay)) score += 8;
    if ((item.materialBasketsThresholds ?? []).some((b) => /Incremental path|Incremental Amount/i.test(b))) {
      score += 6;
    }
    if (
      /ratio incremental|fixed incremental|voluntary prepayment incremental|cash-capped incremental|ratio-based incremental|prepayment-based incremental/i.test(
        hay,
      )
    ) {
      score += 5;
    }
    if (/reclassif|reallocated|redesignat|default utilization/i.test(hay)) score += 3;
  }
  // Prefer provisions that surface quantitative mechanics for capacity questions
  if (
    (intent === "DEBT_INCURRENCE" ||
      intent === "RESTRICTED_PAYMENTS" ||
      intent === "INVESTMENTS_ACQUISITIONS" ||
      intent === "SECURED_DEBT") &&
    (item.materialBasketsThresholds?.length ?? 0) > 0
  ) {
    score += 2;
    if ((item.materialBasketsThresholds ?? []).some((b) => /grower|greater-of|shared|builder|available amount|ratio/i.test(b))) {
      score += 3;
    }
  }
  if (
    (tokens.includes("available") && tokens.includes("amount")) ||
    tokens.includes("builder") ||
    (tokens.includes("share") && tokens.includes("capacity"))
  ) {
    if ((item.materialBasketsThresholds ?? []).some((b) => /Available Amount|Builder|Shared/i.test(b))) score += 6;
    if (/\bAvailable Amount\b/i.test(hay)) score += 4;
  }
  if (intent === "LEVERAGE_DEFINITIONS") {
    if (/leverage|coverage|consolidated ebitda|\bebitda\b/i.test(hay)) score += 4;
    if ((item.applicableDefinitions ?? []).some((d) => /leverage|ebitda|coverage/i.test(d.term))) {
      score += 6;
    }
    // Demote incremental-facility / pricing noise that merely mentions EBITDA.
    if (/incremental|facility|pricing|commitment fee|applicable margin/i.test(hay) && item.category !== "FINANCIAL_MAINTENANCE") {
      score -= 5;
    }
    if (item.category === "FINANCIAL_MAINTENANCE") score += 3;
    // Prefer provisions that attach the asked defined term when tokens include it.
    if (
      tokens.some((t) => t.length > 4) &&
      (item.applicableDefinitions ?? []).some((d) =>
        tokens.some((t) => d.term.toLowerCase().includes(t) || t.includes(d.term.toLowerCase().split(/\s+/)[0] ?? "")),
      )
    ) {
      score += 5;
    }
  }
  if (intent === "AMENDMENT_CHANGES") {
    if (/amend|restat/i.test(item.governingAgreement + item.heading)) score += 3;
  }
  if (intent === "DEBT_INCURRENCE") {
    if (item.category === "DEBT_INCURRENCE" && item.posture === "GENERAL_PROHIBITION") score += 5;
    if (/^indebtedness\b/i.test(item.heading) || /\blimitation on indebtedness\b/i.test(item.heading)) {
      score += 6;
    }
    // Investment/RP sections often mention Indebtedness; do not let them outrank debt covenants.
    if (item.category === "RESTRICTED_PAYMENTS_INVESTMENTS") score -= 4;
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

function itemKey(item: { sourceId: string; sectionRef: string; heading: string }): string {
  return `${item.sourceId}|${item.sectionRef}|${item.heading}`;
}

/**
 * Secured-debt questions require BOTH the indebtedness and liens regimes.
 * Do not return only the single highest-scoring provision (often incremental debt).
 */
function selectAnswerItems<T extends CovenantSummaryItem & { sourceId: string; score: number }>(
  scored: T[],
  intent: QuestionIntent,
  limit: number,
): T[] {
  if (scored.length === 0) return [];
  if (intent !== "SECURED_DEBT") return scored.slice(0, limit);

  const picked: T[] = [];
  const used = new Set<string>();
  const take = (item: T | undefined) => {
    if (!item) return;
    const k = itemKey(item);
    if (used.has(k)) return;
    used.add(k);
    picked.push(item);
  };

  const isRepOrAffirmative = (i: T) =>
    /representation|affirmative|ownership of propert|title to/i.test(i.heading) ||
    /^[45]\.\d+/i.test(i.sectionRef);
  const isLienCovenantHeading = (i: T) =>
    /^(?:limitations?\s+on\s+)?liens?\b/i.test(i.heading) ||
    /\blimitations?\s+on\s+liens?\b/i.test(i.heading);
  const isDebtCovenantHeading = (i: T) =>
    /^(?:limitations?\s+on\s+)?indebtedness\b/i.test(i.heading) ||
    /\blimitations?\s+on\s+indebtedness\b/i.test(i.heading);

  const lienGp =
    scored.find(
      (i) =>
        i.category === "LIENS_SECURED_DEBT" &&
        isLienCovenantHeading(i) &&
        !isRepOrAffirmative(i),
    ) ??
    scored.find(
      (i) =>
        i.category === "LIENS_SECURED_DEBT" &&
        i.posture === "GENERAL_PROHIBITION" &&
        !isRepOrAffirmative(i),
    );
  const lienAny = scored.find(
    (i) => i.category === "LIENS_SECURED_DEBT" && !isRepOrAffirmative(i),
  );
  const debtGp =
    scored.find(
      (i) =>
        i.category === "DEBT_INCURRENCE" &&
        isDebtCovenantHeading(i) &&
        !/\bincremental\b/i.test(i.heading),
    ) ??
    scored.find(
      (i) =>
        i.category === "DEBT_INCURRENCE" &&
        i.posture === "GENERAL_PROHIBITION" &&
        !/\bincremental\b/i.test(i.heading) &&
        i.category !== "FINANCIAL_MAINTENANCE",
    );
  const debtAny = scored.find(
    (i) =>
      i.category === "DEBT_INCURRENCE" &&
      !/\bincremental\b/i.test(i.heading) &&
      i.posture !== "MAINTENANCE_TEST",
  );

  take(lienGp ?? lienAny);
  take(debtGp ?? debtAny);

  for (const item of scored) {
    if (picked.length >= limit) break;
    // Once an operative liens covenant is selected, drop ownership/rep lien noise.
    if (isRepOrAffirmative(item) && (lienGp || lienAny)) continue;
    if (item.posture === "MAINTENANCE_TEST" && item.category === "FINANCIAL_MAINTENANCE") continue;
    take(item);
  }
  return picked;
}

function composeAnswer(params: {
  question: string;
  intent: QuestionIntent;
  items: Array<CovenantSummaryItem & { sourceId: string; score: number }>;
  researchOnly: boolean;
  amendmentNote?: string;
  matchedDefinition?: { term: string; excerpt: string; sourceId?: string; governingAgreement?: string } | null;
}): AskRetrieveAnswer {
  const top = selectAnswerItems(params.items, params.intent, 6);
  if (top.length === 0 && !params.matchedDefinition) {
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

  if (params.matchedDefinition) {
    citations.push({
      sourceId: params.matchedDefinition.sourceId ?? top[0]?.sourceId ?? "unknown",
      governingAgreement:
        params.matchedDefinition.governingAgreement ?? top[0]?.governingAgreement ?? "source agreement",
      sectionRef: `Definition: ${params.matchedDefinition.term}`,
      excerpt: params.matchedDefinition.excerpt.slice(0, 400),
      epistemicStatus: "DISCOVERED_CANDIDATE",
      posture: "DEFINITION",
    });
  }

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
      "Additional secured debt is governed jointly by the indebtedness and liens regimes — both must be satisfied. Source-backed analysis of matching provisions from each regime:",
    RESTRICTED_PAYMENTS:
      "Restricted payments are generally prohibited except for enumerated baskets. Matching analyzed provisions say:",
    NON_GUARANTOR_DEBT:
      "Debt at non-guarantor / non-Loan-Party subsidiaries depends on specific indebtedness baskets and entity-scope language. Matching analyzed provisions say:",
    ASSET_SALES:
      "Asset sales / dispositions are typically prohibited except enumerated exceptions. Matching analyzed provisions say:",
    AMENDMENT_CHANGES:
      "Amendment effects are reported only from analyzed package documents. Precedence may be unresolved. Matching analyzed provisions say:",
    LEVERAGE_DEFINITIONS:
      params.matchedDefinition
        ? `The agreement defines “${params.matchedDefinition.term}” as follows (source-backed definition text). Supporting covenant uses of the term follow:`
        : "Leverage and related ratios are controlled by the cited maintenance covenants and any matched definitions. Matching analyzed provisions say:",
    DEBT_INCURRENCE:
      "Debt incurrence is typically a general prohibition with enumerated exceptions. Matching analyzed provisions say:",
    INVESTMENTS_ACQUISITIONS:
      "Investments and acquisitions are typically restricted except enumerated baskets (including growers, builders, and shared caps where drafted). Matching analyzed provisions say:",
    REFINANCING:
      "Refinancing capacity depends on permitted refinancing / replacement debt exceptions and any conditions (no default, principal/ maturity limits). Matching analyzed provisions say:",
    GUARANTEES:
      "Guarantee capacity is controlled by guarantee covenants and related indebtedness/lien exceptions. Matching analyzed provisions say:",
    INCREMENTAL_FACILITIES:
      "Incremental capacity typically combines fixed, ratio-based, and voluntary-prepayment prongs, with possible reallocations and reclassifications. Matching analyzed provisions say:",
    GENERAL: "Matching analyzed provisions say:",
  };

  const definitionBlock = params.matchedDefinition
    ? [
        `Definition — ${params.matchedDefinition.term}:`,
        params.matchedDefinition.excerpt.slice(0, 600),
        "",
      ].join("\n")
    : "";

  const explanationBlocks = top.map((item, i) => {
    const regime =
      params.intent === "SECURED_DEBT"
        ? item.category === "LIENS_SECURED_DEBT"
          ? "LIENS REGIME"
          : item.category === "DEBT_INCURRENCE"
            ? "INDEBTEDNESS REGIME"
            : null
        : null;
    const bits = [
      `(${i + 1}) §${item.sectionRef} — ${item.heading} [${item.posture}]${regime ? ` [${regime}]` : ""}`,
      item.plainEnglish,
    ];
    const matchedDefs = (item.applicableDefinitions ?? []).filter((d) =>
      params.matchedDefinition
        ? d.term.toLowerCase().includes(params.matchedDefinition.term.toLowerCase().slice(0, 12)) ||
          params.matchedDefinition.term.toLowerCase().includes(d.term.toLowerCase())
        : /ebitda|leverage|coverage/i.test(d.term),
    );
    if (matchedDefs[0]) {
      bits.push(`Applicable definition (${matchedDefs[0].term}): ${matchedDefs[0].excerpt.slice(0, 220)}`);
    }
    const mech = (item.materialBasketsThresholds ?? []).filter((b) =>
      /reclassif|anti-stack|without-duplication|Incremental|Available Amount|Not Otherwise Applied|shared|grower|Ratio-based incremental/i.test(
        b,
      ),
    );
    if (mech[0]) bits.push(`Capacity mechanics: ${mech.slice(0, 3).join("; ")}`);
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
    definitionBlock,
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
    .filter((line) => line !== undefined && line !== "")
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
  /** Optional defined-term bank from the same summary (enables definition-first answers). */
  definedTerms?: Array<{ term: string; excerpt: string }>;
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
  const termQuery = extractDefinedTermQuery(q);
  const definedTerms =
    params.definedTerms ??
    Array.from(
      new Map(
        params.items
          .flatMap((i) => i.applicableDefinitions ?? [])
          .map((d) => [d.term.toLowerCase(), { term: d.term, excerpt: d.excerpt }]),
      ).values(),
    );
  const matchedDefinition =
    termQuery && definedTerms.length > 0 ? matchDefinedTerm(termQuery, definedTerms) : null;

  const scored = params.items
    .map((item) => {
      let score = scoreItem(item, intent, tokens);
      if (matchedDefinition) {
        const hit = (item.applicableDefinitions ?? []).some(
          (d) => d.term.toLowerCase() === matchedDefinition.term.toLowerCase(),
        );
        if (hit) score += 8;
      }
      return { ...item, score };
    })
    .filter((i) => i.score >= 3)
    .sort((a, b) => b.score - a.score);

  // For secured-debt, keep a larger scored pool so regime selection can find Liens + Debt.
  const poolLimit = intent === "SECURED_DEBT" ? Math.max(params.limit ?? 6, 16) : params.limit ?? 6;
  return composeAnswer({
    question: q,
    intent,
    items: scored.slice(0, poolLimit),
    researchOnly: params.researchOnly ?? true,
    amendmentNote: params.amendmentNote,
    matchedDefinition: matchedDefinition
      ? {
          ...matchedDefinition,
          sourceId: params.items[0]?.sourceId,
          governingAgreement: params.items[0]?.governingAgreement,
        }
      : null,
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
  const definedTerms: Array<{ term: string; excerpt: string }> = [];
  for (const row of scoped) {
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary) continue;
    for (const item of summary.items) {
      items.push({ ...item, sourceId: summary.sourceId });
    }
    for (const d of summary.definedTermsSample ?? []) {
      definedTerms.push({ term: d.term, excerpt: d.excerpt });
    }
  }

  return answerFromSummaryItems({
    question: q,
    items,
    definedTerms,
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
