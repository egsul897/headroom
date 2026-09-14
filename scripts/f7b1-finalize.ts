/**
 * F-7B.1 §21-§26 finalize (ZERO model calls): the paid 5-shard rerun ledger, the 28-item owned-material accountability,
 * shard-architecture observations, the Stage-1 rerun gate, and the cost/window comparison against the original failed
 * F-7B Stage 1. Reads the rerun artifacts written by scripts/f7b-run-stage.ts under docs/phase-3-remediation-f7b1/rerun.
 *   npx tsx scripts/f7b1-finalize.ts
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { normalizeDefinedTermRef } from "../lib/contract-model/compiler/amendment/operative-state";
import { buildShardCompilerInput } from "../lib/contract-model/compiler/semantic/shard-planner";
import { freezeAndPlan, readJson, writeJson, type ShardRecord } from "./f7b-lib";

const OUT = "docs/phase-3-remediation-f7b1";
const RERUN = `${OUT}/rerun`;
const RERUN_EVIDENCE = "tests/fixtures/unseen-packages/f7b1-chewy-101-canary-rerun";
const ORIGINAL = "docs/phase-3-remediation-f7b";
const STARTING_SHA = "c58acd9c9985569f24e19355e924e0338e56bcb5";

interface Stage1File { stage1Calls: number; stage1CostUsd: number; maxActualInputTokensPerShard: number; maxSingleTurnInputTokens: number; maxActualOutputTokensPerShard: number; records: ShardRecord[]; partialStitchDiagnostics: { status: string; collisions: Record<string, number>; contextualEmissions: unknown[]; unresolvedOwnedItems: number; strippedLineage: unknown[] }; scoreSnapshot: Record<string, unknown> & { trust: Record<string, number>; W: Record<string, unknown>; E: Record<string, unknown>; H: { sourceUnverifiableSurviving: number; list: { kind: string; id: string; term?: string; reason: string }[] }; A: Record<string, unknown>; I: Record<string, unknown> }; gate: Record<string, { name: string; value: unknown; pass: boolean }>; allPass: boolean; gateway: { balance: string } | null; selectedShardIds: string[] }

(async () => {
  const sha = execSync("git rev-parse HEAD").toString().trim();
  const rerun = readJson<Stage1File>(`${RERUN}/04-stage1-results-and-gate.json`);
  const original = readJson<Stage1File>(`${ORIGINAL}/04-stage1-results-and-gate.json`);
  const ledger = readJson<{ spentUsd: number; calls: { shardId: string; turn: number; inputTokens: number; outputTokens: number; costUsd: number }[]; refusals: unknown[] }>(`${RERUN}/06-per-shard-ledger.json`);
  const precheck = readJson<{ gateway: { credits: { balance: string } | null } }>(`${ORIGINAL}/00-precheck.json`);
  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const docText = readFileSync("tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt", "utf-8");
  const region = frozen.callerInput.sourceContext!.regions[0]!;

  // ---- §21 per-shard rerun record (+ transport audit) and §23 classification of non-unit definitions
  const records = rerun.records.map((r) => {
    const shard = plan.shards.find((s) => s.shardId === r.shardId)!;
    const shardInput = buildShardCompilerInput(frozen.callerInput, plan, shard);
    const primary = shardInput.operativeSourceText;
    const outside = (r.definitionsOutsideOwnedUnits ?? []).map((t) => {
      const inPrimary = primary.includes(t);
      const unitElsewhere = plan.units.some((u) => u.kind === "DEFINITION" && u.normalizedTermName === normalizeDefinedTermRef(t));
      const idx = docText.indexOf(`“ ${t} ”`) >= 0 ? docText.indexOf(`“ ${t} ”`) : docText.indexOf(`“${t}”`);
      const inDoc = idx >= 0;
      const in101 = inDoc && idx >= region.charStart && idx < region.charEnd;
      return { term: t, nestedInOwnShardText: inPrimary && !unitElsewhere, isAnotherShardsUnit: unitElsewhere, definedElsewhereInDocument: inDoc && !in101 && !inPrimary, notFoundAsQuotedTerm: !inDoc && !inPrimary };
    });
    const turns = ledger.calls.filter((c) => c.shardId === r.shardId);
    return { shardId: r.shardId, shardHash: r.shardHash, ordinal: r.ordinal, oversized: r.oversized, turns: r.actual.turns, inputTokens: r.actual.inputTokens, outputTokens: r.actual.outputTokens, maxSingleTurnInputTokens: Math.max(0, ...turns.map((t) => t.inputTokens)), maxSingleTurnOutputTokens: Math.max(0, ...turns.map((t) => t.outputTokens)), latencyMs: r.actual.latencyMs, costUsd: +r.actual.costUsd.toFixed(4), toolCalls: r.toolCalls, toolCallNames: r.toolCallNames, transportDecodingFired: r.transportNormalization?.applied ?? false, decodedFields: r.transportNormalization?.decodedFields ?? [], schemaResult: r.failureReasons.includes("MODEL_SCHEMA_FAILURE") ? "MODEL_SCHEMA_FAILURE" : "ACCEPTED", compileStatus: r.compileStatus, shardStatus: r.shardStatus, failureReasons: r.failureReasons, ownedItems: r.ownedItems, ownedMaterialItems: r.ownedMaterialItems, represented: r.ownedAccountability.represented, dispositioned: r.ownedAccountability.dispositioned, missingMaterial: r.ownedAccountability.missingMaterial, byDisposition: r.ownedAccountability.byDisposition, valuesRepresented: r.ownedAccountability.valuesRepresented, valuesMissing: r.ownedAccountability.valuesMissing, danglingLineage: r.ownedAccountability.danglingLineage, lineageClaimsOnUnownedItems: r.lineageClaimsOnUnownedItems, rules: r.rules, definitions: r.definitions, sharedCapacities: r.sharedCapacities, dispositionsEmitted: r.dispositionsEmitted, definitionsOutsideOwnedUnits: outside, unresolvedContext: r.unresolvedContext, contextEntries: r.contextEntries };
  });
  writeJson(`${OUT}/06-paid-rerun-ledger.json`, { artifact: "F-7B.1 §21 paid rerun of the exact five F-7B Stage-1 shards (same plan / hashes / source / inventory / context / model / prompt / tool policy; only the transport normalizer differs)", gitSha: sha, rerunShardIds: rerun.selectedShardIds, sameShardIdsAsOriginal: JSON.stringify(rerun.selectedShardIds) === JSON.stringify(original.selectedShardIds), sameShardHashes: rerun.records.every((r) => original.records.find((o) => o.shardId === r.shardId)?.shardHash === r.shardHash), paidTurns: ledger.calls.length, paidCostUsd: +ledger.spentUsd.toFixed(4), capUsd: 3.25, refusals: ledger.refusals, gatewayBalanceBefore: precheck.gateway.credits?.balance ?? null, gatewayBalanceAfterOriginalF7B: original.gateway?.balance ?? null, gatewayBalanceAfterRerun: rerun.gateway?.balance ?? null, records });

  // ---- §22 accountability across the same 5 shards
  const mat = records.reduce((a, r) => a + r.ownedMaterialItems, 0);
  const rep = records.reduce((a, r) => a + (r.ownedMaterialItems - r.missingMaterial - Math.min(r.dispositioned, r.ownedMaterialItems)), 0); // material represented = material - missing - dispositioned (dispositioned counts all items; capped)
  const disp = records.reduce((a, r) => a + r.dispositioned, 0);
  const miss = records.reduce((a, r) => a + r.missingMaterial, 0);
  // exact material split from the partial stitch's global Pass C snapshot (authoritative for material items):
  const A = rerun.scoreSnapshot.A as { materialRepresented: number; materialDispositioned: number; materialMissing: number; materialTotal: number };
  const stage1Material = { ownedMaterialTotal: mat, representedFromPerShard: rep, dispositionedAllItemsPerShard: disp, missingPerShard: miss, globalPassCOverAll108: { represented: A.materialRepresented, dispositioned: A.materialDispositioned, missing: A.materialMissing, total: A.materialTotal, note: "108 - the 31 shards outside Stage 1 are NOT executed, so their 80 material items are MISSING by construction" }, stage1Accounted: mat - miss, stage1AccountabilityRate: +((mat - miss) / Math.max(1, mat)).toFixed(4), originalF7BStage1: { represented: 0, dispositioned: 0, missing: 28, rate: 0 } };
  writeJson(`${OUT}/07-stage1-rerun-accountability.json`, { artifact: "F-7B.1 §22 primary success test - owned material across the same 5 shards (the REAL rerun is authoritative; offline decoded historical outputs are not used here)", ...stage1Material, perShard: records.map((r) => ({ shardId: r.shardId, material: r.ownedMaterialItems, represented: r.ownedMaterialItems - r.missingMaterial - Math.min(r.dispositioned, r.ownedMaterialItems), dispositioned: r.dispositioned, missing: r.missingMaterial, byDisposition: r.byDisposition, valuesRepresented: r.valuesRepresented, valuesMissing: r.valuesMissing })) });

  // ---- §23 observations
  const snap = rerun.scoreSnapshot;
  const outsideAll = records.flatMap((r) => r.definitionsOutsideOwnedUnits.map((o) => ({ shardId: r.shardId, ...o })));
  const observations = {
    artifact: "F-7B.1 §23 shard-architecture observations (Stage 1 only; 31 shards unexecuted)",
    ownerShardSemanticRecovery: stage1Material,
    crossShardContextAdequacy: { shardsGivenContext: records.filter((r) => r.contextEntries > 0).length, missingContextShards: records.filter((r) => r.shardStatus === "SHARD_MISSING_CONTEXT").length, missingContextObjects: (snap.E as { missingContextSufficiencyObjects: number }).missingContextSufficiencyObjects, missingContextDispositions: (snap.E as { missingContextDispositions: number }).missingContextDispositions, unresolvedContextEntries: records.reduce((a, r) => a + r.unresolvedContext, 0) },
    lineageClaimsOnUnownedItems: records.reduce((a, r) => a + r.lineageClaimsOnUnownedItems, 0),
    strippedByStitcher: rerun.partialStitchDiagnostics.strippedLineage.length,
    definitionsEmittedOutsideOwnerUnits: { total: outsideAll.length, nestedInOwnShardText: outsideAll.filter((o) => o.nestedInOwnShardText).length, anotherShardsUnit: outsideAll.filter((o) => o.isAnotherShardsUnit).length, definedElsewhereInDocument: outsideAll.filter((o) => o.definedElsewhereInDocument).length, notFoundAsQuotedTerm: outsideAll.filter((o) => o.notFoundAsQuotedTerm).length, list: outsideAll },
    stitchCollisions: rerun.partialStitchDiagnostics.collisions, contextualEmissions: rerun.partialStitchDiagnostics.contextualEmissions.length,
    globalPassC: snap.A, trust: snap.trust, sourceUnverifiable: snap.H,
    oversizedShard: records.find((r) => r.oversized) ?? null,
    unsupported: snap.I,
    systematicUnderContext: records.filter((r) => r.shardStatus === "SHARD_MISSING_CONTEXT").length > 0 || (snap.E as { missingContextSufficiencyObjects: number }).missingContextSufficiencyObjects > 0 ? "evidence present - see missingContext fields" : "no MISSING_CONTEXT status, disposition or sufficiency in the 5 shards",
  };
  writeJson(`${OUT}/08-shard-architecture-observations.json`, observations);

  // ---- §24 Stage-1 rerun gate
  const t = snap.trust;
  const schemaFailures = records.filter((r) => r.schemaResult === "MODEL_SCHEMA_FAILURE").length;
  const acceptedShards = records.filter((r) => r.schemaResult === "ACCEPTED").length;
  const prodDiff = execSync(`git diff --stat ${STARTING_SHA} HEAD -- lib/ app/ prisma/ | cat`).toString().trim().split("\n").filter((l) => l.includes("|")).map((l) => l.split("|")[0]!.trim());
  const untracked = execSync("git status --porcelain lib/ app/ prisma/ | cat").toString().split("\n").filter((l) => l.trim()).map((l) => l.replace(/^.{2}\s/, "").trim());
  const touched = [...new Set([...prodDiff, ...untracked])];
  const onlyAllowed = touched.every((p) => /semantic\/(caller|wire-schema|transport-normalization)\.ts$/.test(p));
  const gate = [
    { n: 1, req: "no protocol/wire failure repeats systematically", value: { schemaFailures, accepted: acceptedShards, decodingFired: records.filter((r) => r.transportDecodingFired).length }, pass: schemaFailures === 0 || (acceptedShards >= 4 && schemaFailures <= 1) },
    { n: 2, req: "at least some real owned semantics accepted", value: { stage1Accounted: mat - miss, of: mat }, pass: mat - miss > 0 },
    { n: 3, req: "no dangerous silent omission", value: t.dangerousSilentOmissions, pass: (t.dangerousSilentOmissions ?? 1) === 0 },
    { n: 4, req: "no false completeness", value: t.falseCompleteness, pass: (t.falseCompleteness ?? 1) === 0 },
    { n: 5, req: "zero contextual ownership-credit violations", value: t.contextualOwnershipCredit, pass: (t.contextualOwnershipCredit ?? 1) === 0 },
    { n: 6, req: "no source-unverifiable IR survives", value: { count: t.sourceUnverifiableIrSurviving, list: snap.H.list }, pass: (t.sourceUnverifiableIrSurviving ?? 1) === 0 },
    { n: 7, req: "no incompatible output silently merged", value: t.conflictingDuplicateSilentlyMerged, pass: (t.conflictingDuplicateSilentlyMerged ?? 1) === 0 },
    { n: 8, req: "oversized definition remains operationally bounded", value: records.find((r) => r.oversized) ? { status: records.find((r) => r.oversized)!.shardStatus, maxTurnIn: records.find((r) => r.oversized)!.maxSingleTurnInputTokens, out: records.find((r) => r.oversized)!.outputTokens, truncated: records.find((r) => r.oversized)!.failureReasons.includes("OUTPUT_TRUNCATED") } : null, pass: !!records.find((r) => r.oversized) && !records.find((r) => r.oversized)!.failureReasons.includes("OUTPUT_TRUNCATED") && records.find((r) => r.oversized)!.shardStatus !== "SHARD_PROVIDER_FAILURE" },
    { n: 9, req: "planner/stitcher architecture unchanged", value: touched, pass: onlyAllowed },
    { n: 10, req: "results justify spending on the remaining 31 shards (judgment on 1-9 plus accountability rate; no post-hoc threshold)", value: { stage1AccountabilityRate: stage1Material.stage1AccountabilityRate, missing: miss }, pass: schemaFailures === 0 && mat - miss > 0 },
  ];
  const trustViolated = ["dangerousSilentOmissions", "falseCompleteness", "contextualOwnershipCredit", "sourceUnverifiableIrSurviving", "conflictingDuplicateSilentlyMerged", "valuesLostByStitching", "danglingReferencesCausedByStitching", "failedShardHidden"].reduce((a, k) => a + (t[k] ?? 0), 0) > 0;
  const allPass = gate.every((g) => g.pass);
  let verdict: string;
  if (trustViolated) verdict = "F7_NOT_SAFE";
  else if (allPass) verdict = "F7B_STAGE1_READY_FOR_COMPLETION";
  else verdict = "F7_NEEDS_ARCHITECTURAL_ITERATION";
  writeJson(`${OUT}/09-stage1-rerun-gate.json`, { artifact: "F-7B.1 §24 Stage-1 rerun gate", gitSha: sha, gate, allPass, trustViolated, verdict, productionFilesTouched: touched });

  // ---- §26 cost / window comparison
  const o = original, n = rerun;
  const sum = (rs: ShardRecord[], f: (r: ShardRecord) => number) => rs.reduce((a, r) => a + f(r), 0);
  const comparison = { artifact: "F-7B.1 §26 original failed Stage 1 vs rerun", original: { costUsd: o.stage1CostUsd, turns: o.stage1Calls, peakSingleTurnInput: o.maxSingleTurnInputTokens, peakOutputPerShard: o.maxActualOutputTokensPerShard, aggregateInput: sum(o.records, (r) => r.actual.inputTokens), aggregateOutput: sum(o.records, (r) => r.actual.outputTokens), schemaFailures: 5 }, rerun: { costUsd: n.stage1CostUsd, turns: n.stage1Calls, peakSingleTurnInput: n.maxSingleTurnInputTokens, peakOutputPerShard: n.maxActualOutputTokensPerShard, aggregateInput: sum(n.records, (r) => r.actual.inputTokens), aggregateOutput: sum(n.records, (r) => r.actual.outputTokens), schemaFailures }, note: "cost/window differences are not architecture-quality signals; the critical question is whether valid semantic output survives the wire boundary" };
  writeJson(`${OUT}/10-cost-window-comparison.json`, comparison);
  console.log(JSON.stringify({ verdict, gate: gate.map((g) => [g.n, g.pass]), trust: t, stage1Material, schemaFailures, decodingFired: records.filter((r) => r.transportDecodingFired).length, outside: observations.definitionsEmittedOutsideOwnerUnits, comparison: { o: comparison.original, n: comparison.rerun } }, null, 1));
  if (!existsSync(RERUN_EVIDENCE)) console.error("no rerun evidence dir");
})();
