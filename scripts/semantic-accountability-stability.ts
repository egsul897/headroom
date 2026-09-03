/**
 * SEMANTIC ACCOUNTABILITY - run-to-run stability comparator (mission §27).
 * Zero cost: compares two preserved runs of the same frozen validation.
 *
 *   npx tsx scripts/semantic-accountability-stability.ts <holdout|whole-agreement> --out docs/semantic-accountability/14-holdout-stability.json
 *
 * Per material semantic component (keyed by the CONTENT-DERIVED
 * inventoryItemId, which is stable across independent Pass A runs of the
 * same source): STABLE_CAPTURED (accounted in both runs), STABLE_MISSED
 * (missing / not inventoried in both), VARIABLE (differs). Inventory
 * variance (an item inventoried in only one run) is reported SEPARATELY
 * from composition variance (inventoried in both, dispositioned
 * differently), as §27 requires. Also reports disposition stability,
 * CRITICAL VARIABLE omissions, and the per-region status/verifier deltas.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { specFor, type ValidationMode } from "./lib/semantic-accountability-regions";

type Disposition = "REPRESENTED" | "INTENTIONALLY_NON_COMPUTATIONAL" | "UNSUPPORTED" | "AMBIGUOUS" | "MISSING_FROM_COMPOSITION";
interface ItemView { id: string; role: string; materiality: string; disposition: Disposition | null; excerpt: string }
interface RegionView { id: string; compileStatus: string | null; verifyStatus: string | null; materialFindings: number | null; sourceContextState: string | null; inventoryStatus: string | null; inventoryHash: string | null; semanticallyComplete: boolean | null; items: Map<string, ItemView>; rules: number; definitions: number; sharedCapacities: number; unresolvedDependencies: number; error: string | null }

function arg(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function loadRun(dir: string): Map<string, RegionView> {
  const out = new Map<string, RegionView>();
  if (!existsSync(dir)) throw new Error(`run directory missing: ${dir}`);
  for (const f of readdirSync(dir).filter((f) => f.startsWith("region-") && f.endsWith(".json"))) {
    const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf-8"));
    const id = j.region.id as string;
    if (j.error) {
      out.set(id, { id, compileStatus: null, verifyStatus: null, materialFindings: null, sourceContextState: null, inventoryStatus: null, inventoryHash: null, semanticallyComplete: null, items: new Map(), rules: 0, definitions: 0, sharedCapacities: 0, unresolvedDependencies: 0, error: j.error });
      continue;
    }
    const c = j.compile;
    const items = new Map<string, ItemView>();
    const dispositionById = new Map<string, Disposition>((c.accountability?.items ?? []).map((r: { inventoryItemId: string; disposition: Disposition }) => [r.inventoryItemId, r.disposition]));
    for (const it of c.frozenInventory?.items ?? []) items.set(it.inventoryItemId, { id: it.inventoryItemId, role: it.semanticRole, materiality: it.materiality, disposition: dispositionById.get(it.inventoryItemId) ?? null, excerpt: String(it.sourceSpan.excerpt).slice(0, 100) });
    out.set(id, {
      id,
      compileStatus: c.status,
      verifyStatus: j.verify?.status ?? null,
      materialFindings: j.verify ? j.verify.findings.filter((x: { severity: string }) => x.severity === "MATERIAL").length : null,
      sourceContextState: c.sourceContext?.state ?? null,
      inventoryStatus: c.frozenInventory?.inventoryStatus ?? null,
      inventoryHash: c.frozenInventory?.frozenContentHash ?? null,
      semanticallyComplete: c.accountability?.semanticallyComplete ?? null,
      items,
      rules: c.rules.length,
      definitions: c.definitions.length,
      sharedCapacities: c.sharedCapacities.length,
      unresolvedDependencies: c.rules.reduce((n: number, r: { unresolvedDependencies?: unknown[] }) => n + (r.unresolvedDependencies?.length ?? 0), 0),
      error: null,
    });
  }
  return out;
}

const captured = (d: Disposition | null) => d !== null && d !== "MISSING_FROM_COMPOSITION";
const material = (m: string) => m === "CRITICAL" || m === "MATERIAL";

function main() {
  const mode = process.argv[2] as ValidationMode;
  if (mode !== "holdout" && mode !== "whole-agreement") throw new Error("usage: semantic-accountability-stability.ts <holdout|whole-agreement> --out <file>");
  const spec = specFor(mode);
  const out = arg("--out");
  const run1 = loadRun(`${spec.outDirBase}/run-1`);
  const run2 = loadRun(`${spec.outDirBase}/run-2`);

  const perRegion: Record<string, unknown>[] = [];
  const totals = { materialUnion: 0, stableCaptured: 0, stableMissed: 0, variable: 0, inventoryVariance: 0, compositionVariance: 0, criticalVariableOmissions: 0, inBoth: 0, sameDisposition: 0, criticalUnion: 0 };
  const criticalVariable: Record<string, unknown>[] = [];

  for (const region of spec.regions) {
    const a = run1.get(region.id);
    const b = run2.get(region.id);
    if (!a || !b) {
      perRegion.push({ id: region.id, error: `missing in ${!a ? "run-1" : "run-2"}` });
      continue;
    }
    const ids = new Set([...a.items.keys(), ...b.items.keys()]);
    const rows: Record<string, unknown>[] = [];
    const local = { materialUnion: 0, stableCaptured: 0, stableMissed: 0, variable: 0, inventoryVariance: 0, compositionVariance: 0, inBoth: 0, sameDisposition: 0 };
    for (const id of ids) {
      const ia = a.items.get(id) ?? null;
      const ib = b.items.get(id) ?? null;
      const mat = (ia ?? ib)!.materiality;
      if (!material(mat)) continue;
      local.materialUnion++;
      const capA = ia ? captured(ia.disposition) : false;
      const capB = ib ? captured(ib.disposition) : false;
      let cls: "STABLE_CAPTURED" | "STABLE_MISSED" | "VARIABLE";
      let varianceKind: "NONE" | "INVENTORY" | "COMPOSITION" = "NONE";
      if (capA && capB) cls = "STABLE_CAPTURED";
      else if (!capA && !capB) {
        cls = "STABLE_MISSED";
        if ((ia === null) !== (ib === null)) varianceKind = "INVENTORY";
      } else {
        cls = "VARIABLE";
        varianceKind = ia && ib ? "COMPOSITION" : "INVENTORY";
      }
      if (ia && ib) {
        local.inBoth++;
        if (ia.disposition === ib.disposition) local.sameDisposition++;
      }
      if (cls === "STABLE_CAPTURED") local.stableCaptured++;
      else if (cls === "STABLE_MISSED") local.stableMissed++;
      else local.variable++;
      if (varianceKind === "INVENTORY") local.inventoryVariance++;
      if (varianceKind === "COMPOSITION") local.compositionVariance++;
      if (mat === "CRITICAL") totals.criticalUnion++;
      if (cls === "VARIABLE" && mat === "CRITICAL" && ((ia && ia.disposition === "MISSING_FROM_COMPOSITION") || (ib && ib.disposition === "MISSING_FROM_COMPOSITION"))) {
        totals.criticalVariableOmissions++;
        criticalVariable.push({ region: region.id, id, role: (ia ?? ib)!.role, run1: ia?.disposition ?? "NOT_INVENTORIED", run2: ib?.disposition ?? "NOT_INVENTORIED", excerpt: (ia ?? ib)!.excerpt });
      }
      rows.push({ id, role: (ia ?? ib)!.role, materiality: mat, run1: ia?.disposition ?? "NOT_INVENTORIED", run2: ib?.disposition ?? "NOT_INVENTORIED", classification: cls, varianceKind, excerpt: (ia ?? ib)!.excerpt });
    }
    for (const k of Object.keys(local) as (keyof typeof local)[]) totals[k] += local[k];
    perRegion.push({
      id: region.id,
      family: region.family,
      claimIds: region.claimIds,
      run1: { compileStatus: a.compileStatus, verifyStatus: a.verifyStatus, materialFindings: a.materialFindings, sourceContextState: a.sourceContextState, inventoryStatus: a.inventoryStatus, inventoryItems: a.items.size, inventoryHash: a.inventoryHash, semanticallyComplete: a.semanticallyComplete, rules: a.rules, definitions: a.definitions, sharedCapacities: a.sharedCapacities, unresolvedDependencies: a.unresolvedDependencies, error: a.error },
      run2: { compileStatus: b.compileStatus, verifyStatus: b.verifyStatus, materialFindings: b.materialFindings, sourceContextState: b.sourceContextState, inventoryStatus: b.inventoryStatus, inventoryItems: b.items.size, inventoryHash: b.inventoryHash, semanticallyComplete: b.semanticallyComplete, rules: b.rules, definitions: b.definitions, sharedCapacities: b.sharedCapacities, unresolvedDependencies: b.unresolvedDependencies, error: b.error },
      inventoryHashIdentical: a.inventoryHash !== null && a.inventoryHash === b.inventoryHash,
      compileStatusStable: a.compileStatus === b.compileStatus,
      verifyStatusStable: a.verifyStatus === b.verifyStatus,
      ...local,
      dispositionStability: local.inBoth === 0 ? null : Number((local.sameDisposition / local.inBoth).toFixed(4)),
      items: rows,
    });
  }

  const result = {
    schemaVersion: 1,
    artifactId: mode === "holdout" ? "14-holdout-stability" : "17-whole-agreement-stability",
    mode,
    runDirs: [`${spec.outDirBase}/run-1`, `${spec.outDirBase}/run-2`],
    method: "Per material component keyed by content-derived inventoryItemId (stable across independent runs of the same source). captured = disposition in {REPRESENTED, AMBIGUOUS, INTENTIONALLY_NON_COMPUTATIONAL, UNSUPPORTED}; missed = MISSING_FROM_COMPOSITION or not inventoried. Inventory variance (present in only one run's inventory) is reported separately from composition variance (in both inventories, different disposition).",
    totals: {
      ...totals,
      dispositionStability: totals.inBoth === 0 ? null : Number((totals.sameDisposition / totals.inBoth).toFixed(4)),
      stableCapturedRate: totals.materialUnion === 0 ? null : Number((totals.stableCaptured / totals.materialUnion).toFixed(4)),
      variableRate: totals.materialUnion === 0 ? null : Number((totals.variable / totals.materialUnion).toFixed(4)),
    },
    gates: {
      criticalVariableOmissions: { measured: totals.criticalVariableOmissions, required: 0, pass: totals.criticalVariableOmissions === 0 },
      dispositionStability: { measured: totals.inBoth === 0 ? null : totals.sameDisposition / totals.inBoth, required: 0.95, pass: totals.inBoth > 0 && totals.sameDisposition / totals.inBoth >= 0.95 },
    },
    criticalVariable,
    perRegion,
  };
  const json = JSON.stringify(result, null, 2) + "\n";
  if (out) {
    writeFileSync(out, json);
    console.log(`written ${out}`);
  }
  console.log(JSON.stringify({ totals: result.totals, gates: result.gates }, null, 2));
}

main();
