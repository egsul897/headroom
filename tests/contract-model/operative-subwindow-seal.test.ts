/**
 * OPERATIVE_SUBWINDOW source-window seal. Soft gate.
 * Invent-absence forever. IMPLEMENTED ≠ CERTIFIED.
 *
 * C1 FROZEN sha256 35907db264d8b6201189d315ee1a282e0dca008023b953652d39f71862005f4d
 * (COO GRANT sole). Sealing is independent of RECLASSIFIABLE_TO / D2.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  OPERATIVE_SUBWINDOW_C1_FROZEN_SHA256,
  PHASE3_CATEGORY_RECLASS_UNSUPPORTED,
  isSealedOperativeSubwindow,
  sealOperativeSubwindow,
  type OperativeSubwindowContainer,
  type OperativeSubwindowSealInput,
  type SealedOperativeSubwindow,
} from "../../lib/contract-model/compiler/operative-subwindow-seal";

const C1_FROZEN = "35907db264d8b6201189d315ee1a282e0dca008023b953652d39f71862005f4d";
const CHEWY_DOC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const CHEWY_NODES = "tests/fixtures/unseen-packages/phase-3-validation-chwy-run/stage1-all-nodes.json";
const CHEWY_STAGE2B = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json";
const CHEWY_SENTENCE_SHA = "78b081e801e06744fd6e665164b5b0801857a621de0f041eb6d5b21abeb4c83e";
const MODULE_SOURCE = fs.readFileSync("lib/contract-model/compiler/operative-subwindow-seal.ts", "utf8");

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sealed(input: OperativeSubwindowSealInput): SealedOperativeSubwindow {
  const result = sealOperativeSubwindow(input);
  expect(isSealedOperativeSubwindow(result)).toBe(true);
  if (!isSealedOperativeSubwindow(result)) throw new Error("refused");
  return result;
}

function documentAround(sentence: string): OperativeSubwindowSealInput {
  const prefix = "(a) The container opens with a marker-owned clause.\n\n";
  const suffix = "\n(b) The container closes after the next marker.";
  const documentText = prefix + sentence + suffix;
  return {
    documentText,
    span: { charStart: prefix.length, charEnd: prefix.length + sentence.length },
    container: {
      nodeId: "structural-node:generalized-container",
      sectionRef: "9.01(a)",
      charStart: 0,
      charEnd: documentText.length,
    },
  };
}

describe("OPERATIVE_SUBWINDOW C1 seal", () => {
  it("binds the COO GRANT C1 FROZEN hash and stays uncertified", () => {
    expect(OPERATIVE_SUBWINDOW_C1_FROZEN_SHA256).toBe(C1_FROZEN);
    const result = sealed(documentAround("The borrower shall deliver the compliance certificate within ten days."));
    expect(result.frozenSha256).toBe(C1_FROZEN);
    expect(result.certification).toBe("NOT_CERTIFIED");
    expect(result.class).toBe("OPERATIVE_SUBWINDOW");
  });

  it("seals the recorded Chewy sentence as its own source span, not the 1.08(f) container", () => {
    const documentText = fs.readFileSync(CHEWY_DOC, "utf8");
    const nodes = JSON.parse(fs.readFileSync(CHEWY_NODES, "utf8")) as Array<{
      nodeId: string;
      sectionRef: string;
      charStart: number;
      charEnd: number;
    }>;
    const containerNode = nodes.find((node) => node.nodeId === "structural-node:4769fe34429021eab497c82b");
    expect(containerNode).toMatchObject({ sectionRef: "1.08(f)", charStart: 387511, charEnd: 393489 });
    if (!containerNode) throw new Error("recorded container missing");

    const stage2bBefore = fs.readFileSync(CHEWY_STAGE2B);
    const input: OperativeSubwindowSealInput = {
      documentText,
      span: { charStart: 392815, charEnd: 393488 },
      container: {
        nodeId: containerNode.nodeId,
        sectionRef: containerNode.sectionRef,
        charStart: containerNode.charStart,
        charEnd: containerNode.charEnd,
      },
    };
    const decoys = {
      ...input,
      description: "automatic reclassification of amounts originally under Fixed Amounts into Incurrence-Based Amounts",
      sourceCitation: "(f) ",
      distinguishingQuote: "In addition",
      verifiedQuoteFingerprint: "absent",
    };
    const result = sealed(decoys);

    expect(result.window.charStart).toBe(392815);
    expect(result.window.charEnd).toBe(393488);
    expect(result.window.text.length).toBe(673);
    expect(result.window.sha256).toBe(CHEWY_SENTENCE_SHA);
    expect(result.window.sha256).toBe(sha256(documentText.slice(392815, 393488)));
    expect(result.window.text).toBe(documentText.slice(392815, 393488));
    expect(result.window.text.startsWith("In addition, any Indebtedness")).toBe(true);
    expect(result.window.text.endsWith("on a Pro Forma Basis.")).toBe(true);
    expect(result.window.text).not.toBe(decoys.description);
    expect(result.window.text).not.toBe(decoys.sourceCitation);
    expect(result.window.text).not.toBe(decoys.distinguishingQuote);
    expect(result.container).toEqual({
      nodeId: "structural-node:4769fe34429021eab497c82b",
      sectionRef: "1.08(f)",
      charStart: 387511,
      charEnd: 393489,
    });
    expect(result.window.text.length).toBeLessThan(containerNode.charEnd - containerNode.charStart);
    expect(documentText.slice(containerNode.charStart, containerNode.charEnd).endsWith(`${result.window.text}\n`)).toBe(true);

    expect(result.nonClaims).toEqual({
      mintsCandidateIdentity: false,
      editsSealedDiscovery: false,
      manufacturesStructuralNode: false,
      mintsPin: false,
      stage1MarkerInvent: false,
      writesReclassEdge: false,
      targetRuleId: null,
      issuerSpecialCase: false,
    });
    expect(JSON.stringify(result)).not.toContain("RECLASSIFIABLE_TO");
    expect(JSON.stringify(result)).not.toContain("discoveryId");
    expect(stage2bBefore.equals(fs.readFileSync(CHEWY_STAGE2B))).toBe(true);
    expect(fs.readFileSync(CHEWY_STAGE2B, "utf8")).not.toContain("RECLASSIFIABLE_TO");
  });

  it("does not seal the container span, a quote, or a span that is not the sentence", () => {
    const documentText = fs.readFileSync(CHEWY_DOC, "utf8");
    const container: OperativeSubwindowContainer = {
      nodeId: "structural-node:4769fe34429021eab497c82b",
      sectionRef: "1.08(f)",
      charStart: 387511,
      charEnd: 393489,
    };
    expect(sealOperativeSubwindow({ documentText, span: { charStart: 387511, charEnd: 393489 }, container }).verdict).toBe("REFUSED");
    expect(sealOperativeSubwindow({ documentText, span: { charStart: 387511, charEnd: 393489 }, container })).toMatchObject({
      code: "SPAN_EQUALS_CONTAINER",
      certification: "NOT_CERTIFIED",
    });
    const quoteStart = documentText.indexOf("In addition", 392000);
    expect(sealOperativeSubwindow({
      documentText,
      span: { charStart: quoteStart, charEnd: quoteStart + "In addition".length },
      container,
    })).toMatchObject({ verdict: "REFUSED", code: "NOT_A_SENTENCE_SPAN" });
    expect(sealOperativeSubwindow({
      documentText,
      span: { charStart: 392815, charEnd: 393489 },
      container,
    })).toMatchObject({ verdict: "REFUSED", code: "NOT_A_SENTENCE_SPAN" });
  });

  it("seals any unenumerated sentence under the same rule, including one the IR cannot edge", () => {
    const ordinary = sealed(documentAround("The borrower shall deliver the compliance certificate within ten days."));
    const reclass = sealed(documentAround(
      "In addition, any Indebtedness incurred in reliance on Fixed Amounts shall be automatically reclassified as incurred under the applicable Incurrence-Based Amounts.",
    ));
    expect(ordinary.verdict).toBe("SEALED");
    expect(reclass.verdict).toBe("SEALED");
    expect(ordinary.downstreamRepresentation).toEqual(reclass.downstreamRepresentation);
    expect(reclass.downstreamRepresentation).toEqual({
      coupledToSeal: false,
      categoryReclass: PHASE3_CATEGORY_RECLASS_UNSUPPORTED,
      edgeInvent: "FORBIDDEN",
      relationshipType: null,
      targetRuleId: null,
    });
    expect(reclass.window.text).toContain("Fixed Amounts");
    expect(reclass.window.text).toContain("Incurrence-Based Amounts");
    expect(ordinary.container.nodeId).toBe("structural-node:generalized-container");
    expect(reclass.container.sectionRef).toBe("9.01(a)");
    expect(reclass.window.sha256).toBe(sha256(reclass.window.text));
    expect(reclass.window.sha256).not.toBe(ordinary.window.sha256);
  });

  it("fails closed on a marker-led span, two sentences, a missing container, and a span outside it", () => {
    const marker = documentAround("(i) This clause is itself a marker-owned span.");
    expect(sealOperativeSubwindow(marker)).toMatchObject({ verdict: "REFUSED", code: "SPAN_HAS_OWN_MARKER" });

    const two = documentAround("One sentence is stated here. Another sentence follows it.");
    expect(sealOperativeSubwindow(two)).toMatchObject({ verdict: "REFUSED", code: "NOT_A_SENTENCE_SPAN" });

    const base = documentAround("The borrower shall deliver notice within ten days.");
    expect(sealOperativeSubwindow({
      ...base,
      container: { ...base.container, nodeId: "  ", sectionRef: "9.01(a)" },
    })).toMatchObject({ verdict: "REFUSED", code: "CONTAINER_IDENTITY_ABSENT" });
    expect(sealOperativeSubwindow({
      ...base,
      container: { ...base.container, sectionRef: "" },
    })).toMatchObject({ verdict: "REFUSED", code: "CONTAINER_IDENTITY_ABSENT" });

    expect(sealOperativeSubwindow({
      ...base,
      span: { charStart: base.span.charStart, charEnd: base.documentText.length + 5 },
    })).toMatchObject({ verdict: "REFUSED", code: "SPAN_OUT_OF_DOCUMENT" });

    expect(sealOperativeSubwindow({
      ...base,
      container: { ...base.container, charStart: base.span.charEnd, charEnd: base.documentText.length },
    })).toMatchObject({ verdict: "REFUSED", code: "SPAN_NOT_INSIDE_CONTAINER" });

    expect(sealOperativeSubwindow({
      ...base,
      container: { ...base.container, charStart: -1, charEnd: base.documentText.length },
    })).toMatchObject({ verdict: "REFUSED", code: "CONTAINER_SPAN_INVALID" });

    const commaCitation = documentAround("The clause cites sections, (ii) and then finishes the sentence.");
    expect(sealOperativeSubwindow(commaCitation).verdict).toBe("SEALED");

    const glued = documentAround("The text cites Section 6.01(a) and then finishes the sentence.");
    expect(sealOperativeSubwindow(glued).verdict).toBe("SEALED");
  });

  it("a refusal carries the same D2 block and does not become a seal", () => {
    const refused = sealOperativeSubwindow(documentAround("One sentence is stated here. Another sentence follows it."));
    const ok = sealed(documentAround("The borrower shall deliver notice within ten days."));
    expect(refused.verdict).toBe("REFUSED");
    if (refused.verdict !== "REFUSED") throw new Error("sealed");
    expect(refused.certification).toBe("NOT_CERTIFIED");
    expect(refused.frozenSha256).toBe(C1_FROZEN);
    expect(refused.downstreamRepresentation).toEqual(ok.downstreamRepresentation);
    expect("window" in refused).toBe(false);
  });

  it("does not invent a Stage-1 marker, a Chewy span, a discovery id, or a Knife River path", () => {
    expect(MODULE_SOURCE).not.toMatch(/buildClauseTree|parseDocumentStructure|findRawMarkerOccurrences/);
    expect(MODULE_SOURCE).not.toMatch(/from ["'].*clause-hierarchy|from ["'].*stage-structure|from ["'].*pass-c/);
    expect(MODULE_SOURCE).not.toContain("392815");
    expect(MODULE_SOURCE).not.toContain("1.08(f)");
    expect(MODULE_SOURCE).not.toMatch(/[Cc]hewy/);
    expect(MODULE_SOURCE).not.toMatch(/[Kk]nife/);
    expect(MODULE_SOURCE).not.toMatch(/discoveryId|stage2b|RECLASSIFIABLE_TO/);
    expect(MODULE_SOURCE).toContain(C1_FROZEN);
  });
});
