/**
 * Find dollar amounts with near-cap phrasing that fixed-dollar classifier rejects as not_cap_role.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { classifyFixedDollarBasket } from "../../lib/contract-model/compiler/fixed-dollar-basket/classify";

const NEAR_CAP =
  /\b(?:aggregate(?:\s+principal)?\s+amount(?:\s+(?:at\s+any\s+time\s+)?outstanding)?|principal\s+amount(?:\s+outstanding)?|outstanding(?:\s+principal\s+amount)?)\b[^.;]{0,80}\$\s?[\d,]+|\b(?:up\s+to|not\s+exceeding|in\s+an?\s+amount\s+(?:of\s+)?up\s+to)\s+\$\s?[\d,]+/gi;

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

const misses: { file: string; excerpt: string; reasons: string[] }[] = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  NEAR_CAP.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NEAR_CAP.exec(text)) !== null) {
    const window = text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 80).replace(/\s+/g, " ");
    if (/\bgreater\s+of\b/i.test(window)) continue;
    const fd = classifyFixedDollarBasket(window);
    if (fd.class === "NOT_FIXED_DOLLAR" && fd.reasons.includes("dollar_present_but_not_cap_role")) {
      misses.push({ file: path.basename(f), excerpt: window.slice(0, 260), reasons: fd.reasons });
    }
  }
}
console.log(JSON.stringify({ count: misses.length, samples: misses.slice(0, 25) }, null, 2));
