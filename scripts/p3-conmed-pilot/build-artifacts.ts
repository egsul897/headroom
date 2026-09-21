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
  const escalated = final.filter((r) => r.escalated);
  const reviewRequired = final.filter((r) => r.status === "REVIEW_REQUIRED");
  const cost = final.reduce((s, r) => s + r.actualCostUsd, 0);

  return {
    tier1Attempted: t1.length,
    tier1Successful: t1Ok.length,
    tier1Failed: t1.length - t1Ok.length,
    tier1SuccessRate: Number((t1Ok.length / Math.max(1, t1.length)).toFixed(4)),
    escalationRate: Number((escalated.length / Math.max(1, t1.length)).toFixed(4)),
    malformedOutputRate: Number((malformed.length / Math.max(1, t1.length)).toFixed(4)),
    wallClockTimeoutRate: Number((timeouts.length / Math.max(1, t1.length)).toFixed(4)),
    verifierReviewRequiredRate: Number((reviewRequired.length / Math.max(1, final.length)).toFixed(4)),
    averageCostPerCandidateUsd: Number((cost / Math.max(1, final.length)).toFixed(5)),
    totalToolCalls: final.reduce((s, r) => s + r.toolCalls, 0),
    candidatesUsingTools: final.filter((r) => r.toolCalls > 0).length,
    note:
      "REVIEW_REQUIRED is the compiler's honest 'a human should look at this' status, not a failure. It is reported separately from execution failure precisely so a cautious model is not scored as a broken one.",
  };
}

/** §11 — the GO/NO-GO classification, derived from measured rates and coverage. */
export function classify(rel: ReturnType<typeof reliability>, raw: Record<string, number>, populationTruncated: boolean) {
  const deltas = { newSubstantiveRepresentations: raw.newSubstantiveRepresentations ?? 0, surfacedBefore: raw.surfacedBefore ?? 0, surfacedAfter: raw.surfacedAfter ?? 0 };
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
  const frozen = readRun("06-frozen-responses");
  const notRun = readRun("07-not-run");

  const scored = rescore(final);
  const rel = reliability(t1, final);
  const truncated = notRun.length > 0;
  const verdict = classify(rel, scored.deltas, truncated);

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
    write("08-frozen-responses.json", { artifact: "§8 — every model response, frozen before scoring.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, count: frozen.length, responses: frozen }),
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

  return { written, scored, rel, verdict, cost, inTok, outTok, meta, truncated, notRun, final, t1, t2, dedup };
}

if (process.argv[1]?.endsWith("build-artifacts.ts")) {
  const r = buildAll();
  console.table(r.written);
  console.log(JSON.stringify({ verdict: r.verdict, deltas: r.scored.deltas, reliability: r.rel, costUsd: Number(r.cost.toFixed(4)) }, null, 2));
}
