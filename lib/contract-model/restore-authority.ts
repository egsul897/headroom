/**
 * Shared restore-authority gate for product / verified execution.
 *
 * Phase 4D `simulateTransaction` remains ungated (compositional primitive; existing tests).
 * Every product and verified entry that may restore capacity must call this first.
 *
 * Authority is carried in the restore effect reason as `[authority:<ref>]`, produced by
 * product recipes from an explicit `contractualAuthorityRef`. Bare restores are refused.
 */
import type { HypotheticalTransaction, TransactionEffect } from "./runtime/transaction/types";

export const RESTORE_AUTHORITY_PATTERN = /\[authority:([^\]]+)\]/;

export const UNAUTHORIZED_RESTORE_CODE = "UNAUTHORIZED_CAPACITY_RESTORE" as const;

export interface RestoreAuthorityIssue {
  code: typeof UNAUTHORIZED_RESTORE_CODE;
  effectId: string;
  usageId: string;
  message: string;
}

export function formatRestoreReason(reason: string, contractualAuthorityRef: string): string {
  const ref = contractualAuthorityRef.trim();
  if (!ref) throw new Error("contractualAuthorityRef must be non-empty");
  const base = reason.replace(RESTORE_AUTHORITY_PATTERN, "").trim();
  return `${base} [authority:${ref}]`;
}

export function extractRestoreAuthority(reason: string): string | null {
  const m = reason.match(RESTORE_AUTHORITY_PATTERN);
  const ref = m?.[1]?.trim();
  return ref && ref.length > 0 ? ref : null;
}

export function collectUnauthorizedRestores(
  effects: readonly TransactionEffect[],
): RestoreAuthorityIssue[] {
  const issues: RestoreAuthorityIssue[] = [];
  for (const e of effects) {
    if (e.kind !== "RESTORE_CAPACITY") continue;
    if (extractRestoreAuthority(e.reason)) continue;
    issues.push({
      code: UNAUTHORIZED_RESTORE_CODE,
      effectId: e.effectId,
      usageId: e.usageId,
      message:
        `RESTORE_CAPACITY effect ${e.effectId} on usage ${e.usageId} lacks contractual authority ` +
        `(expected reason to contain [authority:<ref>]); capacity is not restored without authority`,
    });
  }
  return issues.sort((a, b) => (`${a.effectId}|${a.usageId}` < `${b.effectId}|${b.usageId}` ? -1 : 1));
}

export function assertRestoreAuthority(
  transaction: HypotheticalTransaction,
): { ok: true } | { ok: false; issues: RestoreAuthorityIssue[] } {
  const issues = collectUnauthorizedRestores(transaction.effects);
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
