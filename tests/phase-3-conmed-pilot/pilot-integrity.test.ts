/**
 * §13 — tests over the CONMED pilot's own integrity.
 *
 * The pilot spends real money and produces a number that will be used to decide whether
 * to spend much more. These tests check the things that would quietly corrupt that
 * decision: a truncated population, an escalation policy that shops for better answers,
 * a canonical score edited in place, a production file changed under cover of a
 * "methodological substitution".
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sealedPopulation, buildDeterministicStages, rehydrateNodeIds, operativeTextFor } from "../../scripts/p3-conmed-pilot/pipeline";
import { dedupExact } from "../../scripts/p3-conmed-pilot/dedup";
import { ESCALATION_TRIGGERS, shouldEscalate } from "../../scripts/p3-conmed-pilot/compile-run";
import { isAtOrBelow, rescore, CONMED_DOCUMENT_ID } from "../../scripts/p3-conmed-pilot/rescore";
import { isEligibleForSemanticCompilation } from "../../lib/contract-model/compiler/semantic/package-compile";

const ROOT = process.cwd();
const ART = "docs/phase-3-conmed-low-cost-pilot";
const src = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const art = (n: string) => JSON.parse(src(`${ART}/${n}`));
const artifactsExist = fs.existsSync(path.join(ROOT, ART, "12-verdict.json"));

describe("§5 — CONMED population completeness", () => {
  it("the sealed population is 163 candidates, verified independently of the mission text", () => {
    const pop = sealedPopulation();
    expect(pop.all).toHaveLength(163);
    expect(new Set(pop.all.map((c) => c.discoveryId)).size).toBe(163);
  });

  it("every candidate is CONMED Article VII, so the slice is the agreement's own structure", () => {
    const pop = sealedPopulation();
    expect(new Set(pop.all.map((c) => c.documentId))).toEqual(new Set([CONMED_DOCUMENT_ID]));
    expect(new Set(pop.all.map((c) => String(c.normalizedSourceRef).split(".")[0]))).toEqual(new Set(["7"]));
  });

  it("eligibility is decided by production's own predicate, not by the pilot", () => {
    const pop = sealedPopulation();
    for (const c of pop.all) {
      const expected = isEligibleForSemanticCompilation(c).eligible;
      expect(pop.eligible.includes(c)).toBe(expected);
    }
    expect(pop.eligible.length + pop.ineligible.length).toBe(163);
  });

  it("selection consults no caseId, claim address or expected answer", () => {
    const body = src("scripts/p3-conmed-pilot/pipeline.ts");
    for (const forbidden of ["CASE-", "correctedGroundTruthClaim", "dangerousSilentOmission", "claimSectionRef"]) {
      expect(body, `population code references ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("§5 — no cap, no truncation", () => {
  it("the pilot code declares no candidate cap", () => {
    for (const f of fs.readdirSync(path.join(ROOT, "scripts/p3-conmed-pilot"))) {
      const body = src(`scripts/p3-conmed-pilot/${f}`);
      expect(body, `${f} declares a compile cap`).not.toMatch(/COMPILE_CAP|MAX_CANDIDATES/);
    }
  });

  it("no .slice(0, N) shortens the population anywhere in the run path", () => {
    // Scoped to expressions applied to a candidate collection on purpose. A whole-file
    // scan matches `new Date().toISOString().slice(0, 10)` and reports a truncation that
    // does not exist — the same false positive that once made an earlier audit claim a
    // production cap where there was none.
    const runner = src("scripts/p3-conmed-pilot/run-pilot.ts");
    const populationNames = ["keep", "eligible", "rehydrated", "candidates", "pop.all", "pop.eligible", "escalate"];
    for (const name of populationNames) {
      expect(runner, `${name} is truncated in the run path`).not.toMatch(new RegExp(`\\b${name.replace(".", "\\.")}\\s*\\.\\s*(slice|splice)\\(`));
    }
    expect(runner, "the run path splices a collection").not.toMatch(/\.splice\(/);
  });

  it("the budget guard records what it skipped instead of trimming silently", () => {
    const runner = src("scripts/p3-conmed-pilot/run-pilot.ts");
    expect(runner).toContain("notRun.push");
    expect(runner).toMatch(/BUDGET_CEILING_USD = 75/);
  });
});

describe("§7 — deduplication is exactness, not similarity", () => {
  it("two candidates merge only when section ref AND source bytes are identical", () => {
    const stages = buildDeterministicStages();
    const { rehydrated } = rehydrateNodeIds(sealedPopulation().eligible, stages.index);
    const { keep, report } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));

    expect(keep.length + report.exactDuplicatesRemoved).toBe(rehydrated.length);
    for (const g of report.groups) {
      const members = rehydrated.filter((c) => [g.keptDiscoveryId, ...g.droppedDiscoveryIds].includes(c.discoveryId));
      const refs = new Set(members.map((c) => c.normalizedSourceRef));
      const texts = new Set(members.map((c) => operativeTextFor(c, stages.index)));
      expect(refs.size, "a dedup group spans more than one section ref").toBe(1);
      expect(texts.size, "a dedup group spans more than one source text").toBe(1);
    }
  });

  it("candidates with different source text are never merged", () => {
    const stages = buildDeterministicStages();
    const { rehydrated } = rehydrateNodeIds(sealedPopulation().eligible, stages.index);
    const { keep } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
    const texts = keep.map((c) => `${c.normalizedSourceRef}::${operativeTextFor(c, stages.index)}`);
    expect(new Set(texts).size).toBe(keep.length);
  });

  it("dedup is deterministic", () => {
    const stages = buildDeterministicStages();
    const { rehydrated } = rehydrateNodeIds(sealedPopulation().eligible, stages.index);
    const a = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
    const b = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
    expect(a.keep.map((c) => c.discoveryId)).toEqual(b.keep.map((c) => c.discoveryId));
  });
});

describe("§2 — escalation is execution failure, never answer shopping", () => {
  it("an honest abstention does not escalate", () => {
    const honest = { status: "COMPLETED", failureReasons: ["UNSUPPORTED_BY_SOURCE"], rules: [], definitions: [] } as never;
    expect(shouldEscalate(honest).escalate).toBe(false);
  });

  it("a REVIEW_REQUIRED result does not escalate", () => {
    const review = { status: "REVIEW_REQUIRED", failureReasons: ["SEMANTIC_INVENTORY_COVERAGE_GAP"], rules: [], definitions: [] } as never;
    expect(shouldEscalate(review).escalate).toBe(false);
  });

  it("a schema failure does escalate", () => {
    const broken = { status: "FAILED", failureReasons: ["MODEL_SCHEMA_FAILURE"], rules: [], definitions: [] } as never;
    const d = shouldEscalate(broken);
    expect(d.escalate).toBe(true);
    expect(d.reason).toBe("MODEL_SCHEMA_FAILURE");
  });

  it("the trigger set contains only execution failures", () => {
    for (const t of ESCALATION_TRIGGERS) {
      expect(t, `${t} is not an execution failure`).toMatch(/SCHEMA_FAILURE|BUDGET_EXHAUSTED|TRANSPORT_OR_INTERNAL_ERROR|TRUNCATED|CONTEXT_WINDOW/);
    }
    for (const forbidden of ["NO_CREDIT", "LOW_CONFIDENCE", "HONEST_UNRESOLVED", "UNSUPPORTED_BY_SOURCE", "UNFAVOURABLE"]) {
      expect(ESCALATION_TRIGGERS.has(forbidden), `${forbidden} must never trigger escalation`).toBe(false);
    }
  });
});

describe("§9 — the re-score mapping", () => {
  it("relevance is at-or-below the claim address, never an ancestor", () => {
    expect(isAtOrBelow("7.2(c)", "7.2")).toBe(true);
    expect(isAtOrBelow("7.2", "7.2")).toBe(true);
    expect(isAtOrBelow("7.2", "7.2(c)")).toBe(false);
    expect(isAtOrBelow("7.1", "7.1")).toBe(true);
  });

  it("a prefix that is not a structural descendant does not match", () => {
    // The trap: "7.10" starts with "7.1" as a string but is a different section.
    expect(isAtOrBelow("7.10", "7.1")).toBe(false);
    expect(isAtOrBelow("7.16", "7.1")).toBe(false);
    expect(isAtOrBelow("7.1(a)", "7.1")).toBe(true);
    expect(isAtOrBelow("7.1.2", "7.1")).toBe(true);
  });

  it("only COMPLETE credits — the enum has no value called SUFFICIENT", () => {
    // A real bug this test now guards: the first version of the mapping tested for a
    // sufficiency value that does not exist in RepresentationSufficiency, which would
    // have scored every case NO_CREDIT no matter what the compiler produced.
    const complete = [{ discoveryId: "d1", documentId: CONMED_DOCUMENT_ID, sourceSectionRef: "7.1", role: "BASKET", sourceTextHash: "h", sourceTextChars: 1, model: "m", tier: 1 as const, escalated: false, escalationReason: null, status: "REVIEW_REQUIRED", failureReasons: [], rules: 1, definitions: 0, sufficiencySummary: { COMPLETE: 1 }, toolCalls: 0, inputTokens: 1, outputTokens: 1, attemptCount: 1, actualCostUsd: 0, outputHash: "h", wallClockMs: 1 }];
    const c = rescore(complete).cases.find((x) => x.claimSectionRef === "7.1")!;
    expect(c.pilotCredit).toBe("CREDIT");
    expect(c.substantiveRepresentationNowExists).toBe(true);
  });

  it("PARTIAL surfaces the provision but does not credit it", () => {
    const partial = [{ discoveryId: "d1", documentId: CONMED_DOCUMENT_ID, sourceSectionRef: "7.1", role: "BASKET", sourceTextHash: "h", sourceTextChars: 1, model: "m", tier: 1 as const, escalated: false, escalationReason: null, status: "REVIEW_REQUIRED", failureReasons: [], rules: 1, definitions: 0, sufficiencySummary: { PARTIAL: 1 }, toolCalls: 0, inputTokens: 1, outputTokens: 1, attemptCount: 1, actualCostUsd: 0, outputHash: "h", wallClockMs: 1 }];
    const c = rescore(partial).cases.find((x) => x.claimSectionRef === "7.1")!;
    expect(c.pilotCredit).toBe("NO_CREDIT");
    expect(c.pilotSurfacing).toBe("SPECIFICALLY_SURFACED");
    expect(c.partialRepresentations).toBe(1);
  });

  it("an honest abstention surfaces but never credits", () => {
    const abstention = [{ discoveryId: "d1", documentId: CONMED_DOCUMENT_ID, sourceSectionRef: "7.1", role: "BASKET", sourceTextHash: "h", sourceTextChars: 1, model: "m", tier: 1 as const, escalated: false, escalationReason: null, status: "REVIEW_REQUIRED", failureReasons: [], rules: 1, definitions: 0, sufficiencySummary: { UNSUPPORTED: 1 }, toolCalls: 0, inputTokens: 1, outputTokens: 1, attemptCount: 1, actualCostUsd: 0, outputHash: "h", wallClockMs: 1 }];
    const r = rescore(abstention);
    const c = r.cases.find((x) => x.claimSectionRef === "7.1")!;
    expect(c.pilotCredit).toBe("NO_CREDIT");
    expect(c.pilotSurfacing).toBe("SPECIFICALLY_SURFACED");
    expect(c.pilotDangerousSilentOmission).toBe(false);
  });

  it("a failed compilation neither credits nor surfaces", () => {
    const failed = [{ discoveryId: "d1", documentId: CONMED_DOCUMENT_ID, sourceSectionRef: "7.1", role: "BASKET", sourceTextHash: "h", sourceTextChars: 1, model: "m", tier: 1 as const, escalated: false, escalationReason: null, status: "FAILED", failureReasons: ["MODEL_SCHEMA_FAILURE"], rules: 0, definitions: 0, sufficiencySummary: {}, toolCalls: 0, inputTokens: 1, outputTokens: 1, attemptCount: 1, actualCostUsd: 0, outputHash: "h", wallClockMs: 1 }];
    const c = rescore(failed).cases.find((x) => x.claimSectionRef === "7.1")!;
    expect(c.pilotCredit).toBe("NO_CREDIT");
    expect(c.pilotSurfacing).toBe("NOT_SPECIFICALLY_SURFACED");
    expect(c.modelQualityUncertaintyRemains).toBe(true);
  });

  it("scores exactly the nine CONMED cases", () => {
    expect(rescore([]).cases).toHaveLength(9);
  });
});

describe("§4 — production freeze", () => {
  it("the pilot changes no production file", () => {
    for (const f of fs.readdirSync(path.join(ROOT, "scripts/p3-conmed-pilot"))) {
      const body = src(`scripts/p3-conmed-pilot/${f}`);
      expect(body, `${f} writes into lib/`).not.toMatch(/writeFileSync\([^)]*["'`]lib\//);
    }
  });

  it("production does not import the pilot", () => {
    for (const f of ["lib/contract-model/compiler/semantic/caller.ts", "lib/contract-model/compiler/semantic/compile.ts", "lib/contract-model/analyzer/telemetry.ts"]) {
      expect(src(f), `${f} imports pilot tooling`).not.toMatch(/p3-conmed-pilot/);
    }
  });

  it("the model substitution goes through production's own env knobs, not a code edit", () => {
    expect(src("lib/contract-model/compiler/semantic/caller.ts")).toContain('const MODEL_ENV_VAR = "SEMANTIC_COMPILER_MODEL"');
    expect(src("lib/contract-model/compiler/semantic/caller.ts")).toContain('const MAX_TOKENS_ENV_VAR = "SEMANTIC_COMPILER_MAX_TOKENS"');
  });

  it("the benchmark corpus and canonical result are unchanged", () => {
    const corpus = JSON.parse(src("docs/phase-3-v3.1-final-reconciliation/05-v3.1.1-corrected-47-case-corpus.json"));
    const results = JSON.parse(src("docs/phase-3-v3.1-final-reconciliation/08-final-47-case-results.json"));
    expect(corpus.benchmarkContentHash).toBe("fdba3cb2c1c226d4444f4af89a786efeb662677a8df17666ce8e2ffbcf0c1d59");
    expect(results.counts.credit).toEqual({ NO_CREDIT: 35, CREDIT: 12 });
    expect(results.counts.dangerousSilentOmissions).toBe(22);
  });
});

describe.skipIf(!artifactsExist)("§3/§14 — the artifact set", () => {
  it("every artifact is labelled a low-cost diagnostic, never a canonical measurement", () => {
    for (const f of fs.readdirSync(path.join(ROOT, ART)).filter((f) => f.endsWith(".json"))) {
      const a = art(f);
      expect(a.evidenceLabel, `${f} is unlabelled`).toBe("LOW_COST_DIAGNOSTIC_PIPELINE");
      expect(JSON.stringify(a), `${f} claims to be canonical`).not.toContain("CURRENT_PRODUCTION_CANONICAL");
    }
  });

  it("the canonical 47-case score is recorded as unmodified", () => {
    expect(art("09-nine-case-rescore.json").canonical47CaseScoreModified).toBe(false);
  });

  it("the run stayed inside the $75 ceiling", () => {
    const cost = art("11-cost-report.json");
    expect(cost.ceilingExceeded).toBe(false);
    expect(cost.actualCostUsd).toBeLessThanOrEqual(75);
  });

  it("cost is recomputed at the substituted model's real price, not production's rate card", () => {
    expect(art("11-cost-report.json").telemetryCaveat).toMatch(/rate card only knows Sonnet and Opus/);
  });

  it("the verdict carries a freeze proof with an empty production diff", () => {
    const v = art("12-verdict.json");
    expect(v.productionFreeze.productionDiffIsEmpty).toBe(true);
    expect(v.productionFreeze.allChangesAreAdditive).toBe(true);
    // The fifth state is deliberate: §11's four labels all presuppose the run happened,
    // so none of them can describe a provider cutoff without misattributing the cause.
    expect(["CONMED_PILOT_STRONG_SIGNAL", "CONMED_PILOT_MIXED_SIGNAL", "CONMED_PILOT_MODEL_LIMITED", "CONMED_PILOT_NO_ARCHITECTURAL_IMPROVEMENT", "CONMED_PILOT_BLOCKED_PROVIDER_CREDIT"]).toContain(v.verdict);
    if (v.verdict === "CONMED_PILOT_BLOCKED_PROVIDER_CREDIT") expect(v.notOneOfTheFourBecause).toBeTruthy();
  });

  it("a provider refusal is never counted as a model failure", () => {
    const rel = art("10-reliability.json");
    // The rates that describe the MODEL must exclude candidates the provider refused.
    expect(rel.servedSubset).toBe(rel.tier1Attempted - rel.providerFailures);
    expect(rel.tier1SuccessRate).toBeCloseTo(rel.tier1Successful / rel.servedSubset, 3);
    expect(rel.rawFailureRateIncludingProvider).toBeGreaterThan(rel.tier1Successful / rel.servedSubset === 1 ? 0 : 0);
    expect(rel.denominatorNote).toMatch(/never reached the model/);
  });

  it("an unmeasured case is never reported as a silent omission", () => {
    const rescored = art("09-nine-case-rescore.json");
    for (const c of rescored.cases) {
      if (!c.measured) {
        expect(c.pilotDangerousSilentOmission, `${c.caseId} was never served but is scored as a silent omission`).toBe(false);
      }
    }
    // Deltas must be computed over measured cases only.
    expect(rescored.deltas.casesMeasured + rescored.deltas.casesNotMeasured).toBe(9);
    expect(rescored.deltas.creditAfter).toBeLessThanOrEqual(rescored.deltas.casesMeasured);
  });

  it("no credential appears in the artifact set", () => {
    for (const f of fs.readdirSync(path.join(ROOT, ART))) {
      const body = src(`${ART}/${f}`);
      expect(body, `${f} contains a gateway key`).not.toMatch(/vck_[A-Za-z0-9]/);
      expect(body, `${f} contains a provider key`).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    }
  });
});
