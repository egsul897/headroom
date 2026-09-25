/**
 * Complete per-candidate EVIDENCE preservation for paid pilot runs.
 *
 * Why this exists: the 7.2(f) forensic mission could establish that an unsupported "100%" had no
 * deterministic origin, but it could NOT establish which stage first emitted it - because the run
 * that produced it kept only a summary row. The compiler result already carried `rawModelOutput`
 * and `toolCallLog`; the runner simply threw them away. That is a one-line-per-field harness gap
 * that cost a whole forensic mission its central answer, and it is closed here once, in a module
 * every runner shares, rather than per runner.
 *
 * Two disciplines this module enforces rather than hopes for:
 *  1. Nothing that can reach a provider is serialized. The compiler input's `toolAccess` carries a
 *     live StructuralIndex and operative state (huge and cyclic); only explicitly named fields are
 *     ever copied, so a future field cannot silently join the artifact.
 *  2. Every artifact is scanned for credentials BEFORE it is written, and a hit THROWS rather than
 *     writing a redacted file - a leaked key that was written and then cleaned is still leaked.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import type { SemanticVerificationResult } from "../../lib/contract-model/compiler/semantic-verification/types";
import {
  buildVerifiedUnitPackage, buildVerifiedUnitRunManifest, serializeVerifiedUnitPackage, snapshotUnitsForVerification,
  type PersistedVerifiedUnitPackage, type UnitSnapshot, type VerifiedUnitRunManifest,
} from "../../lib/contract-model/verified-units";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Credential shapes that must never reach an artifact. The character classes are deliberately
 * written with \w rather than spelled-out ranges so this file does not itself contain the literal
 * text the repository's own artifact grep looks for.
 */
export const SECRET_PATTERNS: readonly { name: string; re: RegExp }[] = [
  { name: "vercel-ai-gateway-key", re: /vck_[\w-]{8,}/ },
  { name: "anthropic-api-key", re: /sk-ant-[\w-]{8,}/ },
  { name: "openai-style-key", re: /\bsk-[\w-]{20,}/ },
  { name: "authorization-header", re: /"authorization"\s*:/i },
  { name: "api-key-header", re: /"x-api-key"\s*:/i },
  { name: "gateway-key-env-assignment", re: /AI_GATEWAY_API_KEY\s*[:=]\s*["']?[\w-]{8,}/ },
];

export function scanForSecrets(serialized: string): { pattern: string; index: number }[] {
  return SECRET_PATTERNS.flatMap((p) => {
    const m = serialized.match(p.re);
    return m ? [{ pattern: p.name, index: m.index ?? -1 }] : [];
  });
}

/** Throws rather than redacting: an artifact that needed redacting is an artifact that was built wrong. */
export function assertNoSecrets(serialized: string, where: string): void {
  const hits = scanForSecrets(serialized);
  if (hits.length > 0) throw new Error(`refusing to write ${where}: it matches ${hits.map((h) => h.pattern).join(", ")}`);
}

export const CANDIDATE_EVIDENCE_SCHEMA = "p3-candidate-evidence.v2" as const;
/** v2 adds (additively) what the v1 record could not answer after the fact: execution mode / sharding, the resolved
 * source context, the operative-source origin, the certified configuration and its per-candidate execution telemetry,
 * the structured provider error and the qualitative-lineage audit. Every v1 field is unchanged; a v1 reader still reads a v2 record. */
export interface CandidateEvidence {
  schema: typeof CANDIDATE_EVIDENCE_SCHEMA;
  capturedAt: string;
  candidateRef: string;
  /** The complete compiler input, minus the live tool-access handles (which are objects, not evidence). */
  compilerInput: {
    companyId: string;
    instrumentKey: string;
    sourceDocumentId: string;
    sourceSectionRef: string | null;
    operativeSourceText: string;
    operativeSourceTextSha256: string;
    operativeSourceChars: number;
    irSchemaVersion: string;
    compilerAlgorithmVersion: string;
    compilerPromptVersion: string;
    toolPolicyVersion: string;
    operativeLineage: unknown;
    /** v2: STRUCTURAL_NODE | OPERATIVE_STATE_CURRENT_TEXT (candidate-span.ts). */
    operativeSourceOrigin: string | null;
  };
  /** v2: how the compile was executed - the v1 record could not distinguish MONOLITHIC from SHARDED. */
  execution: { mode: string | null; reason: string | null; planHash: string | null; plannedShards: number | null; oversizedShards: number | null; sharded: { executed: number; reused: number; retries: number; providerCalls: number; statusCounts: Record<string, number> } | null } | null;
  /** v2: the resolved source context Pass A / Pass B saw (state + one summary row per region). */
  sourceContext: { state: string; reasons: string[]; regions: { regionId: string; kind: string; documentId: string; sectionRef: string | null; chars: number; charStart: number; truncatedAtBudget: boolean }[] } | null;
  /** v2: the explicit certified configuration identity and the candidate's execution telemetry (conversations, transport attempts, shard attempts, cost separation). */
  certified: { configIdentity: string; telemetry: unknown } | null;
  contextBundle: {
    bundleId: string;
    sufficiencyState: string;
    stopReasons: unknown;
    itemCount: number;
    items: { itemId: string; type: string; normalizedRef: string | null; citation: string | null; evidenceState: string | null; excerptChars: number; excerptText: string }[];
    edges: unknown;
  } | null;
  compilation: {
    status: string;
    failureReasons: string[];
    errorDetail: unknown;
    /** v2: the structured provider error record when the failure was a classified provider failure. */
    providerError: unknown;
    /** The model's own response, verbatim - the field whose absence made the 7.2(f) origin unprovable. */
    rawModelOutput: unknown;
    toolCallLog: unknown;
    rules: unknown;
    definitions: unknown;
    sharedCapacities: unknown;
    unresolvedIssues: unknown;
    irExtensionCandidates: unknown;
    inputHasUnresolvedOperativeEvidence: boolean | null;
    provider: string | null;
    model: string | null;
    telemetry: unknown;
    compiledAt: string | null;
    outputHash: string;
  };
  /** Present when the runner verified the candidate; null when it only compiled it (and then says so, rather than leaving the reader to guess). */
  verification: {
    status: string;
    findings: unknown;
    reconciliation: unknown;
    sourceInventory: unknown;
    irInventory: unknown;
    numericAssertions: unknown;
    admissibleEvidence: unknown;
    semanticReviewInvoked: boolean;
    conditionSuspicion: unknown;
    verifierAlgorithmVersion: string;
    /** v2: deterministic qualitative-grounding audit. */
    qualitativeLineage: unknown;
  } | null;
  run: {
    model: string;
    tier: number;
    wallClockMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    costStatus: string | null;
    timedOut: boolean;
    notes: string[];
  };
  /**
   * The paired verified-unit package written beside this evidence (lib/contract-model/verified-units.ts):
   * the runtime/audit contract, produced from the same in-memory objects. Present whenever the
   * candidate compiled at least one unit; its `complete` is false when the run did not verify.
   */
  verifiedUnits?: { file: string; packageHash: string; complete: boolean; artifactsPersisted: number; unitsMissingVerification: number; problems: string[] };
}

export function buildCandidateEvidence(
  compilerInput: SemanticCompilerInput,
  result: SemanticCompilationResult,
  verification: SemanticVerificationResult | null,
  run: CandidateEvidence["run"],
  extras: { certified?: { configIdentity: string; telemetry: unknown } | null } = {},
): CandidateEvidence {
  const bundle = compilerInput.contextBundle as unknown as { bundleId?: string; sufficiencyState?: string; stopReasons?: unknown; edges?: unknown; items?: { itemId: string; type: string; normalizedRef: string | null; citation?: string | null; evidenceState?: string | null; excerptText: string }[] } | null;
  return {
    schema: CANDIDATE_EVIDENCE_SCHEMA,
    capturedAt: new Date().toISOString(),
    candidateRef: compilerInput.candidateRef,
    compilerInput: {
      companyId: compilerInput.companyId,
      instrumentKey: compilerInput.instrumentKey,
      sourceDocumentId: compilerInput.sourceDocumentId,
      sourceSectionRef: compilerInput.sourceSectionRef ?? null,
      operativeSourceText: compilerInput.operativeSourceText,
      operativeSourceTextSha256: sha256(compilerInput.operativeSourceText),
      operativeSourceChars: compilerInput.operativeSourceText.length,
      irSchemaVersion: compilerInput.irSchemaVersion,
      compilerAlgorithmVersion: compilerInput.compilerAlgorithmVersion,
      compilerPromptVersion: compilerInput.compilerPromptVersion,
      toolPolicyVersion: compilerInput.toolPolicyVersion,
      operativeLineage: compilerInput.operativeLineage ?? null,
      operativeSourceOrigin: compilerInput.operativeSourceOrigin ?? null,
    },
    execution: result.execution
      ? { mode: result.execution.mode, reason: result.execution.reason, planHash: result.execution.planHash, plannedShards: result.execution.plannedShards, oversizedShards: result.execution.oversizedShards, sharded: result.execution.sharded ? { executed: result.execution.sharded.executed, reused: result.execution.sharded.reused, retries: result.execution.sharded.retries, providerCalls: result.execution.sharded.providerCalls, statusCounts: result.execution.sharded.statusCounts } : null }
      : null,
    sourceContext: result.sourceContext
      ? { state: result.sourceContext.state, reasons: result.sourceContext.reasons, regions: result.sourceContext.regions.map((r) => ({ regionId: r.regionId, kind: r.kind, documentId: r.documentId, sectionRef: r.sectionRef, chars: r.text.length, charStart: r.charStart, truncatedAtBudget: r.truncatedAtBudget })) }
      : null,
    certified: extras.certified ?? null,
    contextBundle: bundle
      ? {
          bundleId: bundle.bundleId ?? "(none)",
          sufficiencyState: bundle.sufficiencyState ?? "(none)",
          stopReasons: bundle.stopReasons ?? [],
          itemCount: bundle.items?.length ?? 0,
          items: (bundle.items ?? []).map((i) => ({ itemId: i.itemId, type: i.type, normalizedRef: i.normalizedRef ?? null, citation: i.citation ?? null, evidenceState: i.evidenceState ?? null, excerptChars: i.excerptText.length, excerptText: i.excerptText })),
          edges: bundle.edges ?? [],
        }
      : null,
    compilation: {
      status: result.status,
      failureReasons: result.failureReasons ?? [],
      errorDetail: result.errorDetail ?? null,
      providerError: result.errorDetail?.providerError ?? null,
      rawModelOutput: result.rawModelOutput ?? null,
      toolCallLog: result.toolCallLog ?? [],
      rules: result.rules ?? [],
      definitions: result.definitions ?? [],
      sharedCapacities: result.sharedCapacities ?? [],
      unresolvedIssues: result.unresolvedIssues ?? [],
      irExtensionCandidates: result.irExtensionCandidates ?? [],
      inputHasUnresolvedOperativeEvidence: result.inputHasUnresolvedOperativeEvidence ?? null,
      provider: result.provider ?? null,
      model: result.model ?? null,
      telemetry: result.telemetry ?? null,
      compiledAt: result.compiledAt ?? null,
      outputHash: sha256(JSON.stringify({ rules: result.rules, definitions: result.definitions, status: result.status })),
    },
    verification: verification
      ? {
          status: verification.status,
          findings: verification.findings,
          reconciliation: verification.reconciliation,
          sourceInventory: verification.sourceInventory,
          irInventory: verification.irInventory,
          numericAssertions: verification.numericAssertions ?? null,
          admissibleEvidence: verification.admissibleEvidence ?? null,
          semanticReviewInvoked: verification.semanticReviewInvoked,
          conditionSuspicion: verification.conditionSuspicion,
          verifierAlgorithmVersion: verification.verifierAlgorithmVersion,
          qualitativeLineage: verification.qualitativeLineage ?? null,
        }
      : null,
    run,
  };
}

/** Serializes, scans, and only then writes. Returns the path written. */
export function writeCandidateEvidence(dir: string, name: string, evidence: CandidateEvidence): string {
  const body = JSON.stringify(evidence, null, 2);
  const target = path.join(dir, `${name}.json`);
  assertNoSecrets(body, target);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, body);
  return target;
}

// ---------------------------------------------------------------------------
// Paired verified-unit persistence - the runtime/audit contract, written beside the evidence
// ---------------------------------------------------------------------------

export interface PersistCandidateArgs {
  dir: string;
  name: string;
  runId: string;
  compilerInput: SemanticCompilerInput;
  result: SemanticCompilationResult;
  verification: SemanticVerificationResult | null;
  run: CandidateEvidence["run"];
  /**
   * The units snapshotted BEFORE the verifier ran (snapshotUnitsForVerification). A runner that
   * verifies MUST take the snapshot first and pass it here; a compile-only runner may omit it, in
   * which case the snapshot is taken now and the package records every unit as unverified.
   */
  snapshot?: UnitSnapshot;
}

/**
 * Writes the evidence AND the paired verified-unit package from the same in-memory objects, in one
 * call, so no runner can write one without the other and no later script has to reconstruct the
 * pairing. The package is serialized, scanned and written first; a secret hit aborts both.
 */
export function persistCandidate(a: PersistCandidateArgs): { evidencePath: string; verifiedUnitsPath: string | null; package: PersistedVerifiedUnitPackage } {
  if (a.verification && !a.snapshot) throw new Error(`persistCandidate(${a.name}): a verifying runner must snapshot the units before verifying and pass that snapshot; identity is captured at verification time, not reconstructed afterwards`);
  const snapshot = a.snapshot ?? snapshotUnitsForVerification(a.result);
  const pkg = buildVerifiedUnitPackage({
    companyId: a.compilerInput.companyId, instrumentKey: a.compilerInput.instrumentKey, candidateRef: a.compilerInput.candidateRef, runId: a.runId,
    snapshot, verification: a.verification, currentUnits: [...(a.result.rules ?? []), ...(a.result.definitions ?? [])],
  });
  let verifiedUnitsPath: string | null = null;
  if (snapshot.units.length > 0) {
    const body = serializeVerifiedUnitPackage(pkg);
    const vdir = path.join(a.dir, "verified-units");
    verifiedUnitsPath = path.join(vdir, `${a.name}.verified-units.json`);
    assertNoSecrets(body, verifiedUnitsPath);
    fs.mkdirSync(vdir, { recursive: true });
    fs.writeFileSync(verifiedUnitsPath, body);
  }
  const evidence = buildCandidateEvidence(a.compilerInput, a.result, a.verification, a.run);
  if (verifiedUnitsPath) evidence.verifiedUnits = { file: path.relative(a.dir, verifiedUnitsPath), packageHash: pkg.packageHash, complete: pkg.complete, artifactsPersisted: pkg.counts.artifactsPersisted, unitsMissingVerification: pkg.counts.unitsMissingVerification, problems: [...new Set(pkg.problems.map((p) => p.code))].sort() };
  const evidencePath = writeCandidateEvidence(a.dir, a.name, evidence);
  return { evidencePath, verifiedUnitsPath, package: pkg };
}

/** Accumulates the packages of one run and writes the manifest that exposes incomplete coverage. */
export class VerifiedUnitManifestWriter {
  private readonly packages: { pkg: PersistedVerifiedUnitPackage; file: string | null }[] = [];
  constructor(private readonly dir: string, private readonly companyId: string, private readonly instrumentKey: string, private readonly runId: string) {}
  add(pkg: PersistedVerifiedUnitPackage, file: string | null): void { this.packages.push({ pkg, file: file ? path.relative(this.dir, file) : null }); }
  build(): VerifiedUnitRunManifest { return buildVerifiedUnitRunManifest({ companyId: this.companyId, instrumentKey: this.instrumentKey, runId: this.runId, packages: this.packages }); }
  write(name = "verified-units-manifest"): string {
    const body = JSON.stringify(this.build(), null, 2);
    const target = path.join(this.dir, `${name}.json`);
    assertNoSecrets(body, target);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(target, body);
    return target;
  }
}
