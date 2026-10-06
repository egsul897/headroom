/**
 * NS-4 slice 2 — 4C ledger proposal recorder.
 *
 * Basket-usage schedule lines from certificates are RECORDED here only.
 * They are never applied into capacity truth, never become snapshot facts.
 */
import type { BasketUsageScheduleLine, CertificateProposer, LedgerProposal } from "./types";

let proposalSeq = 0;

function nextProposalId(): string {
  proposalSeq += 1;
  return `ledger-prop-${proposalSeq}-${Date.now()}`;
}

export interface RecordBasketUsageArgs {
  sourceDocumentId: string;
  sourceVersionHash: string;
  companyId: string;
  line: BasketUsageScheduleLine;
  proposer: CertificateProposer;
  recordedAt?: string;
}

/**
 * In-memory append-only recorder for ledger proposals.
 * Public surface exposes only `record` / `list` / `count` / `apply` (throws) —
 * NOT `clear` / `reset` / `truncate` or any other shrink/empty helper.
 * Isolation in tests is via a fresh `new LedgerProposalRecorder()` per case.
 */
export class LedgerProposalRecorder {
  readonly #proposals: LedgerProposal[] = [];

  /** Record a basket-usage line as a PROPOSAL. Never applies. */
  record(args: RecordBasketUsageArgs): LedgerProposal {
    const proposal: LedgerProposal = {
      proposalId: nextProposalId(),
      recordedAt: args.recordedAt ?? new Date().toISOString(),
      sourceDocumentId: args.sourceDocumentId,
      sourceVersionHash: args.sourceVersionHash,
      companyId: args.companyId,
      line: structuredClone(args.line),
      status: "RECORDED",
      proposer: { ...args.proposer },
    };
    this.#proposals.push(proposal);
    return structuredClone(proposal);
  }

  /** Deep-cloned list of recorded proposals (append-only growth). */
  list(): readonly LedgerProposal[] {
    return Object.freeze(this.#proposals.map((p) => structuredClone(p)));
  }

  /** Count of recorded proposals. */
  count(): number {
    return this.#proposals.length;
  }

  /**
   * Soft-gate guard: there is no apply path on this type.
   * Kept as an explicit refusal so callers cannot invent an apply by name.
   */
  apply(_proposalId: string): never {
    throw new Error(
      "LedgerProposalRecorder: apply is out of scope for NS-4 slice 2 — proposals are recorded only, never applied into capacity truth",
    );
  }
}
