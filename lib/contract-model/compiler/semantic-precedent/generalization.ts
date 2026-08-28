/**
 * Phase 3D - AI-assisted generalization workflow (task §22-§26): AI
 * PROPOSES -> deterministic VALIDATION -> (human) REVIEW -> APPROVED
 * PRECEDENT. This module only ever produces a precedent in reviewStatus
 * PROPOSED - approval, rejection, and supersession happen later, through
 * store.ts's own appendPrecedentReviewEvent/supersedePrecedent (task §22's
 * own "never auto-promoted").
 *
 * AI proposals are never trusted blindly (mirrors Phase 3B.1's own
 * mechanical tool-discipline lesson): the model's claimed dimensions and
 * granularity are tolerant-matched against the real enum sets, an
 * unjustified FIXED PatternSlot is mechanically forced back to VARIABLE,
 * and the precedent's own SemanticSignature is ALWAYS computed
 * independently by this module from the real reviewed IRRule (never taken
 * from the model's own output) - the model never gets to assert its own
 * retrieval signature.
 *
 * Reuses lib/contract-model/compiler/llm-caller.ts's provider-abstract
 * StageCaller/getStageCaller (never semantic/caller.ts, per the
 * Independence Contract enforced by semantic-precedent-independence.test.ts).
 */
import { getStageCaller, type StageCaller } from "../llm-caller";
import { hashParts } from "../hashing";
import { printRule } from "../../ir/pretty-print";
import { computeSemanticSignature } from "./signature";
import { buildGeneralizationSystemPrompt } from "./generalization-prompt";
import { GeneralizationProposalSchema } from "./generalization-wire-schema";
import type { GeneralizationProposal, WireExpressionPatternNode } from "./generalization-wire-schema";
import { SEMANTIC_PRECEDENT_SCHEMA_VERSION } from "./types";
import type { ExpressionPatternNode, GeneralizedPrecedent, PatternSlot, PrecedentDimension, PrecedentGranularity, PrecedentTenancyScope, ReviewedInstance, SemanticSignature } from "./types";
import type { IRRule, IRSharedCapacity } from "../../ir/types";

export const SEMANTIC_PRECEDENT_GENERALIZATION_ALGORITHM_VERSION = "phase-3d-precedent-generalization.v1";

const VALID_DIMENSIONS: PrecedentDimension[] = ["ACTION", "POSTURE", "EXPRESSION_SHAPE", "METRIC_RELATIONSHIP", "CONDITIONS", "EXCEPTIONS", "SCOPE", "DEPENDENCY", "SHARED_CAPACITY", "STRUCTURAL_ATTACHMENT", "TEMPORAL_BEHAVIOR"];
const VALID_GRANULARITIES: PrecedentGranularity[] = ["EXPRESSION_PATTERN", "CONDITION_PATTERN", "SCOPE_PATTERN", "DEPENDENCY_PATTERN", "LOGIC_PATTERN", "RULE_PATTERN", "MULTI_RULE_PATTERN", "STRUCTURAL_ATTACHMENT_PATTERN"];

/** Tolerant enum matching, reimplemented locally (never imported from semantic/normalize.ts, off-limits per the Independence Contract) - the same few-line utility every Phase 3 submodule with model-produced strings already has its own copy of. */
function matchEnum<T extends string>(raw: string, valid: readonly T[], fallback: T): T {
  if ((valid as readonly string[]).includes(raw)) return raw as T;
  const upperSnake = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((valid as readonly string[]).includes(upperSnake)) return upperSnake as T;
  return fallback;
}

/**
 * The mechanical override at the heart of this module's safety story: a
 * model-claimed FIXED slot without a real whyFixed justification is not a
 * legitimate FIXED slot - it is coerced back to VARIABLE. This is what
 * prevents an AI generalization pass from silently hard-coding "$35,000,000"
 * into a precedent that is supposed to be reusable.
 */
function normalizePatternSlot<T>(wire: { mode: string; value?: T; description?: string; whyFixed?: string } | null | undefined): PatternSlot<T> | undefined {
  if (!wire) return undefined;
  const mode = wire.mode.trim().toUpperCase();
  if (mode === "FIXED" && wire.whyFixed && wire.whyFixed.trim().length > 0 && wire.value !== undefined) {
    return { mode: "FIXED", value: wire.value, whyFixed: wire.whyFixed.trim() };
  }
  return { mode: "VARIABLE", description: wire.description?.trim() || "unlabeled variable slot (no description provided)" };
}

function normalizeExpressionPatternNode(wire: WireExpressionPatternNode): ExpressionPatternNode {
  return {
    kind: wire.kind,
    operatorSlot: normalizePatternSlot(wire.operatorSlot),
    numericSlot: normalizePatternSlot(wire.numericSlot),
    textSlot: normalizePatternSlot(wire.textSlot),
    children: wire.children.map(normalizeExpressionPatternNode),
  };
}

export interface GeneralizationEntry {
  instance: ReviewedInstance;
  /** The real, typed reviewed IRRule this instance's reviewedIrSnapshot represents - passed separately from the store's own `unknown`-typed snapshot so this module can compute the signature independently rather than trusting stored JSON or the model's own claim. */
  reviewedRule: IRRule;
  sharedCapacities?: IRSharedCapacity[];
}

export interface ProposeGeneralizedPrecedentOptions {
  tenancy: PrecedentTenancyScope;
  caller?: StageCaller;
}

export class InconsistentGeneralizationInputError extends Error {}
export class UnreviewedGeneralizationInputError extends Error {}

const ELIGIBLE_REVIEW_STATUSES = new Set(["APPROVED", "APPROVED_WITH_LIMITATIONS"]);

function buildUserContent(entries: GeneralizationEntry[]): string {
  const blocks = entries.map((entry, i) => {
    return [`Reviewed instance ${i + 1} (reviewStatus=${entry.instance.reviewStatus}):`, printRule(entry.reviewedRule)].join("\n");
  });
  return blocks.join("\n\n---\n\n");
}

function computeSupportMetadata(entries: GeneralizationEntry[]) {
  return {
    supportingInstanceIds: entries.map((e) => e.instance.instanceId),
    distinctSourceDocumentCount: new Set(entries.map((e) => e.instance.provenance.sourceDocumentId)).size,
    distinctInstrumentCount: new Set(entries.map((e) => e.instance.provenance.instrumentKey)).size,
    distinctCompanyCount: new Set(entries.map((e) => e.instance.provenance.companyId)).size,
    knownCounterexampleInstanceIds: [] as string[],
  };
}

function normalizeProposal(wire: GeneralizationProposal, signature: SemanticSignature): {
  dimensions: PrecedentDimension[];
  granularity: PrecedentGranularity;
  expressionPattern: ExpressionPatternNode | null;
  isNegativePrecedent: boolean;
  contrastedWithSignature: SemanticSignature | null;
} {
  const dimensions = wire.dimensions.length > 0 ? [...new Set(wire.dimensions.map((d) => matchEnum(d, VALID_DIMENSIONS, "EXPRESSION_SHAPE")))] : (["EXPRESSION_SHAPE"] as PrecedentDimension[]);
  const granularity = matchEnum(wire.granularity, VALID_GRANULARITIES, "EXPRESSION_PATTERN");
  const expressionPattern = wire.expressionPattern ? normalizeExpressionPatternNode(wire.expressionPattern) : null;
  const isNegativePrecedent = wire.isNegativePrecedent === true;
  // The negative-precedent "contrasted shape" is, by construction, the SAME shape these reviewed instances themselves exhibit (that IS the superficially-similar pattern being warned about) - never taken from free-text model output, for the same reason the positive signature never is.
  const contrastedWithSignature = isNegativePrecedent ? signature : null;
  return { dimensions, granularity, expressionPattern, isNegativePrecedent, contrastedWithSignature };
}

/**
 * Runs the AI-assisted generalization proposal step. Returns a
 * GeneralizedPrecedent with reviewStatus="PROPOSED" and
 * origin="AI_PROPOSED" - it is the caller's responsibility to persist it
 * (store.saveGeneralizedPrecedent) and, separately, to run it through a
 * real human review (store.appendPrecedentReviewEvent) before it can ever
 * be retrieved as APPLICABLE precedent (rankApplicability only considers
 * APPROVED/APPROVED_WITH_LIMITATIONS candidates that a caller has already
 * filtered to).
 */
export async function proposeGeneralizedPrecedent(entries: GeneralizationEntry[], options: ProposeGeneralizedPrecedentOptions): Promise<GeneralizedPrecedent> {
  if (entries.length === 0) throw new InconsistentGeneralizationInputError("proposeGeneralizedPrecedent requires at least one reviewed instance");

  for (const entry of entries) {
    if (!ELIGIBLE_REVIEW_STATUSES.has(entry.instance.reviewStatus)) {
      throw new UnreviewedGeneralizationInputError(`instance ${entry.instance.instanceId} has reviewStatus=${entry.instance.reviewStatus} - only APPROVED/APPROVED_WITH_LIMITATIONS instances may ground a generalized precedent (task §5)`);
    }
  }

  const signatures = entries.map((e) => computeSemanticSignature(e.reviewedRule, { sharedCapacities: e.sharedCapacities }));
  const canonicalSignature = signatures[0]!;
  for (let i = 1; i < signatures.length; i++) {
    if (JSON.stringify(signatures[i]) !== JSON.stringify(canonicalSignature)) {
      throw new InconsistentGeneralizationInputError("all entries grounding one GeneralizedPrecedent must share an identical SemanticSignature - diverse SOURCES are welcome (task §32's own diversity requirement), diverse SHAPES are not: propose separate precedents instead");
    }
  }

  const caller = options.caller ?? getStageCaller();
  const systemPrompt = buildGeneralizationSystemPrompt();
  const userContent = buildUserContent(entries);
  const wireProposal = await caller.call(GeneralizationProposalSchema, "semantic_precedent_generalization", systemPrompt, userContent);

  const { dimensions, granularity, expressionPattern, isNegativePrecedent, contrastedWithSignature } = normalizeProposal(wireProposal, canonicalSignature);
  const support = computeSupportMetadata(entries);
  const now = new Date().toISOString();

  const precedentId = hashParts([
    "phase-3d-generalized-precedent",
    JSON.stringify(canonicalSignature),
    JSON.stringify(expressionPattern),
    String(isNegativePrecedent),
    options.tenancy,
    [...support.supportingInstanceIds].sort().join(","),
    "v1",
  ]);

  return {
    precedentId,
    version: 1,
    supersedesPrecedentId: null,
    supersededByPrecedentId: null,
    tenancy: options.tenancy,
    dimensions,
    granularity,
    lessonDescription: wireProposal.lessonDescription,
    signature: canonicalSignature,
    expressionPattern,
    structuralLessons: wireProposal.structuralLessons,
    dependencyLessons: wireProposal.dependencyLessons,
    isNegativePrecedent,
    contrastedWithSignature,
    reviewStatus: "PROPOSED",
    reviewEvents: [],
    support,
    origin: "AI_PROPOSED",
    precedentSchemaVersion: SEMANTIC_PRECEDENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}
