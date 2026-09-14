/**
 * F-5.3B - SOURCE IDENTITY for semantic-inventory evidence.
 *
 * Two Pass A executions may only corroborate each other when they inventoried SEMANTICALLY IDENTICAL INPUT. "Same
 * candidateRef" is a label; this module pins the input itself: a content hash over every source-context region's
 * identity, offsets and text (plus the sufficiency state), and a hash over the deterministic slot partition.
 *
 * Pass A stamps both onto every inventory it freezes (RECORDED_AT_FREEZE). Pre-F-5.3B evidence carries neither; the
 * versioned migration below re-verifies such an inventory against a supplied source context item by item and stamps
 * it (VERIFIED_BY_RE_ANCHORING) - or throws. Nothing here ever infers identity from a label or a filename.
 *
 * Independence contract: Pass A side (imports hashing + types only).
 */
import { hashParts } from "../hashing";
import type { SlotPartition } from "./slots";
import type { FrozenSemanticInventory, SourceContextResult, SourceIdentityRecord } from "./types";

export const SOURCE_IDENTITY_MIGRATION_VERSION = "source-identity-migration.v1";

/** Content hash of the exact source context a Pass A run inventoried: every region's id, kind, document, node, section, offsets and TEXT, plus the sufficiency state. Order-independent across regions. */
export function computeSourceContextHash(sourceContext: SourceContextResult): string {
  const parts = sourceContext.regions
    .map((r) => `${r.regionId}|${r.kind}|${r.documentId}|${r.sourceNodeId ?? ""}|${r.sectionRef ?? ""}|${r.charStart}-${r.charEnd}|${hashParts([r.text])}`)
    .sort();
  return hashParts(["source-context.v1", sourceContext.state, ...parts]);
}

/** Content hash of a slot partition (slot ids, regions, section refs, offsets, per-region methods). Accepts the live partition or the frozen record an inventory carries. */
export function computePartitionHash(partition: { methods: Record<string, string>; slots: { slotId: string; regionId: string; sectionRef: string | null; charStart: number; charEnd: number }[] }): string {
  const slots = partition.slots.map((s) => `${s.slotId}|${s.regionId}|${s.sectionRef ?? ""}|${s.charStart}-${s.charEnd}`).sort();
  const methods = Object.entries(partition.methods).map(([k, v]) => `${k}=${v}`).sort();
  return hashParts(["slot-partition.v1", ...methods, ...slots]);
}

export interface ReAnchorFailure {
  check: string;
  detail: string;
}

/**
 * Verifies that a frozen inventory that carries NO recorded source identity was in fact produced over `sourceContext`:
 * every item's excerpt is the verbatim text at its recorded offsets in its recorded region, every unaccounted span and
 * uninventoried value likewise, and the recorded slot partition (when present) equals the supplied one exactly. Returns
 * the failures (empty = verified). Deterministic; no model.
 */
export function verifyInventoryAgainstSource(inventory: FrozenSemanticInventory, sourceContext: SourceContextResult, partition?: SlotPartition): ReAnchorFailure[] {
  const failures: ReAnchorFailure[] = [];
  const regionText = new Map(sourceContext.regions.map((r) => [r.regionId, r.text] as const));
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  for (const item of inventory.items) {
    const t = regionText.get(item.sourceSpan.regionId);
    if (t === undefined) { failures.push({ check: "item-region", detail: `${item.inventoryItemId}: region ${item.sourceSpan.regionId} is not in the supplied source context` }); continue; }
    const at = t.slice(item.sourceSpan.charStart, item.sourceSpan.charEnd);
    if (norm(at) !== norm(item.sourceSpan.excerpt)) failures.push({ check: "item-excerpt", detail: `${item.inventoryItemId}: excerpt is not the text at ${item.sourceSpan.regionId}:${item.sourceSpan.charStart}-${item.sourceSpan.charEnd}` });
    for (const v of item.quantitativeValues) {
      if (v.charStart < 0) continue;
      if (norm(t.slice(v.charStart, v.charEnd)) !== norm(v.rawText)) failures.push({ check: "item-value", detail: `${item.inventoryItemId}: value "${v.rawText}" is not the text at ${item.sourceSpan.regionId}:${v.charStart}-${v.charEnd}` });
    }
  }
  for (const s of inventory.unaccountedSource ?? []) {
    const t = regionText.get(s.regionId);
    if (t === undefined) { failures.push({ check: "unaccounted-region", detail: `unaccounted span names region ${s.regionId} not in the supplied source context` }); continue; }
    if (norm(t.slice(s.charStart, s.charEnd)) !== norm(s.excerpt)) failures.push({ check: "unaccounted-excerpt", detail: `unaccounted span ${s.regionId}:${s.charStart}-${s.charEnd} does not match the source text` });
  }
  for (const v of inventory.uninventoriedValues ?? []) {
    const t = regionText.get(v.regionId);
    if (t === undefined || v.charStart < 0) continue;
    if (norm(t.slice(v.charStart, v.charEnd)) !== norm(v.rawText)) failures.push({ check: "uninventoried-value", detail: `uninventoried value "${v.rawText}" is not the text at ${v.regionId}:${v.charStart}-${v.charEnd}` });
  }
  if (inventory.partition && partition) {
    const recorded = computePartitionHash(inventory.partition);
    const live = computePartitionHash(partition);
    if (recorded !== live) failures.push({ check: "partition", detail: `recorded slot partition (${inventory.partition.slots.length} slots) differs from the deterministic partition of the supplied source (${partition.slots.length} slots)` });
  }
  if (inventory.sourceContextState !== sourceContext.state) failures.push({ check: "source-state", detail: `recorded source-context state ${inventory.sourceContextState} differs from the supplied ${sourceContext.state}` });
  return failures;
}

/**
 * VERSIONED MIGRATION for pre-F-5.3B evidence: re-verifies the inventory against the supplied source (above) and returns
 * a copy stamped with that source's identity. The frozenContentHash is untouched (it never covered identity). Throws
 * when verification fails - identity is never assumed. An inventory that already carries a recorded identity is returned
 * unchanged (its own record stands; the ensemble gate compares it).
 */
export function stampVerifiedSourceIdentity(inventory: FrozenSemanticInventory, sourceContext: SourceContextResult, partition?: SlotPartition, now: () => string = () => new Date().toISOString()): FrozenSemanticInventory {
  if (inventory.sourceContextHash && inventory.sourceIdentity) return inventory;
  const failures = verifyInventoryAgainstSource(inventory, sourceContext, partition);
  if (failures.length > 0) throw new Error(`source identity could not be verified for ${inventory.candidateRef}: ${failures.slice(0, 3).map((f) => `[${f.check}] ${f.detail}`).join("; ")}${failures.length > 3 ? ` (+${failures.length - 3} more)` : ""}`);
  const sourceContextHash = computeSourceContextHash(sourceContext);
  const partitionHash = inventory.partition ? computePartitionHash(inventory.partition) : partition ? computePartitionHash(partition) : null;
  const identity: SourceIdentityRecord = { method: "VERIFIED_BY_RE_ANCHORING", sourceContextHash, partitionHash, migrationVersion: SOURCE_IDENTITY_MIGRATION_VERSION, verifiedAt: now() };
  const documentId = inventory.documentId ?? sourceContext.regions.find((r) => r.kind === "OPERATIVE")?.documentId ?? sourceContext.regions[0]?.documentId;
  return { ...inventory, sourceContextHash, sourceIdentity: identity, ...(documentId ? { documentId } : {}) };
}
