/**
 * Evaluation Methodology V2 — bounded semantic adjudication (Layer 2 assist)
 * and ground-truth quality adjudication overlays.
 *
 * Phase 3F.1.5.
 *
 * SEMANTIC JUDGE CONTRACT
 * -----------------------
 *  - Consulted ONLY for pairs the deterministic layer marks INDETERMINATE.
 *  - Sees the ground-truth EXCERPT + semantic description, and the candidate's
 *    excerpt(s) + provenance + normalized semantics. It is NEVER told which
 *    answer is "correct", never told the ground truth's own disposition, and
 *    never told any package identity beyond what the excerpts themselves say.
 *  - No package-specific examples appear in the prompt.
 *  - Structured output only: corresponds / supportingEvidence /
 *    conflictingEvidence / missingDimensions / confidence / rationale.
 *  - The raw model output is preserved verbatim.
 *  - Cached by FULL evidence identity, which includes all four version
 *    constants, so a match-policy change invalidates every cached judgment.
 *  - The judge NEVER decides an aggregate coverage number; it only answers
 *    per-pair correspondence.
 *
 * The default judge is `DETERMINISTIC_ONLY_JUDGE`, which makes no network call
 * and costs nothing. That is the mode the adversarial suite and every test in
 * tests/evaluation-v2/ run in.
 */
import { contentHash, currentVersions, evidenceIdentity } from "./identity";
import type { CandidateSemanticRepresentation, GroundTruthOverlayEntry, GroundTruthQualityVerdict, GroundTruthSemanticUnit, SemanticJudgeOutput } from "./types";

export interface JudgeRequest {
  gt: GroundTruthSemanticUnit;
  candidate: CandidateSemanticRepresentation;
  /** Which dimensions the deterministic layer could not decide — the judge is asked about these specifically. */
  indeterminateDimensions: string[];
}

export interface SemanticJudge {
  readonly provider: string;
  readonly model: string;
  /** Cost per call in USD used for budget reporting. 0 for the deterministic judge. */
  readonly estimatedCostPerCallUsd: number;
  judge(request: JudgeRequest): Promise<SemanticJudgeOutput | null>;
}

// ---------------------------------------------------------------------------
// Prompt construction (versioned; no ground-truth answer leakage)
// ---------------------------------------------------------------------------

export const SEMANTIC_CORRESPONDENCE_SYSTEM_PROMPT = [
  "You are adjudicating whether a candidate representation substantively represents a specific legal/economic claim taken from a credit agreement or indenture.",
  "",
  "Rules you must follow:",
  "1. Correspondence is about MEANING. Two provisions that sit in the same section, share a section number, share a dollar figure, or cite the same defined term do NOT correspond unless they assert the same claim.",
  "2. A narrow enumerated exception does not represent the general restriction it sits under, and a general restriction does not represent one of its exceptions.",
  "3. A permission does not represent a prohibition, and vice versa.",
  "4. A matching number on a different basis (e.g. a percentage of a different metric, a ratio of a different test) is NOT a match.",
  "5. If the candidate omits a condition, exception, entity-scope limit or cap structure the claim depends on, answer PARTIAL and name what is missing.",
  "6. If two readings are genuinely defensible, answer AMBIGUOUS. Do not guess.",
  "",
  "Answer ONLY with a JSON object of the form:",
  '{"corresponds":"YES|PARTIAL|NO|AMBIGUOUS","supportingEvidence":[string],"conflictingEvidence":[string],"missingDimensions":[string],"confidence":"HIGH|MEDIUM|LOW","rationale":string}',
].join("\n");

export function buildJudgeUserPrompt(request: JudgeRequest): string {
  const { gt, candidate } = request;
  return [
    "CLAIM TO TEST (from an independently authored provision inventory):",
    gt.semanticDescription,
    "",
    "CLAIM SOURCE EXCERPT:",
    gt.sourceExcerpt || "(source excerpt unavailable; only the description above is asserted)",
    "",
    "CANDIDATE REPRESENTATION (produced by the system under evaluation):",
    candidate.normalizedSemantics || "(no normalized semantics recorded)",
    "",
    "CANDIDATE SOURCE EXCERPT(S):",
    candidate.excerpts.filter((e) => e.trim().length > 0).join("\n---\n") || "(no excerpt recorded)",
    "",
    "CANDIDATE PROVENANCE:",
    `representationType=${candidate.representationType}; documentId=${candidate.documentId}; citation=${candidate.operativeProvenance.sourceCitation ?? "(none)"}`,
    "",
    `DIMENSIONS THE DETERMINISTIC LAYER COULD NOT DECIDE: ${request.indeterminateDimensions.join(", ") || "(none)"}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Evidence identity + cache
// ---------------------------------------------------------------------------

export function groundTruthEvidenceHash(gt: GroundTruthSemanticUnit): string {
  return contentHash({
    semanticDescription: gt.semanticDescription,
    sourceExcerpt: gt.sourceExcerpt,
    action: gt.action,
    legalPosture: gt.legalPosture,
    provisionRole: gt.provisionRole,
    scope: gt.scope,
    figures: gt.figures,
    conditions: gt.conditions,
    exceptions: gt.exceptions,
  });
}

export function candidateEvidenceHash(candidate: CandidateSemanticRepresentation): string {
  return contentHash({
    excerpts: candidate.excerpts,
    normalizedSemantics: candidate.normalizedSemantics,
    representationType: candidate.representationType,
    accountingRole: candidate.accountingRole,
    action: candidate.action,
    legalPosture: candidate.legalPosture,
    provisionRole: candidate.provisionRole,
    scope: candidate.scope,
    figures: candidate.figures,
    conditions: candidate.conditions,
    selfReportedState: candidate.selfReportedState,
  });
}

export function judgeCacheKey(request: JudgeRequest, judge: Pick<SemanticJudge, "provider" | "model">): string {
  return evidenceIdentity({
    groundTruthUnitId: request.gt.gtUnitId,
    groundTruthEvidenceHash: groundTruthEvidenceHash(request.gt),
    candidateId: request.candidate.candidateId,
    candidateEvidenceHash: candidateEvidenceHash(request.candidate),
    judgeProvider: judge.provider,
    judgeModel: judge.model,
  });
}

export interface JudgeCache {
  get(key: string): SemanticJudgeOutput | undefined;
  set(key: string, value: SemanticJudgeOutput): void;
  entries(): Array<[string, SemanticJudgeOutput]>;
}

export function createInMemoryJudgeCache(seed?: Array<[string, SemanticJudgeOutput]>): JudgeCache {
  const map = new Map<string, SemanticJudgeOutput>(seed ?? []);
  return {
    get: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    entries: () => [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

// ---------------------------------------------------------------------------
// The deterministic-only judge (default)
// ---------------------------------------------------------------------------

/**
 * Makes no call and returns no judgment. An INDETERMINATE pair therefore stays
 * INDETERMINATE, which never grants credit — the conservative direction. This
 * is the mode used for the adversarial suite, the regression tests, and any
 * run where no model credential is configured.
 */
export const DETERMINISTIC_ONLY_JUDGE: SemanticJudge = {
  provider: "NONE_DETERMINISTIC_ONLY",
  model: "none",
  estimatedCostPerCallUsd: 0,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async judge(_request: JudgeRequest): Promise<SemanticJudgeOutput | null> {
    return null;
  },
};

/**
 * A judge backed by a caller-supplied function. Used (a) by tests, with a
 * scripted responder, and (b) by a real model client, when one is configured.
 * All caching, budget accounting and raw-output preservation happen here so a
 * real provider adapter never has to reimplement them.
 */
export interface BoundedJudgeOptions {
  provider: string;
  model: string;
  estimatedCostPerCallUsd: number;
  /** Hard cap. Once exhausted, further pairs stay INDETERMINATE rather than being credited. */
  maxCalls: number;
  cache?: JudgeCache;
  respond(request: JudgeRequest, prompts: { system: string; user: string }): Promise<{ raw: string; parsed: Omit<SemanticJudgeOutput, "rawModelOutput" | "provider" | "model" | "promptVersion" | "cacheKey" | "cached"> }>;
}

export interface BoundedJudge extends SemanticJudge {
  callCount(): number;
  cacheHitCount(): number;
  totalCostUsd(): number;
  cache(): JudgeCache;
}

export function createBoundedJudge(options: BoundedJudgeOptions): BoundedJudge {
  const cache = options.cache ?? createInMemoryJudgeCache();
  let calls = 0;
  let hits = 0;
  return {
    provider: options.provider,
    model: options.model,
    estimatedCostPerCallUsd: options.estimatedCostPerCallUsd,
    callCount: () => calls,
    cacheHitCount: () => hits,
    totalCostUsd: () => Number((calls * options.estimatedCostPerCallUsd).toFixed(6)),
    cache: () => cache,
    async judge(request: JudgeRequest): Promise<SemanticJudgeOutput | null> {
      const key = judgeCacheKey(request, { provider: options.provider, model: options.model });
      const cached = cache.get(key);
      if (cached) {
        hits += 1;
        return { ...cached, cached: true };
      }
      if (calls >= options.maxCalls) return null;
      calls += 1;
      const prompts = { system: SEMANTIC_CORRESPONDENCE_SYSTEM_PROMPT, user: buildJudgeUserPrompt(request) };
      const { raw, parsed } = await options.respond(request, prompts);
      const output: SemanticJudgeOutput = {
        ...parsed,
        rawModelOutput: raw,
        provider: options.provider,
        model: options.model,
        promptVersion: currentVersions().promptVersion,
        cacheKey: key,
        cached: false,
      };
      cache.set(key, output);
      return output;
    },
  };
}

// ---------------------------------------------------------------------------
// Ground-truth adjudication overlay
//
// The frozen ground-truth files are NEVER edited. A defect found while
// evaluating is recorded as an overlay entry and applied at load time; the
// original unit is always preserved, and any exclusion from clean aggregates
// must carry a written reason.
// ---------------------------------------------------------------------------

export interface GroundTruthOverlay {
  overlayId: string;
  authoredBy: string;
  authoredAt: string;
  appliesToDataset: string;
  entries: GroundTruthOverlayEntry[];
}

export function emptyOverlay(datasetKey: string, authoredBy: string, authoredAt: string): GroundTruthOverlay {
  return { overlayId: `evaluation-v2-overlay:${datasetKey}`, authoredBy, authoredAt, appliesToDataset: datasetKey, entries: [] };
}

export function overlayVerdictFor(overlay: GroundTruthOverlay | null, gtUnitId: string): { verdict: GroundTruthQualityVerdict; excluded: boolean; reason: string | null } {
  const entry = overlay?.entries.find((e) => e.gtUnitId === gtUnitId);
  if (!entry) return { verdict: "GT_CONFIRMED", excluded: false, reason: null };
  return { verdict: entry.verdict, excluded: entry.excludeFromCleanAggregates, reason: entry.rationale };
}
