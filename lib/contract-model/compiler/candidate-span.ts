/**
 * THE CANDIDATE-SPAN CONTRACT.
 *
 * A discovered candidate carries an ANCHOR node followed, for EXCEPTION / BASKET / PROVISO /
 * CONDITION roles, by the structural node it modifies (discovery/pass-c-neighborhood.ts's own
 * "neighborhood guarantee ... so a downstream consumer asking 'what does this exception modify'
 * never has to guess"). That trailing entry is a RELATIONSHIP, not an extension of the candidate's
 * own source span, and every consumer treats it as one - candidate identity
 * (discovery/pass-d-reconcile.ts's `${structuralNodeIds[0]}::${role}::${fingerprint}`), context
 * retrieval's primaryNodeId, coverage accounting, and supersession all read it as a link.
 *
 * Concatenating the linked node's text into the candidate's operative source therefore silently
 * widens the legal proposition the candidate claims to represent: the child inherits every sibling
 * clause under that parent, and the independent verifier - which builds the SOURCE side of its
 * reconciliation from this same text (semantic-verification/verify.ts) - then accepts those
 * siblings' economics as evidence the child owns. That is the false-credit channel this module
 * closes, by stating the rule once, in one place, for both production and the Phase-3 harness.
 *
 * The linked nodes are NOT dropped: they stay on the candidate (so coverage, provenance and
 * supersession are unchanged) and reach the compiler through the context bundle as typed
 * PARENT_SCOPE evidence, which context-retrieval already produces from the anchor's ancestors.
 */
import type { StructuralIndex } from "./structural-index";
import type { DiscoveredCandidate } from "./discovery/types";

/**
 * The operative source text for one discovered candidate: its ANCHOR node's own subtree, and
 * nothing else. A candidate with no structural node at all yields "" - the same value the previous
 * join produced for an empty array, so callers keep their existing empty-source handling.
 */
export function operativeSourceTextFor(candidate: Pick<DiscoveredCandidate, "structuralNodeIds">, index: StructuralIndex): string {
  const anchorNodeId = candidate.structuralNodeIds[0];
  return anchorNodeId ? index.getNodeText(anchorNodeId, "DESCENDANTS") : "";
}
