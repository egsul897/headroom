/**
 * Per-package orchestration and report assembly for the offline acceptance run.
 */
import { execSync } from "node:child_process";
import { corpusIdentity, loadCorpus, type CorpusPackage } from "./corpus";
import { runDeterministicStages } from "./stages";
import { auditDeterministic } from "./auditor";
import { runSemanticStage, auditSemantic } from "./semantic-stage";
import { runRuntimeF } from "./runtime-f";
import type { AcceptanceReport, PackageReport, StageRecord } from "./report-types";

function count<T extends string>(xs: T[]): Record<string, number> { const o: Record<string, number> = {}; for (const x of xs) o[x] = (o[x] ?? 0) + 1; return o; }

export async function runPackage(pkg: CorpusPackage): Promise<PackageReport> {
  const s = await runDeterministicStages(pkg);
  const L = auditDeterministic(pkg, s);
  const stages: StageRecord[] = [...s.stageRecords];
  const t0 = Date.now();
  const sem = await runSemanticStage(pkg, s);
  stages.push({ stage: "SEMANTIC_INVENTORY", mode: "MOCKED", note: `${sem.mockCalls.inventory} Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model).`, durationMs: Date.now() - t0 });
  stages.push({ stage: "SEMANTIC_COMPOSITION", mode: "MOCKED", note: `${sem.mockCalls.passB} Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them.` });
  stages.push({ stage: "SEMANTIC_VERIFICATION_LAYER1", mode: "PRODUCTION", note: "Deterministic Layer-1 verification ran on every compiled candidate." });
  stages.push({ stage: "SEMANTIC_VERIFICATION_LAYER2", mode: "MOCKED", note: `${sem.mockCalls.verifier} reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour.` });
  stages.push({ stage: "CERTIFICATION", mode: "PRODUCTION", note: "certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'." });
  auditSemantic(pkg, s, sem, L);
  if (pkg.manifest.runtime) {
    const t1 = Date.now();
    runRuntimeF(pkg, L);
    stages.push({ stage: "RUNTIME_CAPACITY", mode: "PRODUCTION", note: "Phase-4 runtime over a HAND-BUILT fixture IR (not compiler output): snapshotInputResolver, buildCapacityGraph, evaluateCapacityState.", durationMs: Date.now() - t1 });
    stages.push({ stage: "RUNTIME_SIMULATION", mode: "PRODUCTION", note: "simulateTransaction over the same fixture IR." });
  } else {
    stages.push({ stage: "RUNTIME_CAPACITY", mode: "NOT_RUN", note: "No runtime cases declared for this package." });
  }
  const checks = L.checks, findings = L.findings;
  return {
    packageId: pkg.packageId, title: pkg.manifest.title, manifestSha256: pkg.manifestSha256,
    documents: pkg.documents.map((d) => ({ documentId: d.documentId, sha256: d.sha256, role: d.role, operative: d.operative })),
    stages, checks, findings,
    summary: { checks: checks.length, pass: checks.filter((c) => c.result === "PASS").length, fail: checks.filter((c) => c.result === "FAIL").length, notTested: checks.filter((c) => c.result === "NOT_TESTED").length, findingsBySeverity: count(findings.map((f) => f.severity)), findingsByOutcome: count(findings.map((f) => f.outcomeClass)) },
    observations: L.observations,
  };
}

export async function runAll(): Promise<AcceptanceReport> {
  const packages = loadCorpus();
  const reports: PackageReport[] = [];
  for (const pkg of packages) reports.push(await runPackage(pkg));
  const git = (cmd: string) => { try { return execSync(cmd, { encoding: "utf8" }).trim(); } catch { return "unknown"; } };
  const allChecks = reports.flatMap((r) => r.checks), allFindings = reports.flatMap((r) => r.findings);
  const modes = new Map<string, Set<string>>();
  for (const r of reports) for (const st of r.stages) modes.set(st.stage, new Set([...(modes.get(st.stage) ?? []), st.mode]));
  return {
    reportVersion: "product-acceptance-report.v1",
    generatedAt: new Date().toISOString(),
    repository: { headSha: git("git rev-parse HEAD"), branch: git("git rev-parse --abbrev-ref HEAD"), dirty: git("git status --porcelain").length > 0 },
    corpus: corpusIdentity(packages),
    executionContract: {
      providerCalls: 0, network: "NONE",
      mockedStages: [...modes].filter(([, m]) => m.has("MOCKED")).map(([s]) => s) as never,
      notRunStages: [...modes].filter(([, m]) => m.has("NOT_RUN") && !m.has("PRODUCTION") && !m.has("MOCKED")).map(([s]) => s) as never,
      mockDisclosure: [
        "Discovery Pass B–D were not run; the semantic candidate population is manifest-declared. Nothing here measures discovery coverage.",
        "Pass A inventory and Pass B composition were answered by scripted stand-ins derived from the fixtures and manifests. Nothing here measures model extraction quality.",
        "The Layer-2 reviewer and the condition-suspicion classifier returned zero findings by construction. Every refusal recorded is a deterministic-layer refusal; every acceptance is 'deterministic gates did not object'.",
        "The amendment interpreter, when invoked, answered UNKNOWN_CHANGE with confidence 0 (production fail-closed path).",
        "Package F runtime cases ran production runtime code over a hand-built fixture IR, not over compiler output.",
        "No certification evidence was produced or implied by this run.",
      ],
    },
    packages: reports,
    totals: { checks: allChecks.length, pass: allChecks.filter((c) => c.result === "PASS").length, fail: allChecks.filter((c) => c.result === "FAIL").length, notTested: allChecks.filter((c) => c.result === "NOT_TESTED").length, findings: allFindings.length, findingsBySeverity: count(allFindings.map((f) => f.severity)), findingsByOutcome: count(allFindings.map((f) => f.outcomeClass)) },
  };
}
