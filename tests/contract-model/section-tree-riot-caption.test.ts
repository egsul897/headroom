/** Reviewer: Riot doc-b "(d) Mergers and Consolidations; Disposition of Assets." caption is an operative ASSET_SALES unit. */
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parseDocumentTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist } from "@/lib/contract-model/section-tree/semantics";

describe("Riot doc-b ASSET_SALES caption", () => {
  it("is not ABSENT_VERIFIED", () => {
    const t = parseDocumentTree(readFileSync("tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt", "utf8"));
    const a = covenantChecklist(t, t.text).find((c) => c.family === "ASSET_SALES")!;
    expect(a.status).not.toBe("ABSENT_VERIFIED");
    expect(a.status).not.toBe("MISSING");
  });
});
