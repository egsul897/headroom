/**
 * Holdout isolation — sealed expected outcomes.
 *
 * Implementation agents and default harness runs must NOT load sealed expected
 * outcomes. Release-gate runners with HOLDOUT_UNLOCK=1 may open seals for scoring.
 *
 * Isolation labeling:
 * - If agents can read payloads through the repository (e.g. holdouts-SEALED/),
 *   label fixtureClass FROZEN_REGRESSION — not BLIND_AUTHENTIC_HOLDOUT.
 * - BLIND_AUTHENTIC_HOLDOUT is reserved for answer keys stored outside the
 *   agent-accessible workspace.
 *
 * Sealed payloads under tests/fixtures/verification-factory/holdouts-SEALED/
 * are never imported by production lib/ adapters.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CVF_HOLDOUT_SEAL_VERSION } from "./version";
import type { ExpectedLegalOutcome, GroundTruthProvenance } from "./types";

export interface HoldoutSealEnvelope {
  sealVersion: typeof CVF_HOLDOUT_SEAL_VERSION;
  holdoutSealId: string;
  /** Hash of the sealed payload — public. */
  payloadSha256: string;
  /** Relative path under holdouts-SEALED/; never import into product code. */
  sealedRelativePath: string;
  note: string;
}

export interface SealedHoldoutPayload {
  holdoutSealId: string;
  provenance: GroundTruthProvenance;
  expectedLegalOutcome: ExpectedLegalOutcome;
}

const SEALED_ROOT = "tests/fixtures/verification-factory/holdouts-SEALED";

export function holdoutUnlockEnabled(): boolean {
  return process.env.HOLDOUT_UNLOCK === "1" || process.env.HOLDOUT_UNLOCK === "true";
}

export function computePayloadSha256(payload: SealedHoldoutPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function makeHoldoutSeal(payload: SealedHoldoutPayload, relativePath: string): HoldoutSealEnvelope {
  return {
    sealVersion: CVF_HOLDOUT_SEAL_VERSION,
    holdoutSealId: payload.holdoutSealId,
    payloadSha256: computePayloadSha256(payload),
    sealedRelativePath: relativePath,
    note: "Expected outcomes sealed. Unlock only for release-gate scoring (HOLDOUT_UNLOCK=1).",
  };
}

/**
 * Open a sealed holdout. Throws if unlock is not enabled — fail closed.
 */
export function openHoldoutSeal(seal: HoldoutSealEnvelope, cwd = process.cwd()): SealedHoldoutPayload {
  if (!holdoutUnlockEnabled()) {
    throw new Error(
      `Holdout ${seal.holdoutSealId} is sealed. Set HOLDOUT_UNLOCK=1 only on release-gate runners.`,
    );
  }
  const abs = join(cwd, SEALED_ROOT, seal.sealedRelativePath);
  if (!existsSync(abs)) {
    throw new Error(`Sealed holdout file missing: ${abs}`);
  }
  const payload = JSON.parse(readFileSync(abs, "utf8")) as SealedHoldoutPayload;
  const hash = computePayloadSha256(payload);
  if (hash !== seal.payloadSha256) {
    throw new Error(`Holdout seal hash mismatch for ${seal.holdoutSealId}`);
  }
  if (payload.holdoutSealId !== seal.holdoutSealId) {
    throw new Error(`Holdout seal id mismatch`);
  }
  return payload;
}

/** Public metadata only — safe for implementation agents. */
export function publicHoldoutView(seal: HoldoutSealEnvelope): {
  holdoutSealId: string;
  payloadSha256: string;
  sealed: true;
  expectedOutcomeVisible: false;
} {
  return {
    holdoutSealId: seal.holdoutSealId,
    payloadSha256: seal.payloadSha256,
    sealed: true,
    expectedOutcomeVisible: false,
  };
}
