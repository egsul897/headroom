/**
 * Stable, content-derived identity for Phase B's contract-model graph
 * (docs/contract-model-foundation-phase-b.md sections G and T). Mirrors
 * lib/connectors/dedup.ts's computeContentHash exactly (same sha256 hex
 * digest pattern) rather than inventing a second hashing convention.
 *
 * Every stableKey column on a Phase B model is a plain, caller-supplied
 * String, never server-generated from the row's own id - the same
 * pre-existing convention Permission.code and CovenantProvision.code
 * already use in this schema. computeStableKey is the one deterministic
 * way to derive one from content that should identify a node, rule, or
 * term regardless of which database it is replayed into: same inputs, same
 * key, in any environment, forever, independent of review status,
 * confidence, or any other mutable field. Changing those must never change
 * identity; changing the underlying source citation or content should,
 * since that is a genuinely different provision. This reuses the exact
 * lesson docs/golden-harness-solver-native-grading-fix.md already learned
 * for golden-test truth identifiers, not its code (that fix is scoped to
 * golden_tests rows).
 */
import { createHash } from "node:crypto";

const SEPARATOR = String.fromCharCode(0);

/**
 * Joins parts with a separator character that cannot appear in any
 * realistic section reference, term name, or document id, then sha256-hexes
 * the result and prefixes it with tag for human auditability. Two calls
 * with the same tag and parts always produce the same key; a different part
 * always produces a different one, and two different part arrays can never
 * collide onto the same joined string the way joining with a printable
 * delimiter (a space or colon) could.
 */
export function computeStableKey(tag: string, ...parts: string[]): string {
  const digest = createHash("sha256").update(parts.join(SEPARATOR)).digest("hex").slice(0, 24);
  return `${tag}:${digest}`;
}
