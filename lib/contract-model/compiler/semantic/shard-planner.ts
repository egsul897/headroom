/**
 * F-7A - DETERMINISTIC COMPILATION SHARD PLANNER.
 *
 *   FROZEN SEMANTIC INVENTORY + STRUCTURAL SOURCE BOUNDARIES
 *     -> semantic source units (definition spans / node own-text / segments; source-owned, never model-chosen)
 *     -> primary ownership: every inventory item -> exactly one unit -> exactly one shard
 *     -> must-link groups (a shared-capacity construct or an item span crossing units forces one shard)
 *     -> bounded packing of consecutive complete units (target/max primary chars; a single oversized block stays alone)
 *     -> bounded READ-ONLY dependency context per shard (chapeau, parent items, referenced terms/sections), with provenance
 *     -> deterministic shard identity (packing set) and freeze identity (source + inventory + context + generation)
 *
 * Invariants: no LLM decides a boundary; token budgets never split a unit; no definition-name dictionary, covenant
 * family, formula type or section list appears anywhere; the same input always yields the same plan.
 * Provider-free by construction (no caller import).
 */
import { normalizeDefinedTermRef } from "../amendment/operative-state";
import { computeSourceContentHash, hashParts } from "../hashing";
import { resolveReferenceTarget } from "../semantic-accountability/reference-resolver";
import { partitionSourceSlots } from "../semantic-accountability/slots";
import { independentSegmentBounds } from "../semantic-accountability/source-coverage";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextRegion, SourceContextResult, UnresolvedSourceReference } from "../semantic-accountability/types";
import { findDefinedTermVariant, type StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import { CALIBRATED_TOKENS_PER_CHAR, FIXED_CALL_OVERHEAD_CHARS, SHARD_PLANNER_ALGORITHM_VERSION, estimateOutputTokens, estimateTokensFromChars } from "./shard-types";
import type { CompilationShard, MustLinkGroup, SemanticSourceUnit, ShardBudget, ShardContextEntry, ShardContextKind, ShardPlan, ShardPlanInput, UnitDerivationMethod, UnresolvedShardContext } from "./shard-types";
import type { SemanticCompilerInput } from "./types";

/**
 * Defaults chosen from the F-7A sensitivity study (docs/phase-3-remediation-f7a/02-chewy-101-shard-plan.json):
 * several complete units per shard, a first turn comfortably under ~30k estimated input tokens, no pathologically
 * large call, and an operationally reasonable shard count for the largest recorded unit.
 */
export const DEFAULT_SHARD_BUDGET: ShardBudget = { targetPrimaryChars: 12_000, maxPrimaryChars: 24_000, maxContextChars: 10_000, maxContextEntryChars: 1_800, maxUnitsPerShard: 16 };

const CONTENT_WORD = /[A-Za-z]{2,}/;
/** A region counts as a definitions corpus when at least this fraction of its text lies inside detected definition spans. */
const DEFINITION_CORPUS_MIN_COVERAGE = 0.5;
const LEAD_IN_HEAD = 600;
const LEAD_IN_TAIL = 300;

function normalizeSectionRef(ref: string): string {
  return ref.replace(/^\s*(?:sections?|sec\.?|§+)\s*/i, "").replace(/\s+/g, "").toLowerCase();
}

function capText(text: string, max: number): { text: string; truncated: boolean } {
  const t = text.trim();
  if (t.length <= max) return { text: t, truncated: false };
  const tail = Math.min(LEAD_IN_TAIL, Math.floor(max / 4));
  return { text: `${t.slice(0, max - tail - 5)} ... ${t.slice(-tail)}`, truncated: true };
}

// ---------------------------------------------------------------------------
// 1. Semantic source units
// ---------------------------------------------------------------------------

interface RawUnit {
  kind: SemanticSourceUnit["kind"];
  charStart: number;
  charEnd: number;
  sectionRef: string | null;
  sourceNodeId: string | null;
  termName: string | null;
  parentNodeId: string | null;
  anchor: string;
}

function definitionUnits(region: SourceContextRegion, index: StructuralIndex): RawUnit[] | null {
  if (region.charStart < 0) return null;
  const defs = index
    .allDefinitions()
    // a NESTED declaration (inside another definition's own sentence) is not its own unit - F-7B.2 anchors it to the enclosing unit
    .filter((d) => d.documentId === region.documentId && d.charStart >= region.charStart && d.charStart < region.charEnd && !d.nested)
    .sort((a, b) => a.charStart - b.charStart);
  if (defs.length < 2) return null;
  const covered = region.charEnd - defs[0]!.charStart;
  if (covered < DEFINITION_CORPUS_MIN_COVERAGE * region.text.length) return null;
  const units: RawUnit[] = [];
  const firstRel = defs[0]!.charStart - region.charStart;
  if (CONTENT_WORD.test(region.text.slice(0, firstRel))) units.push({ kind: "LEAD_IN", charStart: 0, charEnd: firstRel, sectionRef: region.sectionRef, sourceNodeId: region.sourceNodeId, termName: null, parentNodeId: null, anchor: "lead-in" });
  else if (firstRel > 0) {
    // whitespace-only preamble: attach to the first definition
  }
  defs.forEach((d, i) => {
    const start = i === 0 && units.length === 0 ? 0 : d.charStart - region.charStart;
    const end = i + 1 < defs.length ? defs[i + 1]!.charStart - region.charStart : region.text.length;
    if (end <= start) return;
    units.push({ kind: "DEFINITION", charStart: start, charEnd: end, sectionRef: region.sectionRef, sourceNodeId: d.sourceNodeId, termName: d.exactTerm, parentNodeId: null, anchor: `def:${d.normalizedTerm}` });
  });
  return units;
}

function structuralUnits(region: SourceContextRegion, index: StructuralIndex, sourceContext: SourceContextResult): RawUnit[] | null {
  const partition = partitionSourceSlots({ sourceContext: { ...sourceContext, regions: [region] }, structuralIndex: index });
  if (partition.methods[region.regionId] !== "STRUCTURAL_NODES") return null;
  const slots = partition.slots.filter((s) => s.regionId === region.regionId);
  if (slots.length === 0) return null;
  // Consecutive slots owned by the same node form one unit (the node's own contiguous text: chapeau or residue).
  const units: RawUnit[] = [];
  for (const s of slots) {
    const last = units[units.length - 1];
    if (last && last.sourceNodeId === s.sourceNodeId && last.charEnd === s.charStart) {
      last.charEnd = s.charEnd;
      continue;
    }
    const node = s.sourceNodeId ? index.getNodeById(s.sourceNodeId) : undefined;
    units.push({ kind: s.sourceNodeId ? "NODE_OWN_TEXT" : "SEGMENT", charStart: s.charStart, charEnd: s.charEnd, sectionRef: s.sectionRef, sourceNodeId: s.sourceNodeId, termName: null, parentNodeId: node?.parentNodeId ?? null, anchor: s.sectionRef ?? `seg` });
  }
  return units;
}

function segmentUnits(region: SourceContextRegion): RawUnit[] {
  const bounds = independentSegmentBounds(region.text);
  const units: RawUnit[] = [];
  let cursor = 0;
  for (const b of [...bounds, region.text.length]) {
    if (b <= cursor) continue;
    if (CONTENT_WORD.test(region.text.slice(cursor, b)) || units.length === 0) units.push({ kind: "SEGMENT", charStart: cursor, charEnd: b, sectionRef: region.sectionRef, sourceNodeId: region.sourceNodeId, termName: null, parentNodeId: null, anchor: "seg" });
    else units[units.length - 1]!.charEnd = b;
    cursor = b;
  }
  if (units.length === 0 && region.text.length > 0) units.push({ kind: "SEGMENT", charStart: 0, charEnd: region.text.length, sectionRef: region.sectionRef, sourceNodeId: region.sourceNodeId, termName: null, parentNodeId: null, anchor: "seg" });
  return units;
}

function deriveUnits(sourceContext: SourceContextResult, index: StructuralIndex | null): { units: SemanticSourceUnit[]; derivation: Record<string, UnitDerivationMethod>; parentByNodeId: Map<string, string> } {
  const units: SemanticSourceUnit[] = [];
  const derivation: Record<string, UnitDerivationMethod> = {};
  const nodeToUnitKey = new Map<string, string>();
  const parentByNodeId = new Map<string, string>();
  const operative = sourceContext.regions.filter((r) => r.kind === "OPERATIVE");
  const expansions = sourceContext.regions.filter((r) => r.kind !== "OPERATIVE");
  const keyCounts = new Map<string, number>();
  const uniqueKey = (base: string): string => {
    const n = (keyCounts.get(base) ?? 0) + 1;
    keyCounts.set(base, n);
    return n === 1 ? base : `${base}~${n}`;
  };
  for (const region of operative) {
    if (region.text.length === 0) continue;
    let raw: RawUnit[] | null = null;
    if (index) {
      raw = definitionUnits(region, index);
      if (raw) derivation[region.regionId] = "STRUCTURAL_DEFINITIONS";
      else {
        raw = structuralUnits(region, index, sourceContext);
        if (raw) derivation[region.regionId] = "STRUCTURAL_NODES";
      }
    }
    if (!raw) {
      raw = segmentUnits(region);
      derivation[region.regionId] = "INDEPENDENT_SEGMENTS";
    }
    for (const u of raw) {
      const text = region.text.slice(u.charStart, u.charEnd);
      const unitKey = uniqueKey(`${region.regionId}:${u.kind}:${u.anchor}`);
      if (u.sourceNodeId && u.kind === "NODE_OWN_TEXT" && !nodeToUnitKey.has(u.sourceNodeId)) nodeToUnitKey.set(u.sourceNodeId, unitKey);
      if (u.parentNodeId) parentByNodeId.set(unitKey, u.parentNodeId);
      units.push({
        unitKey,
        kind: u.kind,
        regionId: region.regionId,
        documentId: region.documentId,
        charStart: u.charStart,
        charEnd: u.charEnd,
        absCharStart: region.charStart >= 0 ? region.charStart + u.charStart : null,
        absCharEnd: region.charStart >= 0 ? region.charStart + u.charEnd : null,
        sectionRef: u.sectionRef,
        sourceNodeId: u.sourceNodeId,
        termName: u.termName,
        normalizedTermName: u.termName ? normalizeDefinedTermRef(u.termName) : null,
        parentUnitKey: null,
        textHash: computeSourceContentHash(text),
        chars: text.length,
        ownedItemIds: [],
        ownedMaterialItemIds: [],
        ordinal: units.length,
      });
    }
  }
  for (const region of expansions) {
    if (region.text.length === 0) continue;
    derivation[region.regionId] = "STRUCTURAL_NODES";
    const unitKey = uniqueKey(`${region.regionId}:EXPANSION_REGION:${region.sectionRef ?? "region"}`);
    units.push({ unitKey, kind: "EXPANSION_REGION", regionId: region.regionId, documentId: region.documentId, charStart: 0, charEnd: region.text.length, absCharStart: region.charStart >= 0 ? region.charStart : null, absCharEnd: region.charStart >= 0 ? region.charEnd : null, sectionRef: region.sectionRef, sourceNodeId: region.sourceNodeId, termName: null, normalizedTermName: null, parentUnitKey: null, textHash: computeSourceContentHash(region.text), chars: region.text.length, ownedItemIds: [], ownedMaterialItemIds: [], ordinal: units.length });
  }
  // Parent (chapeau) linkage for node units: the unit holding the parent node's own text, when it is a unit of this plan.
  for (const u of units) {
    const parentNodeId = parentByNodeId.get(u.unitKey);
    if (parentNodeId) u.parentUnitKey = nodeToUnitKey.get(parentNodeId) ?? null;
  }
  return { units, derivation, parentByNodeId };
}

// ---------------------------------------------------------------------------
// 2. Ownership
// ---------------------------------------------------------------------------

const isMaterial = (it: SemanticInventoryItem): boolean => it.materiality === "CRITICAL" || it.materiality === "MATERIAL";

function unitContaining(units: SemanticSourceUnit[], regionId: string, offset: number): SemanticSourceUnit | null {
  const inRegion = units.filter((u) => u.regionId === regionId);
  for (const u of inRegion) if (offset >= u.charStart && offset < u.charEnd) return u;
  const last = inRegion[inRegion.length - 1];
  if (last && offset >= last.charEnd) return last;
  return null;
}

function assignOwnership(units: SemanticSourceUnit[], inventory: FrozenSemanticInventory): { itemOwnerUnit: Map<string, string>; unplaced: string[]; crossingLinks: { itemId: string; from: string; to: string }[] } {
  const itemOwnerUnit = new Map<string, string>();
  const unplaced: string[] = [];
  const crossingLinks: { itemId: string; from: string; to: string }[] = [];
  const byKey = new Map(units.map((u) => [u.unitKey, u]));
  for (const it of inventory.items) {
    const owner = unitContaining(units, it.sourceSpan.regionId, it.sourceSpan.charStart);
    if (!owner) {
      unplaced.push(it.inventoryItemId);
      continue;
    }
    itemOwnerUnit.set(it.inventoryItemId, owner.unitKey);
    owner.ownedItemIds.push(it.inventoryItemId);
    if (isMaterial(it)) owner.ownedMaterialItemIds.push(it.inventoryItemId);
    // An item whose primary span runs past its owner unit into the next unit(s) must not be split across shards.
    if (it.sourceSpan.charEnd > owner.charEnd) {
      const endUnit = unitContaining(units, it.sourceSpan.regionId, Math.max(owner.charEnd, it.sourceSpan.charEnd - 1));
      if (endUnit && endUnit.unitKey !== owner.unitKey && byKey.has(endUnit.unitKey)) crossingLinks.push({ itemId: it.inventoryItemId, from: owner.unitKey, to: endUnit.unitKey });
    }
  }
  return { itemOwnerUnit, unplaced, crossingLinks };
}

// ---------------------------------------------------------------------------
// 3. Must-link groups
// ---------------------------------------------------------------------------

function itemHasSharedCapFunction(it: SemanticInventoryItem): boolean {
  if (it.semanticRole === "SHARED_CAP") return true;
  const fn = it.semanticFunctions;
  return !!fn && fn.dependency.includes("SHARED_CAP");
}

class UnionFind {
  private readonly parent = new Map<string, string>();
  find(k: string): string {
    const p = this.parent.get(k) ?? k;
    if (p === k) return k;
    const root = this.find(p);
    this.parent.set(k, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** True when a unit's text has real content and does not end with terminal punctuation (optionally followed by closing quotes/brackets/footnote markers). */
export function continuesIntoNext(text: string): boolean {
  const t = text.replace(/\s+$/, "");
  if (!CONTENT_WORD.test(t)) return false;
  return !/[.;:!?][\s"”'’)\]]*$/.test(t);
}

function buildMustLinkGroups(units: SemanticSourceUnit[], inventory: FrozenSemanticInventory, itemOwnerUnit: Map<string, string>, crossingLinks: { itemId: string; from: string; to: string }[], unitTextOf: (u: SemanticSourceUnit) => string): MustLinkGroup[] {
  const uf = new UnionFind();
  const links: MustLinkGroup["links"] = [];
  const byId = new Map(inventory.items.map((i) => [i.inventoryItemId, i]));
  for (const c of crossingLinks) {
    uf.union(c.from, c.to);
    links.push({ kind: "ITEM_SPAN_CROSSES_UNITS", itemId: c.itemId, fromUnitKey: c.from, toUnitKey: c.to, reason: "the item's primary source span runs across the unit boundary - one shard must see the whole proposition" });
  }
  // A shared-capacity construct: the SHARED_CAP item, its parent and every related item must be compiled by one shard,
  // so the capacity's members are never represented in isolation from the resource they share.
  for (const it of inventory.items) {
    if (!itemHasSharedCapFunction(it)) continue;
    const owner = itemOwnerUnit.get(it.inventoryItemId);
    if (!owner) continue;
    const related = [it.parentItemId, ...it.relatedItemIds].filter((x): x is string => !!x);
    for (const rid of related) {
      const other = itemOwnerUnit.get(rid);
      if (!other || other === owner) continue;
      uf.union(owner, other);
      links.push({ kind: "SHARED_CAP", itemId: it.inventoryItemId, fromUnitKey: owner, toUnitKey: other, reason: `shared-capacity item ${it.inventoryItemId} is linked to ${rid} (${byId.get(rid)?.semanticRole ?? "?"}) owned by another unit - the capacity and its members compile together` });
    }
  }
  // v2 (PHASE 3 / 6.01 remediation): a structural child unit whose own text ends mid-sentence ("... merely because it is
  // unsecured or") continues in its next sibling ("(2) Senior Indebtedness ..."); splitting the sentence across shards
  // made the paid shard 1 characterization rule PARTIAL ("the provided operative text ... is cut off mid-sentence").
  // Generic drafting property, no content test: terminal punctuation (optionally followed by a closing quote/bracket).
  for (let i = 0; i + 1 < units.length; i++) {
    const a = units[i]!; const b = units[i + 1]!;
    if (a.regionId !== b.regionId || a.kind === "LEAD_IN" || a.kind === "EXPANSION_REGION" || b.kind === "EXPANSION_REGION") continue;
    if (a.parentUnitKey !== b.parentUnitKey && a.parentUnitKey !== b.unitKey && b.parentUnitKey !== a.unitKey) continue;
    if (!continuesIntoNext(unitTextOf(a))) continue;
    uf.union(a.unitKey, b.unitKey);
    links.push({ kind: "SENTENCE_CONTINUATION", itemId: null, fromUnitKey: a.unitKey, toUnitKey: b.unitKey, reason: `unit ${a.unitKey} ends mid-sentence; its sentence continues in the next sibling unit ${b.unitKey} - one shard must see the whole sentence` });
  }
  // An expansion region (a cross-referenced section Pass A inventoried) is compiled with the first operative unit whose items reference it.
  for (const u of units.filter((x) => x.kind === "EXPANSION_REGION")) {
    const ref = u.sectionRef ? normalizeSectionRef(u.sectionRef) : null;
    const referrer = ref ? units.find((o) => o.kind !== "EXPANSION_REGION" && o.ownedItemIds.some((id) => (byId.get(id)?.referencedSections ?? []).some((s) => normalizeSectionRef(s) === ref || normalizeSectionRef(s).startsWith(`${ref}(`)))) : undefined;
    if (referrer) {
      uf.union(u.unitKey, referrer.unitKey);
      links.push({ kind: "EXPANSION_ATTACHED_TO_REFERRER", itemId: null, fromUnitKey: referrer.unitKey, toUnitKey: u.unitKey, reason: `expansion region ${u.regionId} is referenced by items of ${referrer.unitKey}` });
    }
  }
  const groups = new Map<string, string[]>();
  for (const u of units) {
    const root = uf.find(u.unitKey);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(u.unitKey);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((unitKeys) => ({ unitKeys, links: links.filter((l) => unitKeys.includes(l.fromUnitKey) || unitKeys.includes(l.toUnitKey)) }))
    .sort((a, b) => units.find((u) => u.unitKey === a.unitKeys[0])!.ordinal - units.find((u) => u.unitKey === b.unitKeys[0])!.ordinal);
}

// ---------------------------------------------------------------------------
// 4. Packing
// ---------------------------------------------------------------------------

interface Block { unitOrdinals: number[]; chars: number; regionId: string }

/**
 * Blocks = the must-link groups' MEMBER units (v2: a group spanning ordinals 3 and 17 forces {3, 17} - the units in
 * between stay free), else single units. Ordered by first member ordinal. Never crosses a region: a group's members in
 * a second region form their own block (the expansion-region link is then honoured only by adjacency).
 *
 * WHY (PHASE 3 / 6.01 remediation §8): v1 closed every group over its whole ordinal RANGE. Five two-to-four-member
 * SHARED_CAP groups whose members sat at ordinals {12,59} {13,60} {25,57,71,79} {55,78} {75,80} therefore fused
 * ordinals 12..80 (69 units, 29,414 chars, 270 owned items) into one irreducible "atomic" block - 57 of those units
 * (18,857 chars) were forced only by the range closure, not by any link. Member closure preserves every link
 * invariant (the capacity and its members still compile together) without inventing adjacency constraints.
 */
function buildBlocks(units: SemanticSourceUnit[], groups: MustLinkGroup[]): Block[] {
  const ordinalOf = new Map(units.map((u) => [u.unitKey, u.ordinal]));
  const claimed = new Set<number>();
  const blocks: Block[] = [];
  for (const g of groups) {
    const ords = g.unitKeys.map((k) => ordinalOf.get(k)!).filter((o) => !claimed.has(o)).sort((a, b) => a - b);
    // split by region, preserving source order within each region
    const byRegion = new Map<string, number[]>();
    for (const o of ords) { const r = units[o]!.regionId; if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r)!.push(o); }
    for (const [regionId, members] of byRegion) {
      for (const o of members) claimed.add(o);
      blocks.push({ unitOrdinals: members, chars: members.reduce((a, o) => a + units[o]!.chars, 0), regionId });
    }
  }
  for (const u of units) if (!claimed.has(u.ordinal)) blocks.push({ unitOrdinals: [u.ordinal], chars: u.chars, regionId: u.regionId });
  return blocks.sort((a, b) => a.unitOrdinals[0]! - b.unitOrdinals[0]!);
}

function packBlocks(blocks: Block[], budget: ShardBudget): { unitOrdinals: number[]; oversized: boolean; regionId: string }[] {
  const shards: { unitOrdinals: number[]; oversized: boolean; regionId: string }[] = [];
  let current: number[] = [];
  let chars = 0;
  let regionId: string | null = null;
  const flush = () => {
    if (current.length > 0) shards.push({ unitOrdinals: current, oversized: chars > budget.maxPrimaryChars || current.length > budget.maxUnitsPerShard, regionId: regionId! });
    current = [];
    chars = 0;
    regionId = null;
  };
  for (const b of blocks) {
    if (current.length > 0 && (regionId !== b.regionId || chars + b.chars > budget.targetPrimaryChars || current.length + b.unitOrdinals.length > budget.maxUnitsPerShard)) flush();
    current.push(...b.unitOrdinals);
    chars += b.chars;
    regionId = b.regionId;
    if (b.chars > budget.maxPrimaryChars || b.unitOrdinals.length > budget.maxUnitsPerShard) flush();
  }
  flush();
  return shards;
}

// ---------------------------------------------------------------------------
// 5. Dependency context
// ---------------------------------------------------------------------------

interface ContextCandidate { kind: ShardContextKind; key: string; sourceUnitKey: string | null; documentId: string; absCharStart: number | null; absCharEnd: number | null; fullText: string; requiredBy: string[]; reason: string; priority: number }

function leadInOf(index: StructuralIndex, node: StructuralNode): string {
  const own = index.getNodeText(node.nodeId, "OWN");
  const children = index.getChildren(node.nodeId);
  const first = children.sort((a, b) => a.charStart - b.charStart)[0];
  const lead = first ? own.slice(0, Math.max(0, first.charStart - node.charStart)) : own;
  const t = lead.trim();
  return t.length <= LEAD_IN_HEAD + LEAD_IN_TAIL ? t : `${t.slice(0, LEAD_IN_HEAD)} ... ${t.slice(-LEAD_IN_TAIL)}`;
}

function collectContextCandidates(shardUnits: SemanticSourceUnit[], allUnits: SemanticSourceUnit[], ownedSet: Set<string>, inventory: FrozenSemanticInventory, itemOwnerUnit: Map<string, string>, index: StructuralIndex | null, sourceContext: SourceContextResult, documentId: string): { candidates: ContextCandidate[]; notFound: UnresolvedShardContext[] } {
  const byId = new Map(inventory.items.map((i) => [i.inventoryItemId, i]));
  const unitByKey = new Map(allUnits.map((u) => [u.unitKey, u]));
  const regionById = new Map(sourceContext.regions.map((r) => [r.regionId, r]));
  const unitText = (u: SemanticSourceUnit): string => regionById.get(u.regionId)?.text.slice(u.charStart, u.charEnd) ?? "";
  const candidates = new Map<string, ContextCandidate>();
  const notFound: UnresolvedShardContext[] = [];
  const add = (c: ContextCandidate) => {
    const existing = candidates.get(c.key);
    if (existing) existing.requiredBy.push(...c.requiredBy.filter((r) => !existing.requiredBy.includes(r)));
    else candidates.set(c.key, c);
  };
  // (a) CHAPEAU: the region lead-in unit, and every enclosing node's own lead-in for node units (never text this shard owns).
  const leadIn = allUnits.find((u) => u.kind === "LEAD_IN");
  if (leadIn && !ownedSet.has(leadIn.unitKey)) add({ kind: "CHAPEAU", key: `chapeau:${leadIn.unitKey}`, sourceUnitKey: leadIn.unitKey, documentId: leadIn.documentId, absCharStart: leadIn.absCharStart, absCharEnd: leadIn.absCharEnd, fullText: unitText(leadIn), requiredBy: shardUnits.map((u) => u.unitKey), reason: "lead-in of the region every unit hangs from", priority: 0 });
  for (const u of shardUnits) {
    let p = u.parentUnitKey ? unitByKey.get(u.parentUnitKey) : undefined;
    let hops = 0;
    while (p && hops < 6) {
      if (!ownedSet.has(p.unitKey)) add({ kind: "CHAPEAU", key: `chapeau:${p.unitKey}`, sourceUnitKey: p.unitKey, documentId: p.documentId, absCharStart: p.absCharStart, absCharEnd: p.absCharEnd, fullText: index && p.sourceNodeId && index.getNodeById(p.sourceNodeId) ? leadInOf(index, index.getNodeById(p.sourceNodeId)!) : unitText(p), requiredBy: [u.unitKey], reason: `chapeau (enclosing node lead-in) that ${u.unitKey} hangs from`, priority: 1 });
      p = p.parentUnitKey ? unitByKey.get(p.parentUnitKey) : undefined;
      hops++;
    }
  }
  // (b) PARENT_ITEM: an owned item's parent item owned elsewhere. v2 priority 6 (after referenced terms/sections):
  // the paid 6.01 shard 0 spent 8,855 of its 10,000 context chars on 25 parent propositions and starved every
  // referenced definition/section the owned items' economics actually depend on (17 BUDGET exclusions).
  for (const u of shardUnits) for (const id of u.ownedItemIds) {
    const it = byId.get(id);
    if (!it?.parentItemId) continue;
    const parentOwner = itemOwnerUnit.get(it.parentItemId);
    if (!parentOwner || ownedSet.has(parentOwner)) continue;
    const parent = byId.get(it.parentItemId);
    if (!parent) continue;
    add({ kind: "PARENT_ITEM", key: `parent-item:${it.parentItemId}`, sourceUnitKey: parentOwner, documentId: parent.sourceSpan.documentId, absCharStart: null, absCharEnd: null, fullText: `[${parent.semanticRole}/${parent.materiality}] ${parent.proposition} (${parent.sourceSpan.sourceCitation}: "${parent.sourceSpan.excerpt}")`, requiredBy: [id], reason: `parent proposition of owned item ${id}`, priority: 6 });
  }
  // (c) REFERENCED_TERM: terms the owned items reference, resolved to a definition unit of this plan first, else the structural index.
  const termCounts = new Map<string, { term: string; requiredBy: string[] }>();
  for (const u of shardUnits) for (const id of u.ownedItemIds) for (const t of byId.get(id)?.referencedTerms ?? []) {
    const key = normalizeDefinedTermRef(t);
    if (!key) continue;
    const e = termCounts.get(key) ?? { term: t, requiredBy: [] };
    e.requiredBy.push(id);
    termCounts.set(key, e);
  }
  const ownedTerms = new Set(shardUnits.map((u) => u.normalizedTermName).filter((x): x is string => !!x));
  const ownedRefs = new Set(shardUnits.map((u) => (u.sectionRef ? normalizeSectionRef(u.sectionRef) : null)).filter((x): x is string => !!x));
  // (d) REFERENCED_SECTION: sections the owned items reference - an expansion region of the source context first, else
  // the generic reference resolver (v2: heading-only table-of-contents duplicates excluded with disclosure, an inline
  // sub-clause resolved to its enclosing node; two substantive occurrences stay AMBIGUOUS). Text = the node's own text
  // plus its descendants (a section whose body lives in children is otherwise a 47-char heading), capped downstream.
  const secCounts = new Map<string, { ref: string; requiredBy: string[]; reasonPrefix: string }>();
  const requireSection = (ref: string, requiredBy: string[], reasonPrefix: string) => {
    const key = normalizeSectionRef(ref);
    if (!key) return;
    const e = secCounts.get(key) ?? { ref, requiredBy: [], reasonPrefix };
    for (const id of requiredBy) if (!e.requiredBy.includes(id)) e.requiredBy.push(id);
    secCounts.set(key, e);
  };
  for (const u of shardUnits) for (const id of u.ownedItemIds) for (const s of byId.get(id)?.referencedSections ?? []) requireSection(s, [id], "section");
  const sortedTerms = [...termCounts.entries()].sort((a, b) => b[1].requiredBy.length - a[1].requiredBy.length || a[0].localeCompare(b[0]));
  const forwardedTerms = new Map<string, { term: string; requiredBy: string[]; via: string }>();
  for (const [key, e] of sortedTerms) {
    if (ownedTerms.has(key)) continue;
    const unit = allUnits.find((x) => x.kind === "DEFINITION" && x.normalizedTermName === key);
    if (unit) {
      add({ kind: "REFERENCED_TERM", key: `term:${key}`, sourceUnitKey: unit.unitKey, documentId: unit.documentId, absCharStart: unit.absCharStart, absCharEnd: unit.absCharEnd, fullText: unitText(unit), requiredBy: e.requiredBy, reason: `definition of "${e.term}" referenced by ${e.requiredBy.length} owned item(s)`, priority: 2 });
      continue;
    }
    const def = index?.getDefinition(e.term, documentId);
    const full = def ? index!.getDefinitionFullText(def.exactTerm, documentId) : undefined;
    if (def && full) {
      add({ kind: "REFERENCED_TERM", key: `term:${key}`, sourceUnitKey: null, documentId, absCharStart: def.charStart, absCharEnd: def.charStart + full.length, fullText: full, requiredBy: e.requiredBy, reason: `definition of "${e.term}" (outside this unit) referenced by ${e.requiredBy.length} owned item(s)${def.forwardingTarget ? ` - FORWARDING declaration, target ${def.forwardingTarget.kind} ${def.forwardingTarget.ref} supplied separately` : ""}`, priority: 3 });
      // v2: a FORWARDING declaration carries no body - its target is a typed dependency of the same owned items (one hop).
      if (def.forwardingTarget?.kind === "SECTION") requireSection(def.forwardingTarget.ref, e.requiredBy, `forwarding target of the definition of "${e.term}"`);
      else if (def.forwardingTarget?.kind === "DEFINITION") { const k2 = normalizeDefinedTermRef(def.forwardingTarget.ref); if (k2 && !termCounts.has(k2) && !ownedTerms.has(k2)) forwardedTerms.set(k2, { term: def.forwardingTarget.ref, requiredBy: e.requiredBy, via: e.term }); }
    } else {
      const variant = index ? findDefinedTermVariant(index, e.term, documentId) : undefined;
      const variantFull = variant ? index!.getDefinitionFullText(variant.exactTerm, documentId) : undefined;
      if (variant && variantFull) add({ kind: "REFERENCED_TERM", key: `term:${variant.normalizedTerm}`, sourceUnitKey: null, documentId, absCharStart: variant.charStart, absCharEnd: variant.charStart + variantFull.length, fullText: variantFull, requiredBy: e.requiredBy, reason: `definition of "${variant.exactTerm}" - the owned items cite "${e.term}", which is not itself defined; the defined grammatical-number variant is supplied read-only and disclosed as such`, priority: 3 });
      else notFound.push({ kind: "REFERENCED_TERM", key, reason: "NOT_FOUND", detail: `no detected definition of "${e.term}" in document ${documentId}`, requiredBy: e.requiredBy });
    }
  }
  for (const [k2, f] of forwardedTerms) {
    const def = index?.getDefinition(f.term, documentId);
    const full = def ? index!.getDefinitionFullText(def.exactTerm, documentId) : undefined;
    if (def && full) add({ kind: "REFERENCED_TERM", key: `term:${k2}`, sourceUnitKey: null, documentId, absCharStart: def.charStart, absCharEnd: def.charStart + full.length, fullText: full, requiredBy: f.requiredBy, reason: `definition of "${f.term}" - forwarding target of the definition of "${f.via}" referenced by ${f.requiredBy.length} owned item(s)`, priority: 3 });
    else notFound.push({ kind: "REFERENCED_TERM", key: k2, reason: "NOT_FOUND", detail: `no detected definition of "${f.term}" (forwarding target of "${f.via}") in document ${documentId}`, requiredBy: f.requiredBy });
  }
  for (const [key, e] of [...secCounts.entries()].sort((a, b) => b[1].requiredBy.length - a[1].requiredBy.length || a[0].localeCompare(b[0]))) {
    if (ownedRefs.has(key)) continue;
    const region = sourceContext.regions.find((r) => r.kind !== "OPERATIVE" && r.sectionRef && normalizeSectionRef(r.sectionRef) === key);
    if (region) {
      const unit = allUnits.find((x) => x.regionId === region.regionId);
      if (unit && ownedSet.has(unit.unitKey)) continue;
      add({ kind: "REFERENCED_SECTION", key: `section:${key}`, sourceUnitKey: unit?.unitKey ?? null, documentId: region.documentId, absCharStart: region.charStart, absCharEnd: region.charEnd, fullText: region.text, requiredBy: e.requiredBy, reason: `${e.reasonPrefix} ${e.ref} (source-context expansion) referenced by ${e.requiredBy.length} owned item(s)`, priority: 4 });
      continue;
    }
    if (!index) { notFound.push({ kind: "REFERENCED_SECTION", key, reason: "NOT_FOUND", detail: "no structural index", requiredBy: e.requiredBy }); continue; }
    const referrerUnit = e.requiredBy.map((id) => itemOwnerUnit.get(id)).map((k) => (k ? unitByKey.get(k) : undefined)).find((u) => u?.sourceNodeId);
    const r = resolveReferenceTarget(index, documentId, key, { fromNodeId: referrerUnit?.sourceNodeId ?? null });
    if (r.node) {
      const ownedNode = shardUnits.some((u) => u.sourceNodeId === r.node!.nodeId);
      if (ownedNode) continue;
      const text = index.getNodeText(r.node.nodeId, "DESCENDANTS");
      add({ kind: "REFERENCED_SECTION", key: `section:${key}`, sourceUnitKey: null, documentId, absCharStart: r.node.charStart, absCharEnd: r.node.charStart + text.length, fullText: text, requiredBy: e.requiredBy, reason: `${e.reasonPrefix} ${e.ref} referenced by ${e.requiredBy.length} owned item(s) [${r.status}${r.excludedDegenerateNodeIds.length ? `, ${r.excludedDegenerateNodeIds.length} heading-only occurrence(s) excluded` : ""}]`, priority: 5 });
    } else notFound.push({ kind: "REFERENCED_SECTION", key, reason: r.status === "AMBIGUOUS" ? "AMBIGUOUS" : "NOT_FOUND", detail: r.status === "AMBIGUOUS" ? `section ${e.ref} matches ${r.candidateNodeIds.length} substantive physical locations (${r.note})` : `section ${e.ref} not found in document ${documentId}`, requiredBy: e.requiredBy });
  }
  return { candidates: [...candidates.values()].sort((a, b) => a.priority - b.priority || b.requiredBy.length - a.requiredBy.length || a.key.localeCompare(b.key)), notFound };
}

// ---------------------------------------------------------------------------
// 6. The plan
// ---------------------------------------------------------------------------

/** v2: the owned units (source order) as maximal contiguous region-relative runs. */
export function contiguousSlices(shardUnits: SemanticSourceUnit[]): CompilationShard["primarySlices"] {
  const slices: CompilationShard["primarySlices"] = [];
  for (const u of [...shardUnits].sort((a, b) => a.ordinal - b.ordinal)) {
    const last = slices[slices.length - 1];
    if (last && last.charEnd === u.charStart) { last.charEnd = u.charEnd; last.unitKeys.push(u.unitKey); }
    else slices.push({ charStart: u.charStart, charEnd: u.charEnd, unitKeys: [u.unitKey] });
  }
  return slices;
}

/** Approximation of caller.ts's per-item inventory line (used for estimates only - the exact rendering is what the caller produces). */
export function approximateInventoryLineChars(it: SemanticInventoryItem): number {
  const values = it.quantitativeValues.reduce((a, v) => a + v.kind.length + v.rawText.length + 3, 0);
  const refs = it.referencedTerms.reduce((a, t) => a + t.length + 7, 0) + it.referencedSections.reduce((a, s) => a + s.length + 6, 0);
  return 2 + it.inventoryItemId.length + 1 + it.semanticRole.length + it.materiality.length + 4 + it.proposition.length + values + refs + it.sourceSpan.sourceCitation.length + Math.min(160, it.sourceSpan.excerpt.length) + 8;
}

export function planCompilationShards(input: ShardPlanInput): ShardPlan {
  const budget: ShardBudget = { ...DEFAULT_SHARD_BUDGET, ...(input.budget ?? {}) };
  const { units, derivation } = deriveUnits(input.sourceContext, input.structuralIndex);
  const { itemOwnerUnit, unplaced, crossingLinks } = assignOwnership(units, input.frozenInventory);
  const regionTextById = new Map(input.sourceContext.regions.map((r) => [r.regionId, r.text]));
  const mustLinkGroups = buildMustLinkGroups(units, input.frozenInventory, itemOwnerUnit, crossingLinks, (u) => regionTextById.get(u.regionId)?.slice(u.charStart, u.charEnd) ?? "");
  const blocks = buildBlocks(units, mustLinkGroups);
  const packed = packBlocks(blocks, budget);
  const byId = new Map(input.frozenInventory.items.map((i) => [i.inventoryItemId, i]));
  const regionById = new Map(input.sourceContext.regions.map((r) => [r.regionId, r]));
  const generation = input.generation ?? { algorithmVersion: SHARD_PLANNER_ALGORITHM_VERSION, promptVersion: "(unspecified)" };

  const unitOwnerShard: Record<string, string> = {};
  const shards: CompilationShard[] = packed.map((p, ordinal) => {
    const shardUnits = [...p.unitOrdinals].sort((a, b) => a - b).map((o) => units[o]!);
    const shardId = `shard:${hashParts([input.candidateRef, ...shardUnits.map((u) => u.unitKey)]).slice(0, 20)}`;
    for (const u of shardUnits) unitOwnerShard[u.unitKey] = shardId;
    return { shardId, ordinal, units: shardUnits, oversized: p.oversized, regionId: p.regionId };
  }).map(({ shardId, ordinal, units: shardUnits, oversized, regionId }) => {
    const ownedSet = new Set(shardUnits.map((u) => u.unitKey));
    const { candidates, notFound } = collectContextCandidates(shardUnits, units, ownedSet, input.frozenInventory, itemOwnerUnit, input.structuralIndex, input.sourceContext, input.documentId);
    const context: ShardContextEntry[] = [];
    const unresolvedContext: UnresolvedShardContext[] = [...notFound];
    let contextChars = 0;
    // v2 fair-share admission (mission §13, bounded and deduplicated): every dependency KIND present gets a reserved
    // floor of the context budget (budget / kinds present) in priority order first, then whatever remains is admitted
    // in global priority order. One kind (25 parent propositions in the paid shard 0) can no longer consume the whole
    // budget and starve the referenced definitions/sections the owned items' economics depend on. Deterministic.
    const kindsPresent = [...new Set(candidates.map((c) => c.kind))];
    const floor = kindsPresent.length > 0 ? Math.floor(budget.maxContextChars / kindsPresent.length) : 0;
    const usedByKind = new Map<ShardContextKind, number>();
    const admitted = new Set<string>();
    const admit = (c: ContextCandidate, capped: { text: string; truncated: boolean }, allocation: "KIND_FLOOR" | "REMAINING_BUDGET") => {
      context.push({ contextKey: c.key, kind: c.kind, sourceUnitKey: c.sourceUnitKey, ownerShardId: c.sourceUnitKey ? unitOwnerShard[c.sourceUnitKey] ?? null : null, documentId: c.documentId, absCharStart: c.absCharStart, absCharEnd: c.absCharEnd, text: capped.text, truncated: capped.truncated, fullTextHash: computeSourceContentHash(c.fullText), chars: capped.text.length, requiredBy: c.requiredBy, reason: `${c.reason} [admitted: ${allocation}]` });
      contextChars += capped.text.length;
      usedByKind.set(c.kind, (usedByKind.get(c.kind) ?? 0) + capped.text.length);
      admitted.add(c.key);
    };
    for (const c of candidates) {
      const capped = capText(c.fullText, budget.maxContextEntryChars);
      if ((usedByKind.get(c.kind) ?? 0) + capped.text.length <= floor && contextChars + capped.text.length <= budget.maxContextChars) admit(c, capped, "KIND_FLOOR");
    }
    for (const c of candidates) {
      if (admitted.has(c.key)) continue;
      const capped = capText(c.fullText, budget.maxContextEntryChars);
      if (contextChars + capped.text.length > budget.maxContextChars) {
        unresolvedContext.push({ kind: c.kind, key: c.key, reason: "BUDGET", detail: `context budget (${budget.maxContextChars} chars) exhausted before this ${c.kind.toLowerCase()} could be included - the shard must treat it as MISSING_CONTEXT or retrieve it with a bounded tool call`, requiredBy: c.requiredBy });
        continue;
      }
      admit(c, capped, "REMAINING_BUDGET");
    }
    context.sort((a, b) => candidates.findIndex((c) => c.key === a.contextKey) - candidates.findIndex((c) => c.key === b.contextKey));
    const ownedItemIds = shardUnits.flatMap((u) => u.ownedItemIds);
    const ownedMaterialItemIds = shardUnits.flatMap((u) => u.ownedMaterialItemIds);
    const primaryCharStart = Math.min(...shardUnits.map((u) => u.charStart));
    const primaryCharEnd = Math.max(...shardUnits.map((u) => u.charEnd));
    const primarySlices = contiguousSlices(shardUnits);
    const primaryChars = primarySlices.reduce((a, sl) => a + (sl.charEnd - sl.charStart), 0);
    const inventoryRenderedChars = ownedItemIds.reduce((a, id) => a + (byId.get(id) ? approximateInventoryLineChars(byId.get(id)!) : 0), 0);
    const totalChars = primaryChars + contextChars + inventoryRenderedChars + FIXED_CALL_OVERHEAD_CHARS;
    const shardHash = hashParts([
      "shard-freeze", input.candidateRef, input.documentId, input.frozenInventory.frozenContentHash,
      ...shardUnits.map((u) => `${u.unitKey}|${u.absCharStart ?? u.charStart}|${u.absCharEnd ?? u.charEnd}|${u.textHash}`),
      `items:${[...ownedItemIds].sort().join(",")}`,
      ...context.map((c) => `ctx:${c.contextKey}|${c.fullTextHash}`).sort(),
      `gen:${generation.algorithmVersion}|${generation.promptVersion}|${SHARD_PLANNER_ALGORITHM_VERSION}`,
    ]);
    return { shardId, shardHash, ordinal, regionId, ownedUnitKeys: shardUnits.map((u) => u.unitKey), primaryCharStart, primaryCharEnd, primaryChars, primarySlices, ownedItemIds, ownedMaterialItemIds, context, contextChars, unresolvedContext, oversized, estimate: { primaryChars, contextChars, inventoryRenderedChars, fixedOverheadChars: FIXED_CALL_OVERHEAD_CHARS, totalChars, inputTokens: estimateTokensFromChars(totalChars), outputTokens: estimateOutputTokens(shardUnits.filter((u) => u.kind !== "LEAD_IN").length) } };
  });

  const itemOwnerShard: Record<string, string> = {};
  for (const [itemId, unitKey] of itemOwnerUnit) itemOwnerShard[itemId] = unitOwnerShard[unitKey]!;
  const materialItems = input.frozenInventory.items.filter(isMaterial);
  const ownedCounts = new Map<string, number>();
  for (const s of shards) for (const id of s.ownedMaterialItemIds) ownedCounts.set(id, (ownedCounts.get(id) ?? 0) + 1);
  const ownershipProof = { materialItems: materialItems.length, ownedOnce: materialItems.filter((i) => ownedCounts.get(i.inventoryItemId) === 1).length, unowned: materialItems.filter((i) => !ownedCounts.has(i.inventoryItemId)).length, multiplyOwned: materialItems.filter((i) => (ownedCounts.get(i.inventoryItemId) ?? 0) > 1).length };
  const tokens = shards.map((s) => s.estimate.inputTokens).sort((a, b) => a - b);
  const pct = (q: number) => (tokens.length === 0 ? 0 : tokens[Math.min(tokens.length - 1, Math.floor(q * tokens.length))]!);
  const contextDuplicationChars = shards.reduce((a, s) => a + s.context.filter((c) => c.sourceUnitKey !== null).reduce((b, c) => b + c.chars, 0), 0);
  const totals = { shardCount: shards.length, primaryChars: shards.reduce((a, s) => a + s.primaryChars, 0), contextChars: shards.reduce((a, s) => a + s.contextChars, 0), contextDuplicationChars, estimatedInputTokens: shards.reduce((a, s) => a + s.estimate.inputTokens, 0), maxShardInputTokens: tokens[tokens.length - 1] ?? 0, medianShardInputTokens: pct(0.5), p95ShardInputTokens: pct(0.95), maxShardOutputTokens: Math.max(0, ...shards.map((s) => s.estimate.outputTokens)), largestShardPrimaryChars: Math.max(0, ...shards.map((s) => s.primaryChars)), largestShardOwnedItems: Math.max(0, ...shards.map((s) => s.ownedItemIds.length)), largestShardUnits: Math.max(0, ...shards.map((s) => s.ownedUnitKeys.length)), oversizedShards: shards.filter((s) => s.oversized).length };
  return {
    algorithmVersion: SHARD_PLANNER_ALGORITHM_VERSION,
    candidateRef: input.candidateRef,
    documentId: input.documentId,
    frozenContentHash: input.frozenInventory.frozenContentHash,
    sourceContextState: input.sourceContext.state,
    budget,
    derivation,
    units,
    mustLinkGroups,
    shards,
    itemOwnerUnit: Object.fromEntries(itemOwnerUnit),
    itemOwnerShard,
    unitOwnerShard,
    unplacedItemIds: unplaced,
    ownershipProof,
    totals,
    planHash: hashParts(["shard-plan", ...shards.map((s) => s.shardHash)]),
  };
}

// ---------------------------------------------------------------------------
// 7. The per-shard compiler input - the SAME SemanticCompilerInput contract the bounded caller already compiles.
// ---------------------------------------------------------------------------

/**
 * Builds the SemanticCompilerInput for one shard from the unit's base input: the shard's contiguous primary slice
 * as the operative text, its owned inventory items as the frozen inventory it is accountable for, its read-only
 * context as provenance-carrying expansion regions, and the base context bundle stripped of the whole-unit
 * OPERATIVE_SOURCE echo (defect B) and narrowed to the dependencies whose text appears in the slice. candidateRef is
 * suffixed with the shardId so normalize.ts's shard-local ids never collide across shards before stitching.
 */
export function buildShardCompilerInput(base: SemanticCompilerInput, plan: ShardPlan, shard: CompilationShard): SemanticCompilerInput {
  const sc = base.sourceContext;
  const inv = base.frozenInventory;
  if (!sc || !inv) throw new Error("buildShardCompilerInput requires a base input carrying sourceContext and frozenInventory (compile.ts's callerInput)");
  const region = sc.regions.find((r) => r.regionId === shard.regionId)!;
  const slices = shard.primarySlices ?? [{ charStart: shard.primaryCharStart, charEnd: shard.primaryCharEnd, unitKeys: shard.ownedUnitKeys }];
  const primaryText = renderPrimarySlices(region.text, slices, plan, shard);
  const absStart = region.charStart >= 0 ? region.charStart + shard.primaryCharStart : -1;
  const inSlices = (charStart: number) => slices.some((sl) => charStart >= sl.charStart && charStart < sl.charEnd);
  const owned = new Set(shard.ownedItemIds);
  const contextRegions = shard.context.map((c) => ({
    regionId: `context:${c.contextKey}`,
    kind: "CROSS_REFERENCE_EXPANSION" as const,
    documentId: c.documentId,
    sourceNodeId: null,
    sectionRef: c.kind === "REFERENCED_SECTION" ? c.contextKey.replace(/^section:/, "") : c.kind === "REFERENCED_TERM" ? `definition of ${c.contextKey.replace(/^term:/, "")}` : c.kind.toLowerCase(),
    charStart: c.absCharStart ?? -1,
    charEnd: c.absCharEnd ?? -1,
    text: c.text,
    expandedFor: { referenceText: c.contextKey, resolution: "UNIQUE" as const, note: `READ-ONLY DEPENDENCY CONTEXT (${c.kind}${c.ownerShardId ? `, semantics owned by shard ${c.ownerShardId}` : ""}${c.truncated ? ", head/tail excerpt" : ""}): ${c.reason}. Use it only to interpret the operative text above - compile nothing from it and claim no inventory item from it.` },
    truncatedAtBudget: c.truncated,
    unitExtension: null,
  }));
  const unresolvedContext: UnresolvedSourceReference[] = shard.unresolvedContext.map((u) => ({ referenceText: u.key, normalizedRef: u.key, status: "OUT_OF_SCOPE" as const, reason: `${u.kind}: ${u.detail}`, candidateNodeIds: [] }));
  const baseUnresolved = sc.unresolvedReferences.filter((u) => primaryText.includes(u.referenceText));
  const shardSourceContext = { ...sc, regions: [{ ...region, charStart: absStart, charEnd: absStart >= 0 ? absStart + primaryText.length : -1, text: primaryText, unitExtension: null }, ...contextRegions], unresolvedReferences: [...baseUnresolved, ...unresolvedContext], totalChars: primaryText.length + shard.contextChars };
  const shardInventory = {
    ...inv,
    items: inv.items.filter((i) => owned.has(i.inventoryItemId)),
    uninventoriedValues: inv.uninventoriedValues.filter((v) => v.regionId === shard.regionId && inSlices(v.charStart)),
    unaccountedSource: inv.unaccountedSource.filter((s) => s.regionId === shard.regionId && inSlices(s.charStart)),
  };
  const contextBundle = {
    ...base.contextBundle,
    items: base.contextBundle.items.filter((i) => i.type !== "OPERATIVE_SOURCE"),
    unresolvedDependencies: base.contextBundle.unresolvedDependencies.filter((u) => !u.sourceText || primaryText.includes(u.sourceText)),
  };
  return { ...base, candidateRef: `${base.candidateRef}#${shard.shardId}`, operativeSourceText: primaryText, operativeCharStart: absStart >= 0 ? absStart : base.operativeCharStart, sourceContext: shardSourceContext, frozenInventory: shardInventory, contextBundle, toolAccess: { ...base.toolAccess, contextBundle } };
}

/**
 * v2 compositional rendering (mission §14): the owned slices in source order; between two non-adjacent slices an
 * explicit gap marker names how many units were omitted and which shard(s) own them, so the model can never mistake
 * the gap for continuous drafting and never claims anything from it. A single slice renders exactly as v1 did.
 */
export function renderPrimarySlices(regionText: string, slices: CompilationShard["primarySlices"], plan: ShardPlan, shard: CompilationShard): string {
  if (slices.length <= 1) return regionText.slice(slices[0]?.charStart ?? shard.primaryCharStart, slices[0]?.charEnd ?? shard.primaryCharEnd);
  const parts: string[] = [];
  for (let i = 0; i < slices.length; i++) {
    const sl = slices[i]!;
    if (i > 0) {
      const prev = slices[i - 1]!;
      const omitted = plan.units.filter((u) => u.regionId === shard.regionId && u.charStart >= prev.charEnd && u.charEnd <= sl.charStart);
      const owners = [...new Set(omitted.map((u) => plan.unitOwnerShard[u.unitKey]).filter((x): x is string => !!x))];
      const refs = [...new Set(omitted.map((u) => u.sectionRef).filter((x): x is string => !!x))];
      parts.push(`\n\n[SOURCE OMITTED HERE: ${omitted.length} unit(s)${refs.length ? ` (${refs.slice(0, 6).join(", ")}${refs.length > 6 ? ", ..." : ""})` : ""} covering region chars ${prev.charEnd}-${sl.charStart} are owned and compiled by shard(s) ${owners.join(", ") || "(none)"} - not part of this shard's operative text; compile nothing from the gap and claim no inventory item from it]\n\n`);
    }
    parts.push(regionText.slice(sl.charStart, sl.charEnd));
  }
  return parts.join("");
}

/** Sensitivity study helper: the aggregate figures a plan yields under one budget (mission §16/§17). */
export function summarizePlan(plan: ShardPlan): ShardPlan["totals"] & { budget: ShardBudget; planHash: string } {
  return { ...plan.totals, budget: plan.budget, planHash: plan.planHash };
}

export { CALIBRATED_TOKENS_PER_CHAR };
