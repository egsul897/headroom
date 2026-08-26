"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner, Card, Chip, ProgressBar, SectionRef, type ChipTone } from "@/components/ui";
import { ProvisionTrace } from "@/components/ProvisionTrace";
import { fmtCapacity, fmtM, fmtX } from "@/lib/format";
import type { DefinedTermLite } from "@/lib/coherent";
import {
  computeCovenantPosition,
  documentsWithAssetSale,
  documentsWithRpWaterfall,
  simulateAssetSale,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type CompanyCovenantData,
  type CovenantPosition,
  type DebtIncurrenceSimulation,
  type DocumentInput,
  type RestrictedPaymentKind,
  type SolverNativeCompanyContext,
  type TransactionStatus,
} from "@/lib/covenant-engine";
import { commitRestrictedPayment } from "../ledger/actions";

type ActionType = "debt" | "rp" | "investment" | "assetSale";
type DefinedTermsMap = Record<string, DefinedTermLite[]>;
/** Raw Document rows (with `notes`) - the engine's DocumentInput deliberately omits display-only fields. */
type DocumentRow = { id: string; name: string; notes: string | null };

interface SerializableSolverContext extends Omit<SolverNativeCompanyContext, "activationState"> {
  activationState: Omit<SolverNativeCompanyContext["activationState"], "unknownKeys"> & { unknownKeysArray: string[] };
}

const RESULT_TONE: Record<TransactionStatus, "ok" | "blocked" | "review"> = {
  clear: "ok",
  blocked: "blocked",
  review_required: "review",
  not_tested: "review",
};

const STATUS_TITLE: Record<TransactionStatus, string> = {
  clear: "Permitted",
  blocked: "Blocked",
  review_required: "Review required",
  not_tested: "Not tested",
};

/**
 * Every OTHER document governing this company that this simulation did NOT
 * test - a company can have any number of documents, and a transaction type
 * modeled in one may not be modeled (or may be separately restricted) in
 * another. Uses each document's own `notes` (DB-sourced) rather than any
 * hardcoded prose, so this generalizes to whatever documents/notes exist.
 */
function OtherDocumentsCaveat({
  documents,
  testedDocumentId,
  transactionLabel,
}: {
  documents: DocumentRow[];
  testedDocumentId: string | undefined;
  transactionLabel: string;
}) {
  const others = documents.filter((d) => d.id !== testedDocumentId);
  if (others.length === 0) return null;
  return (
    <>
      {others.map((d) => (
        <Banner key={d.id} tone="red">
          Not tested here: this verdict only reflects the document tested above. {d.name} may separately restrict{" "}
          {transactionLabel}.{d.notes ? ` ${d.notes}` : " Its basket configuration for this transaction type has not been entered."}
        </Banner>
      ))}
    </>
  );
}

/**
 * The Simulate tab (task "MAKE THE UI MATCH THE PROTOTYPE EXACTLY" -
 * reference/headroom-coherent.jsx's Simulate tab). Generalized off
 * app/simulate/SimulateClient.tsx (Coherent-only) - identical real-engine
 * calls (lib/covenant-engine.ts, unmodified), now companyId-scoped, and the
 * debt panel additionally passes a real `solverContext` (reconstructed here
 * from the serializable prop shape, same pattern as DashboardClient) so a
 * solver-native document is genuinely evaluated rather than silently
 * skipped - previously a real gap even for Coherent.
 */
export function SimulateClient({
  companyId,
  data,
  documents,
  definedTermsByProvision,
  solverContext,
}: {
  companyId: string;
  data: CompanyCovenantData;
  documents: DocumentRow[];
  definedTermsByProvision: DefinedTermsMap;
  solverContext: SerializableSolverContext;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [actionType, setActionType] = useState<ActionType>("debt");
  const [simAmt, setSimAmt] = useState(1000);
  const [simSecured, setSimSecured] = useState(true);
  const [rpAmt, setRpAmt] = useState(200);
  const [invAmt, setInvAmt] = useState(200);
  const [saleAmt, setSaleAmt] = useState(300);
  const [saleReinvest, setSaleReinvest] = useState(true);

  // Pure, deterministic - safe to recompute on every keystroke/drag with no server round trip.
  // `data` came from Postgres via the server component; this is the SAME engine module used there.
  const position = useMemo(() => computeCovenantPosition(data), [data]);
  const fullSolverContext: SolverNativeCompanyContext = useMemo(
    () => ({ ...solverContext, activationState: { ...solverContext.activationState, unknownKeys: new Set(solverContext.activationState.unknownKeysArray) } }),
    [solverContext]
  );

  function commit(kind: "DIVIDEND" | "INVESTMENT", amount: number) {
    startTransition(async () => {
      await commitRestrictedPayment(companyId, kind, amount);
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <Card>
        <div className="card-title">What are you testing?</div>
        <div className="card-subtitle">
          Every action type below is tested against whatever documents and basket configuration exist for this
          company in the database.
        </div>
        <div className="button-row">
          {(
            [
              ["debt", "Debt incurrence"],
              ["rp", "Dividend / buyback"],
              ["investment", "Investment"],
              ["assetSale", "Asset sale"],
            ] as [ActionType, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`button ${actionType === id ? "active" : ""}`}
              onClick={() => setActionType(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {actionType === "debt" && (
        <DebtPanel
          data={data}
          position={position}
          solverContext={fullSolverContext}
          simAmt={simAmt}
          setSimAmt={setSimAmt}
          simSecured={simSecured}
          setSimSecured={setSimSecured}
          definedTermsByProvision={definedTermsByProvision}
        />
      )}

      {actionType === "rp" && (
        <RpPanel
          data={data}
          documents={documents}
          position={position}
          amount={rpAmt}
          setAmount={setRpAmt}
          kind="dividend"
          onCommit={(amt) => commit("DIVIDEND", amt)}
          pending={isPending}
          definedTermsByProvision={definedTermsByProvision}
        />
      )}

      {actionType === "investment" && (
        <RpPanel
          data={data}
          documents={documents}
          position={position}
          amount={invAmt}
          setAmount={setInvAmt}
          kind="investment"
          onCommit={(amt) => commit("INVESTMENT", amt)}
          pending={isPending}
          definedTermsByProvision={definedTermsByProvision}
        />
      )}

      {actionType === "assetSale" && (
        <AssetSalePanel
          data={data}
          documents={documents}
          position={position}
          amount={saleAmt}
          setAmount={setSaleAmt}
          reinvest={saleReinvest}
          setReinvest={setSaleReinvest}
          definedTermsByProvision={definedTermsByProvision}
        />
      )}
    </div>
  );
}

function DebtPanel({
  data,
  position,
  solverContext,
  simAmt,
  setSimAmt,
  simSecured,
  setSimSecured,
  definedTermsByProvision,
}: {
  data: CompanyCovenantData;
  position: CovenantPosition;
  solverContext: SolverNativeCompanyContext;
  simAmt: number;
  setSimAmt: (n: number) => void;
  simSecured: boolean;
  setSimSecured: (b: boolean) => void;
  definedTermsByProvision: DefinedTermsMap;
}) {
  // Cross-document capacity AND every applicable ratio test - both computed
  // generically inside the engine, not rechecked here. There is no separate
  // client-side ratio-consistency recheck: `sim.status` is the sole verdict.
  // `solverContext` lets a solver-native document (no legacy capacity
  // formula) be evaluated too, not just legacy-formula documents.
  const sim: DebtIncurrenceSimulation = simulateDebtIncurrence(data, position, simAmt, simSecured, solverContext);
  const tone = RESULT_TONE[sim.status];
  const blockedRatioTests = sim.ratioTests.filter((r) => r.applies && r.status === "blocked");

  return (
    <>
      <Card>
        <div className="card-title">Test an incurrence</div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>
          Tested pro forma against every governing document and every applicable ratio test.
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="field-label">Amount</span>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{fmtM(simAmt)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={8000}
            step={100}
            value={simAmt}
            onChange={(e) => setSimAmt(Number(e.target.value))}
          />
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          {[
            ["Secured", true],
            ["Unsecured", false],
          ].map(([label, val]) => (
            <button
              key={String(val)}
              type="button"
              className={`button ${simSecured === val ? "active" : ""}`}
              onClick={() => setSimSecured(val as boolean)}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <div className={`result-panel ${tone === "ok" ? "ok" : tone === "blocked" ? "blocked" : ""}`} style={tone === "review" ? { background: "var(--amber-soft)", borderColor: "var(--amber)" } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className={`result-title ${tone === "ok" ? "ok" : tone === "blocked" ? "blocked" : ""}`} style={tone === "review" ? { color: "var(--amber)" } : undefined}>
            {STATUS_TITLE[sim.status]}
          </div>
          {sim.overallCapacity !== undefined && (
            <Chip tone={tone === "ok" ? "pass" : "trip"}>max capacity {fmtM(sim.overallCapacity)}</Chip>
          )}
        </div>
        <div style={{ fontSize: 13.5, marginTop: 8, color: tone === "blocked" ? "var(--red)" : "var(--ink)" }}>
          {sim.status === "clear" && sim.binding && (
            <>
              Binding constraint: <b>{sim.binding.documentName}</b>
              {sim.binding.bindingProvision ? ` — ${sim.binding.bindingProvision.basketName} (${sim.binding.bindingProvision.sectionRef})` : ""}.
              Headroom after this incurrence: {fmtM((sim.overallCapacity ?? 0) - simAmt)}.
            </>
          )}
          {sim.status === "clear" && !sim.binding && <>No document imposes a finite capacity limit on this incurrence.</>}
          {sim.status === "blocked" && sim.binding?.status === "blocked" && (
            <>
              <b>{sim.binding.documentName}</b> stops you at {fmtM(sim.binding.capacity ?? 0)}
              {sim.binding.bindingProvision ? ` — ${sim.binding.bindingProvision.basketName} (${sim.binding.bindingProvision.sectionRef})` : ""}.
            </>
          )}
          {sim.status === "blocked" && sim.binding?.status !== "blocked" && blockedRatioTests.length > 0 && (
            <>
              {blockedRatioTests.map((r) => (
                <div key={r.provisionId}>
                  <b>{r.documentName}</b> — {r.basketName} ({r.sectionRef}) fails: {fmtX(r.postTransactionRatio ?? r.preTransactionRatio)}{" "}
                  {r.comparisonDirection === "at_or_below" ? "must be ≤" : "must be ≥"} {r.threshold.toFixed(2)}x.
                </div>
              ))}
            </>
          )}
          {(sim.status === "review_required" || sim.status === "not_tested") && (
            <>{sim.reason ?? "Not enough modeled configuration to evaluate this transaction."}</>
          )}
        </div>
        {sim.status === "blocked" && sim.binding && sim.next && (sim.next.capacity ?? Infinity) > (sim.binding.capacity ?? 0) && (
          <div style={{ marginTop: 10, background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13 }}>
            <b>Amendment unlock:</b> relaxing the binding covenant in {sim.binding.documentName} would raise
            capacity to <span className="mono" style={{ fontWeight: 600 }}>{fmtM(sim.next.capacity!)}</span>, where{" "}
            {sim.next.documentName} becomes the constraint.
          </div>
        )}
      </div>

      <Card>
        <div className="card-title" style={{ marginBottom: 6 }}>Document by document</div>
        {sim.perDocument.map((d) => (
          <div key={d.documentId} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{d.documentName}</div>
              <Chip tone={d.status === "clear" ? "pass" : d.status === "blocked" ? "trip" : "idle"}>
                {d.status === "clear" ? "clears" : d.status === "blocked" ? "blocks" : STATUS_TITLE[d.status].toLowerCase()}
              </Chip>
            </div>
            {d.capacity !== undefined && <ProgressBar pct={(simAmt / Math.max(1, d.capacity)) * 100} ok={d.status === "clear"} />}
            {d.bindingProvision ? (
              <ProvisionTrace
                provision={d.bindingProvision}
                definedTerms={definedTermsByProvision[`${d.bindingProvision.documentId}:${d.bindingProvision.code}`] ?? []}
                value={fmtCapacity(d.status === "clear" || d.status === "blocked" ? "modeled" : d.status, d.capacity)}
                note="governing test"
              />
            ) : (
              <div className="row-note" style={{ marginTop: 6 }}>
                {d.capacity !== undefined ? (
                  <>capacity <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{fmtM(d.capacity)}</span></>
                ) : (
                  d.reason ?? "Not tested here."
                )}
              </div>
            )}
          </div>
        ))}
      </Card>

      {sim.ratioTests.length > 0 && (
        <Card>
          <div className="card-title">Pro forma ratio tests</div>
          <div className="card-subtitle">
            Every LEVERAGE_RATIO_ROOM / COVERAGE_RATIO_ROOM covenant modeled for this company, pro forma for this
            incurrence - capacity above is capped so it can never clear an amount that breaches one of these.
          </div>
          {sim.ratioTests.map((r) => {
            const tone: ChipTone = !r.applies ? "idle" : r.status === "clear" ? "pass" : r.status === "blocked" ? "trip" : "tight";
            const toneLabel = !r.applies ? "n/a" : r.status === "clear" ? "ok" : r.status === "blocked" ? "fails" : "review";
            return (
              <ProvisionTrace
                key={r.provisionId}
                provision={r.provision}
                definedTerms={definedTermsByProvision[`${r.documentId}:${r.provision.code}`] ?? []}
                note={`${r.metricName} pro forma${!r.applies ? " — not applicable to this incurrence" : ""}${r.reason ? ` — ${r.reason}` : ""}`}
                value={
                  <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: 15, fontWeight: 600, opacity: r.applies ? 1 : 0.6 }}>
                      {fmtX(r.postTransactionRatio ?? r.preTransactionRatio)}
                    </span>
                    <Chip tone={tone}>{toneLabel}</Chip>
                  </span>
                }
              />
            );
          })}
        </Card>
      )}
    </>
  );
}

function RpPanel({
  data,
  documents,
  position,
  amount,
  setAmount,
  kind,
  onCommit,
  pending,
  definedTermsByProvision,
}: {
  data: CompanyCovenantData;
  documents: DocumentRow[];
  position: CovenantPosition;
  amount: number;
  setAmount: (n: number) => void;
  kind: RestrictedPaymentKind;
  onCommit: (amount: number) => void;
  pending: boolean;
  definedTermsByProvision: DefinedTermsMap;
}) {
  const candidates: DocumentInput[] = documentsWithRpWaterfall(data);
  const [selectedId, setSelectedId] = useState<string | undefined>(candidates[0]?.id);
  const doc = candidates.find((d) => d.id === selectedId) ?? candidates[0];
  const title = kind === "dividend" ? "Test a dividend or buyback" : "Test an Investment";

  if (!doc) {
    return (
      <Card>
        <div className="card-title">{title}</div>
        <Banner tone="red">
          Not tested here: no document for this company has a restricted-payment basket configuration entered.
        </Banner>
      </Card>
    );
  }

  const sim = simulateRestrictedPayment(data, position, doc.id, amount, kind);
  const gateCode = doc.rpWaterfall?.ratioGateCodeByKind[kind];
  const rpGate = gateCode ? position.provisionCapacities.get(`${doc.id}:${gateCode}`) : undefined;
  const tone = RESULT_TONE[sim.status];

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="card-title" style={{ marginBottom: 0 }}>{title}</div>
          {candidates.length > 1 && (
            <select value={doc.id} onChange={(e) => setSelectedId(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>
          Tested against {doc.name}&apos;s restricted-payment basket waterfall — each basket below cites its own
          governing section.
        </div>
        <OtherDocumentsCaveat documents={documents} testedDocumentId={doc.id} transactionLabel={kind === "dividend" ? "dividends and buybacks" : "Investments"} />
        {sim.poolUsed > 0 && (
          <Banner tone="amber">
            {fmtM(sim.poolUsed)} already committed against this pool — see Ledger.
          </Banner>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="field-label">Amount</span>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{fmtM(amount)}</span>
          </div>
          <input type="range" min={0} max={4000} step={50} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
      </Card>

      <div className={`result-panel ${tone === "ok" ? "ok" : tone === "blocked" ? "blocked" : ""}`} style={tone === "review" ? { background: "var(--amber-soft)", borderColor: "var(--amber)" } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className={`result-title ${tone === "ok" ? "ok" : tone === "blocked" ? "blocked" : ""}`} style={tone === "review" ? { color: "var(--amber)" } : undefined}>
            {STATUS_TITLE[sim.status]}
          </div>
          {rpGate?.gate && (
            <Chip tone={rpGate.gate.open ? "pass" : "idle"}>
              ratio prong {rpGate.gate.open ? "open" : "closed"} · {fmtX(rpGate.gate.measure)}
            </Chip>
          )}
        </div>
        <div style={{ fontSize: 13.5, marginTop: 8 }}>
          {sim.status === "clear" && sim.proFormaTotalNetLeverage !== undefined && (
            <>Total net leverage after this payment: <b>{fmtX(sim.proFormaTotalNetLeverage)}</b>.</>
          )}
          {sim.status === "blocked" && <>{fmtM(sim.remaining)} of the proposed amount has no basket left to draw on.</>}
          {(sim.status === "review_required" || sim.status === "not_tested") && (
            <>{sim.reason ?? "Not enough modeled configuration to evaluate this transaction."}</>
          )}
        </div>
        {sim.status === "clear" && amount > 0 && (
          <button
            type="button"
            className="button-primary"
            style={{ marginTop: 12, padding: "9px 14px", border: "none", borderRadius: 5 }}
            disabled={pending}
            onClick={() => onCommit(amount)}
          >
            {pending ? "Committing…" : "Commit to ledger — reduces shared pool"}
          </button>
        )}
      </div>

      <Card>
        <div className="card-title" style={{ marginBottom: 6 }}>Allocation waterfall</div>
        {sim.steps.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Set an amount above.</div>}
        {sim.steps.map((s) => {
          const stepProvision = position.provisionCapacities.get(`${doc.id}:${s.code}`)?.provision;
          return (
            <div key={s.code}>
              {stepProvision ? (
                <ProvisionTrace
                  provision={stepProvision}
                  definedTerms={definedTermsByProvision[`${doc.id}:${s.code}`] ?? []}
                  value={fmtM(s.allocated)}
                />
              ) : (
                <div style={{ padding: "10px 0" }}>
                  {s.basketName} <SectionRef>{s.sectionRef}</SectionRef>
                  <span className="mono" style={{ float: "right" }}>{fmtM(s.allocated)}</span>
                </div>
              )}
              <div style={{ height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (s.allocated / Math.max(1, amount)) * 100)}%`, height: "100%", background: "var(--green)" }} />
              </div>
            </div>
          );
        })}
        {sim.status === "blocked" && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--red)" }}>Unallocated</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--red)" }}>{fmtM(sim.remaining)}</div>
          </div>
        )}
      </Card>
    </>
  );
}

function AssetSalePanel({
  data,
  documents,
  position,
  amount,
  setAmount,
  reinvest,
  setReinvest,
  definedTermsByProvision,
}: {
  data: CompanyCovenantData;
  documents: DocumentRow[];
  position: CovenantPosition;
  amount: number;
  setAmount: (n: number) => void;
  reinvest: boolean;
  setReinvest: (b: boolean) => void;
  definedTermsByProvision: DefinedTermsMap;
}) {
  const candidates: DocumentInput[] = documentsWithAssetSale(data);
  const [selectedId, setSelectedId] = useState<string | undefined>(candidates[0]?.id);
  const doc = candidates.find((d) => d.id === selectedId) ?? candidates[0];

  if (!doc) {
    return (
      <Card>
        <div className="card-title">Test an asset sale</div>
        <Banner tone="red">
          Not tested here: no document for this company has an asset-sale threshold configuration entered.
        </Banner>
      </Card>
    );
  }

  const sim = simulateAssetSale(data, position, doc.id, amount, reinvest);
  const thresholdProvision = doc.assetSale ? position.provisionCapacities.get(`${doc.id}:${doc.assetSale.thresholdCode}`)?.provision : undefined;

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Test an asset sale</div>
          {candidates.length > 1 && (
            <select value={doc.id} onChange={(e) => setSelectedId(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>
          Under {doc.name}, net proceeds can be reinvested or applied to debt within{" "}
          {doc.assetSale?.reinvestmentWindowDays} days. Whatever&apos;s left over the Excess Proceeds threshold
          below triggers a mandatory offer to repurchase at 100% of principal.
        </div>
        <OtherDocumentsCaveat documents={documents} testedDocumentId={doc.id} transactionLabel="asset-sale proceeds" />
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="field-label">Net proceeds</span>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{fmtM(amount)}</span>
          </div>
          <input type="range" min={0} max={2500} step={50} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          {[
            ["Reinvest / apply to debt within window", true],
            ["Not applied", false],
          ].map(([label, val]) => (
            <button
              key={String(val)}
              type="button"
              className={`button ${reinvest === val ? "active" : ""}`}
              onClick={() => setReinvest(val as boolean)}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {sim.status !== "clear" ? (
        <Banner tone="red">{sim.reason ?? "Not enough modeled configuration to evaluate this asset sale."}</Banner>
      ) : (
        <div className={`result-panel ${sim.offerTriggered ? "" : "ok"}`} style={sim.offerTriggered ? { background: "var(--amber-soft)", borderColor: "var(--amber)" } : undefined}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="result-title" style={{ color: sim.offerTriggered ? "var(--amber)" : "var(--green)" }}>
              {sim.offerTriggered ? "Asset Sale Offer required" : "No mandatory offer"}
            </div>
            <Chip tone={sim.offerTriggered ? "tight" : "pass"}>Excess Proceeds {fmtM(sim.excessProceeds ?? 0)}</Chip>
          </div>
          <div style={{ fontSize: 13.5, marginTop: 8 }}>
            {reinvest ? (
              <>Applied within the reinvestment window — no offer triggered regardless of amount, so long as it&apos;s genuinely reinvested or used to pay down permitted debt.</>
            ) : sim.offerTriggered ? (
              <>Excess Proceeds exceed the <span className="mono">{fmtM(sim.excessProceedsThreshold ?? 0)}</span> threshold — must offer to repurchase at 100% of principal plus accrued interest for the excess.</>
            ) : (
              <>Proceeds fall within the <span className="mono">{fmtM(sim.excessProceedsThreshold ?? 0)}</span> threshold — no offer required even though it isn&apos;t formally reinvested.</>
            )}
          </div>
          {thresholdProvision && (
            <ProvisionTrace
              provision={thresholdProvision}
              definedTerms={definedTermsByProvision[`${doc.id}:${doc.assetSale?.thresholdCode}`] ?? []}
              value={fmtM(sim.excessProceedsThreshold ?? 0)}
            />
          )}
        </div>
      )}
    </>
  );
}
