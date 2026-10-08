/**
 * Structural drafting signatures from surface patterns.
 *
 * These tokens describe how text is drafted, not what the solver IR would
 * compile to. Matching signatures means similar drafting shape — never
 * semantic equivalence.
 */
import type { DraftingCategory, SignatureToken, StructuralSignature } from "./types";
import { normalizeForMatch } from "./normalize";

export function buildSignatureKey(category: DraftingCategory, tokens: SignatureToken[]): string {
  const sorted = [...new Set(tokens)].sort();
  return `${category}|${sorted.join("+")}`;
}

export function makeSignature(category: DraftingCategory, tokens: SignatureToken[]): StructuralSignature {
  const unique = [...new Set(tokens)].sort() as SignatureToken[];
  return { category, tokens: unique, key: buildSignatureKey(category, unique) };
}

function has(t: string, re: RegExp): boolean {
  return re.test(t);
}

/** Detect which drafting categories a window may belong to (multi-label). */
export function detectCategories(rawText: string): DraftingCategory[] {
  const t = normalizeForMatch(rawText);
  const out: DraftingCategory[] = [];

  if (
    has(t, /\b(shall not|will not|may not|the (borrower|company|issuer).{0,40}shall not)\b/) ||
    has(t, /\b(limitation on|negative covenant|restricted payments?|permitted (indebtedness|liens|investments))\b/) ||
    has(t, /\bpermit\b.{0,80}\b(to exceed|indebtedness|liens?)\b/)
  ) {
    out.push("COVENANT_STRUCTURE");
  }

  if (
    (has(t, /\b(means|has the meaning)\b/) || has(t, /\bfor purposes of this definition\b/)) &&
    has(t, /\b(consolidated|ebitda|indebtedness|lien|investment|restricted|available amount|cash equivalents)\b/)
  ) {
    out.push("DEFINITION_FORMULATION");
  }

  if (
    (has(t, /\b(greater of|lesser of)\b/) && has(t, /\b(ebitda|total assets|available amount|consolidated)\b/)) ||
    has(t, /\b(builder basket|available amount|cumulative credit)\b/) ||
    (has(t, /\bin an aggregate (principal )?amount (not to exceed|equal to)\b/) &&
      has(t, /\b(indebtedness|investments?|liens?|restricted payments?)\b/))
  ) {
    out.push("BASKET_FORMULA");
  }

  if (has(t, /\b(provided that|provided,? however|so long as|subject to the foregoing)\b/)) {
    out.push("PROVISO_PLACEMENT");
  }

  if (
    has(t, /\b(restricted subsidiar(?:y|ies)|unrestricted subsidiar(?:y|ies)|loan part(?:y|ies)|non-loan part(?:y|ies)|guarantor|foreign subsidiar(?:y|ies)|excluded subsidiar(?:y|ies))\b/)
  ) {
    out.push("ENTITY_SCOPE");
  }

  if (
    has(t, /\b(required lenders?|amendment|waive|consent of|sacred|yank[- ]?a[- ]?bank|affected lenders?|class voting)\b/) &&
    has(t, /\b(section\s+9|section\s+10|amendments?|waivers?|consents?)\b/)
  ) {
    out.push("AMENDMENT_MECHANISM");
  }

  if (
    has(t, /\b(in the aggregate|together with|shared (cap|capacity|basket)|combined (cap|amount)|aggregate principal amount)\b/) &&
    has(t, /\b(section|clause|pursuant to|incurred under|outstanding under)\b/)
  ) {
    out.push("SHARED_CAPACITY");
  }

  if (has(t, /\b(reclassif(?:y|ies|ied|ication)|classify or reclassify|divide and classify|redesignat)/)) {
    out.push("RECLASSIFICATION");
  }

  if (
    (has(t, /\b(indenture|senior notes|intercreditor agreement|other credit agreement|abl credit agreement)\b/) &&
      has(t, /\b(subject to|outstanding under|pursuant to|refinancing indebtedness)\b/)) ||
    (has(t, /\boutstanding under\b/) && has(t, /\b(indenture|notes)\b/))
  ) {
    out.push("CROSS_DOCUMENT_RESTRICTION");
  }

  if (
    has(t, /\b(intercreditor|standstill|payment[s]? over|turnover|priority collateral|abl priority|junior lien|first lien|dip financing|joinder agreement)\b/)
  ) {
    out.push("INTERCREDITOR_LIMITATION");
  }

  return out;
}

const CATEGORY_CORE_TOKENS: Record<DraftingCategory, SignatureToken[]> = {
  COVENANT_STRUCTURE: ["GENERAL_PROHIBITION", "EXCEPTION_LIST_ITEM", "NOTWITHSTANDING_OVERRIDE", "DESIGNATION_RULE", "STEP_UP_WITH_LIMITS"],
  DEFINITION_FORMULATION: ["DEFINITION_MEANS", "DEFINITION_INCLUDES", "DEFINITION_FOR_PURPOSES", "BUILDER_BASKET"],
  BASKET_FORMULA: ["GREATER_OF_FLAT_OR_EBITDA", "LESSER_OF_FLAT_OR_EBITDA", "BUILDER_BASKET", "RATIO_GATE", "SHARED_AGGREGATE"],
  PROVISO_PLACEMENT: ["PROVISO_AFTER_PERMISSION", "PROVISO_AFTER_PROHIBITION", "STEP_UP_WITH_LIMITS"],
  ENTITY_SCOPE: [
    "ENTITY_RESTRICTED_SUB",
    "ENTITY_UNRESTRICTED_SUB",
    "ENTITY_LOAN_PARTY",
    "ENTITY_NON_LOAN_PARTY",
    "ENTITY_FOREIGN_SUB",
    "ENTITY_GUARANTOR_ONLY",
  ],
  AMENDMENT_MECHANISM: ["AMENDMENT_REQUIRED_LENDERS", "AMENDMENT_SACRED_RIGHT", "AMENDMENT_YANK_A_BANK", "AMENDMENT_AFFECTED_LENDER"],
  SHARED_CAPACITY: ["SHARED_AGGREGATE", "IN_THE_AGGREGATE_WITH", "TOGETHER_WITH_SECTIONS"],
  RECLASSIFICATION: ["RECLASSIFY_SOLE_DISCRETION", "RECLASSIFY_AUTOMATIC", "FIXED_VS_INCURRENCE"],
  CROSS_DOCUMENT_RESTRICTION: ["CROSS_DOC_SUBJECT_TO", "CROSS_DOC_CAP_REFERENCE", "CROSS_DOC_REFINANCING_LINEAGE"],
  INTERCREDITOR_LIMITATION: [
    "INTERCREDITOR_STANDSTILL",
    "INTERCREDITOR_TURNOVER",
    "INTERCREDITOR_PRIORITY_COLLATERAL",
    "INTERCREDITOR_JOINDER",
    "INTERCREDITOR_DIP",
  ],
};

export function categoryHasCoreToken(category: DraftingCategory, tokens: SignatureToken[]): boolean {
  const core = CATEGORY_CORE_TOKENS[category];
  return tokens.some((t) => core.includes(t));
}

export function extractSignatureTokens(category: DraftingCategory, rawText: string): SignatureToken[] {
  const t = normalizeForMatch(rawText);
  const tokens: SignatureToken[] = [];

  const permissionLead =
    has(t, /\b(may|shall be permitted|is permitted|permitted to)\b/) ||
    has(t, /\bnotwithstanding the foregoing\b/);
  const prohibitionLead = has(t, /\b(shall not|will not|may not|prohibit)\b/) || has(t, /\bpermit\b.{0,40}\bto exceed\b/);

  if (has(t, /\bprovided that\b/) || has(t, /\bprovided,? however\b/)) {
    if (permissionLead) tokens.push("PROVISO_AFTER_PERMISSION");
    if (prohibitionLead) tokens.push("PROVISO_AFTER_PROHIBITION");
  }
  if (has(t, /\bnotwithstanding (the foregoing|anything)\b/)) tokens.push("NOTWITHSTANDING_OVERRIDE");

  if (has(t, /\bgreater of\b/) && has(t, /\beBITDA\b/)) tokens.push("GREATER_OF_FLAT_OR_EBITDA");
  if (has(t, /\blesser of\b/) && has(t, /\beBITDA\b/)) tokens.push("LESSER_OF_FLAT_OR_EBITDA");
  if (has(t, /\b(leverage ratio|interest coverage|fixed charge)\b/) || has(t, /\b\d+(?:\.\d+)?\s*(?:to|:)\s*1(?:\.00)?\b/)) {
    tokens.push("RATIO_GATE");
  }
  if (has(t, /\b(builder basket|available amount|cumulative credit|retained excess cash)\b/)) {
    tokens.push("BUILDER_BASKET");
  }

  if (has(t, /\bin the aggregate\b/)) tokens.push("SHARED_AGGREGATE");
  if (has(t, /\bin the aggregate with\b/) || has(t, /\btogether with (any|all|amounts?|indebtedness)\b/)) {
    tokens.push("IN_THE_AGGREGATE_WITH");
  }
  if (has(t, /\btogether with\b/) && has(t, /\bsection\b/)) tokens.push("TOGETHER_WITH_SECTIONS");

  if (has(t, /\b(sole discretion|in its (sole )?discretion).{0,80}\b(reclassif|classify)/) || has(t, /\b(reclassif|classify).{0,80}\b(sole discretion|in its (sole )?discretion)/)) {
    tokens.push("RECLASSIFY_SOLE_DISCRETION");
  }
  if (has(t, /\b(automatically|immediate(?:ly)?).{0,40}\breclassif/) || has(t, /\breclassif.{0,40}\b(automatically|unless.{0,20}elects)/)) {
    tokens.push("RECLASSIFY_AUTOMATIC");
  }
  if (has(t, /\bfixed amounts?\b/) || has(t, /\bincurrence-based amounts?\b/)) {
    tokens.push("FIXED_VS_INCURRENCE");
  }

  if (has(t, /\brestricted subsidiar/)) tokens.push("ENTITY_RESTRICTED_SUB");
  if (has(t, /\bunrestricted subsidiar/)) tokens.push("ENTITY_UNRESTRICTED_SUB");
  if (has(t, /\bloan part(?:y|ies)\b/)) tokens.push("ENTITY_LOAN_PARTY");
  if (has(t, /\bnon-loan part(?:y|ies)\b/) || has(t, /\bnon loan part(?:y|ies)\b/)) tokens.push("ENTITY_NON_LOAN_PARTY");
  if (has(t, /\bforeign subsidiar/)) tokens.push("ENTITY_FOREIGN_SUB");
  if (has(t, /\bguarantor/) && !has(t, /\bguarantee and collateral agreement\b/)) tokens.push("ENTITY_GUARANTOR_ONLY");

  if (has(t, /\bmeans\b/)) tokens.push("DEFINITION_MEANS");
  if (has(t, /\bincludes?\b/) && has(t, /\bwithout limitation\b/)) tokens.push("DEFINITION_INCLUDES");
  if (has(t, /\bfor purposes of\b/)) tokens.push("DEFINITION_FOR_PURPOSES");

  if (has(t, /\brequired lenders?\b/)) tokens.push("AMENDMENT_REQUIRED_LENDERS");
  if (has(t, /\b(sacred|all lender|unanimous).{0,40}\b(consent|amend)/) || has(t, /\bpro rata sharing\b/)) {
    tokens.push("AMENDMENT_SACRED_RIGHT");
  }
  if (has(t, /\byank[- ]?a[- ]?bank\b/) || has(t, /\breplace.{0,40}\bnon-consenting\b/)) {
    tokens.push("AMENDMENT_YANK_A_BANK");
  }
  if (has(t, /\baffected lenders?\b/) || has(t, /\baffected class\b/)) tokens.push("AMENDMENT_AFFECTED_LENDER");

  if (has(t, /\bsubject to\b/) && has(t, /\b(indenture|intercreditor|notes|other (credit )?agreement)\b/)) {
    tokens.push("CROSS_DOC_SUBJECT_TO");
  }
  if (has(t, /\boutstanding under\b/) && has(t, /\b(indenture|notes|facility|agreement)\b/)) {
    tokens.push("CROSS_DOC_CAP_REFERENCE");
  }
  if (has(t, /\brefinancing (indebtedness|debt)\b/) && has(t, /\b(pursuant to|incurred under|outstanding)\b/)) {
    tokens.push("CROSS_DOC_REFINANCING_LINEAGE");
  }

  if (has(t, /\bstandstill\b/)) tokens.push("INTERCREDITOR_STANDSTILL");
  if (has(t, /\b(payment[s]? over|turnover)\b/)) tokens.push("INTERCREDITOR_TURNOVER");
  if (has(t, /\b(priority collateral|abl priority|notes priority|shared collateral)\b/)) {
    tokens.push("INTERCREDITOR_PRIORITY_COLLATERAL");
  }
  if (has(t, /\bjoinder\b/) && has(t, /\bintercreditor\b/)) tokens.push("INTERCREDITOR_JOINDER");
  if (has(t, /\bdip (financing|facility)\b/) || has(t, /\bdebtor-in-possession\b/)) tokens.push("INTERCREDITOR_DIP");

  if (has(t, /^\s*\([a-z0-9]+\)/) || has(t, /\bpermitted (indebtedness|liens|investments)\b.{0,20}\(/)) {
    tokens.push("EXCEPTION_LIST_ITEM");
  }
  if (prohibitionLead && !permissionLead) tokens.push("GENERAL_PROHIBITION");
  if (has(t, /\bdesignat(?:e|ion)\b/) && has(t, /\b(unrestricted|restricted)\b/)) tokens.push("DESIGNATION_RULE");
  if (has(t, /\bstep[- ]?up\b/) || (has(t, /\b(0\.\d+|1\.00)\s+to\s+1\.00 greater\b/) && has(t, /\bprovided that\b/))) {
    tokens.push("STEP_UP_WITH_LIMITS");
  }

  // No synthetic fallbacks: empty token sets are rejected by categoryHasCoreToken.
  return [...new Set(tokens)].sort() as SignatureToken[];
}

export function signatureDistance(a: StructuralSignature, b: StructuralSignature): number {
  if (a.category !== b.category) return 1;
  const sa = new Set(a.tokens);
  const sb = new Set(b.tokens);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = new Set([...sa, ...sb]).size;
  if (union === 0) return 0;
  return 1 - inter / union;
}
