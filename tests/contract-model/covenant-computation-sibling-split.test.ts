/**
 * Basket amount binding (grok/ebitda-cap-binding): a basket span that runs on into its sibling clauses is evaluated
 * clause by clause, so an uncapped clause never takes a neighbour's figure. Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { splitSiblingClauses } from "@/lib/contract-model/covenant-computation/sibling-split";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";

describe("splitSiblingClauses", () => {
  it("splits at the next same-style enumerator that starts a clause", () => {
    const parts = splitSiblingClauses("(iv) unsecured Indebtedness; (v) [Reserved]; (vi) purchase money Indebtedness not to exceed $40,000,000;")!;
    expect(parts.map((p) => p.label)).toEqual(["(iv)", "(v)", "(vi)"]);
    expect(parts[0]!.text).toBe("(iv) unsecured Indebtedness;");
  });
  it("ignores cross-references, nested enumerators and out-of-sequence labels", () => {
    expect(splitSiblingClauses("(c) Indebtedness permitted under clause (d) below, including (i) guarantees and (ii) letters of credit, not to exceed $5,000,000")).toBeNull();
    expect(splitSiblingClauses("(c) Indebtedness of Subsidiaries (other than as set forth in (d) hereof) not to exceed $5,000,000")).toBeNull();
    expect(splitSiblingClauses("(c) Indebtedness of Subsidiaries; (f) other Indebtedness")).toBeNull();
  });
  it("handles letter/roman ambiguity ('(h)' then '(i)')", () => {
    expect(splitSiblingClauses("(h) Swap obligations; (i) other Indebtedness not to exceed $1,000,000")!.map((p) => p.label)).toEqual(["(h)", "(i)"]);
  });
});

describe("a clause never takes its sibling's cap", () => {
  const R = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];
  const items = ["Indebtedness under the Loan Documents", "Indebtedness existing on the Closing Date", "Indebtedness in respect of hedging agreements not for speculative purposes", "unsecured Indebtedness of the Borrower", "[Reserved]", "purchase money Indebtedness in an aggregate principal amount not to exceed $40,000,000 at any time outstanding", "Guarantees of Indebtedness otherwise permitted hereunder", "other Indebtedness in an aggregate principal amount not to exceed $15,000,000 at any time outstanding"];
  const doc = `CREDIT AGREEMENT\nARTICLE I DEFINITIONS\nSection 1.1 Defined Terms.\n"Indebtedness" means all obligations for borrowed money.\nARTICLE VII NEGATIVE COVENANTS\nSection 7.1 Indebtedness. The Borrower shall not create, incur, assume or suffer to exist any Indebtedness, except: ${items.map((t, k) => `(${R[k]}) ${t}`).join("; ")}.\nSection 7.2 Liens. The Borrower shall not create any Lien except Permitted Liens.\nARTICLE VIII EVENTS OF DEFAULT\nSection 8.1 Events of Default. Any of the following shall be an Event of Default.\n`;
  const r = runAgreementPipeline({ sourceId: "sib-split", text: doc, issuerCik: null } as Parameters<typeof runAgreementPipeline>[0]);
  const dollarsOf = (b: (typeof r.computedBaskets)[number]) => JSON.stringify(b).match(/40000000|15000000/g) ?? [];
  it("the uncapped clause carries no dollar cap; the capped sibling carries its own", () => {
    const unsecured = r.computedBaskets.filter((b) => /unsecured Indebtedness of the Borrower/.test(b.citationExcerpt));
    expect(unsecured.length).toBeGreaterThan(0);
    for (const b of unsecured) { expect(b.citationExcerpt).not.toMatch(/\$40,000,000/); expect(b.category).not.toBe("FIXED_DOLLAR"); expect(dollarsOf(b)).toEqual([]); }
    expect(r.computedBaskets.some((b) => /purchase money/.test(b.citationExcerpt) && b.category === "FIXED_DOLLAR")).toBe(true);
    const guarantees = r.computedBaskets.filter((b) => /^\(vii\) Guarantees/.test(b.citationExcerpt));
    for (const b of guarantees) expect(dollarsOf(b)).toEqual([]);
  });
});
