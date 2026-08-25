/**
 * Constructs a real, byte-accurate, minimal-but-valid multi-page PDF for
 * tests/extraction/parse.test.ts - no bundled fixture file, no network
 * fetch. Every offset in the xref table is computed against the actual
 * bytes written, so this is a genuine PDF a real parser (unpdf/PDF.js) has
 * to actually parse, not a stub.
 */

function escapePdfString(text: string): string {
  return text.replace(/([()\\])/g, "\\$1");
}

export function buildMinimalPdf(pageTexts: string[]): Buffer {
  const parts: string[] = [];
  const offsets: number[] = [];
  let offset = 0;

  function push(chunk: string): void {
    offsets.push(offset);
    parts.push(chunk);
    offset += Buffer.byteLength(chunk, "latin1");
  }

  const header = "%PDF-1.4\n";
  parts.push(header);
  offset = Buffer.byteLength(header, "latin1");

  const n = pageTexts.length;
  const kids = Array.from({ length: n }, (_, i) => `${3 + i} 0 R`);

  push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  push(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${n} >>\nendobj\n`);

  const fontObjNum = 3 + n * 2;
  const contentObjNums: number[] = [];
  for (let i = 0; i < n; i++) {
    const contentObjNum = 3 + n + i;
    contentObjNums.push(contentObjNum);
    push(`${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /MediaBox [0 0 300 144] /Contents ${contentObjNum} 0 R >>\nendobj\n`);
  }
  for (let i = 0; i < n; i++) {
    const content = `BT /F1 24 Tf 20 100 Td (${escapePdfString(pageTexts[i]!)}) Tj ET`;
    const len = Buffer.byteLength(content, "latin1");
    push(`${contentObjNums[i]} 0 obj\n<< /Length ${len} >>\nstream\n${content}\nendstream\nendobj\n`);
  }
  push(`${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  const totalObjs = fontObjNum;
  const xrefOffset = offset;
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjs; i++) {
    xref += `${offsets[i - 1]!.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(parts.join("") + xref + trailer, "latin1");
}
