/** Reproduces the audit counterexamples against whatever detector is currently in the tree. */
import { AUDIT_COUNTEREXAMPLES, auditSourceContext, auditWireItems, AUDIT_DOC_ID } from "../tests/contract-model/semantic-accountability/audit-counterexamples";
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { rollupAgreementSemanticStatus } from "../lib/contract-model/compiler/semantic-accountability/rollup";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";

const caller = (items: unknown): StageCaller => ({
  providerName: "scripted", model: "scripted", isSynthetic: false,
  async call<T>(): Promise<T> { return { items } as T; },
  lastTelemetry: () => null,
} as unknown as StageCaller);

async function main() {
const out: Record<string, unknown>[] = [];
for (const c of AUDIT_COUNTEREXAMPLES) {
  const sc = auditSourceContext(c);
  const inv = await runSemanticInventory({ candidateRef: `audit-${c.id}`, documentId: AUDIT_DOC_ID, sourceContext: sc, caller: caller(auditWireItems(c)) });
  // Compose an IR that fully accounts for every accepted item (lineage for each) - the omission is in Pass A, not Pass B.
  const composition = {
    rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }],
    definitions: [], sharedCapacities: [], unresolvedReferences: [],
  };
  const rec = reconcileInventoryWithComposition({
    inventory: inv,
    composition: composition as never,
    sourceContextState: sc.state,
    dispositions: [],
  });
  const roll = rollupAgreementSemanticStatus([{ candidateRef: `audit-${c.id}`, accountability: rec, verification: null }] as never);
  // Field-agnostic so this script reproduces the evidence at BOTH the pre-repair SHA (uninventoriedSegments)
  // and after the repair (unaccountedSource).
  const segs: { regionId: string; charStart: number; charEnd: number; excerpt: string }[] =
    (inv as unknown as { unaccountedSource?: typeof segs; uninventoriedSegments?: typeof segs }).unaccountedSource ??
    (inv as unknown as { unaccountedSource?: typeof segs; uninventoriedSegments?: typeof segs }).uninventoriedSegments ?? [];
  out.push({
    id: c.id, title: c.title,
    inventoryStatus: inv.inventoryStatus,
    uninventoriedSegments: segs.length,
    uninventoriedSegmentExcerpts: segs.map((s) => `${s.regionId}:${s.excerpt}`),
    uninventoriedValues: inv.uninventoriedValues.map((v) => `${v.regionId}:${v.kind}:${v.rawText}`),
    gapAttempted: inv.gapReinventory?.attempted ?? null,
    semanticallyComplete: rec.semanticallyComplete,
    reasons: rec.reasons,
    rollup: (roll as { status?: string }).status ?? JSON.stringify(roll).slice(0, 200),
    mustBeUnaccounted: c.mustBeUnaccounted.map((m) => `${m.regionId}:${m.needle.slice(0, 50)}`),
    detectedAll: c.mustBeUnaccounted.every((m) => segs.some((s) => s.regionId === m.regionId && s.excerpt.replace(/\s+/g, " ").includes(m.needle.replace(/\s+/g, " ").slice(0, 40)))),
  });
}
console.log(JSON.stringify(out, null, 2));
}
main();
