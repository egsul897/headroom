/**
 * Document covenant summaries from substantive provision analysis.
 * DISCOVERED ≠ VERIFIED. Never invents capacity or legal permission.
 */

import type {
  CovenantCandidateRecord,
  CrossReferenceRecord,
  DefinitionRecord,
  RedlineAmbiguityRecord,
  StructuralNodeRecord,
} from "../../knowledge-factory/types";
import { recoverSectionTitle } from "../../knowledge-factory/taxonomy/families";
import {
  analyzeProvision,
  FAMILY_TO_CATEGORY,
  type CrossReferenceResolution,
  type ProvisionAnalysis,
  type ProvisionPosture,
} from "./analyze-provision";

export type CovenantCategoryKey =
  | "DEBT_INCURRENCE"
  | "LIENS_SECURED_DEBT"
  | "RESTRICTED_PAYMENTS_INVESTMENTS"
  | "ASSET_SALES"
  | "AFFILIATE_TRANSACTIONS"
  | "RESTRICTIVE_AGREEMENTS"
  | "GUARANTEES"
  | "MERGERS_FUNDAMENTAL_CHANGES"
  | "FINANCIAL_MAINTENANCE"
  | "EVENTS_OF_DEFAULT"
  | "BASKETS_EXCEPTIONS_CONDITIONS"
  | "NON_COVENANT"
  | "AFFIRMATIVE"
  | "OTHER";

/**
 * Why an item is classified NON_COVENANT — the determinate
 * classification for document content that is not an operative
 * covenant (classification census steps 1–3): definitions,
 * representations, facility/agent mechanics, conditions
 * checklists, boilerplate, and [reserved] placeholders. Assigned
 * from structural position (article / instrument / node shape),
 * never from keyword scoring. NON_COVENANT items are accounted
 * for and explicitly classified; they mint no grants and enter
 * no covenant decision queue.
 */
export type NonCovenantSubtype =
  | "DEFINITION"
  | "REPRESENTATION"
  | "MECHANICS"
  | "BOILERPLATE"
  | "RESERVED";

/**
 * The obligation kind of an AFFIRMATIVE covenant (classification
 * census step 2) — operative covenants that impose duties
 * (reporting, notices, maintenance, compliance) rather than
 * restricting transactions. They stay in the covenant pipeline
 * (they feed event-obligation extraction) but mint no basket
 * grants.
 */
export type AffirmativeKind =
  | "REPORTING"
  | "NOTICE"
  | "EXISTENCE"
  | "TAXES"
  | "PROPERTIES_INSURANCE"
  | "COMPLIANCE"
  | "BOOKS_INSPECTION"
  | "FURTHER_ASSURANCES"
  | "OTHER_AFFIRMATIVE";

export const COVENANT_CATEGORY_LABELS: Record<CovenantCategoryKey, string> = {
  DEBT_INCURRENCE: "Debt incurrence",
  LIENS_SECURED_DEBT: "Liens and secured debt",
  RESTRICTED_PAYMENTS_INVESTMENTS: "Restricted payments and investments",
  ASSET_SALES: "Asset sales",
  AFFILIATE_TRANSACTIONS: "Affiliate transactions",
  RESTRICTIVE_AGREEMENTS: "Restrictive agreements",
  GUARANTEES: "Guarantees",
  MERGERS_FUNDAMENTAL_CHANGES: "Mergers and fundamental changes",
  FINANCIAL_MAINTENANCE: "Financial maintenance covenants",
  EVENTS_OF_DEFAULT: "Events of default",
  BASKETS_EXCEPTIONS_CONDITIONS: "Relevant baskets, exceptions, conditions and defined terms",
  NON_COVENANT: "Non-covenant provision",
  AFFIRMATIVE: "Affirmative covenants",
  OTHER: "Other provisions",
};

/** Persisted summary item — same shape consumed by Ask Headroom. */
export interface CovenantSummaryItem {
  category: CovenantCategoryKey;
  categoryLabel: string;
  /** Additive (classification census step 1): for NON_COVENANT
   * items, why the item is not an operative covenant. Null/absent
   * for covenant items. Older stored summaries lack the field. */
  nonCovenantSubtype?: NonCovenantSubtype | null;
  /** Additive (classification census step 2): for AFFIRMATIVE
   * items, the obligation kind. Null/absent otherwise. */
  affirmativeKind?: AffirmativeKind | null;
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
  /**
   * Redline port (from PR #428): the item's source span intersects
   * a redline-ambiguous span — text following an unmatched
   * struck-through (redline deletion) element whose close tag
   * never appears, so the span may be text the parties deleted.
   * The text is preserved as evidence, but the item NEVER
   * auto-accepts as SYSTEM and the compiler must not mint a
   * formula from it (except when counsel EDITED the item,
   * supplying the controlling text — the Rule 192 exception).
   * Absent on summaries built before the field existed or from
   * documents with no unmatched redline elements.
   */
  redlineAmbiguous?: boolean;
  /** Formula representation (step 3): parent section chapeau text,
   * carried for the formula scan (a cap may be stated in the stem
   * governing this clause). Contract text; additive. */
  parentChapeau?: string;
  /** The item's full operative span when its excerpt is a
   * truncated prefix (formula parse only; the display excerpt
   * and Rule 192 disclosure are unchanged). */
  operativeFullSpan?: string;
  /** Structural node type of the item's own node (formula
   * parse's full-span guard). */
  operativeNodeType?: string;
  /** Formula representation (step 3): when this item IS a section
   * stem whose operative sub-clauses are separately present as
   * items, the sub-clauses' section refs. The stem carries no
   * terms of its own — its clauses do (per-clause provenance is
   * preserved; nothing is minted from the stem). */
  sectionStemChildRefs?: string[];
  /** Heading of the enclosing ARTICLE node, if any (powers the representations guard in grant-types). */
  articleHeading?: string;
  sourceCitation: string;
  governingAgreement: string;
  families: string[];
  relatedDefinedTerms: string[];
  applicableDefinitions: Array<{
    term: string;
    excerpt: string;
    resolved?: boolean;
    /** Differing duplicate definitions in the document — the entry
     * is unresolved because picking one would be a guess. */
    ambiguous?: boolean;
  }>;
  /** Additive (H3): structural resolution per cross-reference —
   * resolved only on a unique same-document target; ambiguity and
   * non-resolution carry reasons. Older stored summaries lack the
   * field and keep reading via `crossReferences` alone. */
  crossReferenceResolutions?: CrossReferenceResolution[];
  /** Additive (H3): the provision references more defined terms
   * than the per-provision listing bound; unlisted mentions are
   * unresolved, not absent (disclosed in unresolvedQuestions). */
  definitionCoverageIncomplete?: boolean;
  definitionMentionsOmitted?: number;
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
  /**
   * Redline port (from PR #428): the document's redline-ambiguous
   * spans recorded at extraction (unmatched struck-through
   * elements), carried on the summary so the uncertainty and the
   * preserved evidence text travel with the analysis. Absent on
   * summaries built before the field existed; items intersecting
   * a span are flagged `redlineAmbiguous` individually.
   */
  redlineAmbiguities?: RedlineAmbiguityRecord[];
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

const REDLINE_AMBIGUITY_QUESTION =
  "Redline ambiguity (unmatched struck-through element): this provision's text intersects a span that follows a struck-through (redline deletion) element whose closing tag is missing, so the span may be text the parties deleted — or live text after a stray tag. The text is preserved as evidence, but it is not treated as certified operative text: the item does not auto-accept and no formula is compiled from it. Confirm against the executed agreement / redline before relying on it.";

function itemFromAnalysis(
  analysis: ProvisionAnalysis,
  governingAgreement: string,
  nodeId?: string,
  structuralUnresolved?: boolean,
  redlineAmbiguous?: boolean,
): CovenantSummaryItem {
  return {
    nodeId,
    structuralUnresolved,
    redlineAmbiguous: redlineAmbiguous || undefined,
    category: analysis.category,
    categoryLabel: analysis.categoryLabel,
    nonCovenantSubtype: analysis.nonCovenantSubtype ?? null,
    affirmativeKind: analysis.affirmativeKind ?? null,
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
    parentChapeau: analysis.parentChapeau,
    operativeFullSpan: analysis.operativeFullSpan,
    operativeNodeType: analysis.operativeNodeType,
    articleHeading: analysis.articleHeading,
    sourceCitation: analysis.sourceCitation,
    governingAgreement,
    families: analysis.families,
    relatedDefinedTerms: analysis.applicableDefinitions.map((d) => d.term),
    applicableDefinitions: analysis.applicableDefinitions,
    entityScope: entityScopeFromAnalysis(analysis),
    crossReferences: analysis.crossReferences,
    crossReferenceResolutions: analysis.crossReferenceResolutions,
    definitionCoverageIncomplete: analysis.definitionCoverageIncomplete,
    definitionMentionsOmitted: analysis.definitionMentionsOmitted,
    dependencies: analysis.dependencies,
    epistemicStatus: analysis.epistemicStatus,
    interpretationNote: analysis.interpretationNote,
    // Phase E: structural uncertainty is preserved through every
    // layer — it surfaces in unresolvedQuestions (read by the
    // Rulebook, Ask, and counsel review), never silently dropped.
    // Redline port (from PR #428): redline ambiguity is preserved
    // the same way.
    unresolvedQuestions: [
      ...analysis.unresolved,
      ...(structuralUnresolved
        ? [
            "Structural relationship unresolved: this provision's parent/article could not be established deterministically from span containment + ref-consistency. Its excerpt is real text, but its placement in the hierarchy is not certified — confirm the governing article/section before relying on it.",
          ]
        : []),
      ...(redlineAmbiguous ? [REDLINE_AMBIGUITY_QUESTION] : []),
    ],
    alternativeInterpretations: analysis.alternativeInterpretations,
    assumptions: analysis.assumptions,
    judgmentCalls: analysis.judgmentCalls,
    analysis,
  };
}

const collapseWs = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * Redline port (from PR #428): does a candidate's source intersect a
 * redline-ambiguous span? Two independent signals, either suffices:
 * (1) coordinate overlap — the candidate's structural node span
 * intersects a located span range (both in normalized document
 * text coordinates); (2) text containment — the candidate's
 * excerpt carries a distinctive slice of the span's preserved
 * text (the fallback when a span could not be located verbatim).
 * An empty span (unmatched element at end of document) taints
 * nothing: it carried no text anyone could rely on.
 */
function candidateIntersectsRedlineSpan(
  candidate: CovenantCandidateRecord,
  node: StructuralNodeRecord | undefined,
  spans: RedlineAmbiguityRecord[],
): boolean {
  const excerptNorm = collapseWs(candidate.excerpt ?? "");
  for (const span of spans) {
    if (span.charStart >= 0 && span.charEnd > span.charStart && node) {
      if (node.charStart < span.charEnd && span.charStart < node.charEnd) return true;
    }
    const spanNorm = collapseWs(span.text ?? "");
    if (spanNorm.length >= 16 && excerptNorm.length >= 16) {
      if (
        excerptNorm.includes(spanNorm.slice(0, 64)) ||
        excerptNorm.includes(spanNorm.slice(-64)) ||
        spanNorm.includes(excerptNorm.slice(0, 64))
      ) {
        return true;
      }
    }
  }
  return false;
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
  /** Redline port (from PR #428): redline-ambiguous spans recorded at extraction for this source, if any. */
  redlineAmbiguities?: RedlineAmbiguityRecord[];
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
  // Section context (classification census step 4): for each
  // SECTION node, its covenant subject and recovered title.
  // The subject comes from the section stem candidate's own
  // families (heading families lead its list) or, when the stem
  // carries no mappable family, from the family category
  // carried by a strict majority of the section's clause
  // candidates — the agreement's own organization, measured
  // from the section's population rather than guessed from a
  // garbled heading. The title is recovered from the stem
  // excerpt when the node heading is a truncated fragment.
  const sectionContext = new Map<
    string,
    { subjectCategory?: CovenantCategoryKey; title?: string }
  >();
  {
    const sectionOf = (nodeId: string | undefined): StructuralNodeRecord | undefined => {
      let node = nodeId ? nodeById.get(nodeId) : undefined;
      const seen = new Set<string>();
      while (node && !seen.has(node.nodeId)) {
        seen.add(node.nodeId);
        if (node.nodeType === "SECTION") return node;
        node = node.parentNodeId ? nodeById.get(node.parentNodeId) : undefined;
      }
      return undefined;
    };
    const stemBySection = new Map<string, (typeof params.candidates)[number]>();
    const clauseStats = new Map<string, { total: number; byCat: Map<string, number> }>();
    for (const c of params.candidates) {
      const sec = sectionOf(c.nodeId);
      if (!sec) continue;
      if (c.nodeId === sec.nodeId) {
        stemBySection.set(sec.nodeId, c);
        continue;
      }
      const st = clauseStats.get(sec.nodeId) ?? { total: 0, byCat: new Map<string, number>() };
      st.total += 1;
      const cats = new Set<string>();
      for (const f of c.families) {
        const cat = FAMILY_TO_CATEGORY[f];
        if (cat && cat !== "OTHER" && cat !== "BASKETS_EXCEPTIONS_CONDITIONS") cats.add(cat);
      }
      for (const cat of cats) st.byCat.set(cat, (st.byCat.get(cat) ?? 0) + 1);
      clauseStats.set(sec.nodeId, st);
    }
    const sectionIds = new Set([...stemBySection.keys(), ...clauseStats.keys()]);
    for (const sectionId of sectionIds) {
      const secNode = nodeById.get(sectionId);
      const stem = stemBySection.get(sectionId);
      const title =
        stem && secNode
          ? recoverSectionTitle(stem.excerpt ?? "", secNode.heading ?? "")
          : undefined;
      let subject: CovenantCategoryKey | undefined;
      if (stem) {
        const cat = FAMILY_TO_CATEGORY[stem.families[0] ?? ""];
        if (cat && cat !== "OTHER" && cat !== "BASKETS_EXCEPTIONS_CONDITIONS") subject = cat;
      }
      if (!subject && !title) {
        // Population subject — last resort, and held to a high
        // bar: the section's own title (when recoverable) and
        // its stem's families outrank the population, and the
        // population must be near-unanimous (a strict two-thirds
        // of at least three clause candidates). Exception lists
        // of a bespoke covenant (restrictive agreements) name a
        // different object per prong — a bare majority there
        // manufactures a subject the section does not have; a
        // true single-covenant section (an Investments section's
        // prongs) is homogeneous by construction.
        const st = clauseStats.get(sectionId);
        if (st && st.total >= 3) {
          let best: [string, number] | null = null;
          for (const [cat, n] of st.byCat) if (!best || n > best[1]) best = [cat, n];
          if (best && best[1] * 3 > st.total * 2) subject = best[0] as CovenantCategoryKey;
        }
      }
      if (subject || title) sectionContext.set(sectionId, { subjectCategory: subject, title });
    }
  }
  const runAnalysis = (
    c: (typeof params.candidates)[number],
    rollup?: { category: CovenantCategoryKey; nonCovenantSubtype?: NonCovenantSubtype },
  ) =>
    analyzeProvision({
      sourceId: params.sourceId,
      documentTitle: params.documentTitle,
      candidate: c,
      definitions: params.definitions,
      structuralNodes: params.structuralNodes,
      crossReferences: params.crossReferences,
      parentChapeau: parentChapeauOf(c),
      sectionContext,
      rollup,
    });
  const pass1 = ranked.map((c) => runAnalysis(c));
  // Step 7: stem rollup. A SECTION or ARTICLE stem whose own
  // text is only a title / chapeau (its operative content lives
  // in separately-classified descendants) takes a determinate
  // category from exactly two sources: (A) for an ARTICLE item,
  // the article's own title identity (a definitions article IS
  // definitions; an events-of-default article IS events of
  // default — the title is the determination, its descendants
  // are triggers, grace periods, and remedies by design); or
  // (B) UNANIMOUS determinate descendants — every classified
  // descendant item agrees on one category. A mixed descendant
  // population (a negative-covenants article chapeau above
  // debt, liens, RP, and merger sections) determines nothing
  // and the stem stays OTHER.
  const rollupByNodeId = new Map<
    string,
    { category: CovenantCategoryKey; nonCovenantSubtype?: NonCovenantSubtype }
  >();
  {
    const catByNodeId = new Map(ranked.map((c, i) => [c.nodeId ?? "", pass1[i].category]));
    const isDescendantOf = (nodeId: string, ancestorId: string): boolean => {
      let node = nodeById.get(nodeId);
      const seen = new Set<string>();
      while (node?.parentNodeId && !seen.has(node.nodeId)) {
        seen.add(node.nodeId);
        if (node.parentNodeId === ancestorId) return true;
        node = nodeById.get(node.parentNodeId);
      }
      return false;
    };
    ranked.forEach((c, i) => {
      if (pass1[i].category !== "OTHER" || !c.nodeId) return;
      const node = nodeById.get(c.nodeId);
      if (!node || (node.nodeType !== "SECTION" && node.nodeType !== "ARTICLE")) return;
      if (node.nodeType === "ARTICLE") {
        const title =
          recoverSectionTitle(c.excerpt ?? "", node.heading ?? "") ?? node.heading ?? "";
        const despaced = `${title} ${(c.excerpt ?? "").slice(0, 160)}`
          .replace(/\s+/g, "")
          .toUpperCase();
        if (despaced.includes("EVENTSOFDEFAULT")) {
          rollupByNodeId.set(c.nodeId, { category: "EVENTS_OF_DEFAULT" });
          return;
        }
        if (despaced.includes("DEFINITIONS")) {
          rollupByNodeId.set(c.nodeId, {
            category: "NON_COVENANT",
            nonCovenantSubtype: "DEFINITION",
          });
          return;
        }
        if (despaced.includes("REPRESENTATIONS")) {
          rollupByNodeId.set(c.nodeId, {
            category: "NON_COVENANT",
            nonCovenantSubtype: "REPRESENTATION",
          });
          return;
        }
        if (despaced.includes("AFFIRMATIVECOVENANTS")) {
          rollupByNodeId.set(c.nodeId, { category: "AFFIRMATIVE" });
          return;
        }
      }
      const descCats = new Set<CovenantCategoryKey>();
      let determinate = 0;
      for (const o of ranked) {
        if (!o.nodeId || o.nodeId === c.nodeId) continue;
        if (!isDescendantOf(o.nodeId, c.nodeId)) continue;
        const cat = catByNodeId.get(o.nodeId);
        if (cat && cat !== "OTHER") {
          descCats.add(cat);
          determinate += 1;
        }
      }
      const minimum = node.nodeType === "ARTICLE" ? 3 : 1;
      if (determinate >= minimum && descCats.size === 1) {
        rollupByNodeId.set(c.nodeId, { category: [...descCats][0] });
      }
    });
  }
  ranked.forEach((c, i) => {
    const rollup = c.nodeId ? rollupByNodeId.get(c.nodeId) : undefined;
    const analysis = rollup ? runAnalysis(c, rollup) : pass1[i];
    const itemNode = c.nodeId ? nodeById.get(c.nodeId) : undefined;
    items.push(
      itemFromAnalysis(
        analysis,
        params.documentTitle,
        c.nodeId,
        itemNode ? itemNode.ambiguous === true || (itemNode.structuralViolations?.length ?? 0) > 0 : undefined,
        params.redlineAmbiguities && params.redlineAmbiguities.length > 0
          ? candidateIntersectsRedlineSpan(c, itemNode, params.redlineAmbiguities)
          : undefined,
      ),
    );
  });
  for (const it of items) countsByCategory[it.category] = (countsByCategory[it.category] ?? 0) + 1;

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
  // Formula representation (step 3): stamp section stems on the
  // FINAL item list. An item is a stem when other items' nodes are
  // its structural children — the section's operative clauses are
  // itemized separately and carry the terms, so the stem itself
  // must not sit in the queue as a bare grant item with no terms
  // (nor mint a Permission duplicating its clauses'). Evaluated
  // after the cap: a child cut by the cap is not "separately
  // present", and the summary-cap disclosure already covers it.
  {
    const itemNodeIds = new Set(capped.map((i) => i.nodeId).filter(Boolean) as string[]);
    const childRefsByParent = new Map<string, string[]>();
    for (const child of capped) {
      if (!child.nodeId) continue;
      const parentId = nodeById.get(child.nodeId)?.parentNodeId;
      if (parentId && parentId !== child.nodeId && itemNodeIds.has(parentId)) {
        const list = childRefsByParent.get(parentId) ?? [];
        list.push(child.sectionRef);
        childRefsByParent.set(parentId, list);
      }
    }
    for (const it of capped) {
      if (!it.nodeId) continue;
      const refs = childRefsByParent.get(it.nodeId);
      if (refs && refs.length > 0) it.sectionStemChildRefs = refs;
    }
  }
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
    ...(params.redlineAmbiguities && params.redlineAmbiguities.length > 0
      ? { redlineAmbiguities: params.redlineAmbiguities }
      : {}),
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
