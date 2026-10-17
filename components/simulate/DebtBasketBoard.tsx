"use client";

import { useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { LiveFigure } from "@/components/motion/LiveFigure";
import { OpenProvenanceButton } from "@/components/motion/ProvenanceDrawer";
import { UNLOADED_CLAUSE, UNLOADED_HISTORY, UNLOADED_SOURCE } from "@/components/motion/provenance-copy";
import { fmtM, fmtX } from "@/lib/format";
import {
  computeRemainingCapacityAfterDebtIncurrence,
  simulateDebtIncurrence,
  type CompanyCovenantData,
  type CovenantPosition,
  type DebtIncurrenceSimulation,
  type PostTransactionCapacitySimulation,
  type SolverNativeCompanyContext,
} from "@/lib/covenant-engine";

/**
 * Debt categories the simulate API does not accept as their own amount.
 * Secured and unsecured are the only sides `simulateDebtIncurrence` takes.
 */
export const DEBT_ENGINE_GAPS = [
  {
    id: "incremental",
    label: "Incremental facility",
    note: "Needs engine support. simulateDebtIncurrence takes one amount and a secured flag. It has no incremental-facility amount.",
  },
  {
    id: "general",
    label: "General debt basket",
    note: "Needs engine support. A general basket is inside a document capacity formula. No API proposes an amount against that basket alone.",
  },
  {
    id: "ratio-debt",
    label: "Ratio debt",
    note: "Needs engine support as its own amount. Ratio tests are outputs of the secured or unsecured call. A separate ratio-debt amount is not an engine input.",
  },
] as const;

const SIDES = [
  { id: "secured" as const, label: "Secured debt", secured: true },
  { id: "unsecured" as const, label: "Unsecured debt", secured: false },
];

export function DebtBasketBoard({
  data,
  position,
  solverContext,
  securedAmount,
  unsecuredAmount,
  onSecuredAmount,
  onUnsecuredAmount,
}: {
  data: CompanyCovenantData;
  position: CovenantPosition;
  solverContext?: SolverNativeCompanyContext;
  securedAmount: number;
  unsecuredAmount: number;
  onSecuredAmount: (amount: number) => void;
  onUnsecuredAmount: (amount: number) => void;
}) {
  return (
    <div className="basket-board">
      {SIDES.map((side) => {
        const amount = side.secured ? securedAmount : unsecuredAmount;
        const onAmount = side.secured ? onSecuredAmount : onUnsecuredAmount;
        return (
          <EngineSide
            key={side.id}
            label={side.label}
            secured={side.secured}
            amount={amount}
            onAmount={onAmount}
            data={data}
            position={position}
            solverContext={solverContext}
          />
        );
      })}
      {DEBT_ENGINE_GAPS.map((gap) => (
        <section key={gap.id} className="home-card basket-slider is-disabled" aria-disabled="true">
          <h3 className="home-eyebrow">{gap.label}</h3>
          <input type="range" min={0} max={1000} value={0} disabled aria-disabled="true" />
          <p className="home-detail">{gap.note}</p>
        </section>
      ))}
    </div>
  );
}

function EngineSide({
  label,
  secured,
  amount,
  onAmount,
  data,
  position,
  solverContext,
}: {
  label: string;
  secured: boolean;
  amount: number;
  onAmount: (amount: number) => void;
  data: CompanyCovenantData;
  position: CovenantPosition;
  solverContext?: SolverNativeCompanyContext;
}) {
  const sim: DebtIncurrenceSimulation = useMemo(
    () => simulateDebtIncurrence(data, position, amount, secured, solverContext),
    [data, position, amount, secured, solverContext],
  );
  const remaining: PostTransactionCapacitySimulation = useMemo(
    () => computeRemainingCapacityAfterDebtIncurrence(data, position, amount, secured, solverContext),
    [data, position, amount, secured, solverContext],
  );

  return (
    <section className="home-card basket-slider" aria-label={label}>
      <div className="basket-slider-head">
        <h3 className="home-eyebrow">{label}</h3>
        <StatusBadge status={sim.status} />
      </div>
      <div className="basket-amount">
        <LiveFigure text={fmtM(amount)} />
      </div>
      <input
        type="range"
        min={0}
        max={2000}
        step={50}
        value={amount}
        aria-label={`${label} amount`}
        onChange={(event) => onAmount(Number(event.target.value))}
      />
      <dl className="basket-figures">
        <div>
          <dt>Total net leverage</dt>
          <dd>
            <LiveFigure text={fmtX(sim.proForma.totalNetLeverage)} />
          </dd>
        </div>
        <div>
          <dt>Senior secured net leverage</dt>
          <dd>
            <LiveFigure text={fmtX(sim.proForma.seniorSecuredNetLeverage)} />
          </dd>
        </div>
        <div>
          <dt>Fixed charge coverage</dt>
          <dd>
            <LiveFigure text={fmtX(sim.proForma.fixedChargeCoverage)} />
          </dd>
        </div>
        <div>
          <dt>Capacity left</dt>
          <dd>
            <LiveFigure text={remaining.remainingCapacity === undefined ? "Not evaluated" : fmtM(remaining.remainingCapacity)} />
          </dd>
        </div>
      </dl>
      {sim.reason ? <p className="home-detail">{sim.reason}</p> : null}
      <ul className="basket-covenants">
        {sim.ratioTests.map((test) => (
          <li key={test.provisionId}>
            <div>
              <span className="basket-covenant-name">{test.basketName}</span>
              <span className="ebitda-caption">
                {test.sectionRef}
                {test.applies ? "" : " · Does not apply to this side"}
              </span>
            </div>
            <LiveFigure text={test.postTransactionRatio === undefined ? "Not evaluated" : fmtX(test.postTransactionRatio)} />
            <StatusBadge status={test.status} />
            <OpenProvenanceButton
              className="button button-quiet"
              title={test.basketName}
              source={test.documentName || UNLOADED_SOURCE}
              clause={test.sectionRef ? `Section ${test.sectionRef}. Clause text is not loaded on this step.` : UNLOADED_CLAUSE}
              history={UNLOADED_HISTORY}
              note="This clause reference is the one the engine returned with the ratio test."
            >
              Clause
            </OpenProvenanceButton>
          </li>
        ))}
        {sim.perDocument.map((doc) => {
          const left = remaining.perDocument.find((row) => row.documentId === doc.documentId);
          return (
            <li key={doc.documentId}>
              <div>
                <span className="basket-covenant-name">{doc.documentName}</span>
                <span className="ebitda-caption">{doc.bindingProvision ? doc.bindingProvision.sectionRef : "No binding clause on this result"}</span>
              </div>
              <LiveFigure text={left?.remainingCapacity === undefined ? "Not evaluated" : fmtM(left.remainingCapacity)} />
              <StatusBadge status={doc.status} />
              {doc.bindingProvision ? (
                <OpenProvenanceButton
                  className="button button-quiet"
                  title={doc.bindingProvision.basketName}
                  source={doc.documentName}
                  clause={`Section ${doc.bindingProvision.sectionRef}. Clause text is not loaded on this step.`}
                  history={UNLOADED_HISTORY}
                >
                  Clause
                </OpenProvenanceButton>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
