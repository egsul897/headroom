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
  it("proof is the #414 FigureProof: sourced inputs, unexposed inputs value null, no clause/page invented", () => {
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

describe("#414 CertificateModel", () => {
  const m = toCertificateModel(r);
  const ln = (n: string) => m.lines.find((l) => l.name === n)!;
  it("period = engine as-of date; required/actual/headroom as strings; PASS/FAIL only when evaluated", () => {
    expect(m.period).toBe(r.asOfDate);
    expect(ln("Max total net leverage")).toEqual({ name: "Max total net leverage", required: "4.50x max", actual: "3.10x", headroom: "1.40x", evaluated: "PASS", citation: "Credit Agreement §7.11(a)" });
    expect(ln("Min interest coverage")).toMatchObject({ required: "2.50x min", evaluated: "FAIL" });
  });
  it("no computed actual ⇒ evaluated null (renders NOT EVALUATED)", () => {
    expect(ln("Springing FCCR")).toMatchObject({ actual: null, headroom: null, evaluated: null, citation: "Credit Agreement §7.11(c)" });
  });
});

describe("#414 KeyRatioModel[]", () => {
  const rows = overview.covenantFamilies.flatMap((f) => f.rows).filter((x) => x.kind === "RATIO") as Parameters<typeof buildKeyRatios>[1];
  const metrics = { genericGrossLeverage: { status: "OK", value: 3.4 }, genericNetLeverage: { status: "OK", value: 2.9 }, genericSecuredLeverage: { status: "UNAVAILABLE_MISSING_INPUT", value: null }, genericInterestCoverage: { status: "OK", value: 5.1 } };
  const k = buildKeyRatios(metrics, rows);
  const by = (id: string) => k.find((x) => x.id === id)!;
  it("agreement-defined covenant ratio wins, with its limit and clause", () => {
    expect(by("net")).toMatchObject({ value: 3.1, limitLabel: "4.50x max", clause: "Credit Agreement §7.11(a)", thresholds: null });
    expect(by("interest")).toMatchObject({ value: 2.0, limitLabel: "2.50x min" });
  });
  it("generic fallback is labelled generic and never paired with a covenant limit", () => {
    expect(by("gross")).toMatchObject({ value: 3.4, limitLabel: null, clause: null });
    expect(by("gross").source).toMatch(/Generic position metric/);
    expect(by("secured")).toMatchObject({ value: null, source: null });
  });
  it("FCCR: only the agreement's modeled definition, else NOT DETERMINABLE (no generic fallback)", () => {
    expect(by("fccr")).toMatchObject({ value: null, limitLabel: null });
    expect(by("fccr").source).toMatch(/^NOT DETERMINABLE/);
    const modeled = buildKeyRatios(null, [{ name: "Minimum Fixed Charge Coverage Ratio", documentName: "CA", sectionRef: "§7.11(c)", status: "MODELED", currentRatio: 1.4, ratioLimit: 1.1, comparisonDirection: "at_or_above" }]);
    expect(modeled.find((x) => x.id === "fccr")).toMatchObject({ value: 1.4, limitLabel: "1.10x min", clause: "CA §7.11(c)" });
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
