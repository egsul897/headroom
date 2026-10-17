/**
 * #428 review fixes. Synthetic text only.
 * - Definition lookup prefers the "means" form; the colon form only when there is no "means"; a pointer stub never
 *   beats a real definition; colon headings and table-of-contents lines are not definitions; a colon inside the body
 *   never ends it.
 * - "&amp;" decodes once and last; a <style> class with line-through is struck text.
 * - The section-tree defined-term scan takes a colon form only at the start of an entry with a prose body.
 */
import { describe, expect, it } from "vitest";
import { findDefinitionText, findEbitdaMeasureTerm } from "@/lib/covenant-learning-factory/xbrl/definition-items";
import { stripHtmlPreserveStructure } from "@/lib/contract-model/compiler/deterministic-extraction/html-text";
import { dropStruckHtml } from "@/lib/extraction/html-hardening";
import { definedTerms } from "@/lib/contract-model/section-tree/semantics";
import { parseSectionTree } from "@/lib/contract-model/section-tree/parse";

const SCHEDULE = "for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in computing Consolidated Net Income, (a) interest expense, (b) provision for taxes based on income, (c) depreciation and amortization expense and (d) non-cash charges, minus (e) non-cash gains increasing Consolidated Net Income.";

describe("definition lookup", () => {
  it("a pointer stub before the real definition does not hide it", () => {
    const doc = `"Agent" means the administrative agent. "Adjusted EBITDA" has the meaning given to such term in Clause 21.4 (Financial definitions). "Borrower" means the company. ARTICLE XXI "Adjusted EBITDA" means, ${SCHEDULE} "Adjusted Net Income" means the net income.`;
    expect(findEbitdaMeasureTerm(doc)).toBe("Adjusted EBITDA");
    expect(findDefinitionText(doc, "Adjusted EBITDA")).toMatch(/minus \(e\) non-cash gains/);
  });
  it("a stub alone is still returned (nothing better exists)", () => {
    expect(findDefinitionText(`"Adjusted EBITDA" has the meaning assigned to it in Schedule 3. "Borrower" means the company.`, "Adjusted EBITDA")).toMatch(/Schedule 3/);
  });
  it("the means form is preferred over a colon heading or table-of-contents line", () => {
    const doc = `TABLE OF CONTENTS "Adjusted EBITDA": 14 "Adjusted Net Income": 15 ARTICLE I. "Agent" means the agent. "Adjusted EBITDA" means, ${SCHEDULE} "Adjusted Net Income" means the net income.`;
    expect(findEbitdaMeasureTerm(doc)).toBe("Adjusted EBITDA");
    expect(findDefinitionText(doc, "Adjusted EBITDA")).toMatch(/^"Adjusted EBITDA" means/);
  });
  it("a colon inside the body (a parenthetical defined term) does not cut the definition", () => {
    const doc = `"Agent" means the agent. "Adjusted EBITDA" means, for any period, Consolidated Net Income plus the following items (the "Permitted Addbacks"): (a) interest expense, (b) provision for taxes based on income and (c) depreciation and amortization expense, minus (d) non-cash gains. "Adjusted Net Income" means the net income.`;
    expect(findDefinitionText(doc, "Adjusted EBITDA")).toMatch(/minus \(d\) non-cash gains/);
  });
  it("the colon form is used when there is no means form", () => {
    const doc = `"Agent": the administrative agent under this Agreement. "Adjusted EBITDA": ${SCHEDULE} "Adjusted Net Income": the net income of the Borrower for such period.`;
    expect(findDefinitionText(doc, "Adjusted EBITDA")).toMatch(/^"Adjusted EBITDA": for any period/);
  });
});

describe("html text", () => {
  it("&amp; decodes once, after numeric references", () => {
    expect(stripHtmlPreserveStructure("<p>AT&amp;T pays &amp;#36;5 and &#36;6</p>")).toBe("AT&T pays &#36;5 and $6");
  });
  it("a <style> class with line-through is struck text; other classes are kept", () => {
    const html = `<html><head><style>.c7 { font-weight: bold } p .c9, .gone { text-decoration: line-through; }</style></head><body><p>not to exceed <span class="c9">$40,000,000</span><span class="c7">$55,000,000</span></p></body></html>`;
    const out = dropStruckHtml(html);
    expect(out).not.toContain("$40,000,000");
    expect(out).toContain("$55,000,000");
  });
});

describe("section-tree defined terms", () => {
  it("a parenthetical colon term and a TOC colon line are not definitions; a real colon entry is", () => {
    const t = `ARTICLE I\nDEFINITIONS\n"Lenders": 4\nThe Borrower appoints the bank (the "Agent"): it will act for the Lenders.\n"Borrower": the company named as borrower on the signature pages of this Agreement.\n`;
    const terms = definedTerms(parseSectionTree(t), t).map((d) => d.term);
    expect(terms).toContain("Borrower");
    expect(terms).not.toContain("Agent");
    expect(terms).not.toContain("Lenders");
  });
});
