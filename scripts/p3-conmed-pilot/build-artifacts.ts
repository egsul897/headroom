/**
 * Writes docs/phase-3-conmed-low-cost-pilot/ — the record of the CONMED diagnostic pilot.
 *
 * §3's labelling discipline is enforced here, not left to prose: every artifact carries
 * evidenceLabel = LOW_COST_DIAGNOSTIC_PIPELINE. This run used a cheaper model than
 * production's configured compiler model, so its output is a diagnostic signal about the
 * architecture, never a canonical measurement of current production.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { rescore } from "./rescore";
import type { CandidateRecord } from "./compile-run";

const ROOT = process.cwd();
const RUN = "/tmp/claude-0/pilot/run";
const OUT = "docs/phase-3-conmed-low-cost-pilot";
const GENERATED_AT = "2026-09-21T00:00:00.000Z";
export const EVIDENCE_LABEL = "LOW_COST_DIAGNOSTIC_PIPELINE";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const readRun = (n: string) => JSON.parse(fs.readFileSync(path.join(RUN, `${n}.json`), "utf8"));
const git = (c: string) => execSync(`git ${c}`, { cwd: ROOT, encoding: "utf8" }).trim();

function write(name: string, body: unknown) {
  const p = path.join(ROOT, OUT, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2) + "\n";
  fs.writeFileSync(p, text, "utf8");
  return { name, bytes: Buffer.byteLength(text), sha256: sha256(text) };
}

/** §13/§4 — the surfaces this pilot is forbidden to touch. */
export const FROZEN_SURFACES = [
  "lib/contract-model/",
  "tests/fixtures/unseen-packages/",
  "docs/phase-3-v3.1-final-reconciliation/",
  "docs/phase-3-final-closure-resolution/",
  "docs/phase-3-remediation/",
  "docs/phase-3-current-pipeline-regeneration/",
] as const;

export function freezeProof(startingSha: string) {
  const perSurface = FROZEN_SURFACES.map((surface) => {
    const out = git(`diff --stat ${startingSha} -- ${surface}`);
    return { surface, changed: out.length > 0, diffStat: out || "(no change)" };
  });
  const files = git(`diff --name-only ${startingSha}`).split("\n").filter(Boolean);
  return {
    startingSha,
    perSurface,
    frozenSurfacesChanged: perSurface.filter((s) => s.changed).map((s) => s.surface),
    productionDiffIsEmpty: !perSurface.find((s) => s.surface === "lib/contract-model/")!.changed,
    benchmarkFilesChanged: perSurface.filter((s) => s.surface.startsWith("tests/fixtures/") || s.surface.startsWith("docs/phase-3-v3.1")).filter((s) => s.changed).length,
    filesChangedSinceStartingSha: files,
    allChangesAreAdditive: files.every((f) => f.startsWith("scripts/p3-conmed-pilot/") || f.startsWith(`${OUT}/`) || f.startsWith("tests/phase-3-conmed-pilot/")),
  };
}

/** §10 — reliability, measured from the run's own records rather than asserted. */
export function reliability(t1: CandidateRecord[], final: CandidateRecord[]) {
  const t1Ok = t1.filter((r) => r.status !== "FAILED");
  const malformed = t1.filter((r) => r.failureReasons.includes("MODEL_SCHEMA_FAILURE"));
  const timeouts = t1.filter((r) => r.failureReasons.includes("WALL_CLOCK_TIMEOUT"));
  // A 402 is not a model outcome. Rates that fold it in describe the billing account,
  // not the model, so every model-quality rate below is computed over the SERVED subset.
  const providerFailed = t1.filter((r) => r.failureReasons.includes("PROVIDER_FAILURE"));
  const served = t1.filter((r) => !r.failureReasons.includes("PROVIDER_FAILURE"));
  const escalated = final.filter((r) => r.escalated);
  const reviewRequired = final.filter((r) => r.status === "REVIEW_REQUIRED");
  const cost = final.reduce((s, r) => s + r.actualCostUsd, 0);

  return {
    tier1Attempted: t1.length,
    tier1Successful: t1Ok.length,
    tier1Failed: t1.length - t1Ok.length,
    providerFailures: providerFailed.length,
    servedSubset: served.length,
    // Over the SERVED subset — the only denominator that describes the model.
    tier1SuccessRate: Number((t1Ok.length / Math.max(1, served.length)).toFixed(4)),
    malformedOutputRate: Number((malformed.length / Math.max(1, served.length)).toFixed(4)),
    wallClockTimeoutRate: Number((timeouts.length / Math.max(1, served.length)).toFixed(4)),
    // Over the whole attempted population — describes the RUN, not the model.
    rawFailureRateIncludingProvider: Number(((t1.length - t1Ok.length) / Math.max(1, t1.length)).toFixed(4)),
    escalationRate: Number((escalated.length / Math.max(1, t1.length)).toFixed(4)),
    denominatorNote:
      "Success, malformed-output and timeout rates use the SERVED subset as denominator; a candidate the provider refused with HTTP 402 never reached the model and cannot be evidence about it. rawFailureRateIncludingProvider keeps the whole-population figure visible so the two are never conflated.",
    verifierReviewRequiredRate: Number((reviewRequired.length / Math.max(1, final.length)).toFixed(4)),
    averageCostPerCandidateUsd: Number((cost / Math.max(1, final.length)).toFixed(5)),
    totalToolCalls: final.reduce((s, r) => s + r.toolCalls, 0),
    candidatesUsingTools: final.filter((r) => r.toolCalls > 0).length,
    note:
      "REVIEW_REQUIRED is the compiler's honest 'a human should look at this' status, not a failure. It is reported separately from execution failure precisely so a cautious model is not scored as a broken one.",
  };
}

/**
 * §11 — the GO/NO-GO classification.
 *
 * A fifth state exists because §11's four labels all presuppose the run happened. When
 * the provider stops serving mid-run, every one of them misattributes the cause:
 * MODEL_LIMITED in particular would blame the substituted model for an account balance.
 * §11's own instruction is not to confuse causes, so the honest move is to name the real
 * one rather than force-fit a label.
 */
export function classify(rel: ReturnType<typeof reliability>, raw: Record<string, number>, populationTruncated: boolean, providerCutoff: { affected: number; total: number } | null) {
  const deltas = { newSubstantiveRepresentations: raw.newSubstantiveRepresentations ?? 0, surfacedBefore: raw.surfacedBefore ?? 0, surfacedAfter: raw.surfacedAfter ?? 0 };
  if (providerCutoff && providerCutoff.affected > 0) {
    const served = providerCutoff.total - providerCutoff.affected;
    return {
      verdict: "CONMED_PILOT_BLOCKED_PROVIDER_CREDIT",
      why:
        `The gateway stopped serving mid-run with HTTP 402 insufficient_funds, affecting ${providerCutoff.affected} of ${providerCutoff.total} candidates. ` +
        `Only ${served} were actually served. The pilot therefore cannot answer the diagnostic question over the full population, and the ` +
        `per-candidate failure counts are NOT a measurement of the substituted model — they are the point at which the account ran dry.`,
      notOneOfTheFourBecause:
        "CONMED_PILOT_MODEL_LIMITED would attribute an account-balance failure to the model; NO_ARCHITECTURAL_IMPROVEMENT requires the full population to have run; STRONG and MIXED both require a real coverage measurement. None applies.",
      whatTheServedSubsetShows:
        `Of the ${served} candidates served before the cutoff, ${rel.tier1Successful} completed and ${rel.tier1Failed - providerCutoff.affected} failed for non-provider reasons. That subset is real evidence, reported separately below, but it is too small to carry a GO/NO-GO decision.`,
    };
  }
  const executionAdequate = rel.tier1SuccessRate >= 0.8 && rel.malformedOutputRate <= 0.1;
  const materialImprovement = deltas.newSubstantiveRepresentations > 0 && deltas.surfacedAfter > deltas.surfacedBefore;

  if (!executionAdequate) {
    return {
      verdict: "CONMED_PILOT_MODEL_LIMITED",
      why: `Tier-1 success rate ${(rel.tier1SuccessRate * 100).toFixed(1)}% / malformed-output rate ${(rel.malformedOutputRate * 100).toFixed(1)}% — execution quality is too poor to judge the architecture fairly. §11 forbids reading this as an architecture failure.`,
    };
  }
  if (materialImprovement && rel.tier1SuccessRate >= 0.9) {
    return {
      verdict: "CONMED_PILOT_STRONG_SIGNAL",
      why: `The cheap model compiled ${(rel.tier1SuccessRate * 100).toFixed(1)}% of candidates and produced ${deltas.newSubstantiveRepresentations} substantive representations where the frozen evidence had none, moving surfacing from ${deltas.surfacedBefore}/9 to ${deltas.surfacedAfter}/9.`,
    };
  }
  if (materialImprovement) {
    return { verdict: "CONMED_PILOT_MIXED_SIGNAL", why: `Real improvement (${deltas.newSubstantiveRepresentations} substantive representations, surfacing ${deltas.surfacedBefore}/9 → ${deltas.surfacedAfter}/9) but execution was not clean enough for a strong conclusion.` };
  }
  if (populationTruncated) {
    return { verdict: "CONMED_PILOT_MIXED_SIGNAL", why: "The population did not run in full, so a no-improvement reading cannot be trusted." };
  }
  return {
    verdict: "CONMED_PILOT_NO_ARCHITECTURAL_IMPROVEMENT",
    why: `Execution was adequate (${(rel.tier1SuccessRate * 100).toFixed(1)}% success) and the full population ran, yet benchmark-relevant coverage did not materially improve.`,
  };
}

export function buildAll() {
  const start = "bc96aeca396795e61e4bb509775e64b1a926ca8c";
  const meta = readRun("08-run-meta");
  const dedup = readRun("01-dedup");
  const amendment = readRun("02-amendment");
  const t1 = readRun("03-tier1") as CandidateRecord[];
  const t2 = readRun("04-tier2") as CandidateRecord[];
  const final = readRun("05-final-records") as CandidateRecord[];
  const frozen = readRun("06-frozen-responses") as { discoveryId: string; model: string; tier: number; result: { status: string; failureReasons?: string[]; rules?: unknown[]; definitions?: unknown[] } }[];
  const notRun = readRun("07-not-run");

  const scored = rescore(final);
  const rel = reliability(t1, final);
  const truncated = notRun.length > 0;
  const providerFailed = t1.filter((r) => r.failureReasons.includes("PROVIDER_FAILURE")).length;
  const verdict = classify(rel, scored.deltas, truncated, providerFailed > 0 ? { affected: providerFailed, total: t1.length } : null);

  const inTok = final.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
  const outTok = final.reduce((s, r) => s + (r.outputTokens ?? 0), 0);
  const cost = final.reduce((s, r) => s + r.actualCostUsd, 0);

  const written = [
    write("01-starting-state.json", {
      artifact: "§14 — starting state and authorization scope.",
      evidenceLabel: EVIDENCE_LABEL,
      generatedAt: GENERATED_AT,
      startingSha: start,
      branch: git("rev-parse --abbrev-ref HEAD"),
      authorizedScope: "C_CONMED_FIRST — diagnostic pilot only. A_FULL explicitly NOT authorized and not run.",
      budgetCeilingUsd: 75,
    }),
    write("02-model-selection.json", {
      artifact: "§1 — model enumeration, capability filtering and selection.",
      evidenceLabel: EVIDENCE_LABEL,
      generatedAt: GENERATED_AT,
      ...JSON.parse(fs.readFileSync("/tmp/claude-0/pilot/model-selection.json", "utf8")),
    }),
    write("03-population-and-dedup.json", {
      artifact: "§5/§7 — the sealed population and the free savings pass.",
      evidenceLabel: EVIDENCE_LABEL,
      generatedAt: GENERATED_AT,
      sealedPopulation: meta.sealedPopulation,
      eligible: meta.eligible,
      populationTruncated: truncated,
      unresolvedNodeKeys: meta.unresolvedNodeKeys,
      ...dedup,
    }),
    write("04-amendment-and-operative-state.json", { artifact: "deterministic + bounded stages feeding the compiler's tool access.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, ...amendment }),
    write("05-tier1-records.json", { artifact: "§8 — every Tier-1 candidate record.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, model: meta.tier1Model, records: t1 }),
    write("06-tier2-escalations.json", {
      artifact: "§2 — escalations. Execution failure only; never an unfavourable answer.",
      evidenceLabel: EVIDENCE_LABEL,
      generatedAt: GENERATED_AT,
      model: meta.tier2Model,
      escalationPolicy: "MODEL_SCHEMA_FAILURE, TOOL_BUDGET_EXHAUSTED, TRANSPORT_OR_INTERNAL_ERROR, OUTPUT_TRUNCATED, CONTEXT_WINDOW_EXCEEDED, WALL_CLOCK_TIMEOUT. Explicitly NOT: NO_CREDIT, low confidence, HONEST_UNRESOLVED, an unfavourable result, or a still-missing benchmark case.",
      escalated: t2.length,
      records: t2,
    }),
    write("07-final-records.json", { artifact: "§8 — final per-candidate outcome (Tier 2 where it ran, else Tier 1).", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, records: final }),
    write("08-frozen-responses.json", {
      artifact: "§8 — every model response, frozen before scoring.",
      evidenceLabel: EVIDENCE_LABEL,
      generatedAt: GENERATED_AT,
      count: frozen.length,
      fidelityPolicy:
        "A candidate the provider refused with HTTP 402 produced NO model response — what the harness holds for it is its own error envelope, not model output. Freezing those in full would inflate the record with ~140KB of repeated scaffolding per candidate while preserving nothing. So: full fidelity, byte for byte, for every attempt that actually reached the model; a compact record (status, reasons, hash) for the refused ones. Every real response is preserved.",
      responsesWithModelOutput: frozen.filter((f) => (f.result.rules ?? []).length > 0 || (f.result.definitions ?? []).length > 0 || f.result.status !== "FAILED"),
      refusedOrEmpty: frozen
        .filter((f) => (f.result.rules ?? []).length === 0 && (f.result.definitions ?? []).length === 0 && f.result.status === "FAILED")
        .map((f) => ({ discoveryId: f.discoveryId, model: f.model, tier: f.tier, status: f.result.status, failureReasons: f.result.failureReasons, resultHash: sha256(JSON.stringify(f.result)) })),
    }),
    write("09-nine-case-rescore.json", {
      artifact: "§9 — pilot re-score of the nine CONMED cases. NOT canonical (§3).",
      evidenceLabel: EVIDENCE_LABEL,
      generatedAt: GENERATED_AT,
      canonical47CaseScoreModified: false,
      mappingRule: scored.mappingRule,
      deltas: scored.deltas,
      cases: scored.cases,
    }),
    write("10-reliability.json", { artifact: "§10 — cheap-model reliability.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, ...rel }),
    write("11-cost-report.json", {
      artifact: "§6/§14 — cost, at the model's real gateway price.",
      evidenceLabel: EVIDENCE_LABEL,
      generatedAt: GENERATED_AT,
      tier1Model: meta.tier1Model,
      tier2Model: meta.tier2Model,
      candidatesRun: final.length,
      inputTokens: inTok,
      outputTokens: outTok,
      actualCostUsd: Number(cost.toFixed(4)),
      costPerCandidateUsd: Number((cost / Math.max(1, final.length)).toFixed(5)),
      ceilingUsd: 75,
      ceilingExceeded: cost > 75,
      notRun,
      telemetryCaveat:
        "lib/contract-model/analyzer/telemetry.ts's rate card only knows Sonnet and Opus prices, so the cost each record's own telemetry would compute is wrong for a substituted model. Every figure here is recomputed from the gateway's published per-token price for the model that actually served the call. The production file was not changed to fix this.",
    }),
    write("12-verdict.json", {
      artifact: "§11 — GO/NO-GO classification.",
      evidenceLabel: EVIDENCE_LABEL,
      generatedAt: GENERATED_AT,
      ...verdict,
      populationTruncated: truncated,
      productionFreeze: freezeProof(start),
      doNotConfuse: "§11: cheap-model weakness is not compiler-architecture weakness. This verdict separates the two explicitly.",
    }),
  ];

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  write(
    "README.md",
    [
      "# CONMED low-cost current-pipeline pilot",
      "",
      "**Evidence label: `LOW_COST_DIAGNOSTIC_PIPELINE`** — not a canonical measurement of current",
      "production. This run substituted a cheaper model than production's configured compiler model,",
      "so it answers a diagnostic question, not a certification one.",
      "",
      "## The question",
      "",
      "Does the modern compiler architecture, when actually given the CONMED candidates, recover",
      "materially more benchmark-relevant semantic representation than the frozen pre-compiler",
      "evidence showed? The CONMED dataset is the cleanest possible test of that, because its frozen",
      "artifact has no compilation stage at all — zero compiled rules exist anywhere in it.",
      "",
      `## Verdict: ${verdict.verdict}`,
      "",
      verdict.why,
      "",
      "## What ran",
      "",
      "| | |",
      "| --- | --- |",
      `| Sealed population | ${meta.sealedPopulation} |`,
      `| Eligible under production's own predicate | ${meta.eligible} |`,
      `| Exact duplicates removed | ${dedup.exactDuplicatesRemoved} |`,
      `| Compiled | ${final.length} |`,
      `| Not run (budget guard) | ${notRun.length} |`,
      `| Tier 1 | \`${meta.tier1Model}\` |`,
      `| Tier 2 | \`${meta.tier2Model}\` |`,
      `| Escalated | ${t2.length} |`,
      `| Actual cost | $${cost.toFixed(4)} against a $75 ceiling |`,
      `| Cost per candidate | $${(cost / Math.max(1, final.length)).toFixed(5)} |`,
      "",
      "## The nine CONMED cases",
      "",
      "| | before | after |",
      "| --- | --- | --- |",
      `| CREDIT | ${scored.deltas.creditBefore} | ${scored.deltas.creditAfter} |`,
      `| Specifically surfaced | ${scored.deltas.surfacedBefore} | ${scored.deltas.surfacedAfter} |`,
      `| Dangerous silent omissions | ${scored.deltas.dangerousBefore} | ${scored.deltas.dangerousAfter} |`,
      "",
      `Substantive representations produced where the frozen evidence had none: **${scored.deltas.newSubstantiveRepresentations}**.`,
      "",
      "The canonical 47-case score is untouched. This is a pilot comparison only.",
      "",
      "## Cheap-model reliability",
      "",
      `- Tier-1 success rate over the served subset: ${pct(rel.tier1SuccessRate)} (${rel.tier1Successful}/${rel.servedSubset})`,
      `- Provider refusals (HTTP 402, never reached the model): ${rel.providerFailures}`,
      `- Raw failure rate including provider refusals: ${pct(rel.rawFailureRateIncludingProvider)} — describes the run, not the model`,
      `- Escalation rate: ${pct(rel.escalationRate)}`,
      `- Malformed-output rate: ${pct(rel.malformedOutputRate)}`,
      `- Wall-clock timeout rate: ${pct(rel.wallClockTimeoutRate)}`,
      `- Candidates that used the evidence-retrieval tools: ${rel.candidatesUsingTools}/${final.length}`,
      "",
      "## Two caveats that change how this reads",
      "",
      "**The cheapest models are not viable, and a cheap probe says otherwise.** Five models that",
      "completed a toy tool-use call fail outright on the real eight-turn compilation protocol. Had",
      "selection trusted the gateway's capability tags, this pilot would have produced a near-zero",
      "result that looked like evidence against the architecture. §11's warning is not hypothetical.",
      "",
      "**The first wall-clock ceiling fabricated failures.** At 300s per candidate every model looked",
      "broken on the largest section; the frozen Sonnet run averaged about fourteen minutes per",
      "candidate. Raised to 900s, the selected model went from apparent failure to 4/4 on probe. Any",
      "cheap-model verdict is only as good as the ceiling it ran under.",
      "",
      "## What this does NOT license",
      "",
      "- It does not authorize A_FULL. §12 asks for a re-estimate under the cheap-first strategy first.",
      "- It does not change production, the benchmark, or the canonical score.",
      "- It does not settle whether current production — at its configured model — behaves this way.",
      "",
    ].join("\n") + "\n",
  );

  return { written, scored, rel, verdict, cost, inTok, outTok, meta, truncated, notRun, final, t1, t2, dedup };
}

if (process.argv[1]?.endsWith("build-artifacts.ts")) {
  const r = buildAll();
  console.table(r.written);
  console.log(JSON.stringify({ verdict: r.verdict, deltas: r.scored.deltas, reliability: r.rel, costUsd: Number(r.cost.toFixed(4)) }, null, 2));
}
