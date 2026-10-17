import { describe, expect, it } from "vitest";
import { buildComplianceReport, notDeterminableReport, toCertificateModel } from "@/lib/reports/build";
import { buildKeyRatios } from "@/lib/reports/key-ratios";
import { csvField, renderComplianceCsv } from "@/lib/reports/render-csv";
import { renderComplianceReportPdf, reportTextLines, wrap } from "@/lib/reports/render-pdf";
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
    expect(line("d1:UNM:capacity").formula).toBeNull();
    expect(line("d1:UNM:capacity").proof.inputs.find((i) => i.label === "Capacity formula")!.value).toBeNull();
  });
  it("remaining is a number only when the engine publishes SUPPORTED_REMAINING", () => {
    expect(line("d1:GEN:remaining")).toMatchObject({ value: null, status: "NEEDS_INPUT" });
    expect(line("d1:SUP:remaining")).toMatchObject({ value: 6_000_000, status: "COMPUTED" });
  });
  it("proof is the PR 414 FigureProof: sourced inputs, unexposed inputs value null, no clause/page invented", () => {
    const p = line("d1:GEN:capacity").proof;
    expect(p).toMatchObject({ figure: "General debt basket — contractual capacity", value: "$62,500,000", clause: null, page: null, review: "UNVERIFIED" });
    expect(p.inputs[0]).toEqual({ label: "Capacity formula", value: "greater of $50,000,000 and 25% of Consolidated EBITDA", source: "Credit Agreement §7.03(o)" });
    const ratio = line("d1:LEV:actual").proof;
    expect(ratio.value).toBe("3.10x");
    expect(ratio.inputs.filter((i) => i.value === null).map((i) => i.label)).toEqual(["Numerator", "Denominator"]);
    expect(ratio.inputs[2]).toEqual({ label: "Covenant limit", value: "4.50x max", source: "Credit Agreement §7.11(a)" });
    for (const l of r.lines) expect(l.proof.review).not.toBe("VERIFIED");
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

describe("certificate payload — fail closed without an engine maintenance flag (R2)", () => {
  const cert = (k: string) => r.certificate.find((c) => c.key === k)!;
  it("unflagged rows are NOT_EVALUATED with no required/actual, never PASS/FAIL", () => {
    expect(cert("d1:LEV")).toMatchObject({ testKind: "NOT_FLAGGED", required: null, actual: null, result: "NOT_EVALUATED" });
    expect(cert("d1:ICR")).toMatchObject({ result: "NOT_EVALUATED" });
    expect(cert("d1:LEV").reason).toMatch(/does not mark this test as a maintenance financial covenant/);
  });
  it("flagged MAINTENANCE: engine verdict passed through; no verdict ⇒ NOT_EVALUATED; INCURRENCE excluded", () => {
    const flag = (k: string, extra: object) => ({ ...overview, covenantFamilies: overview.covenantFamilies.map((f) => ({ ...f, rows: f.rows.map((row) => (row.stableKey === k ? { ...row, ...extra } : row)) })) });
    const a = buildComplianceReport("co_1", flag("d1:LEV", { testKind: "MAINTENANCE", complianceVerdict: "IN_COMPLIANCE" }), { now });
    expect(a.certificate.find((c) => c.key === "d1:LEV")).toMatchObject({ testKind: "MAINTENANCE", required: 4.5, actual: 3.1, headroom: 1.4, result: "IN_COMPLIANCE", reason: null });
    const b = buildComplianceReport("co_1", flag("d1:ICR", { testKind: "MAINTENANCE" }), { now });
    expect(b.certificate.find((c) => c.key === "d1:ICR")).toMatchObject({ actual: 2.0, result: "NOT_EVALUATED" });
    const c = buildComplianceReport("co_1", flag("d1:ICR", { testKind: "INCURRENCE" }), { now });
    expect(c.certificate.find((x) => x.key === "d1:ICR")).toBeUndefined();
    const d = buildComplianceReport("co_1", flag("d1:FCCR", { testKind: "MAINTENANCE", complianceVerdict: "IN_COMPLIANCE" }), { now });
    expect(d.certificate.find((x) => x.key === "d1:FCCR")).toMatchObject({ actual: null, result: "NOT_EVALUATED", reason: "Fixed charges not on file" });
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

describe("PR 414 CertificateModel", () => {
  it("period = engine as-of date; unflagged lines carry only name + citation (NOT EVALUATED)", () => {
    const m = toCertificateModel(r);
    expect(m.period).toBe(r.asOfDate);
    expect(m.lines.find((l) => l.name === "Max total net leverage")).toEqual({ name: "Max total net leverage", required: null, actual: null, headroom: null, evaluated: null, citation: "Credit Agreement §7.11(a)" });
  });
  it("flagged maintenance + engine verdict ⇒ strings and PASS/FAIL", () => {
    const flagged = { ...overview, covenantFamilies: overview.covenantFamilies.map((f) => ({ ...f, rows: f.rows.map((row) => (row.stableKey === "d1:ICR" ? { ...row, testKind: "MAINTENANCE" as const, complianceVerdict: "NOT_IN_COMPLIANCE" as const } : row)) })) };
    const m = toCertificateModel(buildComplianceReport("co_1", flagged, { now }));
    expect(m.lines.find((l) => l.name === "Min interest coverage")).toMatchObject({ required: "2.50x min", actual: "2.00x", evaluated: "FAIL" });
  });
});

describe("PR 414 KeyRatioModel[] (fixture rows; engine-backed probes are in engine-rows.test.ts)", () => {
  const rows = overview.covenantFamilies.flatMap((f) => f.rows).filter((x) => x.kind === "RATIO") as Parameters<typeof buildKeyRatios>[1];
  const metrics = { genericGrossLeverage: { status: "OK", value: 3.4 }, genericNetLeverage: { status: "OK", value: 2.9 }, genericSecuredLeverage: { status: "UNAVAILABLE_MISSING_INPUT", value: null }, genericInterestCoverage: { status: "OK", value: 5.1 } };
  const k = buildKeyRatios(metrics, rows);
  const by = (id: string) => k.find((x) => x.id === id)!;
  it("rows matched only by name are never used: generic value, no limit", () => {
    expect(by("net")).toMatchObject({ value: 2.9, limitLabel: null, clause: null });
    expect(by("gross").source).toMatch(/Generic position metric/);
    expect(by("secured")).toMatchObject({ value: null, source: null });
  });
  it("FCCR: NOT DETERMINABLE unless the engine flags the agreement's own definition", () => {
    expect(by("fccr")).toMatchObject({ value: null, limitLabel: null });
    expect(by("fccr").source).toMatch(/^NOT DETERMINABLE/);
    const named = { name: "Minimum Fixed Charge Coverage Ratio", documentName: "CA", sectionRef: "§7.11(c)", status: "MODELED", currentRatio: 1.4, ratioLimit: 1.1, comparisonDirection: "at_or_above" as const };
    expect(buildKeyRatios(null, [named]).find((x) => x.id === "fccr")!.value).toBeNull();
    expect(buildKeyRatios(null, [{ ...named, testKind: "MAINTENANCE", agreementDefinedMetric: "FIXED_CHARGE_COVERAGE" }]).find((x) => x.id === "fccr")).toMatchObject({ value: 1.4, limitLabel: "1.10x min", clause: "CA §7.11(c)" });
  });
  it("bands never defaulted here", () => {
    for (const x of k) expect(x.thresholds).toBeNull();
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
