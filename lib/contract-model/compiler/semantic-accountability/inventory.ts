/**
 * SEMANTIC ACCOUNTABILITY - Pass A: source-derived semantic inventory
 * (mission §3-§6). One bounded, schema-forced model call per compilation
 * unit (reusing lib/contract-model/compiler/llm-caller.ts's provider-abstract
 * StageCaller - the same generic primitive Phase 3C's reviewer and Phase 3E's
 * Layer C use, NOT the compiler's own tool-use loop), followed by
 * deterministic post-processing that decides what is trusted:
 *
 *  - ANTI-HALLUCINATION GATE: an item's excerpt must be a real substring of
 *    exactly one region it was given (exact, else whitespace-tolerant);
 *    anything else is rejected and counted, never trusted because the JSON
 *    validated (Architecture Invariants #16).
 *  - STABLE IDENTITY: inventoryItemId is content-derived from the candidate,
 *    the role, the verified span and the normalized values - never from the
 *    model's free-text proposition, so the same component inventoried in two
 *    independent runs receives the same id (mission §27).
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
import { buildInventorySystemPrompt, buildInventoryUserContent } from "./prompt";
import { quantitativeValuesEquivalent, scanQuantitativeValues } from "./quantitative";
import { SubmitSemanticInventorySchema, type WireInventoryItem } from "./wire-schema";
import { INVENTORY_AMBIGUITIES, INVENTORY_MATERIALITIES, OPERATIVE_FLAGS, QUANTITATIVE_KINDS, SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION, SEMANTIC_ROLES } from "./types";
import type { FrozenSemanticInventory, InventoryAmbiguity, InventoryMateriality, InventoryStatus, OperativeFlag, QuantitativeKind, QuantitativeValue, SemanticInventoryItem, SemanticRole, SourceContextRegion, SourceContextResult } from "./types";

export interface SemanticInventoryInput {
  candidateRef: string;
  documentId: string;
  sourceContext: SourceContextResult;
  /** Injectable for testing; defaults to the real env-var-driven getStageCaller(). */
  caller?: StageCaller;
}

const MAX_EXCERPT_CHARS = 400;
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

export function computeInventoryItemId(candidateRef: string, role: SemanticRole, regionId: string, charStart: number, charEnd: number, values: QuantitativeValue[]): string {
  const valueSignature = values
    .map((v) => `${v.kind}:${v.normalizedValue ?? v.rawText.replace(/\s+/g, " ").trim().toLowerCase()}`)
    .sort()
    .join("|");
  return computeStableKey("inv-item", candidateRef, role, regionId, String(charStart), String(charEnd), valueSignature, SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION);
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

function freezeHash(items: SemanticInventoryItem[], uninventoried: FrozenSemanticInventory["uninventoriedValues"]): string {
  const parts = items.map((i) => `${i.inventoryItemId}|${i.semanticRole}|${i.materiality}|${i.sourceSpan.regionId}:${i.sourceSpan.charStart}-${i.sourceSpan.charEnd}|${i.quantitativeValues.map((v) => `${v.kind}=${v.normalizedValue ?? v.rawText}`).join(",")}`);
  parts.push(...uninventoried.map((v) => `uninv|${v.regionId}:${v.charStart}-${v.charEnd}|${v.kind}=${v.normalizedValue ?? v.rawText}`));
  return hashParts([SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, ...parts.sort()]);
}

function buildResult(input: SemanticInventoryInput, caller: StageCaller, items: SemanticInventoryItem[], status: InventoryStatus, statusReason: string, rejectedUnverifiable: number, rejectedDuplicates: number): FrozenSemanticInventory {
  // Quantitative accounting over every region - values no accepted item covers are surfaced, never dropped.
  const uninventoried: FrozenSemanticInventory["uninventoriedValues"] = [];
  for (const region of input.sourceContext.regions) {
    for (const v of scanQuantitativeValues(region.text)) {
      const covered = items.some((i) => i.sourceSpan.regionId === region.regionId && i.sourceSpan.charStart <= v.charStart && v.charEnd <= i.sourceSpan.charEnd);
      if (!covered) uninventoried.push({ ...v, regionId: region.regionId });
    }
  }
  return {
    candidateRef: input.candidateRef,
    items,
    uninventoriedValues: uninventoried,
    inventoryStatus: status,
    inventoryStatusReason: statusReason,
    rejectedUnverifiableItems: rejectedUnverifiable,
    rejectedDuplicateItems: rejectedDuplicates,
    sourceContextState: input.sourceContext.state,
    frozenContentHash: freezeHash(items, uninventoried),
    frozenAt: new Date().toISOString(),
    algorithmVersion: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION,
    promptVersion: SEMANTIC_INVENTORY_PROMPT_VERSION,
    provider: caller.providerName,
    model: caller.model,
    telemetryCostUsd: caller.lastTelemetry()?.calculatedCostUsd ?? null,
  };
}

function sourceLooksMaterial(sourceContext: SourceContextResult): boolean {
  const operative = sourceContext.regions.find((r) => r.kind === "OPERATIVE");
  if (!operative) return false;
  return scanQuantitativeValues(operative.text).length > 0 || (operative.text.length > 200 && OPERATIVE_LANGUAGE_RE.test(operative.text));
}

/** Deterministic post-processing of a wire submission into trusted, identity-bearing inventory items. Exported so the synthetic corpus can exercise it directly without a model. */
export function normalizeInventorySubmission(input: Pick<SemanticInventoryInput, "candidateRef" | "sourceContext">, wireItems: WireInventoryItem[]): { items: SemanticInventoryItem[]; rejectedUnverifiable: number; rejectedDuplicates: number } {
  const regions = input.sourceContext.regions;
  const operative = regions.find((r) => r.kind === "OPERATIVE") ?? regions[0];
  const accepted: { item: SemanticInventoryItem; localRef: string; parentRef: string | null; relatedRefs: string[] }[] = [];
  let rejectedUnverifiable = 0;
  let rejectedDuplicates = 0;

  for (const wire of wireItems) {
    const excerpt = wire.excerpt.trim().slice(0, MAX_EXCERPT_CHARS);
    const candidates: SourceContextRegion[] = wire.regionId ? [...regions.filter((r) => r.regionId === wire.regionId), ...regions.filter((r) => r.regionId !== wire.regionId)] : operative ? [operative, ...regions.filter((r) => r !== operative)] : regions;
    let located: { region: SourceContextRegion; charStart: number; charEnd: number } | null = null;
    for (const region of candidates) {
      const loc = locateExcerpt(region.text, excerpt);
      if (loc) {
        located = { region, ...loc };
        break;
      }
    }
    if (!located) {
      rejectedUnverifiable++;
      continue;
    }
    const role = matchEnum(wire.semanticRole, SEMANTIC_ROLES, "OTHER" as SemanticRole);
    const regionText = located.region.text;
    const values: QuantitativeValue[] = wire.quantitativeValues.map((v) => normalizeWireValue(v, regionText, located!.charStart, located!.charEnd)).filter((v) => v.rawText.length > 0);
    // Deterministic completion: any scanner value inside this item's span that the model did not list is attached (the model may under-list; the accounting must not).
    for (const scanned of scanQuantitativeValues(regionText.slice(located.charStart, located.charEnd))) {
      const abs = { ...scanned, charStart: scanned.charStart + located.charStart, charEnd: scanned.charEnd + located.charStart };
      if (!values.some((v) => quantitativeValuesEquivalent(v, abs))) values.push(abs);
    }
    values.sort((a, b) => a.charStart - b.charStart);

    const inventoryItemId = computeInventoryItemId(input.candidateRef, role, located.region.regionId, located.charStart, located.charEnd, values);
    if (accepted.some((a) => a.item.inventoryItemId === inventoryItemId)) {
      rejectedDuplicates++;
      continue;
    }
    const item: SemanticInventoryItem = {
      inventoryItemId,
      sourceSpan: {
        regionId: located.region.regionId,
        documentId: located.region.documentId,
        sourceNodeId: located.region.sourceNodeId,
        sectionRef: located.region.sectionRef,
        charStart: located.charStart,
        charEnd: located.charEnd,
        sourceCitation: located.region.sectionRef ? `§${located.region.sectionRef}` : `${located.region.documentId}::${located.region.regionId}`,
        excerpt: regionText.slice(located.charStart, located.charEnd),
      },
      semanticRole: role,
      proposition: wire.proposition.trim(),
      quantitativeValues: values,
      referencedTerms: wire.referencedTerms.map((t) => t.trim()).filter(Boolean),
      referencedSections: wire.referencedSections.map((s) => s.trim()).filter(Boolean),
      parentItemId: null,
      relatedItemIds: [],
      materiality: matchEnum(wire.materiality, INVENTORY_MATERIALITIES, "REVIEW_UNCERTAIN" as InventoryMateriality),
      ambiguity: matchEnum(wire.ambiguity, INVENTORY_AMBIGUITIES, "NONE" as InventoryAmbiguity),
      ambiguityReason: wire.ambiguityReason?.trim() || null,
      operative: matchEnum(wire.operative, OPERATIVE_FLAGS, "UNKNOWN" as OperativeFlag),
      detectionMethod: "MODEL",
    };
    accepted.push({ item, localRef: wire.localRef, parentRef: wire.parentRef, relatedRefs: wire.relatedRefs });
  }

  const idByLocalRef = new Map(accepted.map((a) => [a.localRef, a.item.inventoryItemId]));
  for (const a of accepted) {
    a.item.parentItemId = a.parentRef ? (idByLocalRef.get(a.parentRef) ?? null) : null;
    a.item.relatedItemIds = a.relatedRefs.map((r) => idByLocalRef.get(r)).filter((id): id is string => !!id);
  }
  return { items: accepted.map((a) => a.item), rejectedUnverifiable, rejectedDuplicates };
}

/** Runs Pass A for one compilation unit and returns the FROZEN inventory. Never throws - a failed call is an INVENTORY_FAILED result. */
export async function runSemanticInventory(input: SemanticInventoryInput): Promise<FrozenSemanticInventory> {
  const caller = input.caller ?? getStageCaller();
  if (caller.isSynthetic) {
    return buildResult(input, caller, [], "INVENTORY_SKIPPED_NO_PROVIDER", "no real model provider is configured (synthetic StageCaller) - the inventory was not generated; accountability cannot be established for this unit", 0, 0);
  }
  let wire;
  try {
    wire = await caller.call(SubmitSemanticInventorySchema, "semantic_inventory", buildInventorySystemPrompt(), buildInventoryUserContent(input.sourceContext));
  } catch (err) {
    return buildResult(input, caller, [], "INVENTORY_FAILED", `inventory call failed: ${err instanceof Error ? err.message : String(err)}`, 0, 0);
  }
  const { items, rejectedUnverifiable, rejectedDuplicates } = normalizeInventorySubmission(input, wire.items);
  if (items.length === 0) {
    const suspect = sourceLooksMaterial(input.sourceContext);
    return buildResult(input, caller, items, suspect ? "INVENTORY_EMPTY_SUSPECT" : "INVENTORY_OK", suspect ? `the model returned ${wire.items.length} item(s), ${rejectedUnverifiable} rejected as unverifiable, leaving an EMPTY inventory over source that carries quantitative values or operative language - treated as suspect, never as 'nothing material here'` : "empty inventory over source with no quantitative value and no operative language", rejectedUnverifiable, rejectedDuplicates);
  }
  return buildResult(input, caller, items, "INVENTORY_OK", `${items.length} item(s) accepted, ${rejectedUnverifiable} rejected as unverifiable, ${rejectedDuplicates} duplicate(s) dropped`, rejectedUnverifiable, rejectedDuplicates);
}
