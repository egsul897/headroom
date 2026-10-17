"use client";

import { useMemo, useState } from "react";
import { DebtBasketBoard } from "@/components/simulate/DebtBasketBoard";
import { computeCovenantPosition } from "@/lib/covenant-engine";
import { SAMPLE_COVENANT_DATA } from "./simulate-fixture";

/** SAMPLE DATA. Figures are the engine's return values for the fixture above. */
export function SampleSimulate({ initialSecured }: { initialSecured: number }) {
  const position = useMemo(() => computeCovenantPosition(SAMPLE_COVENANT_DATA), []);
  const [secured, setSecured] = useState(initialSecured);
  const [unsecured, setUnsecured] = useState(200);

  return (
    <div className="page-frame">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">Simulate</h1>
          <p className="home-date">Sample inputs. The sliders call the covenant engine. They do not post a ledger entry.</p>
        </div>
      </header>
      <DebtBasketBoard
        data={SAMPLE_COVENANT_DATA}
        position={position}
        securedAmount={secured}
        unsecuredAmount={unsecured}
        onSecuredAmount={setSecured}
        onUnsecuredAmount={setUnsecured}
      />
    </div>
  );
}
