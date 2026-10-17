/**
 * Dashboard EBITDA box: one data shape built from the agreement pipeline's EBITDA optimizer + add-back tracker, plus the
 * CFO-confirm flow that persists sourced figures and recomputes. Data only — presentation belongs to the dashboard.
 *
 * Invent-safe: every amount comes from the filings or a CFO-confirmed, sourced figure. Items whose amount is not known
 * carry null (never an estimate); "extra available" counts only known cap room on pending items, and the box says when
 * more could exist beyond it (pending items without a known bound).
 */
import { fetchIssuerFinancials, type BorrowerInput, type IssuerFinancials } from "../xbrl/companyfacts";
import { capRoomTotal, priorAsOf, rankFlags, type AddBackFlag } from "../xbrl/addback-tracker";
import type { EbitdaOptimization, LeverageCapacity } from "../xbrl/ebitda-optimizer";
import { runAgreementPipeline, type AgreementPipelineResult } from "./agreement-pipeline";
import { capacitySnapshot, cfoRecompute, gainOf, type CfoGain } from "./cfo-loop";
import type { ErpEvidenceFact } from "../erp/contract";
import { erpEvidenceForBox, metricInputKey, metricOfInputKey, type ErpEvidence } from "../erp/suggest";

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
  /** FAILED: the last (background) computation failed; `reason` says why. Earlier boxes stay in history. */
  status: "READY" | "NEEDS_FINANCIALS" | "NO_EBITDA_DEFINITION" | "FAILED";
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
  /** FAILED only: the box shown is the last good one (lastGoodBoxId), computed at staleSince; null when none exists. */
  staleSince?: string | null;
  lastGoodBoxId?: string | null;
  /** ERP evidence (LTM suggestions, reconciliation with filings, refused facts). Present only when an ERP connection
   *  delivered facts for the company; evidence only — nothing in it is counted until the CFO confirms it. */
  erpEvidence?: ErpEvidence;
}

/** AMOUNT: an add-back figure. LENDER_APPROVAL: the clause's lender approval. BASE_METRIC: a base figure the filings do
 *  not carry (METRIC:REVENUE), confirmed from ERP evidence; used only as a plausibility bound, never added to EBITDA. */
export type ConfirmationKind = "AMOUNT" | "LENDER_APPROVAL" | "BASE_METRIC";
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
/** Pipeline inputs plus the company's ERP facts (from the registered ErpEvidenceSource; absent = no ERP connection). */
export type BoxArgs = PipelineArgs & { erp?: { companyId: string; facts: readonly ErpEvidenceFact[] } | null };

/** Confirmations that feed the optimizer as borrower inputs (base-metric confirmations are bounds, not inputs). */
export const borrowerInputsOf = (cs: readonly ConfirmationView[]): BorrowerInput[] => cs.filter((c) => c.kind !== "BASE_METRIC").map(asBorrowerInput);

/** ERP evidence for a box computed from `args` (null when there are no ERP facts). */
export function erpEvidenceFor(args: BoxArgs, box: Pick<EbitdaBox, "periodEnd" | "base">): ErpEvidence | null {
  if (!args.erp?.facts.length) return null;
  const b = box.base?.value;
  return erpEvidenceForBox({
    companyId: args.erp.companyId, facts: args.erp.facts, financials: args.financials, priorFinancials: args.priorFinancials ?? null,
    periodEnd: box.periodEnd ?? args.financials?.anchor ?? null,
    baseNeedsEvidence: !(b != null && /^-?\d+$/.test(b) && BigInt(b) > 0n),
  });
}
const withErp = (box: EbitdaBox, args: BoxArgs): EbitdaBox => { const ev = erpEvidenceFor(args, box); return ev ? { ...box, erpEvidence: ev } : box; };
const pipelineOnly = ({ erp: _erp, ...rest }: BoxArgs): PipelineArgs => rest;

/** Run the pipeline with the confirmed figures applied and build the box. */
export function computeEbitdaBox(boxArgs: BoxArgs, confirmations: readonly ConfirmationView[] = []): EbitdaBox {
  const args = pipelineOnly(boxArgs);
  const fin: IssuerFinancials | null | undefined = args.financials ? { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...borrowerInputsOf(confirmations)] } : args.financials;
  return withErp(ebitdaBoxFromResult(runAgreementPipeline({ ...args, financials: fin }), confirmations), boxArgs);
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
  /** DB-assigned monotonic sequence (BIGSERIAL): the order rows were written in (writes are serialised per document by
   *  the advisory lock, so this is commit order). createdAt can tie; seq cannot. */
  seq?: bigint | number;
  /** The original response ({ boxId, gain }) written with the row, returned verbatim on an idempotent replay. */
  response?: unknown;
}

export interface EbitdaBoxStore {
  customerEbitdaBox: {
    create(args: { data: { id?: string; companyId: string; documentId: string; status: string; version: string; payload: unknown } }): Promise<{ id: string }>;
    findFirst(args: { where: { companyId: string; documentId: string; status?: { not: string } }; orderBy: { seq: "desc" } }): Promise<{ id: string; payload: unknown; createdAt: Date; seq?: bigint | number } | null>;
    findUnique(args: { where: { id: string } }): Promise<{ id: string; companyId: string; documentId: string; payload: unknown; createdAt: Date } | null>;
  };
  /** Append-only: rows are only created, never updated or deleted; the latest row per (key, kind) is current. */
  customerEbitdaConfirmation: {
    create(args: { data: Omit<ConfirmationRow, "id" | "createdAt"> }): Promise<{ id: string }>;
    findMany(args: { where: { companyId: string; documentId: string }; orderBy: Array<{ seq: "asc" }> }): Promise<ConfirmationRow[]>;
    findFirst(args: { where: { companyId: string; documentId: string; idempotencyKey: string } }): Promise<ConfirmationRow | null>;
  };
  /** Interactive transaction (Prisma). Writes are made inside one so a box is never visible without its row. */
  $transaction?<T>(fn: (tx: EbitdaBoxStore) => Promise<T>, opts?: { maxWait?: number; timeout?: number }): Promise<T>;
  $queryRawUnsafe?(sql: string, ...values: unknown[]): Promise<unknown>;
}

/**
 * Run `fn` in one transaction holding a per-document advisory lock, so confirmations and box writes for a document are
 * serialised: each box is computed from the rows committed before it plus the row written in the same transaction, and
 * a failure anywhere (unique violation, insert error, connection reset) rolls back both — nothing is half-written.
 */
export async function withDocumentTransaction<T>(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }, fn: (tx: EbitdaBoxStore) => Promise<T>): Promise<T> {
  if (!db.$transaction) throw new Error("EBITDA box store has no transaction support; refusing a non-atomic write");
  return db.$transaction(async (tx) => {
    if (!tx.$queryRawUnsafe) throw new Error("EBITDA box store cannot take the per-document advisory lock ($queryRawUnsafe missing); refusing an unserialised write");
    await tx.$queryRawUnsafe("SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))", `ebitda-box:${scope.companyId}:${scope.documentId}`);
    return fn(tx);
  }, { maxWait: 30_000, timeout: 60_000 });
}

export async function saveEbitdaBox(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }, box: EbitdaBox, id?: string): Promise<{ id: string }> {
  return db.customerEbitdaBox.create({ data: { ...(id ? { id } : {}), ...scope, status: box.status, version: box.version, payload: JSON.parse(JSON.stringify(box)) } });
}

export async function latestEbitdaBox(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<(EbitdaBox & { savedAt: string }) | null> {
  const row = await db.customerEbitdaBox.findFirst({ where: scope, orderBy: { seq: "desc" } });
  return row ? { ...(row.payload as EbitdaBox), savedAt: row.createdAt.toISOString() } : null;
}

/** Every confirmation row ever written for the document, oldest first (full audit history). */
export async function confirmationHistory(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<ConfirmationRow[]> {
  return db.customerEbitdaConfirmation.findMany({ where: scope, orderBy: [{ seq: "asc" }] });
}

/** Current confirmations: the latest row per canonical (inputKey, kind) wins. */
export async function loadConfirmations(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<Array<ConfirmationView & { confirmedAt: string }>> {
  const latest = new Map<string, ConfirmationRow>();
  for (const r of await confirmationHistory(db, scope)) latest.set(`${canonicalInputKey(r.inputKey)}|${r.kind}`, r);
  return [...latest.values()].map((r) => ({ key: r.inputKey, value: String(r.value), source: r.source, confirmedAt: r.createdAt.toISOString(), kind: r.kind === "LENDER_APPROVAL" || r.kind === "BASE_METRIC" ? r.kind : "AMOUNT", confirmedBy: r.confirmedBy }));
}

export type ConfirmOutcome =
  | { ok: true; box: EbitdaBox; gain: CfoGain["gain"]; boxId: string; replayed?: boolean }
  | { ok: false; status: 400 | 404 | 409 | 422; error: string; code?: "NEEDS_BASE" | "IDEMPOTENCY_CONFLICT" | "OUT_OF_RANGE" | "FILING_PRESENT" | "NEEDS_ERP_EVIDENCE" | "ERP_EVIDENCE_MISMATCH" };

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
  boxArgs: BoxArgs,
  input: ConfirmInput,
): Promise<ConfirmOutcome> {
  const args = pipelineOnly(boxArgs);
  const kind: ConfirmationKind = input.kind ?? "AMOUNT";
  if (kind !== "AMOUNT" && kind !== "LENDER_APPROVAL" && kind !== "BASE_METRIC") return { ok: false, status: 400, error: "kind must be AMOUNT, LENDER_APPROVAL or BASE_METRIC" };
  if (typeof input.inputKey !== "string" || !input.inputKey.trim()) return { ok: false, status: 400, error: "inputKey is required" };
  if (typeof input.source !== "string" || !input.source.trim()) return { ok: false, status: 400, error: "source (the document the figure comes from) is required" };
  if (!input.confirmedBy?.trim()) return { ok: false, status: 400, error: "confirmedBy (authenticated principal) is required" };
  const rawValue = kind === "LENDER_APPROVAL" ? "1" : String(input.value ?? "").trim();
  if (kind !== "LENDER_APPROVAL") {
    if (/^-\d+$/.test(rawValue)) return { ok: false, status: 422, error: "value must not be negative" };
    if (!/^\d+$/.test(rawValue)) return { ok: false, status: 400, error: "value must be an integer USD amount" };
  }
  const value = kind !== "LENDER_APPROVAL" ? BigInt(rawValue).toString() : "1";
  const baseMetric = kind === "BASE_METRIC" ? metricOfInputKey(input.inputKey) : null;
  if (kind === "BASE_METRIC" && !baseMetric) return { ok: false, status: 400, error: "a BASE_METRIC confirmation takes inputKey METRIC:REVENUE" };
  if (!args.financials) return { ok: false, status: 422, error: "no issuer financials for this company (set the company CIK)" };
  const idem = input.idempotencyKey?.trim() || null;
  if (idem && idem.length > 200) return { ok: false, status: 400, error: "idempotencyKey is too long (max 200)" };

  const prior = await loadConfirmations(db, scope);
  const base = runAgreementPipeline({ ...args, financials: { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...borrowerInputsOf(prior)] } });
  const flags = ((base.xbrl as Xbrl | null)?.addBackTracker ?? []) as AddBackFlag[];
  const want = canonicalInputKey(input.inputKey);
  const flag = flags.find((f) => canonicalInputKey(f.inputKey) === want);
  const inputKey = baseMetric ? metricInputKey(baseMetric) : flag?.inputKey ?? want;

  if (idem) {
    const seen = await db.customerEbitdaConfirmation.findFirst({ where: { ...scope, idempotencyKey: idem } });
    if (seen) return replayOf(db, scope, seen, { inputKey, kind, value, source: input.source.trim(), confirmedBy: input.confirmedBy });
  }

  const others = prior.filter((c) => !(canonicalInputKey(c.key) === canonicalInputKey(inputKey) && (c.kind ?? "AMOUNT") === kind));
  const priorArgs: PipelineArgs = { ...args, financials: { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...borrowerInputsOf(others)] } };
  if (kind === "BASE_METRIC") {
    const refused = checkBaseMetric(boxArgs, base, baseMetric!, value, input.source.trim());
    if (refused) return refused;
  } else if (kind === "AMOUNT") {
    const lim = plausibleMax((base.xbrl as Xbrl | null)?.ebitda?.base?.value ?? null, args.financials, flag, confirmedRevenue(prior));
    if (!lim.ok) return { ok: false, status: 422, code: "NEEDS_BASE", error: lim.error };
    if (BigInt(value) > lim.bound) return { ok: false, status: 422, code: "OUT_OF_RANGE", error: `value exceeds the plausible maximum (${lim.basis})` };
    const check = cfoRecompute(priorArgs, [{ key: inputKey, value, source: input.source.trim() }]);
    const res = check.results[0]!;
    if (!res.accepted) return { ok: false, status: /no tracker flag|ambiguous/.test(res.reason) ? 404 : 400, error: res.reason };
  } else {
    if (!flag) {
      const check = cfoRecompute(priorArgs, [{ key: inputKey, value: "0", source: input.source.trim() }]);
      return { ok: false, status: 404, error: check.results[0]?.reason ?? `no tracker flag names input key ${input.inputKey}` };
    }
    if (flag.status !== "CONDITIONAL" && !flag.conditional) return { ok: false, status: 422, error: `${inputKey} does not require lender approval` };
  }
  // One short transaction under the per-document lock (inputs, including SEC financials, were loaded before it):
  // read the committed rows, compute the gain and the box from them plus this confirmation, insert the row (carrying
  // its response for idempotent replay), then save the box. Any failure rolls back both. A concurrent insert with the
  // same idempotency key loses on the unique index (its transaction wrote nothing) and answers with the winner's
  // stored response (same principal + payload) or 409 — never a 500.
  const boxId = newBoxId();
  const key = idem ?? newIdempotencyKey();
  const mine: ConfirmationView = { key: inputKey, value, source: input.source.trim(), kind, confirmedBy: input.confirmedBy, confirmedAt: new Date().toISOString() };
  let box: EbitdaBox, gain: CfoGain["gain"];
  try {
    ({ box, gain } = await withDocumentTransaction(db, scope, async (tx) => {
      const committed = await loadConfirmations(tx, scope);
      const rest = committed.filter((c) => !(canonicalInputKey(c.key) === canonicalInputKey(inputKey) && (c.kind ?? "AMOUNT") === kind));
      const withInputs = (cs: readonly ConfirmationView[]): PipelineArgs => ({ ...args, financials: { ...args.financials!, borrowerInputs: [...(args.financials!.borrowerInputs ?? []), ...borrowerInputsOf(cs)] } });
      const before = runAgreementPipeline(withInputs(rest));
      const after = runAgreementPipeline(withInputs([...rest, mine]));
      const g = gainOf(capacitySnapshot(before), capacitySnapshot(after));
      const b = withErp(ebitdaBoxFromResult(after, [...rest, mine]), boxArgs);
      await tx.customerEbitdaConfirmation.create({ data: { ...scope, inputKey, kind, value, source: mine.source, confirmedBy: input.confirmedBy, idempotencyKey: key, response: { boxId, gain: g } } });
      await saveEbitdaBox(tx, scope, b, boxId);
      return { box: b, gain: g };
    }));
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const seen = await db.customerEbitdaConfirmation.findFirst({ where: { ...scope, idempotencyKey: key } });
    if (!seen) throw err;
    return replayOf(db, scope, seen, { inputKey, kind, value, source: input.source.trim(), confirmedBy: input.confirmedBy });
  }
  return { ok: true, box, gain, boxId };
}

/** Latest CFO-confirmed revenue (BASE_METRIC METRIC:REVENUE), if any. */
function confirmedRevenue(cs: readonly ConfirmationView[]): bigint | null {
  const r = cs.filter((c) => c.kind === "BASE_METRIC" && canonicalInputKey(c.key) === metricInputKey("revenue") && /^\d+$/.test(c.value)).at(-1);
  return r ? BigInt(r.value) : null;
}

/**
 * A base-metric confirmation (revenue the filings do not carry) is accepted only against ERP evidence re-derived on the
 * server for this request: the filings must not report the metric for the period (they win; ERP is reconciled against
 * them, never substituted), the ERP LTM suggestion must be SUGGESTED (admitted, tiled, not blocked by an UNRECONCILED
 * period), and either the source quotes the suggestion's exact reference with its exact value, or (a figure from another
 * document) the value is within 10x either way of the ERP figure.
 */
function checkBaseMetric(boxArgs: BoxArgs, base: AgreementPipelineResult, metric: NonNullable<ReturnType<typeof metricOfInputKey>>, value: string, source: string): ConfirmOutcome | null {
  const fin = boxArgs.financials!;
  if (fin.values.some((v) => v.metric === metric && /^-?\d+$/.test(v.value))) return { ok: false, status: 422, code: "FILING_PRESENT", error: `the filings report ${metric} for this period; ERP figures are reconciled against filings, never substituted for them` };
  const opt = (base.xbrl as Xbrl | null)?.ebitda;
  const ev = erpEvidenceFor(boxArgs, { periodEnd: opt?.periodEnd ?? fin.anchor ?? null, base: opt?.base ?? null });
  const s = ev?.suggestions.find((x) => x.metric === metric && x.inputKey === metricInputKey(metric));
  if (!s || s.status !== "SUGGESTED" || s.value == null) return { ok: false, status: 422, code: "NEEDS_ERP_EVIDENCE", error: s ? `no usable ERP ${metric} for this period: ${s.reason}` : `no ERP evidence for ${metric} (no ERP connection or no facts)` };
  const v = BigInt(value), e = BigInt(s.value);
  if (source.startsWith("erp:")) {
    if (source !== s.sourceRef || value !== s.value) return { ok: false, status: 422, code: "ERP_EVIDENCE_MISMATCH", error: "an ERP-sourced figure must quote the current suggestion's source reference and value exactly" };
    return null;
  }
  if (e <= 0n || v * 10n < e || v > e * 10n) return { ok: false, status: 422, code: "OUT_OF_RANGE", error: `value is not within 10x of the ERP ${metric} for the period` };
  return null;
}

const newBoxId = () => `ebx_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;

/** Company CIK → current and prior-year financials. SEC 404 (no XBRL filings) → null financials; any other fetch error
 *  throws (the caller records a FAILED box — an outage is not "needs financials"). */
export async function financialsForCik(cik: string | null, fetchImpl?: typeof fetch): Promise<{ financials: IssuerFinancials | null; priorFinancials: IssuerFinancials | null; cik: string | null }> {
  const c = cik?.replace(/\D/g, "") || null;
  if (!c || /^0+$/.test(c)) return { financials: null, priorFinancials: null, cik: null };
  try {
    const financials = await fetchIssuerFinancials(c, fetchImpl);
    const pa = financials ? priorAsOf(financials.anchor) : null;
    const priorFinancials = pa ? await fetchIssuerFinancials(c, fetchImpl, pa) : null;
    return { financials, priorFinancials, cik: c };
  } catch (err) {
    throw new SecUnavailableError(err);
  }
}

/** Generic, client-safe description of an SEC outage (no env names, URLs or CIKs). */
export const SEC_UNAVAILABLE_MESSAGE = "SEC data is temporarily unavailable; try again later";

/** SEC data could not be fetched: missing/placeholder SEC identity, network error, non-404 error status, retries exhausted. */
export class SecUnavailableError extends Error {
  readonly code = "SEC_UNAVAILABLE" as const;
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "SecUnavailableError";
  }
}

/** Generation of a document's box stream: the id of the latest saved box by DB sequence (null when none). */
export async function boxGeneration(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<string | null> {
  return (await db.customerEbitdaBox.findFirst({ where: scope, orderBy: { seq: "desc" } }))?.id ?? null;
}

/**
 * Recompute and save the box from committed confirmations (one locked transaction). Loading the inputs (agreement text,
 * SEC filings) or computing may fail: that is recorded as a FAILED box (last committed figures kept) and returned.
 */
export async function refreshBoxCommitted(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }, load: () => Promise<BoxArgs | null>): Promise<{ box: EbitdaBox; id: string } | null> {
  const generation = await boxGeneration(db, scope);
  let args: BoxArgs | null;
  try { args = await load(); } catch (err) { return recordEbitdaBoxFailure(db, scope, err, { generation }); }
  if (!args) return null;
  const a = args;
  try {
    return await withDocumentTransaction(db, scope, async (tx) => {
      const box = computeEbitdaBox(a, await loadConfirmations(tx, scope));
      const { id } = await saveEbitdaBox(tx, scope, box);
      return { box, id };
    });
  } catch (err) { return recordEbitdaBoxFailure(db, scope, err, { generation }); }
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002" || /unique/i.test(err instanceof Error ? err.message : String(err));

/** Idempotent replay: same principal and same payload → the stored original response; anything else → 409. */
async function replayOf(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }, seen: ConfirmationRow, now: { inputKey: string; kind: ConfirmationKind; value: string; source: string; confirmedBy: string }): Promise<ConfirmOutcome> {
  const conflict = (why: string): ConfirmOutcome => ({ ok: false, status: 409, code: "IDEMPOTENCY_CONFLICT", error: `idempotencyKey was already used ${why}` });
  if ((seen.confirmedBy ?? "") !== now.confirmedBy) return conflict("by a different principal");
  const same = canonicalInputKey(seen.inputKey) === canonicalInputKey(now.inputKey) && seen.kind === now.kind && seen.value === now.value && seen.source === now.source;
  if (!same) return conflict("for a different confirmation");
  const r = (seen.response ?? null) as { boxId?: string; gain?: CfoGain["gain"] } | null;
  const row = r?.boxId ? await db.customerEbitdaBox.findUnique({ where: { id: r.boxId } }) : null;
  if (!row || row.companyId !== scope.companyId || row.documentId !== scope.documentId) return conflict("but its original response is not available");
  return { ok: true, box: row.payload as EbitdaBox, gain: r!.gain ?? null, boxId: row.id, replayed: true };
}

/**
 * Plausible maximum for a CFO amount, from a sourced figure only:
 *  - 10× the reported base EBITDA when it is positive;
 *  - else, for a line with a known dollar cap, 10× that cap (only the capped amount is ever counted; 10× catches unit
 *    slips such as thousands entered as dollars);
 *  - else 50% of the issuer's reported revenue. An add-back is a cost already deducted from net income; one adjustment
 *    line larger than half of all sales would mean a single category of non-operating/non-recurring cost consumed most
 *    of revenue — implausible for a filer with a negative or missing base and the typical signature of a units error.
 *    Half (not all) of revenue leaves room for genuine large one-offs (impairments, restructurings) while refusing
 *    figures that would make adjusted EBITDA exceed revenue on their own.
 *  - else 50% of a CFO-confirmed revenue (BASE_METRIC METRIC:REVENUE, accepted only against ERP evidence when the
 *    filings carry no revenue — see checkBaseMetric);
 *  - otherwise nothing bounds it: NEEDS_BASE.
 * 1e12 is only an outer ceiling on top of a sourced bound, never the bound itself; the message names whichever applied.
 */
function plausibleMax(baseValue: string | null, fin: IssuerFinancials, flag: AddBackFlag | undefined, cfoRevenue: bigint | null = null): { ok: true; bound: bigint; basis: string } | { ok: false; error: string } {
  const int = (v: string | null | undefined) => (v != null && /^-?\d+$/.test(v) ? BigInt(v) : null);
  const within = (b: bigint, basis: string) => (b < MAX_CONFIRMED_USD ? { ok: true as const, bound: b, basis } : { ok: true as const, bound: MAX_CONFIRMED_USD, basis: "the 1e12 USD absolute ceiling" });
  const base = int(baseValue);
  if (base != null && base > 0n) return within(10n * base, "10x the reported base EBITDA");
  const c = int(flag?.cap?.amount ?? null);
  if (c != null && c > 0n) return within(10n * c, "10x the clause's dollar cap");
  const rev = int(fin.values.find((v) => v.metric === "revenue")?.value);
  if (rev != null && rev > 0n) return within(rev / 2n, "50% of the issuer's reported revenue");
  if (cfoRevenue != null && cfoRevenue > 0n) return within(cfoRevenue / 2n, "50% of the CFO-confirmed revenue (ERP evidence)");
  return { ok: false, error: "NEEDS_BASE: base EBITDA is missing or not positive and no other sourced figure (a dollar cap, revenue) bounds this line; the figure cannot be checked for plausibility" };
}

/**
 * Persist a FAILED box (e.g. a background refresh or SEC error) so GET surfaces it with its reason — under the same
 * per-document lock and transaction as every other box write. `generation` is the latest box id when the failed run
 * started: if a newer box was saved since, the failure is stale and nothing is written (a newer READY box is never
 * shadowed). The FAILED box keeps the last committed state visible: the figures of the latest non-FAILED box
 * (lastGoodBoxId, staleSince) and the currently committed confirmations.
 */
export async function recordEbitdaBoxFailure(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }, err: unknown, opts: { generation: string | null }): Promise<{ box: EbitdaBox; id: string; skipped?: boolean }> {
  // SEC failures carry environment detail (identity env names, URLs, CIKs): log it server-side, surface a generic reason.
  if (err instanceof SecUnavailableError) console.error("[ebitda-box] SEC data unavailable", { ...scope, detail: err.message });
  const reason = err instanceof SecUnavailableError ? SEC_UNAVAILABLE_MESSAGE : (err instanceof Error ? err.message : String(err)).slice(0, 500) || "unknown error";
  return withDocumentTransaction(db, scope, async (tx) => {
    const latest = await tx.customerEbitdaBox.findFirst({ where: scope, orderBy: { seq: "desc" } });
    if ((latest?.id ?? null) !== opts.generation && latest) return { box: latest.payload as EbitdaBox, id: latest.id, skipped: true };
    const last = await tx.customerEbitdaBox.findFirst({ where: { ...scope, status: { not: "FAILED" } }, orderBy: { seq: "desc" } });
    const confirmations = await loadConfirmations(tx, scope);
    const prev = (last?.payload ?? null) as EbitdaBox | null;
    const box: EbitdaBox = {
      ...(prev ?? failedEbitdaBox("")),
      status: "FAILED",
      reason: `EBITDA box computation failed: ${reason}${prev && last ? ` (showing the last computed box from ${last.createdAt.toISOString()})` : ""}`,
      confirmations,
      staleSince: last ? last.createdAt.toISOString() : null,
      lastGoodBoxId: last?.id ?? null,
    };
    const { id } = await saveEbitdaBox(tx, scope, box);
    return { box, id };
  });
}

export function failedEbitdaBox(reason: string): EbitdaBox {
  return {
    version: EBITDA_BOX_VERSION, status: "FAILED", term: null, periodEnd: null, cik: null, totalEbitda: null, maximum: null, base: null, deductions: null,
    confirmedAddBacks: "0", extraAvailableIfConfirmed: "0", pendingUnbounded: 0, pendingConditional: 0,
    capacityImpact: { maxLeverage: null, leverageCapacity: null, leverageBound: null, extraDebtCapacityIfConfirmed: null }, items: [], confirmations: [], reason,
  };
}
