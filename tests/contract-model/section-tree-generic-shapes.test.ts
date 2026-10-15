/** Generic shapes behind three rules first seen in single TUNABLE docs: each is exercised on variants that are not those docs' words. */
import { describe, expect, it } from "vitest";
import { classifyCovenantFamily } from "@/lib/contract-model/section-tree/family-classifier";
import { parseDocumentTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist } from "@/lib/contract-model/section-tree/semantics";

describe("letter-split small-caps titles (any family)", () => {
  it.each([["L IMITATION ON L IENS", "LIENS"], ["L IMITATION ON R ESTRICTED P AYMENTS", "RESTRICTED_PAYMENTS"], ["T RANSACTIONS WITH A FFILIATES", "AFFILIATE_TRANSACTIONS"]])("%s", (title, fam) => {
    expect(classifyCovenantFamily({ title, leadIn: "The Company will not, and will not permit any Restricted Subsidiary to, directly or indirectly, take the actions described below." }).evidence).toContain(`${fam}:heading`);
  });
});

describe("dotless 'Section NNN' headings (any 3-4 digit number)", () => {
  it.each(["Section 407", "Section 1012"])("%s Limitation on Liens", (h) => {
    const text = `ARTICLE IV COVENANTS\n${h} Limitation on Liens.\nThe Issuer shall not, and shall not permit any Subsidiary to, create or suffer to exist any Lien on any of its property except Permitted Liens.\n${h.replace(/\d$/, (d) => String((Number(d) + 1) % 10))} Reports.\nThe Issuer shall file all reports required by the Exchange Act.\n`;
    const t = parseDocumentTree(text);
    expect(["MISSING", "ABSENT_VERIFIED"]).not.toContain(covenantChecklist(t, t.text).find((c) => c.family === "LIENS")?.status);
  });
});

describe("creditor-side 'will not' is not an obligor covenant (any creditor noun)", () => {
  it.each(["the Senior Lenders", "each Second Lien Noteholder", "the Pari Passu Secured Parties"])("%s", (actor) => {
    const text = `ARTICLE VII INTERCREDITOR MATTERS\n7.01 Releases . ${actor[0]!.toUpperCase()}${actor.slice(1)} will not object to any sale of Collateral permitted under the First Lien Documents.\n7.02 Notices . All notices shall be in writing.\n`;
    const t = parseDocumentTree(text);
    expect(["MISSING", "ABSENT_VERIFIED"]).toContain(covenantChecklist(t, t.text).find((c) => c.family === "ASSET_SALES")?.status);
  });
});

describe("paying or retiring any other debt is a PREPAYMENTS restriction", () => {
  it("'... purchase, redeem, defease or otherwise acquire or retire for value any Indebtedness other than the Senior Debt'", async () => {
    const { negatedItemFamilies } = await import("@/lib/contract-model/section-tree/family-classifier");
    expect(negatedItemFamilies("(iii) make any payment on or with respect to, or purchase, redeem, defease or otherwise acquire or retire for value any Indebtedness other than the Senior Debt", true)).toContain("PREPAYMENTS");
  });
});

describe("run-in list items under an obligor-bound negative stem (no clause nodes)", () => {
  it("'(a) The Company will not ... directly or indirectly: (1) declare ...; (2) ...; (3) make any Restricted Investment' finds INVESTMENTS", () => {
    // Nested "(i)/(ii)" under item (1) break the tree's numeric sequence, so (2)-(4) are not clause nodes.
    const text = "ARTICLE IV COVENANTS\nSection 4.06 Restricted Payments .\n(a) The Company shall not, and shall not permit any of its Restricted Subsidiaries, directly or indirectly, to:\n(1) declare or pay any dividend on its Capital Stock other than\n(i) dividends payable solely in Equity Interests; and\n(ii) dividends payable to the Company;\n(2) purchase or redeem any Capital Stock of the Company;\n(3) make any principal payment on any Subordinated Indebtedness; or\n(4) make any Restricted Investment,\nunless, at the time of such Restricted Payment:\n(i) no Default shall have occurred;\n(ii) the aggregate amount does not exceed the sum of the amounts below.\nSection 4.07 Reports . The Company shall file reports.\n";
    const t = parseDocumentTree(text);
    expect(["MISSING", "ABSENT_VERIFIED"]).not.toContain(covenantChecklist(t, t.text).find((c) => c.family === "INVESTMENTS")?.status);
  });
  it("an exception stem ('will not prohibit:') governs nothing", () => {
    const text = "ARTICLE IV COVENANTS\nSection 4.06 Limitation on Liens . (a) The foregoing will not prohibit any of the following: (1) any Investment in a Restricted Subsidiary; (2) payments of dividends within 60 days.\nSection 4.07 Reports . The Company shall file reports.\n";
    const t = parseDocumentTree(text);
    expect(["MISSING", "ABSENT_VERIFIED"]).toContain(covenantChecklist(t, t.text).find((c) => c.family === "INVESTMENTS")?.status);
  });
});
