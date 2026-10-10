/**
 * Agent 1 conservative eligibility — Pass A never executable alone.
 */
import { describe, expect, it } from "vitest";
import {
  assessPassAEligibility,
  assessPassAPopulation,
  classifyStageFailure,
} from "@/lib/contract-model/compiler/discovery/eligibility";
import type { DeterministicCandidate } from "@/lib/contract-model/compiler/discovery/types";

const sample: DeterministicCandidate = {
  documentId: "doc-a",
  nodeKey: "n1",
  nodeId: "id1",
  sectionRef: "7.01",
  signals: ["dollar_value", "prohibitive_construction"],
  signalScore: 2,
  supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
  supersessionReason: "empty supersession index",
};

describe("Agent 6 / Agent 1 discovery eligibility", () => {
  it("Pass A candidate is SIGNAL_ONLY_NOT_EXECUTABLE", () => {
    const a = assessPassAEligibility(sample);
    expect(a.executable).toBe(false);
    expect(a.status).toBe("SIGNAL_ONLY_NOT_EXECUTABLE");
    expect(a.agent1Gate).toBe("CONSERVATIVE_ELIGIBILITY");
  });

  it("Pass A population executableCount is always 0", () => {
    const pop = assessPassAPopulation([sample, { ...sample, sectionRef: "7.05", nodeId: "id2" }]);
    expect(pop.total).toBe(2);
    expect(pop.executableCount).toBe(0);
    expect(pop.allSignalOnly).toBe(true);
  });

  it("separates operational credential failures from substantive legal failures", () => {
    expect(
      classifyStageFailure({
        stage: "LEGAL_INTERPRETATION",
        reason: "BLOCKED_BY_MISSING_CREDENTIAL:AI_GATEWAY_OR_ANTHROPIC",
        upstreamCredentialBlocked: true,
      }),
    ).toBe("OPERATIONAL_CREDENTIAL");
    expect(
      classifyStageFailure({
        stage: "VERIFIED_RULE",
        reason: "cascade from upstream",
        upstreamCredentialBlocked: true,
      }),
    ).toBe("CASCADE_FROM_UPSTREAM");
    expect(
      classifyStageFailure({
        stage: "CAPACITY",
        reason: "CROSS_RULE_GATE_NOT_EXECUTABLE legal interpretation",
        upstreamCredentialBlocked: false,
      }),
    ).toBe("SUBSTANTIVE_LEGAL_INTERPRETATION");
    expect(
      classifyStageFailure({
        stage: "FINANCIAL_INPUTS",
        reason: "No APPROVED snapshot; DO_NOT_INVENT",
        upstreamCredentialBlocked: false,
      }),
    ).toBe("MISSING_EVIDENCE");
  });
});
