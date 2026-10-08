/**
 * Extraction-architecture benchmark runner: broad vs naive selective vs hybrid, offline, over the acceptance corpus.
 * Usage: npx tsx scripts/product-acceptance/benchmark/run.ts [--out <dir>]
 * Writes benchmark.json (machine-readable) and benchmark.md (human summary).
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadPackage, corpusIdentity, loadCorpus } from "../corpus";
import { runDeterministicStages } from "../stages";
import { broadScope, naiveSelectiveScope, hybridScope, type BenchmarkCase, type Scope, type StrategyId } from "./strategies";
import { scoreScope, type QualityMetrics } from "./metrics";
import { estimateCost, incrementalRecompileUnits, COST_MODEL, type CostEstimate } from "./cost";

export interface CaseResult { caseId: string; adversarialClass: string; packageId: string; question: string; expectedOutcome: string; strategies: Record<StrategyId, { scope: { units: string[]; definitions: string[]; documents: string[]; notExamined: number; missingDocuments: string[]; unresolvedReferences: string[]; flags: string[] }; quality: QualityMetrics; cost: CostEstimate }> }
export interface BenchmarkReport {
  benchmarkVersion: "extraction-architecture-benchmark.v1";
  generatedAt: string; repository: { headSha: string; branch: string; dirty: boolean }; corpusSha256: string; costModel: string;
  evidenceLabels: { quality: "MEASURED_OFFLINE_OVER_FIXTURES"; cost: "DETERMINISTIC_ESTIMATE"; latency: "HYPOTHETICAL_PROJECTION"; strategiesB_C: "EVALUATION_MODEL"; strategyA: "PRODUCTION_POPULATION" };
  cases: CaseResult[];
  aggregate: Record<StrategyId, { cases: number; complete: number; plausibleButIncomplete: number; failClosed: number; falsePermissions: number; dangerousOmissions: number; restrictionRecall: { hit: number; of: number }; conditionRecall: { hit: number; of: number }; definitionRecall: { hit: number; of: number }; failClosedCorrect: { hit: number; of: number }; estimatedUsd: number; modelCalls: number; inputTokens: number }>;
  incremental: Array<{ packageId: string; mutation: string; strategy: StrategyId; withContentAddressing: number; withoutContentAddressing: number; label: "DETERMINISTIC_ESTIMATE" }>;
  cacheReuse: Array<{ packageId: string; questions: string[]; strategy: StrategyId; unitsFirst: number; unitsSecond: number; sharedUnits: number; label: "DETERMINISTIC_ESTIMATE" }>;
}

const CASES_PATH = path.resolve(__dirname, "../../../tests/fixtures/product-acceptance/benchmark/cases.json");
export function loadCases(): BenchmarkCase[] { return (JSON.parse(fs.readFileSync(CASES_PATH, "utf8")) as { cases: BenchmarkCase[] }).cases; }

function summarizeScope(s: Scope) { return { units: s.units.map((u) => `${u.documentId}#${u.sectionRef}`), definitions: s.definitions.map((d) => d.term), documents: s.documents, notExamined: s.notExamined.length, missingDocuments: s.missingDocuments, unresolvedReferences: s.unresolvedReferences, flags: s.flags }; }

export async function runBenchmark(): Promise<BenchmarkReport> {
  const cases = loadCases();
  const stagesByPkg = new Map<string, Awaited<ReturnType<typeof runDeterministicStages>>>();
  const results: CaseResult[] = [];
  for (const c of cases) {
    const pkg = loadPackage(c.packageId);
    if (!stagesByPkg.has(c.packageId)) stagesByPkg.set(c.packageId, await runDeterministicStages(pkg));
    const s = stagesByPkg.get(c.packageId)!;
    const texts = new Map(pkg.documents.map((d) => [d.documentId, d.text] as const));
    // amended operative text (for condition recall on amendment cases) is the amendment document's text
    const scopes: Record<StrategyId, Scope> = { A_BROAD: broadScope(pkg, s), B_NAIVE_SELECTIVE: naiveSelectiveScope(pkg, s, c), C_HYBRID: hybridScope(pkg, s, c) };
    const strategies = {} as CaseResult["strategies"];
    for (const [id, scope] of Object.entries(scopes) as Array<[StrategyId, Scope]>) strategies[id] = { scope: summarizeScope(scope), quality: scoreScope(c, scope, s.index, texts), cost: estimateCost(scope) };
    results.push({ caseId: c.id, adversarialClass: c.adversarialClass, packageId: c.packageId, question: c.question, expectedOutcome: c.expectedOutcome, strategies });
  }
  const agg = {} as BenchmarkReport["aggregate"];
  for (const id of ["A_BROAD", "B_NAIVE_SELECTIVE", "C_HYBRID"] as StrategyId[]) {
    const q = results.map((r) => r.strategies[id].quality), k = results.map((r) => r.strategies[id].cost);
    const sum = (f: (x: QualityMetrics) => { hit: number; of: number }) => q.reduce((a, x) => ({ hit: a.hit + f(x).hit, of: a.of + f(x).of }), { hit: 0, of: 0 });
    agg[id] = { cases: q.length, complete: q.filter((x) => x.outcome === "COMPLETE").length, plausibleButIncomplete: q.filter((x) => x.outcome === "PLAUSIBLE_BUT_INCOMPLETE").length, failClosed: q.filter((x) => x.outcome === "FAIL_CLOSED").length, falsePermissions: q.filter((x) => x.falsePermission).length, dangerousOmissions: q.reduce((n, x) => n + x.dangerousOmissions.length, 0), restrictionRecall: sum((x) => x.materialRestrictionRecall), conditionRecall: sum((x) => x.materialConditionRecall), definitionRecall: sum((x) => ({ hit: x.dependencyClosure.definitionsHit, of: x.dependencyClosure.definitionsOf })), failClosedCorrect: { hit: q.filter((x) => x.failClosedCorrect === true).length, of: q.filter((x) => x.failClosedCorrect !== null).length }, estimatedUsd: k.reduce((n, x) => n + x.estimatedUsd, 0), modelCalls: k.reduce((n, x) => n + x.modelCalls, 0), inputTokens: k.reduce((n, x) => n + x.inputTokens, 0) };
  }
  // incremental recompilation after one clause changes (package C: 7.01(b) restated) and cache reuse across two questions on one package (package I)
  const incremental: BenchmarkReport["incremental"] = [];
  const cPkg = loadPackage("pkg-c-amendment-supersession"); const cS = stagesByPkg.get("pkg-c-amendment-supersession") ?? await runDeterministicStages(cPkg);
  const cCase = cases.find((x) => x.id === "BM-04")!;
  for (const [id, scope] of [["A_BROAD", broadScope(cPkg, cS)], ["C_HYBRID", hybridScope(cPkg, cS, cCase)]] as Array<[StrategyId, Scope]>) { const r = incrementalRecompileUnits(scope, "7.01(b)", new Set(["7.02"])); incremental.push({ packageId: "pkg-c-amendment-supersession", mutation: "restate 7.01(b) (Amendment No. 1)", strategy: id, ...r, label: "DETERMINISTIC_ESTIMATE" }); }
  const cacheReuse: BenchmarkReport["cacheReuse"] = [];
  const iPkg = loadPackage("pkg-i-secured-debt-lien"); const iS = stagesByPkg.get("pkg-i-secured-debt-lien")!;
  const q1 = cases.find((x) => x.id === "BM-01")!, q2 = cases.find((x) => x.id === "BM-06")!;
  for (const [id, f] of [["B_NAIVE_SELECTIVE", (q: BenchmarkCase) => naiveSelectiveScope(iPkg, iS, q)], ["C_HYBRID", (q: BenchmarkCase) => hybridScope(iPkg, iS, q)], ["A_BROAD", () => broadScope(iPkg, iS)]] as Array<[StrategyId, (q: BenchmarkCase) => Scope]>) {
    const a = f(q1), b = f(q2); const ids = new Set(a.units.map((u) => u.nodeId));
    cacheReuse.push({ packageId: "pkg-i-secured-debt-lien", questions: [q1.id, q2.id], strategy: id, unitsFirst: a.units.length, unitsSecond: b.units.length, sharedUnits: b.units.filter((u) => ids.has(u.nodeId)).length, label: "DETERMINISTIC_ESTIMATE" });
  }
  const git = (cmd: string) => { try { return execSync(cmd, { encoding: "utf8" }).trim(); } catch { return "unknown"; } };
  return { benchmarkVersion: "extraction-architecture-benchmark.v1", generatedAt: new Date().toISOString(), repository: { headSha: git("git rev-parse HEAD"), branch: git("git rev-parse --abbrev-ref HEAD"), dirty: git("git status --porcelain").length > 0 }, corpusSha256: corpusIdentity(loadCorpus()).corpusSha256, costModel: COST_MODEL, evidenceLabels: { quality: "MEASURED_OFFLINE_OVER_FIXTURES", cost: "DETERMINISTIC_ESTIMATE", latency: "HYPOTHETICAL_PROJECTION", strategiesB_C: "EVALUATION_MODEL", strategyA: "PRODUCTION_POPULATION" }, cases: results, aggregate: agg, incremental, cacheReuse };
}

export function renderBenchmark(r: BenchmarkReport): string {
  const L: string[] = [];
  L.push(`# Extraction-architecture benchmark — ${r.repository.headSha.slice(0, 12)}`, "", `Generated ${r.generatedAt}. Corpus \`${r.corpusSha256.slice(0, 16)}…\`. Cost model \`${r.costModel}\`.`, "", "Evidence labels: quality = measured offline over fixtures (deterministic production stages); strategies B and C are EVALUATION MODELS (no such production path); cost = deterministic estimate from the rate card; latency = hypothetical projection. No model was called.", "");
  L.push("## Aggregate", "", "| strategy | complete | plausible-but-incomplete | fail-closed | false permissions | dangerous omissions | restriction recall | condition recall | definition recall | fail-closed correct | est. USD | model calls | input tokens |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [id, a] of Object.entries(r.aggregate)) L.push(`| ${id} | ${a.complete} | ${a.plausibleButIncomplete} | ${a.failClosed} | ${a.falsePermissions} | ${a.dangerousOmissions} | ${a.restrictionRecall.hit}/${a.restrictionRecall.of} | ${a.conditionRecall.hit}/${a.conditionRecall.of} | ${a.definitionRecall.hit}/${a.definitionRecall.of} | ${a.failClosedCorrect.hit}/${a.failClosedCorrect.of} | ${a.estimatedUsd.toFixed(3)} | ${a.modelCalls} | ${a.inputTokens} |`);
  L.push("", "## Per case", "", "| case | class | A outcome | B outcome | C outcome | B dangerous omissions | C dangerous omissions | A/B/C units | A/B/C est. USD |", "|---|---|---|---|---|---|---|---|---|");
  for (const c of r.cases) { const s = c.strategies; L.push(`| ${c.caseId} | ${c.adversarialClass} | ${s.A_BROAD.quality.outcome}${s.A_BROAD.quality.falsePermission ? " ⚠FP" : ""} | ${s.B_NAIVE_SELECTIVE.quality.outcome}${s.B_NAIVE_SELECTIVE.quality.falsePermission ? " ⚠FP" : ""} | ${s.C_HYBRID.quality.outcome}${s.C_HYBRID.quality.falsePermission ? " ⚠FP" : ""} | ${s.B_NAIVE_SELECTIVE.quality.dangerousOmissions.length} | ${s.C_HYBRID.quality.dangerousOmissions.length} | ${s.A_BROAD.cost.units}/${s.B_NAIVE_SELECTIVE.cost.units}/${s.C_HYBRID.cost.units} | ${s.A_BROAD.cost.estimatedUsd.toFixed(3)}/${s.B_NAIVE_SELECTIVE.cost.estimatedUsd.toFixed(3)}/${s.C_HYBRID.cost.estimatedUsd.toFixed(3)} |`); }
  L.push("", "## Incremental recompilation (estimate)", "", "| package | mutation | strategy | units with content addressing | units without |", "|---|---|---|---|---|");
  for (const i of r.incremental) L.push(`| ${i.packageId} | ${i.mutation} | ${i.strategy} | ${i.withContentAddressing} | ${i.withoutContentAddressing} |`);
  L.push("", "## Cache reuse across two questions (estimate)", "", "| package | questions | strategy | units Q1 | units Q2 | shared |", "|---|---|---|---|---|---|");
  for (const x of r.cacheReuse) L.push(`| ${x.packageId} | ${x.questions.join("+")} | ${x.strategy} | ${x.unitsFirst} | ${x.unitsSecond} | ${x.sharedUnits} |`);
  L.push("", "## Dangerous omissions by case (B naive selective)", "");
  for (const c of r.cases) { const d = c.strategies.B_NAIVE_SELECTIVE.quality.dangerousOmissions; if (d.length) L.push(`- **${c.caseId}** (${c.adversarialClass}): ${d.join("; ")} — scope was [${c.strategies.B_NAIVE_SELECTIVE.scope.units.join(", ")}]`); }
  L.push("", "## Residual gaps (C hybrid)", "");
  for (const c of r.cases) { const q = c.strategies.C_HYBRID.quality; if (q.dangerousOmissions.length || q.outcome === "PLAUSIBLE_BUT_INCOMPLETE") L.push(`- **${c.caseId}**: ${q.outcome}; omissions ${q.dangerousOmissions.join("; ") || "none"}; conditions ${q.materialConditionRecall.hit}/${q.materialConditionRecall.of}; definitions ${q.dependencyClosure.definitionsHit}/${q.dependencyClosure.definitionsOf}; unresolved [${c.strategies.C_HYBRID.scope.unresolvedReferences.slice(0, 4).join("; ")}]`); }
  return L.join("\n") + "\n";
}

if (require.main === module) {
  (async () => {
    const r = await runBenchmark();
    const outArg = process.argv.indexOf("--out");
    const dir = outArg >= 0 ? path.resolve(process.argv[outArg + 1]!) : path.resolve(__dirname, "../../../docs/product-readiness/benchmark-runs", r.repository.headSha.slice(0, 12));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "benchmark.json"), JSON.stringify(r, null, 2) + "\n");
    fs.writeFileSync(path.join(dir, "benchmark.md"), renderBenchmark(r));
    console.log(`wrote ${dir}`);
    for (const [id, a] of Object.entries(r.aggregate)) console.log(`${id}: complete ${a.complete}, incomplete ${a.plausibleButIncomplete}, failClosed ${a.failClosed}, falsePerm ${a.falsePermissions}, dangerous ${a.dangerousOmissions}, restr ${a.restrictionRecall.hit}/${a.restrictionRecall.of}, cond ${a.conditionRecall.hit}/${a.conditionRecall.of}, defs ${a.definitionRecall.hit}/${a.definitionRecall.of}, fc ${a.failClosedCorrect.hit}/${a.failClosedCorrect.of}, $${a.estimatedUsd.toFixed(3)}, calls ${a.modelCalls}`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
