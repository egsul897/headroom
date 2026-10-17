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
import { capacitySnapshot, cfoRecompute, gainOf, type CfoGain } from "./cfo-loop";

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
  /** Current (latest per key and kind) CFO confirmations applied. kind/confirmedBy are optional additions (ebitda-box-1 compatible). */
  confirmations: Array<ConfirmationView>;
  reason: string;
}

export type ConfirmationKind = "AMOUNT" | "LENDER_APPROVAL";
export type ConfirmationView = BorrowerInput & { confirmedAt?: string | null; kind?: ConfirmationKind; confirmedBy?: string | null };

type Xbrl = NonNullable<AgreementPipelineResult["xbrl"]> & { ebitda?: EbitdaOptimization; leverageCapacity?: LeverageCapacity; addBackTracker?: AddBackFlag[] };

const sum = (xs: Array<string | null>) => xs.reduce((a, x) => a + (x && /^-?\d+$/.test(x) ? BigInt(x) : 0n), 0n);

/** Build the box from a pipeline result (pure). */
export function ebitdaBoxFromResult(r: AgreementPipelineResult, confirmations: readonly ConfirmationView[] = []): EbitdaBox {
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
export function computeEbitdaBox(args: PipelineArgs, confirmations: readonly ConfirmationView[] = []): EbitdaBox {
  const fin: IssuerFinancials | null | undefined = args.financials ? { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...confirmations.map(asBorrowerInput)] } : args.financials;
  return ebitdaBoxFromResult(runAgreementPipeline({ ...args, financials: fin }), confirmations);
}

// ---------------- persistence (Neon via Prisma) ----------------

/** A lender-approval confirmation is passed to the optimizer as APPROVAL:<label…> with value "1". */
export function asBorrowerInput(c: ConfirmationView): BorrowerInput {
  return c.kind === "LENDER_APPROVAL" ? { key: c.key.replace(/^ADDBACK:/i, "APPROVAL:"), value: "1", source: c.source } : { key: c.key, value: c.value, source: c.source };
}

/** Canonical form of an input key for comparison: no whitespace, upper case. The stored key is the tracker's own key. */
export const canonicalInputKey = (k: string) => k.replace(/\s+/g, "").toUpperCase();

export interface ConfirmationRow {
  id: string; companyId: string; documentId: string; inputKey: string; kind: string; value: string; source: string;
  confirmedBy: string | null; idempotencyKey: string; createdAt: Date;
}

export interface EbitdaBoxStore {
  customerEbitdaBox: {
    create(args: { data: { companyId: string; documentId: string; status: string; version: string; payload: unknown } }): Promise<{ id: string }>;
    findFirst(args: { where: { companyId: string; documentId: string }; orderBy: { createdAt: "desc" } }): Promise<{ id: string; payload: unknown; createdAt: Date } | null>;
  };
  /** Append-only: rows are only created, never updated or deleted; the latest row per (key, kind) is current. */
  customerEbitdaConfirmation: {
    create(args: { data: Omit<ConfirmationRow, "id" | "createdAt"> }): Promise<{ id: string }>;
    findMany(args: { where: { companyId: string; documentId: string }; orderBy: Array<{ createdAt: "asc" } | { id: "asc" }> }): Promise<ConfirmationRow[]>;
    findFirst(args: { where: { companyId: string; documentId: string; idempotencyKey: string } }): Promise<ConfirmationRow | null>;
  };
}

export async function saveEbitdaBox(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }, box: EbitdaBox): Promise<{ id: string }> {
  return db.customerEbitdaBox.create({ data: { ...scope, status: box.status, version: box.version, payload: JSON.parse(JSON.stringify(box)) } });
}

export async function latestEbitdaBox(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<(EbitdaBox & { savedAt: string }) | null> {
  const row = await db.customerEbitdaBox.findFirst({ where: scope, orderBy: { createdAt: "desc" } });
  return row ? { ...(row.payload as EbitdaBox), savedAt: row.createdAt.toISOString() } : null;
}

/** Every confirmation row ever written for the document, oldest first (full audit history). */
export async function confirmationHistory(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<ConfirmationRow[]> {
  return db.customerEbitdaConfirmation.findMany({ where: scope, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

/** Current confirmations: the latest row per canonical (inputKey, kind) wins. */
export async function loadConfirmations(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<Array<ConfirmationView & { confirmedAt: string }>> {
  const latest = new Map<string, ConfirmationRow>();
  for (const r of await confirmationHistory(db, scope)) latest.set(`${canonicalInputKey(r.inputKey)}|${r.kind}`, r);
  return [...latest.values()].map((r) => ({ key: r.inputKey, value: String(r.value), source: r.source, confirmedAt: r.createdAt.toISOString(), kind: r.kind === "LENDER_APPROVAL" ? "LENDER_APPROVAL" : "AMOUNT", confirmedBy: r.confirmedBy }));
}

export type ConfirmOutcome =
  | { ok: true; box: EbitdaBox; gain: CfoGain["gain"]; boxId: string; replayed?: boolean }
  | { ok: false; status: 400 | 404 | 409 | 422; error: string };

/** Hard ceiling for any confirmed amount (USD); also bounded by 10× the reported base EBITDA when that is known. */
export const MAX_CONFIRMED_USD = 10n ** 12n;

export interface ConfirmInput {
  inputKey: string;
  /** Whole USD (AMOUNT). Ignored for LENDER_APPROVAL. */
  value?: string;
  source: string;
  /** AMOUNT (default): the figure. LENDER_APPROVAL: the lender/agent approval required by the clause has been obtained. */
  kind?: ConfirmationKind;
  /** Server-side principal id (never from the request body). */
  confirmedBy: string;
  /** Repeat-safe key: the same key with the same payload replays; with a different payload it is refused (409). */
  idempotencyKey?: string | null;
}

const newIdempotencyKey = () => `srv-${globalThis.crypto.randomUUID()}`;

/**
 * CFO confirms one item, validated against a fresh pipeline run: the key must name a tracker flag (matched canonically:
 * case and whitespace insensitive; stored as the tracker's key), an AMOUNT must be a non-negative integer within sane
 * bounds, a LENDER_APPROVAL only applies to a CONDITIONAL item, and the source is named. Rows are appended (history kept);
 * the latest per key and kind is current. A CONDITIONAL item counts only once both its amount and its approval are
 * confirmed. The box is then recomputed with all current confirmations and saved.
 */
export async function confirmEbitdaItem(
  db: EbitdaBoxStore,
  scope: { companyId: string; documentId: string },
  args: PipelineArgs,
  input: ConfirmInput,
): Promise<ConfirmOutcome> {
  const kind: ConfirmationKind = input.kind ?? "AMOUNT";
  if (kind !== "AMOUNT" && kind !== "LENDER_APPROVAL") return { ok: false, status: 400, error: "kind must be AMOUNT or LENDER_APPROVAL" };
  if (typeof input.inputKey !== "string" || !input.inputKey.trim()) return { ok: false, status: 400, error: "inputKey is required" };
  if (typeof input.source !== "string" || !input.source.trim()) return { ok: false, status: 400, error: "source (the document the figure comes from) is required" };
  if (!input.confirmedBy?.trim()) return { ok: false, status: 400, error: "confirmedBy (authenticated principal) is required" };
  const rawValue = kind === "LENDER_APPROVAL" ? "1" : String(input.value ?? "").trim();
  if (kind === "AMOUNT") {
    if (/^-\d+$/.test(rawValue)) return { ok: false, status: 422, error: "value must not be negative" };
    if (!/^\d+$/.test(rawValue)) return { ok: false, status: 400, error: "value must be an integer USD amount" };
  }
  const value = kind === "AMOUNT" ? BigInt(rawValue).toString() : "1";
  if (!args.financials) return { ok: false, status: 422, error: "no issuer financials for this company (set the company CIK)" };
  const idem = input.idempotencyKey?.trim() || null;
  if (idem && idem.length > 200) return { ok: false, status: 400, error: "idempotencyKey is too long (max 200)" };

  const prior = await loadConfirmations(db, scope);
  const base = runAgreementPipeline({ ...args, financials: { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...prior.map(asBorrowerInput)] } });
  const flags = ((base.xbrl as Xbrl | null)?.addBackTracker ?? []) as AddBackFlag[];
  const want = canonicalInputKey(input.inputKey);
  const flag = flags.find((f) => canonicalInputKey(f.inputKey) === want);
  const inputKey = flag?.inputKey ?? want;

  if (idem) {
    const seen = await db.customerEbitdaConfirmation.findFirst({ where: { ...scope, idempotencyKey: idem } });
    if (seen) {
      const same = canonicalInputKey(seen.inputKey) === canonicalInputKey(inputKey) && seen.kind === kind && seen.value === value && seen.source === input.source.trim();
      if (!same) return { ok: false, status: 409, error: "idempotencyKey was already used for a different confirmation" };
      const box = computeEbitdaBox(args, prior);
      const latest = await db.customerEbitdaBox.findFirst({ where: scope, orderBy: { createdAt: "desc" } });
      return { ok: true, box, gain: null, boxId: latest?.id ?? "", replayed: true };
    }
  }

  const others = prior.filter((c) => !(canonicalInputKey(c.key) === canonicalInputKey(inputKey) && (c.kind ?? "AMOUNT") === kind));
  const priorArgs: PipelineArgs = { ...args, financials: { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...others.map(asBorrowerInput)] } };
  let gain: CfoGain["gain"];
  if (kind === "AMOUNT") {
    const opt = (base.xbrl as Xbrl | null)?.ebitda;
    const b = opt?.base?.value && /^-?\d+$/.test(opt.base.value) ? BigInt(opt.base.value) : null;
    const bound = b != null && b > 0n && 10n * b < MAX_CONFIRMED_USD ? 10n * b : MAX_CONFIRMED_USD;
    if (BigInt(value) > bound) return { ok: false, status: 422, error: `value exceeds the plausible maximum (${bound === MAX_CONFIRMED_USD ? "1e12 USD" : "10x the reported base EBITDA"})` };
    const check = cfoRecompute(priorArgs, [{ key: inputKey, value, source: input.source.trim() }]);
    const res = check.results[0]!;
    if (!res.accepted) return { ok: false, status: /no tracker flag|ambiguous/.test(res.reason) ? 404 : 400, error: res.reason };
    gain = res.gain;
  } else {
    if (!flag) {
      const check = cfoRecompute(priorArgs, [{ key: inputKey, value: "0", source: input.source.trim() }]);
      return { ok: false, status: 404, error: check.results[0]?.reason ?? `no tracker flag names input key ${input.inputKey}` };
    }
    if (flag.status !== "CONDITIONAL" && !flag.conditional) return { ok: false, status: 422, error: `${inputKey} does not require lender approval` };
    const withApproval = { ...priorArgs, financials: { ...priorArgs.financials!, borrowerInputs: [...(priorArgs.financials!.borrowerInputs ?? []), asBorrowerInput({ key: inputKey, value, source: input.source.trim(), kind })] } };
    gain = gainOf(capacitySnapshot(runAgreementPipeline(priorArgs)), capacitySnapshot(runAgreementPipeline(withApproval)));
  }
  await db.customerEbitdaConfirmation.create({ data: { ...scope, inputKey, kind, value, source: input.source.trim(), confirmedBy: input.confirmedBy, idempotencyKey: idem ?? newIdempotencyKey() } });
  const all = await loadConfirmations(db, scope);
  const box = computeEbitdaBox(args, all);
  const { id } = await saveEbitdaBox(db, scope, box);
  return { ok: true, box, gain, boxId: id };
}
