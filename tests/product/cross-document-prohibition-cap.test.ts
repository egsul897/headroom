/**
 * Rule 74 — a capped prohibition does not prohibit a within-cap amount.
 *
 * evaluateFactAgainstTxn's PROHIBITION fallthrough returned
 * PROHIBITS for amount <= capacityUsd. A prohibition with a
 * ceiling ("shall not incur Indebtedness in excess of $50M")
 * does not prohibit a $30M transaction — but the old code
 * said it did, and as an AND constraint that false PROHIBITS
 * poisoned the whole document verdict to PROHIBITED.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateCrossDocumentTransaction,
  type OperativeProvisionFact,
} from "../../lib/product/covenant-intelligence/cross-document-covenant";

function prohibitionFact(
  overrides: Partial<OperativeProvisionFact> = {},
): OperativeProvisionFact {
  return {
    documentId: "doc-1",
    documentLabel: "Test Credit Agreement",
    documentRole: "CREDIT_AGREEMENT",
    sectionRef: "7.2",
    family: "DEBT_INCURRENCE",
    posture: "PROHIBITION",
    statement: "The Borrower shall not incur Indebtedness in excess of $50,000,000.",
    excerpt: "The Borrower shall not incur Indebtedness in excess of $50,000,000.",
    capacityUsd: 50_000_000,
    conditions: [],
    definitionRefs: [],
    crossDocumentTargets: [],
    ...overrides,
  };
}

function run(amountUsd: number, provisions: OperativeProvisionFact[]) {
  return evaluateCrossDocumentTransaction({
    transaction: {
      description: `Incur $${amountUsd.toLocaleString("en-US")} of unsecured Indebtedness.`,
      kind: "UNSECURED_DEBT",
      amountUsd,
      secured: false,
      asOfDate: "2026-06-30",
      knownFacts: { noDefault: true },
    },
    provisions,
    verifiedPackage: null,
    verifiedRulebookHasTrustedUnits: false,
  });
}

describe("capped prohibition evaluation", () => {
  it("within-cap amount is not prohibited by a capped prohibition", () => {
    const verdict = run(30_000_000, [prohibitionFact()]);
    expect(verdict.overallResult).toBe("PERMITTED");
  });

  it("over-cap amount is still prohibited by a capped prohibition", () => {
    const verdict = run(60_000_000, [prohibitionFact()]);
    expect(verdict.overallResult).toBe("PROHIBITED");
  });

  it("within-cap amount with unevidenced conditions is conditional, not prohibited", () => {
    const verdict = run(30_000_000, [
      prohibitionFact({ conditions: ["no Default has occurred and is continuing"] }),
    ]);
    expect(verdict.overallResult).toBe("CONDITIONALLY_PERMITTED");
  });

  it("uncapped prohibition still prohibits", () => {
    const verdict = run(30_000_000, [prohibitionFact({ capacityUsd: null })]);
    expect(verdict.overallResult).toBe("PROHIBITED");
  });
});
