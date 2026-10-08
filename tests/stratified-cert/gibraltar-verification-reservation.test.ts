/**
 * Gibraltar verification spend gate. No provider call.
 * DEVELOPMENT ≠ CERTIFIED.
 */
import { describe, expect, it } from "vitest";
import { BudgetLedger } from "../../scripts/p3-conmed-pilot/timeout-policy";
import { compileReservationUsd, compileShape, shapeExceeded, verifyReservationUsd } from "../../scripts/p3-conmed-pilot/reservation-policy";
import { DEFAULT_CANDIDATE_TIMEOUT_MS } from "../../scripts/p3-conmed-pilot/timeout-policy";
import { readFileSync } from "node:fs";
import {
  HAIKU_MODEL_ID,
  SHOWN_HAIKU_VERIFICATION_CEILING_USD,
  haikuGatewayModel,
  verificationDispatchRank,
} from "../../scripts/p3-development-pipeline/verify-gibraltar";

describe("Gibraltar Haiku verification ceiling", () => {
  it("prices one compile inside the shown Haiku ceiling and refuses the next one once the ceiling is met", () => {
    const model = haikuGatewayModel();
    expect(model.id).toBe(HAIKU_MODEL_ID);
    const compile = compileReservationUsd(model, 2_000, DEFAULT_CANDIDATE_TIMEOUT_MS);
    const verify = verifyReservationUsd(model, DEFAULT_CANDIDATE_TIMEOUT_MS);
    expect(compile).toBeGreaterThan(10);
    expect(compile + verify).toBeLessThan(SHOWN_HAIKU_VERIFICATION_CEILING_USD);

    const ledger = new BudgetLedger(SHOWN_HAIKU_VERIFICATION_CEILING_USD, SHOWN_HAIKU_VERIFICATION_CEILING_USD);
    const first = ledger.reserveOrRefuse("one", compile);
    expect(first.allowed).toBe(true);
    ledger.settle("one", {
      model: model.id,
      elapsedWallClockMs: 1,
      streamedOutputTokensObserved: null,
      providerUsageObserved: null,
      locallyCalculatedCostUsd: 0,
      finalProviderBillingUnavailable: true,
      costAccountingStatus: "UNKNOWN_TIMEOUT_BILLED",
      chargedToBudgetUsd: compile,
    });
    const over = ledger.reserveOrRefuse("over", SHOWN_HAIKU_VERIFICATION_CEILING_USD);
    expect(over.allowed).toBe(false);
  });

  it("dispatches phrase nodes, then reclass windows, then 7.04, then 7.05", () => {
    const phraseNodeIds = new Set(["phrase"]);
    const reclassNodeIds = new Set(["reclass"]);
    const assetNodeIds = new Set(["asset"]);
    const rank = (normalizedSourceRef: string, structuralNodeIds: string[]) =>
      verificationDispatchRank({ normalizedSourceRef, structuralNodeIds, phraseNodeIds, reclassNodeIds, assetNodeIds });
    expect(rank("1.10", ["phrase"])).toBeLessThan(rank("7.01", ["reclass"]));
    expect(rank("7.01", ["reclass"])).toBeLessThan(rank("7.04(a)", ["asset"]));
    expect(rank("7.04(a)", [])).toBeLessThan(rank("7.05(c)", []));
    expect(rank("7.05(c)", [])).toBeLessThan(rank("6.01", []));
  });

  it("keeps a conversation-shape miss as a stop for every document", () => {
    const model = haikuGatewayModel();
    const shape = compileShape(model, 2_000, DEFAULT_CANDIDATE_TIMEOUT_MS);
    const reasons = shapeExceeded({ attemptCount: 11, inputTokens: 1, outputTokens: 1 }, shape);
    expect(reasons.some((reason) => reason.startsWith("conversations 11 > reserved"))).toBe(true);
    const narrow = shapeExceeded({ attemptCount: 3, inputTokens: 1, outputTokens: 1 }, { ...shape, conversations: 2 });
    expect(narrow).toEqual(["conversations 3 > reserved 2"]);
    const source = readFileSync("scripts/p3-development-pipeline/verify-gibraltar.ts", "utf8");
    expect(source).not.toContain("gibraltarShapeStop");
    expect(source).not.toContain("conversations ");
  });
});
