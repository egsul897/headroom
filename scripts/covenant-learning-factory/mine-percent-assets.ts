import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { classifyFixedDollarBasket } from "../../lib/contract-model/compiler/fixed-dollar-basket/classify";
import { classifyGreaterOfAssetsBasket } from "../../lib/contract-model/compiler/greater-of-assets-basket/classify";

const PCT_SOLE =
  /\b(?:maximum\s+aggregate\s+amount\s+)?(?:not\s+to\s+exceed|does\s+not\s+exceed|shall\s+not\s+exceed)\s+(?:(?:ten|five|fifteen|twenty|\d+(?:\.\d+)?)\s*percent\s*\((\d+(?:\.\d+)?)%\)|(\d+(?:\.\d+)?)%)\s+of\s+(?:the\s+)?(Total\s+Consolidated\s+Assets|Consolidated\s+Total\s+Assets|Total\s+Assets)\b/gi;

const files: string[] = [];
function walk(dir: string) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      if (name.endsWith(".txt")) files.push(p);
      else if (!name.startsWith(".") && !name.includes(".")) walk(p);
    } catch {
      /* ignore */
    }
  }
}
walk("docs/product-proof");
walk("tests/fixtures/unseen-packages");

const hits: {
  file: string;
  excerpt: string;
  pct: string;
  metric: string;
  fd: string;
  go: string;
}[] = [];

for (const f of files) {
  const text = readFileSync(f, "utf8");
  PCT_SOLE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PCT_SOLE.exec(text)) !== null) {
    const window = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 220);
    if (/\bgreater\s+of\b/i.test(window)) continue;
    const pct = m[1] || m[2];
    const metric = m[3];
    const fd = classifyFixedDollarBasket(window);
    const go = classifyGreaterOfAssetsBasket(window);
    hits.push({
      file: f,
      excerpt: window.replace(/\s+/g, " ").trim().slice(0, 300),
      pct: String(pct),
      metric: String(metric),
      fd: `${fd.class}/${fd.reasons.join(",")}`,
      go: `${go.class}/${go.reasons.join(",")}`,
    });
  }
}

console.log(JSON.stringify({ count: hits.length, hits }, null, 2));
