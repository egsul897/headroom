/**
 * Phase 2F.2 §4/§5/§6/§7/§9/§12 - the tolerant-boundary canonicalization
 * layer for Pass B semantic discovery. Implements the architecture this
 * task mandates: model output -> tolerant boundary parsing (pass-b-semantic
 * ts's wire schema, widened to raw strings) -> deterministic normalization
 * (this file) -> canonical internal discovery representation
 * (DiscoveryRole / CovenantFamily) -> explicit uncertainty where
 * normalization is not reliable (NormalizationStatus).
 *
 * Nothing in this file ever throws or drops a candidate (§7/§10) - every
 * raw value maps to exactly one canonical value plus a status explaining
 * how confidently. Normalization is not correctness (§9): a
 * NORMALIZED_CANONICAL or FALLBACK_REVIEW_REQUIRED result is a best-effort
 * bucket, not a claim that the model's characterization was verified.
 *
 * All aliases/keyword rules below are justified as generalized
 * legal-drafting/domain concepts common to guarantee-and-collateral
 * agreements as a document TYPE (a document type this task's own §13
 * requires Headroom be able to represent), never as a CONMED-specific
 * string - see the rationale comment on each rule.
 */
import { CovenantFamily } from "@prisma/client";
import type { DiscoveryRole } from "./types";
import { DISCOVERY_ROLES } from "./types";

export const DISCOVERY_NORMALIZATION_VERSION = "phase-2f2-discovery-normalization.v1";

export type NormalizationStatus = "VALID_CANONICAL" | "NORMALIZED_CANONICAL" | "FALLBACK_REVIEW_REQUIRED" | "INVALID_UNUSABLE";

export interface RoleNormalizationResult {
  canonical: DiscoveryRole;
  status: NormalizationStatus;
  rawValue: string;
  reason: string;
}

export interface FamiliesNormalizationResult {
  canonical: CovenantFamily[];
  status: NormalizationStatus;
  rawValues: string[];
  droppedRawValues: string[];
  reason: string;
}

const VALID_ROLE_SET = new Set<string>(DISCOVERY_ROLES);
const VALID_FAMILY_SET = new Set<string>(Object.values(CovenantFamily));

/** Case/punctuation normalization shared by role and family matching - splits camelCase boundaries, collapses whitespace/hyphens/underscores/slashes, and lowercases, so "Ratio-Based Permission", "ratio_based_permission", "RATIO BASED PERMISSION", and "RatioBasedPermission" all compare equal (§15's bounded, deterministic formatting tolerance: case, spaces, hyphens, underscores, punctuation). */
function normalizeToken(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s_\-/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** §15's explicit "singular/plural" formatting-tolerance requirement - a bounded, deterministic single-trailing-"s" strip, tried only as a fallback comparison after the exact normalized token fails to match, never a general stemmer. */
function stripTrailingS(token: string): string {
  return token.endsWith("s") && token.length > 1 ? token.slice(0, -1) : token;
}

const ROLE_TOKEN_LOOKUP = new Map<string, DiscoveryRole>(DISCOVERY_ROLES.map((r) => [normalizeToken(r), r]));

/**
 * Small alias table for SHORT role tokens that are exact synonyms of an
 * existing enum member's own operative verb, independent of any one
 * document - a security/collateral agreement conventionally uses "grants"
 * as its operative verb for a security-interest clause ("Grantor hereby
 * grants a security interest..."), and "excepts"/"except" is the
 * conventional operative verb for a carve-out, matching the existing
 * EXCEPTION role exactly in meaning. Every alias here is a same-meaning
 * synonym of an existing role, never a repurposing.
 */
const ROLE_ALIASES: Record<string, DiscoveryRole> = {
  grants: "SECURITY_GRANT",
  grant: "SECURITY_GRANT",
  excepts: "EXCEPTION",
  except: "EXCEPTION",
  exempts: "EXCEPTION",
  prohibits: "GENERAL_PROHIBITION",
  prohibit: "GENERAL_PROHIBITION",
  permits: "PERMISSION",
  permit: "PERMISSION",
  waives: "WAIVER",
  waive: "WAIVER",
  waiver: "WAIVER",
  represents: "REPRESENTATION",
  warrants: "REPRESENTATION",
};

/**
 * Ordered keyword classifier for full descriptive-sentence role values
 * (the dominant real failure shape observed in Document B - see
 * baseline-diagnostic.json). Each rule is a generalized legal-drafting
 * concept applicable to any guarantee-and-collateral agreement, not a
 * CONMED-specific phrase. Order matters: more specific patterns are
 * checked before broader catch-alls so e.g. a liability-cap sentence that
 * also happens to mention "guarantee" still lands on LIABILITY_CAP.
 */
const KEYWORD_RULES: Array<{ pattern: RegExp; role: DiscoveryRole; rationale: string }> = [
  { pattern: /\bwaive[sd]?\b/, role: "WAIVER", rationale: "Express waiver of a notice/defense/procedural right - standard across all financing and guarantee documents." },
  { pattern: /\b(cap|caps|capped|limit|limits|limited)\b.*\bliabilit/, role: "LIABILITY_CAP", rationale: "Caps/limits a party's maximum liability - the standard fraudulent-transfer/insolvency savings clause universal to guarantee and keepwell agreements." },
  { pattern: /\bcontribution\b/, role: "GUARANTEE_OBLIGATION", rationale: "Co-guarantor contribution/subrogation rights are a standard guarantee-agreement mechanic, not a security-grant concept." },
  { pattern: /\bsecurity interest\b|\blien on\b|\bgrant of (a )?security\b|\bpledges?\b/, role: "SECURITY_GRANT", rationale: "Grant, exception, or scope of a security interest/lien - the core operative act of a collateral agreement's granting clause." },
  { pattern: /\brepresentation|\bwarrant(y|ies)?\b/, role: "REPRESENTATION", rationale: "Representation/warranty is a standard contract concept independent of any covenant family." },
  { pattern: /\bprohibits?\b|\bshall not\b|\bmay not\b/, role: "GENERAL_PROHIBITION", rationale: "Direct prohibition language." },
  { pattern: /\bpermits?\b/, role: "PERMISSION", rationale: "Direct permission language." },
  { pattern: /\bexcepts?\b|\bexcept for\b|\bexcluding\b/, role: "EXCEPTION", rationale: "Direct carve-out language." },
  { pattern: /\bguarant(ee|or)|\bkeepwell\b/, role: "GUARANTEE_OBLIGATION", rationale: "Broad catch for guarantee/keepwell-obligation mechanics (grant, duration, reinstatement, non-impairment, definitional scope of the guarantee itself) that do not match a more specific rule above - guarantee-and-collateral agreements are a common, generalizable document type, not CONMED-specific." },
];

/**
 * §5/§9 - deterministic canonicalization of one raw model-returned role
 * string. Never throws. Status meaning:
 *  - VALID_CANONICAL: raw value was already an exact DISCOVERY_ROLES member.
 *  - NORMALIZED_CANONICAL: raw value matched an exact-token variant
 *    (case/punctuation), a documented alias, or a keyword rule with
 *    reasonable confidence.
 *  - FALLBACK_REVIEW_REQUIRED: no confident match; canonical is
 *    OTHER_RELEVANT_RULE and the raw text is preserved for human review.
 *  - INVALID_UNUSABLE: raw value carried no usable text at all (empty/
 *    whitespace-only) - canonical still resolves to OTHER_RELEVANT_RULE so
 *    downstream types stay total, but the status makes clear this
 *    candidate needs source-side investigation, not just review.
 */
export function normalizeDiscoveryRole(raw: string): RoleNormalizationResult {
  if (VALID_ROLE_SET.has(raw)) {
    return { canonical: raw as DiscoveryRole, status: "VALID_CANONICAL", rawValue: raw, reason: "Exact match against DISCOVERY_ROLES." };
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    return { canonical: "OTHER_RELEVANT_RULE", status: "INVALID_UNUSABLE", rawValue: raw, reason: "Raw role value was empty or whitespace-only - no usable text to classify." };
  }

  const token = normalizeToken(trimmed);
  const tokenMatch = ROLE_TOKEN_LOOKUP.get(token) ?? ROLE_TOKEN_LOOKUP.get(stripTrailingS(token));
  if (tokenMatch) {
    return { canonical: tokenMatch, status: "NORMALIZED_CANONICAL", rawValue: raw, reason: `Case/punctuation/singular-plural-normalized exact match to ${tokenMatch}.` };
  }

  const alias = ROLE_ALIASES[token] ?? ROLE_ALIASES[stripTrailingS(token)];
  if (alias) {
    return { canonical: alias, status: "NORMALIZED_CANONICAL", rawValue: raw, reason: `Alias match ("${token}" is a documented same-meaning synonym of ${alias}).` };
  }

  const lower = trimmed.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(lower)) {
      return { canonical: rule.role, status: "NORMALIZED_CANONICAL", rawValue: raw, reason: `Keyword classification (${rule.pattern}): ${rule.rationale}` };
    }
  }

  return {
    canonical: "OTHER_RELEVANT_RULE",
    status: "FALLBACK_REVIEW_REQUIRED",
    rawValue: raw,
    reason: "No exact match, alias, or keyword rule matched this role description - preserved verbatim as OTHER_RELEVANT_RULE for human review, not silently discarded.",
  };
}

/**
 * Small alias table for FAMILY tokens that are common colloquial/
 * industry-standard shorthand for an existing CovenantFamily member's
 * full name, independent of any one document - "collateral" and
 * "security" are the universal shorthand terms practitioners use for
 * what the schema names COLLATERAL_SECURITY; "reporting" is the
 * universal shorthand for REPORTING_INFORMATION; "guarantee and
 * suretyship" is a standard legal pairing for what the schema names
 * (plural) GUARANTEES. Also covers a model returning one of the new
 * DiscoveryRole tokens (e.g. SECURITY_GRANT) in the FAMILY field -
 * a same-provision cross-field slip, mapped to the family it most
 * directly concerns rather than silently dropped. Every alias here is a
 * generalized synonym, never a CONMED-specific string.
 */
const FAMILY_ALIASES: Record<string, CovenantFamily> = {
  collateral: "COLLATERAL_SECURITY",
  security: "COLLATERAL_SECURITY",
  security_collateral: "COLLATERAL_SECURITY",
  collateral_security_matters: "COLLATERAL_SECURITY",
  security_grant: "COLLATERAL_SECURITY",
  reporting: "REPORTING_INFORMATION",
  guarantee_and_suretyship: "GUARANTEES",
};

/**
 * §5/§9 - deterministic canonicalization of one raw model-returned family
 * string against the real closed CovenantFamily Prisma enum. Never
 * throws. The real Document B rerun (document-b-rerun-raw-items.json)
 * showed a small set of out-of-enum family values beyond simple case/
 * punctuation drift - singular/plural (GUARANTEE vs GUARANTEES),
 * camelCase joining (AssetSales vs ASSET_SALES, handled by
 * normalizeToken's camelCase split), and colloquial shorthand
 * (COLLATERAL, Reporting) - each addressed generically below. Values
 * with no confident generalizable mapping (e.g. a genuinely absent
 * concept like "Intellectual Property", or the model's own literal
 * "OTHER" token, which has no OTHER member in the schema by design - see
 * this field's own doc-comment: leave families empty and use
 * otherFamilyDescription instead) are left as an honest, dropped
 * FALLBACK_REVIEW_REQUIRED rather than a fabricated mapping.
 */
export function normalizeDiscoveryFamily(raw: string): { canonical: CovenantFamily | null; status: NormalizationStatus; rawValue: string; reason: string } {
  if (VALID_FAMILY_SET.has(raw)) {
    return { canonical: raw as CovenantFamily, status: "VALID_CANONICAL", rawValue: raw, reason: "Exact match against CovenantFamily." };
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { canonical: null, status: "INVALID_UNUSABLE", rawValue: raw, reason: "Raw family value was empty or whitespace-only." };
  }
  const token = normalizeToken(trimmed);
  const singularToken = stripTrailingS(token);
  for (const family of VALID_FAMILY_SET) {
    const familyToken = normalizeToken(family);
    if (familyToken === token || familyToken === singularToken || stripTrailingS(familyToken) === token) {
      return { canonical: family as CovenantFamily, status: "NORMALIZED_CANONICAL", rawValue: raw, reason: `Case/punctuation/singular-plural-normalized exact match to ${family}.` };
    }
  }
  const alias = FAMILY_ALIASES[token] ?? FAMILY_ALIASES[singularToken];
  if (alias) {
    return { canonical: alias, status: "NORMALIZED_CANONICAL", rawValue: raw, reason: `Alias match ("${token}" is a documented shorthand synonym of ${alias}).` };
  }
  return {
    canonical: null,
    status: "FALLBACK_REVIEW_REQUIRED",
    rawValue: raw,
    reason: "No exact, normalized, or alias match against CovenantFamily - dropped from the canonical families array, preserved in otherFamilyDescription/familiesRaw rather than silently discarded.",
  };
}

export function normalizeDiscoveryFamilies(rawList: string[]): FamiliesNormalizationResult {
  const canonical: CovenantFamily[] = [];
  const droppedRawValues: string[] = [];
  let anyFallback = false;
  let anyNormalized = false;

  for (const raw of rawList) {
    const result = normalizeDiscoveryFamily(raw);
    if (result.canonical) {
      canonical.push(result.canonical);
      if (result.status === "NORMALIZED_CANONICAL") anyNormalized = true;
    } else {
      droppedRawValues.push(raw);
      anyFallback = true;
    }
  }

  const status: NormalizationStatus = anyFallback ? "FALLBACK_REVIEW_REQUIRED" : anyNormalized ? "NORMALIZED_CANONICAL" : "VALID_CANONICAL";
  const reason =
    droppedRawValues.length > 0
      ? `${droppedRawValues.length} of ${rawList.length} raw family value(s) did not match CovenantFamily and were dropped from the canonical array: ${droppedRawValues.join(", ")}`
      : rawList.length === 0
        ? "No families provided."
        : "All raw family values resolved to canonical CovenantFamily members.";

  return { canonical, status, rawValues: rawList, droppedRawValues, reason };
}
