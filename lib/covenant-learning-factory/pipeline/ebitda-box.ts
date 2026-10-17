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

export const EBITDA_BOX_VERSION = "ebitda-box-1";

/** Where an add-back figure's evidence comes from. SEC_FILING: detected in the issuer's SEC filings (XBRL).
 *  OFFICERS_CERTIFICATE / ERP / CFO_ENTERED: supplied by the CFO through the confirm/propose flow, always with a
 *  source reference (certificate date/period, ERP reference, or the stated source document). */
export type EvidenceSourceKind = "SEC_FILING" | "OFFICERS_CERTIFICATE" | "ERP" | "CFO_ENTERED";
export const EVIDENCE_SOURCE_KINDS: readonly EvidenceSourceKind[] = ["SEC_FILING", "OFFICERS_CERTIFICATE", "ERP", "CFO_ENTERED"];
export const isEvidenceSourceKind = (v: unknown): v is EvidenceSourceKind => typeof v === "string" && (EVIDENCE_SOURCE_KINDS as readonly string[]).includes(v);

/** NEEDS_INPUT: a CFO-proposed item that maps to no permitted category in THIS agreement's EBITDA definition;
 *  it is listed so the CFO can see it, counted as "0", and never flows into EBITDA, baskets, or capacity. */
export type EbitdaBoxItemStatus = "CONFIRMED" | "EVIDENCED" | "PENDING" | "CONDITIONAL" | "NEEDS_INPUT";

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
  /** Evidence behind the figure: XBRL entries are SEC_FILING; CFO entries carry the confirmation's evidence kind
   *  and its source reference (accession / certificate date / ERP reference) when one was recorded. */
  source: Array<{ kind: "XBRL" | "CFO"; evidenceKind: EvidenceSourceKind; ref: string; value: string }>;
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
  /** Current (latest per label) CFO-proposed add-backs. MAPPED proposals name a permitted category in this
   *  agreement's definition and count only once confirmed through the confirm flow; NEEDS_INPUT proposals map to
   *  no permitted category and never count. Unmapped proposals also appear in `items` with status NEEDS_INPUT. */
  proposals: Array<EbitdaProposalView>;
  reason: string;
  /** FAILED only: the box shown is the last good one (lastGoodBoxId), computed at staleSince; null when none exists. */
  staleSince?: string | null;
  lastGoodBoxId?: string | null;
}

export type ConfirmationKind = "AMOUNT" | "LENDER_APPROVAL";
export type ConfirmationView = BorrowerInput & { confirmedAt?: string | null; kind?: ConfirmationKind; confirmedBy?: string | null; sourceKind?: EvidenceSourceKind; sourceRef?: string | null };

/** A CFO-proposed add-back (append-only record; latest per label is current). */
export interface EbitdaProposalRecord {
  id: string; label: string; amount: string; source: string;
  sourceKind: EvidenceSourceKind; sourceRef: string | null;
  proposedBy: string | null; proposedAt: string;
}

export type EbitdaProposalView = EbitdaProposalRecord & {
  /** MAPPED: the label names a permitted category in this agreement's own EBITDA definition (mappedInputKey set).
   *  NEEDS_INPUT: no permitted category matches — the proposal is listed but never counted. */
  status: "MAPPED" | "NEEDS_INPUT";
  mappedInputKey: string | null;
};

type Xbrl = NonNullable<AgreementPipelineResult["xbrl"]> & { ebitda?: EbitdaOptimization; leverageCapacity?: LeverageCapacity; addBackTracker?: AddBackFlag[] };

const sum = (xs: Array<string | null>) => xs.reduce((a, x) => a + (x && /^-?\d+$/.test(x) ? BigInt(x) : 0n), 0n);

/** Label normalisation for proposal matching and latest-per-label keying: case/punctuation insensitive. */
export const canonicalProposalLabel = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");

/**
 * Does a CFO-proposed label name a permitted add-back category in THIS agreement's EBITDA definition?
 * Deterministic matches only, against the definition's own clauses: the clause label ("(e)"), the flag's input-key
 * label segment, the parsed category, or a descriptive prefix of the clause text itself (≥ 8 normalised chars, so a
 * CFO naming the clause by its opening words matches the clause that starts with them). No fuzzy matching: a label
 * that matches nothing stays NEEDS_INPUT and never counts.
 */
export function matchProposalToFlag(label: string, flags: readonly AddBackFlag[]): AddBackFlag | undefined {
  const want = canonicalProposalLabel(label);
  if (!want) return undefined;
  return flags.find((f) => {
    if (canonicalProposalLabel(f.clause.label) === want) return true;
    if (canonicalProposalLabel(f.category) === want) return true;
    const keyLabel = f.inputKey.replace(/^(ADDBACK|CNI):/i, "").split("@")[0]!;
    if (canonicalProposalLabel(keyLabel) === want) return true;
    return want.length >= 8 && canonicalProposalLabel(f.clause.text).startsWith(want);
  });
}

/** Proposal records → views against this agreement's flags (mapping is recomputed on every box build). */
export function proposalViews(proposals: readonly EbitdaProposalRecord[], flags: readonly AddBackFlag[]): EbitdaProposalView[] {
  return proposals.map((p) => {
    const flag = matchProposalToFlag(p.label, flags);
    return { ...p, status: flag ? "MAPPED" as const : "NEEDS_INPUT" as const, mappedInputKey: flag?.inputKey ?? null };
  });
}

/** Build the box from a pipeline result (pure). */
export function ebitdaBoxFromResult(r: AgreementPipelineResult, confirmations: readonly ConfirmationView[] = [], proposals: readonly EbitdaProposalRecord[] = []): EbitdaBox {
  const x = (r.xbrl ?? null) as Xbrl | null;
  const empty = (status: EbitdaBox["status"], reason: string): EbitdaBox => ({
    version: EBITDA_BOX_VERSION, status, term: null, periodEnd: null, cik: x?.cik ?? null, totalEbitda: null, maximum: null, base: null, deductions: null,
    confirmedAddBacks: "0", extraAvailableIfConfirmed: "0", pendingUnbounded: 0, pendingConditional: 0,
    capacityImpact: { maxLeverage: null, leverageCapacity: null, leverageBound: null, extraDebtCapacityIfConfirmed: null }, items: [], confirmations: [...confirmations],
    proposals: proposalViews(proposals, []), reason,
  });
  if (!x) return empty("NEEDS_FINANCIALS", "no issuer financials (company CIK / filings) available for this agreement");
  const opt = x.ebitda;
  if (!opt) return empty("NO_EBITDA_DEFINITION", x.ebitdaBaseHold ? `EBITDA definition not resolved: ${x.ebitdaBaseHold.reason} (${x.ebitdaBaseHold.missing})` : "no Consolidated EBITDA definition found in this agreement");
  const flags = rankFlags(x.addBackTracker ?? []);
  const lev = x.leverageCapacity?.maxLeverage ?? null;
  /** Current AMOUNT confirmation per canonical key: the evidence (kind + reference) behind a CFO-counted figure. */
  const amountByKey = new Map<string, ConfirmationView>();
  for (const c of confirmations) if ((c.kind ?? "AMOUNT") === "AMOUNT") amountByKey.set(canonicalInputKey(c.key), c);
  const items: EbitdaBoxItem[] = flags.map((f) => {
    const line = f.position >= 0 ? opt.addBacks[f.position] : undefined;
    const cfo = (line?.concepts ?? []).filter((c) => c.concept.startsWith("borrower:"));
    const evidence = amountByKey.get(canonicalInputKey(f.inputKey));
    const status: EbitdaBoxItemStatus = cfo.length ? "CONFIRMED" : f.status === "CONDITIONAL" ? "CONDITIONAL" : f.status === "DETECTED" ? "EVIDENCED" : "PENDING";
    const source: EbitdaBoxItem["source"] = [
      ...cfo.map((c) => ({ kind: "CFO" as const, evidenceKind: evidence?.sourceKind ?? "CFO_ENTERED" as EvidenceSourceKind, ref: evidence?.sourceRef ?? c.concept.replace(/^borrower:/, ""), value: c.value })),
      ...f.sources.map((s) => ({ kind: "XBRL" as const, evidenceKind: "SEC_FILING" as const, ref: `${s.concept}${s.currentPeriodEnd ? ` @ ${s.currentPeriodEnd}` : ""}`, value: s.current })),
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
  const views = proposalViews(proposals, flags);
  /** Unmapped proposals are listed as items too — visible to the CFO, counted "0", never in any total. Mapped
   *  proposals are represented by their flag item (and listed in `proposals`); they count only after a confirm. */
  const proposalItems: EbitdaBoxItem[] = views.filter((v) => v.status === "NEEDS_INPUT").map((v, i) => ({
    rank: items.length + i + 1,
    inputKey: `PROPOSED:${v.label}`,
    label: v.label, category: "PROPOSED", clause: "",
    status: "NEEDS_INPUT" as const,
    counted: "0",
    amount: v.amount,
    source: [{ kind: "CFO" as const, evidenceKind: v.sourceKind, ref: v.sourceRef ?? v.source, value: v.amount }],
    cap: null,
    potentialEbitda: null, potentialDebtCapacity: null, potentialBasis: "UNCAPPED_NEEDS_INPUT" as const,
    conditionText: null,
    note: "CFO-proposed add-back: the label maps to no permitted category in this agreement's EBITDA definition, so it is not counted. It counts only if it is restated under a permitted category and confirmed.",
  }));
  const allItems = [...items, ...proposalItems];
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
    items: allItems, confirmations: [...confirmations], proposals: views, reason: opt.reason,
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
export function computeEbitdaBox(args: PipelineArgs, confirmations: readonly ConfirmationView[] = [], proposals: readonly EbitdaProposalRecord[] = []): EbitdaBox {
  const fin: IssuerFinancials | null | undefined = args.financials ? { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...confirmations.map(asBorrowerInput)] } : args.financials;
  return ebitdaBoxFromResult(runAgreementPipeline({ ...args, financials: fin }), confirmations, proposals);
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
  /** Evidence kind/reference recorded with the confirmation (migration 20261017090000); absent on older rows. */
  sourceKind?: string | null; sourceRef?: string | null;
  confirmedBy: string | null; idempotencyKey: string; createdAt: Date;
  /** DB-assigned monotonic sequence (BIGSERIAL): the order rows were written in (writes are serialised per document by
   *  the advisory lock, so this is commit order). createdAt can tie; seq cannot. */
  seq?: bigint | number;
  /** The original response ({ boxId, gain }) written with the row, returned verbatim on an idempotent replay. */
  response?: unknown;
}

export interface EbitdaProposalRow {
  id: string; companyId: string; documentId: string; label: string; amount: string; source: string;
  sourceKind: string; sourceRef: string | null;
  proposedBy: string | null; idempotencyKey: string; createdAt: Date;
  seq?: bigint | number;
  /** The original response ({ boxId }) written with the row, returned verbatim on an idempotent replay. */
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
  /** Append-only CFO proposals (migration 20261017090000): the latest row per label is current. Optional in the
   *  store shape so pre-migration stores keep working; reads then simply see no proposals. */
  customerEbitdaProposal?: {
    create(args: { data: Omit<EbitdaProposalRow, "id" | "createdAt"> }): Promise<{ id: string }>;
    findMany(args: { where: { companyId: string; documentId: string }; orderBy: Array<{ seq: "asc" }> }): Promise<EbitdaProposalRow[]>;
    findFirst(args: { where: { companyId: string; documentId: string; idempotencyKey: string } }): Promise<EbitdaProposalRow | null>;
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
  return [...latest.values()].map((r) => ({ key: r.inputKey, value: String(r.value), source: r.source, confirmedAt: r.createdAt.toISOString(), kind: r.kind === "LENDER_APPROVAL" ? "LENDER_APPROVAL" : "AMOUNT", confirmedBy: r.confirmedBy, sourceKind: isEvidenceSourceKind(r.sourceKind) ? r.sourceKind : "CFO_ENTERED", sourceRef: r.sourceRef ?? null }));
}

/** Every proposal row ever written for the document, oldest first (full audit history). */
export async function proposalHistory(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<EbitdaProposalRow[]> {
  if (!db.customerEbitdaProposal) return [];
  return db.customerEbitdaProposal.findMany({ where: scope, orderBy: [{ seq: "asc" }] });
}

const proposalRecord = (r: EbitdaProposalRow): EbitdaProposalRecord => ({
  id: r.id, label: r.label, amount: String(r.amount), source: r.source,
  sourceKind: isEvidenceSourceKind(r.sourceKind) ? r.sourceKind : "CFO_ENTERED", sourceRef: r.sourceRef ?? null,
  proposedBy: r.proposedBy, proposedAt: r.createdAt.toISOString(),
});

/** Current proposals: the latest row per canonical label wins (an edit is a new row superseding the old). */
export async function loadProposals(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }): Promise<EbitdaProposalRecord[]> {
  const latest = new Map<string, EbitdaProposalRow>();
  for (const r of await proposalHistory(db, scope)) latest.set(canonicalProposalLabel(r.label), r);
  return [...latest.values()].map(proposalRecord);
}

export type ConfirmOutcome =
  | { ok: true; box: EbitdaBox; gain: CfoGain["gain"]; boxId: string; replayed?: boolean }
  | { ok: false; status: 400 | 404 | 409 | 422; error: string; code?: "NEEDS_BASE" | "IDEMPOTENCY_CONFLICT" | "OUT_OF_RANGE" | "SEPARATION_OF_DUTIES" };

/** Hard ceiling for any confirmed amount (USD); also bounded by 10× the reported base EBITDA when that is known. */
export const MAX_CONFIRMED_USD = 10n ** 12n;

export interface ConfirmInput {
  inputKey: string;
  /** Whole USD (AMOUNT). Ignored for LENDER_APPROVAL. */
  value?: string;
  source: string;
  /** Evidence kind behind the figure (default CFO_ENTERED). SEC_FILING is reserved for filing-detected figures;
   *  OFFICERS_CERTIFICATE / ERP name where a CFO-supplied figure comes from, with `sourceRef` identifying it. */
  sourceKind?: EvidenceSourceKind;
  /** Reference for the evidence: filing accession, certificate date/period, ERP reference (optional, ≤ 500 chars). */
  sourceRef?: string | null;
  /** AMOUNT (default): the figure. LENDER_APPROVAL: the lender/agent approval required by the clause has been obtained. */
  kind?: ConfirmationKind;
  /** Server-side principal id (never from the request body). */
  confirmedBy: string;
  /** Repeat-safe key: the same key with the same payload replays; with a different payload it is refused (409). */
  idempotencyKey?: string | null;
}

/** Normalise the optional evidence fields of a confirm/propose payload; null when invalid. */
function evidenceOf(input: { sourceKind?: EvidenceSourceKind; sourceRef?: string | null }): { sourceKind: EvidenceSourceKind; sourceRef: string | null } | null {
  if (input.sourceKind !== undefined && !isEvidenceSourceKind(input.sourceKind)) return null;
  const ref = typeof input.sourceRef === "string" ? input.sourceRef.trim() : null;
  if (ref !== null && ref.length > 500) return null;
  return { sourceKind: input.sourceKind ?? "CFO_ENTERED", sourceRef: ref || null };
}

const newIdempotencyKey = () => `srv-${globalThis.crypto.randomUUID()}`;

/**
 * CFO confirms one item, validated against a fresh pipeline run: the key must name a tracker flag (matched canonically:
 * case and whitespace insensitive; stored as the tracker's key), an AMOUNT must be a non-negative integer within sane
 * bounds, a LENDER_APPROVAL only applies to a CONDITIONAL item, and the source is named. Rows are appended (history
 * kept); the latest per key and kind is current. A CONDITIONAL item counts only once both its amount and its approval
 * are confirmed. The box is then recomputed with all current confirmations and saved.
 *
 * Separation of duties is SYMMETRIC (Egzon decision, 2026-10-17): for a CONDITIONAL item, the amount and the lender
 * approval must be recorded by two different principals, whichever is recorded second. A LENDER_APPROVAL whose
 * confirmer equals the current AMOUNT confirmer is refused, and an AMOUNT whose confirmer equals the current
 * LENDER_APPROVAL confirmer is refused — both 409 SEPARATION_OF_DUTIES, nothing persisted. Recording either one
 * first stays allowed: the block lands on the second act by the same person.
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
  const evidence = evidenceOf(input);
  if (!evidence) return { ok: false, status: 400, error: "sourceKind must be one of SEC_FILING, OFFICERS_CERTIFICATE, ERP, CFO_ENTERED and sourceRef at most 500 characters" };
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
    if (seen) return replayOf(db, scope, seen, { inputKey, kind, value, source: input.source.trim(), confirmedBy: input.confirmedBy, ...evidence });
  }

  const others = prior.filter((c) => !(canonicalInputKey(c.key) === canonicalInputKey(inputKey) && (c.kind ?? "AMOUNT") === kind));
  const priorArgs: PipelineArgs = { ...args, financials: { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...others.map(asBorrowerInput)] } };
  if (kind === "AMOUNT") {
    const lim = plausibleMax((base.xbrl as Xbrl | null)?.ebitda?.base?.value ?? null, args.financials, flag);
    if (!lim.ok) return { ok: false, status: 422, code: "NEEDS_BASE", error: lim.error };
    if (BigInt(value) > lim.bound) return { ok: false, status: 422, code: "OUT_OF_RANGE", error: `value exceeds the plausible maximum (${lim.basis})` };
    const check = cfoRecompute(priorArgs, [{ key: inputKey, value, source: input.source.trim() }]);
    const res = check.results[0]!;
    if (!res.accepted) return { ok: false, status: /no tracker flag|ambiguous/.test(res.reason) ? 404 : 400, error: res.reason };
    // Symmetric separation of duties (Egzon decision, 2026-10-17): the approval-side check below refuses an approval
    // recorded by the amount's confirmer; this side refuses the mirror image — an AMOUNT whose confirmer already
    // holds the current LENDER_APPROVAL for the key. Without it, recording the approval first (or re-confirming the
    // amount after approving) let one principal end up behind both records. The comparison is against the CURRENT
    // approval row, mirroring how the approval side reads the current amount row, and both identities stay on the
    // append-only rows for audit.
    // The gate is the approval row itself, not the tracker flag: an approval row can only exist for an item that
    // required lender approval when it was recorded (the approval path refuses anything else), while the flag
    // stops PRESENTING as CONDITIONAL once an amount and an approval are both present — exactly the re-confirm
    // case this check exists to catch. Unconditional items can hold no approval row, so they are unaffected.
    const approvalConfirmation = prior.find((c) => canonicalInputKey(c.key) === canonicalInputKey(inputKey) && (c.kind ?? "AMOUNT") === "LENDER_APPROVAL");
    if (approvalConfirmation?.confirmedBy && approvalConfirmation.confirmedBy === input.confirmedBy) {
      return { ok: false, status: 409, code: "SEPARATION_OF_DUTIES", error: `separation of duties: the amount for ${inputKey} must be confirmed by a different principal than the one who recorded its lender approval (${approvalConfirmation.confirmedBy})` };
    }
  } else {
    if (!flag) {
      const check = cfoRecompute(priorArgs, [{ key: inputKey, value: "0", source: input.source.trim() }]);
      return { ok: false, status: 404, error: check.results[0]?.reason ?? `no tracker flag names input key ${input.inputKey}` };
    }
    if (flag.status !== "CONDITIONAL" && !flag.conditional) return { ok: false, status: 422, error: `${inputKey} does not require lender approval` };
    // Separation of duties: the lender approval attests an external fact (the agent/lenders approved), so it must
    // be recorded by a DIFFERENT principal than the one who confirmed the amount it unlocks — one person must not
    // be able to both state the figure and certify its approval. Data-driven: the comparison is against the current
    // AMOUNT confirmation for this key, and both identities stay on the append-only rows for audit. With no amount
    // confirmed yet there is no underlying confirmer to conflict with, so the approval may be recorded first.
    const amountConfirmation = prior.find((c) => canonicalInputKey(c.key) === canonicalInputKey(inputKey) && (c.kind ?? "AMOUNT") === "AMOUNT");
    if (amountConfirmation?.confirmedBy && amountConfirmation.confirmedBy === input.confirmedBy) {
      return { ok: false, status: 409, code: "SEPARATION_OF_DUTIES", error: `separation of duties: the lender approval for ${inputKey} must be confirmed by a different principal than the one who confirmed its amount (${amountConfirmation.confirmedBy})` };
    }
  }
  // One short transaction under the per-document lock (inputs, including SEC financials, were loaded before it):
  // read the committed rows, compute the gain and the box from them plus this confirmation, insert the row (carrying
  // its response for idempotent replay), then save the box. Any failure rolls back both. A concurrent insert with the
  // same idempotency key loses on the unique index (its transaction wrote nothing) and answers with the winner's
  // stored response (same principal + payload) or 409 — never a 500.
  const boxId = newBoxId();
  const key = idem ?? newIdempotencyKey();
  const mine: ConfirmationView = { key: inputKey, value, source: input.source.trim(), kind, confirmedBy: input.confirmedBy, confirmedAt: new Date().toISOString(), ...evidence };
  let box: EbitdaBox, gain: CfoGain["gain"];
  try {
    ({ box, gain } = await withDocumentTransaction(db, scope, async (tx) => {
      const committed = await loadConfirmations(tx, scope);
      const rest = committed.filter((c) => !(canonicalInputKey(c.key) === canonicalInputKey(inputKey) && (c.kind ?? "AMOUNT") === kind));
      const withInputs = (cs: readonly ConfirmationView[]): PipelineArgs => ({ ...args, financials: { ...args.financials!, borrowerInputs: [...(args.financials!.borrowerInputs ?? []), ...cs.map(asBorrowerInput)] } });
      const before = runAgreementPipeline(withInputs(rest));
      const after = runAgreementPipeline(withInputs([...rest, mine]));
      const g = gainOf(capacitySnapshot(before), capacitySnapshot(after));
      const b = ebitdaBoxFromResult(after, [...rest, mine], await loadProposals(tx, scope));
      await tx.customerEbitdaConfirmation.create({ data: { ...scope, inputKey, kind, value, source: mine.source, ...evidence, confirmedBy: input.confirmedBy, idempotencyKey: key, response: { boxId, gain: g } } });
      await saveEbitdaBox(tx, scope, b, boxId);
      return { box: b, gain: g };
    }));
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const seen = await db.customerEbitdaConfirmation.findFirst({ where: { ...scope, idempotencyKey: key } });
    if (!seen) throw err;
    return replayOf(db, scope, seen, { inputKey, kind, value, source: input.source.trim(), confirmedBy: input.confirmedBy, ...evidence });
  }
  return { ok: true, box, gain, boxId };
}

const newBoxId = () => `ebx_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;

export type ProposeOutcome =
  | { ok: true; box: EbitdaBox; boxId: string; proposal: EbitdaProposalView; replayed?: boolean }
  | { ok: false; status: 400 | 404 | 409 | 422; error: string; code?: "NEEDS_BASE" | "IDEMPOTENCY_CONFLICT" | "OUT_OF_RANGE" };

export interface ProposeInput {
  /** The CFO's name for the add-back (a clause label like "(e)", a category, or the clause's opening words). */
  label: string;
  /** Whole USD the CFO proposes for the item. Proposals never count toward EBITDA. */
  value: string;
  source: string;
  /** Evidence kind behind the figure (required: a proposal without stated evidence is not recorded). */
  sourceKind: EvidenceSourceKind;
  sourceRef?: string | null;
  /** Server-side principal id (never from the request body). */
  proposedBy: string;
  idempotencyKey?: string | null;
}

/**
 * CFO proposes a new add-back item (or edits one: same label → a new row supersedes the old; history is kept).
 * The proposal is recorded with its evidence in the same locked transaction as the recomputed box. Whether it can
 * ever count is decided by the agreement's own definition at box-build time: a label matching a permitted category
 * shows MAPPED (it counts only after the amount is confirmed through confirmEbitdaItem, with caps and conditions
 * validated there); a label matching nothing shows NEEDS_INPUT in the box and never flows into EBITDA, baskets,
 * or capacity. The amount is plausibility-checked against the same sourced bound as a confirmation.
 */
export async function proposeEbitdaItem(
  db: EbitdaBoxStore,
  scope: { companyId: string; documentId: string },
  args: PipelineArgs,
  input: ProposeInput,
): Promise<ProposeOutcome> {
  if (!db.customerEbitdaProposal) return { ok: false, status: 400, error: "proposal storage is not available for this store" };
  const store = db.customerEbitdaProposal;
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label || label.length > 200) return { ok: false, status: 400, error: "label (the add-back's name or clause label) is required (max 200 characters)" };
  if (typeof input.source !== "string" || !input.source.trim()) return { ok: false, status: 400, error: "source (the document the figure comes from) is required" };
  if (!input.proposedBy?.trim()) return { ok: false, status: 400, error: "proposedBy (authenticated principal) is required" };
  const evidence = evidenceOf(input);
  if (!evidence) return { ok: false, status: 400, error: "sourceKind must be one of SEC_FILING, OFFICERS_CERTIFICATE, ERP, CFO_ENTERED and sourceRef at most 500 characters" };
  const rawValue = String(input.value ?? "").trim();
  if (/^-\d+$/.test(rawValue)) return { ok: false, status: 422, error: "value must not be negative" };
  if (!/^\d+$/.test(rawValue)) return { ok: false, status: 400, error: "value must be an integer USD amount" };
  const value = BigInt(rawValue).toString();
  if (!args.financials) return { ok: false, status: 422, error: "no issuer financials for this company (set the company CIK)" };
  const idem = input.idempotencyKey?.trim() || null;
  if (idem && idem.length > 200) return { ok: false, status: 400, error: "idempotencyKey is too long (max 200)" };

  const replayProposal = async (seen: EbitdaProposalRow): Promise<ProposeOutcome> => {
    const conflict = (why: string): ProposeOutcome => ({ ok: false, status: 409, code: "IDEMPOTENCY_CONFLICT", error: `idempotencyKey was already used ${why}` });
    if ((seen.proposedBy ?? "") !== input.proposedBy) return conflict("by a different principal");
    const same = canonicalProposalLabel(seen.label) === canonicalProposalLabel(label) && seen.amount === value && seen.source === input.source.trim()
      && (isEvidenceSourceKind(seen.sourceKind) ? seen.sourceKind : "CFO_ENTERED") === evidence.sourceKind && (seen.sourceRef ?? null) === evidence.sourceRef;
    if (!same) return conflict("for a different proposal");
    const r = (seen.response ?? null) as { boxId?: string } | null;
    const row = r?.boxId ? await db.customerEbitdaBox.findUnique({ where: { id: r.boxId } }) : null;
    if (!row || row.companyId !== scope.companyId || row.documentId !== scope.documentId) return conflict("but its original response is not available");
    const box = row.payload as EbitdaBox;
    const view = box.proposals.find((p) => p.id === seen.id) ?? { ...proposalRecord(seen), status: "NEEDS_INPUT" as const, mappedInputKey: null };
    return { ok: true, box, boxId: row.id, proposal: view, replayed: true };
  };

  if (idem) {
    const seen = await store.findFirst({ where: { ...scope, idempotencyKey: idem } });
    if (seen) return replayProposal(seen);
  }

  // Plausibility: the same sourced bound as a CFO confirmation (against the mapped clause when one matches).
  const prior = await loadConfirmations(db, scope);
  const base = runAgreementPipeline({ ...args, financials: { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...prior.map(asBorrowerInput)] } });
  const flags = ((base.xbrl as Xbrl | null)?.addBackTracker ?? []) as AddBackFlag[];
  const lim = plausibleMax((base.xbrl as Xbrl | null)?.ebitda?.base?.value ?? null, args.financials, matchProposalToFlag(label, flags));
  if (!lim.ok) return { ok: false, status: 422, code: "NEEDS_BASE", error: lim.error };
  if (BigInt(value) > lim.bound) return { ok: false, status: 422, code: "OUT_OF_RANGE", error: `value exceeds the plausible maximum (${lim.basis})` };

  const boxId = newBoxId();
  const key = idem ?? newIdempotencyKey();
  let out: { box: EbitdaBox; view: EbitdaProposalView };
  try {
    out = await withDocumentTransaction(db, scope, async (tx) => {
      if (!tx.customerEbitdaProposal) throw new Error("proposal storage is not available inside the transaction");
      const { id } = await tx.customerEbitdaProposal.create({ data: { ...scope, label, amount: value, source: input.source.trim(), ...evidence, proposedBy: input.proposedBy, idempotencyKey: key, response: { boxId } } });
      const mine: EbitdaProposalRecord = { id, label, amount: value, source: input.source.trim(), ...evidence, proposedBy: input.proposedBy, proposedAt: new Date().toISOString() };
      const committedProps = (await loadProposals(tx, scope)).filter((p) => p.id !== id);
      const b = computeEbitdaBox(args, await loadConfirmations(tx, scope), [...committedProps, mine]);
      await saveEbitdaBox(tx, scope, b, boxId);
      return { box: b, view: b.proposals.find((p) => p.id === id) ?? { ...mine, status: "NEEDS_INPUT" as const, mappedInputKey: null } };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const seen = await store.findFirst({ where: { ...scope, idempotencyKey: key } });
    if (!seen) throw err;
    return replayProposal(seen);
  }
  return { ok: true, box: out.box, boxId, proposal: out.view };
}

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
export async function refreshBoxCommitted(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }, load: () => Promise<PipelineArgs | null>): Promise<{ box: EbitdaBox; id: string } | null> {
  const generation = await boxGeneration(db, scope);
  let args: PipelineArgs | null;
  try { args = await load(); } catch (err) { return recordEbitdaBoxFailure(db, scope, err, { generation }); }
  if (!args) return null;
  const a = args;
  try {
    return await withDocumentTransaction(db, scope, async (tx) => {
      const box = computeEbitdaBox(a, await loadConfirmations(tx, scope), await loadProposals(tx, scope));
      const { id } = await saveEbitdaBox(tx, scope, box);
      return { box, id };
    });
  } catch (err) { return recordEbitdaBoxFailure(db, scope, err, { generation }); }
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002" || /unique/i.test(err instanceof Error ? err.message : String(err));

/** Idempotent replay: same principal and same payload → the stored original response; anything else → 409. */
async function replayOf(db: EbitdaBoxStore, scope: { companyId: string; documentId: string }, seen: ConfirmationRow, now: { inputKey: string; kind: ConfirmationKind; value: string; source: string; confirmedBy: string; sourceKind: EvidenceSourceKind; sourceRef: string | null }): Promise<ConfirmOutcome> {
  const conflict = (why: string): ConfirmOutcome => ({ ok: false, status: 409, code: "IDEMPOTENCY_CONFLICT", error: `idempotencyKey was already used ${why}` });
  if ((seen.confirmedBy ?? "") !== now.confirmedBy) return conflict("by a different principal");
  const same = canonicalInputKey(seen.inputKey) === canonicalInputKey(now.inputKey) && seen.kind === now.kind && seen.value === now.value && seen.source === now.source
    && (isEvidenceSourceKind(seen.sourceKind) ? seen.sourceKind : "CFO_ENTERED") === now.sourceKind && (seen.sourceRef ?? null) === now.sourceRef;
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
 *  - otherwise nothing bounds it: NEEDS_BASE.
 * 1e12 is only an outer ceiling on top of a sourced bound, never the bound itself; the message names whichever applied.
 */
function plausibleMax(baseValue: string | null, fin: IssuerFinancials, flag: AddBackFlag | undefined): { ok: true; bound: bigint; basis: string } | { ok: false; error: string } {
  const int = (v: string | null | undefined) => (v != null && /^-?\d+$/.test(v) ? BigInt(v) : null);
  const within = (b: bigint, basis: string) => (b < MAX_CONFIRMED_USD ? { ok: true as const, bound: b, basis } : { ok: true as const, bound: MAX_CONFIRMED_USD, basis: "the 1e12 USD absolute ceiling" });
  const base = int(baseValue);
  if (base != null && base > 0n) return within(10n * base, "10x the reported base EBITDA");
  const c = int(flag?.cap?.amount ?? null);
  if (c != null && c > 0n) return within(10n * c, "10x the clause's dollar cap");
  const rev = int(fin.values.find((v) => v.metric === "revenue")?.value);
  if (rev != null && rev > 0n) return within(rev / 2n, "50% of the issuer's reported revenue");
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
      proposals: prev?.proposals ?? [],
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
    capacityImpact: { maxLeverage: null, leverageCapacity: null, leverageBound: null, extraDebtCapacityIfConfirmed: null }, items: [], confirmations: [], proposals: [], reason,
  };
}
