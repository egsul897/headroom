/**
 * §16 — tests over the EVIDENCE-GENERATION layer.
 *
 * These are not tests of the production compiler; production is frozen in this mission.
 * They test the thing that went wrong last time: the harness that produced the benchmark's
 * systemOutput silently truncated its own population, and nothing caught it. Each test here
 * is the check that would have caught that, expressed so it still catches it if the
 * regeneration harness is written later.
 *
 * Every assertion is derived from repository state. None of them costs anything to run.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ARTICLE_FAMILIES, costPlan, population, scopeOptions, unitEconomics } from "../../scripts/p3-regen/cost-plan";
import { CURRENT_PIPELINE_IDENTITY, caseProvenance, datasetGenerationFacts, P, read, readJson } from "../../scripts/p3-regen/evidence-provenance";
import { CONTROL_MISCITATION, frozenLsbCitations, question4, replay } from "../../scripts/p3-regen/lsb-verification-replay";
import { isEligibleForSemanticCompilation } from "../../lib/contract-model/compiler/semantic/package-compile";

const ROOT = process.cwd();
const src = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

/**
 * Strips comments and string/template literals so a scan measures what the code DOES,
 * not what its prose says. These artifacts describe a compile cap, a caseId and a
 * provider caller at length — describing them is the point — and a scan that cannot
 * tell narration from behaviour would either fail on honest documentation or force the
 * documentation to be vague. `codeOnly` removes the narration and leaves the executable
 * text, so a real `.slice(0, 30)` or a real `getSemanticCaller()` is still caught.
 */
function codeOnly(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""');
}

describe("§16.1 — candidate-population completeness", () => {
  it("the population is every eligible candidate in the defined slice, with nothing dropped", () => {
    const pop = population();
    const dsgr = (readJson(P.dsgrStage2) as any[]).filter(
      (c) => ["doc-a", "doc-b", "doc-d"].includes(c.documentId) && ARTICLE_FAMILIES.dsgr!.articles.includes(String(c.normalizedSourceRef ?? "").split(".")[0]!),
    );
    const eligible = dsgr.filter((c) => isEligibleForSemanticCompilation(c).eligible);

    // The population must equal what PRODUCTION's own predicate admits — not a subset.
    expect(pop.dsgr.count).toBe(eligible.length);
    expect(pop.dsgr.count).toBeLessThan(dsgr.length); // representations really are excluded
    expect(dsgr.length - eligible.length).toBe(dsgr.filter((c) => c.role === "REPRESENTATION").length);
  });

  it("every dataset contributes a non-empty population, so no package is silently skipped", () => {
    const pop = population();
    for (const k of ["dsgr", "conmed", "lsb", "fwrg"] as const) {
      expect(pop[k].count, `${k} contributed no candidates`).toBeGreaterThan(0);
    }
    expect(pop.total).toBe(pop.dsgr.count + pop.conmed.count + pop.lsb.count + pop.fwrg.count);
  });

  it("the population is strictly larger than the historical run's 30, which is the defect being corrected", () => {
    expect(population().total).toBeGreaterThan(30);
    expect(readJson(P.dsgrSummary).candidatesCompiled).toBe(30);
  });
});

describe("§16.2 — no hidden compile cap", () => {
  it("production's intake seam applies no cap between eligibility filtering and compilation", () => {
    const orchestrator = src("lib/contract-model/analysis/orchestrator.ts");
    const intake = "allCandidates.filter((c) => isEligibleForSemanticCompilation(c).eligible)";
    const start = orchestrator.indexOf(intake);
    const end = orchestrator.indexOf("await compilePackageToIR(", start);
    expect(start, "production intake expression not found — this test is measuring nothing").toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    // Scoped to the intake window on purpose: a whole-file scan matches
    // `new Date().toISOString().slice(0, 10)` and reports a cap that does not exist.
    const window = orchestrator.slice(start, end);
    const capMatches = window.match(/\.slice\(|\.splice\(|COMPILE_CAP|BUDGET_CEILING|MAX_COMPILE/g) ?? [];
    expect(capMatches).toEqual([]);
  });

  it("the evidence-generation layer declares no cap of its own", () => {
    for (const f of ["scripts/p3-regen/cost-plan.ts", "scripts/p3-regen/evidence-provenance.ts", "scripts/p3-regen/build-artifacts.ts"]) {
      expect(codeOnly(src(f)), `${f} declares a compile cap`).not.toMatch(/COMPILE_CAP|BUDGET_CEILING|MAX_COMPILE/);
    }
  });

  it("the historical harness — the actual contamination source — still carries its cap, unmodified", () => {
    // If this ever fails, someone edited the frozen harness, and the provenance story
    // in docs/phase-3-current-pipeline-regeneration/03 no longer describes reality.
    const harness = src("scripts/phase-3f-first-blind-run.ts");
    expect(harness).toMatch(/const COMPILE_CAP = 30;/);
    expect(harness).toMatch(/\.slice\(0, COMPILE_CAP\)/);
  });
});

describe("§16.3 — no truncation over the defined population", () => {
  it("population() never slices, splices or otherwise shortens its own result", () => {
    const body = src("scripts/p3-regen/cost-plan.ts");
    const populationFn = codeOnly(body.slice(body.indexOf("export function population()"), body.indexOf("/** Unit economics")));
    expect(populationFn).not.toMatch(/\.slice\(\s*\d/);
    expect(populationFn).not.toMatch(/\.splice\(/);
  });

  it("the full scope option carries the whole population, untruncated", () => {
    const full = scopeOptions().find((o) => o.id === "A_FULL")!;
    expect(full.candidates).toBe(population().total);
  });

  it("every partial scope option says so in its verdict, so a truncated run cannot be reported as complete", () => {
    for (const o of scopeOptions().filter((o) => o.candidates < population().total)) {
      expect(o.verdictIfChosen, `${o.id} does not declare itself partial`).toMatch(/PARTIAL/);
    }
  });
});

describe("§16.4 — the selection rule is benchmark-blind", () => {
  it("the selection code never reads the benchmark corpus, a caseId or an expected answer", () => {
    const body = codeOnly(src("scripts/p3-regen/cost-plan.ts"));
    for (const forbidden of ["P.corpus", "P.results", "P.packet", "caseId", "CASE-", "groundTruth", "correctedGroundTruthClaim", "dangerousSilentOmission"]) {
      expect(body, `selection code references ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the article families are stated per agreement and carry a structural rationale, not a benchmark one", () => {
    for (const [pkg, fam] of Object.entries(ARTICLE_FAMILIES)) {
      expect(fam.articles.length, `${pkg} has no articles`).toBeGreaterThan(0);
      expect(fam.rationale.length, `${pkg} has no rationale`).toBeGreaterThan(40);
    }
  });

  it("the population is stable across repeated computation — selection cannot drift toward a favourable answer", () => {
    expect(population()).toEqual(population());
  });
});

describe("§16.5 — provenance completeness", () => {
  it("every one of the 47 cases carries a provenance verdict; none is left unaudited", () => {
    const cases = caseProvenance();
    expect(cases).toHaveLength(47);
    for (const c of cases) {
      expect(c.provenanceState, `${c.caseId} has no provenance state`).toBeTruthy();
      expect(String(c.reason).length, `${c.caseId} has no reason`).toBeGreaterThan(30);
      expect(c.generationPipelineVersion).toBeDefined();
      expect(c.currentPipelineVersion).toBe(CURRENT_PIPELINE_IDENTITY.compilerPromptVersion);
    }
  });

  it("the audit covers all 47 cases, not the 20 the prior investigation named", () => {
    const cases = caseProvenance();
    expect(cases.filter((c: { regenerationRequired: boolean }) => c.regenerationRequired)).toHaveLength(47);
    expect(cases.filter((c: { currentPipelineEquivalent: boolean }) => c.currentPipelineEquivalent)).toHaveLength(0);
  });

  it("the currency verdict follows from recorded pipeline identity, not from an assertion", () => {
    const facts = datasetGenerationFacts();
    // The decisive fact: the frozen DSGR run stamped a prompt version production no
    // longer runs. If those versions ever coincide, this test must fail loudly rather
    // than let the manifest keep claiming contamination.
    expect(facts.dsgr.recordedPromptVersion.length).toBeGreaterThan(0);
    expect(facts.dsgr.recordedPromptVersion).not.toContain(CURRENT_PIPELINE_IDENTITY.compilerPromptVersion);
    expect(facts.dsgr.promptVersionMatchesCurrent).toBe(false);
    expect(facts.conmed.compilationStageRan).toBe(false);
    expect(facts.fwrg.compilationStageRan).toBe(false);
  });

  it("no case claims an unrecognised provenance state", () => {
    const allowed = new Set(["HISTORICAL_COMPILE_CAP", "HISTORICAL_NO_COMPILATION_STAGE", "SUPERSEDED_ANALYZER", "HISTORICAL_VERIFICATION_ARTIFACT", "CURRENT_PIPELINE_ALREADY_VALID"]);
    for (const c of caseProvenance()) expect(allowed.has(c.provenanceState as string), `${c.caseId}: ${c.provenanceState}`).toBe(true);
  });
});

describe("§16.6 — case-to-output mapping", () => {
  it("every audited case maps to a real packet case and a real V3.1.1 corpus case", () => {
    const packetIds = new Set(readJson(P.packet).cases.map((c: any) => c.caseId));
    const corpusIds = new Set(readJson(P.corpus).cases.map((c: any) => c.caseId));
    const resultIds = new Set(readJson(P.results).rows.map((r: any) => r.caseId));
    for (const c of caseProvenance()) {
      expect(packetIds.has(c.caseId), `${c.caseId} missing from the packet`).toBe(true);
      expect(corpusIds.has(c.caseId), `${c.caseId} missing from the corpus`).toBe(true);
      expect(resultIds.has(c.caseId), `${c.caseId} missing from the results`).toBe(true);
    }
  });

  it("the mapping is one-to-one — no case is audited twice and none is dropped", () => {
    const ids = caseProvenance().map((c: { caseId: string }) => c.caseId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(readJson(P.corpus).cases.map((c: any) => c.caseId)));
  });

  it("each case's dataset is consistent with the package its documentId belongs to", () => {
    const expected: Record<string, string> = { "doc-a": "dsgr", "doc-b": "dsgr", "doc-d": "dsgr", lsb: "lsb", fwrg: "fwrg", "conmed-doc-a-eighth-ar-credit-agreement": "conmed" };
    for (const c of caseProvenance()) expect(c.dataset, c.caseId).toBe(expected[c.documentId]);
  });
});

describe("§16.7 — cost plan integrity", () => {
  it("unit economics are measured from the frozen run's telemetry, not guessed", () => {
    const econ = unitEconomics();
    const s6 = readJson(P.dsgrStage6) as any[];
    expect(econ.measuredOn).toContain(String(s6.length));
    expect(econ.perCandidate.costUsd).toBeGreaterThan(0);
    expect(econ.compilationCostUsd).toBeLessThanOrEqual(econ.wholeRunCostUsd);
  });

  it("the plan records zero reusable cached calls, because the cache key carries the prompt version", () => {
    const plan = costPlan();
    expect(plan.cacheReuse.cachedCallsAvailable).toBe(0);
    expect(plan.cacheReuse.anyResultReproducibleFromCache).toBe(false);
  });

  it("the plan refuses to silently reuse the historical $30 ceiling", () => {
    const plan = costPlan();
    expect(plan.ceilingPolicy.requestedCeilingUsd).toBeNull();
    expect(plan.ceilingPolicy.priorRunCeilingUsd).toBe(30);
    expect(plan.ceilingPolicy.rule).toMatch(/forbids/);
  });
});

describe("§16.8 — no paid call was made", () => {
  it("the artifact set records zero model calls and zero dollars spent", () => {
    const cost = readJson("docs/phase-3-current-pipeline-regeneration/13-cost-report.json");
    expect(cost.actual.modelCalls).toBe(0);
    expect(cost.actual.costUsd).toBe(0);
  });

  it("every regeneration artifact declares itself NOT_GENERATED rather than being absent", () => {
    for (const f of ["05-dsgr-regeneration.json", "06-conmed-regeneration.json", "07-fwrg-regeneration.json", "09-current-pipeline-packet.json", "10-readjudication.json", "11-final-47-case-result.json"]) {
      const a = readJson(`docs/phase-3-current-pipeline-regeneration/${f}`);
      expect(a.status, f).toBe("NOT_GENERATED");
      expect(a.reason, f).toMatch(/authorization/);
    }
  });

  it("the evidence-generation layer contains no live network or provider call", () => {
    for (const f of fs.readdirSync(path.join(ROOT, "scripts/p3-regen"))) {
      const body = codeOnly(src(`scripts/p3-regen/${f}`));
      expect(body, `${f} makes a network call`).not.toMatch(/\bfetch\(|axios|require\("node:https"\)/);
      expect(body, `${f} constructs a provider caller`).not.toMatch(/getSemanticCaller\(|createAnthropic|new Anthropic/);
    }
  });

  it("no credential value appears anywhere in the artifact set", () => {
    const dir = path.join(ROOT, "docs/phase-3-current-pipeline-regeneration");
    for (const f of fs.readdirSync(dir)) {
      const body = fs.readFileSync(path.join(dir, f), "utf8");
      expect(body, `${f} contains a gateway key`).not.toMatch(/vck_[A-Za-z0-9]/);
      expect(body, `${f} contains a provider key`).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    }
  });
});

describe("§6 — LSB verification replay (Question 4)", () => {
  it("replays the frozen LSB citations through the UNCHANGED production verifier", () => {
    // The replay must go through the real exported function, not a copy of its logic.
    const rows = replay();
    expect(rows.length).toBe(frozenLsbCitations().length + 1);
    expect(rows.filter((r) => r.origin === "frozen-lsb-evidence").length).toBe(frozenLsbCitations().length);
  });

  it("the control miscitation demotes — without which the replay would be measuring nothing", () => {
    const control = replay().find((r) => r.citation === CONTROL_MISCITATION)!;
    expect(control.outcome).toBe("DEMOTED");
    expect(control.parentResolved).toBe(false);
  });

  it("a bare section citation that IS printed verbatim passes", () => {
    const rows = replay();
    for (const r of rows.filter((r) => r.origin === "frozen-lsb-evidence" && !r.composed)) {
      expect(r.outcome, `${r.citation} demoted despite being a bare, present section`).toBe("PASSED");
    }
  });

  it("Question 4: the composed-citation demotion still reproduces in current production", () => {
    const q = question4();
    expect(q.answer).toMatch(/^YES/);
    expect(q.composedDemotionsWithResolvingParent.length).toBeGreaterThan(0);
    // Each one is a rule whose PARENT section is present in the source — so the
    // demotion is not "the model cited a section that does not exist".
    for (const c of q.composedDemotionsWithResolvingParent) {
      const row = replay().find((r) => r.citation === c)!;
      expect(row.parentResolved, `${c}: parent does not resolve, so this is a real miscitation`).toBe(true);
    }
  });

  it("the replay costs nothing and touches no model", () => {
    const q = question4();
    expect(q.costUsd).toBe(0);
    expect(q.modelCalls).toBe(0);
  });

  it("§6's no-fix constraint holds: the production verifier is unmodified", () => {
    const verify = src("lib/contract-model/analyzer/verify.ts");
    // The literal-citation lookup is still exactly what it was. If a later mission fixes
    // it, this test should be updated deliberately, not pass by accident.
    expect(verify).toMatch(/const exact = sourceText\.indexOf\(citation\);/);
    expect(verify).toMatch(/return match \? match\.index : -1;/);
  });
});

describe("§19 — production freeze", () => {
  it("this mission's own code imports production, but never re-implements or shadows it", () => {
    // Regenerating evidence honestly means calling the same functions production calls.
    expect(src("scripts/p3-regen/lsb-verification-replay.ts")).toContain('from "../../lib/contract-model/analyzer/verify"');
    expect(src("scripts/p3-regen/evidence-provenance.ts")).toContain('from "../../lib/contract-model/compiler/semantic/types"');
  });

  it("no production file is imported FROM production into this mission's scripts", () => {
    // The inverse direction is the dangerous one: production must not depend on forensics.
    const scanned = ["lib/contract-model/analysis/orchestrator.ts", "lib/contract-model/analyzer/verify.ts", "lib/contract-model/compiler/semantic/package-compile.ts"];
    for (const f of scanned) expect(src(f), `${f} imports mission tooling`).not.toMatch(/p3-regen|p3-defect-1|v3-1-1/);
  });

  it("the benchmark corpus and its canonical result are byte-identical to the V3.1.1 handoff", () => {
    expect(readJson(P.corpus).benchmarkContentHash).toBe("fdba3cb2c1c226d4444f4af89a786efeb662677a8df17666ce8e2ffbcf0c1d59");
    expect(readJson(P.results).counts.credit).toEqual({ NO_CREDIT: 35, CREDIT: 12 });
    expect(readJson(P.results).counts.dangerousSilentOmissions).toBe(22);
  });

  it("the verdict artifact carries a freeze proof showing no production diff", () => {
    const verdict = readJson("docs/phase-3-current-pipeline-regeneration/15-verdict.json");
    expect(verdict.productionFreeze.productionDiffIsEmpty).toBe(true);
    expect(verdict.productionFreeze.benchmarkGroundTruthDiffIsEmpty).toBe(true);
    expect(verdict.productionFreeze.priorAuditArtifactsDiffIsEmpty).toBe(true);
    expect(verdict.productionFreeze.frozenSurfacesChanged).toEqual([]);
    expect(verdict.verdict).toBe("PHASE3_EVIDENCE_REGENERATION_BLOCKED");
    expect(verdict.blockedOn).toBe("PAID_CALL_AUTHORIZATION_REQUIRED");
  });
});

describe("determinism", () => {
  it("every derived artifact recomputes identically", () => {
    expect(caseProvenance()).toEqual(caseProvenance());
    expect(costPlan()).toEqual(costPlan());
    expect(question4()).toEqual(question4());
  });

  it("the source files the audit depends on are the ones it says it read", () => {
    for (const p of Object.values(P)) expect(() => read(p), p).not.toThrow();
  });
});
