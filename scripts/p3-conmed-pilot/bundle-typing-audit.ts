/**
 * F1 bundle-typing audit (§7, §8, §10). Deterministic, zero model calls.
 * Run before and after the change with a label; the two snapshots are compared directly.
 */
import fs from "node:fs";
import path from "node:path";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { prepare } from "./compile-run";

const OUT = "docs/phase-3-f1-linked-context-typing";
const K_I = "discovery-candidate:abc8af03ac51f922f06ded82";
const AMOUNT_RE = /\$[\d,]{4,}|\b\d+(?:\.\d+)?%/g;
const amounts = (t: string) => [...new Set(t.match(AMOUNT_RE) ?? [])];

async function main() {
  const label = process.argv[2] ?? "snapshot";
  const { stages, bundles, rehydrated } = await prepare();

  let multiOperative = 0, operativeItems = 0, parentScope = 0, siblingContext = 0, contextLoss = 0;
  const typeTotals: Record<string, number> = {};
  const offenders: { ref: string; operativeRefs: string[] }[] = [];
  const lossCases: string[] = [];
  let operativeForeign = 0, contextualForeign = 0;

  for (const c of rehydrated) {
    const items = bundles.get(c.discoveryId)?.items ?? [];
    for (const i of items) typeTotals[i.type] = (typeTotals[i.type] ?? 0) + 1;
    const ops = items.filter((i) => i.type === "OPERATIVE_SOURCE");
    operativeItems += ops.length;
    parentScope += items.filter((i) => i.type === "PARENT_SCOPE").length;
    siblingContext += items.filter((i) => i.type === "SIBLING_CONTEXT").length;
    if (ops.length > 1) { multiOperative++; offenders.push({ ref: String(c.normalizedSourceRef), operativeRefs: ops.map((o) => o.normalizedRef) }); }

    // every linked node must still be represented somewhere in the bundle
    for (const linkedId of (c.structuralNodeIds ?? []).slice(1)) {
      if (!items.some((i) => i.structuralNodeId === linkedId)) { contextLoss++; lossCases.push(`${String(c.normalizedSourceRef)} -> ${linkedId}`); }
    }

    // §10: economic terms NOT in the anchor, split by the channel that carries them
    const anchor = operativeSourceTextFor(c, stages.index);
    const own = new Set(amounts(anchor));
    for (const i of items) {
      const foreign = amounts(i.excerptText).filter((a) => !own.has(a));
      if (i.type === "OPERATIVE_SOURCE" && i.structuralNodeId !== (c.structuralNodeIds ?? [])[0]) operativeForeign += foreign.length;
      else if (i.type !== "OPERATIVE_SOURCE") contextualForeign += foreign.length;
    }
  }

  const kItems = (bundles.get(K_I)?.items ?? []).map((i) => ({
    type: i.type, sectionRef: i.normalizedRef, chars: i.excerptText.length, sourceNode: i.structuralNodeId,
    has150M: i.excerptText.includes("$150,000,000"), has10pct: i.excerptText.includes("10.0%"),
  }));

  const snap = {
    label, generatedBy: "scripts/p3-conmed-pilot/bundle-typing-audit.ts", modelCalls: 0,
    totalCandidates: rehydrated.length,
    dualKeyCandidates: rehydrated.filter((c) => (c.structuralNodeIds ?? []).length > 1).length,
    candidatesWithMultipleOperativeSource: multiOperative, offenders: offenders.slice(0, 10),
    operativeSourceItems: operativeItems, parentScopeItems: parentScope, siblingContextItems: siblingContext,
    itemTypeTotals: typeTotals, contextLossCases: contextLoss, contextLossDetail: lossCases.slice(0, 10),
    foreignEconomicItems: { operativeChannel: operativeForeign, contextualChannel: contextualForeign },
    case_7_2_k_i: { operativeText: operativeSourceTextFor(rehydrated.find((c) => c.discoveryId === K_I)!, stages.index), items: kItems },
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `audit-${label}.json`), JSON.stringify(snap, null, 2));
  console.log(JSON.stringify({ ...snap, case_7_2_k_i: { ...snap.case_7_2_k_i, operativeText: snap.case_7_2_k_i.operativeText.slice(0, 60) } }, null, 2));
}
if (process.argv[1]?.endsWith("bundle-typing-audit.ts")) void main();
