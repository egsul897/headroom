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
 */
import { z } from "zod";
import { zodEnumFromPrismaEnum } from "../../types";
import { CovenantFamily } from "@prisma/client";
import type { StageCaller } from "../llm-caller";
import type { DiscoveryRole } from "./types";

export const DISCOVERY_ROLES = [
  "GENERAL_PROHIBITION",
  "PERMISSION",
  "BASKET",
  "EXCEPTION",
  "RATIO_BASED_PERMISSION",
  "BUILDER",
  "CONDITION",
  "PROVISO",
  "FINANCIAL_TEST",
  "SHARED_CAP",
  "REFINANCING_PERMISSION",
  "DESIGNATION_RULE",
  "TRIGGER",
  "CURE",
  "DEFINITIONAL_DEPENDENCY_CANDIDATE",
  "OTHER_RELEVANT_RULE",
] as const satisfies readonly DiscoveryRole[];

const SemanticRuleItemSchema = z.object({
  /** The most specific real sub-reference the model can identify within this section, e.g. "(a)", "(b)(i)" - relative to the section itself, never a fabricated citation. Empty string if the rule is the section's own general/chapeau language. */
  relativeRef: z.string(),
  families: z.array(zodEnumFromPrismaEnum(CovenantFamily)).default([]),
  otherFamilyDescription: z.string().optional(),
  role: z.enum(DISCOVERY_ROLES),
  description: z.string(),
  multipleRulesLikely: z.boolean().default(false),
  definedTermDependencyLikely: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean().default(false),
});

export const SemanticSectionResultSchema = z.object({
  rules: z.array(SemanticRuleItemSchema).default([]),
});
export type SemanticSectionResult = z.infer<typeof SemanticSectionResultSchema>;
export type SemanticRuleItem = z.infer<typeof SemanticRuleItemSchema>;

export const DISCOVERY_PROMPT_VERSION = "phase-2b-discovery.v1";

const SYSTEM_PROMPT = [
  "You are finding every economically operative covenant rule inside ONE section of a real financing document.",
  "This is a DISCOVERY pass, not a rule-extraction pass: do not compute thresholds, formulas, or final dollar amounts. Only identify what exists.",
  "A section commonly bundles a general prohibition PLUS many independent baskets, exceptions, and provisos (e.g. clause (a), (b), (c)... each its own operative rule). List EVERY one you can find - missing one is far worse than listing an extra borderline candidate.",
  "For each rule, give: the most specific relative sub-reference you can identify (e.g. '(a)', '(b)(ii)') or empty string for the section's own general language; every CovenantFamily this rule concerns (use the real closed enum values given; if truly none fit, leave families empty and explain in otherFamilyDescription); its operative role (what the rule DOES - prohibits, permits, excepts, tests a ratio, etc, not what it concerns); a one-sentence description; whether this single node likely bundles multiple further sub-rules your list didn't fully separate; whether it clearly depends on a defined term you were not given the definition of; a 0-1 confidence; and whether a human should review it.",
  "Definitions of terms are NOT covenants themselves - do not list a definition as its own rule merely because it contains a dollar figure or percentage, unless that definition itself imposes a restriction.",
  "Boilerplate (headings, general provisions, miscellaneous, governing law) is not a rule - do not list it.",
].join(" ");

export interface SectionBatchInput {
  documentId: string;
  sectionNodeKey: string;
  sectionRef: string;
  heading: string;
  text: string;
  /** Pass A's own flagged sub-refs within this section, given as hints only - the model must not treat this as an exhaustive or authoritative list. */
  passAHints: string[];
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
  return caller.call(SemanticSectionResultSchema, "covenant_discovery_section", SYSTEM_PROMPT, content);
}
