/**
 * Rule 28 — no bare-year fallback in extractEffectiveDateHint.
 *
 * The old code returned Jan 1 of ANY 4-digit year in a title when
 * no "dated as of / as of / effective" phrasing was present. A
 * bare year in a title is usually NOT the effective date — it is
 * a maturity year ("8.5% Notes due 2031"), a facility year
 * ("Amendment to 2023 Credit Facility"), or a fiscal year.
 * Inventing Jan 1 of that year as the effective date corrupts
 * chronology checks and as-of gating: a restatement titled with
 * a 2031 maturity year was treated as "not yet effective" until
 * 2031, so the predecessor was wrongly retained. Return null for
 * bare years; callers fall back to the filing date (a real date).
 */
import { describe, expect, it } from "vitest";
import {
  extractEffectiveDateHint,
  resolveOperativePrecedence,
} from "../../lib/product/customer-intelligence/operative-resolution";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";
import type { AmendmentPackageView } from "../../lib/product/customer-intelligence/amendment-package";

describe("extractEffectiveDateHint", () => {
  it("returns null for a bare maturity year", () => {
    expect(extractEffectiveDateHint("8.5% Senior Notes due 2031")).toBeNull();
  });

  it("returns null for a bare facility year", () => {
    expect(extractEffectiveDateHint("Amendment to 2023 Credit Facility")).toBeNull();
  });

  it("still parses 'dated as of' and ISO dates", () => {
    expect(extractEffectiveDateHint("Amended and Restated Credit Agreement dated as of March 15, 2024")).toBe("2024-03-15");
    expect(extractEffectiveDateHint("Supplemental Indenture 2024-06-01")).toBe("2024-06-01");
  });
});

function src(sourceId: string, documentClass: string, documentTitle: string, filingDate: string): KnowledgeSourceRecord {
  return { sourceId, documentClass, documentTitle, filingDate } as unknown as KnowledgeSourceRecord;
}

describe("restatement as-of gating with maturity year in title", () => {
  it("uses filing date, not the maturity year, as the effective date", () => {
    const base = src("base", "CREDIT_AGREEMENT", "Credit Agreement", "2024-01-01");
    const rest = src("rest", "RESTATEMENT", "Amended and Restated Credit Agreement — 8.5% Notes due 2031", "2024-06-01");
    const ap = {
      operativeResolution: "UNRESOLVED_PRECEDENCE",
      baseCandidates: [{ sourceId: "base", title: "Credit Agreement", documentClass: "CREDIT_AGREEMENT" }],
      amendmentDocuments: [],
      unresolvedReasons: [],
    } as unknown as AmendmentPackageView;
    const out = resolveOperativePrecedence({
      sources: [base, rest],
      amendmentPackage: ap,
      compare: { rows: [] } as never,
      asOfDate: "2026-01-01",
    });
    expect(out.status).toBe("RESOLVED");
    expect(out.operativeDocumentSourceId).toBe("rest");
    expect(out.effectiveDate).toBe("2024-06-01");
  });
});
