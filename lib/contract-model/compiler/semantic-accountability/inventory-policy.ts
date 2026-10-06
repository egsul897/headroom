/**
 * PHASE-3 INVENTORY EXECUTION POLICY (Pass A). Defect ledger P3-E10..E14.
 *
 * Pass A is source-slot classification, not long-horizon reasoning. Before this module it ran on the generic
 * analyzer's DEFAULT_MAX_TOKENS = 128,000 with provider-default reasoning and an unbounded wire schema: a
 * 529-character clause produced 116,913 output tokens (benchmark recovery, 7.2(c)). Everything about a Pass A call is
 * now explicit and DERIVED from the deterministic slot partition:
 *
 *   maxItems(call)          = sum over the call's slots of maxPropositionsForSlot(slot)
 *   maxSerializedChars      = maxItems x perItemMaxSerializedChars(bounds, slot) + envelope
 *   requested max_tokens    = ceil(maxSerializedChars x outputTokensPerChar) + envelopeTokens
 *   reasoning               = explicit (DISABLED for the certified path), sent on the wire as `thinking`
 *
 * The provider enforces max_tokens over the WHOLE output (reasoning + visible), so even if a gateway ignored the
 * reasoning setting the pathological volume is impossible by construction: the request cannot return more tokens
 * than the schema-bounded inventory could legitimately need.
 */
import type { TransportRetryPolicy } from "../../analyzer/transport-retry";
import { CERTIFIED_TRANSPORT_RETRY_POLICY } from "../../analyzer/transport-retry";
import type { StructuralIndex } from "../structural-index";
import { scanQuantitativeValues } from "./quantitative";
import type { SourceSlot } from "./slots";

export const INVENTORY_EXECUTION_POLICY_VERSION = "phase3-inventory-execution.v1";
export type InventoryReasoningPolicy = "DISABLED" | "MINIMAL" | "PROVIDER_DEFAULT";

/** Bounds of the wire schema (wire-schema.ts builds the Zod schema from these; the prompt states them). */
export interface InventoryWireBounds {
  localRefChars: number;
  slotIdChars: number;
  roleChars: number;
  maxAdditionalRoles: number;
  propositionChars: number;
  excerptChars: number;
  maxQuantitativeValues: number;
  valueRawTextChars: number;
  valueUnitChars: number;
  maxReferencedTerms: number;
  referencedTermChars: number;
  maxReferencedSections: number;
  referencedSectionChars: number;
  maxRelatedRefs: number;
  ambiguityReasonChars: number;
}

export interface Phase3InventoryExecutionPolicy {
  version: typeof INVENTORY_EXECUTION_POLICY_VERSION;
  reasoning: InventoryReasoningPolicy;
  /** Wall-clock deadline for ONE inventory call (a child of the candidate deadline). */
  callDeadlineMs: number;
  retry: TransportRetryPolicy;
  /** Primary-text chars per bounded call and the slot-count ceiling of one call. */
  batchChars: number;
  maxBatchSlots: number;
  /** Ceiling on first-pass calls + gap calls per pass. */
  maxCallsPerPass: number;
  /** Per-slot proposition allowance: base + ceil(chars / charsPerProposition) + values + references, capped. */
  perSlot: { base: number; charsPerProposition: number; cap: number; unslottedPerCall: number };
  bounds: InventoryWireBounds;
  /** Output-token estimate per serialized char (JSON with numbers and punctuation tokenizes densely). */
  outputTokensPerChar: number;
  envelopeTokens: number;
}

export const CERTIFIED_INVENTORY_WIRE_BOUNDS: InventoryWireBounds = {
  localRefChars: 6, slotIdChars: 96, roleChars: 20, maxAdditionalRoles: 3, propositionChars: 120, excerptChars: 400,
  maxQuantitativeValues: 8, valueRawTextChars: 48, valueUnitChars: 12, maxReferencedTerms: 6, referencedTermChars: 60,
  maxReferencedSections: 6, referencedSectionChars: 40, maxRelatedRefs: 4, ambiguityReasonChars: 120,
};

export const CERTIFIED_INVENTORY_EXECUTION_POLICY: Phase3InventoryExecutionPolicy = {
  version: INVENTORY_EXECUTION_POLICY_VERSION,
  reasoning: "DISABLED",
  callDeadlineMs: 180_000,
  retry: CERTIFIED_TRANSPORT_RETRY_POLICY,
  batchChars: 6000,
  maxBatchSlots: 24,
  maxCallsPerPass: 12,
  perSlot: { base: 1, charsPerProposition: 150, cap: 8, unslottedPerCall: 2 },
  bounds: CERTIFIED_INVENTORY_WIRE_BOUNDS,
  outputTokensPerChar: 0.4,
  envelopeTokens: 256,
};

export function inventoryPolicyIdentity(p: Phase3InventoryExecutionPolicy): string {
  const b = p.bounds;
  return [p.version, `reasoning=${p.reasoning}`, `deadline=${p.callDeadlineMs}`, `retry=${p.retry.maxAttempts}`, `batch=${p.batchChars}/${p.maxBatchSlots}`, `calls=${p.maxCallsPerPass}`, `perSlot=${p.perSlot.base}+c/${p.perSlot.charsPerProposition}<=${p.perSlot.cap}`, `bounds=${b.propositionChars}/${b.excerptChars}/${b.maxQuantitativeValues}/${b.maxReferencedTerms}/${b.maxReferencedSections}`, `tpc=${p.outputTokensPerChar}`].join("|");
}

/** What deterministic code already knows about a slot; the model classifies, it does not re-derive these. */
export interface SlotDeterministicSignals {
  slotId: string;
  chars: number;
  values: { kind: string; rawText: string }[];
  references: string[];
  definedTerms: string[];
}

const REFERENCE_RE = /\b(?:Section|Sections|Subsection|clause|clauses|paragraph|Schedule|Exhibit|Annex|Article)\s+[0-9]+(?:\.[0-9]+)*(?:\([a-zA-Z0-9]+\))*|\bclause\s+\([a-zA-Z0-9]+\)/g;

export function computeSlotSignals(slot: SourceSlot, index: StructuralIndex | null | undefined): SlotDeterministicSignals {
  const values = scanQuantitativeValues(slot.text).map((v) => ({ kind: v.kind, rawText: v.rawText }));
  const references = [...new Set([...slot.text.matchAll(REFERENCE_RE)].map((m) => m[0].replace(/\s+/g, " ")))];
  const definedTerms: string[] = [];
  if (index) {
    const seen = new Set<string>();
    for (const def of index.allDefinitions()) {
      if (def.documentId !== slot.documentId || seen.has(def.normalizedTerm) || def.exactTerm.length < 3) continue;
      const escaped = def.exactTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`).test(slot.text)) { definedTerms.push(def.exactTerm); seen.add(def.normalizedTerm); }
    }
  }
  return { slotId: slot.slotId, chars: slot.text.length, values, references, definedTerms };
}

export function maxPropositionsForSlot(signals: SlotDeterministicSignals, policy: Phase3InventoryExecutionPolicy): number {
  const raw = policy.perSlot.base + Math.ceil(signals.chars / policy.perSlot.charsPerProposition) + signals.values.length + signals.references.length;
  return Math.max(1, Math.min(policy.perSlot.cap, raw));
}

/**
 * Serialized-JSON maximum of ONE item anchored to a slot. Every cap is either a field maximum or DERIVED from the
 * slot's own deterministic signals: the excerpt cannot exceed the slot's text; the model may cite at most the
 * references deterministic detection found plus one relative reference, the defined terms it found plus two
 * capitalized mentions, and the values it found plus one composite; the slot id is the actual id's length.
 */
export function perItemMaxSerializedChars(signals: SlotDeterministicSignals, policy: Phase3InventoryExecutionPolicy): number {
  const b = policy.bounds;
  const keys = 17 * 14; // field names with quotes, colons, commas, braces
  const values = Math.min(b.maxQuantitativeValues, signals.values.length + 1) * (b.valueRawTextChars + b.valueUnitChars + 40);
  const terms = Math.min(b.maxReferencedTerms, signals.definedTerms.length + 2) * (b.referencedTermChars + 4);
  const sections = Math.min(b.maxReferencedSections, signals.references.length + 1) * (b.referencedSectionChars + 4);
  return keys + b.localRefChars + Math.min(b.slotIdChars, signals.slotId.length) + b.roleChars + b.maxAdditionalRoles * (b.roleChars + 4) + b.propositionChars + Math.min(b.excerptChars, signals.chars) + values
    + terms + sections + b.maxRelatedRefs * (b.localRefChars + 4) + b.localRefChars + 16 + 22 + b.ambiguityReasonChars + 12;
}

export interface InventoryOutputBound {
  slots: number;
  /** The allowance stated in the prompt and charged per slot. */
  maxItems: number;
  /** The parse ceiling of the wire schema: twice the allowance plus a fixed tolerance (an over-allowance item is counted, never a reason to lose the whole call; max_tokens bounds the volume). */
  parseCeiling: number;
  perSlot: { slotId: string; maxPropositions: number; perItemMaxChars: number }[];
  maxSerializedChars: number;
  maxOutputTokens: number;
}

export function deriveInventoryOutputBound(slots: readonly SourceSlot[], index: StructuralIndex | null | undefined, policy: Phase3InventoryExecutionPolicy): InventoryOutputBound {
  const perSlot = slots.map((s) => { const sig = computeSlotSignals(s, index); return { slotId: s.slotId, maxPropositions: maxPropositionsForSlot(sig, policy), perItemMaxChars: perItemMaxSerializedChars(sig, policy) }; });
  const unslotted = policy.perSlot.unslottedPerCall;
  const maxItems = perSlot.reduce((n, p) => n + p.maxPropositions, 0) + unslotted;
  const largest = Math.max(0, ...perSlot.map((p) => p.perItemMaxChars));
  const maxSerializedChars = perSlot.reduce((n, p) => n + p.maxPropositions * p.perItemMaxChars, 0) + unslotted * largest + 32;
  const maxOutputTokens = Math.ceil(maxSerializedChars * policy.outputTokensPerChar) + policy.envelopeTokens;
  return { slots: slots.length, maxItems, parseCeiling: maxItems * 2 + 8, perSlot, maxSerializedChars, maxOutputTokens };
}
