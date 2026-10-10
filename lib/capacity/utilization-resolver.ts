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
 * usage. Remaining = gross − usage requires a validated completeness certificate
 * under the correct execution mode (PRODUCTION rejects synthetic certificates).
 */
import {
  validateCompletenessCertificate,
  type CompletenessValidationContext,
} from "./completeness-certificate";
import type { TrustedIssuerAuthorizationContext } from "./completeness-issuer-auth";
import type {
  CompletenessBindingFingerprints,
  UtilizationCompletenessCertificate,
  UtilizationEvidenceRecord,
  UtilizationExecutionMode,
  UtilizationKnowledgeKind,
  UtilizationResolution,
} from "./utilization-types";

export interface ResolveUtilizationArgs {
  capacityRuleId: string;
  asOf: string;
  companyId: string;
  currency?: string | null;
  /** Attributed / approved ledger evidence for this capacity path (may be empty). */
  records: readonly UtilizationEvidenceRecord[];
  /**
   * Affirmative completeness certificate. Validated against executionMode +
   * currentBindings before any remaining claim is supported.
   */
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  /**
   * Current operative world fingerprints. Required whenever a certificate is
   * presented — used for staleness / amendment / ledger / financial binding checks.
   */
  currentBindings?: CompletenessBindingFingerprints | null;
  /**
   * Trusted identity/authorization registry for the certificate issuer.
   * Required whenever a certificate is presented — issuer.role alone is insufficient.
   */
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  /**
   * PRODUCTION refuses SYNTHETIC_LABELED / SYSTEM_FIXTURE certificates.
   * DEMO_SYNTHETIC allows labeled synthetic certificates for mechanics demos only.
   */
  executionMode?: UtilizationExecutionMode;
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

/**
 * Resolve utilization knowledge for one capacity path.
 * Source-backed / approved records only — never invent usage or invent zero.
 */
export function resolveUtilization(args: ResolveUtilizationArgs): UtilizationResolution {
  const asOf = args.asOf;
  const currencyHint = args.currency ?? null;
  const executionMode: UtilizationExecutionMode = args.executionMode ?? "PRODUCTION";
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

  let knowledge: UtilizationKnowledgeKind;
  let attributedAmount: number | null = null;
  let currency: string | null = currencyHint;
  let note: string;

  if (attributedToRule.length > 0) {
    const currencies = new Set(attributedToRule.map((r) => r.currency));
    if (currencies.size > 1) {
      knowledge = "PARTIALLY_KNOWN";
      attributedAmount = null;
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
      note = `Known attributed utilization ${attributedAmount} ${currency ?? ""} (${knowledge}) — remaining requires validated completeness certificate.`;
      blockers.push(
        "approved attributed ledger records do not establish completeness of historical usage — remaining claim requires a validated completeness certificate",
      );
    }
  } else if (legacyOnly.length > 0 || args.unattributedLegacyBasketPresent) {
    knowledge = "UNATTRIBUTED_LEGACY_BASKET";
    attributedAmount = null;
    blockers.push(
      "legacy basket-family ledger rows are not attributed to a Permission/Provision id",
    );
    note =
      "Legacy basket-family usage exists without rule attribution — gross capacity may be known; remaining after utilization cannot be claimed.";
  } else if (considered.some((r) => r.status === "SUPERSEDED") && attributedToRule.length === 0) {
    knowledge = "SUPERSEDED_EXCLUDED";
    attributedAmount = null;
    blockers.push(
      "only superseded usage present; no validated empty-path completeness certificate",
    );
    note =
      "Superseded usage excluded; absence of active rows is not verified zero without a validated completeness certificate.";
  } else if (considered.length === 0) {
    knowledge = "UNKNOWN";
    attributedAmount = null;
    blockers.push(
      "no attributed utilization evidence; empty ledger table is not verified zero",
    );
    note =
      "Utilization UNKNOWN — missing historical usage is never defaulted to zero. An empty database table does not prove zero usage.";
  } else if (blockers.length > 0 && attributedToRule.length === 0) {
    knowledge = "PARTIALLY_KNOWN";
    attributedAmount = null;
    note =
      "Utilization partially known — some records excluded (approval/date/path); remaining claim blocked.";
  } else {
    knowledge = "UNKNOWN";
    attributedAmount = null;
    blockers.push(
      "no applicable attributed usage for this capacity path as of evaluation date",
    );
    note = "Utilization UNKNOWN for this capacity path.";
  }

  // Completeness certificate validation — required for any remaining claim.
  let supportsRemainingClaim = false;
  let completenessCertified = false;
  let productionAuthoritative = false;
  let certificateValidationBlockers: string[] = [];

  const cert = args.completenessCertificate ?? null;
  if (cert != null) {
    if (args.currentBindings == null) {
      certificateValidationBlockers = [
        "completeness certificate presented without currentBindings — cannot verify staleness",
      ];
      blockers.push(...certificateValidationBlockers);
    } else if (args.trustedIssuerAuth == null) {
      certificateValidationBlockers = [
        "completeness certificate presented without trustedIssuerAuth — caller-supplied issuer.role alone cannot establish completeness authority",
      ];
      blockers.push(...certificateValidationBlockers);
    } else {
      const ctx: CompletenessValidationContext = {
        executionMode,
        evaluationAsOf: asOf,
        companyId: args.companyId,
        capacityRuleId: args.capacityRuleId,
        currency,
        currentBindings: args.currentBindings,
        attributedRecordCount: attributedToRule.length,
        trustedIssuerAuth: args.trustedIssuerAuth,
      };
      const validated = validateCompletenessCertificate(cert, ctx);
      certificateValidationBlockers = validated.blockers;
      if (!validated.ok || !validated.supportsRemainingClaim) {
        blockers.push(...validated.blockers);
        note = `${note} Completeness certificate refused: ${validated.blockers.join("; ") || "not authoritative"}.`;
      } else {
        completenessCertified = true;
        supportsRemainingClaim = true;
        productionAuthoritative = validated.productionAuthoritative;
        // Clear the generic "records alone insufficient" blocker when cert validates.
        const filtered = blockers.filter(
          (b) => !/do not establish completeness of historical usage/i.test(b),
        );
        blockers.length = 0;
        blockers.push(...filtered);
        if (cert.kind === "VERIFIED_EMPTY" && attributedToRule.length === 0) {
          knowledge = "VERIFIED_ZERO";
          attributedAmount = 0;
          note = `Verified zero utilization per validated empty completeness certificate (${cert.certificateId}).`;
        } else {
          note = `Attributed utilization ${attributedAmount} ${currency ?? ""} (${knowledge}); completeness validated (${cert.certificateId}${productionAuthoritative ? ", production-authoritative" : ", demo-only"}).`;
        }
      }
    }
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
    blockers,
    note,
    supportsRemainingClaim,
    completenessCertified,
    productionAuthoritative,
    certificateValidationBlockers,
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
