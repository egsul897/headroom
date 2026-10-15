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

describe("by-reference, unnumbered-word headings, wrapped captions, schedules", async () => {
  const { parseDocumentTree } = await import("@/lib/contract-model/section-tree/parse");
  const { covenantChecklist } = await import("@/lib/contract-model/section-tree/semantics");
  const fam = (txt: string, f: string) => { const t = parseDocumentTree(txt); return covenantChecklist(t, t.text).find((c) => c.family === f)!; };
  const pad = "The Borrower shall deliver the reports required under this Agreement within the periods specified. ".repeat(3);
  it("covenants incorporated by reference are MISSING, not ABSENT", () => {
    const c = fam(`ARTICLE VII\nNEGATIVE COVENANTS\n7.01 Use of Proceeds. The Borrower shall not use proceeds for margin stock. ${pad}\n7.02 Additional Negative Covenants. The negative covenants set forth in the Senior Notes, including Sections 4.07 through 4.14 thereof, shall be deemed to be incorporated into this Agreement as though set forth in full.\n`, "DEBT");
    expect(c.status).toBe("MISSING");
  });
  it("unpunctuated '5.2 Fundamental Changes' heading without the Section word", () => {
    const c = fam(`5. NEGATIVE COVENANTS\n5.1 Business Activities\nThe Borrower will not engage in any business or activities other than the Permitted Businesses, except to such extent as would not be material to the Borrower and its Subsidiaries taken as a whole. ${pad}\n5.2 Fundamental Changes\nThe Borrower will not, directly or indirectly, consolidate, amalgamate, or merge with or into another Person (regardless of whether the Borrower is the surviving entity), or sell, assign, transfer or otherwise dispose of all or substantially all of its properties. ${pad}\n`, "FUNDAMENTAL_CHANGES");
    expect(["MISSING", "ABSENT_VERIFIED"]).not.toContain(c.status);
  });
  it("caption wrapped over two lines", () => {
    const c = fam(`4.3 Negative Covenants.\n\n(c) Payments . Debtor shall not pay any dividend. ${pad}\n\n(d) Prohibition\nof Fundamental Changes . Debtor shall not (i) liquidate, merge or consolidate with any other entity.\n`, "FUNDAMENTAL_CHANGES");
    expect(["MISSING", "ABSENT_VERIFIED"]).not.toContain(c.status);
  });
  it("numbered covenants in a covenant schedule", () => {
    const c = fam(`${pad}\nSchedule 16 (Incurrence Covenants) Part A Incurrence Covenants 1. Limitation on Debt The Company shall not, and shall not permit any Restricted Subsidiary to, Incur any Debt, unless the ratio is at least 2.00 to 1.00.`, "DEBT");
    expect(["MISSING", "ABSENT_VERIFIED"]).not.toContain(c.status);
  });
});

describe("financial covenants", () => {
  it("springing revolver test past the first 700 characters", () => {
    const trigger = "Solely with respect to the Revolving Credit Facility, if on the last day of any Test Period the sum of " + "the aggregate principal amount of Revolving Loans then outstanding (other than certain excluded amounts), ".repeat(6) + "exceeds 40.0% of the Revolving Commitments, the Borrower will not permit the First Lien Leverage Ratio to exceed 7.75 to 1.00 as of the last day of such Test Period.";
    expect(classifyCovenantFamily({ title: "Financial Covenant", leadIn: trigger, covenantContext: true }).families).toContain("FINANCIAL_RATIOS");
  });
  it("'Financial Maintenance Covenant' heading", () => {
    expect(classifyCovenantFamily({ title: "Financial Maintenance Covenant", leadIn: "From and after the Closing Date, the Company shall not permit the Consolidated Secured Net Leverage Ratio to exceed 4.50 to 1.00 as of the last day of any Fiscal Quarter.", covenantContext: false }).families).toContain("FINANCIAL_RATIOS");
  });
});
