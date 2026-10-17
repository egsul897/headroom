"use client";

import { useMemo } from "react";
import { DebtBasketBoard } from "@/components/simulate/DebtBasketBoard";
import { ScenarioBook } from "@/components/ux/ScenarioBook";
import { computeCovenantPosition } from "@/lib/covenant-engine";
import { SAMPLE_COVENANT_DATA } from "./simulate-fixture";
import { SAMPLE_SCENARIOS } from "./ux-sample";

/** SAMPLE DATA. Figures are simulateDebtIncurrenceByBasket for this fixture. */
export function SampleSimulate({
  incremental,
  general,
  ratio,
}: {
  incremental: number;
  general: number;
  ratio: number;
}) {
  const position = useMemo(() => computeCovenantPosition(SAMPLE_COVENANT_DATA), []);

  return (
    <div className="page-frame">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">Simulate</h1>
          <p className="home-date">Sample inputs. Combined secured and unsecured amounts call simulateDebtIncurrenceByBasket.</p>
        </div>
      </header>
      <ScenarioBook
        companyId="sample"
        seed={SAMPLE_SCENARIOS}
        draftLines={[
          { label: "Action", value: "Debt incurrence" },
          { label: "Amount", value: String(incremental + general + ratio) },
        ]}
      />
      <DebtBasketBoard
        data={SAMPLE_COVENANT_DATA}
        position={position}
        initial={{
          mode: "combined",
          INCREMENTAL: { secured: incremental, unsecured: 50 },
          GENERAL: { secured: general, unsecured: 40 },
          RATIO_DEBT: { secured: ratio, unsecured: 25 },
        }}
      />
    </div>
  );
}
