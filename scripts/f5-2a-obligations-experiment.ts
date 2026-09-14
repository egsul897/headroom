/**
 * F-5.2 - SOURCE-OWNED INVENTORY OBLIGATIONS.
 *
 * The F-5.1 paid pair proved (docs/phase-3-remediation-f5-2/) that deterministic slots fix WHERE the model looks but
 * the model still decides HOW MANY independent propositions a slot holds: every one of the 50 residual omissions was
 * a proposition that the other run folded into a coarser item or left unaccounted. An OBLIGATION is a source-owned
 * feature of a slot that requires EXPLICIT accounting:
 *
 *     SOURCE -> SLOT -> SOURCE-OWNED OBLIGATIONS -> MODEL SEMANTIC INVENTORY -> SOURCE ACCOUNTABILITY
 *
 * An obligation says only "this source feature must be accounted for". It never says what the feature means, whether
 * anything is permitted, what family it belongs to, or that it is executable. Obligation KINDS are generic source
 * FORMS (an enumerated branch, a coordinated fragment, a stated number, an explicit citation, a qualifier, an
 * exception, a selector branch, an arithmetic operand, a temporal value, the slot itself) - never covenant content.
 *
 * SAFETY INVARIANT: an obligation may CREATE review work; it can NEVER discharge it. It is satisfied only by verified
 * inventory items that actually account for its source (every claim is verified here) or by a deterministic
 * non-semantic disposition of its whole span (source-coverage.ts). Unsatisfied => REVIEW_REQUIRED /
 * INVENTORY_COVERAGE_GAP. The model cannot clear an obligation by returning nothing. Raw source coverage stays
 * independently authoritative.
 *
 * IDENTITY derives only from stable source facts (documentId, regionId, slotId, span, kind, ordinal) - never from
 * wording, semantic functions, model output or run.
 *
 * EXPERIMENT ONLY (F-5.2A): this module lives under scripts/ because the pre-registered architecture gate
 * (docs/phase-3-remediation-f5-2/05-preregistration.json) was NOT met on the frozen paid pair; it is not wired into
 * production. It is kept so the counterfactual artifacts are reproducible.
 */
import { computeStableKey } from "../lib/contract-model/stable-keys";
import { scanQuantitativeValues } from "../lib/contract-model/compiler/semantic-accountability/quantitative";
import type { SlotPartition, SourceSlot } from "../lib/contract-model/compiler/semantic-accountability/slots";
import type { QuantitativeValue, SourceContextResult } from "../lib/contract-model/compiler/semantic-accountability/types";

export const OBLIGATION_KINDS = ["BASE_SLOT", "ENUMERATED_BRANCH", "COORDINATED_FRAGMENT", "QUANTITATIVE_SPAN", "EXPLICIT_REFERENCE", "QUALIFIER_OR_PROVISO", "EXCEPTION_FRAGMENT", "SELECTOR_BRANCH", "ARITHMETIC_OPERAND", "TEMPORAL_SPAN"] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];
export const OBLIGATIONS_ALGORITHM_VERSION = "inventory-obligations.experiment";

export interface InventoryObligation {
  obligationId: string;
  kind: ObligationKind;
  documentId: string;
  regionId: string;
  slotId: string;
  /** Region-relative, half-open. */
  charStart: number;
  charEnd: number;
  text: string;
  /** Deterministic ordinal of this obligation among those of the same kind in the same slot (source order). */
  ordinal: number;
  /** QUANTITATIVE_SPAN / TEMPORAL_SPAN: the exact value that must be listed by the accounting item. */
  value?: { kind: string; rawText: string; normalizedValue: number | null };
  /** EXPLICIT_REFERENCE: the citation text that must sit inside the accounting item's span. */
  citation?: string;
  /** Anchor obligations this BASE_SLOT obligation encloses - informational. */
  children?: string[];
}

export interface ObligationLedger {
  algorithmVersion: string;
  documentId: string;
  obligations: InventoryObligation[];
  countsByKind: Record<string, number>;
  slotsWithObligations: number;
}

// ---------------------------------------------------------------------------
// Generic source-form recognisers (structural FORM only; no vocabulary of any covenant family).
// ---------------------------------------------------------------------------
const ENUMERATOR_RE = /(?:^|[\s,;(])\(?(?:[a-z]{1,2}|[ivx]{1,5}|[A-Z]{1,2}|\d{1,3})\)\s/g;
const CLAUSE_SPLIT_RE = /;\s+|,\s+(?:and|or|and\/or|but)\s+|\s+and\/or\s+/g;
/** FINE mode: every coordinating conjunction is a boundary (the v4 coordinationIndex rule) - reaches more omissions, splits more noun lists. */
const FINE_SPLIT_RE = /\s+(?:and\/or|and|or)\s+|;\s+|,\s+(?=\(?[a-zA-Z0-9]{1,4}\)\s)/g;
export type ObligationMode = "conservative" | "fine";
const QUALIFIER_RE = /\b(?:provided\s*,?\s*(?:however\s*,?\s*|further\s*,?\s*)?(?:that)?|so\s+long\s+as|if\b|unless|subject\s+to|to\s+the\s+extent(?:\s+that)?|in\s+the\s+event\s+that|only\s+if|for\s+so\s+long\s+as|(?:on|upon)\s+the\s+condition\s+that)/gi;
const EXCEPTION_RE = /\b(?:other\s+than|except(?:ing)?(?:\s+(?:for|that|as))?|excluding|but\s+not\s+including|not\s+including|save\s+(?:for|that))\b/gi;
const SELECTOR_RE = /\b(?:the\s+)?(?:greater|greatest|lesser|least|lower|lowest|higher|highest|larger|largest|smaller|smallest)\s+of\b/gi;
const OPERAND_RE = /(?:^|\s)(?:plus|minus|less|multiplied\s+by|divided\s+by|net\s+of)\s+/gi;
const CITATION_RE = /\b(?:sections?|clauses?|sub-?clauses?|paragraphs?|schedules?|annex(?:es)?|exhibits?|articles?)\s*\(?[0-9ivxlcA-Z][0-9a-zA-Z.\-]*\)?(?:\s*\([a-z0-9]{1,4}\))*(?:\s*(?:,|and|or|through)\s*(?:\([a-z0-9]{1,4}\))+)*/gi;
const TIME_KINDS = new Set(["DAYS", "DATE", "PERIOD"]);
const WORD_RE = /[A-Za-z]{2,}/g;
const words = (t: string) => (t.match(WORD_RE) ?? []).length;
const MIN_FRAGMENT_WORDS = 3;

interface Frag { start: number; end: number }
/** Splits slot text into fragments at enumerators, semicolons and comma-coordinations; a fragment shorter than MIN_FRAGMENT_WORDS is glue and is merged into its predecessor. */
function fragments(text: string, mode: ObligationMode = "conservative"): { frags: Frag[]; enumerated: Set<number> } {
  const cuts = new Set<number>([0]);
  const enumerated = new Set<number>();
  for (const m of text.matchAll(ENUMERATOR_RE)) {
    const at = m.index! + (/^[\s,;(]/.test(m[0]) ? 1 : 0);
    cuts.add(at);
    enumerated.add(at);
  }
  for (const m of text.matchAll(mode === "fine" ? FINE_SPLIT_RE : CLAUSE_SPLIT_RE)) cuts.add(m.index! + m[0].length);
  const sorted = [...cuts].filter((c) => c < text.length).sort((a, b) => a - b);
  const frags: Frag[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!;
    const end = i + 1 < sorted.length ? sorted[i + 1]! : text.length;
    const piece = text.slice(start, end);
    if (frags.length > 0 && words(piece) < MIN_FRAGMENT_WORDS) frags[frags.length - 1]!.end = end;
    else frags.push({ start, end });
  }
  return { frags: frags.filter((f) => words(text.slice(f.start, f.end)) >= MIN_FRAGMENT_WORDS), enumerated };
}

function trimSpan(text: string, s: number, e: number): [number, number] {
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  return [s, e];
}

export function generateObligations(sourceContext: SourceContextResult, partition: SlotPartition, documentId: string, mode: ObligationMode = "conservative"): ObligationLedger {
  const obligations: InventoryObligation[] = [];
  const perSlotOrdinal = new Map<string, number>();
  const push = (slot: SourceSlot, kind: ObligationKind, s: number, e: number, extra: Partial<InventoryObligation> = {}): InventoryObligation | null => {
    const region = sourceContext.regions.find((r) => r.regionId === slot.regionId)!;
    [s, e] = trimSpan(region.text, s, e);
    if (e <= s) return null;
    const anchorKind = kind !== "QUANTITATIVE_SPAN" && kind !== "TEMPORAL_SPAN" && kind !== "EXPLICIT_REFERENCE" && kind !== "BASE_SLOT";
    if (anchorKind && words(region.text.slice(s, e)) < MIN_FRAGMENT_WORDS) return null;
    if (obligations.some((o) => o.slotId === slot.slotId && o.kind === kind && o.charStart === s && o.charEnd === e)) return null;
    const key = `${slot.slotId} ${kind}`;
    const ordinal = perSlotOrdinal.get(key) ?? 0;
    perSlotOrdinal.set(key, ordinal + 1);
    const ob: InventoryObligation = { obligationId: computeStableKey("inv-obligation", documentId, slot.regionId, slot.slotId, String(s), String(e), kind, String(ordinal), OBLIGATIONS_ALGORITHM_VERSION), kind, documentId, regionId: slot.regionId, slotId: slot.slotId, charStart: s, charEnd: e, text: region.text.slice(s, e), ordinal, ...extra };
    obligations.push(ob);
    return ob;
  };
  for (const slot of partition.slots) {
    const region = sourceContext.regions.find((r) => r.regionId === slot.regionId);
    if (!region) continue;
    const t = slot.text;
    if (words(t) < 2) continue; // punctuation / enumerator-only residue: no obligation, raw coverage still applies
    const base = push(slot, "BASE_SLOT", slot.charStart, slot.charEnd, { children: [] });
    if (!base) continue;
    const { frags, enumerated } = fragments(t, mode);
    if (frags.length >= 2) {
      for (const f of frags) {
        const ob = push(slot, enumerated.has(f.start) ? "ENUMERATED_BRANCH" : "COORDINATED_FRAGMENT", slot.charStart + f.start, slot.charStart + f.end);
        if (ob) base.children!.push(ob.obligationId);
      }
    }
    for (const re of [QUALIFIER_RE, EXCEPTION_RE] as const) {
      for (const m of t.matchAll(re)) {
        const at = m.index!;
        if (/^[\s(]*$/.test(t.slice(0, at))) continue; // an opener AT the slot start is the slot itself
        const frag = frags.find((f) => f.start <= at && at < f.end);
        const end = frag ? frag.end : t.length;
        const ob = push(slot, re === QUALIFIER_RE ? "QUALIFIER_OR_PROVISO" : "EXCEPTION_FRAGMENT", slot.charStart + at, slot.charStart + end);
        if (ob) base.children!.push(ob.obligationId);
      }
    }
    for (const m of t.matchAll(SELECTOR_RE)) {
      const from = m.index! + m[0].length;
      const frag = frags.find((f) => f.start <= m.index! && m.index! < f.end);
      const end = frag ? frag.end : t.length;
      const body = t.slice(from, end);
      const split = /\s+(?:and|or)\s+(?=\(?[a-z0-9]{1,4}\)|[$\d])/i.exec(body);
      if (split) {
        const a = push(slot, "SELECTOR_BRANCH", slot.charStart + from, slot.charStart + from + split.index);
        const b = push(slot, "SELECTOR_BRANCH", slot.charStart + from + split.index + split[0].length, slot.charStart + end);
        for (const ob of [a, b]) if (ob) base.children!.push(ob.obligationId);
      }
    }
    for (const m of t.matchAll(OPERAND_RE)) {
      const from = m.index! + m[0].length;
      const frag = frags.find((f) => f.start <= m.index! && m.index! < f.end);
      const end = frag ? frag.end : t.length;
      const ob = push(slot, "ARITHMETIC_OPERAND", slot.charStart + from, slot.charStart + end);
      if (ob) base.children!.push(ob.obligationId);
    }
    for (const v of scanQuantitativeValues(t)) {
      if (v.charStart < 0) continue;
      const kind: ObligationKind = TIME_KINDS.has(v.kind) ? "TEMPORAL_SPAN" : "QUANTITATIVE_SPAN";
      const ob = push(slot, kind, slot.charStart + v.charStart, slot.charStart + v.charEnd, { value: { kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue } });
      if (ob) base.children!.push(ob.obligationId);
    }
    for (const m of t.matchAll(CITATION_RE)) {
      const ob = push(slot, "EXPLICIT_REFERENCE", slot.charStart + m.index!, slot.charStart + m.index! + m[0].length, { citation: m[0].trim() });
      if (ob) base.children!.push(ob.obligationId);
    }
  }
  obligations.sort((a, b) => a.regionId.localeCompare(b.regionId) || a.charStart - b.charStart || a.charEnd - b.charEnd || a.kind.localeCompare(b.kind) || a.ordinal - b.ordinal);
  const countsByKind: Record<string, number> = {};
  for (const o of obligations) countsByKind[o.kind] = (countsByKind[o.kind] ?? 0) + 1;
  return { algorithmVersion: OBLIGATIONS_ALGORITHM_VERSION, documentId, obligations, countsByKind, slotsWithObligations: new Set(obligations.map((o) => o.slotId)).size };
}

// ---------------------------------------------------------------------------
// Satisfaction (deterministic; the model never clears an obligation by silence).
// ---------------------------------------------------------------------------
export interface AccountingItemView {
  inventoryItemId: string;
  regionId: string;
  charStart: number;
  charEnd: number;
  materiality: string;
  values: QuantitativeValue[];
  /** Obligation ids the model explicitly claimed for this item (verified here, never trusted). */
  claimedObligationIds: string[];
}
export type ObligationStatus = "SATISFIED_BY_CLAIM" | "SATISFIED_BY_ANCHOR" | "SATISFIED_BY_COVERAGE" | "DISCHARGED_NON_SEMANTIC" | "UNSATISFIED";
export interface ObligationResolution { obligationId: string; kind: ObligationKind; slotId: string; status: ObligationStatus; itemIds: string[]; reason: string }
export interface ObligationResolutionResult { resolutions: ObligationResolution[]; unsatisfied: InventoryObligation[]; rejectedClaims: { inventoryItemId: string; obligationId: string; reason: string }[]; countsByStatus: Record<string, number> }

const LEAD = /^(?:\s+|[,;:.]+|\(?[a-z0-9]{1,4}\)|(?:and\/or|and|or|but|nor|plus|minus|less)(?=[\s,;(]))/i;
export function normalizedStartOf(text: string, at: number): number {
  let i = at;
  for (;;) {
    const m = LEAD.exec(text.slice(i, i + 32));
    if (!m || !m[0].length) break;
    i += m[0].length;
  }
  return i;
}
const wordsBetween = (text: string, a: number, b: number) => (text.slice(Math.min(a, b), Math.max(a, b)).match(/\S+/g) ?? []).length;
const MATERIAL = new Set(["CRITICAL", "MATERIAL"]);
const sameValue = (a: { kind: string; rawText: string; normalizedValue: number | null }, b: QuantitativeValue) => a.kind === b.kind && (a.normalizedValue !== null && b.normalizedValue !== null ? Math.abs(a.normalizedValue - b.normalizedValue) < 1e-9 : a.rawText.replace(/\s+/g, " ").trim().toLowerCase() === b.rawText.replace(/\s+/g, " ").trim().toLowerCase());

/**
 * Resolves every obligation against the accepted inventory. Order of proof: (1) a VERIFIED claim (item span contains the
 * obligation span; value/citation obligations additionally carry the exact value / the citation inside the span);
 * (2) an ANCHORED item (normalized starts within one word, >= 50% overlap; value/citation conditions likewise);
 * (3) COVERAGE by items lying inside the span (>= 80% of its non-whitespace characters); (4) a whole-span deterministic
 * non-semantic disposition supplied by the caller (source-coverage); otherwise UNSATISFIED. A broad item never satisfies
 * a child obligation merely by containing it (that is neither a claim nor an anchor nor inside coverage).
 */
export function resolveObligations(ledger: ObligationLedger, sourceContext: SourceContextResult, items: AccountingItemView[], nonSemanticSpans: { regionId: string; charStart: number; charEnd: number }[] = []): ObligationResolutionResult {
  const byId = new Map(ledger.obligations.map((o) => [o.obligationId, o] as const));
  const regionText = (regionId: string) => sourceContext.regions.find((r) => r.regionId === regionId)?.text ?? "";
  const rejectedClaims: { inventoryItemId: string; obligationId: string; reason: string }[] = [];
  const claimsFor = new Map<string, string[]>();
  const material = items.filter((i) => MATERIAL.has(i.materiality));
  const contains = (i: AccountingItemView, o: InventoryObligation) => i.regionId === o.regionId && i.charStart <= o.charStart && i.charEnd >= o.charEnd;
  const valueOk = (i: AccountingItemView, o: InventoryObligation) => !o.value || i.values.some((v) => sameValue(o.value!, v));
  const citationOk = (i: AccountingItemView, o: InventoryObligation) => !o.citation || regionText(o.regionId).slice(i.charStart, i.charEnd).includes(o.citation);
  for (const i of items) {
    for (const id of i.claimedObligationIds) {
      const o = byId.get(id);
      if (!o) { rejectedClaims.push({ inventoryItemId: i.inventoryItemId, obligationId: id, reason: "unknown obligation id" }); continue; }
      if (!MATERIAL.has(i.materiality)) { rejectedClaims.push({ inventoryItemId: i.inventoryItemId, obligationId: id, reason: "only a CRITICAL/MATERIAL item can account for source" }); continue; }
      if (!contains(i, o)) { rejectedClaims.push({ inventoryItemId: i.inventoryItemId, obligationId: id, reason: "item span does not own the obligation span" }); continue; }
      if (!valueOk(i, o)) { rejectedClaims.push({ inventoryItemId: i.inventoryItemId, obligationId: id, reason: `item does not list the exact value ${o.value!.rawText}` }); continue; }
      if (!citationOk(i, o)) { rejectedClaims.push({ inventoryItemId: i.inventoryItemId, obligationId: id, reason: `item span does not contain the citation ${o.citation}` }); continue; }
      claimsFor.set(id, [...(claimsFor.get(id) ?? []), i.inventoryItemId]);
    }
  }
  const resolutions: ObligationResolution[] = [];
  for (const o of ledger.obligations) {
    const text = regionText(o.regionId);
    const claimed = claimsFor.get(o.obligationId);
    if (claimed?.length) { resolutions.push({ obligationId: o.obligationId, kind: o.kind, slotId: o.slotId, status: "SATISFIED_BY_CLAIM", itemIds: claimed, reason: "verified explicit claim" }); continue; }
    const oStart = normalizedStartOf(text, o.charStart);
    const inRegion = material.filter((i) => i.regionId === o.regionId);
    if (o.kind === "BASE_SLOT") {
      const starters = inRegion.filter((i) => i.charStart >= o.charStart && i.charStart < o.charEnd);
      if (starters.length) { resolutions.push({ obligationId: o.obligationId, kind: o.kind, slotId: o.slotId, status: "SATISFIED_BY_ANCHOR", itemIds: starters.map((i) => i.inventoryItemId), reason: "a material item starts inside the slot" }); continue; }
    } else {
      const anchored = inRegion.filter((i) => wordsBetween(text, normalizedStartOf(text, i.charStart), oStart) <= 1 && Math.max(0, Math.min(i.charEnd, o.charEnd) - Math.max(i.charStart, o.charStart)) >= 0.5 * (o.charEnd - o.charStart) && valueOk(i, o) && citationOk(i, o));
      if (anchored.length) { resolutions.push({ obligationId: o.obligationId, kind: o.kind, slotId: o.slotId, status: "SATISFIED_BY_ANCHOR", itemIds: anchored.map((i) => i.inventoryItemId), reason: "a material item is anchored at the obligation" }); continue; }
      const inside = inRegion.filter((i) => i.charStart >= o.charStart && i.charEnd <= o.charEnd && i.charEnd > i.charStart && valueOk(i, o) && citationOk(i, o));
      if (inside.length) {
        const mask = new Uint8Array(o.charEnd - o.charStart);
        for (const i of inside) for (let p = i.charStart; p < i.charEnd; p++) mask[p - o.charStart] = 1;
        let covered = 0;
        let total = 0;
        for (let p = o.charStart; p < o.charEnd; p++) {
          if (/\S/.test(text[p]!)) { total++; if (mask[p - o.charStart]) covered++; }
        }
        if (total > 0 && covered / total >= 0.8) { resolutions.push({ obligationId: o.obligationId, kind: o.kind, slotId: o.slotId, status: "SATISFIED_BY_COVERAGE", itemIds: inside.map((i) => i.inventoryItemId), reason: `material items inside the span cover ${Math.round((covered / total) * 100)}% of it` }); continue; }
      }
    }
    if (nonSemanticSpans.some((n) => n.regionId === o.regionId && n.charStart <= o.charStart && n.charEnd >= o.charEnd)) { resolutions.push({ obligationId: o.obligationId, kind: o.kind, slotId: o.slotId, status: "DISCHARGED_NON_SEMANTIC", itemIds: [], reason: "whole span carries a deterministic non-semantic disposition" }); continue; }
    resolutions.push({ obligationId: o.obligationId, kind: o.kind, slotId: o.slotId, status: "UNSATISFIED", itemIds: [], reason: o.kind === "BASE_SLOT" ? "no material item starts inside this slot" : "no verified claim, no anchored item and no inside coverage accounts for this source feature" });
  }
  const countsByStatus: Record<string, number> = {};
  for (const r of resolutions) countsByStatus[r.status] = (countsByStatus[r.status] ?? 0) + 1;
  return { resolutions, unsatisfied: resolutions.filter((r) => r.status === "UNSATISFIED").map((r) => byId.get(r.obligationId)!), rejectedClaims, countsByStatus };
}
