/**
 * A convenience summary that says it is not operative does not supply
 * controlling definitions. A definitions exhibit and a headings-convenience
 * clause still do. Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { detectStructuralDefinitions, documentDisclaimsOperativeDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";

const SUMMARY = `EXHIBIT A — SUMMARY OF PRINCIPAL TERMS

This summary is provided for convenience of reference only. It is not an operative provision of the Credit Agreement, does not amend or supplement the Credit Agreement, and in the event of any inconsistency the Credit Agreement shall control.

Indebtedness: the Borrower may incur Indebtedness in an aggregate principal amount of up to $100,000,000 at any time outstanding.

Liens: customary permitted liens.

Restricted Payments: permitted subject to customary conditions.
`;

function definitionsIn(text: string) {
  const nodes = parseDocumentStructure({ documentId: "exhibit", label: "Exhibit", text });
  return detectStructuralDefinitions("exhibit", text, nodes);
}

describe("non-operative exhibit definitions", () => {
  it("does not record term-sheet lines from a summary that disclaims operative effect", () => {
    expect(documentDisclaimsOperativeDefinitions(SUMMARY)).toBe(true);
    const nodes = parseDocumentStructure({ documentId: "exhibit", label: "Exhibit", text: SUMMARY });
    const defs = detectStructuralDefinitions("exhibit", SUMMARY, nodes);
    expect(defs.map((d) => d.exactTerm)).toEqual([]);
    const index = buildStructuralIndex(new Map([["exhibit", { text: SUMMARY, nodes }]]), defs, []);
    expect(index.getDefinition("Indebtedness", "exhibit")).toBeUndefined();
  });

  it("keeps a definitions exhibit that states the terms have meanings", () => {
    const exhibit = `EXHIBIT A
DEFINED TERMS

For purposes of the Credit Agreement, the following terms have the following meanings.

"Available Amount" means $15,000,000.
`;
    expect(documentDisclaimsOperativeDefinitions(exhibit)).toBe(false);
    expect(definitionsIn(exhibit).map((d) => d.exactTerm)).toContain("Available Amount");
  });

  it("does not treat a headings-convenience clause as a disclaimer of the agreement's definitions", () => {
    const agreement = `CREDIT AGREEMENT dated as of January 1, 2026.

SECTION 1.01 Defined Terms. As used in this Agreement:
"Indebtedness" means borrowed money.

SECTION 9.11 Headings. The headings of the Articles and Sections of this Agreement are for convenience of reference only and shall not affect the interpretation of this Agreement.
`;
    expect(documentDisclaimsOperativeDefinitions(agreement)).toBe(false);
    expect(definitionsIn(agreement).map((d) => d.exactTerm)).toContain("Indebtedness");
  });
});
