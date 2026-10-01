/**
 * The Phase 2 -> Phase 3 handoff identity. Phase 2 owns discovery; what it hands Phase 3 is a SEALED candidate
 * population. Phase 3 certifies over exactly that population and can never claim a package certification over a
 * subset: the population hash is recomputed from the candidates the map was assembled over and must equal the seal.
 */
import type { DiscoveredCandidate } from "../compiler/discovery/types";
import { canonicalJson, sha256Hex } from "../covenant-map/source-content-version";
import type { DiscoveryPopulationIdentity, DiscoveryPopulationScope } from "./types";

export const SEALED_DISCOVERY_IDENTITY_PREFIX = "sdi1";
export const CANDIDATE_POPULATION_HASH_PREFIX = "cph1";

type PopulationMember = Pick<DiscoveredCandidate, "discoveryId" | "documentId" | "normalizedSourceRef" | "structuralNodeIds" | "families" | "role">;

/** Content identity of a candidate population: order-independent, telemetry-free. */
export function computeCandidatePopulationHash(candidates: readonly PopulationMember[]): string {
  const members = candidates
    .map((c) => ({ discoveryId: c.discoveryId, documentId: c.documentId, normalizedSourceRef: c.normalizedSourceRef, structuralNodeIds: [...c.structuralNodeIds], families: [...c.families].sort(), role: c.role }))
    .sort((a, b) => (a.discoveryId < b.discoveryId ? -1 : a.discoveryId > b.discoveryId ? 1 : 0));
  return `${CANDIDATE_POPULATION_HASH_PREFIX}:${sha256Hex(canonicalJson(members))}`;
}

export interface SealDiscoveryPopulationInput {
  documents: readonly { documentId: string; text: string }[];
  discoveryVersion: string | null;
  candidates: readonly PopulationMember[];
  scope: DiscoveryPopulationScope;
}

/** What Phase 2 does at the end of discovery: seal (documents, discovery version, population) into one identity. */
export function sealDiscoveryPopulation(input: SealDiscoveryPopulationInput): DiscoveryPopulationIdentity {
  const candidatePopulationHash = computeCandidatePopulationHash(input.candidates);
  const docs = [...input.documents].map((d) => ({ documentId: d.documentId, textSha256: sha256Hex(d.text) })).sort((a, b) => (a.documentId < b.documentId ? -1 : 1));
  const sealedDiscoveryIdentity = `${SEALED_DISCOVERY_IDENTITY_PREFIX}:${sha256Hex(canonicalJson({ documents: docs, discoveryVersion: input.discoveryVersion, candidatePopulationHash, scope: input.scope }))}`;
  return { scope: input.scope, sealedDiscoveryIdentity, candidatePopulationHash, discoveryVersion: input.discoveryVersion, candidatesDiscovered: input.candidates.length };
}

/** A population that was never sealed by Phase 2 (benchmark subsets, ad-hoc target sets): identified, but never certifiable as a package. */
export function unsealedPopulation(candidates: readonly PopulationMember[], discoveryVersion: string | null, scope: DiscoveryPopulationScope = "PARTIAL_TARGET_SET"): DiscoveryPopulationIdentity {
  return { scope, sealedDiscoveryIdentity: null, candidatePopulationHash: computeCandidatePopulationHash(candidates), discoveryVersion, candidatesDiscovered: candidates.length };
}
