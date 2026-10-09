/**
 * NS-6 — contractual selector resolution.
 * Proves: no latest-quarter default, no undelivered substitution, calendar + non-calendar FY,
 * delayed delivery, competing deliveries → AMBIGUOUS, snapshot bind by exact identity only.
 */
import { describe, expect, it } from "vitest";
import {
  mostRecentlyEndedFiscalQuarter,
  quarterEndsForFiscalYear,
  resolveContractualSelector,
  selectSnapshotForResolvedSelector,
  type DeliveryRecord,
  type FiscalCalendar,
} from "@/lib/contract-model/runtime/input/selector";

const CAL_CALENDAR: FiscalCalendar = { companyId: "co-a", fiscalYearEndMonth: 12, fiscalYearEndDay: 31 };
const CAL_JUNE: FiscalCalendar = { companyId: "co-b", fiscalYearEndMonth: 6, fiscalYearEndDay: 30 };

function delivery(over: Partial<DeliveryRecord> & Pick<DeliveryRecord, "reportingPeriodKey" | "asOfIsoDate" | "deliveredAtIsoDate">): DeliveryRecord {
  return {
    companyId: over.companyId ?? "co-a",
    kind: over.kind ?? "COMPLIANCE_CERTIFICATE",
    documentId: over.documentId ?? `doc-${over.reportingPeriodKey}`,
    ...over,
  };
}

describe("fiscal calendar quarter ends", () => {
  it("calendar-year FY: Q2 ends 2026-06-30", () => {
    const q = quarterEndsForFiscalYear(CAL_CALENDAR, 2026);
    expect(q.map((x) => x.asOfIsoDate)).toEqual(["2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31"]);
    expect(q[1]!.reportingPeriodKey).toBe("FY2026-Q2");
  });

  it("June FYE: Q4 ends 2026-06-30; Q1 ends 2025-09-30", () => {
    const q = quarterEndsForFiscalYear(CAL_JUNE, 2026);
    expect(q[0]!.asOfIsoDate).toBe("2025-09-30");
    expect(q[3]!.asOfIsoDate).toBe("2026-06-30");
    expect(q[3]!.reportingPeriodKey).toBe("FY2026-Q4");
  });

  it("most recently ended quarter on 2026-07-15 is Q2 (calendar)", () => {
    const r = mostRecentlyEndedFiscalQuarter(CAL_CALENDAR, "2026-07-15");
    expect(r.reportingPeriodKey).toBe("FY2026-Q2");
    expect(r.asOfIsoDate).toBe("2026-06-30");
  });

  it("on a quarter-end date, that quarter counts as ended", () => {
    const r = mostRecentlyEndedFiscalQuarter(CAL_CALENDAR, "2026-06-30");
    expect(r.reportingPeriodKey).toBe("FY2026-Q2");
  });
});

describe("resolveContractualSelector", () => {
  it("MOST_RECENTLY_ENDED_FISCAL_QUARTER with delivery → RESOLVED exact identity", () => {
    const r = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: CAL_CALENDAR,
      deliveries: [delivery({ reportingPeriodKey: "FY2026-Q2", asOfIsoDate: "2026-06-30", deliveredAtIsoDate: "2026-07-20" })],
    });
    expect(r.state).toBe("RESOLVED");
    if (r.state !== "RESOLVED") return;
    expect(r.reportingPeriodKey).toBe("FY2026-Q2");
    expect(r.asOf).toEqual({ kind: "EXACT_DATE", isoDate: "2026-06-30" });
    expect(r.period).toEqual({ kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: "FY2026-Q2" });
  });

  it("refuses undelivered fiscal quarter (no latest-quarter / carry-forward)", () => {
    const r = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: CAL_CALENDAR,
      deliveries: [
        // Prior quarter delivered — must NOT be substituted for Q2
        delivery({ reportingPeriodKey: "FY2026-Q1", asOfIsoDate: "2026-03-31", deliveredAtIsoDate: "2026-04-20" }),
      ],
    });
    expect(r.state).toBe("NEEDS_INPUT");
    if (r.state !== "NEEDS_INPUT") return;
    expect(r.missing[0]).toContain("FY2026-Q2");
    expect(r.reason).toMatch(/refusing undelivered/i);
  });

  it("delayed certificate: evaluation before delivery refuses; after delivery resolves", () => {
    const deliveries = [delivery({ reportingPeriodKey: "FY2026-Q2", asOfIsoDate: "2026-06-30", deliveredAtIsoDate: "2026-08-15" })];
    const early = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: CAL_CALENDAR,
      deliveries,
    });
    expect(early.state).toBe("NEEDS_INPUT");

    const late = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-08-20",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: CAL_CALENDAR,
      deliveries,
    });
    expect(late.state).toBe("RESOLVED");
    if (late.state === "RESOLVED") expect(late.reportingPeriodKey).toBe("FY2026-Q2");
  });

  it("MOST_RECENTLY_DELIVERED_FINANCIAL_STATEMENTS picks by delivery date, not snapshot recency", () => {
    const r = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-10-01",
      selector: "MOST_RECENTLY_DELIVERED_FINANCIAL_STATEMENTS",
      deliveries: [
        delivery({
          kind: "FINANCIAL_STATEMENTS",
          reportingPeriodKey: "FY2026-Q1",
          asOfIsoDate: "2026-03-31",
          deliveredAtIsoDate: "2026-09-01",
          documentId: "fs-q1-late",
        }),
        delivery({
          kind: "FINANCIAL_STATEMENTS",
          reportingPeriodKey: "FY2026-Q2",
          asOfIsoDate: "2026-06-30",
          deliveredAtIsoDate: "2026-07-25",
          documentId: "fs-q2-earlier",
        }),
      ],
    });
    expect(r.state).toBe("RESOLVED");
    if (r.state !== "RESOLVED") return;
    // Q1 delivered later than Q2 — "most recently delivered" is Q1, not latest quarter Q2/Q3
    expect(r.reportingPeriodKey).toBe("FY2026-Q1");
  });

  it("competing deliveries same day different periods → AMBIGUOUS", () => {
    const r = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-10-01",
      selector: "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
      deliveries: [
        delivery({ reportingPeriodKey: "FY2026-Q2", asOfIsoDate: "2026-06-30", deliveredAtIsoDate: "2026-09-01", documentId: "c1" }),
        delivery({ reportingPeriodKey: "FY2026-Q3", asOfIsoDate: "2026-09-30", deliveredAtIsoDate: "2026-09-01", documentId: "c2" }),
      ],
    });
    expect(r.state).toBe("AMBIGUOUS");
  });

  it("verbatim registry maps common contract wording; unknown → NEEDS_INPUT", () => {
    const ok = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-08-01",
      selector: { verbatim: "the last day of the most recently ended fiscal quarter for which financial statements are available" },
      fiscalCalendar: CAL_CALENDAR,
      deliveries: [delivery({ reportingPeriodKey: "FY2026-Q2", asOfIsoDate: "2026-06-30", deliveredAtIsoDate: "2026-07-20" })],
    });
    expect(ok.state).toBe("RESOLVED");

    const unknown = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-08-01",
      selector: { verbatim: "whenever the CFO feels like it" },
    });
    expect(unknown.state).toBe("NEEDS_INPUT");
    if (unknown.state === "NEEDS_INPUT") expect(unknown.evidence.note).toMatch(/CFO/);
  });

  it("DATE_OF_TRANSACTION uses evaluation date; no fiscal calendar required", () => {
    const r = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-09-15",
      selector: "DATE_OF_TRANSACTION",
    });
    expect(r.state).toBe("RESOLVED");
    if (r.state === "RESOLVED") {
      expect(r.asOf).toEqual({ kind: "EXACT_DATE", isoDate: "2026-09-15" });
      expect(r.period.kind).toBe("NOT_PERIOD_SPECIFIC");
    }
  });

  it("non-calendar June FYE resolves Q4 correctly", () => {
    const r = resolveContractualSelector({
      companyId: "co-b",
      evaluationDate: "2026-07-10",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: CAL_JUNE,
      deliveries: [
        delivery({
          companyId: "co-b",
          reportingPeriodKey: "FY2026-Q4",
          asOfIsoDate: "2026-06-30",
          deliveredAtIsoDate: "2026-07-05",
        }),
      ],
    });
    expect(r.state).toBe("RESOLVED");
    if (r.state === "RESOLVED") expect(r.reportingPeriodKey).toBe("FY2026-Q4");
  });
});

describe("selectSnapshotForResolvedSelector", () => {
  it("binds by exact period/as-of; refuses multiple matches; never picks latest among APPROVED", () => {
    const sel = resolveContractualSelector({
      companyId: "co-a",
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: CAL_CALENDAR,
      deliveries: [delivery({ reportingPeriodKey: "FY2026-Q2", asOfIsoDate: "2026-06-30", deliveredAtIsoDate: "2026-07-20" })],
    });
    expect(sel.state).toBe("RESOLVED");
    if (sel.state !== "RESOLVED") return;

    const snaps = [
      { snapshotId: "s-q1", status: "APPROVED", reportingPeriod: "FY2026-Q1", asOf: "2026-03-31", companyId: "co-a" },
      { snapshotId: "s-q2", status: "APPROVED", reportingPeriod: "FY2026-Q2", asOf: "2026-06-30", companyId: "co-a" },
      { snapshotId: "s-q2-draft", status: "DRAFT", reportingPeriod: "FY2026-Q2", asOf: "2026-06-30", companyId: "co-a" },
    ];
    const bound = selectSnapshotForResolvedSelector(sel, snaps, "co-a");
    expect(bound).toEqual({ state: "RESOLVED", snapshotId: "s-q2" });

    const dup = selectSnapshotForResolvedSelector(sel, [
      ...snaps,
      { snapshotId: "s-q2-b", status: "APPROVED", reportingPeriod: "FY2026-Q2", asOf: "2026-06-30", companyId: "co-a" },
    ], "co-a");
    expect(dup.state).toBe("AMBIGUOUS");

    const missing = selectSnapshotForResolvedSelector(sel, [snaps[0]!], "co-a");
    expect(missing.state).toBe("NEEDS_INPUT");
  });
});
