/**
 * F-5.1 zero-cost replay: pushes BOTH paid certification inventories of Chewy §6.08 (v4 evidence - the model's verified
 * excerpts, declared roles, values, identifiers, materiality, parent links) through the v5 deterministic migration
 * path (canonical semantic functions + role-blind identity + start-anchored merge) WITHOUT any model call, and writes a
 * v5-keyed pair for scripts/f5-1-canonical-score.py plus a migration record (merges, lineage, values, provenance).
 *   npx tsx scripts/f5-1-replay-certification.ts <pair-v4.json> <out-pair-v5.json> <out-migration.json>
 * This is a PROXY (it cannot show what a v5 prompt would elicit); it must never be used to certify F-5.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { normalizeInventorySubmission } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { functionsSignature } from "../lib/contract-model/compiler/semantic-accountability/semantic-functions";
import type { FrozenSemanticInventory, SemanticInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const [pairPath, outPair, outMigration] = process.argv.slice(2) as [string, string, string];
const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
const unit = JSON.parse(readFileSync(UNIT, "utf-8"));
const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08").sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0]!;
const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: text.slice(section.charStart, section.charEnd), anchorNodeId: section.nodeId, operativeCharStart: section.charStart, documentText: text });
const pair = JSON.parse(readFileSync(pairPath, "utf-8")) as { regionText: string; run1: FrozenSemanticInventory; run2: FrozenSemanticInventory };
if (pair.regionText !== sourceContext.regions[0]!.text) throw new Error("region text drifted from the certification pair");
const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });

const toWire = (i: SemanticInventoryItem): WireInventoryItem => ({ localRef: i.inventoryItemId, semanticRole: i.semanticRole, additionalRoles: (i.declaredRoles ?? []).slice(1), proposition: i.proposition, excerpt: i.sourceSpan.excerpt, regionId: i.sourceSpan.regionId, slotId: i.slotId ?? null, quantitativeValues: i.quantitativeValues.map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue, unit: v.unit })), referencedTerms: i.referencedTerms, referencedSections: i.referencedSections, parentRef: i.parentItemId, relatedRefs: i.relatedItemIds, materiality: i.materiality, ambiguity: i.ambiguity, ambiguityReason: i.ambiguityReason, operative: i.operative });
const words = (p: string) => new Set(p.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2));
const jacc = (a: Set<string>, b: Set<string>) => { const u = new Set([...a, ...b]); return u.size ? [...a].filter((x) => b.has(x)).length / u.size : 1; };

function migrate(inv: FrozenSemanticInventory, tag: string) {
  const wire = inv.items.map(toWire);
  const r = normalizeInventorySubmission({ candidateRef: unit.candidateRef, sourceContext, structuralIndex: index }, wire, partition);
  // Which v4 items landed in which v5 item: the normalizer reports the wire localRefs (= v4 ids) each accepted item absorbed.
  const v5ByOldId = new Map<string, SemanticInventoryItem>();
  const byId = new Map(r.items.map((it) => [it.inventoryItemId, it] as const));
  for (const [v5Id, refs] of Object.entries(r.memberLocalRefs)) for (const ref of refs) v5ByOldId.set(ref, byId.get(v5Id)!);
  const merges: { v5Id: string; members: { v4Id: string; role: string; span: number[]; proposition: string }[]; declaredRoles: string[]; propJaccardMin: number; falseMergeCandidate: boolean }[] = [];
  for (const it of r.items) {
    if ((it.mergedDuplicates ?? 0) === 0) continue;
    const members = inv.items.filter((o) => v5ByOldId.get(o.inventoryItemId) === it);
    let minJ = 1;
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) minJ = Math.min(minJ, jacc(words(members[i]!.proposition), words(members[j]!.proposition)));
    const roles = [...new Set(members.map((m) => m.semanticRole))];
    merges.push({ v5Id: it.inventoryItemId, members: members.map((m) => ({ v4Id: m.inventoryItemId, role: m.semanticRole, span: [m.sourceSpan.charStart, m.sourceSpan.charEnd], proposition: m.proposition.slice(0, 140) })), declaredRoles: it.declaredRoles ?? [], propJaccardMin: Number(minJ.toFixed(2)), falseMergeCandidate: roles.length > 1 && minJ < 0.25 && !members.every((m) => m.sourceSpan.charStart === members[0]!.sourceSpan.charStart && m.sourceSpan.charEnd === members[0]!.sourceSpan.charEnd) });
  }
  const oldValues = new Set(inv.items.flatMap((i) => i.quantitativeValues.map((v) => `${v.kind}:${v.normalizedValue ?? v.rawText}`)));
  const newValues = new Set(r.items.flatMap((i) => i.quantitativeValues.map((v) => `${v.kind}:${v.normalizedValue ?? v.rawText}`)));
  const oldParents = inv.items.filter((i) => i.parentItemId).length;
  const newParents = r.items.filter((i) => i.parentItemId).length;
  const provenance = { deterministicTokens: r.items.reduce((n, i) => n + (i.functionProvenance?.deterministic.length ?? 0), 0), declaredTokens: r.items.reduce((n, i) => n + (i.functionProvenance?.declared.length ?? 0), 0), itemsWithDeterministicAddition: r.items.filter((i) => (i.functionProvenance?.deterministic.length ?? 0) > 0).length, byToken: {} as Record<string, number> };
  for (const it of r.items) for (const t of it.functionProvenance?.deterministic ?? []) provenance.byToken[t] = (provenance.byToken[t] ?? 0) + 1;
  const legacyRoleChanged = r.items.filter((i) => (i.declaredRoles ?? [])[0] !== i.semanticRole).length;
  const materialityChanged = inv.items.filter((o) => { const n = v5ByOldId.get(o.inventoryItemId); return n && n.materiality !== o.materiality; }).length;
  const migrated: FrozenSemanticInventory = { ...inv, items: r.items, rejectedDuplicateItems: r.rejectedDuplicates, rejectedUnverifiableItems: r.rejectedUnverifiable, algorithmVersion: "semantic-accountability.v5 (zero-cost migration of v4 evidence)" };
  return { migrated, record: { tag, itemsBefore: inv.items.length, itemsAfter: r.items.length, mergedAway: r.rejectedDuplicates, unverifiable: r.rejectedUnverifiable, v4ItemsMappedToV5: v5ByOldId.size, v4ItemsLost: inv.items.length - v5ByOldId.size, valuesBefore: oldValues.size, valuesAfter: newValues.size, valuesLost: [...oldValues].filter((v) => !newValues.has(v)), parentLinksBefore: oldParents, parentLinksAfter: newParents, materialityChanged, legacyRoleChangedFromDeclaredPrimary: legacyRoleChanged, functionProvenance: provenance, signatures: r.items.reduce((acc, i) => { const s = i.semanticFunctions ? functionsSignature(i.semanticFunctions) : ""; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>), merges, falseMergeCandidates: merges.filter((m) => m.falseMergeCandidate).length } };
}
const a = migrate(pair.run1, "A");
const b = migrate(pair.run2, "B");
writeFileSync(outPair, JSON.stringify({ regionText: pair.regionText, run1: a.migrated, run2: b.migrated }, null, 1));
writeFileSync(outMigration, JSON.stringify({ artifact: "F-5.1 zero-cost migration of the v4 certification pair through the v5 canonical path (proxy only, never a certification)", runA: a.record, runB: b.record }, null, 1));
const brief = (r: typeof a.record) => ({ tag: r.tag, before: r.itemsBefore, after: r.itemsAfter, mergedAway: r.mergedAway, lost: r.v4ItemsLost, valuesLost: r.valuesLost.length, parents: [r.parentLinksBefore, r.parentLinksAfter], materialityChanged: r.materialityChanged, deterministicAdditions: r.functionProvenance.itemsWithDeterministicAddition, falseMergeCandidates: r.falseMergeCandidates });
console.log(JSON.stringify({ A: brief(a.record), B: brief(b.record) }, null, 1));
