/**
 * Minimal DOCX (OOXML) export from covenant-review markdown/text.
 * Uses jszip — no invented legal conclusions beyond the shared review object.
 */

import JSZip from "jszip";
import type { CovenantReviewWorkspace } from "./covenant-review";
import { renderCovenantReviewMarkdown } from "./export-review";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphsFromMarkdown(md: string): string {
  const blocks = md.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const text = escapeXml(block.replace(/\n/g, " ").trim());
      if (!text) return "";
      const isHeading = /^#{1,3}\s/.test(block.trim());
      const size = isHeading ? 28 : 20;
      const bold = isHeading ? `<w:b/>` : "";
      return `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:rPr>${bold}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${text.replace(/^#{1,3}\s*/, "")}</w:t></w:r></w:p>`;
    })
    .join("");
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

export async function renderCovenantReviewDocx(review: CovenantReviewWorkspace): Promise<Buffer> {
  const md = renderCovenantReviewMarkdown(review);
  const body = paragraphsFromMarkdown(md);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", RELS);
  zip.folder("word")!.file("document.xml", documentXml);
  const out = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(out);
}

export function renderCovenantReviewHtml(review: CovenantReviewWorkspace): string {
  const md = renderCovenantReviewMarkdown(review);
  const body = md
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${escapeXml(line.slice(2))}</h1>`;
      if (line.startsWith("## ")) return `<h2>${escapeXml(line.slice(3))}</h2>`;
      if (line.startsWith("### ")) return `<h3>${escapeXml(line.slice(4))}</h3>`;
      if (line.startsWith("- ")) return `<li>${escapeXml(line.slice(2))}</li>`;
      if (line.trim() === "") return "";
      if (line.trim() === "---") return "<hr/>";
      return `<p>${escapeXml(line)}</p>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Covenant review — ${escapeXml(review.companyId)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #111; line-height: 1.45; }
    h1,h2,h3 { font-family: "Iowan Old Style", Georgia, serif; }
    li { margin-left: 1.2rem; }
    hr { border: none; border-top: 1px solid #ccc; margin: 2rem 0; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}
