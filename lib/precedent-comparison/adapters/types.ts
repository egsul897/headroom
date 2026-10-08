/**
 * Published-adapter contracts for peer workstreams.
 *
 * These adapters consume peer exports when present on disk. They never own
 * peer exclusive trees and never invent a second acquisition pipeline.
 */

export type PeerAvailability = "AVAILABLE" | "UNAVAILABLE" | "SCHEMA_MISMATCH";

export interface PeerLoadResult<T> {
  peer: "WS-CDA" | "WS-DEF" | "WS-EHB" | "WS-CKF";
  availability: PeerAvailability;
  pathTried: string[];
  data: T | null;
  note: string;
}
