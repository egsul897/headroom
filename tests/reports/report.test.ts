import { describe, expect, it } from "vitest";
import { buildComplianceReport, notDeterminableReport } from "@/lib/reports/build";
import { csvField, renderComplianceCsv } from "@/lib/reports/render-csv";
import { renderComplianceReportPdf, reportTextLines, wrap } from "@/lib/reports/render-pdf";
import { buildCovenantCalendar } from "@/lib/reports/calendar";
import { parseAsOf } from "@/lib/reports/params";
import { overview } from "./fixtures";

const now = new Date("2026-10-17T12:00:00Z");
const r = buildComplianceReport("co_1", overview, { now });
const line = (k: string) => r.lines.find((l) => l.key === k)!;

describe("compliance report — every number sourced, NEEDS_INPUT honest", () => {
  it("modeled + cited capacity is COMPUTED with its document/section source", () => {
    expect(line("d1:GEN:capacity")).toMatchObject({ value: 62_500_000, status: "COMPUTED", source: { kind: "DOCUMENT", documentName: "Credit Agreement", sectionRef: "§7.03(o)" } });
  });
  it("every non-null value has a source", () => {
    for (const l of r.lines) if (l.value !== null) expect(l.source).not.toBeNull();
    for (const c of r.certificate) if (c.actual !== null) expect(c.citation).toBeTruthy();
  });
  it("review-required capacity has no number and carries the engine's reason", () => {
    expect(line("d1:RATIO:capacity")).toMatchObject({ value: null, status: "NEEDS_INPUT", reason: "Pro forma EBITDA input missing" });
  });
  it("a figure without a section citation is never published", () => {
    expect(line("d1:NOCITE:capacity").value).toBeNull();
    expect(line("d1:NOCITE:capacity").status).not.toBe("COMPUTED");
  });
  it("unmodeled rows stay UNMODELED; their notes are never shown as a formula", () => {
    expect(line("d1:UNM:capacity")).toMatchObject({ status: "UNMODELED", value: null });
    expect(line("d1:UNM:capacity").proof.formula).toBeNull();
  });
  it("remaining is a number only when the engine publishes SUPPORTED_REMAINING", () => {
    expect(line("d1:GEN:remaining")).toMatchObject({ value: null, status: "NEEDS_INPUT" });
    expect(line("d1:SUP:remaining")).toMatchObject({ value: 6_000_000, status: "COMPUTED" });
  });
  it("proof payload carries formula+citation; steps/inputs are NEEDS_INPUT, never reconstructed", () => {
    expect(line("d1:GEN:capacity").proof).toMatchObject({ formula: "greater of $50,000,000 and 25% of Consolidated EBITDA", steps: "NEEDS_INPUT", inputs: "NEEDS_INPUT" });
  });
  it("authority is system-computed, never counsel-verified", () => {
    expect(r.authority).toBe("SYSTEM_COMPUTED_NOT_COUNSEL_VERIFIED");
    expect(JSON.stringify(r)).not.toMatch(/"reviewState":"VERIFIED"/);
  });
  it("counts add up", () => {
    const c = r.counts;
    expect(c.computed + c.needsInput + c.notDeterminable + c.unmodeled).toBe(r.lines.length);
  });
});

describe("certificate payload — required vs actual per covenant", () => {
  const cert = (k: string) => r.certificate.find((c) => c.key === k)!;
  it("compares actual to the cited limit in the covenant's own direction", () => {
    expect(cert("d1:LEV")).toMatchObject({ required: 4.5, actual: 3.1, result: "IN_COMPLIANCE", sectionRef: "§7.11(a)" });
    expect(cert("d1:ICR")).toMatchObject({ required: 2.5, actual: 2.0, result: "NOT_IN_COMPLIANCE" });
  });
  it("missing actual ⇒ NOT_DETERMINABLE, never a pass", () => {
    expect(cert("d1:FCCR")).toMatchObject({ actual: null, result: "NOT_DETERMINABLE", reason: "Fixed charges not on file" });
  });
});

describe("whole-report fail closed", () => {
  it("NOT_DETERMINABLE report has no lines and states the blocker", () => {
    const n = notDeterminableReport("co_1", "No financial state", { now });
    expect(n).toMatchObject({ status: "NOT_DETERMINABLE", lines: [], certificate: [], blocker: "No financial state" });
    expect(renderComplianceCsv(n)).toContain("No financial state");
    expect(reportTextLines(n).join("\n")).toContain("REPORT NOT DETERMINABLE");
  });
});

describe("CSV", () => {
  const csv = renderComplianceCsv(r);
  it("shows NEEDS INPUT text instead of blank/zero for missing figures", () => {
    const ratioLine = csv.split("\r\n").find((l) => l.includes("Ratio debt — contractual capacity"))!;
    expect(ratioLine).toContain("NEEDS INPUT");
    expect(ratioLine).not.toMatch(/,0,/);
  });
  it("neutralises formula injection and quotes commas", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("-5")).toBe("-5");
    expect(csvField("a,b")).toBe('"a,b"');
  });
});

describe("PDF", () => {
  it("is a valid multi-page PDF that never truncates", () => {
    const big = buildComplianceReport("co_1", { ...overview, covenantFamilies: Array.from({ length: 40 }, (_, i) => ({ family: `F${i}`, rows: overview.covenantFamilies[0]!.rows })) }, { now });
    const pdf = renderComplianceReportPdf(big).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    const pages = Number(/\/Count (\d+)/.exec(pdf)![1]);
    expect(pages).toBeGreaterThan(5);
    expect(pdf).toContain(`Page ${pages} of ${pages}`);
    expect(pdf).not.toMatch(/TRUNCATED/);
  });
  it("wraps long words and replaces non-WinAnsi glyphs", () => {
    expect(wrap("x".repeat(250), 100)).toHaveLength(3);
    expect(wrap("§7.11 ≤ 4.50x — ok")[0]).toBe("Sec. 7.11 <= 4.50x - ok");
  });
});

describe("calendar (read-only from persisted obligations)", () => {
  it("empty ⇒ NEEDS_INPUT, never 'nothing due'", () => {
    expect(buildCovenantCalendar("co_1", [])).toMatchObject({ status: "NEEDS_INPUT", entries: [] });
  });
  it("dated vs relative vs unrepresented", () => {
    const c = buildCovenantCalendar("co_1", [
      { stableKey: "a", eventType: "FISCAL_QUARTER_END", conditionDescription: null, deadlineKind: "DAYS_AFTER_EVENT", deadlineDays: 45, deadlineDate: null, requiredAction: "Deliver quarterly financial statements and compliance certificate", satisfactionState: "PENDING", sourceSectionRef: "§6.01(b)", reviewStatus: "PENDING" },
      { stableKey: "b", eventType: "MATURITY", conditionDescription: null, deadlineKind: "FIXED_DATE", deadlineDays: null, deadlineDate: new Date("2029-03-31T00:00:00Z"), requiredAction: "Repay term loans", satisfactionState: "PENDING", sourceSectionRef: "§2.07", reviewStatus: "PENDING" },
      { stableKey: "c", eventType: "EVENT_OF_DEFAULT", conditionDescription: "cure right", deadlineKind: "PERIODIC", deadlineDays: null, deadlineDate: null, requiredAction: "Equity cure", satisfactionState: "PENDING", sourceSectionRef: "§8.04", reviewStatus: "PENDING" },
    ]);
    expect(c.entries[0]).toMatchObject({ key: "b", date: "2029-03-31", dateStatus: "DATED" });
    expect(c.entries.find((e) => e.key === "a")).toMatchObject({ date: null, dateStatus: "NEEDS_INPUT", relativeRule: "45 days after fiscal quarter end", kind: "REPORTING_DEADLINE" });
    expect(c.entries.find((e) => e.key === "c")).toMatchObject({ kind: "CURE_PERIOD", dateStatus: "NEEDS_INPUT" });
  });
});

describe("asOf param", () => {
  it("accepts real dates only", () => {
    expect(parseAsOf(null)).toBeNull();
    expect(parseAsOf("2026-02-30")).toBe("INVALID");
    expect(parseAsOf("26-1-1")).toBe("INVALID");
    expect((parseAsOf("2026-06-30") as Date).toISOString()).toBe("2026-06-30T00:00:00.000Z");
  });
});
