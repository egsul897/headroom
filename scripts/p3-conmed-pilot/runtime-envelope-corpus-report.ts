/**
 * Migration step 2, §22 - run the resolver over every preserved verification artifact and report
 * what actually resolves.
 *
 * The design estimated 498 MATERIAL findings, 208 machine-resolvable, 290 collapsing to UNIT. This
 * measures it against the real resolver rather than against a regex, which is the point: the
 * estimate counted paths that LOOK parseable; the resolver also has to find the node.
 *
 * Zero cost: reads files, calls nothing.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveRuntimeVerificationEnvelope, type PathResolution, type ResolverUnitInput } from "../../lib/contract-model/verification-envelope/resolver";
import type { IRDefinition, IRRule } from "../../lib/contract-model/ir/types";
import type { SemanticVerificationResult } from "../../lib/contract-model/compiler/semantic-verification/types";

const ROOTS = ["docs", "tests/fixtures/unseen-packages"];

function* jsonFiles(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
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

export function report() {
  const counts: Record<string, number> = {};
  const bump = (k: string, by = 1) => { counts[k] = (counts[k] ?? 0) + by; };
  let verificationResults = 0, unitsResolved = 0, strong = 0, weak = 0, missingUnitIdentity = 0;
  const samples: Record<string, string[]> = {};

  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of jsonFiles(root)) {
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }

      // index every compiled unit in this artifact by id, so findings can be bound to the unit they name
      const rules = new Map<string, IRRule>();
      const definitions = new Map<string, IRDefinition>();
      for (const o of walk(parsed)) {
        if (Array.isArray(o.rules)) for (const r of o.rules as IRRule[]) if (r && typeof r.ruleId === "string") rules.set(r.ruleId, r);
        if (Array.isArray(o.definitions)) for (const d of o.definitions as IRDefinition[]) if (d && typeof d.definitionId === "string") definitions.set(d.definitionId, d);
      }

      for (const o of walk(parsed)) {
        if (!isVerification(o)) continue;
        verificationResults++;
        const v = o as unknown as SemanticVerificationResult;
        const material = (v.findings ?? []).filter((f) => f?.severity === "MATERIAL");
        if (material.length === 0) continue;

        const byUnit = new Map<string, typeof material>();
        for (const f of material) {
          const id = f.ruleOrDefinitionId ?? "(none)";
          byUnit.set(id, [...(byUnit.get(id) ?? []), f]);
        }

        const units: ResolverUnitInput[] = [];
        for (const [id, fs2] of byUnit) {
          const r = rules.get(id), d = definitions.get(id);
          if (!r && !d) { missingUnitIdentity += fs2.length; continue; }
          units.push({ kind: r ? "RULE" : "DEFINITION", unit: (r ?? d)!, verification: { ...v, findings: fs2 } as SemanticVerificationResult });
        }
        if (units.length === 0) continue;

        const out = resolveRuntimeVerificationEnvelope({ companyId: units[0]!.unit.companyId ?? "(none)", instrumentKey: units[0]!.unit.instrumentKey ?? "(none)", units });
        unitsResolved += out.envelope.units.length;
        for (const u of out.envelope.units) (u.identityStrength === "STRONG" ? strong++ : weak++);
        bump("MATERIAL_IN", out.counts.MATERIAL_IN);
        bump("MATERIAL_OUT", out.counts.MATERIAL_OUT);
        for (const a of out.audit) {
          bump(a.resolution);
          const s = samples[a.resolution] ?? (samples[a.resolution] = []);
          if (s.length < 3 && a.irPathAsGiven) s.push(a.irPathAsGiven);
        }
      }
    }
  }

  const res = (k: PathResolution) => counts[k] ?? 0;
  const unitScoped = res("UNIT_NO_PATH") + res("UNIT_WILDCARD") + res("UNIT_PROSE") + res("UNIT_MALFORMED") + res("UNIT_NO_SUCH_NODE") + res("UNIT_NOT_AN_EXPRESSION") + res("UNIT_WRONG_ROOT_KIND");
  return {
    verificationResultsInspected: verificationResults,
    materialFindingsIn: counts.MATERIAL_IN ?? 0,
    materialFindingsEmitted: counts.MATERIAL_OUT ?? 0,
    droppedMaterialFindings: (counts.MATERIAL_IN ?? 0) - (counts.MATERIAL_OUT ?? 0),
    nodeScoped: res("NODE_EXACT"),
    unitScoped,
    byResolution: {
      NODE_EXACT: res("NODE_EXACT"),
      UNIT_NO_PATH: res("UNIT_NO_PATH"),
      UNIT_WILDCARD: res("UNIT_WILDCARD"),
      UNIT_PROSE: res("UNIT_PROSE"),
      UNIT_MALFORMED: res("UNIT_MALFORMED"),
      UNIT_NO_SUCH_NODE: res("UNIT_NO_SUCH_NODE"),
      UNIT_NOT_AN_EXPRESSION: res("UNIT_NOT_AN_EXPRESSION"),
      UNIT_WRONG_ROOT_KIND: res("UNIT_WRONG_ROOT_KIND"),
    },
    materialFindingsWhoseUnitCouldNotBeFound: missingUnitIdentity,
    unitsResolved, strongIdentityUnits: strong, weakIdentityUnits: weak,
    samples,
  };
}

if (process.argv[1]?.endsWith("runtime-envelope-corpus-report.ts")) {
  const r = report();
  const dir = "docs/phase-4-verification-envelope";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "02-corpus-resolution.json"), JSON.stringify({ mission: "HEADROOM PHASE-4 - verification envelope + resolver (migration steps 1+2)", section: "§22 real-corpus resolution report", paidModelCalls: 0, ...r }, null, 2));
  console.log(JSON.stringify(r, null, 1));
}
