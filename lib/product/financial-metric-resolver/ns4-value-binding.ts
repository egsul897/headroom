/**
 * Bind published financial facts to exact NS-4 APPROVED snapshot inputs.
 *
 * Structural snapshot validation alone never confers APPROVED_SNAPSHOT on a
 * published number. Each EBITDA / debt / cash / secured / interest value must
 * trace to a MONEY input with matching metric key, unit, period, as-of,
 * sourceVersion, and snapshot identity — otherwise the fact retains the
 * package baseline authority (PROVISIONAL_RECONSTRUCTION / SYNTHETIC_LABELED).
 */

import type { FinancialInput, FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";
import type { RegisteredFinancialPackage } from "./registry";
import type { FinancialEvidenceAuthority } from "./types";

/** Canonical fact keys published by the resolver. */
export type PublishedFactKey =
  | "contractual_ebitda"
  | "total_debt"
  | "secured_debt"
  | "cash"
  | "interest_expense";

export const PUBLISHED_FACT_KEYS: readonly PublishedFactKey[] = [
  "contractual_ebitda",
  "total_debt",
  "secured_debt",
  "cash",
  "interest_expense",
] as const;

/** Metric-key patterns that may bind to each published fact (identity.key or displayName). */
const FACT_KEY_MATCHERS: Record<PublishedFactKey, RegExp> = {
  contractual_ebitda: /^(consolidated\s+ebitda|compliance\s+certificate\s+consolidated\s+ebitda|covenant\s+ebitda)$/i,
  total_debt: /^(consolidated\s+total\s+debt|total\s+debt|total\s+indebtedness)$/i,
  secured_debt: /^(consolidated\s+secured\s+debt|secured\s+debt)$/i,
  cash: /^(unrestricted\s+cash|cash)$/i,
  interest_expense: /^(consolidated\s+interest\s+expense|interest\s+expense)$/i,
};

export interface ApprovedValueProvenance {
  snapshotId: string;
  snapshotVersion: string;
  metricKey: string;
  sourceVersion: string;
  period: string;
  asOf: string;
  unit: "USD_MILLIONS";
  currency: "USD";
}

export type FactBindingResult =
  | {
      factKey: PublishedFactKey;
      bound: true;
      valueMillions: number;
      evidenceAuthority: "APPROVED_SNAPSHOT";
      provenance: ApprovedValueProvenance;
    }
  | {
      factKey: PublishedFactKey;
      bound: false;
      reasons: string[];
    };

function periodText(inp: FinancialInput): string | null {
  const p = inp.identity.period;
  if (p.kind === "EXACT_PERIOD_ID") return p.periodId;
  if (p.kind === "VERBATIM_CONTRACT_PERIOD_KEY") return p.key;
  if (p.kind === "TRAILING_PERIOD") return p.spec;
  return null;
}

function asOfText(inp: FinancialInput): string | null {
  const a = inp.identity.asOf;
  if (a.kind === "EXACT_DATE") return a.isoDate;
  if (a.kind === "VERBATIM_CONTRACT_AS_OF_KEY") return a.key;
  return null;
}

function moneyMillionsFromInput(inp: FinancialInput): { ok: true; millions: number } | { ok: false; reason: string } {
  if (inp.identity.valueType !== "MONEY" || inp.value.type !== "MONEY") {
    return { ok: false, reason: `unit/type mismatch: expected MONEY, got identity=${inp.identity.valueType} value=${inp.value.type}` };
  }
  if ((inp.identity.currency ?? inp.value.currency) !== "USD") {
    return {
      ok: false,
      reason: `currency mismatch: expected USD, got ${inp.identity.currency ?? inp.value.currency}`,
    };
  }
  if (inp.value.currency !== "USD") {
    return { ok: false, reason: `value currency mismatch: expected USD, got ${inp.value.currency}` };
  }
  const dollars = Number(inp.value.amount.num) / Number(inp.value.amount.den);
  if (!Number.isFinite(dollars)) {
    return { ok: false, reason: "non-finite MONEY amount" };
  }
  return { ok: true, millions: dollars / 1_000_000 };
}

function findCandidateInputs(snap: FinancialSnapshot, factKey: PublishedFactKey): FinancialInput[] {
  const re = FACT_KEY_MATCHERS[factKey];
  return snap.inputs.filter(
    (inp) => re.test(inp.identity.key) || (inp.displayName != null && re.test(inp.displayName)),
  );
}

/**
 * Attempt to bind one published fact to an exact NS-4 APPROVED snapshot input.
 * Does not compare against package registry figures — binding is snapshot-identity only.
 */
export function bindApprovedFact(
  snap: FinancialSnapshot,
  pkg: RegisteredFinancialPackage,
  factKey: PublishedFactKey,
): FactBindingResult {
  const candidates = findCandidateInputs(snap, factKey);
  if (candidates.length === 0) {
    return { factKey, bound: false, reasons: [`missing approved input for ${factKey}`] };
  }
  if (candidates.length > 1) {
    return {
      factKey,
      bound: false,
      reasons: [`ambiguous approved inputs for ${factKey}: ${candidates.map((c) => c.identity.key).join(", ")}`],
    };
  }
  const inp = candidates[0]!;
  const reasons: string[] = [];

  if (!snap.snapshotId?.trim()) reasons.push("snapshot identity missing");
  if (!snap.version?.trim()) reasons.push("snapshot version missing");
  if (snap.status === "SUPERSEDED") reasons.push("snapshot is SUPERSEDED (stale)");
  if (snap.status !== "APPROVED") reasons.push(`snapshot status is ${snap.status}, not APPROVED`);

  const sourceVersion = inp.sourceVersion?.trim() ?? "";
  if (!sourceVersion) {
    reasons.push("sourceVersion missing on approved input — cannot bind");
  }

  const period = periodText(inp);
  if (period == null) {
    reasons.push("period not bound on input (NOT_PERIOD_SPECIFIC refuses APPROVED binding)");
  } else if (period !== pkg.measurementPeriod) {
    reasons.push(`period mismatch: input=${period} vs package=${pkg.measurementPeriod}`);
  }

  const asOf = asOfText(inp);
  if (asOf == null) {
    reasons.push("as-of not bound on input (NOT_AS_OF_SPECIFIC refuses APPROVED binding)");
  } else if (asOf !== pkg.asOf) {
    reasons.push(`as-of mismatch: input=${asOf} vs package=${pkg.asOf}`);
  }

  if (inp.identity.companyId !== pkg.companyId) {
    reasons.push(`company mismatch on input: ${inp.identity.companyId}`);
  }

  const money = moneyMillionsFromInput(inp);
  if (!money.ok) reasons.push(money.reason);

  if (reasons.length > 0 || !money.ok) {
    return { factKey, bound: false, reasons };
  }

  return {
    factKey,
    bound: true,
    valueMillions: money.millions,
    evidenceAuthority: "APPROVED_SNAPSHOT",
    provenance: {
      snapshotId: snap.snapshotId,
      snapshotVersion: snap.version,
      metricKey: inp.identity.key,
      sourceVersion,
      period: period!,
      asOf: asOf!,
      unit: "USD_MILLIONS",
      currency: "USD",
    },
  };
}

export interface PublishedFactPlan {
  factKey: PublishedFactKey;
  label: string;
  /** Value published for capacity / runtime metrics. */
  valueMillions: number | null;
  evidenceAuthority: FinancialEvidenceAuthority;
  readiness: "AVAILABLE_VERIFIED" | "AVAILABLE_UNVERIFIED" | "MISSING" | "STALE";
  sourceCitation: string;
  provenance: ApprovedValueProvenance | null;
  bindingReasons: string[];
}

const LABELS: Record<PublishedFactKey, string> = {
  contractual_ebitda: "Consolidated EBITDA (contractual)",
  total_debt: "Consolidated Total Debt",
  secured_debt: "Consolidated Secured Debt",
  cash: "Unrestricted Cash",
  interest_expense: "Consolidated Interest Expense",
};

/**
 * Plan published facts: approved-bound values come from the snapshot; unbound
 * facts fall back to package/computed figures with baseline authority only.
 */
export function planPublishedFacts(args: {
  pkg: RegisteredFinancialPackage;
  /** Package/Phase-4A computed fallbacks (never auto-labeled APPROVED). */
  fallbacks: Record<PublishedFactKey, number | null>;
  baselineAuthority: FinancialEvidenceAuthority;
  approvedNs4Snapshot?: FinancialSnapshot | null;
  /** Structural gate already passed (status/reviewer/scope). */
  structuralOk: boolean;
}): { facts: PublishedFactPlan[]; notes: string[]; allCapacityFactsApproved: boolean } {
  const notes: string[] = [];
  const facts: PublishedFactPlan[] = [];

  for (const factKey of PUBLISHED_FACT_KEYS) {
    const fallback = args.fallbacks[factKey];
    const citationBase = `${args.pkg.sourceDocumentId} / ${factKey}`;

    if (!args.approvedNs4Snapshot || !args.structuralOk) {
      facts.push({
        factKey,
        label: LABELS[factKey],
        valueMillions: fallback,
        evidenceAuthority: args.baselineAuthority,
        readiness: fallback == null ? "MISSING" : "AVAILABLE_UNVERIFIED",
        sourceCitation:
          factKey === "contractual_ebitda"
            ? args.pkg.ebitdaEvidence.definitionCitation
            : citationBase,
        provenance: null,
        bindingReasons: args.approvedNs4Snapshot
          ? ["structural NS-4 validation failed — package figures retained as provisional"]
          : ["no approvedNs4Snapshot — package/computed figures only"],
      });
      continue;
    }

    const binding = bindApprovedFact(args.approvedNs4Snapshot, args.pkg, factKey);
    if (binding.bound) {
      facts.push({
        factKey,
        label: LABELS[factKey],
        valueMillions: binding.valueMillions,
        evidenceAuthority: "APPROVED_SNAPSHOT",
        readiness: "AVAILABLE_VERIFIED",
        sourceCitation: `NS-4 ${binding.provenance.snapshotId} / ${binding.provenance.metricKey} @ ${binding.provenance.sourceVersion}`,
        provenance: binding.provenance,
        bindingReasons: [],
      });
      // Disagreement disclosure — package figure not used for APPROVED publication
      if (
        fallback != null &&
        Number.isFinite(fallback) &&
        Math.abs(fallback - binding.valueMillions) > 0.0005
      ) {
        notes.push(
          `${factKey}: approved snapshot value ${binding.valueMillions} ≠ package/computed ${fallback} — publishing approved-bound value only`,
        );
      }
    } else {
      const stale = binding.reasons.some((r) => /stale|SUPERSEDED/i.test(r));
      facts.push({
        factKey,
        label: LABELS[factKey],
        valueMillions: fallback,
        evidenceAuthority: args.baselineAuthority,
        readiness: fallback == null ? "MISSING" : stale ? "STALE" : "AVAILABLE_UNVERIFIED",
        sourceCitation:
          factKey === "contractual_ebitda"
            ? args.pkg.ebitdaEvidence.definitionCitation
            : citationBase,
        provenance: null,
        bindingReasons: binding.reasons,
      });
      notes.push(
        `${factKey}: not approved-bound (${binding.reasons.join("; ")}) — retaining ${args.baselineAuthority}`,
      );
    }
  }

  const allCapacityFactsApproved = facts.every(
    (f) => f.evidenceAuthority === "APPROVED_SNAPSHOT" && f.valueMillions != null,
  );

  return { facts, notes, allCapacityFactsApproved };
}
