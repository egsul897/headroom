/**
 * Workstream 1 — Complete covenant retrieval for Ask / product intelligence.
 *
 * Extends (does not replace) Phase 2D structural context retrieval and the
 * persisted provision-analysis store. For each covenant question, assembles:
 *   governing restriction, permissions, exceptions/provisos, definitions
 *   (including nested), cross-references, related covenants, amendment notes,
 *   and conditions that could change the answer — then detects material
 *   provisions omitted from the initial ranked set.
 *
 * Never invents legal permissions. Omissions are surfaced, not filled by guess.
 */

import type { CovenantSummaryItem } from "./summarize";
import { answerFromSummaryItems, type AskRetrieveAnswer } from "./ask-retrieve";

export const COMPLETE_RETRIEVAL_VERSION = "product.complete-retrieval.v1";

export type RetrievalRole =
  | "GOVERNING_RESTRICTION"
  | "PERMISSION"
  | "EXCEPTION_PROVISO"
  | "DEFINITION"
  | "NESTED_DEFINITION"
  | "CROSS_REFERENCE"
  | "RELATED_COVENANT"
  | "AMENDMENT_NOTE"
  | "CONDITION_GATE"
  | "OMISSION_CANDIDATE";

export interface RetrievedProvision {
  role: RetrievalRole;
  sectionRef: string;
  sourceId: string;
  heading: string;
  excerpt: string;
  posture?: string;
  citation: string;
  whyIncluded: string;
  epistemicStatus: string;
}

export interface OmissionSignal {
  kind:
    | "MISSING_RELATED_FAMILY"
    | "MISSING_SHARED_CAP_PEER"
    | "MISSING_DEFINITION"
    | "MISSING_CROSS_REF_TARGET"
    | "MISSING_PERMISSION_UNDER_PROHIBITION"
    | "AMENDMENT_PRECEDENCE_UNRESOLVED";
  detail: string;
  suggestedSectionRef?: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}

export interface CompleteRetrievalResult {
  version: typeof COMPLETE_RETRIEVAL_VERSION;
  question: string;
  initialHits: RetrievedProvision[];
  expanded: RetrievedProvision[];
  omissions: OmissionSignal[];
  answer: AskRetrieveAnswer;
  /** True when a HIGH omission was detected — Ask must not present the set as complete. */
  retrievalIncomplete: boolean;
}

const FAMILY_PEERS: Record<string, string[]> = {
  DEBT_INCURRENCE: ["LIENS_SECURED_DEBT", "GUARANTEES", "BASKETS_EXCEPTIONS_CONDITIONS"],
  LIENS_SECURED_DEBT: ["DEBT_INCURRENCE", "GUARANTEES"],
  RESTRICTED_PAYMENTS_INVESTMENTS: ["ASSET_SALES", "BASKETS_EXCEPTIONS_CONDITIONS", "GUARANTEES"],
  ASSET_SALES: ["RESTRICTED_PAYMENTS_INVESTMENTS", "DEBT_INCURRENCE"],
  GUARANTEES: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"],
  FINANCIAL_MAINTENANCE: ["DEBT_INCURRENCE", "BASKETS_EXCEPTIONS_CONDITIONS"],
};

function roleForItem(item: CovenantSummaryItem): RetrievalRole {
  if (item.posture === "GENERAL_PROHIBITION" || item.posture === "MAINTENANCE_TEST") return "GOVERNING_RESTRICTION";
  if (item.posture === "ENUMERATED_PERMISSION" || item.posture === "CONDITIONAL_PERMISSION") return "PERMISSION";
  if ((item.exceptions?.length ?? 0) > 0 || (item.conditions?.length ?? 0) > 0) return "EXCEPTION_PROVISO";
  if (item.category === "BASKETS_EXCEPTIONS_CONDITIONS") return "CONDITION_GATE";
  return "RELATED_COVENANT";
}

function toRetrieved(
  item: CovenantSummaryItem & { sourceId: string },
  role: RetrievalRole,
  why: string,
): RetrievedProvision {
  return {
    role,
    sectionRef: item.sectionRef,
    sourceId: item.sourceId,
    heading: item.heading,
    excerpt: item.operativeLanguageExcerpt.slice(0, 400),
    posture: item.posture,
    citation: item.sourceCitation,
    whyIncluded: why,
    epistemicStatus: item.epistemicStatus,
  };
}

function sectionKey(ref: string): string {
  return ref.replace(/^§/, "").replace(/\s+/g, "").toLowerCase();
}

/** Expand the initial ranked set with related covenants, definitions, and cross-ref targets present in the corpus. */
export function expandRetrievalSet(params: {
  question: string;
  initial: Array<CovenantSummaryItem & { sourceId: string }>;
  corpus: Array<CovenantSummaryItem & { sourceId: string }>;
  amendmentNote?: string;
}): { expanded: RetrievedProvision[]; omissions: OmissionSignal[] } {
  const seen = new Set(params.initial.map((i) => `${i.sourceId}::${sectionKey(i.sectionRef)}`));
  const expanded: RetrievedProvision[] = params.initial.map((i) =>
    toRetrieved(i, roleForItem(i), "Initial structural/semantic ranking hit"),
  );
  const omissions: OmissionSignal[] = [];

  for (const hit of params.initial) {
    // Definitions nested / referenced
    for (const d of hit.applicableDefinitions ?? []) {
      const role: RetrievalRole = d.resolved === false ? "NESTED_DEFINITION" : "DEFINITION";
      expanded.push({
        role,
        sectionRef: hit.sectionRef,
        sourceId: hit.sourceId,
        heading: `Definition: ${d.term}`,
        excerpt: (d.excerpt ?? "").slice(0, 400),
        citation: `${hit.sourceId} · def:${d.term}`,
        whyIncluded: d.resolved === false
          ? "Defined term referenced but not resolved in-package"
          : "Defined-term dependency of a retrieved provision",
        epistemicStatus: hit.epistemicStatus,
      });
      if (d.resolved === false) {
        omissions.push({
          kind: "MISSING_DEFINITION",
          detail: `Defined term “${d.term}” is referenced by §${hit.sectionRef} but definition text was not retrieved.`,
          severity: "HIGH",
        });
      }
    }

    // Cross-reference targets in corpus
    for (const xref of hit.crossReferences ?? []) {
      const m = xref.match(/([\d.]+(?:\([^)]+\))*)/);
      const target = m?.[1];
      if (!target) continue;
      const peer = params.corpus.find(
        (c) => c.sourceId === hit.sourceId && sectionKey(c.sectionRef).startsWith(sectionKey(target)),
      );
      if (peer) {
        const key = `${peer.sourceId}::${sectionKey(peer.sectionRef)}`;
        if (!seen.has(key)) {
          seen.add(key);
          expanded.push(toRetrieved(peer, "CROSS_REFERENCE", `Cross-referenced from §${hit.sectionRef} (${xref})`));
        }
      } else {
        omissions.push({
          kind: "MISSING_CROSS_REF_TARGET",
          detail: `§${hit.sectionRef} references ${xref}, but no analyzed provision for that target is in the retrieval set.`,
          suggestedSectionRef: target,
          severity: "MEDIUM",
        });
      }
    }

    // Related covenant families (debt↔liens, RP↔investments, etc.)
    const peers = FAMILY_PEERS[hit.category] ?? [];
    for (const cat of peers) {
      const related = params.corpus.filter(
        (c) => c.sourceId === hit.sourceId && c.category === cat && !seen.has(`${c.sourceId}::${sectionKey(c.sectionRef)}`),
      );
      for (const r of related.slice(0, 3)) {
        const key = `${r.sourceId}::${sectionKey(r.sectionRef)}`;
        seen.add(key);
        expanded.push(
          toRetrieved(r, "RELATED_COVENANT", `Cross-covenant peer of ${hit.category} (§${hit.sectionRef})`),
        );
      }
      if (related.length === 0 && (hit.posture === "GENERAL_PROHIBITION" || hit.posture === "ENUMERATED_PERMISSION")) {
        // Only flag when the corpus has ANY item in that peer family elsewhere — otherwise silence.
        const anywhere = params.corpus.some((c) => c.sourceId === hit.sourceId && c.category === cat);
        if (anywhere) {
          omissions.push({
            kind: "MISSING_RELATED_FAMILY",
            detail: `Initial set for §${hit.sectionRef} (${hit.category}) did not include peer family ${cat}, which exists in the same document.`,
            severity: "MEDIUM",
          });
        }
      }
    }

    // Shared-cap peers ("together with … Section X")
    const hay = `${hit.operativeLanguageExcerpt} ${(hit.permissions ?? []).join(" ")}`;
    for (const m of hay.matchAll(/together with[^.;]{0,80}Section\s*([\d.]+(?:\([^)]+\))?)/gi)) {
      const target = m[1]!;
      const peer = params.corpus.find(
        (c) => c.sourceId === hit.sourceId && sectionKey(c.sectionRef).startsWith(sectionKey(target)),
      );
      if (peer) {
        const key = `${peer.sourceId}::${sectionKey(peer.sectionRef)}`;
        if (!seen.has(key)) {
          seen.add(key);
          expanded.push(toRetrieved(peer, "RELATED_COVENANT", `Shared-capacity peer named by §${hit.sectionRef}`));
        }
      } else {
        omissions.push({
          kind: "MISSING_SHARED_CAP_PEER",
          detail: `§${hit.sectionRef} shares capacity with Section ${target}, but that peer was omitted from retrieval.`,
          suggestedSectionRef: target,
          severity: "HIGH",
        });
      }
    }

    // Permission omission under a general prohibition
    if (
      hit.posture === "GENERAL_PROHIBITION" &&
      (hit.permissions?.length ?? 0) === 0 &&
      (hit.exceptions?.length ?? 0) === 0
    ) {
      const childPerms = params.corpus.filter(
        (c) =>
          c.sourceId === hit.sourceId &&
          c.category === hit.category &&
          (c.posture === "ENUMERATED_PERMISSION" || c.posture === "CONDITIONAL_PERMISSION") &&
          sectionKey(c.sectionRef).startsWith(sectionKey(hit.sectionRef).replace(/\([^)]*\)$/, "")),
      );
      for (const p of childPerms.slice(0, 6)) {
        const key = `${p.sourceId}::${sectionKey(p.sectionRef)}`;
        if (!seen.has(key)) {
          seen.add(key);
          expanded.push(toRetrieved(p, "PERMISSION", `Enumerated permission under governing prohibition §${hit.sectionRef}`));
        }
      }
      if (childPerms.length === 0) {
        omissions.push({
          kind: "MISSING_PERMISSION_UNDER_PROHIBITION",
          detail: `Governing prohibition §${hit.sectionRef} has no segmented permissions/exceptions in the retrieval set — dangerous omission risk.`,
          severity: "HIGH",
        });
      }
    }

    // Conditions that could change the answer
    for (const cond of (hit.conditions ?? []).slice(0, 4)) {
      expanded.push({
        role: "CONDITION_GATE",
        sectionRef: hit.sectionRef,
        sourceId: hit.sourceId,
        heading: hit.heading,
        excerpt: cond.slice(0, 300),
        citation: hit.sourceCitation,
        whyIncluded: "Condition/proviso that can change the permissibility answer",
        epistemicStatus: hit.epistemicStatus,
      });
    }
  }

  if (params.amendmentNote) {
    expanded.push({
      role: "AMENDMENT_NOTE",
      sectionRef: "amendment-package",
      sourceId: params.initial[0]?.sourceId ?? "unknown",
      heading: "Amendment / operative precedence",
      excerpt: params.amendmentNote.slice(0, 400),
      citation: "amendment-package",
      whyIncluded: "Amendment provenance may change the operative answer",
      epistemicStatus: "DISCOVERED_CANDIDATE",
    });
    if (/UNRESOLVED/i.test(params.amendmentNote)) {
      omissions.push({
        kind: "AMENDMENT_PRECEDENCE_UNRESOLVED",
        detail: params.amendmentNote,
        severity: "HIGH",
      });
    }
  }

  return { expanded, omissions };
}

/** Full Ask path: rank → expand → omission detect → compose answer with incompleteness disclosure. */
export function completeRetrieveAndAnswer(params: {
  question: string;
  items: Array<CovenantSummaryItem & { sourceId: string }>;
  researchOnly?: boolean;
  amendmentNote?: string;
  limit?: number;
}): CompleteRetrievalResult {
  const answer = answerFromSummaryItems({
    question: params.question,
    items: params.items,
    researchOnly: params.researchOnly,
    amendmentNote: params.amendmentNote,
    limit: params.limit ?? 6,
  });

  // Re-score to recover the initial hit set (same threshold as ask-retrieve).
  const initialAnswer = answer;
  void initialAnswer;
  const ranked = answerFromSummaryItems({
    question: params.question,
    items: params.items,
    researchOnly: params.researchOnly,
    amendmentNote: params.amendmentNote,
    limit: params.limit ?? 6,
  });

  // Reconstruct initial items from citations (stable, source-backed).
  const citedKeys = new Set(ranked.citations.map((c) => `${c.sourceId}::${sectionKey(c.sectionRef)}`));
  const initial = params.items.filter((i) => citedKeys.has(`${i.sourceId}::${sectionKey(i.sectionRef)}`));

  const { expanded, omissions } = expandRetrievalSet({
    question: params.question,
    initial: initial.length > 0 ? initial : params.items.slice(0, params.limit ?? 6),
    corpus: params.items,
    amendmentNote: params.amendmentNote,
  });

  const retrievalIncomplete = omissions.some((o) => o.severity === "HIGH");
  let finalAnswer = ranked;
  if (retrievalIncomplete && ranked.kind === "answered") {
    const omissionBlock = [
      "",
      "Retrieval completeness warning (independent omission detection):",
      ...omissions
        .filter((o) => o.severity === "HIGH" || o.severity === "MEDIUM")
        .slice(0, 8)
        .map((o) => `• [${o.severity}] ${o.detail}`),
      "Headroom will not invent the missing permissions, exceptions, or definitions.",
    ].join("\n");
    finalAnswer = {
      ...ranked,
      detail: `${ranked.detail}${omissionBlock}`,
      unresolved: [...(ranked.unresolved ?? []), ...omissions.filter((o) => o.severity === "HIGH").map((o) => o.detail)].slice(0, 12),
      limitations: [
        ...ranked.limitations,
        "Complete-retrieval omission pass detected material gaps — answer is not a closed contractual set",
      ],
    };
  }

  return {
    version: COMPLETE_RETRIEVAL_VERSION,
    question: params.question,
    initialHits: (initial.length > 0 ? initial : params.items.slice(0, params.limit ?? 6)).map((i) =>
      toRetrieved(i, roleForItem(i), "Initial ranking"),
    ),
    expanded,
    omissions,
    answer: finalAnswer,
    retrievalIncomplete,
  };
}
