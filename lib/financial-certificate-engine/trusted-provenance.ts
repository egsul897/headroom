/**
 * Mint-only trusted provenance tokens for FCE authority.
 *
 * Arbitrary user/API payloads may include look-alike fields
 * (`trustedCompletenessProvenance: true`, `trustedProductionApprovalChannel: true`).
 * Those fields alone never confer trust — only tokens minted by authorized
 * application loaders (non-enumerable Symbol brand) do.
 */

import type { UtilizationCompletenessCertificate } from "@/lib/capacity";

const TRUSTED_COMPLETENESS_BRAND = Symbol.for("headroom.fce.trustedCompleteness");
const TRUSTED_CHANNEL_BRAND = Symbol.for("headroom.fce.trustedProductionApprovalChannel");

/** Completeness cert that has been minted by an authorized application loader. */
export type TrustedCompletenessCertificate = UtilizationCompletenessCertificate & {
  readonly trustedCompletenessProvenance: true;
  provenanceLabel: string;
};

/** Opaque channel token — never a bare boolean from request JSON. */
export type TrustedProductionApprovalChannelToken = {
  readonly __trustedProductionApprovalChannel: true;
};

export function mintTrustedCompletenessCertificate(
  cert: UtilizationCompletenessCertificate,
  opts: { authorizedApplicationLoader: true; provenanceLabel: string },
): TrustedCompletenessCertificate {
  if (opts.authorizedApplicationLoader !== true) {
    throw new Error("mintTrustedCompletenessCertificate requires authorizedApplicationLoader: true");
  }
  if (cert.approvalState !== "APPROVED") {
    throw new Error("Completeness certificate must be APPROVED before minting trust");
  }
  if (cert.kind !== "VERIFIED_COMPLETE" && cert.kind !== "VERIFIED_EMPTY") {
    throw new Error("Completeness certificate kind must be VERIFIED_COMPLETE or VERIFIED_EMPTY");
  }
  const minted: TrustedCompletenessCertificate = {
    capacityRuleId: cert.capacityRuleId,
    asOf: cert.asOf,
    kind: cert.kind,
    approvalState: "APPROVED",
    sourceLabel: cert.sourceLabel,
    trustedCompletenessProvenance: true,
    provenanceLabel: opts.provenanceLabel,
  };
  Object.defineProperty(minted, TRUSTED_COMPLETENESS_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  return minted;
}

export function isMintedTrustedCompleteness(
  cert: UtilizationCompletenessCertificate | TrustedCompletenessCertificate | null | undefined,
): cert is TrustedCompletenessCertificate {
  return (
    !!cert &&
    (cert as object as Record<symbol, unknown>)[TRUSTED_COMPLETENESS_BRAND] === true &&
    (cert as TrustedCompletenessCertificate).trustedCompletenessProvenance === true &&
    cert.approvalState === "APPROVED"
  );
}

export function mintTrustedProductionApprovalChannel(opts: {
  authorizedApplicationLoader: true;
}): TrustedProductionApprovalChannelToken {
  if (opts.authorizedApplicationLoader !== true) {
    throw new Error("mintTrustedProductionApprovalChannel requires authorizedApplicationLoader: true");
  }
  const token = { __trustedProductionApprovalChannel: true as const };
  Object.defineProperty(token, TRUSTED_CHANNEL_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  return token as TrustedProductionApprovalChannelToken;
}

export function isMintedTrustedProductionApprovalChannel(
  value: unknown,
): value is TrustedProductionApprovalChannelToken {
  return (
    typeof value === "object" &&
    value != null &&
    (value as Record<symbol, unknown>)[TRUSTED_CHANNEL_BRAND] === true
  );
}
