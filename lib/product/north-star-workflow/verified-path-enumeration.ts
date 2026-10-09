/**
 * Phase 4E — neutral contractual pathway enumeration over a VerifiedExecutionPackage.
 *
 * Lists candidate paths from verified IR without ranking, stacking, or auto-selecting.
 * Incomplete / unsupported coverage is returned truthfully; uncertified packages never
 * claim CERTIFIED_4E.
 *
 * See docs/headroom-north-star-reconciliation/05-ask-headroom-boundary.md.
 */
import type { IRCondition, IRRule, IRSharedCapacity } from "@/lib/contract-model/ir/types";
import type { VerifiedExecutionPackage, VerifiedUnitArtifact } from "@/lib/contract-model/verified-execution";
import type { ContractAction } from "@/lib/contract-model/types";

/** Statuses that completed verification (mirror verification-gate; product must not import runtime/*). */
const COMPLETED_VERIFICATION_STATUSES = new Set([
  "VERIFIED_NO_MATERIAL_GAP_FOUND",
  "VERIFIED_WITH_NON_MATERIAL_FINDINGS",
  "REVIEW_REQUIRED",
  "MATERIAL_DISCREPANCY",
]);

export type CertifiedPathAuthority = "CERTIFIED_4E" | "NOT_CERTIFIED_4E" | "INCOMPLETE_PACKAGE";

export type ContemplatedTxnKind =
  | "SECURED_DEBT"
  | "UNSECURED_DEBT"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "ACQUISITION"
  | "UNKNOWN";

export type EnumeratedPathStatus =
  | "CANDIDATE"
  | "REVIEW_REQUIRED"
  | "UNSUPPORTED"
  | "INCOMPLETE_VERIFICATION";

export interface EnumeratedCondition {
  conditionId: string;
  type: string;
  summary: string;
  referencesRuleTargets: string[];
}

export interface EnumeratedSharedCapacityInteraction {
  sharedCapId: string;
  memberRuleIds: string[];
  note: string;
}

export interface EnumeratedCertifiedPath {
  pathId: string;
  label: string;
  status: EnumeratedPathStatus;
  ruleId: string;
  sourceSectionRef: string | null;
  action: ContractAction | null;
  covenantFamily: string;
  /** Permission / posture as carried on the IR rule — not a runtime grant. */
  permission: {
    posture: string;
    ruleType: string;
    hasCapacityExpression: boolean;
    sufficiency: string;
  };
  conditions: EnumeratedCondition[];
  financialTests: string[];
  sharedCapacityInteractions: EnumeratedSharedCapacityInteraction[];
  /** Companion lien / debt restriction rules listed neutrally (not stacked). */
  companionRestrictions: Array<{ ruleId: string; sourceSectionRef: string | null; action: ContractAction | null; note: string }>;
  note: string;
}

export interface CertifiedPathEnumeration {
  authority: CertifiedPathAuthority;
  transactionKind: ContemplatedTxnKind;
  secured: boolean | null;
  paths: EnumeratedCertifiedPath[];
  stackingAssumed: false;
  incompleteReasons: string[];
  unsupportedReasons: string[];
  note: string;
}

const DEBT_ACTIONS = new Set<ContractAction>(["INCUR_DEBT", "INCUR_SECURED_DEBT", "GUARANTEE_DEBT"]);
const LIEN_ACTIONS = new Set<ContractAction>(["CREATE_LIEN", "GRANT_COLLATERAL"]);
const RP_ACTIONS = new Set<ContractAction>(["PAY_DIVIDEND", "REPURCHASE_EQUITY", "PAY_JUNIOR_DEBT", "PREPAY_DEBT"]);
const INV_ACTIONS = new Set<ContractAction>(["MAKE_INVESTMENT", "ACQUIRE_BUSINESS"]);

function actionsForKind(kind: ContemplatedTxnKind, secured: boolean | null): {
  primary: Set<ContractAction>;
  companions: Set<ContractAction>;
} {
  switch (kind) {
    case "SECURED_DEBT":
    case "ACQUISITION":
      return {
        primary: new Set<ContractAction>([...DEBT_ACTIONS, "INCUR_SECURED_DEBT"]),
        companions: LIEN_ACTIONS,
      };
    case "UNSECURED_DEBT":
      return { primary: DEBT_ACTIONS, companions: secured === true ? LIEN_ACTIONS : new Set() };
    case "RESTRICTED_PAYMENT":
      return { primary: RP_ACTIONS, companions: new Set() };
    case "INVESTMENT":
      return { primary: INV_ACTIONS, companions: new Set() };
    default:
      return {
        primary: new Set<ContractAction>([...DEBT_ACTIONS, ...LIEN_ACTIONS, ...RP_ACTIONS, ...INV_ACTIONS]),
        companions: new Set(),
      };
  }
}

function verificationFor(pkg: VerifiedExecutionPackage, unitId: string): VerifiedUnitArtifact | undefined {
  return pkg.verifications.find((v) => v.ruleOrDefinitionId === unitId);
}

function unitVerificationStatus(pkg: VerifiedExecutionPackage, unitId: string): EnumeratedPathStatus {
  const art = verificationFor(pkg, unitId);
  if (!art) return "INCOMPLETE_VERIFICATION";
  if (!COMPLETED_VERIFICATION_STATUSES.has(art.result.status)) return "INCOMPLETE_VERIFICATION";
  if (
    art.result.status === "REVIEW_REQUIRED" ||
    art.result.status === "MATERIAL_DISCREPANCY" ||
    art.result.findings.some((f) => f.severity === "MATERIAL" && f.ruleOrDefinitionId === unitId)
  ) {
    return "REVIEW_REQUIRED";
  }
  return "CANDIDATE";
}

function conditionSummary(c: IRCondition): EnumeratedCondition {
  const refs = (c.referencesRuleTargets ?? []).map((t) => t.exactSourceTargetRef);
  const parts = [c.conditionType, c.description || null].filter(Boolean);
  return {
    conditionId: c.conditionId,
    type: String(c.conditionType),
    summary: parts.join(": ") || c.conditionId,
    referencesRuleTargets: refs,
  };
}

function financialTestsOf(rule: IRRule): string[] {
  const out: string[] = [];
  for (const c of rule.conditions) {
    const t = String(c.conditionType);
    const desc = c.description ?? "";
    const proForma = c.evaluationBasis?.proForma === true;
    if (
      proForma ||
      /RATIO|LEVERAGE|COVERAGE|FINANCIAL|PRO_FORMA/i.test(t) ||
      /ratio|leverage|coverage|pro forma/i.test(desc)
    ) {
      out.push(`${c.conditionId}: ${desc || t}${proForma ? " (pro forma)" : ""}`);
    }
  }
  for (const d of rule.sourceDependencies ?? []) {
    if (d.relationshipType === "REQUIRES" || d.relationshipType === "LIMITED_BY") {
      out.push(`${d.relationshipType} ${d.exactSourceTargetRef}`);
    }
  }
  return out;
}

function sharedInteractionsFor(
  rule: IRRule,
  shared: readonly IRSharedCapacity[],
): EnumeratedSharedCapacityInteraction[] {
  return shared
    .filter((s) => s.memberRuleIds.includes(rule.ruleId))
    .map((s) => ({
      sharedCapId: s.sharedCapId,
      memberRuleIds: [...s.memberRuleIds].sort(),
      note: `Rule participates in shared capacity ${s.sharedCapId} with ${s.memberRuleIds.length} member(s); stacking across members is not assumed.`,
    }));
}

function ruleMatchesAction(rule: IRRule, actions: Set<ContractAction>): boolean {
  if (rule.action && actions.has(rule.action)) return true;
  if (rule.transactionScope?.some((a) => actions.has(a))) return true;
  return false;
}

/**
 * Neutral enumeration of contractual pathways for a contemplated transaction
 * over a VerifiedExecutionPackage. Never ranks or auto-selects a path.
 */
export function enumerateCertifiedPaths(args: {
  verifiedPackage: VerifiedExecutionPackage | null | undefined;
  transactionKind: ContemplatedTxnKind;
  secured?: boolean | null;
}): CertifiedPathEnumeration {
  const stackingAssumed = false as const;
  const secured = args.secured ?? null;
  const kind = args.transactionKind;
  const pkg = args.verifiedPackage ?? null;

  if (!pkg) {
    return {
      authority: "NOT_CERTIFIED_4E",
      transactionKind: kind,
      secured,
      paths: [],
      stackingAssumed,
      incompleteReasons: ["NO_VERIFIED_EXECUTION_PACKAGE"],
      unsupportedReasons: [],
      note:
        "Certified Phase 4E enumeration requires a VerifiedExecutionPackage. Absent Phase 3 CERTIFIED artifacts, authority remains NOT_CERTIFIED_4E.",
    };
  }

  if (pkg.rules.length === 0) {
    return {
      authority: "INCOMPLETE_PACKAGE",
      transactionKind: kind,
      secured,
      paths: [],
      stackingAssumed,
      incompleteReasons: ["PACKAGE_HAS_NO_RULES"],
      unsupportedReasons: [],
      note: "VerifiedExecutionPackage carries no rules; nothing to enumerate.",
    };
  }

  const { primary, companions } = actionsForKind(kind, secured);
  const shared = pkg.sharedCapacities ?? [];
  const primaryRules = pkg.rules.filter((r) => ruleMatchesAction(r, primary));
  const companionRules = pkg.rules.filter((r) => ruleMatchesAction(r, companions));

  const incompleteReasons: string[] = [];
  const unsupportedReasons: string[] = [];

  if (primaryRules.length === 0) {
    incompleteReasons.push(`NO_MATCHING_PRIMARY_RULES_FOR_${kind}`);
  }

  // Secured debt / acquisitions require independent lien authority. A debt-only VEP that
  // never certified a CREATE_LIEN / GRANT_COLLATERAL companion cannot complete secured
  // enumeration — treating the debt basket alone as a CANDIDATE secured path would be a
  // false permission (Stage D / pkg-i pattern).
  const securedRequiresLienCompanion = kind === "SECURED_DEBT" || kind === "ACQUISITION";
  const missingLienCompanion =
    securedRequiresLienCompanion && primaryRules.length > 0 && companionRules.length === 0;
  if (missingLienCompanion) {
    incompleteReasons.push("NO_CERTIFIED_LIEN_COMPANION_FOR_SECURED_DEBT");
  }

  const companionSummaries = companionRules.map((r) => ({
    ruleId: r.ruleId,
    sourceSectionRef: r.sourceSectionRef,
    action: r.action,
    note:
      unitVerificationStatus(pkg, r.ruleId) === "CANDIDATE"
        ? "Companion restriction listed neutrally; not auto-applied or stacked."
        : `Companion restriction verification status: ${unitVerificationStatus(pkg, r.ruleId)}.`,
  }));

  const paths: EnumeratedCertifiedPath[] = primaryRules.map((rule) => {
    const status = unitVerificationStatus(pkg, rule.ruleId);
    if (status === "INCOMPLETE_VERIFICATION") {
      incompleteReasons.push(`INCOMPLETE_VERIFICATION:${rule.ruleId}`);
    }
    if (status === "REVIEW_REQUIRED") {
      unsupportedReasons.push(`REVIEW_REQUIRED:${rule.ruleId}`);
    }
    if (rule.sufficiency === "UNSUPPORTED" || rule.sufficiency === "PARTIAL") {
      unsupportedReasons.push(`SUFFICIENCY_${rule.sufficiency}:${rule.ruleId}`);
    }
    const crossGate =
      rule.conditions.some((c) => (c.referencesRuleTargets?.length ?? 0) > 0) ||
      (rule.sourceDependencies ?? []).some((d) => d.relationshipType === "REQUIRES" || d.relationshipType === "LIMITED_BY");
    let pathStatus: EnumeratedPathStatus =
      status !== "CANDIDATE"
        ? status
        : crossGate
          ? "UNSUPPORTED"
          : rule.sufficiency === "COMPLETE"
            ? "CANDIDATE"
            : "UNSUPPORTED";
    if (crossGate && status === "CANDIDATE") {
      unsupportedReasons.push(`CROSS_RULE_GATE_NOT_EXECUTABLE:${rule.ruleId}`);
    }
    if (missingLienCompanion && pathStatus === "CANDIDATE") {
      pathStatus = "UNSUPPORTED";
      unsupportedReasons.push(`SECURED_PATH_REQUIRES_LIEN_COMPANION:${rule.ruleId}`);
    }

    return {
      pathId: `path:${rule.ruleId}`,
      label: `${rule.sourceSectionRef ?? rule.ruleId} · ${rule.action ?? rule.covenantFamily}`,
      status: pathStatus,
      ruleId: rule.ruleId,
      sourceSectionRef: rule.sourceSectionRef,
      action: rule.action,
      covenantFamily: String(rule.covenantFamily),
      permission: {
        posture: String(rule.posture),
        ruleType: String(rule.ruleType),
        hasCapacityExpression: rule.capacityExpression != null,
        sufficiency: String(rule.sufficiency),
      },
      conditions: rule.conditions.map(conditionSummary),
      financialTests: financialTestsOf(rule),
      sharedCapacityInteractions: sharedInteractionsFor(rule, shared),
      companionRestrictions: companionSummaries,
      note:
        missingLienCompanion && pathStatus === "UNSUPPORTED"
          ? "Secured/acquisition path refused: package has no certified CREATE_LIEN/GRANT_COLLATERAL companion. Debt permission alone is not secured authority."
          : pathStatus === "CANDIDATE"
            ? "Neutral candidate path from verified IR. Not selected; stacking not assumed."
            : pathStatus === "UNSUPPORTED"
              ? "Path enumerated but not executable under current certified runtime (cross-rule gate or insufficient representation)."
              : "Path enumerated with incomplete or review-required verification — not an available grant.",
    };
  });

  // Also surface companion-only restrictions when primary debt paths exist (lien side for secured debt).
  if (kind === "SECURED_DEBT" || kind === "ACQUISITION") {
    for (const lien of companionRules) {
      if (paths.some((p) => p.ruleId === lien.ruleId)) continue;
      const status = unitVerificationStatus(pkg, lien.ruleId);
      paths.push({
        pathId: `path:restriction:${lien.ruleId}`,
        label: `Lien restriction ${lien.sourceSectionRef ?? lien.ruleId}`,
        status: status === "CANDIDATE" && lien.sufficiency === "COMPLETE" ? "CANDIDATE" : status === "CANDIDATE" ? "UNSUPPORTED" : status,
        ruleId: lien.ruleId,
        sourceSectionRef: lien.sourceSectionRef,
        action: lien.action,
        covenantFamily: String(lien.covenantFamily),
        permission: {
          posture: String(lien.posture),
          ruleType: String(lien.ruleType),
          hasCapacityExpression: lien.capacityExpression != null,
          sufficiency: String(lien.sufficiency),
        },
        conditions: lien.conditions.map(conditionSummary),
        financialTests: financialTestsOf(lien),
        sharedCapacityInteractions: sharedInteractionsFor(lien, shared),
        companionRestrictions: [],
        note: "Lien restriction enumerated for secured debt analysis; not auto-paired with a debt basket.",
      });
    }
  }

  const materialIncomplete =
    incompleteReasons.some(
      (r) =>
        r.startsWith("INCOMPLETE_VERIFICATION") ||
        r === "NO_CERTIFIED_LIEN_COMPANION_FOR_SECURED_DEBT" ||
        r.startsWith("NO_MATCHING_PRIMARY_RULES_FOR_"),
    );

  const allVerified =
    pkg.verifications.length > 0 &&
    paths.every((p) => p.status === "CANDIDATE" || p.status === "UNSUPPORTED") &&
    !materialIncomplete;

  const authority: CertifiedPathAuthority =
    paths.length === 0
      ? incompleteReasons.length > 0
        ? "INCOMPLETE_PACKAGE"
        : "NOT_CERTIFIED_4E"
      : allVerified
        ? "CERTIFIED_4E"
        : "INCOMPLETE_PACKAGE";

  return {
    authority,
    transactionKind: kind,
    secured,
    paths: paths.sort((a, b) => (a.pathId < b.pathId ? -1 : 1)),
    stackingAssumed,
    incompleteReasons: [...new Set(incompleteReasons)].sort(),
    unsupportedReasons: [...new Set(unsupportedReasons)].sort(),
    note:
      authority === "CERTIFIED_4E"
        ? `Neutral Phase 4E enumeration over verified package (${paths.length} path(s)). Stacking not assumed; no path auto-selected.`
        : `Phase 4E enumeration incomplete or unsupported (${incompleteReasons.length} incomplete, ${unsupportedReasons.length} unsupported). Fail-closed: do not treat as available capacity.`,
  };
}
