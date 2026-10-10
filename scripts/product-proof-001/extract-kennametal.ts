/**
 * One-shot extract for PRODUCT PROOF 001 source freeze.
 * No paid inference. No Neon writes.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument } from "../../lib/extraction/parse";

const PKG = "tests/fixtures/product-proof-001/kennametal-2026-term-loan-credit-agreement";
const htmlPath = `${PKG}/raw-html/d136977dex102.htm`;

async function main() {
  const buf = readFileSync(htmlPath);
  const bodySha = createHash("sha256").update(buf).digest("hex");
  const parsed = await parseDocument(buf, "text/html");
  const text = parsed.fullText;
  const textSha = createHash("sha256").update(text, "utf8").digest("hex");
  writeFileSync(`${PKG}/extracted-text/credit-agreement.txt`, text);
  const needles: Array<[RegExp, string]> = [
    [/SECTION\s+7[.\s].{0,120}NEGATIVE/i, "neg"],
    [/\bIndebtedness\b/i, "indebt"],
    [/\bLiens\b/i, "liens"],
    [/Restricted\s+Payments/i, "rp"],
    [/Consolidated\s+Net\s+Leverage|Maximum\s+Leverage|Leverage\s+Ratio/i, "lev"],
    [/500,000,000/, "amt"],
    [/Negative\s+Covenant/i, "neg2"],
    [/SECTION\s+6\b/i, "s6"],
    [/SECTION\s+8\b/i, "s8"],
  ];
  const hits: Record<string, { index: number; excerpt: string } | null> = {};
  for (const [n, label] of needles) {
    const m = n.exec(text);
    if (m) {
      const i = m.index;
      hits[label] = {
        index: i,
        excerpt: text.slice(Math.max(0, i - 30), i + 220).replace(/\s+/g, " ").slice(0, 240),
      };
    } else {
      hits[label] = null;
    }
  }
  console.log(
    JSON.stringify(
      {
        bodyBytes: buf.length,
        bodySha,
        extractedChars: text.length,
        textSha,
        head: text.slice(0, 500).replace(/\s+/g, " "),
        hits,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
