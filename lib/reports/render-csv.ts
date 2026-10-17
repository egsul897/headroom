import type { ComplianceReport } from "./types";

/** RFC 4180 field; also neutralises spreadsheet formula injection (=,+,-,@ at start). */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: unknown[]) => cells.map(csvField).join(",");

function shown(value: number | null, status: string, unlimited?: boolean): string {
  if (unlimited) return "UNLIMITED";
  if (value === null) return status.replace(/_/g, " ");
  return String(value);
}

export function renderComplianceCsv(r: ComplianceReport): string {
  const out: string[] = [];
  out.push(row(["Headroom compliance & capacity report"]));
  out.push(row(["Company", r.companyName ?? r.companyId]));
  out.push(row(["As of", r.asOfDate ?? "NOT DETERMINABLE"]));
  out.push(row(["Generated", r.generatedAt]));
  out.push(row(["Authority", r.authority]));
  out.push(row(["Note", r.disclaimer]));
  if (r.blocker) out.push(row(["Report status", r.status, r.blocker]));
  out.push("");
  out.push(row(["CERTIFICATE — required vs actual"]));
  out.push(row(["Covenant", "Document", "Section", "Test", "Required", "Actual", "Headroom", "Result", "Review state", "Reason"]));
  for (const c of r.certificate) {
    out.push(row([c.covenant, c.documentName, c.sectionRef, c.comparison === "at_or_below" ? "<=" : ">=", c.required, c.actual ?? c.status.replace(/_/g, " "), c.headroom ?? "", c.result.replace(/_/g, " "), c.reviewState, c.reason ?? ""]));
  }
  out.push("");
  out.push(row(["CAPACITY & COVENANT LINES"]));
  out.push(row(["Section", "Item", "Document", "Section ref", "Value", "Unit", "Status", "Engine state", "Review state", "Source", "Formula", "Reason"]));
  for (const l of r.lines) {
    const src = l.source ? (l.source.kind === "DOCUMENT" ? `${l.source.documentName} ${l.source.sectionRef}` : l.source.engine) : "";
    out.push(row([l.section, l.label, l.documentName ?? "", l.sectionRef ?? "", shown(l.value, l.status, l.unlimited), l.unit, l.status.replace(/_/g, " "), l.engineState ?? "", l.reviewState ?? "", src, l.proof.formula ?? "", l.reason ?? ""]));
  }
  if (r.warnings.length) {
    out.push("");
    out.push(row(["WARNINGS"]));
    for (const w of r.warnings) out.push(row([w]));
  }
  return `${out.join("\r\n")}\r\n`;
}
