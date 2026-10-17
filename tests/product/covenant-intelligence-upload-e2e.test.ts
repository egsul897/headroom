/**
 * Upload-path end-to-end: a whole synthetic document through
 * discoverCovenantCandidates -> buildDocumentCovenantSummary — the exact
 * functions the upload action runs (analyze-upload -> pipeline/run ->
 * summarize). This catches wiring gaps between the unit-tested pieces:
 * TOC suppression vs dedup vs the summary's category counts, posture
 * guards vs permissions, and the Neither-form in a full document.
 *
 * Synthetic drafting only; no real document text.
 */
import { describe, expect, it } from "vitest";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import type { StructuralNodeRecord } from "../../lib/knowledge-factory/types";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";

const DOC = [
  "TABLE OF CONTENTS",
  "Section 6.01 Limitation on Indebtedness .... 45",
  "6.02 Limitation on Restricted Payments 46",
  "VII. Limitation on Liens 47",
  "",
  "Section 6.01 Limitation on Indebtedness. The Issuer shall not incur Indebtedness except: (a) Indebtedness under the Credit Facilities in an aggregate principal amount not to exceed U.S.$150.0 million; provided that the Borrower shall have complied with Section 5.01; (b) Indebtedness of the Issuer in an aggregate principal amount not to exceed the greater of (x) $50,000,000 and (y) 10.0% of Consolidated EBITDA; (c) Indebtedness under the Notes in an aggregate principal amount of U.S.$35,000,000.",
  "",
  "Section 6.02 Limitation on Restricted Payments. The Issuer shall not make any Restricted Payment except as permitted by this Section 6.02.",
  "",
  "Section 6.03 Limitation on Liens. Neither the Issuer nor any Restricted Subsidiary shall create any Lien upon any of its assets except Permitted Liens.",
  "",
  "Section 8.01 Events of Default. (j) Cross-Default: the Issuer defaults under any Indebtedness in an aggregate principal amount exceeding $25,000,000.",
  "",
  "Section 10.04 Defeasance. The Issuer may elect to defease the Notes by depositing money with the Trustee.",
  "",
  "Section 15.10 Notices. All notices shall be delivered to the Trustee at its Corporate Trust Office.",
  "",
].join("\n");

function spanOf(needle: string, from = 0): { start: number; end: number } {
  const start = DOC.indexOf(needle, from);
  if (start < 0) throw new Error(`needle not found: ${needle}`);
  return { start, end: start + needle.length };
}

function node(
  nodeId: string,
  sectionRef: string,
  heading: string,
  span: { start: number; end: number },
): StructuralNodeRecord {
  return {
    nodeId,
    sourceId: "test:upload-e2e",
    nodeType: "SECTION",
    sectionRef,
    heading,
    charStart: span.start,
    charEnd: span.end,
    ambiguous: false,
  };
}

describe("upload-path end-to-end", () => {
  const tocHeading = spanOf("TABLE OF CONTENTS");
  const toc601 = spanOf("Section 6.01 Limitation on Indebtedness .... 45");
  const toc602 = spanOf("6.02 Limitation on Restricted Payments 46");
  const tocLien = spanOf("VII. Limitation on Liens 47");
  const body601 = spanOf("Section 6.01 Limitation on Indebtedness. The Issuer");
  const body602 = spanOf("Section 6.02 Limitation on Restricted Payments. The Issuer");
  const body603 = spanOf("Section 6.03 Limitation on Liens. Neither");
  const body801 = spanOf("Section 8.01 Events of Default.");
  const body1004 = spanOf("Section 10.04 Defeasance.");
  const body1510 = spanOf("Section 15.10 Notices.");

  const nodes = [
    node("toc", "0", "Table of Contents", tocHeading),
    node("toc-601", "6.01", "Limitation on Indebtedness", toc601),
    node("toc-602", "6.02", "Limitation on Restricted Payments", toc602),
    node("toc-liens", "7", "Limitation on Liens", tocLien),
    node("body-601", "6.01", "Limitation on Indebtedness", body601),
    node("body-602", "6.02", "Limitation on Restricted Payments", body602),
    node("body-603", "6.03", "Limitation on Liens", body603),
    node("body-801", "8.01", "Events of Default", body801),
    node("body-1004", "10.04", "Defeasance", body1004),
    node("body-1510", "15.10", "Notices", body1510),
  ];

  const candidates = discoverCovenantCandidates("test:upload-e2e", DOC, nodes);
  const summary = buildDocumentCovenantSummary({
    sourceId: "test:upload-e2e",
    documentTitle: "Test Indenture",
    issuerCik: "0000000000",
    documentClass: "INDENTURE",
    candidates,
    definitions: [],
    structuralNodes: nodes,
  });

  it("no TOC duplicates: exactly one item per covenant section", () => {
    const byRef = (ref: string) => summary.items.filter((i) => i.sectionRef === ref);
    expect(byRef("6.01")).toHaveLength(1);
    expect(byRef("6.02")).toHaveLength(1);
    expect(byRef("6.03")).toHaveLength(1);
  });

  it("6.01 baskets come through whole and unmixed in the summary", () => {
    const item = summary.items.find((i) => i.sectionRef === "6.01")!;
    expect(item.posture).toBe("GENERAL_PROHIBITION");
    expect(item.permissions).toHaveLength(3);
    expect(item.permissions[0]).toContain("$150.0 million");
    expect(item.permissions[1]).toContain("10.0% of Consolidated EBITDA");
    expect(item.permissions[2]).toContain("$35,000,000");
  });

  it("Neither-form Liens covenant is a prohibition in the summary", () => {
    const item = summary.items.find((i) => i.sectionRef === "6.03")!;
    expect(item.posture).toBe("GENERAL_PROHIBITION");
  });

  it("EoD, defeasance, and admin sections never carry permissions", () => {
    for (const item of summary.items) {
      if (["6.01", "6.02", "6.03"].includes(item.sectionRef)) continue;
      expect(item.permissions).toHaveLength(0);
    }
    const eod = summary.items.find((i) => i.sectionRef === "8.01");
    if (eod) expect(eod.posture).toBe("UNRESOLVED");
    const defeasance = summary.items.find((i) => i.sectionRef === "10.04");
    if (defeasance) expect(defeasance.posture).toBe("UNRESOLVED");
  });
});
