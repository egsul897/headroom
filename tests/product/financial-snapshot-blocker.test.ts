/**
 * Rule 35 — capacity readiness must not misdiagnose ambiguous
 * financials as missing.
 *
 * loadCapacityReadiness treated any non-UNIQUE financial identity
 * the same: blocker "No dated FinancialState on the legacy
 * path" + headline "financial snapshot missing". But AMBIGUOUS
 * means FinancialStates EXIST — several conflicting rows in the
 * latest cohort. Telling counsel "no snapshot" sends them to
 * upload another one, which does not fix ambiguity (and can make
 * it worse). The blocker must name the real defect: N conflicting
 * rows that need resolving to a single canonical snapshot.
 * Pure helper so it is unit-testable without prisma.
 */
import { describe, expect, it } from "vitest";
import { financialSnapshotBlocker } from "../../lib/product/customer-intelligence/financial-snapshot-blocker";

describe("financialSnapshotBlocker", () => {
  it("returns null for a UNIQUE snapshot", () => {
    expect(
      financialSnapshotBlocker({ status: "UNIQUE", code: "UNIQUE", matchCount: 1, row: {} }),
    ).toBeNull();
  });

  it("names ambiguity (count + resolve) instead of claiming no snapshot", () => {
    const msg = financialSnapshotBlocker({
      status: "AMBIGUOUS",
      code: "FINANCIAL_IDENTITY_AMBIGUOUS",
      matchCount: 3,
    });
    expect(msg).toMatch(/3/);
    expect(msg).toMatch(/conflicting/i);
    expect(msg).toMatch(/resolve/i);
    expect(msg).not.toMatch(/no dated financialstate/i);
  });

  it("reports missing for UNKNOWN", () => {
    const msg = financialSnapshotBlocker({
      status: "UNKNOWN",
      code: "FINANCIAL_IDENTITY_UNKNOWN",
      matchCount: 0,
    });
    expect(msg).toMatch(/no dated financialstate/i);
  });
});
