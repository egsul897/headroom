/**
 * Product bridge: AttemptCertifiedTransaction → optional 4D simulate.
 * Never fabricates VEP. Never bypasses NS-4 / cutoff / 4C / REQUIRE gates.
 *
 * EXECUTABLE is affirmative transaction permission under verified gates only —
 * never capacity-evaluation success alone, and never a Phase 4D wrapper
 * EXECUTED outcome without SIMULATED + SATISFIED selected-path semantics.
 */

import { attemptCertifiedTransaction, type CertifiedTransactionAttempt } from "@/lib/product/north-star-workflow/certified-transaction";
import {
  enumerateCertifiedPaths,
  type EnumeratedCertifiedPath,
} from "@/lib/product/north-star-workflow/verified-path-enumeration";
import { selectEnumeratedPath } from "./path-selection";
import { buildConsumeTransaction } from "./consume-transaction";
import type {
  HypotheticalTransaction,
  SelectedPath,
  VerifiedExecutionPackage,
} from "@/lib/contract-model/verified-execution";

export type UnifiedTxnKind =
  | "SECURED_DEBT"
  | "UNSECURED_DEBT"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "ACQUISITION"
  | "UNKNOWN";

export interface VerifiedSimulateRequest {
  companyId: string;
  evaluationDate: string;
  amountMillions: number;
  kind: UnifiedTxnKind;
  secured?: boolean | null;
  /** Caller-supplied only — product never invents. */
  verifiedPackage?: VerifiedExecutionPackage | null;
  /**
   * When set, selection must match this exact pathId among eligible candidates.
   * Unknown / stale / ineligible pathIds fail closed — never silently substitute.
   * When omitted/null/empty and exactly one eligible candidate exists, that path
   * is auto-selected (documented + tested). Multiple candidates without an
   * explicit pathId require PATH_SELECTION_REQUIRED.
   */
  pathId?: string | null;
  instrumentKey?: string | null;
  /** Optional attributed usage for RESTORE_CAPACITY (debt repayment). */
  restoreUsageId?: string | null;
}

export interface VerifiedSimulateResult {
  certified: CertifiedTransactionAttempt;
  pathEnumeration: ReturnType<typeof enumerateCertifiedPaths>;
  selectedPathId: string | null;
  selectedPath: SelectedPath | null;
  transaction: HypotheticalTransaction | null;
  /**
   * Affirmative verified transaction permission. True only when every required
   * authority and selected-path gate has actually passed (see
   * `isAffirmativelyExecutable`). Capacity EXECUTED alone is never sufficient.
   */
  executable: boolean;
  refusalSummary: string[];
  /** True when a unique eligible candidate was chosen because no pathId was supplied. */
  pathAutoSelected: boolean;
}

/** Path selection lives in a prisma-free module so it is unit-testable. */
export { selectEnumeratedPath };
export type { PathSelectionResult } from "./path-selection";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type SimulateInputValidation =
  | { ok: true; amountDollars: string; evaluationDate: string }
  | { ok: false; blockers: string[] };

/**
 * Reject nonfinite / negative amounts and malformed calendar dates before any
 * verified transaction is built. Amounts must convert to whole USD dollars
 * without silent rounding drift (no second numerical engine — integer dollars
 * as decimal strings, same as Phase 4A MONEY).
 */
export function validateVerifiedSimulateInputs(args: {
  amountMillions: number;
  evaluationDate: string;
}): SimulateInputValidation {
  const blockers: string[] = [];
  const millions = args.amountMillions;
  if (typeof millions !== "number" || !Number.isFinite(millions)) {
    blockers.push("INVALID_AMOUNT_NONFINITE");
  } else if (millions < 0) {
    blockers.push("INVALID_AMOUNT_NEGATIVE");
  } else {
    // Exact integer-dollar conversion: reject values that cannot be represented
    // as whole USD without rounding (e.g. fractional cents after ×1e6).
    const dollars = millions * 1_000_000;
    if (!Number.isFinite(dollars) || !Number.isSafeInteger(Math.round(dollars))) {
      blockers.push("INVALID_AMOUNT_UNSAFE");
    } else if (Math.abs(dollars - Math.round(dollars)) > 1e-9) {
      blockers.push("INVALID_AMOUNT_PRECISION");
    }
  }

  const date = args.evaluationDate?.trim() ?? "";
  if (date === "") {
    blockers.push("MISSING_EVALUATION_DATE");
  }
  const m = ISO_DATE_RE.exec(date);
  if (date !== "" && !m) {
    blockers.push("INVALID_EVALUATION_DATE");
  } else if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== mo - 1 ||
      dt.getUTCDate() !== d
    ) {
      blockers.push("INVALID_EVALUATION_DATE");
    }
  }

  if (blockers.length > 0) return { ok: false, blockers };

  const dollars = Math.round(millions * 1_000_000);
  return {
    ok: true,
    amountDollars: String(dollars),
    evaluationDate: date,
  };
}

/** Consume-transaction builder lives in a prisma-free module so it is unit-testable. */
export { buildConsumeTransaction };

/**
 * Affirmative EXECUTABLE criteria. Capacity evaluation EXECUTED is necessary
 * but never sufficient. Phase 4D wrapper outcome EXECUTED is necessary but
 * never sufficient without SIMULATED + SATISFIED selected-path semantics.
 *
 * REVIEW_REQUIRED / INSUFFICIENT_CAPACITY / NOT_SATISFIED are never EXECUTABLE.
 * Technical simulation success ≠ legal approval (authorityNote still discloses).
 */
export function isAffirmativelyExecutable(args: {
  verifiedPackage: VerifiedExecutionPackage | null | undefined;
  selectedPathId: string | null;
  selectedPath: SelectedPath | null;
  transaction: HypotheticalTransaction | null;
  certified: CertifiedTransactionAttempt;
  pathSelectionError: string | null;
  inputBlockers?: string[];
}): boolean {
  if (args.inputBlockers && args.inputBlockers.length > 0) return false;
  if (!args.verifiedPackage) return false;
  if (args.pathSelectionError) return false;
  if (!args.selectedPathId || !args.selectedPath || !args.transaction) return false;
  if (args.certified.blockers.length > 0) return false;
  if (!args.certified.verifiedPackagePresent) return false;
  if (args.certified.capacity?.outcome !== "EXECUTED") return false;
  const simWrapper = args.certified.simulation;
  if (!simWrapper || simWrapper.outcome !== "EXECUTED") return false;
  const sim = simWrapper.simulation;
  if (sim.simulationStatus !== "SIMULATED") return false;
  // REVIEW_REQUIRED / INSUFFICIENT_CAPACITY / NOT_SATISFIED are never EXECUTABLE.
  if (sim.selectedPathResult !== "SATISFIED") return false;
  return true;
}

/** Compact product-facing summary for Simulate / Ask UI. */
export function summarizeVerifiedSimulate(result: VerifiedSimulateResult): {
  executable: boolean;
  blockers: string[];
  authorityNote: string;
  selectedPathId: string | null;
  capacityOutcome: string | null;
  simulationOutcome: string | null;
  simulationStatus: string | null;
  selectedPathResult: string | null;
  pathCandidateCount: number;
  pathAutoSelected: boolean;
  /** Capacity ran but transaction is not affirmatively permitted. */
  capacityExecutedWithoutPermission: boolean;
} {
  const capacityOutcome = result.certified.capacity?.outcome ?? null;
  const simWrapper = result.certified.simulation;
  const simulationOutcome = simWrapper?.outcome ?? null;
  const simulationStatus =
    simWrapper && simWrapper.outcome === "EXECUTED"
      ? simWrapper.simulation.simulationStatus
      : null;
  const selectedPathResult =
    simWrapper && simWrapper.outcome === "EXECUTED"
      ? simWrapper.simulation.selectedPathResult
      : null;
  return {
    executable: result.executable,
    blockers: result.refusalSummary,
    authorityNote: result.certified.authorityNote,
    selectedPathId: result.selectedPathId,
    capacityOutcome,
    simulationOutcome,
    simulationStatus,
    selectedPathResult,
    pathCandidateCount: result.pathEnumeration.paths.filter(
      (p) => p.status === "CANDIDATE" && p.permission.hasCapacityExpression,
    ).length,
    pathAutoSelected: result.pathAutoSelected,
    capacityExecutedWithoutPermission:
      !result.executable && capacityOutcome === "EXECUTED",
  };
}

/**
 * Attempt verified capacity (+ optional 4D simulate when a supportable path is selected).
 * Without VEP: returns precise blockers; never upgrades LEGACY to CERTIFIED.
 */
export async function attemptVerifiedSimulate(args: VerifiedSimulateRequest): Promise<VerifiedSimulateResult> {
  const inputValidation = validateVerifiedSimulateInputs({
    amountMillions: args.amountMillions,
    evaluationDate: args.evaluationDate,
  });
  const inputBlockers = inputValidation.ok ? [] : inputValidation.blockers;

  const emptyEnumeration = (reasons?: string[]): ReturnType<typeof enumerateCertifiedPaths> => ({
    authority: "NOT_CERTIFIED_4E",
    transactionKind: args.kind,
    secured: args.secured ?? null,
    paths: [],
    stackingAssumed: false,
    incompleteReasons: reasons ?? (inputBlockers.length > 0 ? [...inputBlockers] : ["NO_VERIFIED_EXECUTION_PACKAGE"]),
    unsupportedReasons: [],
    note: "Enumeration skipped — inputs invalid or verified package absent.",
  });

  // Rule 61: a VEP bound to a different company must never be
  // evaluated — its rules would govern this company's
  // transaction while this company's financials/ledger feed
  // the inputs. Fail closed BEFORE enumeration so foreign path
  // labels/ruleIds never leak into the result either.
  if (args.verifiedPackage && args.verifiedPackage.companyId !== args.companyId) {
    const certified: CertifiedTransactionAttempt = {
      companyId: args.companyId,
      evaluationDate: args.evaluationDate,
      cutoffState: "NEEDS_INPUT",
      reportingPeriodKey: null,
      approvedSnapshotId: null,
      cutoffSnapshotId: null,
      cutoffSnapshotStatus: null,
      ledgerUsageCount: 0,
      verifiedPackagePresent: true,
      capacity: null,
      simulation: null,
      blockers: ["VEP_COMPANY_MISMATCH"] as CertifiedTransactionAttempt["blockers"],
      authorityNote:
        "CERTIFIED path blocked: verified package belongs to a different company — Headroom never evaluates one company's transaction against another company's rulebook.",
    };
    return {
      certified,
      pathEnumeration: emptyEnumeration(["VEP_COMPANY_MISMATCH"]),
      selectedPathId: null,
      selectedPath: null,
      transaction: null,
      executable: false,
      refusalSummary: ["VEP_COMPANY_MISMATCH"],
      pathAutoSelected: false,
    };
  }

  // Reject malformed amount/date before path enumeration or transaction construction.
  if (!inputValidation.ok) {
    const certified: CertifiedTransactionAttempt = {
      companyId: args.companyId,
      evaluationDate: args.evaluationDate,
      cutoffState: "NEEDS_INPUT",
      reportingPeriodKey: null,
      approvedSnapshotId: null,
      cutoffSnapshotId: null,
      cutoffSnapshotStatus: null,
      ledgerUsageCount: 0,
      verifiedPackagePresent: Boolean(args.verifiedPackage),
      capacity: null,
      simulation: null,
      blockers: !args.verifiedPackage
        ? (["NO_VERIFIED_EXECUTION_PACKAGE"] as CertifiedTransactionAttempt["blockers"])
        : [],
      authorityNote:
        "CERTIFIED path blocked: invalid amount or evaluation date — Headroom does not coerce malformed inputs.",
    };
    // Surface both input defects and missing VEP — never upgrade to executable.
    const refusalSummary = [
      ...inputBlockers,
      !args.verifiedPackage ? "NO_VERIFIED_EXECUTION_PACKAGE" : null,
    ].filter((x): x is string => Boolean(x));
    return {
      certified,
      pathEnumeration: emptyEnumeration(),
      selectedPathId: null,
      selectedPath: null,
      transaction: null,
      executable: false,
      refusalSummary: [...new Set(refusalSummary)],
      pathAutoSelected: false,
    };
  }

  const pathEnumeration = enumerateCertifiedPaths({
    verifiedPackage: args.verifiedPackage ?? null,
    transactionKind: args.kind,
    secured: args.secured,
  });

  // Neutral enumeration: CANDIDATE + capacity expression = eligible for selection.
  const candidates = pathEnumeration.paths.filter(
    (p) => p.status === "CANDIDATE" && p.permission.hasCapacityExpression,
  );
  const selection = selectEnumeratedPath(candidates, args.pathId);
  const chosen = selection.chosen;

  let transaction: HypotheticalTransaction | null = null;
  let selectedPath: SelectedPath | null = null;
  let selectedPathId: string | null = null;

  if (args.verifiedPackage && chosen && !selection.error) {
    const instrumentKey =
      args.instrumentKey ??
      args.verifiedPackage.instrumentKey ??
      "unknown-instrument";
    const built = buildConsumeTransaction({
      companyId: args.companyId,
      instrumentKey,
      evaluationDate: inputValidation.evaluationDate,
      amountDollars: inputValidation.amountDollars,
      ruleId: chosen.ruleId,
      label: `Unified simulate ${args.kind} $${args.amountMillions}M via ${chosen.label}`,
      restoreUsageId: args.restoreUsageId,
    });
    transaction = built.transaction;
    selectedPath = built.selectedPath;
    selectedPathId = chosen.pathId;
  }

  // Fail closed without Prisma when VEP absent or path identity fails closed.
  const skipCertifiedCall = !args.verifiedPackage || Boolean(selection.error);

  const certified: CertifiedTransactionAttempt = skipCertifiedCall
    ? {
        companyId: args.companyId,
        evaluationDate: args.evaluationDate,
        cutoffState: "NEEDS_INPUT",
        reportingPeriodKey: null,
        approvedSnapshotId: null,
        cutoffSnapshotId: null,
        cutoffSnapshotStatus: null,
        ledgerUsageCount: 0,
        verifiedPackagePresent: Boolean(args.verifiedPackage),
        capacity: null,
        simulation: null,
        blockers: !args.verifiedPackage
          ? (["NO_VERIFIED_EXECUTION_PACKAGE"] as CertifiedTransactionAttempt["blockers"])
          : [],
        authorityNote: !args.verifiedPackage
          ? "CERTIFIED Phase 4A–4D path not executable. Numerical capacity remains withheld. LEGACY_ENGINE_MULTIPATH / NOT_CERTIFIED_4E must not be presented as certified."
          : `CERTIFIED path blocked: ${selection.error}. Exact path identity required — no silent substitute.`,
      }
    : await attemptCertifiedTransaction({
        companyId: args.companyId,
        evaluationDate: args.evaluationDate,
        verifiedPackage: args.verifiedPackage ?? null,
        transaction: transaction ?? undefined,
        selectedPath: selectedPath ?? undefined,
      });

  const refusalSummary = [
    ...certified.blockers,
    ...(certified.capacity?.outcome === "REFUSED"
      ? certified.capacity.refusals.map((r) => r.code)
      : []),
    ...(certified.simulation && certified.simulation.outcome === "REFUSED"
      ? ["SIMULATION_REFUSED"]
      : []),
    ...(certified.simulation &&
    certified.simulation.outcome === "EXECUTED" &&
    certified.simulation.simulation.selectedPathResult !== "SATISFIED"
      ? [`SELECTED_PATH_${certified.simulation.simulation.selectedPathResult}`]
      : []),
    ...(certified.simulation &&
    certified.simulation.outcome === "EXECUTED" &&
    certified.simulation.simulation.simulationStatus !== "SIMULATED"
      ? [`SIMULATION_STATUS_${certified.simulation.simulation.simulationStatus}`]
      : []),
    !args.verifiedPackage ? "NO_VERIFIED_EXECUTION_PACKAGE" : null,
    selection.error,
    args.verifiedPackage && !transaction && chosen && !selection.error
      ? "TRANSACTION_NOT_CONSTRUCTED"
      : null,
  ].filter((x): x is string => Boolean(x));

  const executable = isAffirmativelyExecutable({
    verifiedPackage: args.verifiedPackage,
    selectedPathId,
    selectedPath,
    transaction,
    certified,
    pathSelectionError: selection.error,
    inputBlockers: [],
  });

  return {
    certified,
    pathEnumeration,
    selectedPathId,
    selectedPath,
    transaction,
    executable,
    refusalSummary: [...new Set(refusalSummary)],
    pathAutoSelected: selection.autoSelected,
  };
}
