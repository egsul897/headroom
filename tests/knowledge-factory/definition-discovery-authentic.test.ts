/**
 * Authentic SEC-extracted credit agreements draft definitions with curly quotes,
 * interior whitespace / NBSP, and "shall mean". Product covenant intelligence
 * depends on discoverDefinitions covering those patterns.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { discoverDefinitions, extractStructure } from "../../lib/knowledge-factory/pipeline/structural";

const GIBRALTAR = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt";
const CHEWY = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";

describe("authentic definition discovery", () => {
  it("recovers spaced curly-quote definitions from Gibraltar (not a handful of accidents)", () => {
    const text = readFileSync(GIBRALTAR, "utf8");
    const structural = extractStructure("fixture:gibraltar", text);
    const defs = discoverDefinitions("fixture:gibraltar", text, structural.nodes);
    const terms = new Set(defs.map((d) => d.term));
    expect(defs.length).toBeGreaterThan(100);
    expect(terms.has("ABR Loan")).toBe(true);
    expect(terms.has("Administrative Agent") || [...terms].some((t) => /Administrative\s+Agent/i.test(t))).toBe(true);
    expect(terms.has("Acquisition") || [...terms].some((t) => t === "Acquisition")).toBe(true);
    // "shall mean" form
    expect([...terms].some((t) => /Acquisition Agreement/i.test(t))).toBe(true);
  });

  it("recovers a dense definition set from Chewy", () => {
    const text = readFileSync(CHEWY, "utf8");
    const structural = extractStructure("fixture:chewy", text);
    const defs = discoverDefinitions("fixture:chewy", text, structural.nodes);
    expect(defs.length).toBeGreaterThan(50);
  });

  it("still matches tight straight-quote drafting", () => {
    const text = `"Indebtedness" means borrowed money.\n"Consolidated EBITDA" shall mean Consolidated Net Income plus addbacks.`;
    const defs = discoverDefinitions("fixture:tight", text, []);
    expect(defs.map((d) => d.term).sort()).toEqual(["Consolidated EBITDA", "Indebtedness"]);
  });
});
