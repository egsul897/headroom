"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { LiveFigure } from "@/components/motion/LiveFigure";
import { OpenProvenanceButton } from "@/components/motion/ProvenanceDrawer";
import { UNLOADED_CLAUSE, UNLOADED_HISTORY, UNLOADED_SOURCE } from "@/components/motion/provenance-copy";
import { fmtM, fmtX } from "@/lib/format";
import {
  simulateDebtIncurrenceByBasket,
  type CompanyCovenantData,
  type CovenantPosition,
  type DebtBasketAllocation,
  type DebtBasketKind,
  type DebtIncurrenceByBasketSimulation,
} from "@/lib/covenant-engine";

const KINDS: { id: DebtBasketKind; label: string }[] = [
  { id: "INCREMENTAL", label: "Incremental facility" },
  { id: "GENERAL", label: "General debt basket" },
  { id: "RATIO_DEBT", label: "Ratio debt" },
];

type SideAmounts = { secured: number; unsecured: number };
type Amounts = Record<DebtBasketKind, SideAmounts>;
type BasketMode = "secured" | "unsecured" | "combined";

const NO_BASKET = "This agreement has no such basket";

function money(value: number | undefined): string {
  if (value === undefined) return "Not evaluated";
  if (!Number.isFinite(value)) return "Unlimited";
  return fmtM(value);
}

function ratioText(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "Not evaluated";
  return fmtX(value);
}

function allocationsFor(amounts: Amounts, mode: BasketMode): DebtBasketAllocation[] {
  const rows: DebtBasketAllocation[] = [];
  for (const kind of KINDS) {
    const row = amounts[kind.id];
    if (mode !== "unsecured") rows.push({ kind: kind.id, amount: row.secured, secured: true });
    if (mode !== "secured") rows.push({ kind: kind.id, amount: row.unsecured, secured: false });
  }
  return rows;
}

export function DebtBasketBoard({
  data,
  position,
  initial,
  onCombined,
}: {
  data: CompanyCovenantData;
  position: CovenantPosition;
  initial?: Partial<Amounts> & { mode?: BasketMode };
  onCombined?: (secured: number, unsecured: number) => void;
}) {
  const [mode, setMode] = useState<BasketMode>(initial?.mode ?? "combined");
  const [amounts, setAmounts] = useState<Amounts>({
    INCREMENTAL: initial?.INCREMENTAL ?? { secured: 100, unsecured: 50 },
    GENERAL: initial?.GENERAL ?? { secured: 80, unsecured: 40 },
    RATIO_DEBT: initial?.RATIO_DEBT ?? { secured: 60, unsecured: 25 },
  });

  const allocations = useMemo(() => allocationsFor(amounts, mode), [amounts, mode]);
  const sim: DebtIncurrenceByBasketSimulation = useMemo(
    () => simulateDebtIncurrenceByBasket(data, position, allocations),
    [data, position, allocations],
  );

  function setSide(kind: DebtBasketKind, side: "secured" | "unsecured", amount: number) {
    const next = {
      ...amounts,
      [kind]: { ...amounts[kind], [side]: amount },
    };
    setAmounts(next);
    const sent = allocationsFor(next, mode);
    const secured = sent.filter((row) => row.secured).reduce((sum, row) => sum + row.amount, 0);
    const unsecured = sent.filter((row) => !row.secured).reduce((sum, row) => sum + row.amount, 0);
    onCombined?.(secured, unsecured);
  }

  return (
    <div className="basket-board">
      <div className="button-row" role="group" aria-label="Secured and unsecured">
        {(
          [
            ["secured", "Secured"],
            ["unsecured", "Unsecured"],
            ["combined", "Combined"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`button ${mode === id ? "active" : ""}`} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>
      <section className="home-card basket-slider" aria-label="Combined result">
        <div className="basket-slider-head">
          <h3 className="home-eyebrow">Combined</h3>
          <StatusBadge status={sim.status} />
        </div>
        <dl className="basket-figures">
          <div>
            <dt>Total net leverage</dt>
            <dd>
              <LiveFigure text={ratioText(sim.proForma.totalNetLeverage)} />
            </dd>
          </div>
          <div>
            <dt>Senior secured net leverage</dt>
            <dd>
              <LiveFigure text={ratioText(sim.proForma.seniorSecuredNetLeverage)} />
            </dd>
          </div>
          <div>
            <dt>Fixed charge coverage</dt>
            <dd>
              <LiveFigure text={ratioText(sim.proForma.fixedChargeCoverage)} />
            </dd>
          </div>
          <div>
            <dt>Proposed</dt>
            <dd>
              <LiveFigure text={fmtM(sim.totals.amount)} />
            </dd>
          </div>
        </dl>
        {sim.reasons.map((reason) => (
          <p key={reason} className="home-detail">
            {reason}
          </p>
        ))}
      </section>
      {KINDS.map((kind) => {
        const basket = sim.baskets.find((row) => row.kind === kind.id);
        const row = amounts[kind.id];
        return (
          <section key={kind.id} className="home-card basket-slider" aria-label={kind.label}>
            <div className="basket-slider-head">
              <h3 className="home-eyebrow">{kind.label}</h3>
              {basket ? <StatusBadge status={basket.status} /> : <StatusBadge status="NEEDS_INPUT" />}
            </div>
            {mode !== "unsecured" ? (
              <Slider
                label={`${kind.label} secured`}
                amount={row.secured}
                onChange={(amount) => setSide(kind.id, "secured", amount)}
              />
            ) : null}
            {mode !== "secured" ? (
              <Slider
                label={`${kind.label} unsecured`}
                amount={row.unsecured}
                onChange={(amount) => setSide(kind.id, "unsecured", amount)}
              />
            ) : null}
            <ul className="basket-covenants">
              {(basket?.documents ?? []).map((doc) => (
                <li key={doc.documentId}>
                  <div>
                    <span className="basket-covenant-name">{doc.documentName}</span>
                    {doc.status === "NOT_IDENTIFIED" ? (
                      <span className="ebitda-caption">{NO_BASKET}</span>
                    ) : (
                      <span className="ebitda-caption">
                        {doc.provision ? `${doc.provision.sectionRef} · ${doc.provision.basketName}` : doc.reason ?? "No clause on this result"}
                      </span>
                    )}
                  </div>
                  {doc.status === "NOT_IDENTIFIED" ? (
                    <StatusBadge status="NOT_IDENTIFIED" />
                  ) : (
                    <>
                      <LiveFigure text={money(doc.remaining)} />
                      <StatusBadge status={doc.status} />
                      {doc.provision ? (
                        <OpenProvenanceButton
                          className="button button-quiet"
                          title={doc.provision.basketName}
                          source={doc.documentName || UNLOADED_SOURCE}
                          clause={
                            doc.provision.sectionRef
                              ? `Section ${doc.provision.sectionRef}. Clause text is not loaded on this step.`
                              : UNLOADED_CLAUSE
                          }
                          history={UNLOADED_HISTORY}
                          note="Capacity, used, and remaining are the basket simulation. Nothing was recalculated here."
                        >
                          Clause
                        </OpenProvenanceButton>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Slider({ label, amount, onChange }: { label: string; amount: number; onChange: (amount: number) => void }) {
  return (
    <label className="basket-amount-field">
      <span>{label}</span>
      <LiveFigure text={fmtM(amount)} />
      <input type="range" min={0} max={2000} step={10} value={amount} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
