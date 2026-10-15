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

describe("heading shapes", () => {
  const pad = "The Issuer shall deliver the reports required under this Indenture within the periods specified. ".repeat(4);
  it("splits 'ARTICLE V SUCCESSORS Section 5.1. Title.' onto its own heading line", () => {
    expect(relineFlattened(`${pad}\nARTICLE V SUCCESSORS Section 5.1. Consolidation, Merger or Sale. (a) The Issuer shall not merge.\n`)).toMatch(/\nARTICLE V SUCCESSORS\nSection 5\.1\. Consolidation/);
  });
  it("finds unpunctuated line headings, incl. a title wrapped after 'and'", async () => {
    const { parseDocumentTree } = await import("@/lib/contract-model/section-tree/parse");
    const t = parseDocumentTree(`ARTICLE IV\nCOVENANTS\n\nSection 4.1 Payment of Notes\n\nThe Issuer shall pay the Notes. ${pad}\n\nSection 4.2 Limitation on Indebtedness and\nPreferred Stock\n(a) The Issuer will not incur any Indebtedness. ${pad}\n`);
    const secs = t.nodes.filter((n) => n.kind === "SECTION").map((n) => `${n.path}:${n.title}`);
    expect(secs).toEqual(["4.1:Payment of Notes", "4.2:Limitation on Indebtedness and Preferred Stock"]);
  });
  it("'Neither of the Issuers may ... consolidate' is a prohibition", () => {
    expect(classifyCovenantFamily({ title: "Merger, Consolidation or Sale of Assets", leadIn: "(a) Neither of the Issuers may, directly or indirectly: (1) consolidate or merge with or into another Person; or (2) sell all or substantially all of its properties.", covenantContext: false }).families).toContain("FUNDAMENTAL_CHANGES");
  });
});

describe("jammed headings and caption evidence", () => {
  it("moves a margin number glued mid-sentence in front of its caption", () => {
    const W = ["Zero", "One", "Two", "Three", "Four", "Five", "Six"];
    const one = (n: number) => `Caption ${W[n]}. For purposes of thisSECTION 1.0${n} Agreement, the terms apply. `;
    const t = relineFlattened([1, 2, 3, 4, 5, 6].map(one).join(""));
    expect(t).toMatch(/\nSECTION 1\.02 Caption Two\. For purposes of this Agreement/);
  });
  it("'Except ..., create, incur ... Indebtedness' under 'Borrowed Money' is DEBT", () => {
    expect(classifyCovenantFamily({ title: "Borrowed Money", leadIn: "Except with respect to existing Indebtedness, create, incur, assume or suffer to exist any liability for Indebtedness.", covenantContext: true }).families).toContain("DEBT");
  });
});
