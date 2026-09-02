/**
 * PHASE 3 FINAL CLOSURE §19 - recompute the agreement-level rollup over
 * every COMPLETED real validation unit (zero cost) with the real
 * rollupAgreementSemanticStatus(). Provider-failed / inventory-failed
 * regions are listed as NOT_EVALUATED, never as units of the rollup.
 *
 *   npx tsx scripts/phase3-final-closure-agreement-rollup.ts --out docs/phase3-final-closure/17-agreement-level-coverage.json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { rollupAgreementSemanticStatus } from "../lib/contract-model/compiler/semantic-accountability/rollup";
import type { AgreementUnitInput } from "../lib/contract-model/compiler/semantic-accountability/types";

function arg(name: string, fallback: string): string { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback; }

function unitsFor(runDir: string): { units: AgreementUnitInput[]; notEvaluated: { id: string; reason: string }[]; productionShas: Record<string, string | null> } {
  const units: AgreementUnitInput[] = [];
  const notEvaluated: { id: string; reason: string }[] = [];
  const productionShas: Record<string, string | null> = {};
  if (!existsSync(runDir)) return { units, notEvaluated, productionShas };
  for (const f of readdirSync(runDir).filter((f) => /^region-[a-z0-9-]+\.json$/.test(f)).sort()) {
    const j = JSON.parse(readFileSync(`${runDir}/${f}`, "utf-8"));
    const id = j.region.id as string;
    productionShas[id] = j.run?.productionSha ?? null;
    if (j.error) { notEvaluated.push({ id, reason: `harness error: ${String(j.error).slice(0, 120)}` }); continue; }
    const c = j.compile;
    if ((c.failureReasons ?? []).includes("PROVIDER_FAILURE") || c.frozenInventory?.inventoryStatus === "INVENTORY_FAILED" || !c.accountability) { notEvaluated.push({ id, reason: `provider failure / no accountability result (${(c.failureReasons ?? []).join(",")})` }); continue; }
    units.push({
      candidateRef: id,
      compileStatus: c.status,
      verifyStatus: j.verify?.status ?? null,
      accountability: c.accountability,
      operativeStateUncertain: (c.failureReasons ?? []).includes("OPERATIVE_STATE_UNRESOLVED"),
      unresolvedCrossReferences: c.sourceContext?.unresolvedReferences?.length ?? 0,
    });
  }
  return { units, notEvaluated, productionShas };
}

function main() {
  const out = arg("--out", "docs/phase3-final-closure/17-agreement-level-coverage.json");
  const runs = { holdoutRun1: "tests/fixtures/semantic-accountability-validation/holdout/run-1", holdoutRun2: "tests/fixtures/semantic-accountability-validation/holdout/run-2", wholeAgreementRun1: "tests/fixtures/semantic-accountability-validation/whole-agreement/run-1", wholeAgreementRun2: "tests/fixtures/semantic-accountability-validation/whole-agreement/run-2" };
  const result: Record<string, unknown> = {
    schemaVersion: 1,
    artifactId: "17-agreement-level-coverage",
    requirement: "Mission §19: recompute the agreement-level rollup over completed real validation. Individual units may remain SEMANTICALLY_INCOMPLETE / REVIEW_REQUIRED; there must be NO false SEMANTICALLY_COMPLETE.",
    method: "rollupAgreementSemanticStatus() (lib/contract-model/compiler/semantic-accountability/rollup.ts, unchanged) over every preserved region with an accountability result; provider-failed regions are NOT_EVALUATED and excluded from the unit set (never counted as complete).",
  };
  let falseComplete = 0;
  let unitsTotal = 0;
  for (const [key, dir] of Object.entries(runs)) {
    const { units, notEvaluated, productionShas } = unitsFor(dir);
    if (units.length === 0 && notEvaluated.length === 0) { result[key] = { status: "NOT_MEASURED", reason: `${dir} does not exist (provider budget cap - see 08)` }; continue; }
    const rollup = rollupAgreementSemanticStatus(units);
    unitsTotal += units.length;
    for (const u of rollup.units) {
      const acc = units.find((x) => x.candidateRef === u.candidateRef)!.accountability!;
      // A unit may only be SEMANTICALLY_COMPLETE if its own accountability says so AND the verifier found no material discrepancy.
      const verify = units.find((x) => x.candidateRef === u.candidateRef)!.verifyStatus;
      if (u.unitStatus === "SEMANTICALLY_COMPLETE" && (!acc.semanticallyComplete || verify === "MATERIAL_DISCREPANCY" || acc.counts.materialMissingFromComposition > 0)) falseComplete++;
    }
    result[key] = { runDir: dir, productionShaByRegion: productionShas, evaluatedUnits: units.length, notEvaluated, rollup };
  }
  result.summary = { unitsEvaluated: unitsTotal, falseSemanticallyComplete: falseComplete, conservative: falseComplete === 0 };
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ summary: result.summary, statuses: Object.fromEntries(Object.entries(result).filter(([k]) => k in runs).map(([k, v]) => [k, (v as { rollup?: { status: string; counts?: unknown } }).rollup?.status ?? (v as { status?: string }).status])) }, null, 2));
}
main();
