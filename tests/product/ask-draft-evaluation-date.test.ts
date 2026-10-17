/**
 * Rule 54 — Ask's evaluation-date extraction must prefer a
 * phrase-attached date and skip maturity dates.
 *
 * The old code took the FIRST ISO date anywhere in the
 * question, so "maturing 2031-06-01, evaluated as of
 * 2026-06-30" used the maturity date as the evaluation date
 * (rule 53 class). A phrase-attached date ("as of", "as at",
 * "evaluated as of") now wins; the bare-ISO fallback skips
 * dates preceded by maturity language; non-calendar dates are
 * rejected. Also unifies the ISO validator into one shared
 * module (lib/product/iso-date.ts) used by the handoff,
 * the effective-date hint, and this parser.
 */
import { describe, expect, it } from "vitest";
import { parseTransactionDraft } from "../../lib/product/north-star-workflow/parse-transaction-draft";

describe("parseTransactionDraft evaluationDate", () => {
  it("prefers a phrase-attached date over an earlier maturity date", () => {
    const d = parseTransactionDraft("Can we incur $50M of debt maturing 2031-06-01, evaluated as of 2026-06-30?");
    expect(d.evaluationDate).toBe("2026-06-30");
  });

  it("returns null when the only date is a maturity date", () => {
    const d = parseTransactionDraft("Can we incur $50M of debt maturing 2031-06-01?");
    expect(d.evaluationDate).toBeNull();
  });

  it("still takes a bare ISO date with no maturity language", () => {
    const d = parseTransactionDraft("Can we incur $50M of debt on 2026-06-30?");
    expect(d.evaluationDate).toBe("2026-06-30");
  });

  it("rejects a non-calendar date", () => {
    const d = parseTransactionDraft("Can we incur $50M of debt as of 2026-02-30?");
    expect(d.evaluationDate).toBeNull();
  });
});
