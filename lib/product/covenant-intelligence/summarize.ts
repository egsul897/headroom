/**
 * Document covenant summaries from substantive provision analysis.
 * DISCOVERED ≠ VERIFIED. Never invents capacity or legal permission.
 */

import type {
  CovenantCandidateRecord,
  CrossReferenceRecord,
  DefinitionRecord,
  StructuralNodeRecord,
} from "../../knowledge-factory/types";
import { analyzeProvision, type ProvisionAnalysis, type ProvisionPosture } from "./analyze-provision";

export type CovenantCategoryKey =
  | "DEBT_INCURRENCE"
  | "LIENS_SECURED_DEBT"
  | "RESTRICTED_PAYMENTS_INVESTMENTS"
  | "ASSET_SALES"
  | "AFFILIATE_TRANSACTIONS"
  | "GUARANTEES"
  | "MERGERS_FUNDAMENTAL_CHANGES"
  | "FINANCIAL_MAINTENANCE"
  | "EVENTS_OF_DEFAULT"
  | "BASKETS_EXCEPTIONS_CONDITIONS"
  | "OTHER";

export const COVENANT_CATEGORY_LABELS: Record<CovenantCategoryKey, string> = {
  DEBT_INCURRENCE: "Debt incurrence",
  LIENS_SECURED_DEBT: "Liens and secured debt",
  RESTRICTED_PAYMENTS_INVESTMENTS: "Restricted payments and investments",
  ASSET_SALES: "Asset sales",
  AFFILIATE_TRANSACTIONS: "Affiliate transactions",
  GUARANTEES: "Guarantees",
  MERGERS_FUNDAMENTAL_CHANGES: "Mergers and fundamental changes",
  FINANCIAL_MAINTENANCE: "Financial maintenance covenants",
  EVENTS_OF_DEFAULT: "Events of default",
  BASKETS_EXCEPTIONS_CONDITIONS: "Relevant baskets, exceptions, conditions and defined terms",
  OTHER: "Other provisions",
};

/** Persisted summary item — same shape consumed by Ask Headroom. */
export interface CovenantSummaryItem {
  category: CovenantCategoryKey;
  categoryLabel: string;
  /**
   * Phase C (D11): the structural node's occurrence identity
   * (nodeId), carried so compile matches the EXACT item the
   * decision refers to — never first-match by (ref, category),
   * which merges distinct occurrences sharing a label (CA §5.01
   * vs Guaranty §5.01). Optional for backward compat with
   * stored summaries minted before this field existed.
   */
  nodeId?: string;
  /**
   * Phase E (D10): true when the item's own structural node is
   * unresolved — its heading triaged AMBIGUOUS or it violates
   * the structural-integrity contract. Such an item NEVER
   * auto-accepts as SYSTEM; it is a counsel exception. The
   * item's own node is what matters (an ambiguous parent
   * section does not taint its confident sub-clauses).
   */
  structuralUnresolved?: boolean;
  sectionRef: string;
  heading: string;
  posture: ProvisionPosture;
  plainEnglish: string;
  restriction: string | null;
  permissions: string[];
  coveredEntities: string[];
  exceptions: string[];
  conditions: string[];
  materialBasketsThresholds: string[];
  draftingPatterns: string[];
  operativeLanguageExcerpt: string;
  /** Rule 192: the analyzer's excerpt is a prefix of a longer
   * operative span — tail clauses are missing. The compiler
   * must not mint a formula from it (except when counsel EDITED
   * the item, supplying the controlling text). */
  operativeExcerptTruncated?: boolean;
  /** Heading of the enclosing ARTICLE node, if any (powers the representations guard in grant-types). */
  articleHeading?: string;
  sourceCitation: string;
  governingAgreement: string;
  families: string[];
  relatedDefinedTerms: string[];
  applicableDefinitions: Array<{ term: string; excerpt: string; resolved?: boolean }>;
  entityScope: {
    borrower: boolean;
    guarantor: boolean;
    restrictedSubsidiary: boolean;
    unrestrictedSubsidiary: boolean;
    notes: string[];
  };
  crossReferences: string[];
  dependencies: string[];
  epistemicStatus: "DISCOVERED_CANDIDATE" | "STRUCTURE_ONLY";
  interpretationNote: string;
  unresolvedQuestions: string[];
  alternativeInterpretations?: string[];
  assumptions?: string[];
  judgmentCalls?: string[];
  /** Set when workspace counsel accepted/edited this item. */
  reviewerDecision?: "ACCEPTED" | "EDITED" | "REJECTED";
  /** Full structured analysis — Ask and UI share this object. */
  analysis: ProvisionAnalysis;
}

export interface DocumentCovenantSummary {
  schemaVersion: "product.covenant-summary.v2";
  sourceId: string;
  governingAgreement: string;
  issuerName?: string;
  issuerCik: string;
  documentClass: string;
  generatedAt: string;
  /**
   * Build that produced this summary (Vercel git commit SHA, "dev"
   * elsewhere). General rule: every computed artifact records its
   * producer build, so the UI can tell a stale analysis (produced by
   * older code, e.g. before a correctness fix) from a current one.
   * Absent on summaries stored before this rule — those are stale.
   */
  analyzerBuild?: string;
  promotedToLegalTruth: 0;
  note: string;
  countsByCategory: Record<string, number>;
  items: CovenantSummaryItem[];
  definedTermsSample: Array<{ term: string; excerpt: string }>;
  /**
   * General rule: silent truncation is a lie. countsByCategory counts
   * EVERY candidate, but items is capped at SUMMARY_ITEM_CAP —
   * without these fields the counts and the listed items disagreed
   * with no explanation. totalItemsBeforeCap is the pre-cap item
   * count; truncated is true when the cap dropped items.
   */
  totalItemsBeforeCap: number;
  truncated: boolean;
}

/**
 * Summary item cap. analyzeProvision already runs for EVERY
 * candidate (the loop below), so the cap is a keep/drop bound,
 * not an analysis bound. 1000 covers every real agreement
 * observed (Strata 218; the old 120 cap silently dropped 98
 * Strata provisions from the Rulebook and capacity). The cap
 * now exists only to bound pathological inputs; the ranking
 * (basket-shaped first, peripheral last) still protects
 * operative provisions if a pathological document exceeds it.
 * The accounting (totalDiscovered / awaitingAnalysis) still
 * covers anything beyond the cap.
 */
export const SUMMARY_ITEM_CAP = 1000;

/**
 * Rule 159: user-facing cap disclosure for a covenant summary. The
 * summary object has carried truncated + totalItemsBeforeCap, but no
 * page read them — a 150-item document showed "first 40 of 120" and
 * the 30 dropped items were invisible. Returns the disclosure string
 * when the cap dropped items, else null. Category counts reflect ALL
 * items; only the listed items are capped — the note says both.
 */
export function summaryCapDisclosure(summary: {
  truncated: boolean;
  totalItemsBeforeCap: number;
  items: unknown[];
}): string | null {
  if (!summary.truncated) return null;
  const dropped = summary.totalItemsBeforeCap - summary.items.length;
  return (
    `Summary capped at ${summary.items.length} of ${summary.totalItemsBeforeCap} covenant items — ` +
    `${dropped} items were not included in the list below. ` +
    `Category counts above reflect all ${summary.totalItemsBeforeCap} items.`
  );
}

function entityScopeFromAnalysis(a: ProvisionAnalysis): CovenantSummaryItem["entityScope"] {
  const joined = a.coveredEntities.join(" ").toLowerCase();
  return {
    borrower: /\bborrower\b/.test(joined),
    guarantor: /\bguarantor/.test(joined),
    restrictedSubsidiary: /\brestricted subsidiar/.test(joined),
    unrestrictedSubsidiary: /\bunrestricted subsidiar/.test(joined),
    notes: a.entityScopeNotes,
  };
}

function itemFromAnalysis(
  analysis: ProvisionAnalysis,
  governingAgreement: string,
  nodeId?: string,
  structuralUnresolved?: boolean,
): CovenantSummaryItem {
  return {
    nodeId,
    structuralUnresolved,
    category: analysis.category,
    categoryLabel: analysis.categoryLabel,
    sectionRef: analysis.sectionRef,
    heading: analysis.heading,
    posture: analysis.posture,
    plainEnglish: analysis.plainEnglish,
    restriction: analysis.restriction,
    permissions: analysis.permissions,
    coveredEntities: analysis.coveredEntities,
    exceptions: analysis.exceptions,
    conditions: analysis.conditions,
    materialBasketsThresholds: analysis.basketsAndThresholds,
    draftingPatterns: analysis.draftingPatterns,
    operativeLanguageExcerpt: analysis.operativeLanguageExcerpt,
    operativeExcerptTruncated: analysis.operativeExcerptTruncated,
    articleHeading: analysis.articleHeading,
    sourceCitation: analysis.sourceCitation,
    governingAgreement,
    families: analysis.families,
    relatedDefinedTerms: analysis.applicableDefinitions.map((d) => d.term),
    applicableDefinitions: analysis.applicableDefinitions,
    entityScope: entityScopeFromAnalysis(analysis),
    crossReferences: analysis.crossReferences,
    dependencies: analysis.dependencies,
    epistemicStatus: analysis.epistemicStatus,
    interpretationNote: analysis.interpretationNote,
    // Phase E: structural uncertainty is preserved through every
    // layer — it surfaces in unresolvedQuestions (read by the
    // Rulebook, Ask, and counsel review), never silently dropped.
    unresolvedQuestions: structuralUnresolved
      ? [
          ...analysis.unresolved,
          "Structural relationship unresolved: this provision's parent/article could not be established deterministically from span containment + ref-consistency. Its excerpt is real text, but its placement in the hierarchy is not certified — confirm the governing article/section before relying on it.",
        ]
      : analysis.unresolved,
    alternativeInterpretations: analysis.alternativeInterpretations,
    assumptions: analysis.assumptions,
    judgmentCalls: analysis.judgmentCalls,
    analysis,
  };
}

export function buildDocumentCovenantSummary(params: {
  sourceId: string;
  documentTitle: string;
  issuerName?: string;
  issuerCik: string;
  documentClass: string;
  candidates: CovenantCandidateRecord[];
  definitions: DefinitionRecord[];
  structuralNodes: StructuralNodeRecord[];
  crossReferences?: CrossReferenceRecord[];
}): DocumentCovenantSummary {
  const items: CovenantSummaryItem[] = [];
  const countsByCategory: Record<string, number> = {};

  const peripheralHeading =
    /\b(?:notice|notices|miscellaneous|governing law|counterpart|severability|waivers? of jury|expenses|indemnif|assignments?|successors|effectiveness|conditions?\s+precedent|representations|schedules?|exhibits?)\b/i;

  // Rule 68: demote by HEADING, not by excerpt mention. The old
  // code tested this regex against the excerpt + signals, so a
  // substantive covenant merely MENTIONING "governing law",
  // "expenses", or "successors and assigns" (nearly every
  // merger covenant) was demoted into the peripheral bucket
  // and could be cut by the 120-item cap while lower-scored
  // peripheral items survived. The heading is the section's
  // identity; a mention inside the text is not.
  const headingByNodeId = new Map(params.structuralNodes.map((n) => [n.nodeId, n.heading ?? ""]));
  const headingOf = (c: (typeof params.candidates)[number]): string =>
    (c.nodeId ? (headingByNodeId.get(c.nodeId) ?? "") : "");

  // Rule 205: basket-shaped candidates rank FIRST, before the
  // peripheral demotion and the discovery score. Asure 7.02(f)
  // — "Indebtedness of any Person that becomes a Subsidiary
  // ... not to exceed ... $5,000,000", a genuine $5M acquired-
  // subsidiary debt basket — scored only 3 (amount_cap alone)
  // and lost the 120-cap to higher-scored noise, understating
  // debt capacity by $5M. A candidate with a dollar amount +
  // a cap frame + a covenant family IS an operative basket;
  // the cap must never drop one while noise survives. The
  // predicate is deliberately narrow (a $ amount AND a cap
  // frame AND a basket family) — a definition condition with
  // a $ cap also matches, but it occupies an item slot without
  // minting a grant (Rule 204), so it cannot corrupt capacity.
  const BASKET_FAMILIES = new Set([
    "INDEBTEDNESS",
    "LIENS",
    "RESTRICTED_PAYMENTS",
    "INVESTMENTS",
    "ASSET_SALES",
    "INCREMENTAL_DEBT_AND_FACILITIES",
    "AVAILABLE_AMOUNT_AND_BUILDER_BASKETS",
    "RATIO_BASED_PERMISSIONS",
    "SHARED_CAPACITY_PROVISIONS",
    "FINANCIAL_MAINTENANCE_COVENANTS",
    "JUNIOR_DEBT_PREPAYMENTS",
    "MANDATORY_PREPAYMENTS",
  ]);
  const isBasketShaped = (c: (typeof params.candidates)[number]): boolean => {
    const ex = c.excerpt ?? "";
    return (
      /\$\s*[\d,]+/.test(ex) &&
      /\bnot\s+(?:to\s+)?exceed(?:ing)?\b|\bup\s+to\s+\$/i.test(ex) &&
      c.families.some((f) => BASKET_FAMILIES.has(f))
    );
  };
  const ranked = [...params.candidates].sort((a, b) => {
    const ab = isBasketShaped(a) ? 0 : 1;
    const bb = isBasketShaped(b) ? 0 : 1;
    if (ab !== bb) return ab - bb; // baskets before everything — the cap must not drop one
    const ap = peripheralHeading.test(headingOf(a)) ? 1 : 0;
    const bp = peripheralHeading.test(headingOf(b)) ? 1 : 0;
    if (ap !== bp) return ap - bp; // primary covenants before peripheral
    return b.discoveryScore - a.discoveryScore;
  });
  // Chapeau inheritance: map nodeId -> candidate excerpt, so a
  // sub-clause candidate can inherit its parent chapeau's
  // prohibition-with-except frame (see detectPosture). The chapeau
  // is the parent excerpt's text before the first sub-clause
  // marker; when the parent candidate IS the chapeau alone (its
  // excerpt ends at the colon, no sub-clauses inside), the whole
  // parent excerpt is the chapeau. Capped at 1500 chars — a
  // chapeau is a short opening frame; the frame test in
  // detectPosture (shall-not + except, or bare stem + other than)
  // is the real guard.
  const excerptByNodeId = new Map(params.candidates.map((c) => [c.nodeId, c.excerpt ?? ""]));
  const nodeById = new Map(params.structuralNodes.map((n) => [n.nodeId, n]));
  const parentChapeauOf = (c: (typeof params.candidates)[number]): string | undefined => {
    const node = c.nodeId ? nodeById.get(c.nodeId) : undefined;
    const parentId = node?.parentNodeId;
    if (!parentId || parentId === c.nodeId) return undefined;
    // Phase C (D7): the parent excerpt IS the parent section's own
    // span (the candidate excerpt is sliced from the parent node's
    // span), so reading it is reading the section's own chapeau —
    // not a parent pointer's guess. The gate that matters is
    // structural confidence: never inherit a chapeau through an
    // ambiguous parent (its heading/identity is uncertain) or a
    // parent with integrity violations (its parentage is
    // unresolved). With the fixed parser the parentNodeId is
    // containment + ref validated; the old failure mode (a
    // mis-parented clause inheriting another section's frame)
    // is closed at the parser, and this gate closes the
    // ambiguous-parent variant.
    const parentNode = nodeById.get(parentId);
    if (!parentNode) return undefined;
    // Gate on parentage validity, not on the parent's heading
    // confidence: an ambiguous heading (inline, uncorroborated)
    // still has a validated span + ref-consistent parentage, and
    // its excerpt is real text from that span. A parent with
    // integrity violations has unresolved parentage — never
    // inherit through it.
    if ((parentNode.structuralViolations?.length ?? 0) > 0) return undefined;
    const parentExcerpt = excerptByNodeId.get(parentId);
    if (!parentExcerpt) return undefined;
    return (parentExcerpt.split(/\n\s*\([a-z0-9]{1,3}\)\s/)[0] ?? parentExcerpt).slice(0, 1500);
  };
  for (const c of ranked) {
    const analysis = analyzeProvision({
      sourceId: params.sourceId,
      documentTitle: params.documentTitle,
      candidate: c,
      definitions: params.definitions,
      structuralNodes: params.structuralNodes,
      crossReferences: params.crossReferences,
      parentChapeau: parentChapeauOf(c),
    });
    countsByCategory[analysis.category] = (countsByCategory[analysis.category] ?? 0) + 1;
    const itemNode = c.nodeId ? nodeById.get(c.nodeId) : undefined;
    items.push(
      itemFromAnalysis(
        analysis,
        params.documentTitle,
        c.nodeId,
        itemNode ? itemNode.ambiguous === true || (itemNode.structuralViolations?.length ?? 0) > 0 : undefined,
      ),
    );
  }

  const preferredOrder = Object.keys(COVENANT_CATEGORY_LABELS) as CovenantCategoryKey[];
  // Rule 68 (second half): the cap must apply in RANKED order
  // (primary covenants first), not in display order. The old
  // code display-sorted items by category/sectionRef and THEN
  // sliced to 120 — so the peripheral ranking above was dead
  // code for cap purposes, and a merger covenant (7th category)
  // was cut while 120 debt-incurrence fillers survived,
  // regardless of score or peripherality. Cap first, then sort
  // the survivors for display.
  const totalItemsBeforeCap = items.length;
  const truncated = items.length > SUMMARY_ITEM_CAP;
  const capped = items.slice(0, SUMMARY_ITEM_CAP);
  capped.sort((a, b) => {
    const ai = preferredOrder.indexOf(a.category);
    const bi = preferredOrder.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    // Numeric collation: plain lexicographic order put "10.01"
    // before "6.02" (Article 10 listed before Article 6).
    return a.sectionRef.localeCompare(b.sectionRef, undefined, { numeric: true });
  });

  return {
    schemaVersion: "product.covenant-summary.v2",
    sourceId: params.sourceId,
    governingAgreement: params.documentTitle,
    issuerName: params.issuerName,
    issuerCik: params.issuerCik,
    documentClass: params.documentClass,
    generatedAt: new Date().toISOString(),
    analyzerBuild: currentAnalyzerBuild(),
    promotedToLegalTruth: 0,
    note: "AI-first interpretations for customer counsel review. DISCOVERED ≠ counsel-approved. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE capacity. PRECEDENT ≠ OPERATIVE AUTHORITY. Summaries and Ask share the same persisted analysis objects.",
    countsByCategory,
    items: capped,
    totalItemsBeforeCap,
    truncated,
    definedTermsSample: params.definitions.slice(0, 40).map((d) => ({
      term: d.term,
      excerpt: (d.excerpt ?? "").slice(0, 240),
    })),
  };
}

export function summarizeFromStoredMetadata(metadata: unknown): DocumentCovenantSummary | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const cs = (metadata as Record<string, unknown>).covenantSummary;
  if (!cs || typeof cs !== "object" || Array.isArray(cs)) return null;
  // Stored summaries are untrusted input: a summary missing its items
  // array (older version, partial write, corrupt metadata) must
  // degrade to "not analyzed", not crash callers on items.length.
  const items = (cs as Record<string, unknown>).items;
  if (!Array.isArray(items)) return null;
  return cs as DocumentCovenantSummary;
}

/**
 * Build identifier for the analyzer code producing summaries. Vercel
 * injects the git commit SHA at build and runtime; anything else is
 * "dev". Stable within a deploy, changes on every deploy — exactly
 * what staleness detection needs. (The older KNOWLEDGE_FACTORY_VERSION
 * constant never changes, so it cannot serve this purpose.)
 */
export function currentAnalyzerBuild(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
}

/**
 * True when a stored summary was produced by older analyzer code (or
 * predates build stamping entirely). A missing summary is not stale —
 * it is absent. Callers surface this as "re-analyze for the latest
 * corrections", never as an error.
 */
export function isSummaryStale(summary: DocumentCovenantSummary | null): boolean {
  if (!summary) return false;
  return !summary.analyzerBuild || summary.analyzerBuild !== currentAnalyzerBuild();
}
