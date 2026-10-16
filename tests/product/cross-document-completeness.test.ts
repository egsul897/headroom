/**
 * Rule 63 — completeness counts DISTINCT documents, not entries.
 *
 * The classifier used to count args.evaluated.length, so a
 * document evaluated twice (e.g. debt + lien regimes) inflated
 * documentsEvaluated and the "permitted by all N" summary, and
 * an evaluated entry for a document NOT on file counted
 * toward permission. Per document, the worst status wins
 * (blocked > review_required > not_tested > clear); foreign
 * entries cannot support this package.
 */
import { describe, expect, it } from "vitest";
import { classifyCrossDocumentCompleteness } from "../../lib/product/unified-position/cross-document-completeness";

const onFile = [
  { id: "a", name: "Indenture" },
  { id: "b", name: "Credit Agreement" },
];

describe("classifyCrossDocumentCompleteness distinct-document counting", () => {
  it("one document evaluated twice counts once, worst status wins", () => {
    const r = classifyCrossDocumentCompleteness({
      documentsOnFile: onFile,
      evaluated: [
        { documentId: "a", documentName: "Indenture", status: "clear" },
        { documentId: "a", documentName: "Indenture", status: "blocked", sectionRef: "6.01" },
        { documentId: "b", documentName: "Credit Agreement", status: "clear" },
      ],
    });
    expect(r.verdict).toBe("PROHIBITED_BY_ONE_OR_MORE");
    expect(r.documentsEvaluated).toBe(2);
    expect(r.prohibited).toHaveLength(1);
    expect(r.permitted).toHaveLength(1);
  });

  it("two clear entries for one document do not inflate the permitted count", () => {
    const r = classifyCrossDocumentCompleteness({
      documentsOnFile: [{ id: "a", name: "Indenture" }],
      evaluated: [
        { documentId: "a", documentName: "Indenture", status: "clear" },
        { documentId: "a", documentName: "Indenture", status: "clear" },
      ],
    });
    expect(r.verdict).toBe("PERMITTED_BY_ALL_APPLICABLE");
    expect(r.documentsEvaluated).toBe(1);
    expect(r.permitted).toHaveLength(1);
    expect(r.summary).toContain("all 1");
  });

  it("evaluated entries for documents not on file are ignored", () => {
    const r = classifyCrossDocumentCompleteness({
      documentsOnFile: [{ id: "a", name: "Indenture" }],
      evaluated: [
        { documentId: "a", documentName: "Indenture", status: "clear" },
        { documentId: "foreign", documentName: "Other Co Doc", status: "clear" },
      ],
    });
    expect(r.verdict).toBe("PERMITTED_BY_ALL_APPLICABLE");
    expect(r.documentsEvaluated).toBe(1);
    expect(r.permitted).toHaveLength(1);
  });
});
