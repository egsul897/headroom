/**
 * Evaluation Methodology V2 — versioning, hashing and result identity.
 *
 * Phase 3F.1.5. This module is part of an INDEPENDENT evaluation system. It
 * never imports from the historical scorers (scripts/phase-3f*.ts) or from
 * lib/contract-model/analyzer/evaluator.ts, and it never consumes a
 * production *conclusion* as ground truth.
 *
 * Every cached or persisted judgment is keyed by the FULL evidence identity,
 * which includes all four version constants below. Changing the match policy
 * therefore invalidates every cached semantic judgment by construction — a
 * stale judgment can never silently survive a methodology change.
 */
import { createHash } from "node:crypto";

/** Shape of the persisted evaluation records (types.ts). Bump when a field is added/removed/retyped. */
export const EVALUATION_V2_SCHEMA_VERSION = "evaluation-v2-schema.v1";

/**
 * The deterministic signal-extraction + dimension-correspondence + cardinality-resolution algorithm.
 * Bumped to v2 in Phase 3F.1.5.2: the C_OBJECT_RESOURCE sole-discriminator
 * threshold (conflicts.ts/semantic-correspondence.ts) and the DEFINITION
 * excerpt-resolution fallback (source-excerpt.ts) both changed what evidence
 * the algorithm considers sufficient - see
 * docs/evaluation-v2-iteration-2/05-generalized-remediation-record.json.
 * Bumped to v3 in Phase 3F.1.5.3: added the I_CLAIM_IDENTITY dimension
 * (claim-identity.ts) implementing SAME_COVENANT_FAMILY_IS_NOT_SAME_
 * SEMANTIC_CLAIM - see docs/evaluation-v2-final-resolution/03-matcher-remediation.json.
 */
export const EVALUATION_V2_ALGORITHM_VERSION = "evaluation-v2-algorithm.v3";

/**
 * Evaluation Contract V3 (docs/evaluation-contract-v3/): the atomic-trust-
 * dimension DERIVATION schema (atomic-contract.ts). Independent of, and
 * unrelated to, EVALUATION_V2_ALGORITHM_VERSION — this schema derives from
 * the matcher's frozen output and never changes what the matcher decides.
 * Bump this when the derivation rules (creditEligibility/surfacingStatus/
 * representationCompleteness/verificationStatus/evidenceQuality/
 * derivedDiagnosticLabel) change.
 */
export const EVALUATION_CONTRACT_V3_SCHEMA_VERSION = "evaluation-contract-v3.v1";

/** The Layer-2 semantic-correspondence prompt (adjudication.ts). Bumped independently of the algorithm. */
export const EVALUATION_V2_PROMPT_VERSION = "evaluation-v2-correspondence-prompt.v1";

/** The credit policy: which dimension outcomes are required for EXACT / PARTIAL / rejection. */
export const EVALUATION_V2_MATCH_POLICY_VERSION = "evaluation-v2-match-policy.v1";

export interface EvaluationV2Versions {
  schemaVersion: string;
  algorithmVersion: string;
  promptVersion: string;
  matchPolicyVersion: string;
}

export function currentVersions(): EvaluationV2Versions {
  return {
    schemaVersion: EVALUATION_V2_SCHEMA_VERSION,
    algorithmVersion: EVALUATION_V2_ALGORITHM_VERSION,
    promptVersion: EVALUATION_V2_PROMPT_VERSION,
    matchPolicyVersion: EVALUATION_V2_MATCH_POLICY_VERSION,
  };
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

/**
 * Canonical JSON: object keys sorted recursively, `undefined` dropped, so two
 * structurally identical records always hash identically regardless of the
 * order the fields happened to be constructed in.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value === undefined ? null : value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const v = source[key];
    if (v === undefined) continue;
    out[key] = canonicalize(v);
  }
  return out;
}

export function contentHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * The identity of ONE ground-truth-unit × candidate-set semantic judgment.
 * Includes the raw evidence on both sides (not just ids) so that re-running
 * against a changed candidate excerpt produces a different key rather than a
 * silent cache hit, plus every version constant.
 */
export interface EvidenceIdentityInput {
  groundTruthUnitId: string;
  groundTruthEvidenceHash: string;
  candidateId: string;
  candidateEvidenceHash: string;
  judgeProvider: string;
  judgeModel: string;
}

export function evidenceIdentity(input: EvidenceIdentityInput): string {
  return sha256Hex(
    canonicalJson({
      ...input,
      ...currentVersions(),
    }),
  );
}

/**
 * Stable id for a whole evaluation run over a frozen dataset. Two runs over
 * byte-identical inputs with an identical engine produce an identical runId,
 * which is what makes the fresh-run / replay hash comparison meaningful.
 */
export function evaluationRunIdentity(datasetKey: string, inputHashes: Record<string, string>): string {
  return sha256Hex(canonicalJson({ datasetKey, inputHashes, ...currentVersions() }));
}
