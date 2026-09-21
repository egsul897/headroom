/**
 * §1 — the deterministic execution plan that must exist before any paid model call.
 *
 * Population sizing is benchmark-blind: each dataset contributes a natural structural
 * slice (the Article family the benchmark's claims live in), never a hand-picked list
 * of candidates chosen because they correspond to benchmark failures. The selection
 * rule is stated below and is the only rule applied.
 */
import { P, readJson } from "./evidence-provenance";

/**
 * SELECTION RULE (benchmark-blind, §3):
 *   For each package, take every candidate the frozen discovery stage already produced
 *   whose normalized source ref falls in an Article that the package's own covenant
 *   architecture places its negative covenants and guaranty in, and which is eligible
 *   under the unchanged production predicate (role !== REPRESENTATION).
 *
 * No caseId, no benchmark address list and no expected answer takes part in selection.
 * Article numbers differ per agreement and are read from the agreement's own structure,
 * not from the benchmark.
 */
export const ARTICLE_FAMILIES: Record<string, { articles: string[]; rationale: string }> = {
  dsgr: {
    articles: ["1", "6", "10"],
    rationale:
      "DSGR's negative covenants are Article VI and its guaranty is Article X; Article I carries the defined terms those covenants depend on. The benchmark happens to draw from all three, but the slice is the agreement's own structure.",
  },
  conmed: { articles: ["7"], rationale: "CONMED's Eighth A&R places its negative covenants in Article VII." },
  lsb: { articles: ["6"], rationale: "LSB's ABL agreement places its negative covenants in Article VI." },
  fwrg: { articles: ["6"], rationale: "FWRG's 2021 agreement places its negative covenants in Article VI." },
};

function articleOf(ref: unknown): string {
  const m = /^(\d+)\./.exec(String(ref ?? ""));
  return m ? m[1]! : String(ref ?? "").split(".")[0] || "?";
}

function eligible(candidates: any[]): any[] {
  return candidates.filter((c) => c.role !== "REPRESENTATION");
}

export function population() {
  const dsgr = eligible(readJson(P.dsgrStage2) as any[]).filter(
    (c) => ["doc-a", "doc-b", "doc-d"].includes(c.documentId) && ARTICLE_FAMILIES.dsgr!.articles.includes(articleOf(c.normalizedSourceRef)),
  );
  const conmedRaw = readJson(P.conmedStage2);
  const conmed = eligible((conmedRaw.candidates ?? conmedRaw) as any[]).filter((c) => ARTICLE_FAMILIES.conmed!.articles.includes(articleOf(c.normalizedSourceRef)));
  const lsb = eligible((readJson(P.lsbDiscovery).candidates ?? []) as any[]).filter((c) => ARTICLE_FAMILIES.lsb!.articles.includes(articleOf(c.normalizedSourceRef)));
  const fwrg = eligible((readJson(P.fwrgDiscovery).candidates ?? []) as any[]).filter((c) => ARTICLE_FAMILIES.fwrg!.articles.includes(articleOf(c.normalizedSourceRef)));

  const byDocument = (rows: any[]) =>
    rows.reduce((a: Record<string, number>, c) => {
      a[c.documentId ?? "(single-document package)"] = (a[c.documentId ?? "(single-document package)"] ?? 0) + 1;
      return a;
    }, {});
  const bySection = (rows: any[]) => {
    const t = rows.reduce((a: Record<string, number>, c) => {
      const s = String(c.normalizedSourceRef ?? "").split("(")[0]!;
      a[s] = (a[s] ?? 0) + 1;
      return a;
    }, {});
    return Object.fromEntries(Object.entries(t).sort((x, y) => (y[1] as number) - (x[1] as number)));
  };

  return {
    dsgr: { count: dsgr.length, byDocument: byDocument(dsgr), bySection: bySection(dsgr) },
    conmed: { count: conmed.length, byDocument: byDocument(conmed), bySection: bySection(conmed) },
    lsb: { count: lsb.length, byDocument: byDocument(lsb), bySection: bySection(lsb) },
    fwrg: { count: fwrg.length, byDocument: byDocument(fwrg), bySection: bySection(fwrg) },
    total: dsgr.length + conmed.length + lsb.length + fwrg.length,
  };
}

/** Unit economics measured from the frozen DSGR run's own telemetry - not guessed. */
export function unitEconomics() {
  const s6 = readJson(P.dsgrStage6) as any[];
  const summary = readJson(P.dsgrSummary);
  let inTok = 0;
  let outTok = 0;
  let cost = 0;
  let attempts = 0;
  for (const e of s6) {
    const t = e.telemetry ?? {};
    inTok += t.inputTokens ?? 0;
    outTok += t.outputTokens ?? 0;
    cost += t.calculatedCostUsd ?? 0;
    attempts += t.attemptCount ?? 1;
  }
  const n = s6.length;
  return {
    measuredOn: `${n} real compilations in the frozen DSGR first-blind run`,
    compilationCostUsd: Number(cost.toFixed(4)),
    inputTokens: inTok,
    outputTokens: outTok,
    modelAttempts: attempts,
    attemptsPerCandidate: Number((attempts / n).toFixed(2)),
    perCandidate: {
      inputTokens: Math.round(inTok / n),
      outputTokens: Math.round(outTok / n),
      costUsd: Number((cost / n).toFixed(4)),
    },
    wholeRunCostUsd: summary.totalCostUsd,
    verificationCostUsd: Number((summary.totalCostUsd - cost).toFixed(4)),
    wallClockMsForThirty: summary.wallClockMs,
    wallClockMinutesPerCandidate: Number((summary.wallClockMs / 30 / 60000).toFixed(1)),
    caveat:
      "Measured under prompt v2. Current production runs prompt v5 with a different tool policy, so per-candidate cost may move in either direction. The figure is the only empirical anchor available and is used as the central estimate, with a +/-50% band reported.",
  };
}

export interface ScopeOption {
  id: string;
  label: string;
  datasets: string[];
  candidates: number;
  estimatedCostUsd: number;
  estimatedCostBandUsd: [number, number];
  estimatedWallClockHoursAtConcurrency4: number;
  answersQuestions: string[];
  verdictIfChosen: string;
}

export function scopeOptions(): ScopeOption[] {
  const pop = population();
  const econ = unitEconomics();
  const per = econ.perCandidate.costUsd;
  const minutes = econ.wallClockMinutesPerCandidate;
  const mk = (id: string, label: string, datasets: string[], candidates: number, answers: string[], verdict: string): ScopeOption => ({
    id,
    label,
    datasets,
    candidates,
    estimatedCostUsd: Number((candidates * per).toFixed(2)),
    estimatedCostBandUsd: [Number((candidates * per * 0.5).toFixed(2)), Number((candidates * per * 1.5).toFixed(2))],
    estimatedWallClockHoursAtConcurrency4: Number(((candidates * minutes) / 4 / 60).toFixed(1)),
    answersQuestions: answers,
    verdictIfChosen: verdict,
  });

  return [
    mk("A_FULL", "Every dataset's Article family — the only scope that can return a complete verdict", ["dsgr", "conmed", "lsb", "fwrg"], pop.total, ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"], "PHASE3_CURRENT_PIPELINE_EVIDENCE_REGENERATED"),
    mk("B_NEGATIVE_COVENANTS_ONLY", "Drop DSGR Articles I and X; negative-covenant articles only", ["dsgr(VI)", "conmed", "lsb", "fwrg"], pop.dsgr.byDocument ? pop.total - (pop.dsgr.count - dsgrArticleSix()) : pop.total, ["Q1", "Q2", "Q3", "Q4"], "PHASE3_CURRENT_PIPELINE_EVIDENCE_PARTIAL — 8 cases (7 DSGR Article I, 1 Article X) cannot be re-scored"),
    mk("C_CONMED_FIRST", "CONMED only — the dataset with no compilation evidence at all", ["conmed"], pop.conmed.count, ["Q2"], "PHASE3_CURRENT_PIPELINE_EVIDENCE_PARTIAL"),
    mk("D_LSB_FWRG_SMALL", "LSB + FWRG — the two smallest packages, answering Q3 and confirming Q4 end-to-end", ["lsb", "fwrg"], pop.lsb.count + pop.fwrg.count, ["Q3", "Q4 (end-to-end)"], "PHASE3_CURRENT_PIPELINE_EVIDENCE_PARTIAL"),
  ];
}

function dsgrArticleSix(): number {
  const rows = (readJson(P.dsgrStage2) as any[]).filter(
    (c) => c.role !== "REPRESENTATION" && ["doc-a", "doc-b", "doc-d"].includes(c.documentId) && articleOf(c.normalizedSourceRef) === "6",
  );
  return rows.length;
}

export function costPlan() {
  const pop = population();
  const econ = unitEconomics();
  return {
    selectionRule: ARTICLE_FAMILIES,
    selectionRuleIsBenchmarkBlind: true,
    selectionRuleProof:
      "population() reads only discovery artifacts and an Article number per package. It never reads the benchmark corpus, a caseId, a claim address or an expected answer.",
    population: pop,
    unitEconomics: econ,
    modelConfiguration: {
      provider: "vercel-ai-gateway",
      model: "anthropic/claude-sonnet-5",
      credentialLocation: "AI_GATEWAY_API_KEY in gitignored .env.local",
      credentialPresent: true,
      note: "Provider and model are read from the frozen run's own telemetry; the current getSemanticCaller() resolves the same gateway when the credential is present.",
    },
    expectedModelCalls: {
      compilationCandidates: pop.total,
      attemptsPerCandidateObserved: econ.attemptsPerCandidate,
      expectedModelCalls: Math.round(pop.total * econ.attemptsPerCandidate),
      verificationCalls: "one deterministic structural pass per compiled candidate (free) plus a bounded semantic review only where the deterministic layer escalates; the frozen run's semantic review was almost entirely skipped, costing $" + econ.verificationCostUsd,
    },
    batching: {
      canBatch: false,
      why: "compileCovenantToIR is a per-candidate tool-use loop with its own evidence retrieval; there is no batch endpoint in the existing caller and adding one would be a production change this mission forbids.",
      concurrency: "compilePackageToIR runs a bounded pool, default 4. That is the only parallelism available without touching production.",
    },
    cacheReuse: {
      anyResultReproducibleFromCache: false,
      why: `the semantic compilation cache key includes the compiler algorithm and prompt versions. The frozen evidence was produced under ${JSON.stringify(econ.measuredOn)} with prompt phase-3b1-semantic-compiler-prompt.v2; production now stamps semantic-accountability-compiler-prompt.v5, so every key misses.`,
      cachedCallsAvailable: 0,
    },
    deterministicStagesThatNeedNoModelCall: {
      before: ["structural index (frozen stage 1 reused)", "discovery candidates (frozen stage 2 reused — this mission does not regenerate discovery)", "eligibility filtering"],
      after: ["normalization", "IR type and sufficiency checks", "the deterministic structural verification pass", "accountingRole derivation", "V3.1.1 adjudication", "packet construction", "aggregate recomputation"],
      note: "Only semantic compilation, and any escalated semantic review, cost money.",
    },
    scopeOptions: scopeOptions(),
    ceilingPolicy: {
      requestedCeilingUsd: null,
      rule: "§1 forbids silently reusing the $30 cap and forbids a new cap that could bias coverage. A ceiling must be at or above the chosen option's upper band, or the mission is declared incomplete.",
      priorRunCeilingUsd: 30,
      priorRunActualUsd: econ.wholeRunCostUsd,
      whyThePriorCeilingIsTheProblem: "The $30 ceiling was never reached — the run stopped at COMPILE_CAP = 30 candidates for $9.34. The cap, not the budget, is what truncated coverage.",
    },
  };
}
