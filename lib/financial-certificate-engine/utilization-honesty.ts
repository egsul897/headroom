/**
 * Utilization honesty adapter — delegates to canonical #237 `lib/capacity`.
 *
 * Do not recreate #234 or maintain a parallel remaining decision.
 * Approved financial metrics alone never establish authoritative remaining.
 *
 * Fail-closed metadata defaults:
 * - Missing approvalState → evidence not applied as APPROVED
 * - Missing authenticity → evidence not treated as AUTHENTIC
 * - Missing gateSatisfied → gate not affirmatively satisfied
 * - Completeness certificates require trusted provenance, not shape alone
 */

import {
  computeVerifiedRemaining,
  evidenceFromAttributedLedger,
  type GrossCapacityInput,
  type VerifiedRemainingResult,
  type UtilizationCompletenessCertificate,
  type UtilizationEvidenceRecord,
} from "@/lib/capacity";
import {
  isMintedTrustedCompleteness,
  type TrustedCompletenessCertificate,
} from "./trusted-provenance";

export type { UtilizationCompletenessCertificate, VerifiedRemainingResult, GrossCapacityInput };
export type { TrustedCompletenessCertificate } from "./trusted-provenance";
export { mintTrustedCompletenessCertificate, isMintedTrustedCompleteness } from "./trusted-provenance";

/** FCE-facing attributed usage row (millions). Metadata must be explicit. */
export interface AttributedUtilizationRecord {
  usageId: string;
  capacityRuleId: string;
  amountMillions: number;
  effectiveAsOf: string;
  status: "ACTIVE" | "RECORDED" | "SUPERSEDED" | "REVERSED";
  currency?: string;
  /**
   * Required for remaining support. Omitted → record excluded (not defaulted
   * to AUTHENTIC).
   */
  authenticity?: UtilizationEvidenceRecord["authenticity"];
  /**
   * Required for remaining support. Omitted → record excluded (not defaulted
   * to APPROVED).
   */
  approvalState?: UtilizationEvidenceRecord["approvalState"];
  sourceLabel?: string;
  sharedCapacityId?: string | null;
  entityKey?: string | null;
}

export type RemainingPublication =
  | {
      status: "GROSS_ONLY";
      grossCapacityMillions: number | null;
      remainingCapacityMillions: null;
      supportsRemainingClaim: false;
      reason: string;
      verified: VerifiedRemainingResult;
    }
  | {
      status: "REMAINING_SUPPORTED";
      grossCapacityMillions: number;
      remainingCapacityMillions: number;
      supportsRemainingClaim: true;
      knownUtilizationMillions: number;
      reason: string;
      verified: VerifiedRemainingResult;
    }
  | {
      status: "REFUSED";
      grossCapacityMillions: null;
      remainingCapacityMillions: null;
      supportsRemainingClaim: false;
      reason: string;
      verified: VerifiedRemainingResult;
    };

/**
 * Map FCE rows to #237 evidence. Records missing authenticity or approvalState
 * are omitted — never silently upgraded to AUTHENTIC / APPROVED.
 */
function toEvidence(records: readonly AttributedUtilizationRecord[]): {
  evidence: UtilizationEvidenceRecord[];
  excludedUntrusted: string[];
} {
  const evidence: UtilizationEvidenceRecord[] = [];
  const excludedUntrusted: string[] = [];
  for (const r of records) {
    if (r.authenticity == null || r.approvalState == null) {
      excludedUntrusted.push(r.usageId);
      continue;
    }
    evidence.push(
      evidenceFromAttributedLedger({
        usageId: r.usageId,
        amount: r.amountMillions,
        currency: r.currency ?? "USD",
        effectiveAsOf: r.effectiveAsOf,
        capacityRuleId: r.capacityRuleId,
        sharedCapacityId: r.sharedCapacityId ?? null,
        status:
          r.status === "ACTIVE" || r.status === "RECORDED"
            ? r.status === "RECORDED"
              ? "RECORDED"
              : "ACTIVE"
            : r.status === "SUPERSEDED"
              ? "SUPERSEDED"
              : "REVERSED",
        approvalState: r.approvalState,
        sourceLabel: r.sourceLabel ?? "fce-attributed-utilization",
        authenticity: r.authenticity,
        kind: r.sharedCapacityId ? "ATTRIBUTED_SHARED_POOL" : "ATTRIBUTED_RULE",
      }),
    );
  }
  return { evidence, excludedUntrusted };
}

/**
 * Publish remaining only through #237 `computeVerifiedRemaining`.
 * Units: FCE millions throughout (gross and utilization share the same unit).
 */
export function publishRemainingCapacity(args: {
  capacityRuleId: string;
  asOf: string;
  grossCapacityMillions: number | null;
  unlimited?: boolean;
  records: readonly AttributedUtilizationRecord[];
  completenessCertificate?: UtilizationCompletenessCertificate | TrustedCompletenessCertificate | null;
  unattributedLegacyBasketPresent?: boolean;
  currency?: string;
  /**
   * Must be explicitly true for AVAILABLE / remaining publication.
   * Omitted or false → gate not affirmatively satisfied.
   */
  gateSatisfied?: boolean;
  modeled?: boolean;
  /** Test/demo only — never set by production loaders. */
  allowSyntheticRemaining?: boolean;
}): RemainingPublication {
  const currency = args.currency ?? "USD";
  const { evidence, excludedUntrusted } = toEvidence(args.records);
  // Only Symbol-branded minted certs count — look-alike JSON flags are ignored.
  const trustedCert = isMintedTrustedCompleteness(args.completenessCertificate)
    ? {
        capacityRuleId: args.completenessCertificate.capacityRuleId,
        asOf: args.completenessCertificate.asOf,
        kind: args.completenessCertificate.kind,
        approvalState: args.completenessCertificate.approvalState,
        sourceLabel: args.completenessCertificate.sourceLabel,
      }
    : null;

  const untrustedCertPresent =
    args.completenessCertificate != null && !isMintedTrustedCompleteness(args.completenessCertificate);

  // Missing gateSatisfied is not an affirmative pass.
  const gateSatisfied = args.gateSatisfied === true;

  const gross: GrossCapacityInput = {
    capacityRuleId: args.capacityRuleId,
    amount: args.grossCapacityMillions,
    unlimited: args.unlimited,
    gateSatisfied,
    modeled: args.modeled ?? (args.grossCapacityMillions != null || !!args.unlimited),
    currency,
  };

  const verified = computeVerifiedRemaining({
    gross,
    utilization: {
      capacityRuleId: args.capacityRuleId,
      asOf: args.asOf,
      currency,
      records: evidence,
      completenessCertificate: trustedCert,
      unattributedLegacyBasketPresent: args.unattributedLegacyBasketPresent,
    },
    allowSyntheticRemaining: args.allowSyntheticRemaining,
  });

  const trustNotes: string[] = [];
  if (excludedUntrusted.length > 0) {
    trustNotes.push(
      `Excluded ${excludedUntrusted.length} utilization row(s) lacking explicit authenticity/approvalState (never defaulted to AUTHENTIC/APPROVED).`,
    );
  }
  if (untrustedCertPresent) {
    trustNotes.push(
      "Completeness certificate present without minted trusted provenance — ignored for remaining claims.",
    );
  }
  if (args.gateSatisfied !== true) {
    trustNotes.push("gateSatisfied not affirmatively true — cannot publish AVAILABLE.");
  }

  const noteWithTrust = trustNotes.length
    ? `${verified.note} ${trustNotes.join(" ")}`
    : verified.note;

  if (verified.remainingStatus === "REFUSED" || verified.remainingStatus === "NOT_DETERMINED") {
    return {
      status: "REFUSED",
      grossCapacityMillions: null,
      remainingCapacityMillions: null,
      supportsRemainingClaim: false,
      reason: noteWithTrust,
      verified,
    };
  }

  // Remaining only when #237 supports it AND we have trusted completeness provenance
  // (or verified empty with trusted cert) AND gate affirmatively satisfied for AVAILABLE.
  if (
    verified.remainingStatus === "REMAINING_SUPPORTED" &&
    verified.supportedRemaining != null &&
    verified.grossCapacity != null &&
    trustedCert != null &&
    gateSatisfied
  ) {
    return {
      status: "REMAINING_SUPPORTED",
      grossCapacityMillions: verified.grossCapacity,
      remainingCapacityMillions: verified.supportedRemaining,
      supportsRemainingClaim: true,
      knownUtilizationMillions: verified.knownUtilization ?? 0,
      reason: noteWithTrust,
      verified,
    };
  }

  return {
    status: "GROSS_ONLY",
    grossCapacityMillions:
      verified.grossCapacity == null ? args.grossCapacityMillions : verified.grossCapacity,
    remainingCapacityMillions: null,
    supportsRemainingClaim: false,
    reason: args.unattributedLegacyBasketPresent
      ? `${noteWithTrust} Unattributed legacy basket rows present — remaining refused (#237).`
      : noteWithTrust,
    verified,
  };
}
