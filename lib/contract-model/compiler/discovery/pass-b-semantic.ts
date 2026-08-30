/**
 * Phase 2B Pass B - semantic covenant classification (task §8 Pass B).
 *
 * Batched by structural SECTION boundary, never by arbitrary token chunks
 * and never by re-sending the whole document per candidate (task §9/§19):
 * one call per top-level SECTION that Pass A flagged at least one node
 * inside (a section with zero Pass-A signal anywhere in its own subtree is
 * not sent - Pass A's own over-selection already covers the recall risk of
 * skipping a truly silent section). The section's full OWN+DESCENDANTS
 * text is sent once; the model is asked to enumerate EVERY independently
 * operative rule inside it, not merely re-confirm the section's own
 * heading-level classification - this is what distinguishes Pass B from
 * the pre-existing INVENTORY stage, which classifies only at SECTION
 * granularity and never looks for the baskets/exceptions inside.
 *
 * Phase 2F.2 §4/§5 architecture: the WIRE schema sent to the model/SDK
 * (WireSemanticRuleItemSchema below) accepts `role`/`families` as
 * TOLERANT raw strings - never a closed z.enum() - so a model response
 * outside the closed vocabulary is parsed successfully instead of
 * throwing inside the Anthropic SDK's own client-side structured-output
 * validation (the exact real Document B failure this task repairs; see
 * tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f2/
 * baseline-diagnostic.json). runPassBSemanticClassification then runs
 * every raw value through normalization.ts's deterministic canonicalizer
 * before returning the CANONICAL SemanticRuleItem shape the rest of the
 * pipeline (Pass C/D) consumes - callers of this module never see the
 * tolerant wire type, only the normalized canonical one, with raw value +
 * normalization status preserved as provenance.
 */
import { z } from "zod";
import type { StageCaller } from "../llm-caller";
import type { CovenantFamily } from "@prisma/client";
import type { DiscoveryRole } from "./types";
import { DISCOVERY_ROLES } from "./types";
import { normalizeDiscoveryRole, normalizeDiscoveryFamilies, DISCOVERY_NORMALIZATION_VERSION, type NormalizationStatus } from "./normalization";

export { DISCOVERY_ROLES };

/** Tolerant wire schema (task §4/§5) - `role`/`families` are raw strings at this boundary, deliberately NOT z.enum()/zodEnumFromPrismaEnum, so an out-of-vocabulary model response parses successfully instead of crashing the whole document's discovery pass. Strictness is re-applied one layer up, deterministically, in normalization.ts. */
const WireSemanticRuleItemSchema = z.object({
  relativeRef: z.string(),
  families: z.array(z.string()).default([]),
  otherFamilyDescription: z.string().optional(),
  role: z.string(),
  description: z.string(),
  multipleRulesLikely: z.boolean().default(false),
  definedTermDependencyLikely: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean().default(false),
  /**
   * Phase 3F.1.6.RX Workstream D (AUDIT-F4) - OPTIONAL, tolerant claim-
   * identity disambiguator. A short VERBATIM excerpt copied exactly from
   * the section text above (never a paraphrase) that marks where in the
   * source THIS specific rule's own language appears - only meaningful,
   * and only requested by the prompt, when a sibling rule shares this same
   * relativeRef+role and would otherwise be indistinguishable from this
   * one (the residual same-family/same-role/same-node gap
   * 11-claim-identity-remediation.json disclosed). Deliberately optional
   * and best-effort: pass-c-neighborhood.ts independently VERIFIES this
   * string is a genuine substring of the real source text before trusting
   * it for anything (see value-anchors.ts's verifyDistinguishingQuote) -
   * an absent, empty, or unverifiable value degrades gracefully to the
   * pre-existing (disclosed) identity behavior, never to a crash or a
   * silently-wrong identity.
   */
  distinguishingQuote: z.string().optional(),
});

export const SemanticSectionResultSchema = z.object({
  rules: z.array(WireSemanticRuleItemSchema).default([]),
});
type WireSemanticSectionResult = z.infer<typeof SemanticSectionResultSchema>;
type WireSemanticRuleItem = z.infer<typeof WireSemanticRuleItemSchema>;

/** Canonical, post-normalization shape the rest of the discovery pipeline (Pass C/D) consumes - `role`/`families` are always valid canonical types here, never raw model strings, with normalization provenance attached (task §7/§9). */
export interface SemanticRuleItem {
  relativeRef: string;
  families: CovenantFamily[];
  otherFamilyDescription?: string;
  role: DiscoveryRole;
  roleRaw: string;
  roleNormalizationStatus: NormalizationStatus;
  familiesRaw: string[];
  familiesNormalizationStatus: NormalizationStatus;
  description: string;
  multipleRulesLikely: boolean;
  definedTermDependencyLikely: boolean;
  confidence: number;
  needsReview: boolean;
  /** Phase 3F.1.6.RX Workstream D (AUDIT-F4) - see WireSemanticRuleItemSchema's own doc comment. Passed through verbatim (trimmed, length-capped) - normalization.ts's canonical-vocabulary discipline does not apply here, since this is free verbatim source text by design, never a classified/canonicalized value. */
  distinguishingQuote?: string;
}

export interface SemanticSectionResult {
  rules: SemanticRuleItem[];
}

/**
 * Phase 2F.2 bump: the wire schema and prompt vocabulary both changed
 * (role/families widened to tolerant strings; prompt now lists the
 * canonical role vocabulary including the 5 new guarantee/security roles),
 * so any cache keyed on DISCOVERY_PROMPT_VERSION correctly treats this as a
 * new contract (task §22).
 *
 * Phase 3F.1.6.RX Workstream D (AUDIT-F4) bump v2 -> v3: wire schema gained
 * the optional distinguishingQuote field and the prompt gained the
 * disambiguation instruction below - a real contract change, per this
 * file's own established version-bump convention.
 */
export const DISCOVERY_PROMPT_VERSION = "phase-2b-discovery.v3";

const ROLE_VOCABULARY_DESCRIPTION = [
  "Use one of these role labels whenever it fits (do not invent new labels): GENERAL_PROHIBITION, PERMISSION, BASKET, EXCEPTION, RATIO_BASED_PERMISSION, BUILDER, CONDITION, PROVISO, FINANCIAL_TEST, SHARED_CAP, REFINANCING_PERMISSION, DESIGNATION_RULE, TRIGGER, CURE, DEFINITIONAL_DEPENDENCY_CANDIDATE, GUARANTEE_OBLIGATION (a grant, duration, reinstatement, or non-impairment of a guarantee/suretyship obligation), SECURITY_GRANT (a grant or scope of a security interest/lien over collateral), WAIVER (an express waiver of a notice/defense/procedural right), LIABILITY_CAP (a cap/limit on a party's maximum liability), REPRESENTATION (a representation or warranty of fact).",
  "If truly none of these fit, use OTHER_RELEVANT_RULE and put the specific characterization in the description field instead of inventing a new role label.",
].join(" ");

const SYSTEM_PROMPT = [
  "You are finding every economically operative covenant rule inside ONE section of a real financing document.",
  "This is a DISCOVERY pass, not a rule-extraction pass: do not compute thresholds, formulas, or final dollar amounts. Only identify what exists.",
  "A section commonly bundles a general prohibition PLUS many independent baskets, exceptions, and provisos (e.g. clause (a), (b), (c)... each its own operative rule). List EVERY one you can find - missing one is far worse than listing an extra borderline candidate.",
  "For each rule, give: the most specific relative sub-reference you can identify (e.g. '(a)', '(b)(ii)') or empty string for the section's own general language; every CovenantFamily this rule concerns (use the real closed enum values given; if truly none fit, leave families empty and explain in otherFamilyDescription); its operative role (what the rule DOES - prohibits, permits, excepts, tests a ratio, etc, not what it concerns); a one-sentence description; whether this single node likely bundles multiple further sub-rules your list didn't fully separate; whether it clearly depends on a defined term you were not given the definition of; a 0-1 confidence; and whether a human should review it.",
  ROLE_VOCABULARY_DESCRIPTION,
  "Definitions of terms are NOT covenants themselves - do not list a definition as its own rule merely because it contains a dollar figure or percentage, unless that definition itself imposes a restriction.",
  "Boilerplate (headings, general provisions, miscellaneous, governing law) is not a rule - do not list it.",
  "DISTINGUISHING QUOTE: if this section bundles two or more independently operative rules into ONE un-enumerated sentence with no lettered/numbered sub-reference to tell them apart (e.g. two different baskets fused together, each with its own dollar cap or its own named facility/purpose), also give distinguishingQuote for EACH such rule: a short (under 200 characters) VERBATIM excerpt copied EXACTLY from the section text above (never paraphrased or summarized) that marks the specific clause language for THIS rule and not its sibling. Omit distinguishingQuote whenever this rule already has its own distinct relativeRef, or when no sibling rule shares this same reference.",
].join(" ");

export interface SectionBatchInput {
  documentId: string;
  /** @deprecated legacy label-shaped key, kept for backward-compatible display/logging only. Use `sectionNodeId`. */
  sectionNodeKey: string;
  /** Phase 3F.1.2 - the real physical occurrence identity of this section. */
  sectionNodeId: string;
  sectionRef: string;
  heading: string;
  text: string;
  /** Pass A's own flagged sub-refs within this section, given as hints only - the model must not treat this as an exhaustive or authoritative list. */
  passAHints: string[];
}

function normalizeWireItem(item: WireSemanticRuleItem): SemanticRuleItem {
  const roleResult = normalizeDiscoveryRole(item.role);
  const familiesResult = normalizeDiscoveryFamilies(item.families);
  const otherFamilyDescription =
    familiesResult.droppedRawValues.length > 0
      ? [item.otherFamilyDescription, `Unmapped raw family value(s) (normalization ${DISCOVERY_NORMALIZATION_VERSION}): ${familiesResult.droppedRawValues.join(", ")}`].filter(Boolean).join(" | ")
      : item.otherFamilyDescription;

  return {
    relativeRef: item.relativeRef,
    families: familiesResult.canonical,
    otherFamilyDescription,
    role: roleResult.canonical,
    roleRaw: roleResult.rawValue,
    roleNormalizationStatus: roleResult.status,
    familiesRaw: familiesResult.rawValues,
    familiesNormalizationStatus: familiesResult.status,
    description: item.description,
    multipleRulesLikely: item.multipleRulesLikely,
    definedTermDependencyLikely: item.definedTermDependencyLikely,
    confidence: item.confidence,
    // Task §9: a FALLBACK_REVIEW_REQUIRED or INVALID_UNUSABLE normalization always forces review, regardless of the model's own needsReview flag - the model cannot silently mark a fallback-classified rule as not needing review.
    needsReview: item.needsReview || roleResult.status === "FALLBACK_REVIEW_REQUIRED" || roleResult.status === "INVALID_UNUSABLE",
    // Phase 3F.1.6.RX Workstream D (AUDIT-F4) - trimmed and length-capped only; never lowercased/reworded here, since pass-c-neighborhood.ts's verification step needs the model's own exact wording to check against real source text. Empty string after trimming is treated as absent.
    distinguishingQuote: item.distinguishingQuote?.trim() ? item.distinguishingQuote.trim().slice(0, 240) : undefined,
  };
}

export async function runPassBSemanticClassification(caller: StageCaller, batch: SectionBatchInput): Promise<SemanticSectionResult> {
  const content = [
    `Document: ${batch.documentId}`,
    `Section: ${batch.sectionRef} - "${batch.heading}"`,
    batch.passAHints.length > 0 ? `Deterministic pre-screen flagged sub-references (hints only, not authoritative): ${batch.passAHints.join(", ")}` : "",
    "",
    "Full section text (own text plus every nested sub-clause):",
    batch.text,
  ]
    .filter(Boolean)
    .join("\n");
  const wireResult: WireSemanticSectionResult = await caller.call(SemanticSectionResultSchema, "covenant_discovery_section", SYSTEM_PROMPT, content);
  return { rules: wireResult.rules.map(normalizeWireItem) };
}
