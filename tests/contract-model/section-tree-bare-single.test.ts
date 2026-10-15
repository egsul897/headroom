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
