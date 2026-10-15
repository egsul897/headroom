import { describe, expect, it } from "vitest";
import { relineFlattened } from "@/lib/contract-model/section-tree/parse";
import { classifyCovenantFamily } from "@/lib/contract-model/section-tree/family-classifier";

const filler = (n: number) => "The Company shall comply with the terms set out in this paragraph in all respects. ".repeat(n);

describe("relineFlattened", () => {
  it("re-lines long lines of a partly flattened document, incl. page-number-prefixed SECTION headings", () => {
    const long = `${filler(30)}ARTICLE 5 SUCCESSORS SECTION 5.01 MERGER. (a) The Issuer shall not merge. ${filler(10)}\n131 SECTION 4.11 TRANSACTIONS WITH AFFILIATES. The Issuer shall not ${filler(30)}`;
    const t = relineFlattened(`${long}\nshort\nshort\nshort\nshort`);
    expect(t).toMatch(/\nSECTION 5\.01 MERGER/);
    expect(t).toMatch(/^131\nSECTION 4\.11/m);
  });
  it("re-lines bare 'N.N Title.' headings only in fully flattened text", () => {
    const body = `${filler(25)}less than 1.00 to 1.00. 7.2 Indebtedness. Create or incur any Indebtedness. ${filler(25)}`;
    expect(relineFlattened(body)).toMatch(/\n7\.2 Indebtedness\. Create/);
    expect(relineFlattened(`${body}\n${"x\n".repeat(40)}`)).not.toMatch(/\n7\.2 Indebtedness/);
  });
});

describe("restrictive-agreement titles", () => {
  it("'Negative Pledge Clauses' / 'Evidence of Indebtedness' are not LIENS/DEBT", () => {
    expect(classifyCovenantFamily({ title: "Negative Pledge Clauses", leadIn: "Enter into any agreement that prohibits the ability of any Group Member to create any Lien upon its property.", covenantContext: true }).families).toEqual([]);
    expect(classifyCovenantFamily({ title: "Evidence of Indebtedness", leadIn: "The Borrower shall not incur Indebtedness except as evidenced by the Notes.", covenantContext: true }).families).toEqual([]);
    expect(classifyCovenantFamily({ title: "Indebtedness", leadIn: "Create, incur or assume any Indebtedness, except:", covenantContext: true }).families).toContain("DEBT");
  });
});
