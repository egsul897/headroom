"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Banner, Card, Chip } from "@/components/ui";
import { OutcomeBadge } from "@/components/product/OutcomeBadge";
import { fmtM, fmtX } from "@/lib/format";
import type {
  StructuredTransactionKind,
  UnifiedSimulateResultView,
} from "@/lib/product/unified-customer/client-safe";

const KINDS: Array<{ id: StructuredTransactionKind; label: string }> = [
  { id: "SECURED_DEBT", label: "Secured debt" },
  { id: "UNSECURED_DEBT", label: "Unsecured debt" },
  { id: "SECURED_NOTE", label: "Secured notes" },
  { id: "REVOLVER_DRAW", label: "Revolver draw" },
  { id: "HYBRID_SECURITY", label: "Hybrid security" },
  { id: "RESTRICTED_PAYMENT", label: "Dividend / RP" },
  { id: "INVESTMENT", label: "Investment" },
  { id: "ACQUISITION", label: "Acquisition" },
  { id: "REFINANCING", label: "Refinancing" },
  { id: "ASSET_SALE", label: "Asset sale" },
];

export function UnifiedSimulateClient({
  companyId,
  stateFingerprint,
  asOfDateIso,
  initialKind,
  initialAmount,
  initialSecured,
  initialDate,
  initialCurrency,
  handoffId,
  handoffQuestion,
}: {
  companyId: string;
  stateFingerprint: string;
  asOfDateIso: string;
  initialKind?: StructuredTransactionKind;
  initialAmount?: number;
  initialSecured?: boolean | null;
  initialDate?: string | null;
  initialCurrency?: string;
  handoffId?: string | null;
  handoffQuestion?: string | null;
}) {
  const [kind, setKind] = useState<StructuredTransactionKind>(initialKind ?? "SECURED_DEBT");
  const [amount, setAmount] = useState(initialAmount ?? 100);
  const [secured, setSecured] = useState<boolean>(
    initialSecured ?? (initialKind !== "UNSECURED_DEBT"),
  );
  const [currency, setCurrency] = useState(initialCurrency ?? "USD");
  const [entity, setEntity] = useState("Borrower");
  const [evaluationDate, setEvaluationDate] = useState(initialDate ?? asOfDateIso);
  const [result, setResult] = useState<UnifiedSimulateResultView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Cleared immediately when amount/kind changes so stale evidence cannot linger. */
  const priorRequestFp = useRef<string | null>(null);
  const requestGen = useRef(0);

  const run = useCallback(async () => {
    const gen = ++requestGen.current;
    // Invalidate any displayed result before the new request returns.
    setResult(null);
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/product/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId,
          kind,
          amountMillions: amount,
          secured: kind === "UNSECURED_DEBT" ? false : kind === "SECURED_DEBT" || kind === "SECURED_NOTE" ? true : secured,
          evaluationDate,
          currency,
          expectedStateFingerprint: stateFingerprint,
          priorRequestFingerprint: priorRequestFp.current,
        }),
      });
      const data = (await res.json()) as UnifiedSimulateResultView & { error?: string };
      if (gen !== requestGen.current) return; // superseded by a newer amount change
      if (!res.ok || data.error) {
        setError(data.error ?? "Simulation failed");
        priorRequestFp.current = null;
        return;
      }
      priorRequestFp.current = data.requestFingerprint;
      setResult(data);
    } catch {
      if (gen !== requestGen.current) return;
      setError("Simulation request failed — no stale result retained.");
      priorRequestFp.current = null;
    } finally {
      if (gen === requestGen.current) setPending(false);
    }
  }, [companyId, kind, amount, secured, evaluationDate, currency, stateFingerprint]);

  // Recompute whenever amount/kind/security changes — never reuse prior evidence.
  useEffect(() => {
    const t = setTimeout(() => {
      void run();
    }, 120);
    return () => clearTimeout(t);
  }, [run]);

  return (
    <div className="stack">
      {handoffId && (
        <Banner tone="amber">
          Loaded from Ask handoff <span className="mono">{handoffId}</span>
          {handoffQuestion ? ` — “${handoffQuestion}”` : ""}. Changing the amount clears prior
          evidence and recomputes against the shared verified engine.
        </Banner>
      )}

      <Card>
        <div className="card-title">Simulate</div>
        <div className="card-subtitle">
          Shared verified engine · as-of {asOfDateIso} · state {stateFingerprint.slice(0, 10)}…
          Results are not legal approvals. A green ratio alone is never shown as permission.
        </div>
        <div className="button-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`button ${kind === k.id ? "active" : ""}`}
              onClick={() => {
                priorRequestFp.current = null;
                setResult(null);
                setKind(k.id);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="field-label">Amount ({currency} millions)</span>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
              {fmtM(amount)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={8000}
            step={25}
            value={amount}
            onChange={(e) => {
              priorRequestFp.current = null;
              setResult(null);
              setAmount(Number(e.target.value));
            }}
          />
          <input
            type="number"
            className="input"
            style={{ marginTop: 8, maxWidth: 160 }}
            value={amount}
            min={0}
            step={1}
            onChange={(e) => {
              priorRequestFp.current = null;
              setResult(null);
              setAmount(Number(e.target.value));
            }}
          />
        </div>

        <div className="button-row" style={{ marginTop: 12 }}>
          <label className="field-label" style={{ marginRight: 8 }}>
            Entity
            <select
              className="input"
              style={{ marginLeft: 8 }}
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
            >
              <option value="Borrower">Borrower</option>
              <option value="Guarantor">Guarantor</option>
              <option value="Restricted Subsidiary">Restricted Subsidiary</option>
            </select>
          </label>
          <label className="field-label">
            Currency
            <select
              className="input"
              style={{ marginLeft: 8 }}
              value={currency}
              onChange={(e) => {
                priorRequestFp.current = null;
                setResult(null);
                setCurrency(e.target.value);
              }}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
          <label className="field-label">
            Evaluation date
            <input
              type="date"
              className="input"
              style={{ marginLeft: 8 }}
              value={evaluationDate}
              onChange={(e) => {
                priorRequestFp.current = null;
                setResult(null);
                setEvaluationDate(e.target.value);
              }}
            />
          </label>
        </div>

        {(kind === "SECURED_DEBT" ||
          kind === "UNSECURED_DEBT" ||
          kind === "SECURED_NOTE" ||
          kind === "REVOLVER_DRAW" ||
          kind === "HYBRID_SECURITY" ||
          kind === "ACQUISITION" ||
          kind === "REFINANCING") && (
          <div className="button-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className={`button ${secured ? "active" : ""}`}
              onClick={() => {
                priorRequestFp.current = null;
                setResult(null);
                setSecured(true);
              }}
            >
              Secured
            </button>
            <button
              type="button"
              className={`button ${!secured ? "active" : ""}`}
              onClick={() => {
                priorRequestFp.current = null;
                setResult(null);
                setSecured(false);
              }}
            >
              Unsecured
            </button>
          </div>
        )}
      </Card>

      {pending && !result && (
        <Banner tone="amber">Recomputing against verified state — prior evidence cleared.</Banner>
      )}
      {error && <Banner tone="red">{error}</Banner>}
      {result?.stale && (
        <Banner tone="red">
          Stale state rejected ({result.staleReason}).{" "}
          <Link href={`/${companyId}/simulate`}>Reload Simulate</Link> to refresh verified inputs.
        </Banner>
      )}

      {result && !result.stale && (
        <>
          <Card>
            <div className="card-title">Outcome</div>
            <OutcomeBadge kind={result.outcome.kind} rationale={result.outcome.rationale} />
            <div className="row" style={{ marginTop: 10 }}>
              <div className="row-label">Engine status</div>
              <div className="row-value">
                <Chip tone="idle">{result.engineStatus}</Chip>
              </div>
            </div>
            <div className="row">
              <div className="row-label">Request fingerprint</div>
              <div className="row-value mono" style={{ fontSize: 12 }}>
                {result.requestFingerprint}
              </div>
            </div>
            <div className="row" style={{ borderBottom: "none" }}>
              <div className="row-label">Authority</div>
              <div className="row-value" style={{ fontSize: 12 }}>
                {result.authority.capacityAuthority} — {result.authority.note}
              </div>
            </div>
          </Card>

          {(result.proForma.totalNetLeverage != null ||
            result.proForma.seniorSecuredNetLeverage != null) && (
            <Card>
              <div className="card-title">Pro forma financial changes</div>
              {result.proForma.grossDebtDelta != null && (
                <div className="row">
                  <div className="row-label">Gross debt delta</div>
                  <div className="row-value mono">{fmtM(result.proForma.grossDebtDelta)}</div>
                </div>
              )}
              {result.proForma.totalNetLeverage != null && (
                <div className="row">
                  <div className="row-label">Pro forma TNL</div>
                  <div className="row-value mono">{fmtX(result.proForma.totalNetLeverage)}</div>
                </div>
              )}
              {result.proForma.seniorSecuredNetLeverage != null && (
                <div className="row" style={{ borderBottom: "none" }}>
                  <div className="row-label">Pro forma SSNL</div>
                  <div className="row-value mono">{fmtX(result.proForma.seniorSecuredNetLeverage)}</div>
                </div>
              )}
            </Card>
          )}

          {result.prePostRatios.length > 0 && (
            <Card>
              <div className="card-title">Pre / post ratios</div>
              <div className="card-subtitle">
                Each row cites its controlling section. A single clear ratio is not permission.
              </div>
              {result.prePostRatios.map((r, i) => (
                <div className="row" key={`${r.label}-${i}`}>
                  <div>
                    <div className="row-label">{r.label}</div>
                    <div className="row-note">
                      {r.documentName} · {r.sectionRef}
                      {r.threshold != null ? ` · threshold ${r.threshold.toFixed(2)}x` : ""}
                    </div>
                  </div>
                  <div className="row-value mono">
                    {r.pre != null ? fmtX(r.pre) : "n/m"} → {r.post != null ? fmtX(r.post) : "n/m"}{" "}
                    <Chip tone={r.status === "clear" ? "pass" : r.status === "blocked" ? "trip" : "idle"}>
                      {r.status}
                    </Chip>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {result.basketConsumption.length > 0 && (
            <Card>
              <div className="card-title">Basket consumption</div>
              {result.basketConsumption.map((s) => (
                <div className="row" key={s.code}>
                  <div>
                    <div className="row-label">{s.basketName}</div>
                    <div className="row-note">
                      {s.sectionRef} · {s.code}
                    </div>
                  </div>
                  <div className="row-value mono">{fmtM(s.allocatedMillions)}</div>
                </div>
              ))}
            </Card>
          )}

          <Card>
            <div className="card-title">Binding constraints & provenance</div>
            {result.bindingConstraints.length === 0 && (
              <div className="row-note">No single binding provision identified for this run.</div>
            )}
            {result.bindingConstraints.map((c, i) => (
              <div className="row" key={`${c.documentId}-${c.sectionRef}-${i}`}>
                <div>
                  <div className="row-label">{c.documentName}</div>
                  <div className="row-note">
                    §{c.sectionRef}
                    {c.basketName ? ` · ${c.basketName}` : ""}
                    {c.note ? ` — ${c.note}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </Card>

          {result.crossDocumentRestrictions.length > 0 && (
            <Card>
              <div className="card-title">Cross-document restrictions</div>
              {result.crossDocumentRestrictions.map((c) => (
                <div className="row" key={c.documentId}>
                  <div>
                    <div className="row-label">{c.documentName}</div>
                    <div className="row-note">{c.note}</div>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <Card>
            <div className="card-title">Source-backed explanations</div>
            {result.explanations.map((e, i) => (
              <div className="row" key={i} style={i === result.explanations.length - 1 ? { borderBottom: "none" } : undefined}>
                <div className="row-note">
                  {e.text}
                  {e.citation
                    ? ` [${e.citation.documentName} §${e.citation.sectionRef}]`
                    : ""}
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <div className="card-title">Document by document</div>
            {result.perDocument.map((d) => (
              <div className="row" key={d.documentId}>
                <div>
                  <div className="row-label">{d.documentName}</div>
                  <div className="row-note">
                    {d.sectionRef ? `§${d.sectionRef}` : ""}
                    {d.basketName ? ` · ${d.basketName}` : ""}
                    {d.reason ? ` — ${d.reason}` : ""}
                  </div>
                </div>
                <Chip
                  tone={
                    d.status === "clear" ? "pass" : d.status === "blocked" ? "trip" : "idle"
                  }
                >
                  {d.status}
                </Chip>
              </div>
            ))}
          </Card>
        </>
      )}

      <div className="button-row">
        <Link className="button" href={`/${companyId}/position`}>
          Position
        </Link>
        <Link className="button" href={`/${companyId}/ask`}>
          Ask
        </Link>
      </div>
    </div>
  );
}
