/**
 * Pure CONSUME_CAPACITY / RESTORE_CAPACITY transaction builder for
 * verified simulate. Kept free of prisma / certified-transaction
 * imports so it is unit-testable in isolation.
 */
import type {
  HypotheticalTransaction,
  SelectedPath,
} from "@/lib/contract-model/verified-execution";

function moneyCapNode(ruleId: string): string {
  return `capacity:rule:${ruleId}`;
}

/** Deterministic FNV-1a 64-bit hex (identity disambiguation, not crypto). */
function fnv1aHex(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < input.length; i += 1) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * Build CONSUME_CAPACITY hypothetical for a single selected rule path.
 * Debt repayment uses RESTORE_CAPACITY only when an attributed usageId is supplied.
 *
 * The derived transactionId is capped at 120 chars WITHOUT dropping
 * the distinguishing suffix: when the readable form would exceed
 * the cap, the id becomes `ask-sim-<hash-of-full-string>` so two
 * different amounts can never collide under truncation.
 */
export function buildConsumeTransaction(args: {
  companyId: string;
  instrumentKey: string;
  evaluationDate: string;
  /** Whole USD dollars as decimal string (Phase 4A MONEY). */
  amountDollars: string;
  ruleId: string;
  label: string;
  /** When set, emit RESTORE_CAPACITY (debt repayment) instead of CONSUME. */
  restoreUsageId?: string | null;
  /** Optional stable transaction identity for replay; defaults to derived id. */
  transactionId?: string;
}): { transaction: HypotheticalTransaction; selectedPath: SelectedPath } {
  const nodeId = moneyCapNode(args.ruleId);
  const amount = args.amountDollars;
  const effects = args.restoreUsageId
    ? [
        {
          effectId: "e-restore-1",
          kind: "RESTORE_CAPACITY" as const,
          usageId: args.restoreUsageId,
          reason: "Debt repayment / capacity restore (caller-supplied usage)",
        },
      ]
    : [
        {
          effectId: "e-consume-1",
          kind: "CONSUME_CAPACITY" as const,
          capacityNodeId: nodeId,
          amount: { type: "MONEY" as const, amount, currency: "USD" },
        },
      ];
  const raw = `ask-sim-${args.companyId}-${args.evaluationDate}-${args.ruleId}-${amount}`;
  const transactionId =
    args.transactionId ?? (raw.length <= 120 ? raw : `ask-sim-${fnv1aHex(raw)}`);
  const transaction: HypotheticalTransaction = {
    transactionId,
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    effectiveAsOf: args.evaluationDate,
    category: null,
    label: args.label,
    intendedAmount: { type: "MONEY", amount, currency: "USD" },
    effects,
    provenance: {
      source: "unified-position certified-simulate-bridge",
      sourceVersion: "1",
      approvalRef: null,
    },
  };
  const selectedPath: SelectedPath = {
    capacityNodeIds: [nodeId],
    ruleIds: [args.ruleId],
    sharedCapacityIds: [],
    reclassificationElectionIds: [],
  };
  return { transaction, selectedPath };
}
