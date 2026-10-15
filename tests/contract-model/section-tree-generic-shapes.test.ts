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
