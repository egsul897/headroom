/**
 * Phase 3A - stable identity and deterministic serialization (task
 * §27/§28/§44/§45). Reuses the exact hashing convention already
 * established for this codebase's other stable keys
 * (lib/contract-model/stable-keys.ts's computeStableKey and
 * lib/contract-model/compiler/hashing.ts's hashParts/hashJson) rather than
 * inventing a third one.
 *
 * Identity is content-derived, never array-position-derived and never a
 * fresh random id per compile (task §27) - the same expression compiled
 * twice from the same source produces the same exprId; a different source
 * span or a different literal value produces a different one.
 */
import { computeStableKey } from "../stable-keys";
import type { IRCapacityExpression, IRExpression, IRRule, IRDefinition, IRSharedCapacity } from "./types";

/** Deterministic JSON stringify with sorted object keys - canonical form (task §45) so two structurally-identical trees serialize byte-identically regardless of the order fields were set in code. Arrays are NOT reordered (element order is semantically meaningful - operand order, schedule case order, etc.). */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Derives a stable exprId for an expression from its OWN content (kind +
 * every field except exprId/provenance, since provenance is metadata about
 * the content, not part of its computational identity) plus, when present,
 * its source anchor - so the same literal appearing at two different
 * source citations (a real, if rare, case) still gets two distinct ids,
 * while a purely-derived node (e.g. the ADD wrapping two provenanced
 * leaves) gets a stable id from its structure alone. Accepts the full node
 * (any placeholder exprId is stripped, never included in the hash) -
 * deliberately loosely typed at the boundary (a discriminated union's own
 * `Omit` does not distribute reliably across TS configurations) rather
 * than fighting the type system for a guarantee the function body already
 * enforces at runtime by destructuring exprId out.
 */
export function computeExpressionId(expr: IRExpression): string {
  const { provenance, ...content } = expr as unknown as Record<string, unknown>;
  delete content.exprId;
  const anchor = provenance && typeof provenance === "object" ? (provenance as { documentId?: string; sourceCitation?: string }) : null;
  const parts = [canonicalStringify(content)];
  if (anchor?.documentId) parts.push(anchor.documentId);
  if (anchor?.sourceCitation) parts.push(anchor.sourceCitation);
  return computeStableKey("ir-expr", ...parts);
}

/** Distributes Omit across the IRExpression union so inference from a concrete object literal (e.g. `{ kind: "MONEY", ... }`) picks the matching member instead of collapsing to the whole union - plain `Omit<T, K>` does not reliably distribute for this purpose. */
type ExprInput<T extends IRExpression> = T extends unknown ? Omit<T, "exprId"> : never;

/** Assigns a stable exprId to a freshly-constructed expression node (whose caller left exprId blank/placeholder) - used by fixture/adapter code that builds a tree bottom-up and wants each node's id derived from its own final content. */
export function withExpressionId<T extends IRExpression>(expr: ExprInput<T>): T {
  const withPlaceholder = { ...(expr as object), exprId: "" } as unknown as IRExpression;
  const exprId = computeExpressionId(withPlaceholder);
  return { ...(expr as object), exprId } as T;
}

export function computeCapacityExpressionId(capacity: IRCapacityExpression): string {
  if (capacity.kind === "UNLIMITED_CAPACITY") {
    const { provenance, ...content } = capacity as unknown as Record<string, unknown>;
    void provenance;
    return computeStableKey("ir-expr", canonicalStringify(content));
  }
  return computeExpressionId(capacity);
}

/** Stable ruleId: derived from the identity fields that genuinely distinguish one rule from another - company, instrument, source section, and a discriminator (so multiple rules from the same section, e.g. a multi-basket section's several independently-gated baskets, get distinct ids). Never derived from mutable fields (sufficiency, conditions content) - the SAME logical rule re-derived after a sufficiency status changes must keep the SAME ruleId, since identity and correctness are different questions (task §27's own "identity should not depend on... model output order"). */
export function computeRuleId(companyId: string, instrumentKey: string, sourceSectionRef: string | null, discriminator: string): string {
  return computeStableKey("ir-rule", companyId, instrumentKey, sourceSectionRef ?? "(no-section)", discriminator);
}

export function computeDefinitionId(companyId: string, instrumentKey: string, termName: string): string {
  return computeStableKey("ir-definition", companyId, instrumentKey, termName.trim().toLowerCase());
}

export function computeSharedCapId(companyId: string, instrumentKey: string, discriminator: string): string {
  return computeStableKey("ir-sharedcap", companyId, instrumentKey, discriminator);
}

/** Round-trip check (task §44): construct -> serialize -> deserialize -> re-serialize must produce byte-identical canonical output. Callers pass plain JSON.parse(JSON.stringify(x)) as `deserialized` to prove no non-JSON-safe value (e.g. a Date object, a class instance) silently entered the tree. */
export function isRoundTripStable(original: unknown, deserialized: unknown): boolean {
  return canonicalStringify(original) === canonicalStringify(deserialized);
}

/** A rule/definition/sharedCap's own overall content identity (distinct from its stable ruleId/definitionId/sharedCapId) - changes whenever anything about the object changes, including mutable fields like sufficiency. This is the value a future incremental-recompilation pass (North Star §3) would compare across two compiles to decide "did anything actually change," never used as the object's own identity. */
export function computeContentIdentity(value: IRRule | IRDefinition | IRSharedCapacity): string {
  return computeStableKey("ir-content", canonicalStringify(value));
}
