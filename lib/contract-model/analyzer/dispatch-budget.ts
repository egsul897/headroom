/**
 * A hard budget enforced BEFORE every provider request, inside the compiler - not a harness
 * reservation checked after control returns. The caller reserves the maximum cost of the request it
 * is about to send (planned input tokens at the input rate + the full max_tokens at the output
 * rate); the budget refuses if committed + outstanding + that maximum would exceed the ceiling, and
 * settles the reservation to the exact priced usage when the response arrives (retaining it in full
 * when billing is unknown). Call counts are limited the same way: the budget knows how many
 * conversations the policy allows and refuses the (N+1)th before it is sent.
 */
import { maxCostOfRequestUsd, priceUsage, type PriceableUsage } from "./pricing";

export interface DispatchEstimate { stage: string; model: string; maxInputTokens: number; maxOutputTokens: number }

export interface DispatchTicket { id: string; stage: string; model: string; reservedUsd: number; reservedAt: string }

export type SettlementStatus = "EXACT" | "UNKNOWN_RETAINED" | "REFUSED_NO_COST";

export interface DispatchBudget {
  /** Throws BudgetRefusedError when the request must not be sent. */
  reserve(estimate: DispatchEstimate): DispatchTicket;
  settle(ticket: DispatchTicket, usage: PriceableUsage | null, status: SettlementStatus): void;
  snapshot(): DispatchBudgetSnapshot;
}

export interface DispatchBudgetSnapshot { ceilingUsd: number | null; maxCalls: number | null; calls: number; exactUsd: number; retainedUsd: number; outstandingUsd: number; committedUsd: number; refusals: { stage: string; reason: string; at: string }[] }

export class BudgetRefusedError extends Error {
  constructor(readonly reason: "HARD_CEILING" | "MAX_CALLS" | "UNPRICEABLE_MODEL", readonly detail: string, readonly snapshot: DispatchBudgetSnapshot) {
    super(`dispatch refused (${reason}): ${detail}`);
    this.name = "BudgetRefusedError";
  }
}

/** Legacy / test convenience: reserves nothing, refuses nothing, still counts. */
export class UnlimitedDispatchBudget implements DispatchBudget {
  private calls = 0;
  reserve(estimate: DispatchEstimate): DispatchTicket { this.calls++; return { id: `u${this.calls}`, stage: estimate.stage, model: estimate.model, reservedUsd: 0, reservedAt: new Date().toISOString() }; }
  settle(): void {}
  snapshot(): DispatchBudgetSnapshot { return { ceilingUsd: null, maxCalls: null, calls: this.calls, exactUsd: 0, retainedUsd: 0, outstandingUsd: 0, committedUsd: 0, refusals: [] }; }
}

export class HardDispatchBudget implements DispatchBudget {
  private calls = 0; private exact = 0; private retained = 0; private seq = 0;
  private readonly outstanding = new Map<string, number>();
  private readonly refusals: DispatchBudgetSnapshot["refusals"] = [];
  constructor(private readonly opts: { ceilingUsd: number; maxCalls: number | null; priorCommittedUsd?: number }) { this.exact = opts.priorCommittedUsd ?? 0; }
  private outstandingUsd(): number { let s = 0; for (const v of this.outstanding.values()) s += v; return s; }
  get committedUsd(): number { return Number((this.exact + this.retained + this.outstandingUsd()).toFixed(10)); }
  reserve(estimate: DispatchEstimate): DispatchTicket {
    const max = maxCostOfRequestUsd({ maxInputTokens: estimate.maxInputTokens, maxOutputTokens: estimate.maxOutputTokens }, estimate.model);
    const refuse = (reason: BudgetRefusedError["reason"], detail: string) => { this.refusals.push({ stage: estimate.stage, reason: `${reason}: ${detail}`, at: new Date().toISOString() }); throw new BudgetRefusedError(reason, detail, this.snapshot()); };
    if (max === null) refuse("UNPRICEABLE_MODEL", `no rate card for ${estimate.model}; a request whose maximum cost cannot be priced is never sent`);
    if (this.opts.maxCalls !== null && this.calls + 1 > this.opts.maxCalls) refuse("MAX_CALLS", `call ${this.calls + 1} of at most ${this.opts.maxCalls} (${estimate.stage})`);
    const would = this.committedUsd + (max as number);
    if (would > this.opts.ceilingUsd) refuse("HARD_CEILING", `committed $${this.committedUsd.toFixed(6)} + max $${(max as number).toFixed(6)} for ${estimate.stage} would be $${would.toFixed(6)} > ceiling $${this.opts.ceilingUsd.toFixed(6)}`);
    this.calls++;
    const id = `t${++this.seq}`;
    this.outstanding.set(id, max as number);
    return { id, stage: estimate.stage, model: estimate.model, reservedUsd: max as number, reservedAt: new Date().toISOString() };
  }
  settle(ticket: DispatchTicket, usage: PriceableUsage | null, status: SettlementStatus): void {
    const reserved = this.outstanding.get(ticket.id) ?? 0;
    this.outstanding.delete(ticket.id);
    if (status === "REFUSED_NO_COST") return;
    if (status === "UNKNOWN_RETAINED" || !usage) { this.retained += reserved; return; }
    const priced = priceUsage(usage, ticket.model);
    if (priced.costUsd === null) { this.retained += reserved; return; } // unpriceable actual usage: keep the reservation
    this.exact += priced.costUsd;
  }
  snapshot(): DispatchBudgetSnapshot { return { ceilingUsd: this.opts.ceilingUsd, maxCalls: this.opts.maxCalls, calls: this.calls, exactUsd: Number(this.exact.toFixed(10)), retainedUsd: Number(this.retained.toFixed(10)), outstandingUsd: Number(this.outstandingUsd().toFixed(10)), committedUsd: this.committedUsd, refusals: [...this.refusals] }; }
}
