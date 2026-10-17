/**
 * Dashboard EBITDA box: one data shape built from the agreement pipeline's EBITDA optimizer + add-back tracker, plus the
 * CFO-confirm flow that persists sourced figures and recomputes. Data only — presentation belongs to the dashboard.
 *
 * Invent-safe: every amount comes from the filings or a CFO-confirmed, sourced figure. Items whose amount is not known
 * carry null (never an estimate); "extra available" counts only known cap room on pending items, and the box says when
 * more could exist beyond it (pending items without a known bound).
 */
import type { BorrowerInput, IssuerFinancials } from "../xbrl/companyfacts";
import { capRoomTotal, rankFlags, type AddBackFlag } from "../xbrl/addback-tracker";
import type { EbitdaOptimization, LeverageCapacity } from "../xbrl/ebitda-optimizer";
import { runAgreementPipeline, type AgreementPipelineResult } from "./agreement-pipeline";
import { cfoRecompute, type CfoGain } from "./cfo-loop";

export const EBITDA_BOX_VERSION = "ebitda-box-1";

export type EbitdaBoxItemStatus = "CONFIRMED" | "EVIDENCED" | "PENDING" | "CONDITIONAL";

export interface EbitdaBoxItem {
  rank: number;
  /** Key the CFO-confirm endpoint takes (ADDBACK:<label> or ADDBACK:<label>@<position>). */
  inputKey: string;
  label: string; category: string; clause: string;
  /** CONFIRMED: CFO figure counted. EVIDENCED: filing figure counted. PENDING: needs a figure. CONDITIONAL: lender approval needed. */
  status: EbitdaBoxItemStatus;
  /** Amount counted in total EBITDA now (USD); "0" when nothing is counted. */
  counted: string;
  /** Filing (or CFO) figure for the item; null when none is known. */
  amount: string | null;
  source: Array<{ kind: "XBRL" | "CFO"; ref: string; value: string }>;
  cap: { text: string; amount: string | null; headroom: string | null; sharedWith: string[] | null } | null;
  /** What confirming this item could still add (known cap room); null when unknown or nothing. */
  potentialEbitda: string | null;
  potentialDebtCapacity: string | null;
  potentialBasis: AddBackFlag["potential"]["basis"];
  conditionText: string | null;
  note: string;
}

export interface EbitdaBox {
  version: typeof EBITDA_BOX_VERSION;
  status: "READY" | "NEEDS_FINANCIALS" | "NO_EBITDA_DEFINITION";
  term: string | null; periodEnd: string | null; cik: string | null;
  /** Supported Consolidated EBITDA now: base + deductions + counted add-backs (null when the base is not derivable). */
  totalEbitda: string | null;
  /** Set only when every add-back is evidenced and every cap determinable. */
  maximum: string | null;
  base: { concept: string; value: string } | null;
  deductions: string | null;
  confirmedAddBacks: string;
  /** Known cap room on pending (non-conditional) items: what confirming them could add at most where a cap bounds it. */
  extraAvailableIfConfirmed: string;
  /** Pending items whose possible amount has no known bound (uncapped or cap unknown): more may be available. */
  pendingUnbounded: number;
  pendingConditional: number;
  capacityImpact: {
    maxLeverage: string | null;
    leverageCapacity: string | null; leverageBound: LeverageCapacity["bound"] | null;
    /** maxLeverage × extraAvailableIfConfirmed; null without a single leverage limit. */
    extraDebtCapacityIfConfirmed: string | null;
  };
  items: EbitdaBoxItem[];
  confirmations: Array<BorrowerInput & { confirmedAt?: string | null }>;
  reason: string;
}

type Xbrl = NonNullable<AgreementPipelineResult["xbrl"]> & { ebitda?: EbitdaOptimization; leverageCapacity?: LeverageCapacity; addBackTracker?: AddBackFlag[] };

const sum = (xs: Array<string | null>) => xs.reduce((a, x) => a + (x && /^-?\d+$/.test(x) ? BigInt(x) : 0n), 0n);

/** Build the box from a pipeline result (pure). */
export function ebitdaBoxFromResult(r: AgreementPipelineResult, confirmations: readonly (BorrowerInput & { confirmedAt?: string | null })[] = []): EbitdaBox {
  const x = (r.xbrl ?? null) as Xbrl | null;
  const empty = (status: EbitdaBox["status"], reason: string): EbitdaBox => ({
    version: EBITDA_BOX_VERSION, status, term: null, periodEnd: null, cik: x?.cik ?? null, totalEbitda: null, maximum: null, base: null, deductions: null,
    confirmedAddBacks: "0", extraAvailableIfConfirmed: "0", pendingUnbounded: 0, pendingConditional: 0,
    capacityImpact: { maxLeverage: null, leverageCapacity: null, leverageBound: null, extraDebtCapacityIfConfirmed: null }, items: [], confirmations: [...confirmations], reason,
  });
  if (!x) return empty("NEEDS_FINANCIALS", "no issuer financials (company CIK / filings) available for this agreement");
  const opt = x.ebitda;
  if (!opt) return empty("NO_EBITDA_DEFINITION", x.ebitdaBaseHold ? `EBITDA definition not resolved: ${x.ebitdaBaseHold.reason} (${x.ebitdaBaseHold.missing})` : "no Consolidated EBITDA definition found in this agreement");
  const flags = rankFlags(x.addBackTracker ?? []);
  const lev = x.leverageCapacity?.maxLeverage ?? null;
  const items: EbitdaBoxItem[] = flags.map((f) => {
    const line = f.position >= 0 ? opt.addBacks[f.position] : undefined;
    const cfo = (line?.concepts ?? []).filter((c) => c.concept.startsWith("borrower:"));
    const status: EbitdaBoxItemStatus = cfo.length ? "CONFIRMED" : f.status === "CONDITIONAL" ? "CONDITIONAL" : f.status === "DETECTED" ? "EVIDENCED" : "PENDING";
    const source: EbitdaBoxItem["source"] = [
      ...cfo.map((c) => ({ kind: "CFO" as const, ref: c.concept.replace(/^borrower:/, ""), value: c.value })),
      ...f.sources.map((s) => ({ kind: "XBRL" as const, ref: `${s.concept}${s.currentPeriodEnd ? ` @ ${s.currentPeriodEnd}` : ""}`, value: s.current })),
    ];
    const pending = status === "PENDING";
    const pot = pending && f.potential.basis === "CAP_HEADROOM" && f.potential.ebitda != null && BigInt(f.potential.ebitda) > 0n;
    return {
      rank: f.rank, inputKey: f.inputKey, label: f.clause.label, category: f.category, clause: f.clause.text, status,
      counted: line?.claimed ?? f.ebitdaDelta ?? "0",
      amount: cfo.length ? cfo.reduce((a, c) => a + BigInt(c.value), 0n).toString() : f.amount,
      source,
      cap: f.cap ? { text: f.cap.text, amount: f.cap.amount, headroom: f.capHeadroom, sharedWith: f.capGroup?.labels ?? null } : null,
      potentialEbitda: pot ? f.potential.ebitda : null, potentialDebtCapacity: pot ? f.potential.debt : null, potentialBasis: f.potential.basis,
      conditionText: line?.conditionText ?? null, note: f.note,
    };
  });
  const extra = capRoomTotal(flags);
  return {
    version: EBITDA_BOX_VERSION, status: "READY", term: opt.term, periodEnd: opt.periodEnd, cik: x.cik,
    totalEbitda: opt.supported, maximum: opt.maximum, base: opt.base, deductions: opt.deductions,
    confirmedAddBacks: sum(items.filter((i) => i.status === "CONFIRMED" || i.status === "EVIDENCED").map((i) => i.counted)).toString(),
    extraAvailableIfConfirmed: extra.toString(),
    pendingUnbounded: items.filter((i) => i.status === "PENDING" && (i.potentialBasis === "UNCAPPED_NEEDS_INPUT" || i.potentialBasis === "CAP_UNKNOWN")).length,
    pendingConditional: items.filter((i) => i.status === "CONDITIONAL").length,
    capacityImpact: {
      maxLeverage: lev,
      leverageCapacity: x.leverageCapacity?.status === "COMPUTED" ? x.leverageCapacity.capacity : null,
      leverageBound: x.leverageCapacity?.bound ?? null,
      extraDebtCapacityIfConfirmed: lev && /^\d+(?:\.\d+)?$/.test(lev) ? mulFloor(lev, extra) : null,
    },
    items, confirmations: [...confirmations], reason: opt.reason,
  };
}

/** lev (decimal string) × n, floored to whole USD. */
function mulFloor(lev: string, n: bigint): string {
  const [i, f = ""] = lev.split(".");
  const den = 10n ** BigInt(f.length);
  return ((BigInt(i! + f) * n) / den).toString();
}

export type PipelineArgs = Parameters<typeof runAgreementPipeline>[0];

/** Run the pipeline with the confirmed figures applied and build the box. */
export function computeEbitdaBox(args: PipelineArgs, confirmations: readonly (BorrowerInput & { confirmedAt?: string | null })[] = []): EbitdaBox {
  const fin: IssuerFinancials | null | undefined = args.financials ? { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...confirmations.map(({ key, value, source }) => ({ key, value, source }))] } : args.financials;
  return ebitdaBoxFromResult(runAgreementPipeline({ ...args, financials: fin }), confirmations);
}

// ---------------- persistence (Neon via Prisma) ----------------

export interface EbitdaBoxStore {
  customerEbitdaBox: {
    create(args: { data: { companyId: string; documentId: string; status: string; version: string; payload: unknown } }): Promise<{ id: string }>;
    findFirst(args: { where: { companyId: string; documentId: string }; orderBy: { createdAt: "desc" } }): Promise<{ id: string; payload: unknown; createdAt: Date } | null>;
  };
  customerEbitdaConfirmation: {
    upsert(args: { where: { companyId_documentId_inputKey: { companyId: string; documentId: string; inputKey: string } }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<{ id: string }>;
    findMany(args: { where: { companyId: string; documentId: string }; orderBy: { updatedAt: "asc" } }): Promise<Array<{ inputKey: string; value: string; source: string; updatedAt: Date }>>;
  };
}

export async function saveEbitdaBox(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }, box: EbitdaBox): Promise<{ id: string }> {
  return db.customerEbitdaBox.create({ data: { ...scope, status: box.status, version: box.version, payload: JSON.parse(JSON.stringify(box)) } });
}

export async function latestEbitdaBox(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<(EbitdaBox & { savedAt: string }) | null> {
  const row = await db.customerEbitdaBox.findFirst({ where: scope, orderBy: { createdAt: "desc" } });
  return row ? { ...(row.payload as EbitdaBox), savedAt: row.createdAt.toISOString() } : null;
}

export async function loadConfirmations(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<Array<BorrowerInput & { confirmedAt: string }>> {
  const rows = await db.customerEbitdaConfirmation.findMany({ where: scope, orderBy: { updatedAt: "asc" } });
  return rows.map((r) => ({ key: r.inputKey, value: String(r.value), source: r.source, confirmedAt: r.updatedAt.toISOString() }));
}

export type ConfirmOutcome =
  | { ok: true; box: EbitdaBox; gain: CfoGain["gain"]; boxId: string }
  | { ok: false; status: 400 | 404 | 422; error: string };

/**
 * CFO confirms one item: validated against a fresh pipeline run (key must name a tracker flag, value an integer, source
 * named), persisted (latest figure per key wins), then the box is recomputed with all confirmations and saved.
 */
export async function confirmEbitdaItem(
  db: EbitdaBoxStore,
  scope: { companyId: string; documentId: string },
  args: PipelineArgs,
  input: { inputKey: string; value: string; source: string; confirmedBy?: string | null },
): Promise<ConfirmOutcome> {
  if (!input.inputKey?.trim()) return { ok: false, status: 400, error: "inputKey is required" };
  if (!/^-?\d+$/.test(String(input.value ?? ""))) return { ok: false, status: 400, error: "value must be an integer USD amount" };
  if (!input.source?.trim()) return { ok: false, status: 400, error: "source (the document the figure comes from) is required" };
  if (!args.financials) return { ok: false, status: 422, error: "no issuer financials for this company (set the company CIK)" };
  const prior = await loadConfirmations(db, scope);
  const others = prior.filter((c) => c.key.toUpperCase() !== input.inputKey.toUpperCase());
  const priorArgs = { ...args, financials: { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...others.map(({ key, value, source }) => ({ key, value, source }))] } };
  const check = cfoRecompute(priorArgs, [{ key: input.inputKey, value: String(input.value), source: input.source }]);
  const res = check.results[0]!;
  if (!res.accepted) return { ok: false, status: /no tracker flag|ambiguous/.test(res.reason) ? 404 : 400, error: res.reason };
  const data = { value: String(input.value), source: input.source, confirmedBy: input.confirmedBy ?? null };
  await db.customerEbitdaConfirmation.upsert({ where: { companyId_documentId_inputKey: { ...scope, inputKey: input.inputKey } }, create: { ...scope, inputKey: input.inputKey, ...data }, update: data });
  const all = await loadConfirmations(db, scope);
  const box = computeEbitdaBox(args, all);
  const { id } = await saveEbitdaBox(db, scope, box);
  return { ok: true, box, gain: res.gain, boxId: id };
}
