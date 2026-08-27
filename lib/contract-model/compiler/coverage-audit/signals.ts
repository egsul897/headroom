/**
 * Phase 2E - independently authored deterministic legal/economic signal
 * detection (task §5). Written from scratch against this task's own
 * signal list, not imported from or derived by inspecting
 * discovery/pass-a-signals.ts's pattern table - inevitable vocabulary
 * overlap is expected (both detect the same real legal-drafting
 * constructions), but this module is its own independent implementation,
 * enforced by tests/contract-model/coverage-audit-independence.test.ts,
 * which fails if this file (or any other independent-inventory module)
 * imports from discovery/* or context-retrieval/pipeline.ts.
 *
 * No company/package/family-specific keyword appears here (task §7/§20) -
 * every pattern is a generic legal-drafting construction.
 */

export interface SignalHit {
  name: string;
  category: "PROHIBITORY_PERMISSIVE" | "ECONOMIC" | "MECHANIC" | "FAMILY_HEADLINE" | "AMENDMENT" | "DEFINITIONAL";
}

interface SignalDef {
  name: string;
  category: SignalHit["category"];
  re: RegExp;
}

const PROHIBITORY_PERMISSIVE: SignalDef[] = [
  { name: "shall_not", category: "PROHIBITORY_PERMISSIVE", re: /\bshall not\b/i },
  { name: "may_not", category: "PROHIBITORY_PERMISSIVE", re: /\bmay not\b/i },
  { name: "will_not", category: "PROHIBITORY_PERMISSIVE", re: /\bwill not\b/i },
  { name: "permit_permitted", category: "PROHIBITORY_PERMISSIVE", re: /\bpermit(?:ted)?\b/i },
  { name: "except", category: "PROHIBITORY_PERMISSIVE", re: /\bexcept(?:\s+that)?\b/i },
  { name: "provided_that", category: "PROHIBITORY_PERMISSIVE", re: /\bprovided(?:,?\s+(?:that|further|however))\b/i },
  { name: "notwithstanding", category: "PROHIBITORY_PERMISSIVE", re: /\bnotwithstanding\b/i },
  { name: "subject_to", category: "PROHIBITORY_PERMISSIVE", re: /\bsubject to\b/i },
  { name: "so_long_as", category: "PROHIBITORY_PERMISSIVE", re: /\bso long as\b/i },
  { name: "may_permissive", category: "PROHIBITORY_PERMISSIVE", re: /\bmay\b/i },
  { name: "shall_be_permitted", category: "PROHIBITORY_PERMISSIVE", re: /\bshall be permitted\b/i },
  { name: "shall_not_permit", category: "PROHIBITORY_PERMISSIVE", re: /\bshall not permit\b/i },
  { name: "unless", category: "PROHIBITORY_PERMISSIVE", re: /\bunless\b/i },
  { name: "only_if", category: "PROHIBITORY_PERMISSIVE", re: /\bonly if\b/i },
];

const ECONOMIC: SignalDef[] = [
  { name: "currency_value", category: "ECONOMIC", re: /[$£€]\s?[\d,]+(?:\.\d+)?/ },
  { name: "percentage", category: "ECONOMIC", re: /\d+(?:\.\d+)?\s?%/ },
  { name: "ratio_expression", category: "ECONOMIC", re: /\d+(?:\.\d+)?\s*(?:x\b|to\s*1\.0+|:\s*1\.0+)/i },
  { name: "greater_of", category: "ECONOMIC", re: /\bgreater of\b/i },
  { name: "lesser_of", category: "ECONOMIC", re: /\blesser of\b/i },
  { name: "aggregate_amount", category: "ECONOMIC", re: /\baggregate(?:d)?\s+(?:amount|cap|principal)/i },
  { name: "fixed_amount", category: "ECONOMIC", re: /\bfixed\s+(?:amount|dollar)/i },
  { name: "ebitda", category: "ECONOMIC", re: /\bEBITDA\b/ },
  { name: "total_assets", category: "ECONOMIC", re: /\bTotal Assets\b/ },
  { name: "consolidated_assets", category: "ECONOMIC", re: /\bConsolidated Assets\b/i },
  { name: "available_amount", category: "ECONOMIC", re: /\bAvailable Amount\b/ },
  { name: "builder_concept", category: "ECONOMIC", re: /\b(?:cumulative|builder)\b/i },
  { name: "leverage_threshold", category: "ECONOMIC", re: /\bLeverage Ratio\b/i },
  { name: "coverage_threshold", category: "ECONOMIC", re: /\bCoverage Ratio\b/i },
  { name: "cap_language", category: "ECONOMIC", re: /\bshall not exceed\b/i },
  { name: "annual_limit", category: "ECONOMIC", re: /\bper (?:fiscal )?(?:year|annum)\b/i },
  { name: "cumulative_limit", category: "ECONOMIC", re: /\bcumulative(?:ly)?\b/i },
];

const MECHANIC: SignalDef[] = [
  { name: "grower_basket", category: "MECHANIC", re: /\bgreater of\s+\$[\d,]+.{0,40}%\s+of\b/i },
  { name: "builder_basket", category: "MECHANIC", re: /\bRetained (?:Excess )?Cash Flow\b/i },
  { name: "ratio_basket", category: "MECHANIC", re: /\bpro forma\b.{0,80}\bratio\b/i },
  { name: "shared_cap", category: "MECHANIC", re: /\b(?:combined|shared)\s+(?:with|capacity|basket)\b/i },
  { name: "anti_duplication", category: "MECHANIC", re: /\b(?:without duplication|anti.?duplication)\b/i },
  { name: "reclassification", category: "MECHANIC", re: /\breclassif(?:y|ied|ication)\b/i },
  { name: "redesignation", category: "MECHANIC", re: /\bredesignat(?:e|ed|ion)\b/i },
  { name: "refinancing", category: "MECHANIC", re: /\brefinanc(?:e|ed|ing)\b/i },
  { name: "no_default_condition", category: "MECHANIC", re: /\bno (?:Default|Event of Default)\b/i },
  { name: "pro_forma_compliance", category: "MECHANIC", re: /\bpro forma compliance\b/i },
  { name: "mandatory_prepayment", category: "MECHANIC", re: /\bmandatory prepayment\b/i },
  { name: "asset_sale_sweep", category: "MECHANIC", re: /\b(?:reinvest(?:ment)?|Net Proceeds)\b/i },
  { name: "cure_right", category: "MECHANIC", re: /\bcure (?:right|period)\b/i },
  { name: "acquisition_permission", category: "MECHANIC", re: /\bPermitted Acquisition\b/i },
  { name: "restricted_subsidiary_mechanic", category: "MECHANIC", re: /\b(?:Restricted|Unrestricted) Subsidiar(?:y|ies)\b/ },
];

const FAMILY_HEADLINE: SignalDef[] = [
  { name: "indebtedness", category: "FAMILY_HEADLINE", re: /\bIndebtedness\b/ },
  { name: "liens", category: "FAMILY_HEADLINE", re: /\bLiens?\b/ },
  { name: "restricted_payments", category: "FAMILY_HEADLINE", re: /\bRestricted Payments?\b/i },
  { name: "investments", category: "FAMILY_HEADLINE", re: /\bInvestments?\b/ },
  { name: "asset_dispositions", category: "FAMILY_HEADLINE", re: /\b(?:Asset Sales?|Dispositions?)\b/i },
  { name: "affiliate_transactions", category: "FAMILY_HEADLINE", re: /\bAffiliate Transactions?\b/i },
  { name: "financial_covenants", category: "FAMILY_HEADLINE", re: /\bFinancial Covenants?\b/i },
  { name: "guarantees", category: "FAMILY_HEADLINE", re: /\bGuarant(?:y|ies|ee)\b/i },
  { name: "security", category: "FAMILY_HEADLINE", re: /\bSecurity (?:Agreement|Interest)\b/i },
  { name: "subsidiary_restrictions", category: "FAMILY_HEADLINE", re: /\bSubsidiar(?:y|ies)\b/ },
  { name: "merger_consolidation", category: "FAMILY_HEADLINE", re: /\b(?:Merger|Consolidation|Fundamental Changes?)\b/i },
  { name: "change_of_control", category: "FAMILY_HEADLINE", re: /\bChange of Control\b/i },
  { name: "sale_leaseback", category: "FAMILY_HEADLINE", re: /\bSale.?Leaseback\b/i },
  { name: "subordinated_debt", category: "FAMILY_HEADLINE", re: /\bSubordinat(?:e|ed|ion)\b/i },
  { name: "reporting_compliance", category: "FAMILY_HEADLINE", re: /\b(?:Reporting|Compliance Certificate)\b/i },
];

/**
 * Phase 2F.1 §11 - the two signal categories the raw-source fallback
 * auditor needs that had no prior member here: amendment/modification
 * language (so a structurally-unavailable amendment document's own
 * operative text - "hereby amended", "restated", "modified" - can be
 * told apart from a structurally-unavailable ordinary covenant
 * document), and defined-term-like language (so a raw span carrying real
 * defined-term declarations, in any of the conventions
 * structural-definitions.ts now recognizes, is flagged even when no
 * structural node exists to run that module's own node-scoped detector
 * against). Same generic, non-package-specific discipline as every
 * other signal in this file.
 */
const AMENDMENT: SignalDef[] = [
  { name: "hereby_amended", category: "AMENDMENT", re: /\bhereby amend(?:s|ed)?\b/i },
  { name: "amendment_restatement", category: "AMENDMENT", re: /\bamend(?:ed|ment)?\s+and\s+restat(?:e|ed|ement)\b/i },
  { name: "amendment_noun", category: "AMENDMENT", re: /\bAmendment\b/ },
  { name: "modified_supplemented", category: "AMENDMENT", re: /\b(?:modifi(?:ed|cation)|supplement(?:ed|al)?)\b/i },
  { name: "effective_date_of_amendment", category: "AMENDMENT", re: /\bEffective Date\b/ },
  { name: "conditions_precedent", category: "AMENDMENT", re: /\bconditions? precedent\b/i },
  { name: "reaffirm", category: "AMENDMENT", re: /\breaffirm(?:s|ed|ation)?\b/i },
  { name: "no_novation", category: "AMENDMENT", re: /\bno novation\b/i },
];

const DEFINITIONAL: SignalDef[] = [
  { name: "quoted_term_means", category: "DEFINITIONAL", re: /["“”][^"“”]{1,80}["“”]\s*(?:means|shall mean)/i },
  { name: "quoted_term_colon", category: "DEFINITIONAL", re: /["“”][^"“”]{1,80}["“”]\s*:/ },
  { name: "defined_terms_heading", category: "DEFINITIONAL", re: /\bDefined Terms\b/i },
  { name: "capitalized_defined_term_usage", category: "DEFINITIONAL", re: /\bas defined (?:herein|below|above|in)\b/i },
];

const ALL_SIGNALS: SignalDef[] = [...PROHIBITORY_PERMISSIVE, ...ECONOMIC, ...MECHANIC, ...FAMILY_HEADLINE];
const FALLBACK_ONLY_SIGNALS: SignalDef[] = [...AMENDMENT, ...DEFINITIONAL];

export function detectIndependentSignals(text: string): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const def of ALL_SIGNALS) {
    if (def.re.test(text)) hits.push({ name: def.name, category: def.category });
  }
  return hits;
}

/**
 * Phase 2F.1 §11 - AMENDMENT/DEFINITIONAL signals, deliberately kept OUT
 * of detectIndependentSignals' own ALL_SIGNALS set and the normal
 * structural-node-anchored inventory path (source-inventory.ts) that
 * already has its own established, tested behavior of treating purely
 * definitional material as non-material for THAT path's own purpose
 * (task §26's own "do not allow parser improvements to regress" applied
 * here to the auditor's own pre-existing behavior, not just Phase 2A/2B).
 * Used only by raw-source-fallback.ts, where an uncovered span carrying
 * defined-term-like or amendment-shaped language IS exactly the signal
 * this task's own §13 wants surfaced.
 */
export function detectAmendmentAndDefinitionalSignals(text: string): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const def of FALLBACK_ONLY_SIGNALS) {
    if (def.re.test(text)) hits.push({ name: def.name, category: def.category });
  }
  return hits;
}

/** Bare enumerated-item markers ("(i)", "(ii)", "(a)", "(b)") anywhere in text - used to detect possible unrepresented multi-item lists (task §13/§30), independent of whether the structural parser turned each into its own node. */
const ENUMERATION_MARKER = /\((?:[ivxlcdm]{1,6}|[a-z]{1,2})\)/gi;

/** A gap between one marker and the next must show at least this much real content, OR a substantive economic/legal signal, to count as its own genuine item - otherwise it is far more likely a bare CITATION LIST ("Indebtedness permitted under clauses (j) , (m) , (n)(ii)(C) , (u) ...") than a new operative rule. Real drafting almost always attaches real economic content to a genuine enumerated item; a citation list attaches almost nothing between markers beyond a comma. This is a real, measured, generic precision fix - not a package-specific rule - and does not eliminate every false positive (a citation list can carry a real parenthetical qualifier long enough to clear this bar), a known, disclosed limitation. */
const MIN_GAP_CHARS = 12;
const SUBSTANTIVE_NEARBY_GAP = /[$%]|greater of|lesser of|shall not|provided|so long as|notwithstanding|except|Indebtedness|Investment|Restricted Payment|Lien|Disposition/i;

export function countInlineEnumerationMarkers(text: string): string[] {
  const re = new RegExp(ENUMERATION_MARKER.source, ENUMERATION_MARKER.flags);
  const occurrences: { marker: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    occurrences.push({ marker: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }

  const genuine = new Set<string>();
  for (let i = 0; i < occurrences.length; i++) {
    const cur = occurrences[i]!;
    const nextStart = i + 1 < occurrences.length ? occurrences[i + 1]!.start : text.length;
    const gapText = text.slice(cur.end, nextStart);
    if (gapText.trim().length >= MIN_GAP_CHARS || SUBSTANTIVE_NEARBY_GAP.test(gapText)) genuine.add(cur.marker);
  }
  return [...genuine];
}
