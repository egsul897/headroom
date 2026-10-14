/**
 * Autonomous precedent sweep + executable-rule learning loop.
 *
 * Hand-written surface area is limited to: this engine, safety gates, learner.
 * Extraction/classification improvements arrive only as learned-rules/vN.json.
 *
 * Crash safety:
 * - Each MECHANICALLY_REPLAYED rule appends partial.jsonl + Neon proposal/eval immediately.
 * - Checkpoint tracks phase + candidateIndex so --resume continues mid-epoch.
 * - A completed source cursor means "enter proposals / next epoch", not "0 sources".
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { runCovenantComputation } from "../../contract-model/covenant-computation";
import { bumpRuleSet, loadLatestLearnedRules, writeLearnedRules } from "../learned-rules/load";
import {
  appendPartialAccept,
  clearPartialAccepts,
  loadPartialAccepts,
  type PartialAcceptRecord,
} from "../learned-rules/partial";
import type { LearnedRuleSet } from "../learned-rules/types";

/** Pluggable rules persistence (filesystem default; Neon for serverless flywheel). */
export interface SweepRulesStore {
  loadLatest(): Promise<LearnedRuleSet> | LearnedRuleSet;
  save(ruleset: LearnedRuleSet): Promise<void> | void;
  appendPartial(version: number, record: PartialAcceptRecord): Promise<void> | void;
  loadPartials(version: number): Promise<PartialAcceptRecord[]> | PartialAcceptRecord[];
  clearPartials(version: number): Promise<void> | void;
}

function filesystemRulesStore(rulesDir?: string): SweepRulesStore {
  return {
    loadLatest: () => loadLatestLearnedRules(rulesDir),
    save: (ruleset) => {
      writeLearnedRules(ruleset, rulesDir);
    },
    appendPartial: (version, record) => {
      appendPartialAccept(version, record, rulesDir);
    },
    loadPartials: (version) => loadPartialAccepts(version, rulesDir),
    clearPartials: (version) => {
      clearPartialAccepts(version, rulesDir);
    },
  };
}
import {
  evaluateReplayGate,
  measureReplaySource,
  withProposedRule,
  type ReplaySource,
} from "../learned-rules/replay-gate";
import { synthesizeCandidateRules, type LedgerSignal } from "../learned-rules/synthesize";
import type { LearnedRule } from "../learned-rules/types";
import type { LearningErrorRecord, LearningEvaluationRecord } from "../types";
import type { NeonHttpsExecutor } from "../store/neon-transport";
import { buildComputationPackage } from "./build-package";
import {
  candidatesAsRows,
  fetchCandidates,
  fetchConditions,
  fetchDefinitions,
  fetchDocumentText,
  fetchKnowledgeSources,
  loadSweepCursor,
  makeSweepCursor,
  markSweepEpochComplete,
  saveSweepCursor,
  type SweepCursor,
} from "./neon-load";
import {
  persistRuleSetArtifact,
  persistSweepArtifact,
  persistSweepErrors,
  persistSweepEvaluation,
  persistSweepPackage,
  persistSweepProposal,
  persistSweepRun,
  proposalFromRule,
} from "./persist-sweep";
import { selfCheckComputation } from "./self-check";

export interface SweepOptions {
  executor: NeonHttpsExecutor;
  batchSize?: number;
  maxSources?: number;
  maxEpochs?: number;
  /** Resume from checkpoint (default true). */
  resume?: boolean;
  /** Directory for learned-rules/vN.json (default repo learned-rules/). */
  rulesDir?: string;
  dryRun?: boolean;
  codeSha?: string;
  now?: () => string;
  /** Injected goldens for replay gate (offline tests). */
  goldenChecks?: import("../learned-rules/replay-gate").GoldenCheck[];
  /** Optional progress logger. */
  log?: (line: string) => void;
  /** How many candidate rules to evaluate per progress log batch (default 50). */
  proposalBatchSize?: number;
  /** Max candidate rules to evaluate this invocation (serverless slice bound). */
  maxCandidates?: number;
  /** When true, skip source re-persist during proposals rebuild (flywheel). */
  rebuildSourcesOnly?: boolean;
  /** Pluggable rules store; defaults to learned-rules/ files. */
  rulesStore?: SweepRulesStore;
  /**
   * Test hook: throw after this many ACCEPTs in the current process
   * (simulates a mid-epoch kill after durable per-accept writes).
   */
  crashAfterAccepts?: number;
}

export interface EpochDashboard {
  epoch: number;
  sourcesProcessed: number;
  covenantsComputed: number;
  errorRateByClass: Record<string, number>;
  /** Count of rules that passed mechanical replay (not independently verified). */
  proposalsAccepted: number;
  proposalsMechanicallyReplayed: number;
  proposalsRejected: number;
  rulesetVersion: number;
}

export interface SweepResult {
  epochs: EpochDashboard[];
  finalRulesetVersion: number;
  totalSources: number;
  totalErrors: number;
  stoppedReason: string;
}

function codeShaFallback(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function runIdFor(sourceId: string, epoch: number, at: string): string {
  return createHash("sha256").update(`sweep|${sourceId}|${epoch}|${at}`).digest("hex").slice(0, 20);
}

function tallyClasses(errors: LearningErrorRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of errors) out[e.class] = (out[e.class] ?? 0) + 1;
  return out;
}

function mergeTallies(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

function applyPartialToRuleset(base: LearnedRuleSet, accepts: LearnedRule[]): LearnedRuleSet {
  let working = base;
  for (const rule of accepts) {
    working = withProposedRule(working, { ...rule, state: "MECHANICALLY_REPLAYED" });
  }
  return working;
}

async function persistCheckpoint(
  executor: NeonHttpsExecutor,
  cursor: SweepCursor,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  await saveSweepCursor(executor, cursor);
}

export async function runCovenantLearningSweep(opts: SweepOptions): Promise<SweepResult> {
  const log = opts.log ?? (() => undefined);
  const batchSize = opts.batchSize ?? 10;
  const maxSources = opts.maxSources ?? Number.POSITIVE_INFINITY;
  const maxEpochs = opts.maxEpochs ?? 8;
  const proposalBatchSize = opts.proposalBatchSize ?? 50;
  const maxCandidates = opts.maxCandidates ?? Number.POSITIVE_INFINITY;
  const resume = opts.resume !== false;
  const dryRun = Boolean(opts.dryRun);
  const now = opts.now ?? (() => new Date().toISOString());
  const sha = opts.codeSha ?? codeShaFallback();
  const rulesStore = opts.rulesStore ?? filesystemRulesStore(opts.rulesDir);

  let ruleset = await Promise.resolve(rulesStore.loadLatest());
  const epochs: EpochDashboard[] = [];
  let totalSources = 0;
  let totalErrors = 0;
  let stoppedReason = "max epochs reached";
  let processAccepts = 0;

  let checkpoint: SweepCursor | null = null;
  if (resume) {
    checkpoint = await loadSweepCursor(opts.executor);
    if (checkpoint) {
      log(
        `resume checkpoint: epoch=${checkpoint.epoch} phase=${checkpoint.phase} sourcesComplete=${checkpoint.sourcesComplete} afterSourceId=${checkpoint.afterSourceId || "(start)"} candidateIndex=${checkpoint.candidateIndex}`,
      );
    }
  }

  // If prior epoch finalized cleanly, begin the next one.
  let startEpoch = 1;
  if (checkpoint?.phase === "finalize" || checkpoint?.status === "EPOCH_COMPLETE") {
    // Completed epoch with no pending partial → advance; if partial exists for next version, continue building.
    const nextVer = Math.max(ruleset.rulesetVersion + 1, checkpoint.nextRulesetVersion || 1);
    const pending = await Promise.resolve(rulesStore.loadPartials(nextVer));
    if (pending.length > 0 && checkpoint.phase === "proposals") {
      startEpoch = checkpoint.epoch;
    } else if (checkpoint.phase === "finalize" || checkpoint.status === "EPOCH_COMPLETE") {
      // Sources done + proposals done last run → start next epoch from scratch.
      startEpoch = Math.max(1, checkpoint.epoch + 1);
      checkpoint = makeSweepCursor({
        epoch: startEpoch,
        phase: "sources",
        sourcesComplete: false,
        afterSourceId: "",
        nextRulesetVersion: ruleset.rulesetVersion + 1,
      });
      log(`prior epoch complete; starting epoch ${startEpoch}`);
    }
  } else if (checkpoint && checkpoint.epoch > 0) {
    startEpoch = checkpoint.epoch;
  }

  for (let epoch = startEpoch; epoch <= maxEpochs; epoch++) {
    const nextRulesetVersion = ruleset.rulesetVersion + 1;
    const partialAccepts = await Promise.resolve(rulesStore.loadPartials(nextRulesetVersion));
    let workingRuleset = applyPartialToRuleset(
      ruleset,
      partialAccepts.map((p) => p.rule),
    );

    let phase: SweepCursor["phase"] =
      checkpoint && checkpoint.epoch === epoch ? checkpoint.phase : "sources";
    // Completed source cursor with legacy/missing phase → enter proposals, not idle.
    if (
      checkpoint &&
      checkpoint.epoch === epoch &&
      checkpoint.sourcesComplete &&
      phase === "sources"
    ) {
      phase = "proposals";
    }

    let afterSourceId =
      checkpoint && checkpoint.epoch === epoch && phase === "sources"
        ? checkpoint.afterSourceId
        : "";
    // When resuming proposals, always rebuild source signals from the epoch-start ruleset.
    if (phase === "proposals" || phase === "finalize") {
      afterSourceId = "";
    }

    let candidateStartIndex =
      checkpoint && checkpoint.epoch === epoch && phase === "proposals"
        ? checkpoint.candidateIndex
        : 0;
    let accepted = partialAccepts.length;
    let rejected =
      checkpoint && checkpoint.epoch === epoch ? checkpoint.rejectedCount : 0;
    const epochRunId =
      (checkpoint && checkpoint.epoch === epoch && checkpoint.epochRunId) ||
      runIdFor(`epoch-${epoch}`, epoch, now());

    log(
      `epoch ${epoch} start (ruleset v${ruleset.rulesetVersion}, partial accepts=${partialAccepts.length}, phase=${phase}, candidateStart=${candidateStartIndex})`,
    );

    const epochErrors: LearningErrorRecord[] = [];
    const replaySources: ReplaySource[] = [];
    let sourcesProcessed = 0;
    let covenantsComputed = 0;
    let errorRateByClass: Record<string, number> = {};
    let sourcesComplete = phase === "proposals" || phase === "finalize";

    // ---- Sources phase (or rebuild for proposals resume) ----
    if (phase === "sources" || phase === "proposals") {
      const rebuildOnly = phase === "proposals" || Boolean(opts.rebuildSourcesOnly);
      let promotedFromEmptyCursor = false;

      while (sourcesProcessed < maxSources) {
        const limit = Math.min(batchSize, maxSources - sourcesProcessed);
        const sources = await fetchKnowledgeSources(opts.executor, { afterSourceId, limit });

        if (sources.length === 0) {
          if (
            !rebuildOnly &&
            !promotedFromEmptyCursor &&
            afterSourceId !== "" &&
            sourcesProcessed === 0
          ) {
            // Completed source cursor: do not exit with 0 work — rebuild from start for proposals.
            log(
              `source cursor complete (afterSourceId set, 0 remaining); treating as sourcesComplete → rebuild for proposals`,
            );
            afterSourceId = "";
            sourcesComplete = true;
            phase = "proposals";
            promotedFromEmptyCursor = true;
            await persistCheckpoint(
              opts.executor,
              makeSweepCursor({
                epoch,
                phase: "proposals",
                sourcesComplete: true,
                afterSourceId: "",
                candidateIndex: candidateStartIndex,
                acceptedCount: accepted,
                rejectedCount: rejected,
                nextRulesetVersion,
                epochRunId,
                status: "PROPOSALS",
              }),
              dryRun,
            );
            continue;
          }
          sourcesComplete = true;
          break;
        }

        for (const source of sources) {
          const startedAt = now();
          const runId = runIdFor(source.sourceId, epoch, startedAt);
          const packageKey = `clf-sweep:${source.sourceId}`;

          const [text, candidates, definitions, conditions] = await Promise.all([
            fetchDocumentText(opts.executor, source),
            fetchCandidates(opts.executor, source.sourceId),
            fetchDefinitions(opts.executor, source.sourceId),
            fetchConditions(opts.executor, source.sourceId),
          ]);

          // Epoch-start ruleset for signal stability (not workingRuleset).
          const pkg = buildComputationPackage({
            source,
            documentText: text,
            candidates: candidatesAsRows(candidates),
            rules: ruleset,
          });

          const result = runCovenantComputation(pkg, { rules: ruleset, createdAt: startedAt });
          const errors = selfCheckComputation({
            packageKey,
            runId,
            sourceId: source.sourceId,
            result,
            candidates,
            definitions,
            conditions,
            now: startedAt,
          });

          const finishedAt = now();
          const status = errors.some((e) => e.severity === "HIGH" || e.severity === "CRITICAL")
            ? "FAILED"
            : result.baskets.length === 0 && result.ratios.length === 0
              ? "ABSTAINED"
              : "OK";

          if (!dryRun && !rebuildOnly) {
            await persistSweepPackage(opts.executor, {
              packageKey,
              companyId: source.companyId || source.sourceId,
              issuerCik: source.issuerCik || "unknown",
              issuerTicker: source.ticker,
            });
            await persistSweepRun(opts.executor, {
              runId,
              packageKey,
              status,
              codeSha: sha,
              startedAt,
              finishedAt,
              epoch,
              rulesetVersion: ruleset.rulesetVersion,
              errorCount: errors.length,
              covenantCount: result.baskets.length + result.ratios.length,
            });
            await persistSweepArtifact(opts.executor, {
              artifactId: `calc:${packageKey}:${runId}`,
              packageKey,
              runId,
              result,
              rulesetVersion: ruleset.rulesetVersion,
            });
            await persistSweepErrors(opts.executor, errors);

            const evaluation: LearningEvaluationRecord = {
              evaluationId: `eval:${runId}`,
              packageKey,
              runId,
              cohort: "TRAIN_DEV",
              sourceFidelityPass: null,
              coverageScore:
                candidates.length === 0
                  ? null
                  : Math.max(
                      0,
                      1 - errors.filter((e) => e.class === "DISCOVERY_GAP").length / candidates.length,
                    ),
              calculationCorrectness: !errors.some((e) => e.class === "CALCULATION_MISMATCH"),
              dangerousOmissionsStatus: "NOT_MEASURED",
              dangerousOmissionCount: null,
              abstentionCount: result.omissions.length,
              supportedStructureUnits: result.baskets.filter((b) => b.category !== "UNKNOWN").length,
              verifiedExecutableUnits: result.baskets.filter((b) => b.capStatus === "COMPUTED").length,
              unsupportedUnits: result.baskets.filter((b) => b.category === "UNKNOWN").length,
              refusedExecutableUnits: result.baskets.filter((b) => b.capStatus === "NEEDS_INPUT").length,
              metricDefinitions: {
                supportedStructureUnits: "baskets with category ≠ UNKNOWN",
                verifiedExecutableUnits: "baskets with capStatus=COMPUTED",
                dangerousOmissions: "NOT_MEASURED in sweep",
              },
              independent: true,
              notes: [
                `epoch=${epoch}`,
                `ruleset=v${ruleset.rulesetVersion}`,
                `authority=COMPUTED_NOT_CERTIFIED`,
              ],
              createdAt: finishedAt,
            };
            await persistSweepEvaluation(opts.executor, evaluation);
          }

          epochErrors.push(...errors);
          errorRateByClass = mergeTallies(errorRateByClass, tallyClasses(errors));
          covenantsComputed += result.baskets.length + result.ratios.length;
          sourcesProcessed += 1;
          totalSources += 1;
          totalErrors += errors.length;

          const replaySource: ReplaySource = {
            sourceId: source.sourceId,
            packageKey,
            pkg,
            documentText: text,
            candidates,
            source,
            baselineErrorCount: 0,
          };
          replaySource.baselineErrorCount = measureReplaySource(replaySource, workingRuleset);
          replaySources.push(replaySource);

          afterSourceId = source.sourceId;
          if (!dryRun && !rebuildOnly) {
            await persistCheckpoint(
              opts.executor,
              makeSweepCursor({
                epoch,
                phase: "sources",
                sourcesComplete: false,
                afterSourceId,
                candidateIndex: 0,
                acceptedCount: accepted,
                rejectedCount: rejected,
                nextRulesetVersion,
                epochRunId,
                status: "IN_PROGRESS",
              }),
              dryRun,
            );
          }
        }
      }

      // If we stopped because of maxSources, peek whether more sources remain.
      if (!sourcesComplete && afterSourceId) {
        const more = await fetchKnowledgeSources(opts.executor, {
          afterSourceId,
          limit: 1,
        });
        if (more.length === 0) sourcesComplete = true;
      }

      // Only advance to proposals when the source stream is exhausted.
      // Hitting maxSources mid-stream must leave phase=sources for the next slice.
      if (sourcesComplete) {
        phase = "proposals";
        await persistCheckpoint(
          opts.executor,
          makeSweepCursor({
            epoch,
            phase: "proposals",
            sourcesComplete: true,
            afterSourceId: "",
            candidateIndex: candidateStartIndex,
            acceptedCount: accepted,
            rejectedCount: rejected,
            nextRulesetVersion,
            epochRunId,
            status: "PROPOSALS",
          }),
          dryRun,
        );
      } else {
        stoppedReason = "slice budget reached";
        const dashboard: EpochDashboard = {
          epoch,
          sourcesProcessed,
          covenantsComputed,
          errorRateByClass,
          proposalsAccepted: accepted,
          proposalsMechanicallyReplayed: accepted,
          proposalsRejected: rejected,
          rulesetVersion: ruleset.rulesetVersion,
        };
        epochs.push(dashboard);
        log(
          `epoch ${epoch} dashboard: sources=${sourcesProcessed} covenants=${covenantsComputed} (sources slice pause)`,
        );
        break;
      }
    }

    // ---- Proposals phase ----
    const signals: LedgerSignal[] = epochErrors.map((e) => ({
      errorId: e.errorId,
      class: e.class,
      message: e.message,
      packageKey: e.packageKey,
      sourceId: typeof e.evidence?.sourceId === "string" ? e.evidence.sourceId : undefined,
      evidence: e.evidence,
    }));
    const candidates = synthesizeCandidateRules({ signals, epoch, now: now() });
    log(
      `epoch ${epoch}: ${sourcesProcessed} sources, ${epochErrors.length} errors, ${candidates.length} candidate rules (resume index ${candidateStartIndex})`,
    );

    const acceptedRules: LearnedRule[] = partialAccepts.map((p) => p.rule);
    const rejectedIds: string[] = [];

    if (!dryRun) {
      await persistSweepPackage(opts.executor, {
        packageKey: "clf-sweep:global",
        companyId: "clf-sweep",
        issuerCik: "0000000000",
      });
    }

    const candidateEnd = Math.min(candidates.length, candidateStartIndex + maxCandidates);
    for (let i = candidateStartIndex; i < candidateEnd; i++) {
      const candidate = candidates[i]!;
      const related = new Set(candidate.provenance.ledgerErrorIds);
      const scoped = replaySources.filter((s) =>
        epochErrors.some((e) => related.has(e.errorId) && e.packageKey === s.packageKey),
      );
      const sourcesForGate = scoped.length > 0 ? scoped : replaySources.slice(0, 20);
      for (const s of sourcesForGate) {
        s.baselineErrorCount = measureReplaySource(s, workingRuleset);
      }
      const gate = evaluateReplayGate({
        baseline: workingRuleset,
        candidate,
        sources: sourcesForGate,
        goldens: opts.goldenChecks,
      });

      if (gate.accepted) {
        accepted += 1;
        processAccepts += 1;
        acceptedRules.push(gate.rule);
        workingRuleset = withProposedRule(workingRuleset, gate.rule);
        for (const s of sourcesForGate) {
          s.baselineErrorCount = measureReplaySource(s, workingRuleset);
        }

        // Durable immediate persist — survives kill before epoch finalize.
        if (!dryRun) {
          await Promise.resolve(
            rulesStore.appendPartial(nextRulesetVersion, {
              rule: gate.rule,
              candidateIndex: i,
              acceptedAt: now(),
              errorsBefore: gate.errorsBefore,
              errorsAfter: gate.errorsAfter,
              epoch,
              epochRunId,
            }),
          );
          await persistSweepProposal(
            opts.executor,
            proposalFromRule({
              rule: gate.rule,
              runId: epochRunId,
              accepted: true,
            }),
          );
          await persistSweepEvaluation(opts.executor, {
            evaluationId: `eval:accept:${gate.rule.ruleId}`,
            packageKey: "clf-sweep:global",
            runId: epochRunId,
            cohort: "TRAIN_DEV",
            sourceFidelityPass: null,
            coverageScore: null,
            calculationCorrectness: gate.errorsAfter < gate.errorsBefore,
            dangerousOmissionsStatus: "NOT_MEASURED",
            dangerousOmissionCount: null,
            abstentionCount: 0,
            supportedStructureUnits: 0,
            verifiedExecutableUnits: 0,
            unsupportedUnits: 0,
            refusedExecutableUnits: 0,
            metricDefinitions: {
              supportedStructureUnits: "n/a",
              verifiedExecutableUnits: "n/a",
              dangerousOmissions: "NOT_MEASURED",
            },
            independent: true,
            notes: [
              `MECHANICALLY_REPLAYED ${gate.rule.ruleId}`,
              `errors ${gate.errorsBefore}→${gate.errorsAfter}`,
              `candidateIndex=${i}`,
              `adjudicationClass=MECHANICAL_REPLAY`,
              `not INDEPENDENTLY_VERIFIED`,
              `authority=COMPUTED_NOT_CERTIFIED`,
            ],
            createdAt: now(),
          });
        }

        if (opts.crashAfterAccepts != null && processAccepts >= opts.crashAfterAccepts) {
          await persistCheckpoint(
            opts.executor,
            makeSweepCursor({
              epoch,
              phase: "proposals",
              sourcesComplete: true,
              afterSourceId: "",
              candidateIndex: i + 1,
              candidatesTotal: candidates.length,
              acceptedCount: accepted,
              rejectedCount: rejected,
              nextRulesetVersion,
              epochRunId,
              status: "PROPOSALS",
            }),
            dryRun,
          );
          throw new Error(
            `clf:sweep simulated crash after ${processAccepts} accepts (candidateIndex=${i + 1})`,
          );
        }
      } else {
        rejected += 1;
        rejectedIds.push(gate.rule.ruleId);
        if (!dryRun) {
          await persistSweepProposal(
            opts.executor,
            proposalFromRule({
              rule: gate.rule,
              runId: epochRunId,
              accepted: false,
            }),
          );
        }
      }

      // Advance candidate index after every evaluation (accept or reject).
      await persistCheckpoint(
        opts.executor,
        makeSweepCursor({
          epoch,
          phase: "proposals",
          sourcesComplete: true,
          afterSourceId: "",
          candidateIndex: i + 1,
          candidatesTotal: candidates.length,
          acceptedCount: accepted,
          rejectedCount: rejected,
          nextRulesetVersion,
          epochRunId,
          status: "PROPOSALS",
        }),
        dryRun,
      );

      if (gate.accepted || (i + 1) % proposalBatchSize === 0 || i + 1 === candidateEnd) {
        log(
          `  [${i + 1}/${candidates.length}] rule ${candidate.ruleId} → ${gate.accepted ? "MECHANICALLY_REPLAYED" : "REJECT"} (${gate.reason})`,
        );
      }
    }

    const slicedEarly = candidateEnd < candidates.length;
    const newAcceptsThisRun = acceptedRules.length - partialAccepts.length;
    const dashboard: EpochDashboard = {
      epoch,
      sourcesProcessed,
      covenantsComputed,
      errorRateByClass,
      proposalsAccepted: accepted,
      proposalsMechanicallyReplayed: accepted,
      proposalsRejected: rejected,
      rulesetVersion: ruleset.rulesetVersion,
    };
    epochs.push(dashboard);
    log(
      `epoch ${epoch} dashboard: sources=${sourcesProcessed} covenants=${covenantsComputed} mechanicallyReplayed=${accepted} (new=${newAcceptsThisRun}) rejected=${rejected}${slicedEarly ? ` (slice pause at ${candidateEnd}/${candidates.length})` : ""}`,
    );

    if (slicedEarly) {
      stoppedReason = "slice budget reached";
      break;
    }

    if (accepted === 0) {
      stoppedReason = "no proposal improved";
      if (!dryRun) await markSweepEpochComplete(opts.executor, epoch, { nextRulesetVersion });
      break;
    }

    // Finalize partial → versioned ruleset (Neon and/or repo export via store).
    ruleset = bumpRuleSet({
      previous: ruleset,
      accepted: acceptedRules,
      rejectedIds,
      epoch,
    });
    await Promise.resolve(rulesStore.save(ruleset));
    await Promise.resolve(rulesStore.clearPartials(nextRulesetVersion));
    if (!dryRun) await persistRuleSetArtifact(opts.executor, ruleset);
    log(`persisted ruleset v${ruleset.rulesetVersion} (${acceptedRules.length} rules)`);

    await persistCheckpoint(
      opts.executor,
      makeSweepCursor({
        epoch,
        phase: "finalize",
        sourcesComplete: true,
        afterSourceId: "",
        candidateIndex: 0,
        acceptedCount: accepted,
        rejectedCount: rejected,
        nextRulesetVersion: ruleset.rulesetVersion + 1,
        epochRunId,
        status: "EPOCH_COMPLETE",
      }),
      dryRun,
    );

    // Clear in-process checkpoint so the next loop iteration starts fresh sources.
    checkpoint = makeSweepCursor({
      epoch: epoch + 1,
      phase: "sources",
      sourcesComplete: false,
      afterSourceId: "",
      nextRulesetVersion: ruleset.rulesetVersion + 1,
    });
  }

  return {
    epochs,
    finalRulesetVersion: ruleset.rulesetVersion,
    totalSources,
    totalErrors,
    stoppedReason,
  };
}
