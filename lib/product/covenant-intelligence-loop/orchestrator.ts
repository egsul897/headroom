/**
 * Covenant Intelligence Loop orchestrator.
 * Stages: INGEST → STRUCTURE → INTERPRET → COMPILE → EXERCISE → DIAGNOSE → IMPROVE → REEXERCISE → PUBLISH
 * Idempotent + resumable via persisted LoopRunRecord. Designed for background workers (no open HTTP).
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../prisma";
import { extractStructure, discoverDefinitions, discoverCrossReferences } from "../../knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../knowledge-factory/pipeline/candidates";
import {
  buildDocumentCovenantSummary,
  summarizeFromStoredMetadata,
  type DocumentCovenantSummary,
} from "../covenant-intelligence/summarize";
import { isSubstantiveFinancingPrecedent } from "../covenant-intelligence/corpus-quality";
import { EXERCISE_LIBRARY } from "./exercise-library";
import { upsertEngineeringTasks } from "./improve-queue";
import { gapHistogram } from "./diagnose";
import { mergePatternObservation } from "./patterns";
import {
  loadPatterns,
  loadRun,
  saveDashboardOverlay,
  savePatterns,
  saveRun,
  updatePublishIndex,
  type DashboardExerciseOverlay,
} from "./store";
import {
  buildContextFromMetadata,
  buildContextFromSummary,
  detectPatternsFromResult,
  executeExerciseOnSource,
  resolveExercises,
} from "./runner";
import type {
  ExerciseDefinition,
  ExerciseExecutionResult,
  LoopRunRecord,
  LoopStage,
  StageRecord,
  StageStatus,
} from "./types";

export interface OrchestratorOptions {
  scope?: LoopRunRecord["scope"];
  companyId?: string;
  sourceIds?: string[];
  /** Prefer tickers/names like CONMED, CNMD, RIOT */
  preferIssuer?: string[];
  exerciseIds?: string[];
  verticalSlice?: boolean;
  /** Cap documents processed in one invocation */
  documentLimit?: number;
  /** Cap exercises per document */
  exerciseLimit?: number;
  /** Resume an existing runId */
  runId?: string;
  /** Skip stages already OK when resuming */
  resume?: boolean;
  /** After IMPROVE, re-run only exercises tied to open software gaps */
  reexerciseOnImprove?: boolean;
  /** Publish dashboard overlay for this companyId (customer) or research mirror */
  publishCompanyId?: string;
  /** In-memory summaries (fixture / offline) — skips Neon selection when set */
  inlineSummaries?: DocumentCovenantSummary[];
  /** Load curated CONMED Article VII fixture as authentic vertical-slice document */
  useConmedFixture?: boolean;
}

function newRunId(seed: string): string {
  const h = createHash("sha1").update(`${seed}|${Date.now()}`).digest("hex").slice(0, 10);
  return `cil-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${h}`;
}

function stage(stageName: LoopStage, status: StageStatus, message?: string, outputs?: Record<string, unknown>): StageRecord {
  const now = new Date().toISOString();
  return {
    stage: stageName,
    status,
    startedAt: now,
    finishedAt: now,
    message,
    outputs,
    retryCount: 0,
  };
}

function upsertStage(run: LoopRunRecord, rec: StageRecord): void {
  const idx = run.stages.findIndex((s) => s.stage === rec.stage);
  if (idx >= 0) run.stages[idx] = rec;
  else run.stages.push(rec);
  run.updatedAt = new Date().toISOString();
}

function stageDone(run: LoopRunRecord, name: LoopStage): boolean {
  const s = run.stages.find((x) => x.stage === name);
  return s?.status === "OK" || s?.status === "SKIPPED" || s?.status === "CONDITIONAL";
}

function loadConmedFixtureSummary(): DocumentCovenantSummary {
  const fixturePath = path.join(
    process.cwd(),
    "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
  );
  if (!existsSync(fixturePath)) {
    throw new Error(`CONMED fixture missing at ${fixturePath}`);
  }
  const text = readFileSync(fixturePath, "utf8");
  const sourceId = "fixture:conmed-article-vii";
  const structural = extractStructure(sourceId, text);
  const definitions = discoverDefinitions(sourceId, text, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, text);
  const candidates = discoverCovenantCandidates(sourceId, text, structural.nodes);
  return buildDocumentCovenantSummary({
    sourceId,
    documentTitle: "CONMED Eighth A&R Credit Agreement (Article VII curated)",
    issuerName: "CONMED Corporation",
    issuerCik: "0000816956",
    documentClass: "CREDIT_AGREEMENT",
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });
}

type SelectedSource = {
  sourceId: string;
  metadata: unknown;
  title: string;
  issuerName: string | null;
  summary?: DocumentCovenantSummary;
};

async function selectSources(opts: OrchestratorOptions): Promise<SelectedSource[]> {
  if (opts.inlineSummaries?.length) {
    return opts.inlineSummaries.map((s) => ({
      sourceId: s.sourceId,
      metadata: { covenantSummary: s },
      title: s.governingAgreement,
      issuerName: s.issuerName ?? null,
      summary: s,
    }));
  }
  if (opts.useConmedFixture) {
    const s = loadConmedFixtureSummary();
    return [
      {
        sourceId: s.sourceId,
        metadata: { covenantSummary: s },
        title: s.governingAgreement,
        issuerName: s.issuerName ?? null,
        summary: s,
      },
    ];
  }
  if (opts.sourceIds?.length) {
    const rows = await prisma.knowledgeSource.findMany({
      where: { sourceId: { in: opts.sourceIds } },
      select: { sourceId: true, metadata: true, documentTitle: true, issuerName: true },
    });
    return rows.map((r) => ({
      sourceId: r.sourceId,
      metadata: r.metadata,
      title: r.documentTitle,
      issuerName: r.issuerName,
    }));
  }

  if (opts.companyId) {
    const rows = await prisma.knowledgeSource.findMany({
      where: { companyId: opts.companyId, storageRef: { not: null } },
      take: opts.documentLimit ?? 40,
      orderBy: { filingDate: "desc" },
      select: { sourceId: true, metadata: true, documentTitle: true, issuerName: true },
    });
    return rows.map((r) => ({
      sourceId: r.sourceId,
      metadata: r.metadata,
      title: r.documentTitle,
      issuerName: r.issuerName,
    }));
  }

  const take = Math.max((opts.documentLimit ?? 8) * 8, 40);
  const rows = await prisma.knowledgeSource.findMany({
    where: { companyId: null, storageRef: { not: null } },
    take,
    orderBy: { filingDate: "desc" },
    select: {
      sourceId: true,
      metadata: true,
      documentTitle: true,
      issuerName: true,
      issuerTicker: true,
      documentClass: true,
      storageRef: true,
      companyId: true,
    },
  });

  const prefer = (opts.preferIssuer ?? ["CONMED", "CNMD", "RIOT"]).map((s) => s.toUpperCase());
  const scored = rows
    .filter((r) => {
      try {
        return isSubstantiveFinancingPrecedent(r as never);
      } catch {
        return Boolean(r.storageRef);
      }
    })
    .map((r) => {
      const summary = summarizeFromStoredMetadata(r.metadata);
      const items = summary?.items?.length ?? 0;
      const hay = `${r.documentTitle} ${r.issuerName ?? ""} ${r.issuerTicker ?? ""} ${r.sourceId}`.toUpperCase();
      const prefBoost = prefer.some((p) => hay.includes(p)) ? 1000 : 0;
      const classBoost = /CREDIT|INDENTURE/.test(String(r.documentClass ?? "")) ? 50 : 0;
      return { r, score: prefBoost + classBoost + items, items, summary };
    })
    .filter((x) => x.items > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.documentLimit ?? 8);

  return scored.map(({ r }) => ({
    sourceId: r.sourceId,
    metadata: r.metadata,
    title: r.documentTitle,
    issuerName: r.issuerName,
  }));
}

export async function runCovenantIntelligenceLoop(
  opts: OrchestratorOptions = {},
): Promise<LoopRunRecord> {
  const resume = Boolean(opts.resume && opts.runId);
  let run: LoopRunRecord | null = opts.runId ? loadRun(opts.runId) : null;

  if (!run) {
    const runId = opts.runId ?? newRunId(opts.companyId ?? opts.sourceIds?.join(",") ?? "corpus");
    run = {
      runId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scope: opts.scope ?? (opts.companyId ? "CUSTOMER" : opts.sourceIds?.length === 1 ? "SINGLE_SOURCE" : "PUBLIC_CORPUS"),
      companyId: opts.companyId,
      sourceIds: opts.sourceIds ?? [],
      stages: [],
      exerciseResults: [],
      gaps: [],
      patternsCaptured: [],
      engineeringTasks: [],
    };
    saveRun(run);
  }

  let selected: SelectedSource[] = [];

  // --- INGEST ---
  if (!(resume && stageDone(run, "INGEST"))) {
    selected = await selectSources(opts);
    // If Neon returned nothing for public corpus vertical slice, fall back to CONMED fixture.
    if (!selected.length && (opts.verticalSlice || opts.useConmedFixture !== false) && !opts.companyId && !opts.sourceIds?.length) {
      try {
        selected = await selectSources({ ...opts, useConmedFixture: true });
      } catch {
        /* keep empty */
      }
    }
    run.sourceIds = selected.map((s) => s.sourceId);
    upsertStage(
      run,
      stage("INGEST", selected.length ? "OK" : "FAILED", `Selected ${selected.length} source(s)`, {
        sourceIds: run.sourceIds,
        titles: selected.map((s) => s.title).slice(0, 20),
      }),
    );
    saveRun(run);
    if (!selected.length) {
      run.publishSummary = {
        documentsProcessed: 0,
        exerciseTypes: 0,
        executions: 0,
        substantive: 0,
        conditional: 0,
        unsupported: 0,
        failed: 0,
        gapHistogram: {},
      };
      saveRun(run);
      return run;
    }
  } else {
    selected = await selectSources({
      ...opts,
      sourceIds: run.sourceIds.filter((id) => !id.startsWith("fixture:")),
      useConmedFixture: run.sourceIds.some((id) => id.startsWith("fixture:")),
      inlineSummaries: opts.inlineSummaries,
    });
    if (!selected.length && run.sourceIds.some((id) => id.startsWith("fixture:"))) {
      selected = await selectSources({ useConmedFixture: true });
    }
  }

  const neonRows =
    selected.some((s) => !s.summary) && run.sourceIds.some((id) => !id.startsWith("fixture:"))
      ? await prisma.knowledgeSource.findMany({
          where: { sourceId: { in: run.sourceIds.filter((id) => !id.startsWith("fixture:")) } },
          select: { sourceId: true, metadata: true, documentTitle: true },
        })
      : [];

  const sourceRows: SelectedSource[] = run.sourceIds.map((id) => {
    const fromSelected = selected.find((s) => s.sourceId === id);
    if (fromSelected?.summary || fromSelected?.metadata) return fromSelected;
    const row = neonRows.find((r) => r.sourceId === id);
    return {
      sourceId: id,
      metadata: row?.metadata ?? fromSelected?.metadata ?? null,
      title: row?.documentTitle ?? fromSelected?.title ?? id,
      issuerName: fromSelected?.issuerName ?? null,
      summary: fromSelected?.summary,
    };
  });

  // --- STRUCTURE / INTERPRET / COMPILE (reuse persisted v2 summaries) ---
  const structured: Array<{
    sourceId: string;
    categories: string[];
    itemCount: number;
    patterns: string[];
  }> = [];

  if (!(resume && stageDone(run, "STRUCTURE"))) {
    let ok = 0;
    for (const row of sourceRows) {
      const summary = row.summary ?? summarizeFromStoredMetadata(row.metadata);
      if (!summary) continue;
      ok++;
      structured.push({
        sourceId: row.sourceId,
        categories: Object.keys(summary.countsByCategory),
        itemCount: summary.items.length,
        patterns: [...new Set(summary.items.flatMap((i) => i.draftingPatterns ?? []))],
      });
    }
    upsertStage(
      run,
      stage("STRUCTURE", ok ? "OK" : "FAILED", `Structured summaries available for ${ok}/${sourceRows.length}`, {
        documents: structured,
      }),
    );
    saveRun(run);
  }

  if (!(resume && stageDone(run, "INTERPRET"))) {
    const interpretDocs = structured.length
      ? structured
      : sourceRows
          .map((row) => {
            const summary = row.summary ?? summarizeFromStoredMetadata(row.metadata);
            if (!summary) return null;
            return {
              sourceId: row.sourceId,
              categories: Object.keys(summary.countsByCategory),
              itemCount: summary.items.length,
              patterns: [...new Set(summary.items.flatMap((i) => i.draftingPatterns ?? []))],
            };
          })
          .filter(Boolean);
    upsertStage(
      run,
      stage(
        "INTERPRET",
        interpretDocs.length ? "OK" : "FAILED",
        "Retained source-backed narrative interpretations alongside structured items",
        { interpreted: interpretDocs.length },
      ),
    );
    saveRun(run);
  }

  if (!(resume && stageDone(run, "COMPILE"))) {
    const compileNotes: string[] = [];
    for (const row of sourceRows) {
      const summary = row.summary ?? summarizeFromStoredMetadata(row.metadata);
      if (!summary) continue;
      const basketLines = summary.items.flatMap((i) => i.materialBasketsThresholds ?? []);
      compileNotes.push(
        `${row.sourceId}: ${basketLines.length} basket/threshold lines; formulas remain conditional without executable Permission + financials`,
      );
    }
    upsertStage(
      run,
      stage("COMPILE", compileNotes.length ? "CONDITIONAL" : "FAILED", "Compiled reusable contractual model fragments (conditional capacity)", {
        notes: compileNotes.slice(0, 40),
      }),
    );
    saveRun(run);
  }

  // --- EXERCISE ---
  const exercises = resolveExercises({
    ids: opts.exerciseIds,
    verticalSliceOnly: opts.verticalSlice,
  }).slice(0, opts.exerciseLimit ?? (opts.verticalSlice ? 1 : EXERCISE_LIBRARY.length));

  if (!(resume && stageDone(run, "EXERCISE"))) {
    const results: ExerciseExecutionResult[] = [];
    for (const row of sourceRows) {
      const ctx = row.summary
        ? buildContextFromSummary({
            sourceId: row.sourceId,
            summary: row.summary,
            hasFinancialSnapshot: false,
          })
        : buildContextFromMetadata({
            sourceId: row.sourceId,
            metadata: row.metadata,
            hasFinancialSnapshot: false,
          });
      if (!ctx) continue;
      for (const exercise of exercises) {
        results.push(executeExerciseOnSource({ exercise, ctx, runId: run.runId }));
      }
    }
    run.exerciseResults = results;
    upsertStage(
      run,
      stage("EXERCISE", results.length ? "OK" : "FAILED", `Executed ${results.length} exercise(s)`, {
        byOutcome: {
          SUBSTANTIVE: results.filter((r) => r.outcome === "SUBSTANTIVE").length,
          CONDITIONAL: results.filter((r) => r.outcome === "CONDITIONAL").length,
          UNSUPPORTED: results.filter((r) => r.outcome === "UNSUPPORTED").length,
          FAILED: results.filter((r) => r.outcome === "FAILED").length,
        },
      }),
    );
    saveRun(run);
  }

  // --- DIAGNOSE ---
  if (!(resume && stageDone(run, "DIAGNOSE"))) {
    run.gaps = run.exerciseResults.flatMap((r) => r.gaps);
    upsertStage(
      run,
      stage("DIAGNOSE", "OK", `Recorded ${run.gaps.length} gap(s)`, {
        histogram: gapHistogram(run.gaps),
      }),
    );
    saveRun(run);
  }

  // --- IMPROVE (knowledge library + engineering queue; no untrusted code mutation) ---
  if (!(resume && stageDone(run, "IMPROVE"))) {
    let patterns = loadPatterns();
    const captured: string[] = [];
    for (const result of run.exerciseResults) {
      for (const pid of detectPatternsFromResult(result)) {
        patterns = mergePatternObservation({
          patterns,
          patternId: pid,
          sourceId: result.sourceId,
          exerciseId: result.exerciseId,
        });
        captured.push(pid);
      }
      for (const g of result.gaps) {
        if (g.origin === "SOFTWARE" && g.category === "BASKET_NOT_EXTRACTED") {
          patterns = mergePatternObservation({
            patterns,
            patternId: "greater-of-basket",
            sourceId: result.sourceId,
            exerciseId: result.exerciseId,
            failure: g.category,
          });
        }
      }
    }
    savePatterns(patterns);
    run.patternsCaptured = [...new Set(captured)];
    run.engineeringTasks = upsertEngineeringTasks({
      gaps: run.gaps,
      results: run.exerciseResults,
      customerImportantExerciseIds: ["debt.secured.100", "rp.dividend.50", "multi.secured_acq"],
    });
    upsertStage(
      run,
      stage("IMPROVE", "OK", `Captured ${run.patternsCaptured.length} pattern obs; ${run.engineeringTasks.filter((t) => t.status === "OPEN").length} open eng tasks`, {
        patternsCaptured: run.patternsCaptured,
        openTasks: run.engineeringTasks.filter((t) => t.status === "OPEN").slice(0, 10),
      }),
    );
    saveRun(run);
  }

  // --- REEXERCISE (targeted regression after improve signal) ---
  if (!(resume && stageDone(run, "REEXERCISE"))) {
    const reexerciseIds = new Set<string>();
    for (const t of run.engineeringTasks.filter((x) => x.status === "OPEN").slice(0, 5)) {
      for (const e of t.affectedExerciseIds) reexerciseIds.add(e);
    }
    if (opts.verticalSlice) reexerciseIds.add("debt.secured.100");
    if (opts.reexerciseOnImprove === false) reexerciseIds.clear();

    const priorByKey = new Map(
      run.exerciseResults.map((r) => [`${r.sourceId}|${r.exerciseId}`, r]),
    );
    const regressions: Array<{
      key: string;
      prior: string;
      next: string;
      citationDelta: number;
    }> = [];

    if (reexerciseIds.size) {
      const toRun = exercises.filter((e) => reexerciseIds.has(e.exerciseId));
      for (const row of sourceRows) {
        const ctx = row.summary
          ? buildContextFromSummary({
              sourceId: row.sourceId,
              summary: row.summary,
              hasFinancialSnapshot: false,
            })
          : buildContextFromMetadata({
              sourceId: row.sourceId,
              metadata: row.metadata,
              hasFinancialSnapshot: false,
            });
        if (!ctx) continue;
        for (const exercise of toRun) {
          const next = executeExerciseOnSource({ exercise, ctx, runId: run.runId });
          const key = `${row.sourceId}|${exercise.exerciseId}`;
          const prior = priorByKey.get(key);
          if (prior) {
            regressions.push({
              key,
              prior: prior.outcome,
              next: next.outcome,
              citationDelta: next.citations.length - prior.citations.length,
            });
            // Replace prior result with reexercise
            run.exerciseResults = run.exerciseResults.map((r) =>
              r.sourceId === next.sourceId && r.exerciseId === next.exerciseId ? next : r,
            );
          } else {
            run.exerciseResults.push(next);
          }
        }
      }
      run.gaps = run.exerciseResults.flatMap((r) => r.gaps);
    }

    upsertStage(
      run,
      stage(
        "REEXERCISE",
        reexerciseIds.size ? "OK" : "SKIPPED",
        reexerciseIds.size
          ? `Reexecuted ${reexerciseIds.size} exercise type(s); ${regressions.length} comparisons`
          : "No reexercise targets",
        { reexerciseIds: [...reexerciseIds], regressions: regressions.slice(0, 40) },
      ),
    );
    saveRun(run);
  }

  // --- PUBLISH ---
  if (!(resume && stageDone(run, "PUBLISH"))) {
    const results = run.exerciseResults;
    run.publishSummary = {
      documentsProcessed: run.sourceIds.length,
      exerciseTypes: new Set(results.map((r) => r.exerciseId)).size,
      executions: results.length,
      substantive: results.filter((r) => r.outcome === "SUBSTANTIVE").length,
      conditional: results.filter((r) => r.outcome === "CONDITIONAL").length,
      unsupported: results.filter((r) => r.outcome === "UNSUPPORTED").length,
      failed: results.filter((r) => r.outcome === "FAILED").length,
      gapHistogram: gapHistogram(run.gaps),
    };

    const publishCompanyId = opts.publishCompanyId ?? opts.companyId ?? "research-corpus";
    const overlay: DashboardExerciseOverlay = {
      companyId: publishCompanyId,
      updatedAt: new Date().toISOString(),
      runId: run.runId,
      transactions: results
        .filter((r, i, arr) => arr.findIndex((x) => x.exerciseId === r.exerciseId) === i)
        .slice(0, 24)
        .map((r, idx) => {
          const def = exercises.find((e) => e.exerciseId === r.exerciseId);
          return {
            metricId: `txn:exercise:${r.exerciseId}`,
            exerciseId: r.exerciseId,
            scenario: def?.title ?? r.exerciseId,
            summary:
              r.outcome === "CONDITIONAL"
                ? `${r.headline} — conditional capacity. ${r.missingInputs.length ? `Missing inputs: ${r.missingInputs.join(", ")}.` : ""} Matched ${r.itemCountMatched} provision(s).`
                : `${r.headline} — ${r.outcome}. Matched ${r.itemCountMatched} provision(s).`,
            status:
              r.outcome === "CONDITIONAL"
                ? r.missingInputs.length
                  ? "MISSING_FINANCIALS"
                  : "CONDITIONAL"
                : r.outcome === "SUBSTANTIVE"
                  ? "AI_SURFACED"
                  : r.outcome === "UNSUPPORTED"
                    ? "MISSING_RULEBOOK"
                    : "AI_SURFACED",
            askHref: `/${publishCompanyId}/ask?q=${encodeURIComponent(def?.question ?? r.exerciseId)}`,
            outcome: r.outcome,
            missingInputs: r.missingInputs,
            citations: r.citations.slice(0, 6),
            analysis: r.analysis.slice(0, 4000),
            gaps: r.gaps.map((g) => g.category),
          };
        }),
    };
    saveDashboardOverlay(overlay);
    updatePublishIndex({
      runId: run.runId,
      at: new Date().toISOString(),
      documentsProcessed: run.publishSummary.documentsProcessed,
      executions: run.publishSummary.executions,
      substantive: run.publishSummary.substantive + run.publishSummary.conditional,
    });

    upsertStage(
      run,
      stage("PUBLISH", "OK", `Published overlay for ${publishCompanyId}`, {
        publishSummary: run.publishSummary,
        overlayTransactions: overlay.transactions.length,
      }),
    );
    saveRun(run);
  }

  return run;
}

/** Vertical-slice helper: secured $100M on preferred authentic docs (Neon, else CONMED fixture). */
export async function runVerticalSlice(opts: Omit<OrchestratorOptions, "verticalSlice"> = {}): Promise<LoopRunRecord> {
  return runCovenantIntelligenceLoop({
    ...opts,
    verticalSlice: true,
    preferIssuer: opts.preferIssuer ?? ["CONMED", "CNMD", "RIOT"],
    documentLimit: opts.documentLimit ?? 3,
    reexerciseOnImprove: true,
    // Explicit fixture only when requested; otherwise Neon first with fixture fallback in INGEST.
    useConmedFixture: opts.useConmedFixture === true ? true : opts.useConmedFixture === false ? false : undefined,
  });
}

export type { ExerciseDefinition };
