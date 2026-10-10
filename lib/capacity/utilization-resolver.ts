/**
 * Generalized utilization resolver.
 *
 * Distinguishes known attributed usage, verified zero, unknown, partially known,
 * superseded, reclassified, shared-pool, and cross-entity/date usage.
 *
 * NEVER defaults missing historical usage to zero. An empty unattributed ledger
 * table is UNKNOWN, not VERIFIED_ZERO.
 *
 * Approved individual ledger records do NOT establish completeness of historical
 * usage. Remaining = gross − usage requires a completeness certificate with
 * authenticity + trusted issuer authorization (same production gate as the
 * solver bridge — APPROVED alone never suffices).
 */
import type { TrustedIssuerAuthorizationContext } from "./completeness-issuer-auth";
import { evaluateCompletenessForRemainingClaim } from "./utilization-authority";
import type {
  UtilizationCompletenessCertificate,
  UtilizationEvidenceRecord,
  UtilizationKnowledgeKind,
  UtilizationResolution,
} from "./utilization-types";

export interface ResolveUtilizationArgs {
  capacityRuleId: string;
  asOf: string;
  currency?: string | null;
  /** Attributed / approved ledger evidence for this capacity path (may be empty). */
  records: readonly UtilizationEvidenceRecord[];
  /**
   * Affirmative certificate that the attributed ledger for this path is complete
   * as of `asOf`. Required for any remaining-capacity claim.
   * Production remaining also requires authenticity AUTHENTIC + trustedIssuerAuth.
   */
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  /**
   * Trusted identity/authorization for the certificate issuer.
   * Required for production-authoritative remaining. Missing context fails closed.
   */
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  /**
   * Test/demo only — permits SYNTHETIC_LABELED completeness. Never set by
   * production Position / Simulate / Ask / debt-intelligence loaders.
   */
  allowSyntheticRemaining?: boolean;
  /**
   * @deprecated Prefer completenessCertificate with kind VERIFIED_EMPTY.
   * Kept as a thin alias for call sites that only certify emptiness.
   */
  verifiedEmptyCertificate?: {
    capacityRuleId: string;
    asOf: string;
    approvalState: "APPROVED";
    sourceLabel: string;
  } | null;
  /** When true, legacy basket-family rows exist but none attribute to this rule. */
  unattributedLegacyBasketPresent?: boolean;
  /** Shared-pool id when evaluating pool-level utilization. */
  sharedCapacityId?: string | null;
}

function asOfCutoff(iso: string): string {
  return iso.slice(0, 10);
}

function isActiveForAsOf(record: UtilizationEvidenceRecord, asOf: string): boolean {
  if (record.effectiveAsOf.slice(0, 10) > asOfCutoff(asOf)) return false;
  if (record.status === "SUPERSEDED" || record.status === "REVERSED") return false;
  return (
    record.status === "RECORDED" ||
    record.status === "ACTIVE" ||
    record.status === "RECLASSIFICATION_ELECTION"
  );
}

function appliesToRule(
  record: UtilizationEvidenceRecord,
  capacityRuleId: string,
  sharedCapacityId: string | null | undefined,
): boolean {
  if (record.kind === "SUPERSEDED") return false;
  if (sharedCapacityId && record.sharedCapacityId === sharedCapacityId) return true;
  if (record.capacityRuleId === capacityRuleId) return true;
  return false;
}

function resolveCompletenessCert(
  args: ResolveUtilizationArgs,
): UtilizationCompletenessCertificate | null {
  if (args.completenessCertificate) return args.completenessCertificate;
  if (args.verifiedEmptyCertificate) {
    return {
      ...args.verifiedEmptyCertificate,
      kind: "VERIFIED_EMPTY",
    };
  }
  return null;
}

function certApplies(cert: UtilizationCompletenessCertificate | null, capacityRuleId: string, asOf: string): boolean {
  return (
    cert != null &&
    cert.capacityRuleId === capacityRuleId &&
    cert.approvalState === "APPROVED" &&
    asOfCutoff(cert.asOf) >= asOfCutoff(asOf)
  );
}

/**
 * Resolve utilization knowledge for one capacity path.
 * Source-backed / approved records only — never invent usage or invent zero.
 */
export function resolveUtilization(args: ResolveUtilizationArgs): UtilizationResolution {
  const asOf = args.asOf;
  const currencyHint = args.currency ?? null;
  const considered = [...args.records];
  const applied: UtilizationEvidenceRecord[] = [];
  const excluded: UtilizationEvidenceRecord[] = [];
  const blockers: string[] = [];

  for (const r of considered) {
    if (!isActiveForAsOf(r, asOf)) {
      excluded.push(r);
      continue;
    }
    if (r.approvalState === "UNAPPROVED") {
      excluded.push(r);
      blockers.push(`usage ${r.usageId} is unapproved`);
      continue;
    }
    if (r.approvalState === "UNKNOWN") {
      excluded.push(r);
      blockers.push(`usage ${r.usageId} has unknown approval state`);
      continue;
    }
    if (appliesToRule(r, args.capacityRuleId, args.sharedCapacityId)) {
      applied.push(r);
    } else {
      excluded.push(r);
    }
  }

  const attributedToRule = applied.filter(
    (r) =>
      r.kind === "ATTRIBUTED_RULE" ||
      r.kind === "ATTRIBUTED_SHARED_POOL" ||
      r.kind === "RECLASSIFICATION_DESTINATION" ||
      r.kind === "RECLASSIFICATION_SOURCE",
  );
  const legacyOnly = applied.filter((r) => r.kind === "LEGACY_BASKET_FAMILY");
  const reclassified = attributedToRule.filter(
    (r) => r.kind === "RECLASSIFICATION_DESTINATION" || r.kind === "RECLASSIFICATION_SOURCE",
  );
  const shared = attributedToRule.filter(
    (r) => r.kind === "ATTRIBUTED_SHARED_POOL" || r.sharedCapacityId != null,
  );

  const cert = resolveCompletenessCert(args);
  const structuralCertApplies = certApplies(cert, args.capacityRuleId, asOf);
  // Production authority gate — shared with solver decideSolverUtilizationAuthority.
  // APPROVED alone never sets supportsRemainingClaim.
  const authorityEval = evaluateCompletenessForRemainingClaim({
    cert: structuralCertApplies ? cert : null,
    trustedIssuerAuth: args.trustedIssuerAuth,
    allowSyntheticRemaining: args.allowSyntheticRemaining,
  });
  const authorityOk = authorityEval.supportsRemainingClaim;
  if (structuralCertApplies && !authorityOk) {
    blockers.push(...authorityEval.blockers);
  }
  const completenessCertified = authorityOk;
  const emptyCertified = completenessCertified && cert!.kind === "VERIFIED_EMPTY";
  const recordsComplete = completenessCertified && cert!.kind === "VERIFIED_COMPLETE";

  // Mixed authentic + synthetic attributed usage cannot establish production remaining.
  const authenticityKinds = new Set(attributedToRule.map((r) => r.authenticity));
  const mixedAuthenticity =
    authenticityKinds.has("AUTHENTIC") && authenticityKinds.has("SYNTHETIC_LABELED");
  if (mixedAuthenticity && !args.allowSyntheticRemaining) {
    blockers.push(
      "mixed authentic and synthetic utilization evidence cannot establish production-authoritative remaining",
    );
  }

  // Duplicate usage ids among applied attributed records — refuse remaining.
  const usageIds = attributedToRule.map((r) => r.usageId);
  const duplicateUsage = usageIds.length !== new Set(usageIds).size;
  if (duplicateUsage) {
    blockers.push("duplicate ledger usage ids on capacity path — remaining not supported");
  }

  let knowledge: UtilizationKnowledgeKind;
  let attributedAmount: number | null = null;
  let currency: string | null = currencyHint;
  let supportsRemainingClaim = false;
  let note: string;

  if (attributedToRule.length > 0) {
    const currencies = new Set(attributedToRule.map((r) => r.currency));
    if (currencies.size > 1) {
      knowledge = "PARTIALLY_KNOWN";
      attributedAmount = null;
      supportsRemainingClaim = false;
      blockers.push("mixed currencies across attributed usage records — remaining not supported");
      note = "Attributed usage present but currencies disagree; remaining capacity claim blocked.";
    } else {
      currency = [...currencies][0] ?? currencyHint;
      attributedAmount = attributedToRule.reduce((s, r) => s + r.amount, 0);
      if (shared.length > 0) {
        knowledge = "SHARED_POOL";
      } else if (reclassified.length > 0) {
        knowledge = "RECLASSIFIED";
      } else {
        knowledge = "KNOWN_ATTRIBUTED";
      }
      if (recordsComplete && !mixedAuthenticity && !duplicateUsage) {
        supportsRemainingClaim = true;
        note = `Attributed utilization ${attributedAmount} ${currency ?? ""} as of ${asOfCutoff(asOf)} (${knowledge}); completeness certified (${cert!.sourceLabel}${authorityEval.productionAuthoritative ? ", production-authoritative" : ", demo-only"}).`;
      } else {
        supportsRemainingClaim = false;
        if (!recordsComplete && structuralCertApplies === false) {
          blockers.push(
            "approved attributed ledger records do not establish completeness of historical usage — remaining claim requires a VERIFIED_COMPLETE certificate",
          );
        }
        note = `Known attributed utilization ${attributedAmount} ${currency ?? ""} (${knowledge}), but completeness not certified — remaining capacity cannot be claimed.`;
      }
    }
  } else if (legacyOnly.length > 0 || args.unattributedLegacyBasketPresent) {
    knowledge = "UNATTRIBUTED_LEGACY_BASKET";
    attributedAmount = null;
    supportsRemainingClaim = false;
    blockers.push(
      "legacy basket-family ledger rows are not attributed to a Permission/Provision id",
    );
    note =
      "Legacy basket-family usage exists without rule attribution — gross capacity may be known; remaining after utilization cannot be claimed.";
  } else if (
    considered.some((r) => r.status === "SUPERSEDED") &&
    attributedToRule.length === 0 &&
    !emptyCertified
  ) {
    knowledge = "SUPERSEDED_EXCLUDED";
    attributedAmount = null;
    supportsRemainingClaim = false;
    blockers.push(
      "only superseded usage present; no approved empty-ledger completeness certificate for this path",
    );
    note =
      "Superseded usage excluded; absence of active rows is not verified zero without a completeness certificate.";
  } else if (emptyCertified && attributedToRule.length === 0) {
    knowledge = "VERIFIED_ZERO";
    attributedAmount = 0;
    supportsRemainingClaim = true;
    note = `Verified zero utilization per approved empty completeness certificate (${cert!.sourceLabel}) as of ${asOfCutoff(asOf)}${authorityEval.productionAuthoritative ? " (production-authoritative)" : " (demo-only)"}.`;
  } else if (considered.length === 0) {
    knowledge = "UNKNOWN";
    attributedAmount = null;
    supportsRemainingClaim = false;
    blockers.push(
      "no attributed utilization evidence; empty ledger table is not verified zero",
    );
    note =
      "Utilization UNKNOWN — missing historical usage is never defaulted to zero. An empty database table does not prove zero usage.";
  } else if (blockers.length > 0 && attributedToRule.length === 0) {
    knowledge = "PARTIALLY_KNOWN";
    attributedAmount = null;
    supportsRemainingClaim = false;
    note =
      "Utilization partially known — some records excluded (approval/date/path); remaining claim blocked.";
  } else {
    knowledge = "UNKNOWN";
    attributedAmount = null;
    supportsRemainingClaim = false;
    blockers.push(
      "no applicable attributed usage for this capacity path as of evaluation date",
    );
    note = "Utilization UNKNOWN for this capacity path.";
  }

  // Completeness KIND must match evidence shape — refuse mismatched certificates.
  if (structuralCertApplies && cert!.kind === "VERIFIED_EMPTY" && attributedToRule.length > 0) {
    supportsRemainingClaim = false;
    blockers.push(
      "VERIFIED_EMPTY completeness certificate conflicts with attributed usage records — remaining claim blocked",
    );
    note = `${note} Completeness certificate kind mismatch (EMPTY vs records present).`;
  }
  if (structuralCertApplies && cert!.kind === "VERIFIED_COMPLETE" && attributedToRule.length === 0) {
    supportsRemainingClaim = false;
    blockers.push(
      "VERIFIED_COMPLETE completeness certificate requires attributed records — use VERIFIED_EMPTY for zero usage",
    );
    if (knowledge === "UNKNOWN" || knowledge === "VERIFIED_ZERO") {
      knowledge = "PARTIALLY_KNOWN";
    }
    note = `${note} Completeness certificate kind mismatch (COMPLETE vs no records).`;
  }

  // Final production gate: mixed authenticity, duplicates, or failed authority evaluation strips remaining.
  if (supportsRemainingClaim && mixedAuthenticity && !args.allowSyntheticRemaining) {
    supportsRemainingClaim = false;
  }
  if (supportsRemainingClaim && duplicateUsage) {
    supportsRemainingClaim = false;
  }
  if (supportsRemainingClaim && !authorityOk) {
    supportsRemainingClaim = false;
  }

  return {
    knowledge,
    attributedAmount,
    currency,
    asOf: asOfCutoff(asOf),
    capacityRuleId: args.capacityRuleId,
    recordsConsidered: considered,
    recordsApplied: attributedToRule,
    recordsExcluded: excluded,
    blockers: [...new Set(blockers)],
    note,
    supportsRemainingClaim,
    completenessCertified: supportsRemainingClaim,
    productionAuthoritative: supportsRemainingClaim && authorityEval.productionAuthoritative,
  };
}

/** Build an attributed utilization evidence record (source-backed or labeled synthetic). */
export function evidenceFromAttributedLedger(args: {
  usageId: string;
  amount: number;
  currency: string;
  effectiveAsOf: string;
  capacityRuleId: string | null;
  sharedCapacityId?: string | null;
  status: UtilizationEvidenceRecord["status"];
  approvalState: UtilizationEvidenceRecord["approvalState"];
  sourceLabel: string;
  authenticity: UtilizationEvidenceRecord["authenticity"];
  kind?: UtilizationEvidenceRecord["kind"];
}): UtilizationEvidenceRecord {
  const kind =
    args.kind ??
    (args.sharedCapacityId
      ? "ATTRIBUTED_SHARED_POOL"
      : args.capacityRuleId
        ? "ATTRIBUTED_RULE"
        : "LEGACY_BASKET_FAMILY");
  return {
    usageId: args.usageId,
    kind,
    amount: args.amount,
    currency: args.currency,
    effectiveAsOf: args.effectiveAsOf,
    capacityRuleId: args.capacityRuleId,
    sharedCapacityId: args.sharedCapacityId ?? null,
    legacyBasketFamily: null,
    entityKey: null,
    status: args.status,
    approvalState: args.approvalState,
    sourceLabel: args.sourceLabel,
    authenticity: args.authenticity,
  };
}
