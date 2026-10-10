/**
 * Final-audit adversarial challenges: false definitions-section context and
 * cross-section / preamble boundary containment for definition-body clipping.
 */
import { describe, expect, it } from "vitest";
import {
  isDefinitionsSectionHeading,
  parseDocumentStructure,
} from "../../lib/contract-model/compiler/stage-structure";
import { findTopLevelDefinitionStarts } from "../../lib/contract-model/compiler/structural-definitions";

describe("isDefinitionsSectionHeading — inventory vs false context", () => {
  it("affirms operative defined-terms inventory headings", () => {
    expect(isDefinitionsSectionHeading("Defined Terms")).toBe(true);
    expect(isDefinitionsSectionHeading("Defined Term")).toBe(true);
    expect(isDefinitionsSectionHeading("Definitions")).toBe(true);
    expect(isDefinitionsSectionHeading("Additional Definitions")).toBe(true);
    expect(isDefinitionsSectionHeading("Definitions and Accounting Terms")).toBe(true);
  });

  it("rejects non-operative headings that merely contain “defin”", () => {
    expect(isDefinitionsSectionHeading("Incorporation of Definitions by Reference")).toBe(false);
    expect(isDefinitionsSectionHeading("Certain Definitions Incorporated Herein")).toBe(false);
    expect(isDefinitionsSectionHeading("Table of Defined Terms for Convenience")).toBe(false);
    expect(isDefinitionsSectionHeading("Schedule of Definitions Cross-Reference")).toBe(false);
    expect(isDefinitionsSectionHeading("Other Definitional Provisions")).toBe(false);
    expect(isDefinitionsSectionHeading("Index of Defined Terms")).toBe(false);
    expect(isDefinitionsSectionHeading("Notices")).toBe(false);
    expect(isDefinitionsSectionHeading("")).toBe(false);
  });
});

describe("definition boundary containment — adversarial document shapes", () => {
  it("preamble enumerators before the first top-level definition do not swallow the next term", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "As used in this Agreement:",
      "(a) the following rules apply;",
      "(b) singular includes plural.",
      "“Alpha” means the sum of:",
      "(i) one; plus",
      "(ii) two.",
      "“Beta” means cash.",
    ].join("\n");
    const alpha = text.indexOf("“Alpha”");
    const nodes = parseDocumentStructure({ documentId: "preamble-gap", label: "preamble-gap", text });
    const b = nodes.find((n) => n.sectionRef === "1.01(b)");
    expect(b).toBeDefined();
    expect(b!.charEnd).toBeLessThanOrEqual(alpha);
    const limbs = nodes.filter((n) => n.sectionRef === "1.01(i)" || n.sectionRef === "1.01(ii)");
    for (const limb of limbs) {
      expect(limb.charStart).toBeGreaterThanOrEqual(alpha);
      expect(limb.charEnd).toBeLessThanOrEqual(text.indexOf("“Beta”"));
    }
  });

  it("multiple definitions sections with intervening ordinary sections keep local containment", () => {
    const text = [
      "ARTICLE I DEFINITIONS",
      "SECTION 1.01. Defined Terms.",
      "“Alpha” means the sum of:",
      "(i) one; plus",
      "(ii) two.",
      "“Beta” means cash.",
      "SECTION 2.01. Commitments.",
      "(a) Each Lender agrees to make loans.",
      "(b) The Borrower may borrow.",
      "ARTICLE XII MISCELLANEOUS",
      "SECTION 12.01. Additional Definitions.",
      "“Omega” means the sum of:",
      "(i) omega-one; plus",
      "(ii) omega-two.",
      "“Zeta” means zero.",
      "SECTION 12.02. Severability.",
      "(a) If any provision is invalid.",
    ].join("\n");
    const nodes = parseDocumentStructure({ documentId: "multi-def", label: "multi-def", text });
    const beta = text.indexOf("“Beta”");
    const zeta = text.indexOf("“Zeta”");
    for (const n of nodes.filter((x) => x.sectionRef.startsWith("1.01(") && x.charStart < beta)) {
      expect(n.charEnd).toBeLessThanOrEqual(beta);
    }
    for (const n of nodes.filter((x) => x.sectionRef.startsWith("12.01(") && x.charStart < zeta)) {
      expect(n.charEnd).toBeLessThanOrEqual(zeta);
    }
    const c201a = nodes.find((n) => n.sectionRef === "2.01(a)");
    expect(c201a?.parentSectionRef).toBe("2.01");
    expect(c201a!.charEnd).toBeLessThanOrEqual(text.indexOf("SECTION 12.01") > 0 ? text.indexOf("ARTICLE XII") : text.length);
  });

  it("false-context definitions headings do not activate body segmentation", () => {
    const text = [
      "SECTION 6.01. Certain Definitions Incorporated Herein.",
      "The following terms apply for this Article only:",
      "(a) first list item before any declaration;",
      "(b) second list item.",
      "“Local Term” means a term defined only for this Article.",
      "(i) limb after local term;",
      "(ii) another limb.",
      "SECTION 6.02. Notices.",
      "(a) Notices are delivered in writing.",
      "(b) Email counts as writing.",
    ].join("\n");
    const nodes = parseDocumentStructure({ documentId: "false-ctx", label: "false-ctx", text });
    const sec601 = nodes.find((n) => n.sectionRef === "6.01")!;
    const sec602 = nodes.find((n) => n.sectionRef === "6.02")!;
    expect(isDefinitionsSectionHeading(sec601.heading)).toBe(false);
    expect(nodes.find((n) => n.sectionRef === "6.02(a)")?.parentSectionRef).toBe("6.02");
    expect(nodes.find((n) => n.sectionRef === "6.02(b)")?.parentSectionRef).toBe("6.02");
    // 6.02 clauses must not be truncated by a Local Term boundary inside 6.01.
    const local = text.indexOf("“Local Term”");
    const n602a = nodes.find((n) => n.sectionRef === "6.02(a)")!;
    expect(n602a.charStart).toBeGreaterThan(local);
    expect(n602a.charEnd).toBeGreaterThan(n602a.charStart);
    expect(sec602.charStart).toBeGreaterThan(sec601.charStart);
    // Scanner may still see Local Term as text; structure must not treat 6.01 as defs inventory.
    const starts = findTopLevelDefinitionStarts(text, sec601.charStart, sec602.charStart);
    expect(starts.length).toBeGreaterThanOrEqual(1);
  });

  it("nested quoted definitions inside a body stay nested; later section unaffected", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Outer” means an amount determined under “Inner Cap” has the meaning assigned to such term in Section 1.01 of this Agreement and then continues.",
      "“Inner Cap” means $1.",
      "SECTION 5.01. Affirmative Covenants.",
      "(a) Maintain existence.",
    ].join("\n");
    const nodes = parseDocumentStructure({ documentId: "nested-q", label: "nested-q", text });
    const starts = findTopLevelDefinitionStarts(
      text,
      nodes.find((n) => n.sectionRef === "1.01")!.charStart,
      nodes.find((n) => n.sectionRef === "5.01")!.charStart,
    );
    expect(starts).toHaveLength(2);
    expect(nodes.find((n) => n.sectionRef === "5.01(a)")?.parentSectionRef).toBe("5.01");
  });

  it("duplicate sectionRef definitions sections keep distinct physical spans", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Dup” means first.",
      "SECTION 1.01. Defined Terms Again.",
      "“Dup” means second.",
      "SECTION 1.02. Notices.",
      "(a) orphan enumerator outside defs.",
    ].join("\n");
    const nodes = parseDocumentStructure({ documentId: "dup-ref", label: "dup-ref", text });
    const secs = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "1.01");
    expect(secs).toHaveLength(2);
    expect(secs[0]!.nodeId).not.toBe(secs[1]!.nodeId);
    expect(secs[0]!.charStart).toBeLessThan(secs[1]!.charStart);
    expect(nodes.find((n) => n.sectionRef === "1.02(a)")?.parentSectionRef).toBe("1.02");
  });

  it("malformed or missing definition declarations do not invent inventory segmentation on ordinary sections", () => {
    const text = [
      "SECTION 7.01. Indebtedness.",
      "Create Indebtedness except:",
      "Indebtedness: the Borrower may incur loans under the Revolving Facility.",
      "(a) under the Revolving Facility;",
      "(b) that is Permitted Refinancing Indebtedness.",
      "SECTION 7.02. Liens.",
      "(a) no Liens except Permitted Liens.",
    ].join("\n");
    const nodes = parseDocumentStructure({ documentId: "ordinary", label: "ordinary", text });
    const sec = nodes.find((n) => n.sectionRef === "7.01")!;
    expect(isDefinitionsSectionHeading(sec.heading)).toBe(false);
    expect(nodes.find((n) => n.sectionRef === "7.01(a)")?.parentSectionRef).toBe("7.01");
    expect(nodes.find((n) => n.sectionRef === "7.02(a)")?.parentSectionRef).toBe("7.02");
  });
});
