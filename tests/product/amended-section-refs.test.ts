/**
 * Rule 29 — amended-section extraction must handle plural lists.
 *
 * extractAmendedSectionRefs only matched singular "Section 6.01 is
 * hereby amended". Common drafting writes "Sections 6.01 and 6.02
 * are hereby amended" or "Section 6.01 and Section 6.02 are hereby
 * amended" — both yielded NO explicit refs, so the resolver could
 * not bind those sections (fail-closed to UNRESOLVED, but a
 * missed binding keeps capacity unresolved when the evidence is
 * present). The plural-list grammar only accepts refs, commas,
 * and "and", so the extraction cannot pick up stray years.
 */
import { describe, expect, it } from "vitest";
import { extractAmendedSectionRefs } from "../../lib/product/customer-intelligence/operative-resolution";

describe("amended section refs", () => {
  it("extracts plural 'Sections A and B are hereby amended'", () => {
    expect(
      extractAmendedSectionRefs("Sections 6.01 and 6.02 are hereby amended."),
    ).toEqual(["6.01", "6.02"]);
  });

  it("extracts plural comma list 'Sections A, B and C are hereby deleted'", () => {
    expect(
      extractAmendedSectionRefs("Sections 6.01, 6.02 and 6.03 are hereby deleted."),
    ).toEqual(["6.01", "6.02", "6.03"]);
  });

  it("extracts repeated singular 'Section A and Section B are hereby amended'", () => {
    expect(
      extractAmendedSectionRefs("Section 6.01 and Section 6.02 are hereby amended."),
    ).toEqual(["6.01", "6.02"]);
  });

  it("still extracts singular 'Section 6.01 is hereby amended'", () => {
    expect(extractAmendedSectionRefs("Section 6.01 is hereby amended.")).toEqual(["6.01"]);
  });

  it("still extracts 'Section 6.01 of the Credit Agreement is hereby amended'", () => {
    expect(
      extractAmendedSectionRefs("Section 6.01 of the Credit Agreement is hereby amended."),
    ).toEqual(["6.01"]);
  });

  it("does not pick up a bare year as a section ref", () => {
    expect(
      extractAmendedSectionRefs("Sections 6.01 and 6.02 of the 2024 Credit Agreement are hereby amended."),
    ).toEqual(["6.01", "6.02"]);
  });
});

describe("rule 183a: existing / amended-and-restated instrument bridge", () => {
  it("detects Section 1.01 of the Existing Credit Agreement", () => {
    expect(
      extractAmendedSectionRefs(
        "Section 1.01 of the Existing Credit Agreement is hereby amended as follows:",
      ),
    ).toEqual(["1.01"]);
  });
  it("detects Section 6.01 of the Amended and Restated Credit Agreement", () => {
    expect(
      extractAmendedSectionRefs(
        "Section 6.01 of the Amended and Restated Credit Agreement is hereby amended.",
      ),
    ).toEqual(["6.01"]);
  });
});
