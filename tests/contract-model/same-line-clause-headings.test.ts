import { describe, expect, it } from "vitest";
import { parseDocumentTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist } from "@/lib/contract-model/section-tree/semantics";

describe("Section N.NN Title. (a) on the same line", () => {
  it("opens a section when the first clause starts on the heading line", () => {
    const text = [
      "ARTICLE 4 COVENANTS", "",
      "Section 4.08 Asset Sales. Holdings will not, and will not permit any of its Restricted Subsidiaries to, consummate an Asset Sale unless:", "",
      "-78- Section 4.09 Transactions with Affiliates. (a) Holdings will not, and will not permit any of its Restricted Subsidiaries to, make any payment to, or sell, lease, transfer or otherwise dispose of any of its properties or assets to, or purchase any property or assets from, or enter into or make or amend any transaction or arrangement with any Affiliate.", "",
      "Section 4.10 Liens. Holdings will not create any Lien.", "",
    ].join("\n");
    const t = parseDocumentTree(text);
    expect(t.nodes.filter((n) => n.kind === "SECTION").map((n) => n.title)).toEqual(
      expect.arrayContaining(["Transactions with Affiliates", "Liens", "Asset Sales"]),
    );
    const a = covenantChecklist(t, t.text).find((c) => c.family === "AFFILIATE_TRANSACTIONS")!;
    expect(a.status).not.toBe("MISSING");
    expect(a.status).not.toBe("ABSENT_VERIFIED");
  });
});
