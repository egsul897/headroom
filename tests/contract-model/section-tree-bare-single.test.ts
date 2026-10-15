import { describe, expect, it } from "vitest";
import { parseDocumentTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist } from "@/lib/contract-model/section-tree/semantics";

const st = (text: string, fam: string) => { const t = parseDocumentTree(text); return covenantChecklist(t, t.text).find((c) => c.family === fam)!; };
const secs = (text: string) => parseDocumentTree(text).nodes.filter((n) => n.kind === "SECTION").map((n) => n.path);

describe("bare single-number sections and obligor-subject prohibitions", () => {
  const doc = `EXCHANGE AGREEMENT\n\n1. Exchange . The Parties agree to the exchange.\n\n1. $10,000 owed to Party A.\n2. $20,000 owed to Party B.\n\n2. Manner of Closing . On the Closing Date the exchange occurs.\n\n3.     Representations of each Holder . Each Holder represents that it is accredited.\n\n4.              Negative\nCovenants . The Company covenants that:\n\n(a) The Company will not, and will not permit any of its subsidiaries to, create, incur, assume or permit to exist any Lien on any property, except Permitted Liens.\n\n(b) No Loan Party shall make any dividend or other distribution with respect to any equity securities of such Loan Party.\n\n5. Miscellaneous . This Agreement is governed by New York law.\n`;
  it("a consecutive 1, 2, 3 ... chain of bare 'N. Title .' headings (titles may wrap) becomes sections; list items do not", () => {
    expect(secs(doc)).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("prohibitions inside a bare 'Negative Covenants' section bind to it, including 'No <obligor> shall' subjects", () => {
    expect(st(doc, "LIENS").sectionPaths).toEqual(["4"]);
    expect(st(doc, "RESTRICTED_PAYMENTS").sectionPaths).toEqual(["4"]);
  });
  it("fewer than three chained headings stay unparsed (fail closed, no tree)", () => {
    expect(secs(`1. Purpose . Text.\n\n2. Term . Text.\n`)).toEqual([]);
  });
});

describe("conjoined prohibition objects", () => {
  it("'make any Investments or Restricted Payments' credits both families", async () => {
    const { classifyCovenantFamily } = await import("@/lib/contract-model/section-tree/family-classifier");
    const v = classifyCovenantFamily({ title: null, parentTitle: null, covenantContext: true, leadIn: "The Company will not, and will not permit any Subsidiary to, declare or make, directly or indirectly, any Investments or Restricted Payments, other than as permitted under the Senior Agreement." });
    expect(v.families).toEqual(expect.arrayContaining(["RESTRICTED_PAYMENTS", "INVESTMENTS"]));
  });
  it("a Lien securing Indebtedness is not a conjoined DEBT object", async () => {
    const { classifyCovenantFamily } = await import("@/lib/contract-model/section-tree/family-classifier");
    const v = classifyCovenantFamily({ title: null, parentTitle: null, covenantContext: true, leadIn: "The Company will not create, incur or suffer to exist any Lien securing Indebtedness on any of its property." });
    expect(v.families).toEqual(["LIENS"]);
  });
});

describe("number-only heading lines", () => {
  it("'N.N' on its own line (title line without a period, or none) becomes a section when the scan is sparse", () => {
    const body = Array.from({ length: 6 }, (_, i) => `${i + 1}.1\nTopic ${i + 1}\n\nThe Company agrees to perform item ${i + 1} in full and on time, in each case as further described in the schedules hereto.\n\n${i + 1}.2\nThe Company will not merge, consolidate or amalgamate with any Person, except a wholly-owned Subsidiary that assumes all obligations.\n`).join("\n");
    const t = parseDocumentTree(`FACILITY AGREEMENT\n\n${body}`);
    const s = t.nodes.filter((n) => n.kind === "SECTION");
    expect(s.map((n) => n.path)).toEqual(["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2", "5.1", "5.2", "6.1", "6.2"]);
    expect(s[0]!.title).toBe("Topic 1");
    expect(s[1]!.title).toBeNull();
  });
  it("backward or stray figures on their own line do not become sections", () => {
    const t = parseDocumentTree(`AGREEMENT\n\nSection 1.01 Terms. The Company shall comply with this provision at all times while any Loan remains outstanding.\n\nSection 1.02 More. The Company shall comply with this provision at all times while any Loan remains outstanding.\n\nSection 1.03 Other. The Company shall comply with this provision at all times while any Loan remains outstanding.\n\n4.50\nTo 1.00 for each quarter.\n`);
    expect(t.nodes.filter((n) => n.kind === "SECTION").map((n) => n.path)).toEqual(["1.1", "1.2", "1.3"]);
  });
});

describe("bare sections with the number on its own line", () => {
  it("'3.\\nCovenants of Company .' chains like '3. Covenants .'", () => {
    const p = (n: number, t: string) => `${n}.\n${t} . The Company agrees to observe this provision at all times while this Note remains outstanding.\n\n`;
    const doc = `PROMISSORY NOTE\n\n${p(1, "Optional Prepayment")}${p(2, "Interest")}3.\nCovenants of Company .\n\n(i)\nLiquidation, Dissolution . The Company will not liquidate or dissolve, consolidate with, or merge into or with, any other corporation.\n\n${p(4, "Events of Default")}`;
    expect(secs(doc)).toEqual(["1", "2", "3", "4"]);
    expect(st(doc, "FUNDAMENTAL_CHANGES").sectionPaths).toEqual(["3"]);
  });
});

describe("evidence location", () => {
  it("'make any Restricted Investments' (plural) item binds INVESTMENTS to the RP section, not to a carve-out mention elsewhere", () => {
    const doc = `ARTICLE 4 COVENANTS\n\nSection 4.01 Restricted Payments. The Company will not, and will not permit any Restricted Subsidiary to, directly or indirectly:\n(a) declare or pay any dividend on its Equity Interests;\n(b) make any Restricted Investments;\nunless no Default has occurred and is continuing.\n\nSection 4.02 Holding Company. The Company will not own any assets other than cash and assets that will be used to make a Restricted Payment (other than a Restricted Investment) promptly after receipt.\n\nSection 4.03 Liens. The Company will not create any Lien on any of its property.\n`;
    expect(st(doc, "INVESTMENTS").sectionPaths).toEqual(["4.1"]);
  });
});

describe("term-sheet covenant rows", () => {
  it("a 'Restrictive covenants' row with bulleted prohibitions is a container; each bullet is its own sentence", () => {
    const doc = `TERM SHEET\n\nLender\n\nA Lender Inc.\n\nRestrictive covenants\n\n\u2022 The Borrower Group shall not make capital expenditure in excess of the budget\n\n\u2022 The Borrower Group\nshall not make any investments other than as agreed,\n\n\u2022 The Borrower Group shall not pay any dividends or other distributions\n\nRedemption\n\nThe Warrants will not be subject to redemption.\n`;
    expect(st(doc, "INVESTMENTS").sectionPaths).toEqual(["Restrictive covenants"]);
    expect(st(doc, "RESTRICTED_PAYMENTS").sectionPaths).toEqual(["Restrictive covenants"]);
  });
});

describe("false ASSET_SALES finds", () => {
  it("a transfer of all or substantially all assets is not an asset-sale lead-in", async () => {
    const { classifyCovenantFamily } = await import("@/lib/contract-model/section-tree/family-classifier");
    const v = classifyCovenantFamily({ title: "Consolidation", parentTitle: null, covenantContext: true, leadIn: "The Company shall not effect any consolidation of the Company with or into, or a transfer of all or substantially all the assets of the Company to, another entity unless the successor assumes this Agreement." });
    expect(v.families).not.toContain("ASSET_SALES");
  });
});

describe("'Sections N.NN' heading typo", () => {
  it("'Sections 4.10 Transactions with Affiliates.' is a heading", () => {
    const doc = `ARTICLE 4 COVENANTS\n\nSection 4.09 Asset Sales.\n(a) Parent will not consummate any Asset Sale unless it receives fair market value for the assets sold.\nSections 4.10 Transactions with Affiliates.\n(a) Parent will not enter into any transaction with any Affiliate unless on arm's-length terms.\nSection 4.11 Liens.\n(a) Parent will not create any Lien on any of its property except Permitted Liens.\n`;
    expect(st(doc, "AFFILIATE_TRANSACTIONS").sectionPaths).toEqual(["4.10"]);
  });
});

describe("false INVESTMENTS headings", () => {
  it("'Investment Company Act' and use-of-proceeds titles are not INVESTMENTS headings", async () => {
    const { classifyCovenantFamily } = await import("@/lib/contract-model/section-tree/family-classifier");
    for (const title of ["Investment Company Act", "Limitation on Use of Proceeds of Sponsor Direct Investment"]) {
      const v = classifyCovenantFamily({ title, parentTitle: null, covenantContext: true, leadIn: "No Borrower shall take any action that would result in it being required to register under any statute." });
      expect(v.evidence).not.toContain("INVESTMENTS:heading");
    }
  });
});

describe("margin numbers glued into the body", () => {
  it("'<Caption>. text...andSECTION 6.02 text' starts the section at the caption", () => {
    const cov = (n: string, cap: string, verb: string) => `${cap}. The Borrower will not, and${n} will not permit any Subsidiary to, ${verb}, except as permitted herein and in the other Loan Documents. `;
    const doc = `ARTICLE VI NEGATIVE COVENANTS ` + cov("SECTION 6.01", "Indebtedness", "incur any Indebtedness") + cov("SECTION 6.02", "Limitation on Liens", "create any Lien on any property") + cov("SECTION 6.03", "Fundamental Changes", "merge or consolidate with any Person") + cov("SECTION 6.04", "Restricted Payments", "declare or pay any dividend") + cov("SECTION 6.05", "Sale of Assets", "sell any assets") + `ARTICLE VII EVENTS OF DEFAULT The following are Events of Default.`;
    const t = parseDocumentTree(doc);
    const s = t.nodes.filter((n) => n.kind === "SECTION");
    expect(s.map((n) => n.path)).toEqual(["6.1", "6.2", "6.3", "6.4", "6.5"]);
    expect(s[1]!.title).toBe("Limitation on Liens");
  });
});

describe("combined investments / designation titles", () => {
  it("'Limitation on Investments and Designation of Unrestricted Subsidiaries' with an investment prohibition is INVESTMENTS", () => {
    const doc = `ARTICLE VI NEGATIVE COVENANTS\n\nSection 6.01 Liens. The Borrower will not create any Lien on any of its property except Permitted Liens.\n\nSection 6.02 Limitation on Investments and Designation of Unrestricted Subsidiaries. The Borrower will not, and will not permit any Restricted Subsidiary to, make any Investment except Permitted Investments. The Borrower may designate any Restricted Subsidiary as an Unrestricted Subsidiary if no Default exists.\n\nSection 6.03 Fiscal Year. The Borrower will not change its fiscal year.\n`;
    expect(st(doc, "INVESTMENTS").sectionPaths).toEqual(["6.2"]);
  });
});

describe("combined RP / debt-payment headings", () => {
  it("'Restricted Payments; Restricted Debt Payments' credits PREPAYMENTS too", async () => {
    const { classifyCovenantFamily } = await import("@/lib/contract-model/section-tree/family-classifier");
    for (const title of ["Restricted Payments; Restricted Debt Payments", "Restricted Payments; Payments of Junior Debt"]) {
      const v = classifyCovenantFamily({ title, parentTitle: null, covenantContext: true, leadIn: "(a) The Borrower will not, and will not permit any Restricted Subsidiary to, declare or make any Restricted Payment. (b) The Borrower will not prepay any Junior Indebtedness." });
      expect(v.families).toEqual(expect.arrayContaining(["RESTRICTED_PAYMENTS", "PREPAYMENTS"]));
    }
  });
});

describe("flattened run-in captions", () => {
  it("double-period captions and a page number before the body still open inline units", () => {
    const doc = `CREDIT AGREEMENT ARTICLE 9 NEGATIVE COVENANTS 9.08 Change in Fiscal Year. The Obligors shall not change their fiscal year. 9.09 Sales of Assets, Etc.. The Obligors shall not, and shall not permit any of their Subsidiaries to sell, lease, transfer or otherwise dispose of any assets, except Permitted Dispositions. 9.10 Liens. The Obligors shall not create any Lien on any property. 9.11 Asset Sales.\n\n89 The Obligors will not sell any property except as permitted. 9.12 Fiscal Quarter. The Obligors shall not change their fiscal quarter.`;
    expect(st(doc, "ASSET_SALES").sectionPaths).toContain("9.9");
  });
});
