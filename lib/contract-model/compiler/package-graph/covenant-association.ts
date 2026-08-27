/**
 * Phase 2C §11 - associates Phase 2B discovery candidates with their source
 * document, that document's instrument (if grouped), and the package - a
 * thin, non-destructive wrapper. The original DiscoveredCandidate is never
 * mutated or flattened: a covenant discovered IN an amendment stays linked
 * to that amendment as its source evidence (task's own explicit
 * instruction), even when relationship-resolution.ts has ALSO determined
 * that amendment modifies a covenant originating in another document -
 * those are two separate, both-preserved facts, never merged into one.
 */
import type { DiscoveredCandidate } from "../discovery/types";
import type { CovenantInstrumentAssociation, InstrumentGroupingResult } from "./types";

export function associateCovenantsWithInstruments(discoveredCandidatesByDocument: Map<string, DiscoveredCandidate[]>, instruments: InstrumentGroupingResult[]): CovenantInstrumentAssociation[] {
  const instrumentKeyByDocumentId = new Map<string, string>();
  for (const instrument of instruments) {
    for (const documentId of instrument.documentIds) instrumentKeyByDocumentId.set(documentId, instrument.instrumentKey);
  }

  const out: CovenantInstrumentAssociation[] = [];
  for (const [documentId, candidates] of discoveredCandidatesByDocument) {
    for (const candidate of candidates) {
      out.push({
        discoveryId: candidate.discoveryId,
        documentId,
        instrumentKey: instrumentKeyByDocumentId.get(documentId) ?? null,
        families: candidate.families,
      });
    }
  }
  return out;
}

export function getCovenantsForInstrument(associations: CovenantInstrumentAssociation[], instrumentKey: string): CovenantInstrumentAssociation[] {
  return associations.filter((a) => a.instrumentKey === instrumentKey);
}

export function getCovenantsForDocument(associations: CovenantInstrumentAssociation[], documentId: string): CovenantInstrumentAssociation[] {
  return associations.filter((a) => a.documentId === documentId);
}
