import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../../lib/contract-model/compiler/stage-structure";
import {
  compileFixedDollarBasket,
  evaluateFixedDollarCapacity,
} from "../../../lib/contract-model/compiler/fixed-dollar-basket";

const MHK_TEXT = path.join(
  process.cwd(),
  "docs/product-proof/002/sources/mhk-2026-credit-agreement/extracted-text/doc-a-credit-agreement.txt",
);

describe("MHK structural heading + fixed-dollar slice (authentic holdout)", () => {
  it("recovers structural SECTION nodes despite leading WS/NNBSP on bare decimals", () => {
    const text = fs.readFileSync(MHK_TEXT, "utf8");
    // Prove the freeze still contains the EDGAR NNBSP heading shape that previously
    // zeroed the structural index (Phase 1 diagnosis for structuralNodes=0).
    expect(text).toMatch(/^[ \t\u00a0\u202f]*7\.01[\t \u00a0\u202f]+Liens/m);
    const nodes = parseDocumentStructure({
      documentId: "mhk-doc-a-credit-agreement",
      text,
    });
    expect(nodes.length).toBeGreaterThan(100);
    const refs = new Set(nodes.map((n) => n.sectionRef));
    expect(refs.has("7.01")).toBe(true);
    expect(refs.has("7.03")).toBe(true);
  });

  it("compiles authentic §7.03(f) receivables basket as gated verified-executable IR", () => {
    const text =
      "Indebtedness in respect of Permitted Receivables Financings of the Company and/or its Restricted Subsidiaries so long as (i) the aggregate outstanding amount of all Permitted Receivables Financings of the Company and/or its Restricted Subsidiaries shall not exceed $700,000,000 at any time, and (ii) no such Indebtedness is in the form of a term loan facility;";
    const compiled = compileFixedDollarBasket({
      companyId: "product-proof-002-mhk-holdout",
      instrumentKey: "instrument:mhk",
      sourceDocumentId: "mhk-doc-a",
      candidateRef: "cand:7.03f",
      sourceSectionRef: "7.03(f)",
      operativeSourceText: text,
    });
    const hypo = evaluateFixedDollarCapacity({
      compile: compiled,
      operativeSourceText: text,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
    });
    const prod = evaluateFixedDollarCapacity({
      compile: compiled,
      operativeSourceText: text,
      authorityMode: "PRODUCTION",
    });
    expect(hypo.outcomeLabel).toBe("VERIFIED_EXECUTABLE");
    expect(hypo.availableAmountUsd).toBe(700_000_000);
    expect(prod.outcomeLabel).toBe("PRODUCTION_CAPACITY_REFUSED");
  });
});
