/**
 * SEMANTIC ACCOUNTABILITY - Pass A: source-derived semantic inventory
 * (mission §3-§6). v4 (F-5): the unit is first partitioned into deterministic
 * SOURCE SLOTS (slots.ts), then a small number of bounded, schema-forced
 * model calls (one per consecutive slot batch; reusing llm-caller.ts's
 * provider-abstract StageCaller - the same generic primitive Phase 3C's
 * reviewer and Phase 3E's Layer C use, NOT the compiler's own tool-use loop)
 * inventory the slots, followed by deterministic post-processing that
 * decides what is trusted:
 *
 *  - ANTI-HALLUCINATION GATE: an item's excerpt must be a real substring of
 *    exactly one region it was given (exact, else whitespace-tolerant);
 *    anything else is rejected and counted, never trusted because the JSON
 *    validated (Architecture Invariants #16).
 *  - STABLE IDENTITY (v4): inventoryItemId is derived from the candidate, the
 *    deterministic SLOT the verified span starts in, its coordination
 *    sub-index, the role and the normalized values - never from the model's
 *    own excerpt boundaries, free-text proposition or listed identifiers, so
 *    the same component inventoried in two independent runs receives the
 *    same id and two wordings of it merge (mission §27, F-5 §7).
 *  - QUANTITATIVE ACCOUNTING: the deterministic scanner (quantitative.ts)
 *    runs over every region; a value inside an accepted item's span is
 *    attached to that item (even if the model forgot to list it); a value no
 *    item covers is surfaced as UNINVENTORIED - never dropped, never
 *    auto-declared material (mission §6).
 *  - EMPTY-INVENTORY SUSPICION: zero accepted items over source that carries
 *    quantitative values or operative language is INVENTORY_EMPTY_SUSPECT, so
 *    a failed/empty Pass A can never be mistaken for "nothing material here."
 *  - FREEZE: the result is content-hashed before Pass B ever sees it.
 *
 * Source-only (independence contract in types.ts): this file never imports
 * the compiler, the IR, the verifier, or precedent.
 */
import { getStageCaller, type StageCaller } from "../llm-caller";
import { hashParts } from "../hashing";
import { computeStableKey } from "../../stable-keys";
import { buildGapReinventoryUserContent, buildInventorySystemPrompt, buildInventoryUserContent } from "./prompt";
import { quantitativeValuesEquivalent, scanQuantitativeValues } from "./quantitative";
import { SubmitSemanticInventorySchema, type WireInventoryItem } from "./wire-schema";
import { INVENTORY_AMBIGUITIES, INVENTORY_MATERIALITIES, OPERATIVE_FLAGS, QUANTITATIVE_KINDS, SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION, SEMANTIC_ROLES } from "./types";
import { deriveLegacyRole, deriveSemanticFunctions, effectsContradict, functionsSignature, unionFunctions, type SemanticFunctions } from "./semantic-functions";
import type { FrozenSemanticInventory, GapReinventoryRecord, InventoryAmbiguity, InventoryMateriality, InventoryStatus, OperativeFlag, QuantitativeKind, QuantitativeValue, SemanticInventoryItem, SemanticRole, SourceCoverageSummary, SourceContextRegion, SourceContextResult, UnaccountedSourceSpan } from "./types";
import { computeSourceCoverage, isAccountedDisposition, type AccountingSpanInput, type ExternalAccountabilityLink, type SourceCoverageResult } from "./source-coverage";
import { batchSlots, coordinationIndex, partitionSourceSlots, slotForOffset, type SlotBatch, type SlotPartition, type SourceSlot } from "./slots";
import type { StructuralIndex } from "../structural-index";

export interface SemanticInventoryInput {
  candidateRef: string;
  documentId: string;
  sourceContext: SourceContextResult;
  /** Injectable for testing; defaults to the real env-var-driven getStageCaller(). */
  caller?: StageCaller;
  /**
   * Explicit statements that another semantic unit owns a dependency region's own semantics (§9 option A).
   * A region named here is discharged as ACCOUNTED_BY_EXTERNAL_UNIT; a region NOT named here participates in this
   * unit's source coverage in full. Unresolved ownership is never assumed - it is UNACCOUNTED_SOURCE.
   */
  externalAccountability?: ExternalAccountabilityLink[];
  /** F-5 (v4): the Phase 2A structural index - when present, slots follow the node hierarchy of the operative region; otherwise they follow independent segments. Optional so every existing caller keeps working. */
  structuralIndex?: StructuralIndex | null;
  /** F-5 (v4): primary-text budget per bounded model call (default 6000 chars). */
  batchChars?: number;
}

const MAX_EXCERPT_CHARS = 400;
const MATERIALITY_RANK: Record<InventoryMateriality, number> = { CRITICAL: 3, MATERIAL: 2, REVIEW_UNCERTAIN: 1, INFORMATIONAL: 0 };
const OPERATIVE_LANGUAGE_RE = /\b(shall|may|must|provided|except|means|not to exceed|so long as)\b/i;

function matchEnum<T extends string>(raw: string | null | undefined, valid: readonly T[], fallback: T): T {
  if (!raw) return fallback;
  if ((valid as readonly string[]).includes(raw)) return raw as T;
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (valid as readonly string[]).includes(upper) ? (upper as T) : fallback;
}

/** Locates a model-supplied excerpt in a region: exact substring first, then a whitespace-tolerant match that still maps back to real offsets. Null when it is not genuinely present. */
export function locateExcerpt(regionText: string, excerpt: string): { charStart: number; charEnd: number } | null {
  const trimmed = excerpt.trim();
  if (!trimmed) return null;
  const exact = regionText.indexOf(trimmed);
  if (exact >= 0) return { charStart: exact, charEnd: exact + trimmed.length };
  const tokens = trimmed.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (tokens.length === 0) return null;
  const re = new RegExp(tokens.join("\\s+"));
  const m = re.exec(regionText);
  return m ? { charStart: m.index, charEnd: m.index + m[0].length } : null;
}

/**
 * F-5 (v4) CANONICAL IDENTITY: an item's identity is the source SLOT its primary span starts in (a deterministic
 * structural anchor - slots.ts), the coordination sub-index of that start within the slot, its semantic role and
 * its normalized quantitative values. It is NOT the model's own excerpt boundaries (v3 hashed charStart/charEnd,
 * so two excerpts of the same proposition that started a few words apart were two identities - 10% of the
 * frozen run-only items), and it is NOT the model's free-text proposition or its referenced-term list (measured on
 * the frozen runs, model-listed identifiers are themselves unstable and halve cross-run identity agreement).
 * Two genuinely distinct propositions in one sentence key differently through the coordination sub-index, their
 * values, their span cluster or a contradictory deontic effect; two wordings of the same proposition key the same and
 * merge (mergeAccepted).
 *
 * v5 (F-5.1): the semantic ROLE is NOT an identity component any more. The certification pair proved that one source
 * proposition carrying several overlapping functions (alternative + addend, condition + floor, exception + permission)
 * received two identities purely from the label the model happened to pick. Identity now represents WHAT SOURCE
 * SEMANTIC EXISTS (slot, coordination position, span cluster, values); the canonical semantic functions describe it.
 */
export function computeInventoryItemId(candidateRef: string, regionId: string, slotId: string, coordinationSubIndex: number, values: QuantitativeValue[], clusterOrdinal: number = 0, valueSignatureOverride?: string): string {
  const valueSignature =
    valueSignatureOverride ??
    values
      .map((v) => `${v.kind}:${v.normalizedValue ?? v.rawText.replace(/\s+/g, " ").trim().toLowerCase()}`)
      .sort()
      .join("|");
  return computeStableKey("inv-item", candidateRef, regionId, slotId, String(coordinationSubIndex), String(clusterOrdinal), valueSignature, SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION);
}

/** The clause position an excerpt really starts at: leading whitespace, punctuation, enumerators ("(a)", "(iv)") and coordinating connectives ("and", "or", "plus", "less") are skipped so two wordings of one proposition that differ only in whether they copied the enumerator share a start. */
export function normalizedStart(regionText: string, charStart: number): number {
  let i = charStart;
  const LEAD = /^(?:\s+|[,;:.]+|\(?[a-z0-9]{1,4}\)|(?:and\/or|and|or|but|nor|plus|minus|less)(?=[\s,;(]))/i;
  for (;;) {
    const m = LEAD.exec(regionText.slice(i, i + 32));
    if (!m || m[0].length === 0) break;
    i += m[0].length;
  }
  return i;
}

/** Deterministic merge of a same-identity wire item into the already-accepted one: the span becomes the union of both (they overlap by construction, so the union is one contiguous stretch and no coverage credit is lost), values and identifiers are unioned, materiality takes the strongest claim, the first proposition stays (order-independent for identity, span, values, refs and materiality). */
function mergeAccepted(target: SemanticInventoryItem, incoming: SemanticInventoryItem, regionText?: string): void {
  if (regionText !== undefined && incoming.sourceSpan.regionId === target.sourceSpan.regionId) {
    const charStart = Math.min(target.sourceSpan.charStart, incoming.sourceSpan.charStart);
    const charEnd = Math.max(target.sourceSpan.charEnd, incoming.sourceSpan.charEnd);
    target.sourceSpan = { ...target.sourceSpan, charStart, charEnd, excerpt: regionText.slice(charStart, charEnd) };
  }
  for (const v of incoming.quantitativeValues) if (!target.quantitativeValues.some((t) => quantitativeValuesEquivalent(t, v))) target.quantitativeValues.push(v);
  target.quantitativeValues.sort((a, b) => a.charStart - b.charStart);
  for (const t of incoming.referencedTerms) if (!target.referencedTerms.includes(t)) target.referencedTerms.push(t);
  for (const sec of incoming.referencedSections) if (!target.referencedSections.includes(sec)) target.referencedSections.push(sec);
  target.referencedTerms.sort();
  target.referencedSections.sort();
  if (MATERIALITY_RANK[incoming.materiality] > MATERIALITY_RANK[target.materiality]) target.materiality = incoming.materiality;
  if (target.ambiguity === "NONE" && incoming.ambiguity !== "NONE") {
    target.ambiguity = incoming.ambiguity;
    target.ambiguityReason = incoming.ambiguityReason;
  }
  if (target.operative === "UNKNOWN") target.operative = incoming.operative;
  // v5: the canonical functions are the UNION of both descriptions of this one proposition; the declared labels are kept for transparency; the legacy role is re-derived.
  if (target.semanticFunctions && incoming.semanticFunctions) {
    target.semanticFunctions = unionFunctions(target.semanticFunctions, incoming.semanticFunctions);
    target.declaredRoles = [...new Set([...(target.declaredRoles ?? []), ...(incoming.declaredRoles ?? [])])];
    const declaredTokens = new Set([...(target.functionProvenance?.declared ?? []), ...(incoming.functionProvenance?.declared ?? [])]);
    const allTokens = functionsSignature(target.semanticFunctions).split("|").filter(Boolean);
    target.functionProvenance = { declared: allTokens.filter((t) => declaredTokens.has(t)), deterministic: allTokens.filter((t) => !declaredTokens.has(t)) };
    target.semanticRole = deriveLegacyRole(target.semanticFunctions, target.declaredRoles);
  }
  target.mergedDuplicates = (target.mergedDuplicates ?? 0) + 1;
}

function normalizeWireValue(v: WireInventoryItem["quantitativeValues"][number], regionText: string, spanStart: number, spanEnd: number): QuantitativeValue {
  const kind = matchEnum(v.kind, QUANTITATIVE_KINDS, "OTHER" as QuantitativeKind);
  const raw = v.rawText.trim();
  let charStart = -1;
  let charEnd = -1;
  if (raw) {
    const inSpan = regionText.slice(spanStart, spanEnd).indexOf(raw);
    if (inSpan >= 0) {
      charStart = spanStart + inSpan;
      charEnd = charStart + raw.length;
    } else {
      const anywhere = regionText.indexOf(raw);
      if (anywhere >= 0) {
        charStart = anywhere;
        charEnd = anywhere + raw.length;
      }
    }
  }
  // Prefer the deterministic normalization when the scanner recognizes the raw text; fall back to the model's own normalization.
  const scanned = raw ? scanQuantitativeValues(raw)[0] : undefined;
  const normalizedValue = scanned && scanned.kind === kind && scanned.normalizedValue !== null ? scanned.normalizedValue : (v.normalizedValue ?? scanned?.normalizedValue ?? null);
  const unit = v.unit ?? scanned?.unit ?? null;
  return { kind, rawText: raw, normalizedValue, unit, charStart, charEnd };
}

// ---------------------------------------------------------------------------
// v3 SOURCE COVERAGE (source-coverage.ts) - Pass A's accounting of the source
// itself. The v2 detector that lived here (a connective vocabulary, a
// 40-character floor, a 50% coverage threshold, a punctuation boundary and an
// operative-region filter, all conjunctive) was demonstrated by an independent
// audit to let material text through on every one of those five axes. It is
// gone. Coverage is now computed over EVERY region of the unit with source
// presumed accountable; see source-coverage.ts.
// ---------------------------------------------------------------------------

/** Only a CRITICAL/MATERIAL item accounts for source; an INFORMATIONAL or REVIEW_UNCERTAIN echo never closes a gap. */
const ACCOUNTING_SPAN = (s: { materiality?: string }) => s.materiality === "CRITICAL" || s.materiality === "MATERIAL";

/** The accounting spans of an accepted inventory, as source-coverage sees them. */
const accountingSpansOf = (items: SemanticInventoryItem[]): AccountingSpanInput[] => items.map((i) => ({ regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: i.materiality }));

/** Runs whole-unit source coverage for an inventory state. */
function coverageFor(input: SemanticInventoryInput, items: SemanticInventoryItem[]): SourceCoverageResult {
  return computeSourceCoverage({ regions: input.sourceContext.regions, spans: accountingSpansOf(items), externalAccountability: input.externalAccountability });
}

/** Projects a coverage result onto the frozen-inventory shapes. */
function unaccountedFrom(cov: SourceCoverageResult): UnaccountedSourceSpan[] {
  return cov.unaccounted.map((s) => ({ regionId: s.regionId, charStart: s.charStart, charEnd: s.charEnd, excerpt: s.excerpt, reason: s.reason, values: s.values }));
}

function summaryFrom(cov: SourceCoverageResult, links: ExternalAccountabilityLink[]): SourceCoverageSummary {
  const totalChars = Object.values(cov.charsByDisposition).reduce((a, b) => a + b, 0);
  const accountedChars = Object.entries(cov.charsByDisposition).filter(([d]) => isAccountedDisposition(d as never)).reduce((a, [, n]) => a + n, 0);
  return {
    regionsConsidered: cov.regionsConsidered,
    countsByDisposition: { ...cov.countsByDisposition },
    charsByDisposition: { ...cov.charsByDisposition },
    accountedCharFraction: totalChars === 0 ? 1 : Number((accountedChars / totalChars).toFixed(4)),
    externallyAccountedRegions: links.filter((l) => cov.regionsConsidered.includes(l.regionId)).map((l) => ({ regionId: l.regionId, ownerCandidateRef: l.ownerCandidateRef, ownerInventoryHash: l.ownerInventoryHash })),
  };
}

function freezeHash(items: SemanticInventoryItem[], uninventoried: FrozenSemanticInventory["uninventoriedValues"], unaccounted: UnaccountedSourceSpan[]): string {
  const parts = items.map((i) => `${i.inventoryItemId}|${i.semanticFunctions ? functionsSignature(i.semanticFunctions) : i.semanticRole}|${i.materiality}|${i.sourceSpan.regionId}:${i.sourceSpan.charStart}-${i.sourceSpan.charEnd}|${i.quantitativeValues.map((v) => `${v.kind}=${v.normalizedValue ?? v.rawText}`).join(",")}`);
  parts.push(...uninventoried.map((v) => `uninv|${v.regionId}:${v.charStart}-${v.charEnd}|${v.kind}=${v.normalizedValue ?? v.rawText}`));
  parts.push(...unaccounted.map((s) => `unacc|${s.regionId}:${s.charStart}-${s.charEnd}`));
  return hashParts([SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, ...parts.sort()]);
}

function buildResult(input: SemanticInventoryInput, caller: StageCaller, items: SemanticInventoryItem[], status: InventoryStatus, statusReason: string, rejectedUnverifiable: number, rejectedDuplicates: number, cov: SourceCoverageResult, gapReinventory: GapReinventoryRecord | null, costUsd: number | null, partition?: FrozenSemanticInventory["partition"]): FrozenSemanticInventory {
  // Quantitative accounting comes from the same coverage pass as the text: EVERY quantitative kind, EVERY region.
  // There is no money/percent/ratio shortlist and no "operative" region filter - the audit demonstrated both as
  // silent-omission channels. A value inside deterministically non-semantic source (page furniture, a heading) is
  // not reported; a value anywhere else that no CRITICAL/MATERIAL item anchors is.
  const uninventoried: FrozenSemanticInventory["uninventoriedValues"] = cov.unaccountedValues.map((v) => ({ ...v }));
  const unaccounted = unaccountedFrom(cov);
  return {
    candidateRef: input.candidateRef,
    items,
    uninventoriedValues: uninventoried,
    unaccountedSource: unaccounted,
    sourceCoverage: summaryFrom(cov, input.externalAccountability ?? []),
    gapReinventory,
    inventoryStatus: status,
    inventoryStatusReason: statusReason,
    rejectedUnverifiableItems: rejectedUnverifiable,
    rejectedDuplicateItems: rejectedDuplicates,
    sourceContextState: input.sourceContext.state,
    frozenContentHash: freezeHash(items, uninventoried, unaccounted),
    frozenAt: new Date().toISOString(),
    algorithmVersion: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION,
    promptVersion: SEMANTIC_INVENTORY_PROMPT_VERSION,
    provider: caller.providerName,
    model: caller.model,
    telemetryCostUsd: costUsd,
    ...(partition ? { partition } : {}),
  };
}

const sumCost = (a: number | null, b: number | null): number | null => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

function sourceLooksMaterial(sourceContext: SourceContextResult): boolean {
  const operative = sourceContext.regions.find((r) => r.kind === "OPERATIVE");
  if (!operative) return false;
  return scanQuantitativeValues(operative.text).length > 0 || (operative.text.length > 200 && OPERATIVE_LANGUAGE_RE.test(operative.text));
}

/** Deterministic post-processing of a wire submission into trusted, identity-bearing inventory items. Exported so the synthetic corpus can exercise it directly without a model. */
export function normalizeInventorySubmission(input: Pick<SemanticInventoryInput, "candidateRef" | "sourceContext"> & { structuralIndex?: StructuralIndex | null }, wireItems: WireInventoryItem[], partition?: SlotPartition): { items: SemanticInventoryItem[]; rejectedUnverifiable: number; rejectedDuplicates: number; /** v5: the wire localRefs each accepted item absorbed (its own plus every merged duplicate) - for replay/migration accounting. */ memberLocalRefs: Record<string, string[]> } {
  const regions = input.sourceContext.regions;
  const operative = regions.find((r) => r.kind === "OPERATIVE") ?? regions[0];
  const slots = partition ?? partitionSourceSlots({ sourceContext: input.sourceContext, structuralIndex: input.structuralIndex ?? null });
  let rejectedUnverifiable = 0;
  let rejectedDuplicates = 0;

  // Phase 1: verify every excerpt against the source and build the identity-free item.
  interface Located { wire: WireInventoryItem; order: number; item: SemanticInventoryItem; baseKey: string; regionId: string; regionText: string; charStart: number; charEnd: number; nStart: number }
  const located: Located[] = [];
  wireItems.forEach((wire, order) => {
    const excerpt = wire.excerpt.trim().slice(0, MAX_EXCERPT_CHARS);
    const candidates: SourceContextRegion[] = wire.regionId ? [...regions.filter((r) => r.regionId === wire.regionId), ...regions.filter((r) => r.regionId !== wire.regionId)] : operative ? [operative, ...regions.filter((r) => r !== operative)] : regions;
    let loc: { region: SourceContextRegion; charStart: number; charEnd: number } | null = null;
    // The named slot first (its own text, offsets mapped back to the region), then the whole region(s): a wrong or missing slotId is recovered from where the excerpt really is, never trusted on its own.
    const namedSlot = wire.slotId ? slots.slots.find((sl) => sl.slotId === wire.slotId) : undefined;
    if (namedSlot) {
      const region = regions.find((r) => r.regionId === namedSlot.regionId);
      const inSlot = region ? locateExcerpt(namedSlot.text, excerpt) : null;
      if (region && inSlot) loc = { region, charStart: inSlot.charStart + namedSlot.charStart, charEnd: inSlot.charEnd + namedSlot.charStart };
    }
    for (const region of loc ? [] : candidates) {
      const found = locateExcerpt(region.text, excerpt);
      if (found) {
        loc = { region, ...found };
        break;
      }
    }
    if (!loc) {
      rejectedUnverifiable++;
      return;
    }
    const slot = slotForOffset(slots, loc.region.regionId, loc.charStart);
    const declaredRoles: SemanticRole[] = [...new Set([wire.semanticRole, ...(wire.additionalRoles ?? [])].map((r) => matchEnum(r, SEMANTIC_ROLES, "OTHER" as SemanticRole)))];
    const regionText = loc.region.text;
    const values: QuantitativeValue[] = wire.quantitativeValues.map((v) => normalizeWireValue(v, regionText, loc!.charStart, loc!.charEnd)).filter((v) => v.rawText.length > 0);
    // Deterministic completion: any scanner value inside this item's span that the model did not list is attached (the model may under-list; the accounting must not).
    for (const scanned of scanQuantitativeValues(regionText.slice(loc.charStart, loc.charEnd))) {
      const abs = { ...scanned, charStart: scanned.charStart + loc.charStart, charEnd: scanned.charEnd + loc.charStart };
      if (!values.some((v) => quantitativeValuesEquivalent(v, abs))) values.push(abs);
    }
    values.sort((a, b) => a.charStart - b.charStart);
    const slotId = slot ? slot.slotId : `${loc.region.regionId}:region#1`;
    const valueSignature = values.map((v) => `${v.kind}:${v.normalizedValue ?? v.rawText.replace(/\s+/g, " ").trim().toLowerCase()}`).sort().join("|");
    // v5: identity is role-blind - the base key is source ownership only.
    const baseKey = [loc.region.regionId, slotId, String(slot ? coordinationIndex(slot, loc.charStart) : 0), valueSignature].join("\u0000");
    const operativeFlag = matchEnum(wire.operative, OPERATIVE_FLAGS, "UNKNOWN" as OperativeFlag);
    const precedingText = slot ? [...slot.context.map((c) => c.text), slot.text.slice(0, Math.max(0, loc.charStart - slot.charStart))].join("\n") : regionText.slice(Math.max(0, loc.charStart - 400), loc.charStart);
    const derived = deriveSemanticFunctions({ declaredRoles, spanText: regionText.slice(loc.charStart, loc.charEnd), precedingText, values, referencedSections: wire.referencedSections.map((sec) => sec.trim()).filter(Boolean), operative: operativeFlag });
    const role = deriveLegacyRole(derived.functions, declaredRoles);
    const item: SemanticInventoryItem = {
      inventoryItemId: "",
      sourceSpan: {
        regionId: loc.region.regionId,
        documentId: loc.region.documentId,
        sourceNodeId: slot?.sourceNodeId ?? loc.region.sourceNodeId,
        sectionRef: loc.region.sectionRef,
        charStart: loc.charStart,
        charEnd: loc.charEnd,
        sourceCitation: loc.region.sectionRef ? `§${loc.region.sectionRef}` : `${loc.region.documentId}::${loc.region.regionId}`,
        excerpt: regionText.slice(loc.charStart, loc.charEnd),
      },
      semanticRole: role,
      semanticFunctions: derived.functions,
      declaredRoles,
      functionProvenance: derived.provenance,
      proposition: wire.proposition.trim(),
      quantitativeValues: values,
      referencedTerms: wire.referencedTerms.map((t) => t.trim()).filter(Boolean),
      referencedSections: wire.referencedSections.map((sec) => sec.trim()).filter(Boolean),
      parentItemId: null,
      relatedItemIds: [],
      materiality: matchEnum(wire.materiality, INVENTORY_MATERIALITIES, "REVIEW_UNCERTAIN" as InventoryMateriality),
      ambiguity: matchEnum(wire.ambiguity, INVENTORY_AMBIGUITIES, "NONE" as InventoryAmbiguity),
      ambiguityReason: wire.ambiguityReason?.trim() || null,
      operative: operativeFlag,
      detectionMethod: "MODEL",
      slotId,
    };
    located.push({ wire, order, item, baseKey, regionId: loc.region.regionId, regionText, charStart: loc.charStart, charEnd: loc.charEnd, nStart: normalizedStart(regionText, loc.charStart) });
  });

  // Phase 2: identity. Items sharing a base key (slot, coordination sub-index, values - v5: role-blind) are clustered by
  // MUTUAL span overlap (>= 50% of the LONGER span): such a pair is two wordings/boundaries of one proposition and
  // merges. A DISJOINT pair ("A plus B" as two addends) and a CONTAINED pair (a sub-exception inside its parent
  // exception, a list member inside the list) are distinct propositions that happen to share a slot and
  // stay separate items, distinguished by the deterministic ordinal of their cluster in source order. Measured on
  // the frozen Chewy runs this rule produces 0 false merges in either run. Clustering is by source position, so
  // the result is independent of the order the model listed the items in.
  const overlap = (a: Located, b: Located): number => Math.max(0, Math.min(a.charEnd, b.charEnd) - Math.max(a.charStart, b.charStart));
  const mutualOverlap = (a: Located, b: Located): number => overlap(a, b) / Math.max(1, Math.max(a.charEnd - a.charStart, b.charEnd - b.charStart));
  const containedOverlap = (a: Located, b: Located): number => overlap(a, b) / Math.max(1, Math.min(a.charEnd - a.charStart, b.charEnd - b.charStart));
  // A source-owned VALUE pins a proposition: "$50,000,000" and "the greater of $50,000,000" (same slot and
  // value) are one alternative however wide the excerpt, so containment (>= 50% of the shorter) merges valued
  // items; value-free items need MUTUAL overlap (a nested sub-exception must not vanish into its parent).
  // v5 false-merge guards (identity is role-blind, so these carry the burden the role used to carry):
  //  (1) two descriptions with CONTRADICTORY deontic effects (PERMISSION vs PROHIBITION vs REQUIREMENT) over one
  //      stretch are two propositions, never one - they never share a cluster whatever their overlap;
  //  (2) a value-free item that STARTS somewhere else than its overlapping neighbour (after the enumerator and any
  //      coordinating connective, with one word of slop) is a NESTED proposition - a cross-reference inside the permission it qualifies,
  //      a sub-exception inside its exception, a branch inside its selection - and stays its own identity.
  //      Boundary slop between two wordings of one proposition sits at the END of the excerpt (or in a leading
  //      enumerator), never at a different clause position; measured on the certification pair every intra-run
  //      different-role overlap that is genuinely one proposition shares its start, every nested one does not.
  const sameProposition = (a: Located, b: Located, hasValues: boolean): boolean =>
    !effectsContradict(a.item.semanticFunctions!.effect, b.item.semanticFunctions!.effect) &&
    (hasValues ? containedOverlap(a, b) >= 0.5 && (sameStart(a, b) || valueDominated(a) || valueDominated(b)) : sameStart(a, b) && mutualOverlap(a, b) >= 0.5);
  //  (3) a VALUE pins a proposition only when the shorter excerpt is essentially the value itself ("$50,000,000" inside
  //      "the greater of $50,000,000" is boundary slop); a value-bearing CLAUSE that starts elsewhere inside a longer
  //      value-bearing clause ("capped at the greater of $720 million and 100% of EBITDA" inside the permission it caps,
  //      branch "(x) 50% of CNI" inside the selection "the greater of (x) 50% of CNI and (y) ...") is a nested proposition.
  const valueDominated = (l: Located): boolean => {
    let residue = l.regionText.slice(l.charStart, l.charEnd);
    for (const v of l.item.quantitativeValues) residue = residue.split(v.rawText).join(" ");
    return (residue.match(/[A-Za-z]{2,}/g) ?? []).length <= 3;
  };
  // "Same start": the normalized starts coincide or differ by at most ONE word (a dropped article or first token is
  // boundary slop; a nested proposition begins at least two words in - a citation, a proviso, a branch).
  const sameStart = (a: Located, b: Located): boolean => {
    if (a.nStart === b.nStart) return true;
    const between = a.regionText.slice(Math.min(a.nStart, b.nStart), Math.max(a.nStart, b.nStart));
    return (between.match(/\S+/g) ?? []).length <= 1;
  };
  const groups = new Map<string, Located[]>();
  for (const l of located) groups.set(l.baseKey, [...(groups.get(l.baseKey) ?? []), l]);
  const accepted: { item: SemanticInventoryItem; localRefs: string[]; parentRef: string | null; relatedRefs: string[] }[] = [];
  const localRefToId = new Map<string, string>();
  for (const [baseKey, members] of groups) {
    const bySource = [...members].sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd || a.order - b.order);
    const hasValues = members[0]!.item.quantitativeValues.length > 0;
    const clusters: Located[][] = [];
    for (const m of bySource) {
      const cluster = clusters.find((c) => c.some((x) => sameProposition(x, m, hasValues)));
      if (cluster) cluster.push(m);
      else clusters.push([m]);
    }
    const [regionId, slotId, coordination, valueSignature] = baseKey.split("\u0000") as [string, string, string, string];
    clusters.forEach((cluster, ordinal) => {
      const inventoryItemId = computeInventoryItemId(input.candidateRef, regionId, slotId, Number(coordination), cluster[0]!.item.quantitativeValues, ordinal, valueSignature);
      // The representative is the member the model listed first (its wording/span); the others merge into it.
      const byOrder = [...cluster].sort((a, b) => a.order - b.order);
      const head = byOrder[0]!;
      head.item.inventoryItemId = inventoryItemId;
      for (const other of byOrder.slice(1)) {
        mergeAccepted(head.item, other.item, head.regionText);
        rejectedDuplicates++;
      }
      for (const m of byOrder) localRefToId.set(m.wire.localRef, inventoryItemId);
      accepted.push({ item: head.item, localRefs: byOrder.map((m) => m.wire.localRef), parentRef: head.wire.parentRef, relatedRefs: byOrder.flatMap((m) => m.wire.relatedRefs) });
    });
  }
  accepted.sort((a, b) => a.item.sourceSpan.charStart - b.item.sourceSpan.charStart || a.item.sourceSpan.charEnd - b.item.sourceSpan.charEnd || a.item.inventoryItemId.localeCompare(b.item.inventoryItemId));

  for (const a of accepted) {
    const parentId = a.parentRef ? (localRefToId.get(a.parentRef) ?? null) : null;
    a.item.parentItemId = parentId === a.item.inventoryItemId ? null : parentId;
    a.item.relatedItemIds = [...new Set(a.relatedRefs.map((r) => localRefToId.get(r)).filter((id): id is string => !!id && id !== a.item.inventoryItemId))].sort();
  }
  const memberLocalRefs: Record<string, string[]> = {};
  for (const a of accepted) memberLocalRefs[a.item.inventoryItemId] = a.localRefs;
  return { items: accepted.map((a) => a.item), rejectedUnverifiable, rejectedDuplicates, memberLocalRefs };
}

/** Maps unaccounted coverage stretches onto the deterministic slots they fall in (a stretch crossing slots is attached to every slot it touches). */
function gapsBySlot(partition: SlotPartition, unaccounted: { regionId: string; charStart: number; charEnd: number; excerpt: string }[]): { slot: SourceSlot; unaccounted: { charStart: number; charEnd: number; excerpt: string }[] }[] {
  const out = new Map<string, { slot: SourceSlot; unaccounted: { charStart: number; charEnd: number; excerpt: string }[] }>();
  for (const u of unaccounted) {
    for (const slot of partition.slots) {
      if (slot.regionId !== u.regionId || slot.charEnd <= u.charStart || slot.charStart >= u.charEnd) continue;
      const entry = out.get(slot.slotId) ?? { slot, unaccounted: [] };
      entry.unaccounted.push({ charStart: u.charStart, charEnd: u.charEnd, excerpt: u.excerpt });
      out.set(slot.slotId, entry);
    }
  }
  return [...out.values()].sort((a, b) => a.slot.ordinal - b.slot.ordinal);
}

/**
 * Runs Pass A for one compilation unit and returns the FROZEN inventory.
 * Never throws - a failed call is an INVENTORY_FAILED result.
 *
 * v3: after the first pass, deterministic SOURCE COVERAGE runs over every
 * region of the semantic unit (source-coverage.ts). Detection is
 * deterministic and complete: it does not consult the model, and it does not
 * require text to look operative before scrutinising it. If any stretch of
 * source is UNACCOUNTED_SOURCE, ONE bounded targeted gap re-inventory call
 * receives exactly those stretches and may only ADD verified items (same
 * anti-hallucination gate, value completion, id derivation and duplicate
 * rejection). The gap call is REMEDIATION, never detection: whatever it
 * returns, coverage is recomputed, and anything still unaccounted is surfaced
 * with status INVENTORY_COVERAGE_GAP - never INVENTORY_OK.
 */
export async function runSemanticInventory(input: SemanticInventoryInput): Promise<FrozenSemanticInventory> {
  const caller = input.caller ?? getStageCaller();
  const emptyCoverage = () => coverageFor(input, []);
  if (caller.isSynthetic) {
    return buildResult(input, caller, [], "INVENTORY_SKIPPED_NO_PROVIDER", "no real model provider is configured (synthetic StageCaller) - the inventory was not generated; accountability cannot be established for this unit", 0, 0, emptyCoverage(), null, null);
  }
  // F-5 (v4): deterministic slots first, then bounded calls over consecutive slot batches. The source, not the
  // model, decides the boundaries; the model interprets each slot's semantics within them.
  const partition = partitionSourceSlots({ sourceContext: input.sourceContext, structuralIndex: input.structuralIndex ?? null });
  const batchChars = input.batchChars ?? 6000;
  // First pass: the OPERATIVE region(s) only, exactly as v3 - expansion regions are read-only context ("inventory a
  // non-operative region's own components only where the operative text incorporates them"). Every region stays
  // in the partition so an item located in an expansion region still gets a slot identity, and the gap pass can
  // re-present any region's unaccounted slots.
  const operativeRegionIds = new Set(input.sourceContext.regions.filter((r) => r.kind === "OPERATIVE").map((r) => r.regionId));
  const firstPassPartition: SlotPartition = { slots: partition.slots.filter((sl) => operativeRegionIds.size === 0 || operativeRegionIds.has(sl.regionId)), methods: partition.methods };
  const batches: SlotBatch[] = batchSlots(firstPassPartition, input.sourceContext, batchChars);
  const partitionRecord = (gapBatches: number, gapCalls: number): FrozenSemanticInventory["partition"] => ({ methods: partition.methods, slots: partition.slots.map((sl) => ({ slotId: sl.slotId, regionId: sl.regionId, sectionRef: sl.sectionRef, charStart: sl.charStart, charEnd: sl.charEnd })), batches: batches.length, batchChars, gapBatches, firstPassCalls: batches.length, gapCalls });
  const wireItems: WireInventoryItem[] = [];
  let firstPassCost: number | null = null;
  let firstPassWireCount = 0;
  for (const batch of batches) {
    try {
      const wire = await caller.call(SubmitSemanticInventorySchema, "semantic_inventory", buildInventorySystemPrompt(), buildInventoryUserContent(input.sourceContext, batch));
      wireItems.push(...wire.items);
      firstPassWireCount += wire.items.length;
    } catch (err) {
      return buildResult(input, caller, [], "INVENTORY_FAILED", `inventory call failed on batch ${batch.batchIndex + 1}/${batches.length}: ${err instanceof Error ? err.message : String(err)}`, 0, 0, emptyCoverage(), null, sumCost(firstPassCost, caller.lastTelemetry()?.calculatedCostUsd ?? null), partitionRecord(0, 0));
    }
    firstPassCost = sumCost(firstPassCost, caller.lastTelemetry()?.calculatedCostUsd ?? null);
  }
  const first = normalizeInventorySubmission(input, wireItems, partition);
  let items = first.items;

  // Deterministic detection over the WHOLE unit, then bounded remediation calls over the affected SLOTS (whole
  // slots, deterministic boundaries - never run-specific fragments).
  let cov = coverageFor(input, items);
  let gapReinventory: GapReinventoryRecord = { attempted: false, segmentsBefore: cov.unaccounted.length, itemsAdded: 0, duplicatesDropped: 0, unverifiableDropped: 0, segmentsAfter: cov.unaccounted.length, costUsd: null, error: null };
  let gapBatchCount = 0;
  let gapCallCount = 0;
  if (cov.unaccounted.length > 0) {
    const segmentsBefore = cov.unaccounted.length;
    const affected = gapsBySlot(partition, cov.unaccounted);
    const gapPartition: SlotPartition = { slots: affected.map((g) => g.slot), methods: partition.methods };
    const gapBatches = batchSlots(gapPartition, input.sourceContext, batchChars);
    gapBatchCount = gapBatches.length;
    const gapWire: WireInventoryItem[] = [];
    let gapCost: number | null = null;
    let gapError: string | null = null;
    for (const gb of gapBatches) {
      const gaps = gb.slots.map((slot) => affected.find((g) => g.slot.slotId === slot.slotId)!);
      try {
        const wire = await caller.call(SubmitSemanticInventorySchema, "semantic_inventory_gap", buildInventorySystemPrompt(), buildGapReinventoryUserContent(input.sourceContext, gaps, gb.precedingText));
        gapWire.push(...wire.items);
        gapCallCount++;
        gapCost = sumCost(gapCost, caller.lastTelemetry()?.calculatedCostUsd ?? null);
      } catch (err) {
        gapCost = sumCost(gapCost, caller.lastTelemetry()?.calculatedCostUsd ?? null);
        gapError = `gap re-inventory call failed on gap batch ${gb.batchIndex + 1}/${gapBatches.length}: ${err instanceof Error ? err.message : String(err)}`;
        break;
      }
    }
    // First-pass and gap items are normalized TOGETHER so identity clustering is global: a gap item that overlaps a
    // first-pass item merges into it; a disjoint one is a new item. Neither can be decided from the gap set alone.
    const combined = normalizeInventorySubmission(input, [...wireItems, ...gapWire], partition);
    const firstIds = new Set(items.map((i) => i.inventoryItemId));
    const added = combined.items.filter((i) => !firstIds.has(i.inventoryItemId));
    items = combined.items;
    cov = coverageFor(input, items);
    gapReinventory = { attempted: true, segmentsBefore, itemsAdded: added.length, duplicatesDropped: Math.max(0, combined.rejectedDuplicates - first.rejectedDuplicates), unverifiableDropped: Math.max(0, combined.rejectedUnverifiable - first.rejectedUnverifiable), segmentsAfter: cov.unaccounted.length, costUsd: gapCost, error: gapError };
  }
  const totalCost = sumCost(firstPassCost, gapReinventory.costUsd);
  const rejectedUnverifiable = first.rejectedUnverifiable;
  const rejectedDuplicates = first.rejectedDuplicates;
  const partitionInfo = partitionRecord(gapBatchCount, gapCallCount);

  // The coverage verdict is decided BEFORE any other status branch: unaccounted source outranks every other
  // observation about the inventory, including an empty one.
  // An EMPTY inventory over material-looking source is reported as EMPTY_SUSPECT rather than as a coverage gap:
  // both refuse completeness identically, and EMPTY_SUSPECT names the more specific failure. Its span list is the
  // same coverage result, so no unaccounted text is lost by taking this branch.
  if (items.length === 0 && sourceLooksMaterial(input.sourceContext)) {
    return buildResult(input, caller, items, "INVENTORY_EMPTY_SUSPECT", `the model returned ${firstPassWireCount} item(s), ${rejectedUnverifiable} rejected as unverifiable, leaving an EMPTY inventory over source that carries quantitative values or operative language - treated as suspect, never as 'nothing material here'; ${cov.unaccounted.length} stretch(es) of source are unaccounted`, rejectedUnverifiable, rejectedDuplicates, cov, gapReinventory, totalCost, partitionInfo);
  }
  if (cov.unaccounted.length > 0) {
    const preview = cov.unaccounted.slice(0, 3).map((s) => `${s.regionId}:${s.charStart}-${s.charEnd}`).join(", ");
    return buildResult(input, caller, items, "INVENTORY_COVERAGE_GAP", `${items.length} item(s) accepted (${gapReinventory.itemsAdded} added by the targeted gap re-inventory), but ${cov.unaccounted.length} stretch(es) of source across ${cov.regionsConsidered.length} region(s) remain UNACCOUNTED_SOURCE (${preview}${cov.unaccounted.length > 3 ? ", ..." : ""})${gapReinventory.error ? ` (${gapReinventory.error})` : ""} - accountability for that text is not established; see unaccountedSource`, rejectedUnverifiable, rejectedDuplicates, cov, gapReinventory, totalCost, partitionInfo);
  }
  if (items.length === 0) {
    return buildResult(input, caller, items, "INVENTORY_OK", "empty inventory over source that source coverage accounts for in full as non-semantic (headings, citations, formatting) with no quantitative value and no operative language", rejectedUnverifiable, rejectedDuplicates, cov, gapReinventory, totalCost, partitionInfo);
  }
  return buildResult(input, caller, items, "INVENTORY_OK", `${items.length} item(s) accepted over ${partition.slots.length} slot(s) in ${batches.length} bounded call(s), ${rejectedUnverifiable} rejected as unverifiable, ${rejectedDuplicates} same-identity wording(s) merged; source coverage accounts for every stretch of source in ${cov.regionsConsidered.length} region(s)${gapReinventory.attempted ? ` (the targeted gap re-inventory closed ${gapReinventory.segmentsBefore} unaccounted stretch(es) with ${gapReinventory.itemsAdded} added item(s))` : ""}`, rejectedUnverifiable, rejectedDuplicates, cov, gapReinventory, totalCost, partitionInfo);
}
