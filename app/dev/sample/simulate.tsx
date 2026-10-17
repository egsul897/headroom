"use client";

import { useMemo } from "react";
import { DebtBasketBoard } from "@/components/simulate/DebtBasketBoard";
import { computeCovenantPosition } from "@/lib/covenant-engine";
import { SAMPLE_COVENANT_DATA } from "./simulate-fixture";

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
