/**
 * F-7B DIAGNOSTIC ONLY (zero cost, never used in scoring or stitching): for every shard whose real submission failed
 * schema validation because the model serialized top-level arrays as JSON STRINGS, parse those strings and report what
 * the SAME content would have yielded through the production normalize + per-shard reconciliation. This quantifies the
 * cost of the wire-tolerance gap; it does not repair, re-score or re-stitch anything.
 *   npx tsx scripts/f7b-diag-stringified.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { SubmitCompilationSchema } from "../lib/contract-model/compiler/semantic/wire-schema";
import { normalizeSubmission } from "../lib/contract-model/compiler/semantic/normalize";
import { validateCompilationUnit } from "../lib/contract-model/ir/validate";
import { buildShardCompilerInput } from "../lib/contract-model/compiler/semantic/shard-planner";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { F7B_DIR, evidencePath, freezeAndPlan, writeJson, type ShardRecord } from "./f7b-lib";

const frozen = freezeAndPlan();
const rows = [];
for (const shard of frozen.plan.shards) {
  const p = evidencePath(shard);
  if (!existsSync(p)) continue;
  const ev = JSON.parse(readFileSync(p, "utf-8")) as { record: ShardRecord; compile: { rawModelOutput: unknown; failureReasons: string[] } };
  const raw = ev.compile.rawModelOutput as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") { rows.push({ shardId: shard.shardId, status: ev.record.shardStatus, rawRetained: false }); continue; }
  const stringifiedKeys = Object.keys(raw).filter((k) => typeof raw[k] === "string" && /^\s*[\[{]/.test(raw[k] as string));
  if (stringifiedKeys.length === 0) { rows.push({ shardId: shard.shardId, status: ev.record.shardStatus, stringifiedKeys: [], note: "arrays arrived as arrays" }); continue; }
  const repaired: Record<string, unknown> = { ...raw };
  const unparseable: string[] = [];
  for (const k of stringifiedKeys) { try { repaired[k] = JSON.parse(raw[k] as string); } catch { unparseable.push(k); } }
  const parsed = SubmitCompilationSchema.safeParse(repaired);
  if (!parsed.success) { rows.push({ shardId: shard.shardId, status: ev.record.shardStatus, stringifiedKeys, unparseable, wouldValidate: false, issues: parsed.error.issues.slice(0, 5) }); continue; }
  const shardInput = buildShardCompilerInput(frozen.callerInput, frozen.plan, shard);
  const normalized = normalizeSubmission(parsed.data, shardInput);
  const validation = validateCompilationUnit({ irSchemaVersion: shardInput.irSchemaVersion, companyId: shardInput.companyId, instrumentKey: shardInput.instrumentKey, rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities });
  const acc = reconcileInventoryWithComposition({ inventory: shardInput.frozenInventory!, composition: { rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities }, dispositions: normalized.inventoryDispositions, sourceContextState: shardInput.sourceContext!.state });
  const by: Record<string, number> = {};
  for (const it of acc.items) by[it.disposition] = (by[it.disposition] ?? 0) + 1;
  rows.push({ shardId: shard.shardId, status: ev.record.shardStatus, stringifiedKeys, unparseable, wouldValidate: true, irValidationOk: validation.ok, irValidationIssues: validation.issues.length, wouldYield: { rules: normalized.rules.length, definitions: normalized.definitions.length, definitionTerms: normalized.definitions.map((d) => d.termName), dispositions: normalized.inventoryDispositions.length, ownedAccountability: { represented: acc.counts.represented, materialMissing: acc.counts.materialMissingFromComposition, valuesMissing: acc.counts.materialQuantitativeValuesMissing, byDisposition: by, semanticallyComplete: acc.semanticallyComplete } } });
}
const out = { artifact: "F-7B DIAGNOSTIC (not scoring evidence): what stringified-array submissions would have yielded if the wire schema tolerated JSON-encoded arrays", note: "The production SubmitCompilationSchema (wire-schema.ts) accepts only real arrays; the model serialized top-level arrays as strings in these shards. Nothing here changes any scored result. A wire-tolerance change is a production change and is out of scope for F-7B (§2, §28).", rows };
writeJson(`${F7B_DIR}/13-diagnostic-stringified-submissions.json`, out);
console.log(JSON.stringify(rows.map((r) => ({ shardId: r.shardId, status: r.status, stringified: (r as { stringifiedKeys?: string[] }).stringifiedKeys ?? [], wouldValidate: (r as { wouldValidate?: boolean }).wouldValidate ?? null, yield: (r as { wouldYield?: { definitions: number; ownedAccountability: unknown } }).wouldYield ? { defs: (r as { wouldYield: { definitions: number } }).wouldYield.definitions, acc: (r as { wouldYield: { ownedAccountability: unknown } }).wouldYield.ownedAccountability } : null })), null, 1));
