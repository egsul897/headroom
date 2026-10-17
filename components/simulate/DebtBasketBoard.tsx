"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { LiveFigure } from "@/components/motion/LiveFigure";
import { OpenProvenanceButton } from "@/components/motion/ProvenanceDrawer";
import { ProofTrigger } from "@/components/ux/ProofDrawer";
import { FIGURE_INPUTS, unloadedProof } from "@/lib/ux/present";
import { UNLOADED_CLAUSE, UNLOADED_HISTORY, UNLOADED_SOURCE } from "@/components/motion/provenance-copy";
import { fmtM, fmtX } from "@/lib/format";
import {
  simulateDebtIncurrenceByBasket,
  type CapacityBound,
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
const KIND_WORD: Record<DebtBasketKind, string> = {
  INCREMENTAL: "the incremental facility",
  GENERAL: "the general debt basket",
  RATIO_DEBT: "ratio debt",
};

export function boundText(bound: CapacityBound | undefined, value: number | undefined): string {
  if (bound === "UNLIMITED") return "No cap";
  if (value === undefined || !Number.isFinite(value)) return "Not evaluated";
  if (bound === "AT_LEAST") return `at least ${fmtM(value)}`;
  return fmtM(value);
}

function sliderSlot(kind: DebtBasketKind, side: "secured" | "unsecured", mode: BasketMode): number {
  let index = 0;
  for (const row of KINDS) {
    if (mode !== "unsecured") {
      if (row.id === kind && side === "secured") return index;
      index += 1;
    }
    if (mode !== "secured") {
      if (row.id === kind && side === "unsecured") return index;
      index += 1;
    }
  }
  return -1;
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
  const blocked = sim.invalidAllocations.length > 0;

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
      {blocked ? null : (
      <section className="home-card basket-slider" aria-label="Combined result">
        <div className="basket-slider-head">
          <h3 className="home-eyebrow">Combined</h3>
          <StatusBadge status={sim.status} />
        </div>
        <dl className="basket-figures">
          <div>
            <dt>Total net leverage</dt>
            <dd>
              <ProofTrigger className="figure-hit" proof={unloadedProof("Total net leverage", ratioText(sim.proForma.totalNetLeverage), FIGURE_INPUTS.simulateRatio, { review: sim.status })}>
                <LiveFigure text={ratioText(sim.proForma.totalNetLeverage)} />
              </ProofTrigger>
            </dd>
          </div>
          <div>
            <dt>Senior secured net leverage</dt>
            <dd>
              <ProofTrigger className="figure-hit" proof={unloadedProof("Senior secured net leverage", ratioText(sim.proForma.seniorSecuredNetLeverage), FIGURE_INPUTS.simulateRatio, { review: sim.status })}>
                <LiveFigure text={ratioText(sim.proForma.seniorSecuredNetLeverage)} />
              </ProofTrigger>
            </dd>
          </div>
          <div>
            <dt>Fixed charge coverage</dt>
            <dd>
              <ProofTrigger className="figure-hit" proof={unloadedProof("Fixed charge coverage", ratioText(sim.proForma.fixedChargeCoverage), FIGURE_INPUTS.simulateRatio, { review: sim.status })}>
                <LiveFigure text={ratioText(sim.proForma.fixedChargeCoverage)} />
              </ProofTrigger>
            </dd>
          </div>
          <div>
            <dt>Proposed</dt>
            <dd>
              <ProofTrigger
                className="figure-hit"
                proof={{
                  figure: "Proposed amount",
                  value: fmtM(sim.totals.amount),
                  inputs: [{ label: "Proposed amount", value: fmtM(sim.totals.amount), source: "Amount entered on this screen" }],
                  clause: null,
                  page: null,
                  review: sim.status,
                }}
              >
                <LiveFigure text={fmtM(sim.totals.amount)} />
              </ProofTrigger>
            </dd>
          </div>
        </dl>
        {sim.reasons.map((reason) => (
          <p key={reason} className="home-detail">
            {reason}
          </p>
        ))}
      </section>
      )}
      {KINDS.map((kind) => {
        const basket = sim.baskets.find((row) => row.kind === kind.id);
        const row = amounts[kind.id];
        const securedError = sim.invalidAllocations.find((item) => item.index === sliderSlot(kind.id, "secured", mode))?.reason;
        const unsecuredError = sim.invalidAllocations.find((item) => item.index === sliderSlot(kind.id, "unsecured", mode))?.reason;
        const kindBlocked = Boolean(securedError || unsecuredError);
        return (
          <section key={kind.id} className="home-card basket-slider" aria-label={kind.label}>
            <div className="basket-slider-head">
              <h3 className="home-eyebrow">{kind.label}</h3>
              {kindBlocked ? null : basket ? <StatusBadge status={basket.status} /> : <StatusBadge status="NEEDS_INPUT" />}
            </div>
            {mode !== "unsecured" ? (
              <Slider
                label={`${kind.label} secured`}
                amount={row.secured}
                error={securedError}
                onChange={(amount) => setSide(kind.id, "secured", amount)}
              />
            ) : null}
            {mode !== "secured" ? (
              <Slider
                label={`${kind.label} unsecured`}
                amount={row.unsecured}
                error={unsecuredError}
                onChange={(amount) => setSide(kind.id, "unsecured", amount)}
              />
            ) : null}
            {kindBlocked ? null : (
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
                      <ProofTrigger className="figure-hit" proof={unloadedProof(doc.documentName || "Remaining", boundText(doc.bound, doc.remaining), FIGURE_INPUTS.capacityRemaining, { clause: doc.provision?.sectionRef ? `Section ${doc.provision.sectionRef}` : null, review: doc.status })}>
                        <LiveFigure text={boundText(doc.bound, doc.remaining)} />
                      </ProofTrigger>
                      <StatusBadge status={doc.status} />
                      {doc.provision ? (
                        <OpenProvenanceButton
                          className="button button-quiet basket-clause-chip"
                          title={doc.provision.basketName}
                          source={doc.documentName || UNLOADED_SOURCE}
                          clause={
                            doc.provision.sectionRef
                              ? `Section ${doc.provision.sectionRef}. Clause text is not loaded on this step.`
                              : UNLOADED_CLAUSE
                          }
                          history={UNLOADED_HISTORY}
                          note={
                            doc.sharedWith && doc.sharedWith.length > 0
                              ? `Shared with ${doc.sharedWith.map((item) => KIND_WORD[item]).join(", ")}.`
                              : "Capacity, used, and remaining are the basket simulation. Nothing was recalculated here."
                          }
                        >
                          {doc.provisionUsed !== undefined && Number.isFinite(doc.provisionUsed) ? fmtM(doc.provisionUsed) : doc.provision.sectionRef}
                        </OpenProvenanceButton>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Slider({
  label,
  amount,
  error,
  onChange,
}: {
  label: string;
  amount: number;
  error?: string;
  onChange: (amount: number) => void;
}) {
  return (
    <label className="basket-amount-field">
      <span>{label}</span>
      <LiveFigure text={Number.isFinite(amount) ? fmtM(amount) : "Not a number"} />
      <input
        type="range"
        min={Math.min(0, Number.isFinite(amount) ? amount : 0)}
        max={2000}
        step={10}
        value={Number.isFinite(amount) ? amount : 0}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {error ? <p className="ebitda-inline-error">{error}</p> : null}
    </label>
  );
}
