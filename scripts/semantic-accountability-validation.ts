/**
 * SEMANTIC ACCOUNTABILITY - frozen real validation harness (mission
 * §21-§27). ONE harness for both validations, executed TWICE each:
 *
 *   npx tsx scripts/semantic-accountability-validation.ts holdout --run 1 [--budget 6]
 *   npx tsx scripts/semantic-accountability-validation.ts whole-agreement --run 1 [--budget 12]
 *
 * What is fixed vs the Mission-4 harnesses (root cause 06 R-1, harness
 * only - never a production change):
 *   - candidate.structuralNodeIds carries the REAL physical anchor nodeId
 *     (the prior harnesses left it empty, so Phase 2D anchored nothing);
 *   - the anchor interval is half-open;
 *   - operativeCharStart is passed, so source-context sufficiency and the
 *     compilation-unit strategy (mission §12/§13) can run;
 *   - the FULL compile result is preserved (sharedCapacities, toolCallLog,
 *     sourceContext, frozenInventory, accountability), never a projection.
 *
 * Guards: refuses to run without a real credential; refuses to run on a
 * drifted (unfrozen) production tree; refuses to overwrite an existing run
 * directory (evidence is never rewritten); stops at the budget ceiling.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  try {
    const envLocal = readFileSync(".env.local", "utf-8");
    const match = envLocal.match(/AI_GATEWAY_API_KEY=(.+)/);
    if (match) process.env.AI_GATEWAY_API_KEY = match[1]!.trim();
  } catch {}
}

import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import { getSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import { findAnchor, loadPackage, specFor, type ValidationMode } from "./lib/semantic-accountability-regions";
import { assertProductionFrozen } from "./semantic-accountability-freeze";

function arg(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const mode = process.argv[2] as ValidationMode;
if (mode !== "holdout" && mode !== "whole-agreement") throw new Error("usage: semantic-accountability-validation.ts <holdout|whole-agreement> --run <n> [--budget <usd>]");
const runNumber = Number(arg("--run"));
if (!Number.isInteger(runNumber) || runNumber < 1) throw new Error("--run <n> is required (1 or 2)");
const spec = specFor(mode);
const BUDGET_CEILING_USD = Number(arg("--budget", mode === "holdout" ? "6" : "12"));
const OUT_DIR = `${spec.outDirBase}/run-${runNumber}`;
/**
 * --resume (Phase 3 final closure §15): continue an EXISTING run directory
 * whose earlier regions completed but whose later regions failed at the
 * provider (HTTP 402 budget cap). A region counts as completed when its
 * preserved record has no error, no PROVIDER_FAILURE and no INVENTORY_FAILED
 * inventory; every other region is (re)run. Nothing is deleted: a failed
 * region record is renamed to region-<id>.provider-failure-<ts>.json and the
 * previous run-summary to run-summary.before-resume-<ts>.json before the
 * merged summary is written. The merged summary discloses the production
 * SHA of every region (the resumed regions may run on a newer frozen SHA).
 */
const RESUME = process.argv.includes("--resume");
/** --only <id,id,...>: restrict the run to a pre-registered subset of the manifest (targeted stability rerun, §14). Regions outside the subset are recorded as skipped. */
const ONLY = new Set((arg("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean));

let runningCostUsd = 0;
function preserve(name: string, data: unknown) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`  [preserved] ${OUT_DIR}/${name}.json`);
}
function logCost(stage: string, cost: number | null | undefined) {
  const c = cost ?? 0;
  runningCostUsd += c;
  console.log(`  [cost] ${stage}: +$${c.toFixed(4)} (running total: $${runningCostUsd.toFixed(4)} / $${BUDGET_CEILING_USD} ceiling)`);
}

async function main() {
  console.log(`================ SEMANTIC_ACCOUNTABILITY_VALIDATION ${mode} run-${runNumber} ================`);
  console.log(`Started: ${new Date().toISOString()}  budget ceiling: $${BUDGET_CEILING_USD}`);
  if (existsSync(OUT_DIR) && !RESUME) throw new Error(`FATAL: ${OUT_DIR} already exists - evidence is never rewritten; use a new run number (or --resume to continue a provider-interrupted run)`);
  const frozen = assertProductionFrozen();
  const resumeStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const priorSummary: { regions?: Record<string, unknown>[]; totalCostUsd?: number; startedAt?: string; resumeHistory?: unknown[] } | null = RESUME && existsSync(`${OUT_DIR}/run-summary.json`) ? JSON.parse(readFileSync(`${OUT_DIR}/run-summary.json`, "utf-8")) : null;
  const completedRegionRecords = new Map<string, Record<string, unknown>>();
  if (RESUME) {
    if (!priorSummary) throw new Error(`FATAL: --resume requires an existing ${OUT_DIR}/run-summary.json`);
    for (const region of spec.regions) {
      const file = `${OUT_DIR}/region-${region.id}.json`;
      if (!existsSync(file)) continue;
      const rec = JSON.parse(readFileSync(file, "utf-8"));
      const failureReasons: string[] = rec.compile?.failureReasons ?? [];
      const completed = !rec.error && !failureReasons.includes("PROVIDER_FAILURE") && rec.compile?.frozenInventory?.inventoryStatus !== "INVENTORY_FAILED";
      if (completed) completedRegionRecords.set(region.id, rec);
      else {
        const renamed = `${OUT_DIR}/region-${region.id}.provider-failure-${resumeStamp}.json`;
        renameSync(file, renamed);
        console.log(`  [resume] ${region.id}: previous record was provider-failed - preserved as ${renamed}, will rerun`);
      }
    }
    renameSync(`${OUT_DIR}/run-summary.json`, `${OUT_DIR}/run-summary.before-resume-${resumeStamp}.json`);
    console.log(`  [resume] ${completedRegionRecords.size} region(s) already completed and kept; previous summary preserved as run-summary.before-resume-${resumeStamp}.json`);
  }
  console.log(`  production frozen: sha=${frozen.sha} treeHash=${frozen.treeHash.slice(0, 16)}`);

  const pkg = loadPackage(spec);
  const access = { index: pkg.index, packageGraph: pkg.packageGraph, exactTermsByDocument: pkg.exactTermsByDocument };

  const compileCaller = getSemanticCaller();
  const inventoryCaller = getStageCaller();
  const verifyCaller = getStageCaller();
  console.log(`  compiler  provider=${compileCaller.providerName} model=${compileCaller.model} synthetic=${compileCaller.isSynthetic}`);
  console.log(`  inventory provider=${inventoryCaller.providerName} model=${inventoryCaller.model} synthetic=${inventoryCaller.isSynthetic}`);
  console.log(`  verifier  provider=${verifyCaller.providerName} model=${verifyCaller.model} synthetic=${verifyCaller.isSynthetic}`);
  if (compileCaller.isSynthetic || inventoryCaller.isSynthetic || verifyCaller.isSynthetic) throw new Error("FATAL: no real credential detected - refusing a synthetic validation.");

  const startedAt = new Date().toISOString();
  const regionSummaries: Record<string, unknown>[] = [];

  for (const region of spec.regions) {
    if (ONLY.size > 0 && !ONLY.has(region.id)) {
      regionSummaries.push({ id: region.id, skipped: true, reason: "outside the pre-registered --only subset" });
      continue;
    }
    if (RESUME && completedRegionRecords.has(region.id)) {
      const prior = (priorSummary?.regions ?? []).find((r) => r.id === region.id);
      regionSummaries.push({ ...(prior ?? { id: region.id }), productionSha: (completedRegionRecords.get(region.id)!.run as { productionSha?: string } | undefined)?.productionSha ?? null, keptFromPriorRun: true });
      console.log(`\n=== Region ${region.id}: kept from the prior run (completed before the provider interruption) ===`);
      continue;
    }
    if (runningCostUsd >= BUDGET_CEILING_USD) {
      console.log(`  [budget] ceiling reached - stopping before region ${region.id}`);
      regionSummaries.push({ id: region.id, skipped: true, reason: "budget ceiling reached before this region" });
      continue;
    }
    console.log(`\n=== Region ${region.id} (${region.family}${region.claimIds.length ? `; claims ${region.claimIds.join(", ")}` : ""}) ===`);
    const fullText = pkg.textByDoc.get(region.documentId)!;
    const { start, end } = region.locate(fullText);
    const operativeSourceText = fullText.slice(start, end);
    const anchor = findAnchor(pkg.allNodes, region.documentId, start);
    console.log(`  window=[${start}, ${end}) chars=${operativeSourceText.length} anchor=${anchor ? `${anchor.sectionRef ?? "?"} ${anchor.nodeId} [${anchor.charStart}, ${anchor.charEnd})` : "NONE"}`);

    const candidate: DiscoveredCandidate = {
      discoveryId: `semantic-accountability:${mode}:${region.id}`,
      documentId: region.documentId,
      structuralNodeKeys: anchor ? [anchor.nodeKey] : [],
      structuralNodeIds: anchor ? [anchor.nodeId] : [],
      normalizedSourceRef: region.sourceSectionRef,
      families: [],
      role: "GENERAL_PROHIBITION",
      roleRaw: "",
      roleNormalizationStatus: "VALID_CANONICAL",
      familiesRaw: [],
      familiesNormalizationStatus: "VALID_CANONICAL",
      description: `Frozen validation region (${mode}): ${region.label}`,
      multipleRulesLikely: true,
      definedTermDependencyLikely: true,
      discoveryMethods: ["DETERMINISTIC_SIGNAL"],
      evidenceSignals: ["headline_heading"],
      reviewStatus: "NEEDS_REVIEW",
      confidence: 1,
      sourceCitation: operativeSourceText.slice(0, 200),
      discoveryRunVersion: `semantic-accountability-validation.v1`,
      supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
      supersessionReason: "Validation region located by the frozen region definition, not via the real discovery pipeline - operative-state/supersession status not independently checked for this ad-hoc anchor.",
      valueAnchors: [],
    } as unknown as DiscoveredCandidate;

    let bundle;
    let bundleError: string | null = null;
    try {
      bundle = buildCovenantContextBundle({ candidate, packageKey: spec.packageKey, companyId: spec.companyId, instrumentKey: spec.instrumentKey }, access);
    } catch (err) {
      bundleError = err instanceof Error ? err.message : String(err);
      console.log(`  [context-bundle] failed (${bundleError}) - using empty bundle`);
      bundle = { items: [], unresolvedDependencies: [], sufficiencyState: "INCOMPLETE" } as unknown as ReturnType<typeof buildCovenantContextBundle>;
    }
    console.log(`  context bundle: items=${bundle.items.length} sufficiency=${bundle.sufficiencyState} anchoredNodeIds=${JSON.stringify(bundle.originatingStructuralNodeIds ?? [])}`);

    const compilerInput: SemanticCompilerInput = {
      companyId: spec.companyId,
      instrumentKey: spec.instrumentKey,
      sourceDocumentId: region.documentId,
      candidateRef: candidate.discoveryId,
      sourceSectionRef: region.sourceSectionRef,
      operativeSourceText,
      operativeCharStart: start,
      contextBundle: bundle,
      operativeLineage: null,
      toolAccess: { structuralIndex: pkg.index, operativeState: null, packageGraph: pkg.packageGraph, amendmentEffects: [], contextBundle: bundle },
      irSchemaVersion: IR_SCHEMA_VERSION,
      compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
      compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
      toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
    };

    let compileResult;
    try {
      compileResult = await compileCovenantToIR(compilerInput, { caller: compileCaller, inventoryCaller, cache: new InMemorySemanticCompilationCache() });
      logCost(`inventory ${region.id}`, compileResult.frozenInventory?.telemetryCostUsd);
      logCost(`compile ${region.id}`, compileResult.telemetry?.calculatedCostUsd);
      const sc = compileResult.sourceContext;
      const op = sc?.regions[0];
      console.log(`  -> source context: ${sc?.state} unit=[${op?.charStart}, ${op?.charEnd}) chars=${op?.text.length} extended=${op?.unitExtension ? op.unitExtension.unitBoundary : "no"} expansions=${(sc?.regions.length ?? 1) - 1} unresolvedRefs=${sc?.unresolvedReferences.length ?? 0}`);
      console.log(`  -> inventory: ${compileResult.frozenInventory?.inventoryStatus} items=${compileResult.frozenInventory?.items.length} uninventoried=${compileResult.frozenInventory?.uninventoriedValues.length} hash=${compileResult.frozenInventory?.frozenContentHash.slice(0, 12)}`);
      console.log(`  -> compile status=${compileResult.status} rules=${compileResult.rules.length} definitions=${compileResult.definitions.length} sharedCaps=${compileResult.sharedCapacities.length} unresolvedDeps=${compileResult.rules.reduce((n, r) => n + (r.unresolvedDependencies?.length ?? 0), 0)} failureReasons=${JSON.stringify(compileResult.failureReasons)}`);
      const acc = compileResult.accountability;
      if (acc) console.log(`  -> accountability: complete=${acc.semanticallyComplete} material=${acc.counts.material} represented=${acc.counts.represented} ambiguous=${acc.counts.ambiguous} nonComp=${acc.counts.intentionallyNonComputational} unsupported=${acc.counts.unsupported} MISSING=${acc.counts.missingFromComposition} (material ${acc.counts.materialMissingFromComposition}, critical ${acc.counts.criticalMissingFromComposition}) valuesMissing=${acc.counts.materialQuantitativeValuesMissing} dangling=${acc.counts.danglingLineageReferences}`);
    } catch (err) {
      console.log(`  -> compile FAILED: ${err instanceof Error ? err.message : String(err)}`);
      preserve(`region-${region.id}`, { region: { ...region, locate: undefined, window: { start, end }, anchor }, operativeSourceText, error: err instanceof Error ? err.message : String(err) });
      regionSummaries.push({ id: region.id, error: err instanceof Error ? err.message : String(err) });
      continue;
    }

    // Independent verification (Phase 3C, untouched). The verifier sees the
    // SOURCE unit the compiler actually consumed (the resolved operative
    // region - deterministic source text, not a Pass A/Pass C conclusion) so
    // its own source inventory covers the same text; it never receives the
    // frozen inventory or the accountability result.
    let verifyResult = null;
    let verifierOperativeSource: "RESOLVED_UNIT" | "SUPPLIED_WINDOW" = "SUPPLIED_WINDOW";
    if (runningCostUsd < BUDGET_CEILING_USD && compileResult.status !== "FAILED") {
      const op = compileResult.sourceContext?.regions[0];
      const verifierInput: SemanticCompilerInput = op && op.text !== operativeSourceText ? { ...compilerInput, operativeSourceText: op.text, operativeCharStart: op.charStart, sourceContext: undefined, frozenInventory: undefined } : { ...compilerInput, sourceContext: undefined, frozenInventory: undefined };
      if (op && op.text !== operativeSourceText) verifierOperativeSource = "RESOLVED_UNIT";
      try {
        verifyResult = await verifyCompiledCandidate({ compilerInput: verifierInput, compilationResult: compileResult }, { reviewCaller: verifyCaller });
        logCost(`verify ${region.id}`, verifyCaller.lastTelemetry()?.calculatedCostUsd);
        console.log(`  -> verify status=${verifyResult.status} findings=${verifyResult.findings.length} material=${verifyResult.findings.filter((f) => f.severity === "MATERIAL").length} semanticReviewInvoked=${verifyResult.semanticReviewInvoked}`);
      } catch (err) {
        console.log(`  -> verify FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const record = {
      run: { mode, runNumber, productionSha: frozen.sha, productionTreeHash: frozen.treeHash },
      region: { id: region.id, claimIds: region.claimIds, family: region.family, documentId: region.documentId, label: region.label, sourceSectionRef: region.sourceSectionRef, window: { charStart: start, charEnd: end, chars: operativeSourceText.length }, anchor, structuralNodeIds: candidate.structuralNodeIds, structuralNodeKeys: candidate.structuralNodeKeys },
      operativeSourceText,
      contextBundle: { items: bundle.items.length, sufficiencyState: bundle.sufficiencyState, originatingStructuralNodeIds: bundle.originatingStructuralNodeIds ?? [], unresolvedDependencies: bundle.unresolvedDependencies.length, error: bundleError },
      compile: compileResult,
      verify: verifyResult,
      verifierOperativeSource,
    };
    preserve(`region-${region.id}`, record);
    regionSummaries.push({
      id: region.id,
      family: region.family,
      claimIds: region.claimIds,
      productionSha: frozen.sha,
      sourceContextState: compileResult.sourceContext?.state ?? null,
      unitChars: compileResult.sourceContext?.regions[0]?.text.length ?? null,
      unitExtended: compileResult.sourceContext?.regions[0]?.unitExtension?.unitBoundary ?? null,
      expansions: (compileResult.sourceContext?.regions.length ?? 1) - 1,
      inventoryStatus: compileResult.frozenInventory?.inventoryStatus ?? null,
      inventoryItems: compileResult.frozenInventory?.items.length ?? null,
      inventoryHash: compileResult.frozenInventory?.frozenContentHash ?? null,
      compileStatus: compileResult.status,
      failureReasons: compileResult.failureReasons,
      rules: compileResult.rules.length,
      definitions: compileResult.definitions.length,
      sharedCapacities: compileResult.sharedCapacities.length,
      unresolvedDependencies: compileResult.rules.reduce((n, r) => n + (r.unresolvedDependencies?.length ?? 0), 0),
      accountability: compileResult.accountability ? { semanticallyComplete: compileResult.accountability.semanticallyComplete, counts: compileResult.accountability.counts } : null,
      verifyStatus: verifyResult?.status ?? null,
      materialFindings: verifyResult ? verifyResult.findings.filter((f) => f.severity === "MATERIAL").length : null,
      verifierOperativeSource,
      costUsd: { inventory: compileResult.frozenInventory?.telemetryCostUsd ?? 0, compile: compileResult.telemetry?.calculatedCostUsd ?? 0 },
    });
  }

  preserve("run-summary", {
    mode,
    runNumber,
    startedAt,
    finishedAt: new Date().toISOString(),
    productionSha: frozen.sha,
    productionTreeHash: frozen.treeHash,
    versions: { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicy: SEMANTIC_COMPILER_TOOL_POLICY_VERSION, accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, irSchema: IR_SCHEMA_VERSION },
    providers: { compiler: { provider: compileCaller.providerName, model: compileCaller.model }, inventory: { provider: inventoryCaller.providerName, model: inventoryCaller.model }, verifier: { provider: verifyCaller.providerName, model: verifyCaller.model } },
    totalCostUsd: runningCostUsd + (priorSummary?.totalCostUsd ?? 0),
    costUsdThisInvocation: runningCostUsd,
    budgetCeilingUsd: BUDGET_CEILING_USD,
    regionIds: spec.regions.map((r) => r.id),
    only: ONLY.size > 0 ? [...ONLY] : null,
    resumed: RESUME,
    resumeHistory: RESUME ? [...(priorSummary?.resumeHistory ?? []), { resumedAt: startedAt, priorStartedAt: priorSummary?.startedAt ?? null, keptRegions: [...completedRegionRecords.keys()], productionShaThisInvocation: frozen.sha, priorSummaryFile: `run-summary.before-resume-${resumeStamp}.json` }] : [],
    productionShaByRegion: Object.fromEntries(regionSummaries.map((r) => [r.id as string, (r as { productionSha?: string | null }).productionSha ?? null])),
    regions: regionSummaries,
  });
  console.log("\n================ FINAL SUMMARY ================");
  console.log(JSON.stringify({ mode, runNumber, totalCostUsd: runningCostUsd }, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err);
  preserve("fatal-error", { message: err instanceof Error ? err.message : String(err), runningCostUsdAtFailure: runningCostUsd });
  process.exit(1);
});
