/**
 * Adapter: A8-01 / A8-02 capacity status honesty — reuses production capacity state.
 * Does not reimplement gate evaluation; asserts the published status floor exists.
 */

import { readFileSync } from "node:fs";
import { CAPACITY_STATUS_PRECEDENCE } from "@/lib/contract-model/runtime/capacity/types";
import type { AdapterExecutionResult } from "../types";

export function runCapacityA8Adapter(caseId: string): AdapterExecutionResult {
  if (caseId === "a8-01-status-floor-wired") {
    const stateSrc = readFileSync("lib/contract-model/runtime/capacity/state.ts", "utf8");
    const hasFloor = /statusForAmount/.test(stateSrc) && /GATE_NOT_SATISFIED/.test(stateSrc);
    const precedenceOk =
      CAPACITY_STATUS_PRECEDENCE.NOT_SATISFIED > CAPACITY_STATUS_PRECEDENCE.AVAILABLE &&
      CAPACITY_STATUS_PRECEDENCE.NOT_SATISFIED < CAPACITY_STATUS_PRECEDENCE.NEEDS_INPUT;
    const ok = hasFloor && precedenceOk;
    return {
      adapter: "capacity-a8",
      actualLegalOutcome: ok ? "AVAILABLE_FORBIDDEN" : "ERROR",
      falseFavorable: !ok,
      materialOmissions: ok ? [] : ["A8-01 status floor missing"],
      notes: [
        `statusForAmount=${hasFloor}`,
        `NOT_SATISFIED_precedence=${precedenceOk}`,
        "Full matrix: tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts",
      ],
    };
  }
  return {
    adapter: "capacity-a8",
    actualLegalOutcome: "ERROR",
    falseFavorable: false,
    materialOmissions: [],
    notes: [`Unknown capacity-a8 caseId: ${caseId}`],
  };
}
