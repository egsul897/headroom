/**
 * F-7B.1 §1/§2/§3/§12/§13/§14/§17 - ZERO model calls.
 * Freeze the failed F-7B canary, reproduce the wire defect on the five retained raw submissions through the
 * starting-SHA path (SubmitCompilationSchema.safeParse(raw)), replay them BEFORE and AFTER the transport normalizer
 * through the production post-processing + owned-shard accountability, prove decoded content == JSON.parse(original),
 * replay every recorded valid monolithic submission (historical regression), and evaluate the zero-cost gate.
 *   npx tsx scripts/f7b1-offline.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { SubmitCompilationSchema, WireDefinitionSchema, WireIRExtensionCandidateSchema, WireInventoryDispositionSchema, WireRuleSchema, WireSharedCapacitySchema } from "../lib/contract-model/compiler/semantic/wire-schema";
import { SUBMIT_TOP_LEVEL_ARRAY_FIELDS, normalizeSubmitCompilationTransport } from "../lib/contract-model/compiler/semantic/transport-normalization";
import { normalizeSubmission } from "../lib/contract-model/compiler/semantic/normalize";
import { validateCompilationUnit } from "../lib/contract-model/ir/validate";
import { buildShardCompilerInput } from "../lib/contract-model/compiler/semantic/shard-planner";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { normalizeDefinedTermRef } from "../lib/contract-model/compiler/amendment/operative-state";
import { collectLineageIds, freezeAndPlan, readJson, sha256, writeJson, type ShardRecord } from "./f7b-lib";
import { z } from "zod";

const OUT = "docs/phase-3-remediation-f7b1";
const F7B = "docs/phase-3-remediation-f7b";
const EVIDENCE = "tests/fixtures/unseen-packages/f7b-chewy-101-canary";
const STARTING_SHA = "c58acd9c9985569f24e19355e924e0338e56bcb5";
const canonical = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const jsonType = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const ELEMENT_SCHEMA: Record<string, z.ZodTypeAny> = { rules: WireRuleSchema, definitions: WireDefinitionSchema, sharedCapacities: WireSharedCapacitySchema, irExtensionCandidates: WireIRExtensionCandidateSchema, inventoryDispositions: WireInventoryDispositionSchema, overallNotes: z.string() };
const NESTED_KEYS = new Set(["operands", "conditions", "exceptions", "dependsOn", "memberRefs", "entityScope", "entityScopeInclude", "entityScopeExclude", "inventoryItemIds", "cases", "sufficiencyReasons", "dependsOnTerms"]);
const digestOf = (id: string): string => { const i = id.indexOf(":"); return (i >= 0 ? id.slice(i + 1) : id).toLowerCase(); };

/** Any string value under a nested array-typed key that itself parses to JSON array/object = nested stringification (out of scope). */
function scanNestedStringification(o: unknown, path = "", out: string[] = []): string[] {
  if (!o || typeof o !== "object") return out;
  if (Array.isArray(o)) { o.forEach((x, i) => scanNestedStringification(x, `${path}[${i}]`, out)); return out; }
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (NESTED_KEYS.has(k) && typeof v === "string") { try { const p = JSON.parse(v); if (p && typeof p === "object") out.push(`${path}.${k}`); } catch { /* prose string: not stringified JSON */ } }
    if (v && typeof v === "object") scanNestedStringification(v, `${path}.${k}`, out);
  }
  return out;
}

(async () => {
  const sha = execSync("git rev-parse HEAD").toString().trim();
  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const f7bPlan = readJson<{ planHash: string; shards: { shardId: string; shardHash: string }[] }>(`${F7B}/01-frozen-plan.json`);
  const selection = readJson<{ selectedShardIds: string[] }>(`${F7B}/03-stage1-selection.json`);
  const gatesFile = readFileSync(`${F7B}/02-scorer-and-gates.json`);
  const prodDiffAtF7bStart = execSync("git diff --stat 8b6bd445ae56bb6d66406706d76b45a83ac690be c58acd9c9985569f24e19355e924e0338e56bcb5 -- lib/ app/ prisma/ | tail -1").toString().trim();

  // ---- §1 freeze
  const rawByShard = new Map<string, { raw: unknown; record: ShardRecord; path: string }>();
  for (const s of plan.shards) {
    const p = `${EVIDENCE}/shard-${String(s.ordinal).padStart(2, "0")}-${s.shardId.replace("shard:", "")}.json`;
    if (existsSync(p)) { const ev = readJson<{ record: ShardRecord; compile: { rawModelOutput: unknown } }>(p); rawByShard.set(s.shardId, { raw: ev.compile.rawModelOutput, record: ev.record, path: p }); }
  }
  const freeze = {
    artifact: "F-7B.1 §1 freeze of the failed F-7B canary", startingSha: STARTING_SHA, gitSha: sha, shaMatches: sha === STARTING_SHA,
    productionDiffAtF7bStart: prodDiffAtF7bStart || "(none)", productionDiffAtF7bStartWasZero: prodDiffAtF7bStart === "",
    planHash: plan.planHash, planHashMatchesF7A: plan.planHash === "67d9f086341b4677ca35697fcfb6878cb88ef92b9c0418ea32be96be741cfe36", planHashMatchesF7BFrozenPlan: plan.planHash === f7bPlan.planHash,
    shardHashesSha256: sha256(JSON.stringify(plan.shards.map((s) => [s.shardId, s.shardHash]))), shardHashesMatchF7B: plan.shards.every((s, i) => f7bPlan.shards[i]?.shardId === s.shardId && f7bPlan.shards[i]?.shardHash === s.shardHash),
    stage1ShardIds: selection.selectedShardIds, retainedRawSubmissions: [...rawByShard.entries()].map(([id, v]) => ({ shardId: id, path: v.path, rawSha256: sha256(JSON.stringify(v.raw)) })),
    retainedCount: rawByShard.size, allFiveRetained: selection.selectedShardIds.every((id) => rawByShard.has(id)),
    scorerAndGatesSha256: sha256(gatesFile), identity: frozen.identity,
  };
  writeJson(`${OUT}/01-freeze.json`, freeze);

  // ---- §2 reproduction through the starting-SHA path + §3 classification evidence
  const repro = selection.selectedShardIds.map((id) => {
    const { raw, record } = rawByShard.get(id)!;
    const obj = (raw ?? {}) as Record<string, unknown>;
    const before = SubmitCompilationSchema.safeParse(raw);
    const fields = SUBMIT_TOP_LEVEL_ARRAY_FIELDS.map((f) => {
      const v = obj[f]; const t = Object.prototype.hasOwnProperty.call(obj, f) ? jsonType(v) : "absent";
      let parses: boolean | null = null, parsedType: string | null = null, arrayLength: number | null = null, elementsValid: boolean | null = null, elementIssues = 0;
      if (t === "string") { try { const p = JSON.parse(v as string); parses = true; parsedType = jsonType(p); if (Array.isArray(p)) { arrayLength = p.length; const sch = ELEMENT_SCHEMA[f]!; const bad = p.filter((e) => !sch.safeParse(e).success).length; elementsValid = bad === 0; elementIssues = bad; } } catch { parses = false; } }
      return { field: f, runtimeType: t, isString: t === "string", parsesAsJson: parses, parsedType, decodedArrayLength: arrayLength, decodedElementsSatisfyWireSchema: elementsValid, invalidElements: elementIssues };
    });
    return { shardId: id, rawTopLevelKeys: Object.keys(obj), fields, stringifiedFields: fields.filter((f) => f.isString).map((f) => f.field), schemaSuccessAtStartingSha: before.success, schemaErrors: before.success ? [] : before.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), nestedStringification: scanNestedStringification(Object.fromEntries(fields.filter((f) => f.isString && f.parsedType === "array").map((f) => [f.field, JSON.parse(obj[f.field] as string)]))), originalFailure: { compileStatus: record.compileStatus, shardStatus: record.shardStatus, failureReasons: record.failureReasons } };
  });
  const allReproduced = repro.every((r) => !r.schemaSuccessAtStartingSha && r.stringifiedFields.length > 0 && r.schemaErrors.every((e) => /expected array, received string/.test(e)));
  const anyNested = repro.some((r) => r.nestedStringification.length > 0);
  const classification = {
    artifact: "F-7B.1 §2/§3 root-cause reproduction + classification (0 model calls)",
    reproducedOnAllFive: allReproduced,
    classification: anyNested ? "B NESTED_JSON_STRING_VARIANCE (scope expansion required)" : "A TOP_LEVEL_JSON_ARRAY_STRING_TRANSPORT_VARIANCE",
    earliestFailingFunction: "RealSemanticCaller.compile -> SubmitCompilationSchema.safeParse(submitBlock.input) (lib/contract-model/compiler/semantic/caller.ts, the first statement after the submit_compilation tool_use block is located)",
    stringificationPresentInProviderToolInput: true,
    evidenceForProviderOrigin: "rawSubmission on every retained result is `submitBlock.input` stored by finish() without transformation; submitBlock is the Anthropic SDK's ToolUseBlock from stream.finalMessage(); no Headroom code touches the input between receipt and safeParse (verified by reading caller.ts at the starting SHA); the strings are therefore present in the tool input as delivered by the provider. Whether the model itself emitted them or the gateway serialized them is not distinguishable from the retained evidence and does not change the remedy.",
    toolSchemaMismatchRuledOut: "the tool's input_schema advertised to the model is z.toJSONSchema(SubmitCompilationSchema): every affected field is declared as an array there; the returned strings contradict the advertised schema, so this is transport variance, not a schema mismatch",
    callerCorruptionRuledOut: "no serialization step exists between the SDK block and safeParse; the retained raw equals the SDK block",
    fieldsObservedStringified: [...new Set(repro.flatMap((r) => r.stringifiedFields))],
    nestedStringificationObserved: anyNested,
    perShard: repro,
  };
  writeJson(`${OUT}/00-root-cause-reproduction.json`, classification);

  // ---- §12/§13 replay BEFORE (starting-SHA semantics = schema failure) and AFTER (normalizer) through production post-processing
  const inv = frozen.callerInput.frozenInventory!;
  const material = new Set(inv.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").map((i) => i.inventoryItemId));
  const diag = existsSync(`${F7B}/13-diagnostic-stringified-submissions.json`) ? readJson<{ rows: { shardId: string; wouldYield?: { definitions: number; ownedAccountability: { represented: number; materialMissing: number } } }[] }>(`${F7B}/13-diagnostic-stringified-submissions.json`) : null;
  const replay = selection.selectedShardIds.map((id) => {
    const shard = plan.shards.find((s) => s.shardId === id)!;
    const { raw } = rawByShard.get(id)!;
    const shardInput = buildShardCompilerInput(frozen.callerInput, plan, shard);
    const before = SubmitCompilationSchema.safeParse(raw);
    const transport = normalizeSubmitCompilationTransport(raw);
    const after = SubmitCompilationSchema.safeParse(transport.value);
    // §13 equality: for every decoded field, the value handed to the schema must equal JSON.parse(original string) exactly
    const equality = transport.audit.fields.filter((f) => f.applied).map((f) => { const original = (raw as Record<string, unknown>)[f.field] as string; const decoded = (transport.value as Record<string, unknown>)[f.field]; return { field: f.field, originalStringSha256: f.originalStringSha256, originalStringSha256Recomputed: sha256(original), jsonParseOfOriginalSha256: canonical(JSON.parse(original)), decodedValueSha256: canonical(decoded), equal: canonical(JSON.parse(original)) === canonical(decoded), elementCount: (decoded as unknown[]).length, elementCountOfParse: (JSON.parse(original) as unknown[]).length }; });
    const untouched = SUBMIT_TOP_LEVEL_ARRAY_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(raw as object, f) && !transport.audit.fields.find((x) => x.field === f)?.applied).every((f) => (transport.value as Record<string, unknown>)[f] === (raw as Record<string, unknown>)[f]);
    if (!after.success) return { shardId: id, decodedFields: transport.audit.fields.filter((f) => f.applied).map((f) => f.field), schemaValidBefore: before.success, schemaValidAfter: false, schemaErrorsAfter: after.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`), equality, untouchedFieldsIdentical: untouched };
    const normalized = normalizeSubmission(after.data, shardInput);
    const validation = validateCompilationUnit({ irSchemaVersion: shardInput.irSchemaVersion, companyId: shardInput.companyId, instrumentKey: shardInput.instrumentKey, rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities });
    const acc = reconcileInventoryWithComposition({ inventory: shardInput.frozenInventory!, composition: { rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities }, dispositions: normalized.inventoryDispositions, sourceContextState: shardInput.sourceContext!.state });
    const by: Record<string, number> = {}; for (const it of acc.items) by[it.disposition] = (by[it.disposition] ?? 0) + 1;
    const owned = new Set(shard.ownedItemIds); const ownedDigests = new Set(shard.ownedItemIds.map(digestOf));
    const lineage = collectLineageIds({ rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities });
    const unownedClaims = lineage.filter((l) => !owned.has(l) && !ownedDigests.has(digestOf(l)));
    const ownedTerms = new Set(shard.ownedUnitKeys.map((k) => plan.units.find((u) => u.unitKey === k)?.normalizedTermName).filter((t): t is string => Boolean(t)));
    const outside = normalized.definitions.map((d) => d.termName).filter((t) => !ownedTerms.has(normalizeDefinedTermRef(t)));
    // Are the non-unit terms nested defined terms inside THIS shard's own primary text (quoted "Term" means ...) rather than cross-shard emissions?
    const primary = shardInput.operativeSourceText;
    const outsideDetail = outside.map((t) => { const quoted = new RegExp(`[\u201c"]\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[\u201d"]`); const inPrimary = quoted.test(primary) || primary.includes(t); const isUnitElsewhere = plan.units.some((u) => u.kind === "DEFINITION" && u.normalizedTermName === normalizeDefinedTermRef(t)); return { term: t, definedInsideShardPrimaryText: inPrimary, isDefinitionUnitOwnedByAnotherShard: isUnitElsewhere }; });
    const matOwned = shard.ownedItemIds.filter((i) => material.has(i)).length;
    const matRep = acc.items.filter((i) => material.has(i.inventoryItemId) && i.disposition === "REPRESENTED").length;
    const matDisp = acc.items.filter((i) => material.has(i.inventoryItemId) && i.disposition !== "REPRESENTED" && i.disposition !== "MISSING_FROM_COMPOSITION").length;
    const d13 = diag?.rows.find((r) => r.shardId === id)?.wouldYield;
    return { shardId: id, decodedFields: transport.audit.fields.filter((f) => f.applied).map((f) => f.field), schemaValidBefore: before.success, schemaValidAfter: true, rules: normalized.rules.length, definitions: normalized.definitions.length, sharedCapacities: normalized.sharedCapacities.length, dispositions: normalized.inventoryDispositions.length, irExtensionCandidates: normalized.irExtensionCandidates.length, irValidationOk: validation.ok, irValidationIssues: validation.issues.length, normalizationWarnings: normalized.warnings.length, ownedMaterialTotal: matOwned, ownedMaterialRepresented: matRep, ownedMaterialDispositioned: matDisp, ownedMaterialMissing: acc.counts.materialMissingFromComposition, valuesRepresented: acc.items.reduce((a, i) => a + i.quantitative.filter((q) => q.disposition === "VALUE_PRESENT_IN_IR").length, 0), valuesMissing: acc.counts.materialQuantitativeValuesMissing, byDisposition: by, lineageClaims: lineage.length, claimsOnUnownedInventory: unownedClaims.length, definitionsOutsideOwnedUnits: outside, definitionsOutsideOwnedUnitsDetail: outsideDetail, definitionsOutsideThatAreOtherShardsUnits: outsideDetail.filter((o) => o.isDefinitionUnitOwnedByAnotherShard).length, definitionsOutsideNestedInOwnText: outsideDetail.filter((o) => o.definedInsideShardPrimaryText && !o.isDefinitionUnitOwnedByAnotherShard).length, equality, untouchedFieldsIdentical: untouched, matchesF7BDiagnostic: d13 ? d13.definitions === normalized.definitions.length && d13.ownedAccountability.represented === acc.counts.represented && d13.ownedAccountability.materialMissing === acc.counts.materialMissingFromComposition : null };
  });
  const allValidAfter = replay.every((r) => r.schemaValidAfter);
  const allEqual = replay.every((r) => r.equality.every((e) => e.equal && e.originalStringSha256 === e.originalStringSha256Recomputed) && r.untouchedFieldsIdentical);
  const totals = { ownedMaterialTotal: replay.reduce((a, r) => a + ((r as { ownedMaterialTotal?: number }).ownedMaterialTotal ?? 0), 0), represented: replay.reduce((a, r) => a + ((r as { ownedMaterialRepresented?: number }).ownedMaterialRepresented ?? 0), 0), dispositioned: replay.reduce((a, r) => a + ((r as { ownedMaterialDispositioned?: number }).ownedMaterialDispositioned ?? 0), 0), missing: replay.reduce((a, r) => a + ((r as { ownedMaterialMissing?: number }).ownedMaterialMissing ?? 0), 0), claimsOnUnowned: replay.reduce((a, r) => a + ((r as { claimsOnUnownedInventory?: number }).claimsOnUnownedInventory ?? 0), 0), definitionsOutside: replay.reduce((a, r) => a + ((r as { definitionsOutsideOwnedUnits?: string[] }).definitionsOutsideOwnedUnits?.length ?? 0), 0) };
  writeJson(`${OUT}/02-offline-replay-before-after.json`, { artifact: "F-7B.1 §12 retained-raw replay: BEFORE (starting-SHA schema) and AFTER (transport normalizer -> schema -> normalizeSubmission -> IR validation -> owned-shard reconciliation)", gitSha: sha, allFiveSchemaValidAfter: allValidAfter, semanticPayloadExactEquality: allEqual, totals, perShard: replay, note: "offline replay of RETAINED outputs; the paid rerun (05/06) is authoritative for semantic recovery" });
  writeJson(`${OUT}/03-transport-normalization-audit.json`, { artifact: "F-7B.1 §9 transport normalization audit for the five retained submissions", perShard: selection.selectedShardIds.map((id) => ({ shardId: id, audit: normalizeSubmitCompilationTransport(rawByShard.get(id)!.raw).audit })) });

  // ---- §14 historical regression over every recorded valid raw submission in the fixtures
  const historical: { source: string; fieldsAllArrays: boolean; sameReference: boolean; auditApplied: boolean; parsedBefore: boolean; parsedAfter: boolean; byteIdentical: boolean }[] = [];
  const check = (source: string, raw: unknown) => { const before = SubmitCompilationSchema.safeParse(raw); const t = normalizeSubmitCompilationTransport(raw); const after = SubmitCompilationSchema.safeParse(t.value); historical.push({ source, fieldsAllArrays: SUBMIT_TOP_LEVEL_ARRAY_FIELDS.every((f) => !Object.prototype.hasOwnProperty.call(raw as object, f) || Array.isArray((raw as Record<string, unknown>)[f])), sameReference: t.value === raw, auditApplied: t.audit.applied, parsedBefore: before.success, parsedAfter: after.success, byteIdentical: JSON.stringify(before.success ? before.data : null) === JSON.stringify(after.success ? after.data : null) }); };
  check("phase-3-validation-chwy-paid-run/unit-6.08.json#compile", readJson<{ compile: { rawModelOutput: unknown } }>("tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json").compile.rawModelOutput);
  for (const f of ["tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json", "tests/fixtures/unseen-packages/phase-3b1-real-revalidation-rerun/run-1787870304722.json", "tests/fixtures/unseen-packages/phase-3b1-real-revalidation-rerun/run-1787871112005.json"]) {
    const d = readJson<{ results: { result: { rawModelOutput: unknown } }[] }>(f);
    d.results.forEach((r, i) => { if (r.result?.rawModelOutput && typeof r.result.rawModelOutput === "object") check(`${f}#results[${i}]`, r.result.rawModelOutput); });
  }
  const historicalOk = historical.every((h) => h.sameReference && !h.auditApplied && h.byteIdentical && h.parsedBefore === h.parsedAfter);
  writeJson(`${OUT}/04-historical-valid-input-regression.json`, { artifact: "F-7B.1 §14 already-valid recorded submissions through the normalizer: must be same-reference, audit not applied, byte-identical parse", count: historical.length, allUnchanged: historicalOk, rows: historical });

  // ---- §17 zero-cost gate
  let tests = "not run";
  try { tests = execSync("npx vitest run tests/contract-model/semantic-compiler/f7b1-transport-normalization.test.ts tests/contract-model/semantic-compiler/caller-loop.test.ts tests/contract-model/semantic-compiler/caller-tool-protocol.test.ts tests/contract-model/semantic-compiler/caller-transport.test.ts tests/contract-model/semantic-compiler/caller-tool-discipline.test.ts tests/contract-model/f7a-shard-planner-stitcher.test.ts 2>&1 | grep -E 'Tests |Test Files' | tail -2").toString().trim(); } catch (e) { tests = `vitest error: ${(e as Error).message.slice(0, 400)}`; }
  const prodDiff = execSync(`git diff --stat ${STARTING_SHA} -- lib/ app/ prisma/ | cat`).toString().trim();
  const untrackedLib = execSync("git status --porcelain lib/ app/ prisma/ | cat").toString().split("\n").filter((l) => l.trim().length > 0).map((l) => l.replace(/^.{2}\s/, "").trim());
  const touched = [...new Set([...prodDiff.split("\n").filter((l) => l.includes("|")).map((l) => l.split("|")[0]!.trim()), ...untrackedLib])];
  const allowed = touched.every((p) => /lib\/contract-model\/compiler\/semantic\/(caller|wire-schema|transport-normalization)\.ts$/.test(p));
  const gate = [
    { n: 1, req: "exact defect reproduced on all 5 retained submissions", pass: allReproduced },
    { n: 2, req: "defect is top-level transport shape only", pass: !anyNested && repro.every((r) => r.fields.filter((f) => f.isString).every((f) => f.parsedType === "array")) },
    { n: 3, req: "no nested scope expansion required", pass: !anyNested },
    { n: 4, req: "all 5 normalize through the existing schema", pass: allValidAfter },
    { n: 5, req: "semantic payload hashes unchanged by normalization", pass: allEqual },
    { n: 6, req: "already-valid historical submissions unchanged", pass: historicalOk },
    { n: 7, req: "malformed / non-array strings still fail (synthetic matrix F/G/H/I/J/K)", pass: /failed/.test(tests) ? false : /passed/.test(tests) },
    { n: 8, req: "relevant tests pass", pass: /passed/.test(tests) && !/failed/.test(tests) },
    { n: 9, req: "no shard / planner / stitcher / prompt / normalization / IR change", pass: allowed, touched },
  ];
  const pass = gate.every((g) => g.pass);
  writeJson(`${OUT}/05-zero-cost-gate.json`, { artifact: "F-7B.1 §17 zero-cost gate before the paid rerun", gitSha: sha, gate, allPass: pass, tests, productionFilesTouched: touched, verdictIfFail: pass ? null : anyNested ? "F7B_1_SCOPE_EXPANSION_REQUIRED" : !allValidAfter ? "F7B_1_OFFLINE_REPLAY_FAILED" : "F7B_1_GATE_FAILED" });
  console.log(JSON.stringify({ reproducedAll: allReproduced, classification: classification.classification, nested: anyNested, allValidAfter, allEqual, historical: { count: historical.length, ok: historicalOk }, totals, tests, touched, gatePass: pass }, null, 1));
})();
