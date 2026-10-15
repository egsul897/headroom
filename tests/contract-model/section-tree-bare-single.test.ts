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
