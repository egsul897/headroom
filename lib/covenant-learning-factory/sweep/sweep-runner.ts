/**
 * Autonomous precedent sweep + executable-rule learning loop.
 *
 * Hand-written surface area is limited to: this engine, safety gates, learner.
 * Extraction/classification improvements arrive only as learned-rules/vN.json.
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { runCovenantComputation } from "../../contract-model/covenant-computation";
import { bumpRuleSet, loadLatestLearnedRules, writeLearnedRules } from "../learned-rules/load";
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
  markSweepEpochComplete,
  saveSweepCursor,
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
}

export interface EpochDashboard {
  epoch: number;
  sourcesProcessed: number;
  covenantsComputed: number;
  errorRateByClass: Record<string, number>;
  proposalsAccepted: number;
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

export async function runCovenantLearningSweep(opts: SweepOptions): Promise<SweepResult> {
  const log = opts.log ?? (() => undefined);
  const batchSize = opts.batchSize ?? 10;
  const maxSources = opts.maxSources ?? Number.POSITIVE_INFINITY;
  const maxEpochs = opts.maxEpochs ?? 8;
  const proposalBatchSize = opts.proposalBatchSize ?? 50;
  const resume = opts.resume !== false;
  const dryRun = Boolean(opts.dryRun);
  const now = opts.now ?? (() => new Date().toISOString());
  const sha = opts.codeSha ?? codeShaFallback();

  let ruleset = loadLatestLearnedRules(opts.rulesDir);
  const epochs: EpochDashboard[] = [];
  let totalSources = 0;
  let totalErrors = 0;
  let stoppedReason = "max epochs reached";

  for (let epoch = 1; epoch <= maxEpochs; epoch++) {
    log(`epoch ${epoch} start (ruleset v${ruleset.rulesetVersion})`);
    let afterSourceId = "";
    if (resume && epoch === 1) {
      const cursor = await loadSweepCursor(opts.executor);
      if (cursor?.afterSourceId) {
        afterSourceId = cursor.afterSourceId;
        log(`resume after sourceId=${afterSourceId}`);
      }
    }

    const epochErrors: LearningErrorRecord[] = [];
    const replaySources: ReplaySource[] = [];
    let sourcesProcessed = 0;
    let covenantsComputed = 0;
    let errorRateByClass: Record<string, number> = {};

    while (sourcesProcessed < maxSources) {
      const limit = Math.min(batchSize, maxSources - sourcesProcessed);
      const sources = await fetchKnowledgeSources(opts.executor, { afterSourceId, limit });
      if (sources.length === 0) break;

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

        if (!dryRun) {
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
                : Math.max(0, 1 - errors.filter((e) => e.class === "DISCOVERY_GAP").length / candidates.length),
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
        replaySource.baselineErrorCount = measureReplaySource(replaySource, ruleset);
        replaySources.push(replaySource);

        afterSourceId = source.sourceId;
        if (!dryRun) {
          await saveSweepCursor(opts.executor, {
            afterSourceId,
            epoch,
            updatedAt: finishedAt,
          });
        }
      }
    }

    // Synthesize executable candidate rules from clustered ledger signals
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
      `epoch ${epoch}: ${sourcesProcessed} sources, ${epochErrors.length} errors, ${candidates.length} candidate rules (evaluating all)`,
    );

    let accepted = 0;
    let rejected = 0;
    const acceptedRules: LearnedRule[] = [];
    const rejectedIds: string[] = [];
    // Working ruleset grows as proposals pass the gate so later candidates
    // measure against cumulative improvements within the epoch.
    let workingRuleset = ruleset;
    const epochRunId = runIdFor(`epoch-${epoch}`, epoch, now());

    if (!dryRun) {
      await persistSweepPackage(opts.executor, {
        packageKey: "clf-sweep:global",
        companyId: "clf-sweep",
        issuerCik: "0000000000",
      });
    }

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      // Replay only sources that contributed provenance errors when possible
      const related = new Set(candidate.provenance.ledgerErrorIds);
      const scoped = replaySources.filter((s) =>
        epochErrors.some((e) => related.has(e.errorId) && e.packageKey === s.packageKey),
      );
      const sourcesForGate = scoped.length > 0 ? scoped : replaySources.slice(0, 20);
      // Refresh baselines under the working ruleset so sequential accepts compound.
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
        acceptedRules.push(gate.rule);
        workingRuleset = withProposedRule(workingRuleset, gate.rule);
        for (const s of sourcesForGate) {
          s.baselineErrorCount = measureReplaySource(s, workingRuleset);
        }
      } else {
        rejected += 1;
        rejectedIds.push(gate.rule.ruleId);
      }
      if (!dryRun) {
        await persistSweepProposal(
          opts.executor,
          proposalFromRule({
            rule: gate.rule,
            runId: epochRunId,
            accepted: gate.accepted,
          }),
        );
      }
      if (gate.accepted || (i + 1) % proposalBatchSize === 0 || i + 1 === candidates.length) {
        log(
          `  [${i + 1}/${candidates.length}] rule ${candidate.ruleId} → ${gate.accepted ? "ACCEPT" : "REJECT"} (${gate.reason})`,
        );
      }
    }

    const dashboard: EpochDashboard = {
      epoch,
      sourcesProcessed,
      covenantsComputed,
      errorRateByClass,
      proposalsAccepted: accepted,
      proposalsRejected: rejected,
      rulesetVersion: ruleset.rulesetVersion,
    };
    epochs.push(dashboard);
    log(
      `epoch ${epoch} dashboard: sources=${sourcesProcessed} covenants=${covenantsComputed} accepted=${accepted} rejected=${rejected}`,
    );

    if (accepted === 0) {
      stoppedReason = "no proposal improved";
      if (!dryRun) await markSweepEpochComplete(opts.executor, epoch);
      break;
    }

    ruleset = bumpRuleSet({
      previous: ruleset,
      accepted: acceptedRules,
      rejectedIds,
      epoch,
    });
    writeLearnedRules(ruleset, opts.rulesDir);
    if (!dryRun) await persistRuleSetArtifact(opts.executor, ruleset);
    log(`wrote learned-rules/v${ruleset.rulesetVersion}.json (${accepted} new rules)`);

    // Next epoch restarts cursor from beginning to remeasure under new rules
    afterSourceId = "";
    if (!dryRun) {
      await saveSweepCursor(opts.executor, { afterSourceId: "", epoch: epoch + 1, updatedAt: now() });
    }
  }

  return {
    epochs,
    finalRulesetVersion: ruleset.rulesetVersion,
    totalSources,
    totalErrors,
    stoppedReason,
  };
}
