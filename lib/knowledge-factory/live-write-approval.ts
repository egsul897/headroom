/**
 * Live-write approval reference.
 *
 * A live Neon write (bulk precedent import, SEC batch persist, derived-export import) needs two
 * independent things: the operator's live-write token (an intent to run) and a committed,
 * owner-attributable approval record (the authority to run). The token alone is not evidence of
 * approval — docs/knowledge-factory/mass-precedent/approval-reconciliation-2026-10-09.md records
 * why. The record is a file under docs/knowledge-factory/approvals/ named by
 * KF_LIVE_WRITE_APPROVAL_REF; it must name the approver, the time, the target environment, the
 * scope and the operations it covers. This module never fabricates one and never reads approval
 * from the fact that a script ran.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Environment lookup; a plain record so tests can pass literals. */
export type EnvLike = Readonly<Record<string, string | undefined>>;

export const LIVE_WRITE_APPROVAL_REF_ENV = "KF_LIVE_WRITE_APPROVAL_REF";
export const APPROVALS_DIR = "docs/knowledge-factory/approvals";

export type LiveWriteOperation =
  | "prisma-migrate-deploy"
  | "consolidation-import"
  | "mass-precedent-import"
  | "mass-precedent-sec-batch"
  | "derived-export-import";

export interface LiveWriteApprovalRecord {
  ref: string;
  approvedBy: string;
  approvedAt: string;
  environment: string;
  scope: string;
  operations: LiveWriteOperation[];
}

const REQUIRED = ["approvedBy", "approvedAt", "environment", "scope", "operations"] as const;

function parseRecord(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([a-zA-Z]+):\s*(.+?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

/**
 * Loads and validates the approval record the environment names. Throws with a precise reason
 * when it is absent, outside the approvals directory, malformed, or does not cover `operation`.
 */
export function assertLiveWriteApproval(params: { operation: LiveWriteOperation; repoRoot?: string; env?: EnvLike }): LiveWriteApprovalRecord {
  const env = params.env ?? process.env;
  const repoRoot = params.repoRoot ?? process.cwd();
  const ref = env[LIVE_WRITE_APPROVAL_REF_ENV];
  if (!ref || !ref.trim()) {
    throw new Error(
      `Live write refused: ${LIVE_WRITE_APPROVAL_REF_ENV} must name a committed approval record under ${APPROVALS_DIR}/ covering "${params.operation}". The live-write token alone is not approval.`,
    );
  }
  const approvalsRoot = path.resolve(repoRoot, APPROVALS_DIR);
  const abs = path.resolve(repoRoot, ref);
  if (!abs.startsWith(approvalsRoot + path.sep)) {
    throw new Error(`Live write refused: approval record "${ref}" is not under ${APPROVALS_DIR}/.`);
  }
  if (!existsSync(abs)) throw new Error(`Live write refused: approval record "${ref}" does not exist.`);
  const fields = parseRecord(readFileSync(abs, "utf8"));
  for (const key of REQUIRED) {
    if (!fields[key]) throw new Error(`Live write refused: approval record "${ref}" lacks "${key}".`);
  }
  if (Number.isNaN(Date.parse(fields.approvedAt!))) {
    throw new Error(`Live write refused: approval record "${ref}" has a non-ISO approvedAt.`);
  }
  const operations = fields.operations!.split(/[,\s]+/).filter(Boolean) as LiveWriteOperation[];
  if (!operations.includes(params.operation)) {
    throw new Error(`Live write refused: approval record "${ref}" does not cover "${params.operation}" (covers: ${operations.join(", ") || "none"}).`);
  }
  return {
    ref,
    approvedBy: fields.approvedBy!,
    approvedAt: fields.approvedAt!,
    environment: fields.environment!,
    scope: fields.scope!,
    operations,
  };
}
