import { describe, expect, it } from "vitest";
import { deterministicActivationGate } from "@/lib/onboarding/deterministic-activation";

describe("deterministicActivationGate", () => {
  const base = {
    rulebookStage: "REVIEWED" as const,
    discoveredSummaries: 120,
    decisions: 120,
    financialSnapshots: 1,
    declarationsComplete: true,
  };

  it("activates ACTIVE when review is complete, financials exist, and every coverage declaration is complete", () => {
    const gate = deterministicActivationGate(base);
    expect(gate.ready).toBe(true);
    expect(gate.blockers).toEqual([]);
    expect(gate.status).toBe("ACTIVE");
  });

  it("activates ACTIVE_WITH_LIMITATIONS when coverage declarations are incomplete or absent", () => {
    expect(deterministicActivationGate({ ...base, declarationsComplete: false }).status).toBe(
      "ACTIVE_WITH_LIMITATIONS",
    );
  });

  it("refuses when review is incomplete, naming the missing decisions", () => {
    const gate = deterministicActivationGate({ ...base, decisions: 40 });
    expect(gate.ready).toBe(false);
    expect(gate.blockers.join(" ")).toContain("40 reviewed");
    expect(gate.blockers.join(" ")).toContain("120");
  });

  it("activates from EXECUTABLE even when the decision count lags the item count (ladder already verified review)", () => {
    const gate = deterministicActivationGate({ ...base, rulebookStage: "EXECUTABLE", decisions: 0 });
    expect(gate.ready).toBe(true);
  });

  it("refuses without financials and without any summaries", () => {
    const gate = deterministicActivationGate({
      rulebookStage: "DISCOVERED",
      discoveredSummaries: 0,
      decisions: 0,
      financialSnapshots: 0,
      declarationsComplete: false,
    });
    expect(gate.ready).toBe(false);
    expect(gate.blockers.length).toBe(2);
  });
});
