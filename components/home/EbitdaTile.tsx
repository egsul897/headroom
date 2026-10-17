"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { AdjustedEbitdaCard, CouldntCompute, EbitdaDrawerHeader } from "@/components/home/EbitdaGrid";
import { LockIcon } from "@/components/home/icons";
import { DetailDrawer } from "@/components/motion/DetailDrawer";
import { useToast } from "@/components/motion/Toast";
import { readSessionHandle, sessionAuthorizationHeaders } from "@/lib/capacity/identity/browser-session";
import { createConfirmKeys, ebitdaCallError, isPreparingMiss, type ConfirmKind } from "@/lib/home/ebitda-confirm";
import {
  canConfirm,
  confirmedAddBackTotal,
  ebitdaTotals,
  formatKpiUsd,
  formatUsd,
  isIntegerAmount,
  listBadge,
  type EbitdaAddBack,
} from "@/lib/home/ebitda-tile";

const CONFIDENCE_WORD = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" } as const;

/** False until the host meta tag is read. A missing handle is not a token. */
function useHasSession() {
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    setHasSession(readSessionHandle() != null);
  }, []);
  return hasSession;
}

function SignInToConfirm() {
  return (
    <div className="ebitda-signin">
      <button type="button" className="button ebitda-signin-button" disabled>
        <LockIcon />
        Sign in to confirm
      </button>
    </div>
  );
}

/**
 * One dashboard tile. A loaded package shows total EBITDA, additional available,
 * and how many add-backs still need a person. An unread package shows Needs input.
 */
export function EbitdaTile({
  base = null,
  items = null,
  sample = false,
  initialView = null,
  companyId = null,
  documents = null,
  preparingIds = null,
  inlineError = null,
  failedReason = null,
  staleSince = null,
}: {
  base?: string | null;
  items?: readonly EbitdaAddBack[] | null;
  sample?: boolean;
  initialView?: string | null;
  companyId?: string | null;
  documents?: readonly { id: string; name: string }[] | null;
  preparingIds?: readonly string[] | null;
  inlineError?: string | null;
  failedReason?: string | null;
  staleSince?: string | null;
}) {
  if (!sample && base == null && companyId && documents && documents.length > 0) {
    return <EbitdaApiTile companyId={companyId} documents={documents} initialView={initialView} preparingIds={preparingIds ?? []} />;
  }
  return (
    <EbitdaLocalTile
      base={base}
      items={items}
      sample={sample}
      initialView={initialView}
      inlineError={inlineError}
      failedReason={failedReason}
      staleSince={staleSince}
    />
  );
}

function EbitdaLocalTile({
  base = null,
  items = null,
  sample = false,
  initialView = null,
  inlineError = null,
  failedReason = null,
  staleSince = null,
}: {
  base?: string | null;
  items?: readonly EbitdaAddBack[] | null;
  sample?: boolean;
  initialView?: string | null;
  inlineError?: string | null;
  failedReason?: string | null;
  staleSince?: string | null;
}) {
  const loaded = base != null && items != null;
  const hasSession = useHasSession();
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(() => new Set());
  const [view, setView] = useState<string | null>(initialView ?? null);
  const pushToast = useToast();
  const totals = loaded ? ebitdaTotals(base, items, confirmed) : null;
  const openItem = loaded && view && view !== "list" ? items.find((item) => item.id === view) ?? null : null;
  const drawerOpen = view != null;
  const attention = totals?.attention ?? 0;

  const title = openItem ? openItem.name : "Adjusted EBITDA";

  function confirm(item: EbitdaAddBack) {
    if (!readSessionHandle() || !canConfirm(item) || confirmed.has(item.id)) return;
    setConfirmed((current) => new Set(current).add(item.id));
    pushToast(`${item.name} added to the total`, () => {
      setConfirmed((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    });
  }

  function undo(item: EbitdaAddBack) {
    setConfirmed((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }

  const figure = loaded && totals ? formatKpiUsd(totals.total) ?? "Needs input" : "Needs input";

  return (
    <AdjustedEbitdaCard figure={figure} needingYou={loaded ? attention : null} open={drawerOpen} onOpen={() => setView("list")}>
      <DetailDrawer open={drawerOpen} title={openItem ? title : "How we got this"} onClose={() => setView(null)}>
        {inlineError ? <p className="ebitda-inline-error">{inlineError}</p> : null}
        {openItem ? (
          <ItemSheet
            item={openItem}
            confirmed={confirmed.has(openItem.id)}
            sample={sample}
            signIn={!hasSession}
            onBack={() => setView("list")}
            onConfirm={() => confirm(openItem)}
            onUndo={() => undo(openItem)}
          />
        ) : (
          <>
            <EbitdaDrawerHeader
              base={loaded ? base : null}
              confirmed={loaded ? confirmedAddBackTotal(items, confirmed) : null}
              additional={loaded && totals ? totals.additional : null}
            />
            {failedReason ? <CouldntCompute reason={failedReason} staleSince={staleSince} onRetry={() => undefined} /> : null}
            {!loaded || !items ? (
              <p className="drawer-note">No add-backs are loaded.</p>
            ) : (
              <ul className="ebitda-list">
                {items.map((item) => {
                  const needs = !confirmed.has(item.id);
                  const amount = formatUsd(item.amount);
                  return (
                    <li key={item.id}>
                      <button type="button" className="ebitda-row" onClick={() => setView(item.id)}>
                        {needs ? <span className="need-dot" title="Needs you" /> : <span className="need-dot is-quiet" aria-hidden="true" />}
                        <span className="ebitda-row-name">
                          {item.name}
                          <span className="ebitda-source-chip">{item.source?.concept ?? "No source"}</span>
                        </span>
                        <span className="ebitda-row-amount">{amount ?? "Needs input"}</span>
                        <StatusBadge status={listBadge(item)} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="proof-meta">
              <span className="proof-chip">Clause is not loaded</span>
              <span>Page is not loaded</span>
              <span>Needs input</span>
            </div>
          </>
        )}
      </DetailDrawer>
    </AdjustedEbitdaCard>
  );
}

type EbitdaBoxItem = {
  inputKey: string;
  label: string;
  clause: string;
  status: string;
  amount: string | null;
  counted: string;
  source: Array<{ kind: string; ref: string; value: string }>;
  cap: { text: string; amount: string | null; headroom: string | null } | null;
  potentialDebtCapacity: string | null;
  note: string;
};

type EbitdaBoxPayload = {
  status: string;
  totalEbitda: string | null;
  extraAvailableIfConfirmed: string;
  confirmedAddBacks?: string;
  base?: { concept: string; value: string } | null;
  reason: string;
  staleSince?: string | null;
  lastGoodBoxId?: string | null;
  items: EbitdaBoxItem[];
};

function EbitdaApiTile({
  companyId,
  documents,
  initialView,
  preparingIds,
}: {
  companyId: string;
  documents: readonly { id: string; name: string }[];
  initialView?: string | null;
  preparingIds: readonly string[];
}) {
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [box, setBox] = useState<EbitdaBoxPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const hasSession = useHasSession();
  const needsSignIn = !hasSession || rejected;
  const [preparing, setPreparing] = useState(preparingIds.includes(documents[0]?.id ?? ""));
  const [view, setView] = useState<string | null>(initialView ?? null);
  const [pending, setPending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const keys = useMemo(() => createConfirmKeys(), []);
  const document = documents.find((row) => row.id === documentId) ?? documents[0];
  const scheduled = preparingIds.includes(documentId);

  useEffect(() => {
    let cancel = false;
    let timer = 0;
    setBox(null);
    setError(null);
    async function load(attempt: number) {
      if (scheduled || attempt > 0) setPreparing(true);
      try {
        const res = await fetch(`/api/companies/${companyId}/documents/${documentId}/ebitda`, {
          headers: sessionAuthorizationHeaders(),
        });
        const body = (await res.json()) as EbitdaBoxPayload & { error?: string; status?: string };
        if (cancel) return;
        if (res.ok && body.status === "SCHEDULED") {
          setPreparing(true);
          setBox(null);
          if (attempt < 8) timer = window.setTimeout(() => load(attempt + 1), 2000);
          return;
        }
        if (!res.ok) {
          if (isPreparingMiss(res.status, body.error) && attempt < 8) {
            setPreparing(true);
            setError(null);
            timer = window.setTimeout(() => load(attempt + 1), 2000);
            return;
          }
          const failure = ebitdaCallError(res.status, body.error);
          setPreparing(false);
          if (failure.signIn) {
            setRejected(true);
            setError(null);
            return;
          }
          setError(failure.text);
          return;
        }
        setPreparing(false);
        setBox(body);
      } catch {
        if (!cancel) {
          setPreparing(false);
          setError("The EBITDA box could not be loaded.");
        }
      }
    }
    void load(0);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [companyId, documentId, scheduled]);

  const attention = box?.items.filter((item) => item.status === "PENDING" || item.status === "CONDITIONAL").length ?? 0;
  const openItem = box?.items.find((item) => item.inputKey === view) ?? null;

  async function confirm(item: EbitdaBoxItem) {
    if (!readSessionHandle()) {
      setRejected(true);
      setError(null);
      return;
    }
    const source = item.source[0]?.ref ?? "";
    const kind: ConfirmKind = item.status === "CONDITIONAL" ? "LENDER_APPROVAL" : "AMOUNT";
    if (kind === "AMOUNT" && !isIntegerAmount(item.amount)) return;
    const idempotencyKey = keys.forClick(item.inputKey, kind);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/documents/${documentId}/ebitda/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json", ...sessionAuthorizationHeaders() },
        body: JSON.stringify({
          inputKey: item.inputKey,
          value: kind === "LENDER_APPROVAL" ? undefined : item.amount,
          source,
          kind,
          idempotencyKey,
        }),
      });
      const body = (await res.json()) as { error?: string; code?: string; box?: EbitdaBoxPayload; replayed?: boolean };
      const failure = ebitdaCallError(res.status, body.error, body.code);
      if (failure.signIn) {
        setRejected(true);
        setError(null);
        return;
      }
      if (failure.refetch) {
        const fresh = await fetch(`/api/companies/${companyId}/documents/${documentId}/ebitda`, {
          headers: sessionAuthorizationHeaders(),
        });
        const current = (await fresh.json()) as EbitdaBoxPayload & { error?: string };
        if (fresh.ok) setBox(current);
        setError(failure.text);
        return;
      }
      if (!res.ok || !body.box) {
        setError(failure.text);
        return;
      }
      keys.finish(item.inputKey, kind);
      // A replay returns the original box and gain. Show that box only, so the gain is not added twice.
      setBox(body.box);
      setError(null);
      setView(null);
    } catch {
      setError("Confirm was refused.");
    } finally {
      setPending(false);
    }
  }

  async function retry() {
    if (!readSessionHandle()) {
      setRejected(true);
      setError(null);
      return;
    }
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/documents/${documentId}/ebitda?refresh=1`, {
        headers: sessionAuthorizationHeaders(),
      });
      const body = (await res.json()) as EbitdaBoxPayload & { error?: string; code?: string };
      const failure = ebitdaCallError(res.status, body.error, body.code);
      if (failure.signIn) {
        setRejected(true);
        return;
      }
      if (!res.ok) {
        setError(failure.text);
        return;
      }
      setBox(body);
    } catch {
      setError("The EBITDA box could not be loaded.");
    } finally {
      setRetrying(false);
    }
  }

  const failed = box?.status === "FAILED";
  const figure = formatKpiUsd(box?.totalEbitda) ?? "Needs input";

  return (
    <AdjustedEbitdaCard
      figure={figure}
      needingYou={box ? attention : null}
      preparing={preparing}
      open={view != null}
      onOpen={() => setView("list")}
    >
      {documents.length > 1 ? (
        <label className="ebitda-caption">
          Agreement
          <select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
            {documents.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <DetailDrawer open={view != null} title={openItem?.label ?? "How we got this"} onClose={() => setView(null)}>
        {error ? <p className="ebitda-inline-error">{error}</p> : null}
        {openItem ? (
          <ApiItem item={openItem} pending={pending} signIn={needsSignIn} onBack={() => setView("list")} onConfirm={() => confirm(openItem)} />
        ) : (
          <>
            <EbitdaDrawerHeader
              base={box?.base?.value ?? null}
              confirmed={box?.confirmedAddBacks ?? null}
              additional={box?.extraAvailableIfConfirmed ?? null}
            />
            {failed ? (
              <CouldntCompute
                reason={box?.reason || "The EBITDA box could not be computed."}
                staleSince={box?.staleSince}
                retrying={retrying}
                onRetry={() => void retry()}
              />
            ) : null}
            {needsSignIn ? <SignInToConfirm /> : null}
            {!box || box.items.length === 0 ? (
              <p className="drawer-note">{preparing ? "Preparing EBITDA…" : "No add-backs are loaded."}</p>
            ) : (
              <ul className="ebitda-list">
                {box.items.map((item) => {
                  const needs = item.status === "PENDING" || item.status === "CONDITIONAL" || item.status === "NEEDS_INPUT";
                  return (
                    <li key={item.inputKey}>
                      <button type="button" className="ebitda-row" onClick={() => setView(item.inputKey)}>
                        {needs ? <span className="need-dot" title="Needs you" /> : <span className="need-dot is-quiet" aria-hidden="true" />}
                        <span className="ebitda-row-name">
                          {item.label}
                          <span className="ebitda-source-chip">{item.source[0]?.ref ?? "No source"}</span>
                        </span>
                        <span className="ebitda-row-amount">{formatUsd(item.amount) ?? "Needs input"}</span>
                        <StatusBadge status={item.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="proof-meta">
              <span className="proof-chip">Clause is not loaded</span>
              <span>Page is not loaded</span>
              <span>Needs input</span>
            </div>
          </>
        )}
      </DetailDrawer>
    </AdjustedEbitdaCard>
  );
}

function ApiItem({
  item,
  pending,
  signIn,
  onBack,
  onConfirm,
}: {
  item: EbitdaBoxItem;
  pending: boolean;
  signIn: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const source = item.source[0];
  const allowed = item.status === "CONDITIONAL" ? Boolean(source?.ref || item.clause) : item.status !== "CONFIRMED" && isIntegerAmount(item.amount) && Boolean(source?.ref);
  return (
    <div className="ebitda-sheet">
      <button type="button" className="button button-quiet" onClick={onBack}>
        All add-backs
      </button>
      <p className={formatUsd(item.amount) ? "ebitda-hero" : "ebitda-hero is-missing"}>{formatUsd(item.amount) ?? "Needs input"}</p>
      {signIn && (allowed || item.status === "CONFIRMED") ? <SignInToConfirm /> : null}
      <div className="ebitda-badges">
        <StatusBadge status={item.status} />
      </div>
      <p className="drawer-note">{item.note}</p>
      <h3 className="sheet-label">Source</h3>
      <p>{source ? `${source.kind} · ${source.ref}${formatUsd(source.value) ? ` · ${formatUsd(source.value)}` : ""}` : "Needs input"}</p>
      <h3 className="sheet-label">Clause</h3>
      <blockquote className="ebitda-clause">{item.clause || "Needs input"}</blockquote>
      <h3 className="sheet-label">Cap</h3>
      <p>{item.cap?.text ?? "Needs input"}</p>
      <p className="ebitda-caption">Cap amount {formatUsd(item.cap?.amount) ?? "Needs input"}</p>
      <p className="ebitda-caption">Remaining {formatUsd(item.cap?.headroom) ?? "Needs input"}</p>
      <h3 className="sheet-label">Capacity impact</h3>
      <p className={formatUsd(item.potentialDebtCapacity) ? "ebitda-hero" : "ebitda-hero is-missing"}>
        {formatUsd(item.potentialDebtCapacity) ?? "Needs input"}
      </p>
      <div className="ebitda-action">
        {signIn ? null : allowed ? (
          <button type="button" className="button button-primary" disabled={pending} onClick={onConfirm}>
            {pending ? "Confirming…" : "Confirm"}
          </button>
        ) : (
          <p className="drawer-note">{item.status === "CONFIRMED" ? "Confirmed from the EBITDA box." : "No sourced amount is on this item."}</p>
        )}
      </div>
    </div>
  );
}

function ItemSheet({
  item,
  confirmed,
  sample,
  signIn,
  onBack,
  onConfirm,
  onUndo,
}: {
  item: EbitdaAddBack;
  confirmed: boolean;
  sample: boolean;
  signIn: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onUndo: () => void;
}) {
  const amount = formatUsd(item.amount);
  const impact = formatUsd(item.impact);
  const capAmount = item.cap ? formatUsd(item.cap.amount) : null;
  const remaining = formatUsd(item.capHeadroom);
  const allowed = canConfirm(item);

  return (
    <div className="ebitda-sheet">
      <button type="button" className="button button-quiet" onClick={onBack}>
        All add-backs
      </button>
      <p className={amount ? "ebitda-hero" : "ebitda-hero is-missing"}>{amount ?? "Needs input"}</p>
      {signIn && (allowed || confirmed) ? <SignInToConfirm /> : null}
      <div className="ebitda-badges">
        <StatusBadge status={item.flagStatus} />
        <StatusBadge status={item.lineStatus} />
        {item.conditional ? <StatusBadge status={item.conditional} /> : null}
        {item.bindingTier ? <StatusBadge status={item.bindingTier} /> : null}
      </div>
      <p className="drawer-note">
        Confidence {CONFIDENCE_WORD[item.confidence]}. {item.note}
        {sample ? " Sample illustration." : ""}
      </p>
      <h3 className="sheet-label">Source</h3>
      {item.source ? (
        <p>
          {item.source.concept}
          {formatUsd(item.source.current) ? ` · ${formatUsd(item.source.current)}` : ""}
          {item.source.currentPeriodEnd ? ` · ${item.source.currentPeriodEnd}` : ""}
          {item.source.prior != null && formatUsd(item.source.prior) ? ` · prior ${formatUsd(item.source.prior)}` : ""}
          {item.source.priorPeriodEnd ? ` · ${item.source.priorPeriodEnd}` : ""}
        </p>
      ) : (
        <p className="is-missing">Needs input</p>
      )}
      <h3 className="sheet-label">Clause</h3>
      <blockquote className="ebitda-clause">
        <span className="ebitda-caption">{item.clause.label}</span>
        {item.clause.text}
      </blockquote>
      <h3 className="sheet-label">Cap</h3>
      <p>{item.cap?.text ?? "Needs input"}</p>
      <p className="ebitda-caption">Cap amount {item.cap ? capAmount ?? "Needs input" : "Needs input"}</p>
      <p className="ebitda-caption">Remaining {remaining ?? "Needs input"}</p>
      <h3 className="sheet-label">Capacity impact</h3>
      <p className={impact ? "ebitda-hero" : "ebitda-hero is-missing"}>{impact ?? "Needs input"}</p>
      <div className="ebitda-action">
        {signIn ? null : confirmed ? (
          <button type="button" className="button button-quiet" onClick={onUndo}>
            Undo
          </button>
        ) : allowed ? (
          <button type="button" className="button button-primary" onClick={onConfirm}>
            Confirm
          </button>
        ) : (
          <p className="drawer-note">No sourced amount is on this flag.</p>
        )}
      </div>
    </div>
  );
}
