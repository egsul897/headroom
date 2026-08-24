"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner, Card, Chip, ProgressBar, SectionRef, type ChipTone } from "@/components/ui";
import { fmtM, fmtX } from "@/lib/format";
import {
  computeCovenantPosition,
  simulateAssetSale,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type CompanyCovenantData,
} from "@/lib/covenant-engine";
import { COHERENT_INDENTURE_ID, NOT_TESTED_CAVEATS } from "@/prisma/seed-data";
import { commitRestrictedPayment } from "../ledger/actions";

type ActionType = "debt" | "rp" | "investment" | "assetSale";

function provisionThreshold(
  position: ReturnType<typeof computeCovenantPosition>,
  documentId: string,
  code: string
): number {
  const evaluated = position.provisionCapacities.get(`${documentId}:${code}`);
  if (!evaluated) throw new Error(`Missing provision ${documentId}:${code}`);
  return evaluated.provision.thresholdValue;
}

export function SimulateClient({ data }: { data: CompanyCovenantData }) {
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
  const caLeverageThreshold = provisionThreshold(position, data.documents.find((d) => d.type === "CREDIT_AGREEMENT")!.id, "ca_leverage_cap");
  const milaSecuredThreshold = provisionThreshold(position, COHERENT_INDENTURE_ID, "mila_secured");
  const ratioDebtThreshold = provisionThreshold(position, COHERENT_INDENTURE_ID, "ratio_debt_fccr");

  function commit(kind: "DIVIDEND" | "INVESTMENT", amount: number) {
    startTransition(async () => {
      await commitRestrictedPayment(kind, amount);
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <Card>
        <div className="card-title">What are you testing?</div>
        <div className="card-subtitle">
          Every action type below draws on the same covenant package — dividends, buybacks, and Investments
          literally share one basket pool under §3.4.
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
          position={position}
          simAmt={simAmt}
          setSimAmt={setSimAmt}
          simSecured={simSecured}
          setSimSecured={setSimSecured}
          data={data}
          caLeverageThreshold={caLeverageThreshold}
          milaSecuredThreshold={milaSecuredThreshold}
          ratioDebtThreshold={ratioDebtThreshold}
        />
      )}

      {actionType === "rp" && (
        <RpPanel
          data={data}
          position={position}
          amount={rpAmt}
          setAmount={setRpAmt}
          kind="dividend"
          caveat={NOT_TESTED_CAVEATS.restrictedPayments}
          onCommit={(amt) => commit("DIVIDEND", amt)}
          pending={isPending}
        />
      )}

      {actionType === "investment" && (
        <RpPanel
          data={data}
          position={position}
          amount={invAmt}
          setAmount={setInvAmt}
          kind="investment"
          caveat={NOT_TESTED_CAVEATS.investments}
          onCommit={(amt) => commit("INVESTMENT", amt)}
          pending={isPending}
        />
      )}

      {actionType === "assetSale" && (
        <AssetSalePanel
          data={data}
          position={position}
          amount={saleAmt}
          setAmount={setSaleAmt}
          reinvest={saleReinvest}
          setReinvest={setSaleReinvest}
        />
      )}
    </div>
  );
}

function DebtPanel({
  position,
  simAmt,
  setSimAmt,
  simSecured,
  setSimSecured,
  data,
  caLeverageThreshold,
  milaSecuredThreshold,
  ratioDebtThreshold,
}: {
  position: ReturnType<typeof computeCovenantPosition>;
  simAmt: number;
  setSimAmt: (n: number) => void;
  simSecured: boolean;
  setSimSecured: (b: boolean) => void;
  data: CompanyCovenantData;
  caLeverageThreshold: number;
  milaSecuredThreshold: number;
  ratioDebtThreshold: number;
}) {
  const sim = simulateDebtIncurrence(position, data.financials, simAmt, simSecured);

  // Ratio-consistency rule: capacity is constructed so a cleared amount can never trip a
  // displayed ratio - but we check it explicitly here rather than trusting that invariant
  // blindly, so the UI can never show "Clears" next to a ratio that reads "fails".
  const ratioRows: { label: string; value: number; ok: boolean; applies: boolean; note: string }[] = [
    {
      label: "Total net leverage",
      value: sim.proForma.totalNetLeverage,
      ok: sim.proForma.totalNetLeverage <= caLeverageThreshold,
      applies: true,
      note: `CA §6.11 ≤ ${caLeverageThreshold.toFixed(2)}x · indenture MILA ≤ 5.00x · indenture ratio RP §3.4(b)(xvii) ≤ 3.25x`,
    },
    {
      label: "Senior secured net leverage",
      value: sim.proForma.seniorSecuredNetLeverage,
      ok: sim.proForma.seniorSecuredNetLeverage <= milaSecuredThreshold,
      applies: simSecured,
      note: simSecured
        ? `indenture Permitted Liens cl. (24) ≤ ${milaSecuredThreshold.toFixed(2)}x`
        : "not tested for an unsecured incurrence — current level shown for reference",
    },
    {
      label: "FCCR / interest coverage",
      value: sim.proForma.fixedChargeCoverage,
      ok: sim.proForma.fixedChargeCoverage >= ratioDebtThreshold,
      applies: true,
      note: `indenture §3.3(a) ≥ ${ratioDebtThreshold.toFixed(2)}x · CA §6.11 ≥ 2.50x`,
    },
  ];
  const anyApplicableRatioTripped = ratioRows.some((r) => r.applies && !r.ok);
  const displayCleared = sim.cleared && !anyApplicableRatioTripped;

  return (
    <>
      <Card>
        <div className="card-title">Test an incurrence</div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>
          Tested pro forma against the indenture and the credit agreement maintenance package.
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

      <div className={`result-panel ${displayCleared ? "ok" : "blocked"}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className={`result-title ${displayCleared ? "ok" : "blocked"}`}>
            {displayCleared ? "Clears both documents" : "Blocked"}
          </div>
          <Chip tone={displayCleared ? "pass" : "trip"}>max capacity {fmtM(sim.overallCapacity)}</Chip>
        </div>
        <div style={{ fontSize: 13.5, marginTop: 8, color: displayCleared ? "var(--ink)" : "var(--red)" }}>
          {displayCleared ? (
            <>
              Binding constraint: <b>{sim.binding.documentName}</b>
              {sim.binding.bindingProvision ? ` — ${sim.binding.bindingProvision.basketName} (${sim.binding.bindingProvision.sectionRef})` : ""}.
              Headroom after this incurrence: {fmtM(sim.overallCapacity - simAmt)}.
            </>
          ) : (
            <>
              <b>{sim.binding.documentName}</b> stops you at {fmtM(sim.binding.capacity)}
              {sim.binding.bindingProvision ? ` — ${sim.binding.bindingProvision.basketName} (${sim.binding.bindingProvision.sectionRef})` : ""}.
            </>
          )}
        </div>
        {!sim.cleared && sim.next && sim.next.capacity > sim.binding.capacity && (
          <div style={{ marginTop: 10, background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13 }}>
            <b>Amendment unlock:</b> relaxing the binding covenant in {sim.binding.documentName} would raise
            capacity to <span className="mono" style={{ fontWeight: 600 }}>{fmtM(sim.next.capacity)}</span>, where{" "}
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
              <Chip tone={d.cleared ? "pass" : "trip"}>{d.cleared ? "clears" : "blocks"}</Chip>
            </div>
            <div className="row-note" style={{ marginTop: 2 }}>
              capacity <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{fmtM(d.capacity)}</span>
              {d.bindingProvision && (
                <>
                  {" · governing test: "}
                  {d.bindingProvision.basketName} (<SectionRef>{d.bindingProvision.sectionRef}</SectionRef>)
                </>
              )}
            </div>
            <ProgressBar pct={(simAmt / Math.max(1, d.capacity)) * 100} ok={d.cleared} />
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Pro forma</div>
        <div className="card-subtitle">
          Capacity above is capped so it can never clear an amount that breaches one of these ratios — a red row
          here means the deal is genuinely blocked, not a soft warning.
        </div>
        {ratioRows.map((r) => {
          const tone: ChipTone = !r.applies ? "idle" : r.ok ? "pass" : "trip";
          const toneLabel = !r.applies ? "n/a" : r.ok ? "ok" : "fails";
          return (
            <div key={r.label} className="row">
              <div>
                <div className="row-label">{r.label}</div>
                <div className="row-note">{r.note}</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 15, fontWeight: 600, opacity: r.applies ? 1 : 0.6 }}>
                  {fmtX(r.value)}
                </span>
                <Chip tone={tone}>{toneLabel}</Chip>
              </div>
            </div>
          );
        })}
        {sim.cleared !== displayCleared && (
          <Banner tone="red">
            The engine reported this as cleared, but a displayed ratio above is tripped — showing Blocked per the
            ratio-consistency rule rather than a false &quot;Clears&quot;. This should not happen; treat it as a bug.
          </Banner>
        )}
      </Card>
    </>
  );
}

function RpPanel({
  data,
  position,
  amount,
  setAmount,
  kind,
  caveat,
  onCommit,
  pending,
}: {
  data: CompanyCovenantData;
  position: ReturnType<typeof computeCovenantPosition>;
  amount: number;
  setAmount: (n: number) => void;
  kind: "dividend" | "investment";
  caveat: string;
  onCommit: (amount: number) => void;
  pending: boolean;
}) {
  const sim = simulateRestrictedPayment(data, position, COHERENT_INDENTURE_ID, amount, kind);
  const rpGate = position.provisionCapacities.get(`${COHERENT_INDENTURE_ID}:${kind === "dividend" ? "rp_ratio_gate" : "inv_ratio_gate"}`)!;
  const title = kind === "dividend" ? "Test a dividend or buyback" : "Test an Investment";
  const description =
    kind === "dividend"
      ? "Tested against indenture §3.4(a) — the builder basket, then the general RP basket (§3.4(b)(x)), then unlimited capacity if net leverage is at or below 3.25x (§3.4(b)(xvii)(i))."
      : "A JV contribution, minority stake, or loan to an unrestricted subsidiary — under indenture §3.4(a)(iv), Restricted Investments draw the same basket pool as dividends, but the unlimited ratio prong is looser: 3.50x (§3.4(b)(xvii)(ii)) instead of 3.25x.";

  return (
    <>
      <Card>
        <div className="card-title">{title}</div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>{description}</div>
        <Banner tone="red">{caveat}</Banner>
        {sim.poolUsed > 0 && (
          <Banner tone="amber">
            {fmtM(sim.poolUsed)} already committed against this pool (dividends + Investments) — see Ledger.
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

      <div className={`result-panel ${sim.cleared ? "ok" : "blocked"}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className={`result-title ${sim.cleared ? "ok" : "blocked"}`}>{sim.cleared ? "Permitted" : "Blocked"}</div>
          <Chip tone={rpGate.gate?.open ? "pass" : "idle"}>
            ratio prong {rpGate.gate?.open ? "open" : "closed"} · TNL {fmtX(position.metrics.totalNetLeverage)}
          </Chip>
        </div>
        <div style={{ fontSize: 13.5, marginTop: 8 }}>
          {sim.cleared ? (
            <>Total net leverage after this payment: <b>{fmtX(sim.proFormaTotalNetLeverage)}</b>.</>
          ) : (
            <>{fmtM(sim.remaining)} of the proposed amount has no basket left to draw on.</>
          )}
        </div>
        {sim.cleared && amount > 0 && (
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
        {sim.steps.map((s) => (
          <div key={s.code} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {s.basketName} <SectionRef>{s.sectionRef}</SectionRef>
              </div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{fmtM(s.allocated)}</div>
            </div>
            <div style={{ height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, (s.allocated / Math.max(1, amount)) * 100)}%`, height: "100%", background: "var(--green)" }} />
            </div>
          </div>
        ))}
        {!sim.cleared && (
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
  position,
  amount,
  setAmount,
  reinvest,
  setReinvest,
}: {
  data: CompanyCovenantData;
  position: ReturnType<typeof computeCovenantPosition>;
  amount: number;
  setAmount: (n: number) => void;
  reinvest: boolean;
  setReinvest: (b: boolean) => void;
}) {
  const sim = simulateAssetSale(data, position, COHERENT_INDENTURE_ID, amount, reinvest);

  return (
    <>
      <Card>
        <div className="card-title">Test an asset sale</div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>
          Under §3.7(b), net proceeds can be reinvested or applied to debt within{" "}
          {data.documents.find((d) => d.id === COHERENT_INDENTURE_ID)?.assetSale?.reinvestmentWindowDays ?? 455} days.
          Whatever&apos;s left over the §3.7(d) Excess Proceeds threshold triggers a mandatory offer to repurchase
          Notes at 100% of principal.
        </div>
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

      <div className={`result-panel ${sim.offerTriggered ? "" : "ok"}`} style={sim.offerTriggered ? { background: "var(--amber-soft)", borderColor: "var(--amber)" } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="result-title" style={{ color: sim.offerTriggered ? "var(--amber)" : "var(--green)" }}>
            {sim.offerTriggered ? "Asset Sale Offer required" : "No mandatory offer"}
          </div>
          <Chip tone={sim.offerTriggered ? "tight" : "pass"}>Excess Proceeds {fmtM(sim.excessProceeds)}</Chip>
        </div>
        <div style={{ fontSize: 13.5, marginTop: 8 }}>
          {reinvest ? (
            <>
              Applied within the reinvestment window (<SectionRef>§3.7(b)</SectionRef>) — no offer triggered
              regardless of amount, so long as it&apos;s genuinely reinvested or used to pay down Credit Agreement or
              Pari Passu debt.
            </>
          ) : sim.offerTriggered ? (
            <>
              Excess Proceeds exceed the <span className="mono">{fmtM(sim.excessProceedsThreshold)}</span> threshold
              under <SectionRef>§3.7(d)</SectionRef> — must offer to repurchase Notes and Pari Passu debt pro rata at
              100% of principal plus accrued interest for the excess.
            </>
          ) : (
            <>
              Proceeds fall within the <span className="mono">{fmtM(sim.excessProceedsThreshold)}</span> threshold
              under <SectionRef>§3.7(d)</SectionRef> — no offer required even though it isn&apos;t formally
              reinvested.
            </>
          )}
        </div>
        <Banner tone="red">{NOT_TESTED_CAVEATS.assetSale}</Banner>
      </div>
    </>
  );
}
