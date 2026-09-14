/**
 * SEMANTIC ACCOUNTABILITY - Pass A deterministic SOURCE SLOTS (F-5, Phase 3
 * Chewy remediation 4).
 *
 * The frozen two-run diagnosis (docs/phase-3-remediation-f5) showed that
 * both runs covered the same source (span-coverage stability 0.90, every
 * quantitative value in both) but chopped it differently: 58% of run-only
 * items were granularity splits/merges, 15% dependency fragmentation, 11%
 * role relabels, 10% boundary drift - and only 5% true omissions, all
 * disclosed. One model call was deciding, freely and afresh each run, how
 * to decompose a 38k-character unit into hundreds of arbitrarily-shaped
 * items, and the gap pass then re-inventoried run-specific fragments.
 *
 * Invariant (mission §4): THE SOURCE DEFINES THE INVENTORY BOUNDARIES; the
 * model interprets semantics WITHIN them. A slot is a deterministic, bounded
 * stretch of one region: the structural node hierarchy (Phase 2A) supplies
 * the outer boundaries (each node's OWN text, i.e. its text minus its
 * children - the chapeau, the proviso, the residue), and independent
 * structural segments (sentence/line terminators, exactly the boundaries
 * source-coverage.ts credits against) supply the inner ones. Nothing here
 * is a covenant template: slots are pure text structure, computed the same
 * way for any agreement, and a slot is the identity anchor for every item
 * inside it (inventory.ts computeInventoryItemId).
 *
 * Whole-agreement semantics are preserved by CONTEXT, never by widening the
 * slot: every slot carries the lead-in text of its enclosing nodes, and a
 * batch carries the text that precedes it, read-only. Each item still has
 * exactly one deterministic primary span.
 *
 * Source-only (independence contract in types.ts): imports nothing from the
 * compiler, the IR, the verifier or precedent.
 */
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import { independentSegmentBounds } from "./source-coverage";
import type { SourceContextRegion, SourceContextResult } from "./types";

export interface SourceSlot {
  /** Deterministic: `${regionId}:${sectionRef | "region"}#${ordinal within that node}` - never derived from model output. */
  slotId: string;
  regionId: string;
  documentId: string;
  /** The deepest structural node whose OWN text this slot belongs to (null when the region has no structural nodes). */
  sectionRef: string | null;
  sourceNodeId: string | null;
  /** Region-relative, half-open. Slots of one region tile its whole text in order. */
  charStart: number;
  charEnd: number;
  text: string;
  /** Lead-in text of the enclosing structural nodes, outermost first (read-only context for the model; never part of the slot). */
  context: { sectionRef: string | null; text: string }[];
  /** Position of this slot in region order. */
  ordinal: number;
}

export type SlotPartitionMethod = "STRUCTURAL_NODES" | "INDEPENDENT_SEGMENTS";

export interface SlotPartition {
  slots: SourceSlot[];
  /** Per region: how its slots were derived. */
  methods: Record<string, SlotPartitionMethod>;
}

export interface SlotBatch {
  batchIndex: number;
  slots: SourceSlot[];
  /** Text immediately preceding the batch's first slot in the same region (read-only context), capped. */
  precedingText: string;
  chars: number;
}

const DEFAULT_BATCH_CHARS = 6000;
const CONTEXT_LEAD_IN_HEAD_CHARS = 600;
const CONTEXT_LEAD_IN_TAIL_CHARS = 300;

/** A node's lead-in as context: its own text before its first child, head + tail when long (the operative proviso at the end of a chapeau matters as much as its opening). */
function leadInContext(text: string): string {
  const t = text.trim();
  if (t.length <= CONTEXT_LEAD_IN_HEAD_CHARS + CONTEXT_LEAD_IN_TAIL_CHARS) return t;
  return `${t.slice(0, CONTEXT_LEAD_IN_HEAD_CHARS)} ... ${t.slice(-CONTEXT_LEAD_IN_TAIL_CHARS)}`;
}
const PRECEDING_CONTEXT_CHARS = 800;
const CONTENT_WORD = /[A-Za-z]{2,}/;

interface RegionNode {
  node: StructuralNode;
  start: number;
  end: number;
  depth: number;
}

/** A node's OWN spans: its span minus its children's spans, in order. */
function ownSpans(n: RegionNode, children: RegionNode[]): { charStart: number; charEnd: number }[] {
  const out: { charStart: number; charEnd: number }[] = [];
  let cursor = n.start;
  for (const c of [...children].sort((a, b) => a.start - b.start)) {
    if (c.start > cursor) out.push({ charStart: cursor, charEnd: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (n.end > cursor) out.push({ charStart: cursor, charEnd: n.end });
  return out;
}

/** Splits one span at independent segment bounds (precomputed over the whole region text). */
function segmentsWithin(span: { charStart: number; charEnd: number }, bounds: number[]): { charStart: number; charEnd: number }[] {
  const out: { charStart: number; charEnd: number }[] = [];
  let cursor = span.charStart;
  for (const b of bounds) {
    if (b <= span.charStart) continue;
    if (b >= span.charEnd) break;
    out.push({ charStart: cursor, charEnd: b });
    cursor = b;
  }
  if (span.charEnd > cursor) out.push({ charStart: cursor, charEnd: span.charEnd });
  return out;
}

function nodesInsideRegion(index: StructuralIndex, region: SourceContextRegion): RegionNode[] {
  const anchor = region.sourceNodeId ? index.getNodeById(region.sourceNodeId) : undefined;
  const candidates = anchor ? [anchor, ...index.getDescendants(anchor.nodeId)] : index.allNodes().filter((n) => n.documentId === region.documentId);
  const inside = candidates.filter((n) => n.documentId === region.documentId && n.charStart >= region.charStart && n.charEnd <= region.charEnd && n.charEnd > n.charStart);
  const byId = new Map(inside.map((n) => [n.nodeId, n]));
  const depthOf = (n: StructuralNode): number => {
    let d = 0;
    let p = n.parentNodeId ? byId.get(n.parentNodeId) : undefined;
    while (p) {
      d++;
      p = p.parentNodeId ? byId.get(p.parentNodeId) : undefined;
    }
    return d;
  };
  return inside.map((node) => ({ node, start: node.charStart - region.charStart, end: node.charEnd - region.charStart, depth: depthOf(node) })).sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Partitions every region of a source context into deterministic slots. With a structural index and an anchored
 * region, slots follow the node hierarchy (each node's own text, split at independent segment bounds); otherwise
 * they are the region's independent segments. Slots without a content word (a bare enumerator, glue punctuation)
 * are merged into their successor so every slot carries inventoriable text. Deterministic: same input, same slots.
 */
export function partitionSourceSlots(input: { sourceContext: SourceContextResult; structuralIndex?: StructuralIndex | null }): SlotPartition {
  const slots: SourceSlot[] = [];
  const methods: Record<string, SlotPartitionMethod> = {};
  for (const region of input.sourceContext.regions) {
    const text = region.text;
    if (text.length === 0) continue;
    const bounds = independentSegmentBounds(text);
    const nodes = input.structuralIndex ? nodesInsideRegion(input.structuralIndex, region) : [];
    // A single node covering the whole region carries no partition information of its own beyond its children.
    const usable = nodes.length > 0 && nodes.some((n) => n.end - n.start < text.length || nodes.length > 1);
    const raw: { charStart: number; charEnd: number; node: RegionNode | null }[] = [];
    if (usable) {
      methods[region.regionId] = "STRUCTURAL_NODES";
      for (const n of nodes) {
        const children = nodes.filter((c) => c.node.parentNodeId === n.node.nodeId);
        for (const span of ownSpans(n, children)) for (const seg of segmentsWithin(span, bounds)) raw.push({ ...seg, node: n });
      }
      // Text of the region not owned by any node (a region wider than its nodes) is still partitioned by segments.
      const owned = new Uint8Array(text.length);
      for (const r of raw) owned.fill(1, r.charStart, r.charEnd);
      let cursor = -1;
      for (let k = 0; k <= text.length; k++) {
        const isOwned = k < text.length && owned[k] === 1;
        if (!isOwned && cursor < 0) cursor = k;
        if ((isOwned || k === text.length) && cursor >= 0) {
          for (const seg of segmentsWithin({ charStart: cursor, charEnd: k }, bounds)) raw.push({ ...seg, node: null });
          cursor = -1;
        }
      }
      raw.sort((a, b) => a.charStart - b.charStart);
    } else {
      methods[region.regionId] = "INDEPENDENT_SEGMENTS";
      for (const seg of segmentsWithin({ charStart: 0, charEnd: text.length }, bounds)) raw.push({ ...seg, node: null });
    }
    // Merge content-free stretches (whitespace, enumerators, glue) into the next content-bearing slot; a trailing
    // content-free stretch joins its predecessor. The slot's node is the node owning its first content word.
    const merged: { charStart: number; charEnd: number; node: RegionNode | null }[] = [];
    let pending: { charStart: number; charEnd: number; node: RegionNode | null } | null = null;
    for (const r of raw) {
      const hasContent = CONTENT_WORD.test(text.slice(r.charStart, r.charEnd));
      if (!hasContent) {
        pending = pending ? { charStart: pending.charStart, charEnd: r.charEnd, node: pending.node } : r;
        continue;
      }
      if (pending) {
        merged.push({ charStart: pending.charStart, charEnd: r.charEnd, node: r.node });
        pending = null;
      } else merged.push(r);
    }
    if (pending) {
      const last = merged[merged.length - 1];
      if (last) last.charEnd = pending.charEnd;
      else merged.push(pending);
    }
    const ordinalByNode = new Map<string, number>();
    // A node's lead-in = its own text before its first child (the chapeau that its enumerated clauses hang from).
    const leadInByNode = new Map<string, string>();
    for (const n of nodes) {
      const firstChild = nodes.filter((c) => c.node.parentNodeId === n.node.nodeId).sort((a, b) => a.start - b.start)[0];
      const lead = text.slice(n.start, firstChild ? firstChild.start : n.end);
      if (CONTENT_WORD.test(lead)) leadInByNode.set(n.node.nodeId, leadInContext(lead));
    }
    for (const m of merged) {
      const key = m.node ? m.node.node.nodeId : "region";
      const ordinal = (ordinalByNode.get(key) ?? 0) + 1;
      ordinalByNode.set(key, ordinal);
      const slotText = text.slice(m.charStart, m.charEnd);
      const context: SourceSlot["context"] = [];
      if (m.node) {
        const byId = new Map(nodes.map((n) => [n.node.nodeId, n]));
        const chain: RegionNode[] = [];
        let p = m.node.node.parentNodeId ? byId.get(m.node.node.parentNodeId) : undefined;
        while (p) {
          chain.unshift(p);
          p = p.node.parentNodeId ? byId.get(p.node.parentNodeId) : undefined;
        }
        for (const a of chain) {
          const lead = leadInByNode.get(a.node.nodeId);
          if (lead) context.push({ sectionRef: a.node.sectionRef, text: lead });
        }
      }
      slots.push({ slotId: `${region.regionId}:${m.node ? m.node.node.sectionRef : "region"}#${ordinal}`, regionId: region.regionId, documentId: region.documentId, sectionRef: m.node ? m.node.node.sectionRef : region.sectionRef, sourceNodeId: m.node ? m.node.node.nodeId : region.sourceNodeId, charStart: m.charStart, charEnd: m.charEnd, text: slotText, context, ordinal: slots.length });
    }
  }
  // Two different nodes can share a sectionRef (a table-of-contents echo, a duplicate label) - keep ids unique deterministically.
  const seen = new Map<string, number>();
  for (const s of slots) {
    const n = (seen.get(s.slotId) ?? 0) + 1;
    seen.set(s.slotId, n);
    if (n > 1) s.slotId = `${s.slotId}~${n}`;
  }
  return { slots, methods };
}

/** The slot whose span contains a region-relative offset (the last slot when the offset is at the very end). */
export function slotForOffset(partition: SlotPartition, regionId: string, offset: number): SourceSlot | null {
  const regionSlots = partition.slots.filter((s) => s.regionId === regionId);
  if (regionSlots.length === 0) return null;
  for (const s of regionSlots) if (offset >= s.charStart && offset < s.charEnd) return s;
  return offset >= regionSlots[regionSlots.length - 1]!.charEnd ? regionSlots[regionSlots.length - 1]! : regionSlots[0]!;
}

const COORDINATION_BOUNDARY_RE = /\s+(?:and\/or|and|or)\s+|;\s+|,\s+(?=\(?[a-zA-Z0-9]{1,4}\)\s)/g;

/**
 * Coordination sub-index of an offset inside a slot: how many coordination boundaries ("and", "or", "and/or", a
 * semicolon, a comma introducing an enumerator) precede it within the slot's text. Two distinct propositions
 * inside one sentence ("no Default ... and ... pro forma compliance") therefore key differently, while two
 * excerpts of the same conjunct that merely start a few words apart key the same (measured on the frozen runs:
 * false merges 9-11 per run without this discriminator, 3 with it).
 */
export function coordinationIndex(slot: SourceSlot, regionOffset: number): number {
  const rel = Math.max(0, regionOffset - slot.charStart);
  let idx = 0;
  for (const m of slot.text.matchAll(COORDINATION_BOUNDARY_RE)) {
    if (m.index! + m[0].length <= rel) idx++;
    else break;
  }
  return idx;
}

/** Groups consecutive slots into batches by primary-text budget; a slot is never split. */
export function batchSlots(partition: SlotPartition, sourceContext: SourceContextResult, maxChars: number = DEFAULT_BATCH_CHARS): SlotBatch[] {
  const batches: SlotBatch[] = [];
  let current: SourceSlot[] = [];
  let chars = 0;
  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const region = sourceContext.regions.find((r) => r.regionId === first.regionId);
    const precedingText = region ? region.text.slice(Math.max(0, first.charStart - PRECEDING_CONTEXT_CHARS), first.charStart) : "";
    batches.push({ batchIndex: batches.length, slots: current, precedingText, chars });
    current = [];
    chars = 0;
  };
  for (const s of partition.slots) {
    const len = s.charEnd - s.charStart;
    if (current.length > 0 && (chars + len > maxChars || current[0]!.regionId !== s.regionId)) flush();
    current.push(s);
    chars += len;
  }
  flush();
  return batches;
}
