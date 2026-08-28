/**
 * Phase 3E §156 - the freeze mechanism (types.ts's own FREEZE-BEFORE-LOAD
 * contract). Computes a FrozenSourceInventory from the units Layer A/B/C
 * produced for a document/package, content-hashing every unit's own
 * identity + excerpt + signals so a later caller can prove this inventory
 * was frozen BEFORE any compiled/verified IR was loaded for comparison -
 * the concrete mechanism behind task §20's own anchoring-reduction
 * requirement.
 *
 * This module intentionally contains no reconciliation logic and reads
 * nothing about compiled/verified IR - it only ever sees
 * MaterialSemanticUnit[], which by construction (unit-hypothesis.ts,
 * ai-inventory.ts) never carries any Phase 3B/3C/3D conclusion.
 */
import { computeFrozenContentHash } from "./identity";
import type { FrozenSourceInventory, MaterialSemanticUnit } from "./types";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION } from "./types";

function unitFingerprint(unit: MaterialSemanticUnit): string {
  return [unit.semanticUnitId, unit.excerptText, unit.detectedSignals.join(","), unit.postureSignal, unit.materiality, unit.family].join("|");
}

export interface FreezeInventoryInput {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  documentIds: string[];
  units: MaterialSemanticUnit[];
}

/**
 * Freezes an inventory. Callers MUST invoke this immediately after Layer
 * A/B/C generation completes for a document/package and MUST NOT load any
 * compiled/verified IR before calling it - this function cannot itself
 * enforce that call-order (no import-boundary test can catch a call-order
 * violation), so every reconciliation-stage caller (reconciliation.ts,
 * pipeline.ts) is required to invoke this before its first compiled-IR
 * lookup, per the Independence Contract's own disclosed procedural
 * requirement in types.ts.
 */
export function freezeSourceInventory(input: FreezeInventoryInput): FrozenSourceInventory {
  const frozenContentHash = computeFrozenContentHash({
    companyId: input.companyId,
    packageKey: input.packageKey,
    instrumentKey: input.instrumentKey,
    documentIds: input.documentIds,
    unitFingerprints: input.units.map((u) => ({ semanticUnitId: u.semanticUnitId, fingerprint: unitFingerprint(u) })),
    inventoryAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION,
  });

  return {
    companyId: input.companyId,
    packageKey: input.packageKey,
    instrumentKey: input.instrumentKey,
    documentIds: input.documentIds,
    units: input.units,
    frozenContentHash,
    frozenAt: new Date().toISOString(),
    inventoryAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION,
  };
}

/**
 * Verifies a previously-frozen inventory's units were never mutated after
 * freezing - re-derives the same hash from the CURRENT units array and
 * compares. A mismatch means the inventory was tampered with (or units
 * were added/removed/edited) after the freeze point, which would
 * reintroduce exactly the anchoring risk freezing exists to prevent.
 */
export function verifyFrozenInventoryUnchanged(frozen: FrozenSourceInventory): boolean {
  const recomputed = computeFrozenContentHash({
    companyId: frozen.companyId,
    packageKey: frozen.packageKey,
    instrumentKey: frozen.instrumentKey,
    documentIds: frozen.documentIds,
    unitFingerprints: frozen.units.map((u) => ({ semanticUnitId: u.semanticUnitId, fingerprint: unitFingerprint(u) })),
    inventoryAlgorithmVersion: frozen.inventoryAlgorithmVersion,
  });
  return recomputed === frozen.frozenContentHash;
}
