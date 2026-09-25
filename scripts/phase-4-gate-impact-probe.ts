/**
 * PHASE-4 VERIFICATION GATE - migration step 3, §27/§28: real-envelope impact probe.
 *
 * Takes every preserved Phase-3 verification result whose compiled unit is ALSO preserved beside
 * it (the 87 bindable MATERIAL findings from the steps-1+2 corpus report), resolves it into an
 * envelope, and runs the gate over the real IR exactly as a caller would: evaluateRule per bound
 * rule, evaluateCapacityState over each artifact's rule set with and without the envelope, and a
 * REQUIRE simulation. Then it classifies every UNIT block by cause so the false-positive pressure
 * can be read rather than guessed.
 *
 * THIS IS A FUNCTIONAL IMPACT PROBE, NOT A PREVALENCE ESTIMATE. 411 of the 498 material findings in
 * the corpus name a unit whose IR was not preserved beside the verification result and cannot be
 * bound at all (the preservation gap reported at steps 1+2). Nothing here says how often the gate
 * would fire over the population.
 *
 * Zero cost: reads files, evaluates deterministically, calls nothing. No financial inputs are
 * supplied, so a capacity that depends on a fact is NEEDS_INPUT before and after; the probe reports
 * transitions, not absolute availability.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveRuntimeVerificationEnvelope, type ResolverUnitInput } from "../lib/contract-model/verification-envelope/resolver";
import { evaluateRule } from "../lib/contract-model/runtime/rule-evaluator";
import { evaluateExpression } from "../lib/contract-model/runtime/evaluate-expression";
import { buildCapacityGraph } from "../lib/contract-model/runtime/capacity/graph";
import { evaluateCapacityState } from "../lib/contract-model/runtime/capacity/state";
import { fixtureInputResolver } from "../lib/contract-model/runtime/input-resolver";
import { blocksUnit, verificationBlocksIn } from "../lib/contract-model/runtime/verification-gate";
import type { RuntimeVerificationEnvelope } from "../lib/contract-model/runtime/verification-envelope";
import type { IRDefinition, IRRule } from "../lib/contract-model/ir/types";
import type { SemanticVerificationResult } from "../lib/contract-model/compiler/semantic-verification/types";
import type { CapacityStatus } from "../lib/contract-model/runtime/capacity/types";

const ROOTS = ["docs", "tests/fixtures/unseen-packages"];

function* jsonFiles(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonFiles(full);
    else if (e.isFile() && e.name.endsWith(".json")) yield full;
  }
}
function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) { for (const v of node) yield* walk(v); return; }
  if (typeof node !== "object" || node === null) return;
  yield node as Record<string, unknown>;
  for (const v of Object.values(node as Record<string, unknown>)) yield* walk(v);
}
const isVerification = (o: Record<string, unknown>) =>
  Array.isArray(o.findings) && typeof o.status === "string" && ("reconciliation" in o || "irInventory" in o || "sourceInventory" in o || "verifierAlgorithmVersion" in o);

const bump = (m: Record<string, number>, k: string, by = 1) => { m[k] = (m[k] ?? 0) + by; };

export interface UnitBlockRecord {
  file: string;
  unitId: string;
  unitKind: "RULE" | "DEFINITION";
  reason: string;
  findings: { findingId: string; findingType: string; resolution: string; irPathAsGiven: string | null; reasonExcerpt: string }[];
  /** Deterministic cause classification of the UNIT block - which resolver outcome(s) produced it. */
  causes: string[];
  /** Whether the finding's own text names something narrower than the whole unit (a hint of over-breadth, judged by the reader, not by this probe). */
  pathNamesSubpart: boolean;
}

export function probe() {
  const counts: Record<string, number> = {};
  const nodeBlocks: { file: string; unitId: string; exprId: string; findingIds: string[] }[] = [];
  const unitBlocks: UnitBlockRecord[] = [];
  const ruleStatusBefore: Record<string, number> = {};
  const ruleStatusAfter: Record<string, number> = {};
  const capBefore: Record<string, number> = {};
  const capAfter: Record<string, number> = {};
  const transitions: Record<string, number> = {};
  const requireMissing: Record<string, number> = {};
  let identityMismatchBlocks = 0;
  let boundUnits = 0, boundRules = 0, boundDefinitions = 0, unevaluable = 0;
  const seen = new Set<string>();

  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of jsonFiles(root)) {
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
      const rules = new Map<string, IRRule>();
      const definitions = new Map<string, IRDefinition>();
      for (const o of walk(parsed)) {
        if (Array.isArray(o.rules)) for (const r of o.rules as IRRule[]) if (r && typeof r.ruleId === "string") rules.set(r.ruleId, r);
        if (Array.isArray(o.definitions)) for (const d of o.definitions as IRDefinition[]) if (d && typeof d.definitionId === "string") definitions.set(d.definitionId, d);
      }
      for (const o of walk(parsed)) {
        if (!isVerification(o)) continue;
        const v = o as unknown as SemanticVerificationResult;
        const material = (v.findings ?? []).filter((f) => f?.severity === "MATERIAL");
        if (material.length === 0) continue;
        const byUnit = new Map<string, typeof material>();
        for (const f of material) byUnit.set(f.ruleOrDefinitionId ?? "(none)", [...(byUnit.get(f.ruleOrDefinitionId ?? "(none)") ?? []), f]);
        const units: ResolverUnitInput[] = [];
        for (const [id, fs2] of byUnit) {
          const r = rules.get(id), d = definitions.get(id);
          if (!r && !d) continue;
          units.push({ kind: r ? "RULE" : "DEFINITION", unit: (r ?? d)!, verification: { ...v, findings: fs2 } as SemanticVerificationResult });
        }
        if (units.length === 0) continue;
        const companyId = units[0]!.unit.companyId ?? "(none)", instrumentKey = units[0]!.unit.instrumentKey ?? "(none)";
        const out = resolveRuntimeVerificationEnvelope({ companyId, instrumentKey, units });
        const envelope: RuntimeVerificationEnvelope = out.envelope;
        const auditByFinding = new Map(out.audit.map((a) => [a.findingId, a]));
        bump(counts, "MATERIAL_FINDINGS_PROBED", out.counts.MATERIAL_OUT);

        // dedupe: the same verification object can be walked more than once when an artifact nests it
        const key = createHash("sha256").update(JSON.stringify({ file, ids: [...byUnit.keys()].sort(), h: v.evidenceSetHash ?? null, at: (v as { verifiedAt?: string }).verifiedAt ?? null })).digest("hex");
        if (seen.has(key)) { bump(counts, "DUPLICATE_WALKS_SKIPPED"); continue; }
        seen.add(key);

        const allRules = [...rules.values()].filter((r) => r.companyId === companyId && r.instrumentKey === instrumentKey);
        const allDefs = [...definitions.values()];
        const inputs = fixtureInputResolver({ metrics: [], definitions: allDefs, rules: allRules });

        for (const u of units) {
          boundUnits++;
          const unitId = u.kind === "RULE" ? (u.unit as IRRule).ruleId : (u.unit as IRDefinition).definitionId;
          const identity = { ruleOrDefinitionId: unitId, companyId: u.unit.companyId, instrumentKey: u.unit.instrumentKey, irSchemaVersion: u.unit.irSchemaVersion, compilerVersion: u.unit.compilerVersion ?? null, sourceContentVersion: u.unit.sourceContentVersion ?? null };
          const ub = blocksUnit(unitId, envelope, undefined, identity);
          if (ub?.reason === "IDENTITY_MISMATCH") identityMismatchBlocks++;
          const record = envelope.units.find((x) => x.identity.ruleOrDefinitionId === unitId)!;
          if (ub) {
            const fl = record.materialFindings.filter((f) => f.scope === "UNIT").map((f) => {
              const a = auditByFinding.get(f.findingId);
              return { findingId: f.findingId, findingType: f.findingType, resolution: a?.resolution ?? "?", irPathAsGiven: f.irPathAsGiven, reasonExcerpt: f.reason.slice(0, 160) };
            });
            const causes = [...new Set(fl.map((f) => f.resolution))].sort();
            unitBlocks.push({ file, unitId, unitKind: u.kind, reason: ub.reason, findings: fl, causes, pathNamesSubpart: fl.some((f) => f.irPathAsGiven !== null && /\.(capacityExpression|conditions|calculationExpression|exceptions|gatedBy|sufficiency|entityScope)/.test(f.irPathAsGiven)) });
            bump(counts, `UNIT_BLOCK:${ub.reason}`);
            for (const c of causes) bump(counts, `UNIT_BLOCK_CAUSE:${c}`);
          }
          if (u.kind === "RULE") {
            boundRules++;
            const rule = u.unit as IRRule;
            try {
              const before = evaluateRule(rule, inputs, {});
              const after = evaluateRule(rule, inputs, { verification: envelope });
              bump(ruleStatusBefore, before.status); bump(ruleStatusAfter, after.status);
              const evs = [after.capacity, ...after.conditions.map((c) => c.evaluation)];
              for (const e of evs) for (const b of verificationBlocksIn(e)) if (b.scope === "NODE") nodeBlocks.push({ file, unitId: b.unitId, exprId: b.exprId!, findingIds: b.findingIds });
            } catch { unevaluable++; }
          } else {
            boundDefinitions++;
            const def = u.unit as IRDefinition;
            if (def.calculationExpression) {
              try {
                const after = evaluateExpression({ expression: def.calculationExpression, inputs, context: { definitionId: def.definitionId, unitId: def.definitionId, companyId, instrumentKey }, verification: envelope });
                for (const b of verificationBlocksIn(after)) if (b.scope === "NODE") nodeBlocks.push({ file, unitId: b.unitId, exprId: b.exprId!, findingIds: b.findingIds });
              } catch { unevaluable++; }
            }
          }
        }

        // 4C over the artifact's whole rule set, before and after, plus REQUIRE
        try {
          const graph = buildCapacityGraph({ companyId, instrumentKey, rules: allRules, definitions: allDefs, asOf: "2026-01-01" });
          const before = evaluateCapacityState({ graph, rules: allRules, definitions: allDefs, inputs, asOf: "2026-01-01" });
          const after = evaluateCapacityState({ graph, rules: allRules, definitions: allDefs, inputs, asOf: "2026-01-01", verification: envelope });
          const strict = evaluateCapacityState({ graph, rules: allRules, definitions: allDefs, inputs, asOf: "2026-01-01", verification: envelope, policy: "REQUIRE" });
          const b = new Map(before.capacities.map((c) => [c.capacityNodeId, c.status]));
          for (const c of after.capacities) {
            const was = b.get(c.capacityNodeId) as CapacityStatus;
            bump(capBefore, was); bump(capAfter, c.status);
            if (was !== c.status) bump(transitions, `${was}->${c.status}`);
          }
          for (const c of strict.capacities) if (c.limitations.some((l) => l.code === "PHASE3_VERIFICATION_MATERIAL_FINDING" && l.message.startsWith("[REQUIRED_VERIFICATION_MISSING]"))) bump(requireMissing, "capacities");
          bump(requireMissing, "rulesInArtifactsProbed", allRules.length);
        } catch (e) { bump(counts, "ARTIFACT_STATE_UNEVALUABLE"); }
      }
    }
  }

  const uniqueNode = new Map<string, typeof nodeBlocks[number]>();
  for (const nb of nodeBlocks) uniqueNode.set(`${nb.file}|${nb.unitId}|${nb.exprId}`, nb);
  const causeTable: Record<string, { unitBlocks: number; findings: number; pathNamesSubpart: number; findingTypes: Record<string, number> }> = {};
  for (const ub of unitBlocks) for (const f of ub.findings) {
    const t = causeTable[f.resolution] ?? (causeTable[f.resolution] = { unitBlocks: 0, findings: 0, pathNamesSubpart: 0, findingTypes: {} });
    t.findings++;
    bump(t.findingTypes, f.findingType);
  }
  for (const ub of unitBlocks) for (const c of ub.causes) { causeTable[c]!.unitBlocks++; if (ub.pathNamesSubpart) causeTable[c]!.pathNamesSubpart++; }

  return {
    caveat: "FUNCTIONAL IMPACT PROBE ONLY - not a prevalence estimate. Only findings whose unit IR is preserved beside the verification result can be bound (87 of 498 material findings at steps 1+2). No financial inputs were supplied.",
    materialFindingsProbed: counts.MATERIAL_FINDINGS_PROBED ?? 0,
    boundUnits, boundRules, boundDefinitions, unevaluableUnits: unevaluable,
    nodeBlocks: { distinctNodes: uniqueNode.size, occurrences: nodeBlocks.length },
    unitBlocks: { total: unitBlocks.length, byReason: Object.fromEntries(Object.entries(counts).filter(([k]) => k.startsWith("UNIT_BLOCK:")).map(([k, v]) => [k.slice("UNIT_BLOCK:".length), v])) },
    identityMismatchBlocks,
    identityMismatchNote: "0 by construction: each envelope was resolved from the very IR object it is checked against. A mismatch needs a stale record, which this corpus cannot exhibit.",
    requireSimulation: { capacitiesFailingClosedForMissingRecord: requireMissing.capacities ?? 0, rulesInArtifactsProbed: requireMissing.rulesInArtifactsProbed ?? 0 },
    ruleEvaluationStatus: { before: ruleStatusBefore, after: ruleStatusAfter },
    capacityStatus: { before: capBefore, after: capAfter, transitions },
    previouslyAvailableNow: {
      REVIEW_REQUIRED: transitions["AVAILABLE->REVIEW_REQUIRED"] ?? 0,
      UNSUPPORTED: transitions["AVAILABLE->UNSUPPORTED"] ?? 0,
      AMBIGUOUS: transitions["AVAILABLE->AMBIGUOUS"] ?? 0,
    },
    unitBlockCauses: causeTable,
    unitBlockInspection: unitBlocks.map((u) => ({ ...u, file: u.file.replace(/^docs\//, "") })),
    artifactStateUnevaluable: counts.ARTIFACT_STATE_UNEVALUABLE ?? 0,
  };
}

if (process.argv[1]?.endsWith("phase-4-gate-impact-probe.ts")) {
  const r = probe();
  const dir = "docs/phase-4-verification-gate";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "02-real-envelope-impact-probe.json"), JSON.stringify({ mission: "HEADROOM PHASE-4 - verification gate, migration step 3", section: "§27 real envelope impact probe + §28 false-positive inspection", paidModelCalls: 0, ...r }, null, 2));
  const { unitBlockInspection, ...summary } = r;
  console.log(JSON.stringify({ ...summary, unitBlockInspectionEntries: unitBlockInspection.length }, null, 1));
}
