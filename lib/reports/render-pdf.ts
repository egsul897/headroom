/**
 * Multi-page PDF (Helvetica, WinAnsi) with no silent truncation: long lines
 * wrap, pages paginate, every line of the report is present.
 */
import type { ComplianceReport } from "./types";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const LEADING = 13;
const FONT_SIZE = 9;
const MAX_CHARS = 105;
const LINES_PER_PAGE = Math.floor((PAGE_H - 2 * MARGIN) / LEADING);

export function toPdfSafe(s: string): string {
  return s
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\u2026/g, "...")
    .replace(/\u00a7/g, "Sec. ")
    .replace(/[^\x20-\x7e]/g, "?");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function wrap(text: string, width = MAX_CHARS): string[] {
  const words = toPdfSafe(text).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (let w of words) {
    while (w.length > width) {
      if (cur) { out.push(cur); cur = ""; }
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += ` ${w}`;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

function fmt(v: number | null, unit: string, status: string, unlimited?: boolean): string {
  if (unlimited) return "UNLIMITED";
  if (v === null) return status.replace(/_/g, " ");
  if (unit === "USD") return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  return `${v}%`;
}

export function reportTextLines(r: ComplianceReport): string[] {
  const L: string[] = [];
  const push = (s: string, indent = "") => wrap(s, MAX_CHARS - indent.length).forEach((x) => L.push(indent + x));
  push(`HEADROOM COMPLIANCE & CAPACITY REPORT`);
  push(`Company: ${r.companyName ?? r.companyId}    As of: ${r.asOfDate ?? "NOT DETERMINABLE"}    Generated: ${r.generatedAt}`);
  push(`Authority: ${r.authority}`);
  push(r.disclaimer);
  if (r.blocker) push(`REPORT NOT DETERMINABLE: ${r.blocker}`);
  L.push("");
  push(`Lines: ${r.counts.computed} computed, ${r.counts.needsInput} need input, ${r.counts.notDeterminable} not determinable, ${r.counts.unmodeled} unmodeled.`);
  L.push("");
  push("CERTIFICATE - REQUIRED VS ACTUAL");
  if (!r.certificate.length) push("No tested financial covenant with a cited limit is on file.", "  ");
  for (const c of r.certificate) {
    push(`${c.covenant} (${c.documentName} ${c.sectionRef})`, "  ");
    push(
      c.testKind === "MAINTENANCE"
        ? `Required ${c.comparison === "at_or_below" ? "<=" : ">="} ${c.required!.toFixed(2)}x | Actual ${c.actual === null ? "NOT EVALUATED" : `${c.actual.toFixed(2)}x`} | ${c.result.replace(/_/g, " ")} | Review: ${c.reviewState}${c.reason ? ` | ${c.reason}` : ""}`
        : `NOT EVALUATED | ${c.reason ?? ""}`,
      "    ",
    );
  }
  L.push("");
  let section = "";
  for (const l of r.lines) {
    if (l.section !== section) {
      section = l.section;
      L.push("");
      push(section.replace(/_/g, " "));
    }
    const src = l.source?.kind === "DOCUMENT" ? `${l.source.documentName} ${l.source.sectionRef}` : (l.source?.engine ?? "no source");
    push(`${l.label}: ${fmt(l.value, l.unit, l.status, l.unlimited)}  [${src}]`, "  ");
    if (l.reason) push(`${l.reason}`, "    ");
  }
  if (r.warnings.length) {
    L.push("");
    push("WARNINGS");
    for (const w of r.warnings) push(`- ${w}`, "  ");
  }
  return L;
}

export function renderComplianceReportPdf(r: ComplianceReport): Buffer {
  const all = reportTextLines(r);
  const pages: string[][] = [];
  for (let i = 0; i < all.length; i += LINES_PER_PAGE) pages.push(all.slice(i, i + LINES_PER_PAGE));
  if (!pages.length) pages.push([""]);
  const total = pages.length;

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  const kids: string[] = [];
  pages.forEach((lines, idx) => {
    const pageObj = 4 + idx * 2;
    const contentObj = pageObj + 1;
    kids.push(`${pageObj} 0 R`);
    const body = ["BT", `/F1 ${FONT_SIZE} Tf`, `${MARGIN} ${PAGE_H - MARGIN} Td`, `${LEADING} TL`];
    lines.forEach((ln, i) => body.push(`${i === 0 ? "" : "T* "}(${esc(ln)}) Tj`));
    body.push("ET", "BT", `/F1 8 Tf`, `${MARGIN} ${MARGIN / 2} Td`, `(${esc(`Page ${idx + 1} of ${total}`)}) Tj`, "ET");
    const stream = body.join("\n");
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${total} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
