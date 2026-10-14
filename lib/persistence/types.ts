/**
 * Shared types for Neon-first institutional persistence (docs/persistence/).
 *
 * These wrap — do not replace — SemanticTruthRecord, NS-4 snapshots,
 * ContractLedgerUsage, or package-graph projections.
 */

export type ActorProvenance =
  | { kind: "UNAUTHENTICATED" }
  | { kind: "SYSTEM"; component: string }
  | { kind: "TRUSTED_ISSUER"; actorId: string };

export function actorProvenanceString(actor: ActorProvenance): string {
  switch (actor.kind) {
    case "UNAUTHENTICATED":
      return "UNAUTHENTICATED";
    case "SYSTEM":
      return `SYSTEM:${actor.component}`;
    case "TRUSTED_ISSUER":
      return `TRUSTED_ISSUER:${actor.actorId}`;
  }
}

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

export class PersistenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceContractError";
  }
}

/** Production activation remains BLOCKED until dual trusted gates (#268/#282). */
export const PRODUCTION_ACTIVATION_STATUS = "BLOCKED" as const;

export const OPERATIVE_AUTHORITY_ENGINE_VERSION = "operative-authority-persistence.v1";
export const CAPACITY_CALCULATION_ENGINE_VERSION = "capacity-calculation-persistence.v1";
