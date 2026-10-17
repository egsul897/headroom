/**
 * Minimal single-page-stream PDF from covenant review markdown.
 * No invented legal conclusions — wraps shared Markdown export.
 */

import type { CovenantReviewWorkspace } from "./covenant-review";
import { renderCovenantReviewMarkdown } from "./export-review";

function escapePdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function renderCovenantReviewPdf(review: CovenantReviewWorkspace): Buffer {
  const md = renderCovenantReviewMarkdown(review);
  const rawLines = md.split("\n").filter((l) => l.trim().length > 0);
  // Rule 100: the PDF is a single-page stream capped at 180
  // lines with lines cut at 110 chars. A truncated export
  // must SAY it is truncated — it must not end mid-document
  // looking complete, and a cut line must not read as whole.
  const lines = rawLines
    .map((l) => {
      const clean = l.replace(/\t/g, " ");
      return clean.length > 110 ? `${clean.slice(0, 110)}…` : clean;
    })
    .slice(0, 180);
  if (rawLines.length > 180) {
    lines.push(
      `[TRUNCATED — this PDF shows the first 180 of ${rawLines.length} lines; download the Markdown export for the complete review.]`,
    );
  }

  const contentLines: string[] = ["BT", "/F1 10 Tf", "50 780 Td", "14 TL"];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) contentLines.push(`(${escapePdfText(lines[i]!)}) Tj`);
    else contentLines.push(`T* (${escapePdfText(lines[i]!)}) Tj`);
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
  );
  objects.push(`4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream\nendobj\n`);
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
