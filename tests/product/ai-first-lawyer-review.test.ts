import { describe, expect, it } from "vitest";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import {
  applyReviewerOverlayToItems,
  mergePreservedReviewerDecisions,
  type ReviewerApproval,
} from "../../lib/product/customer-intelligence/reviewer-approvals";
import type { CovenantSummaryItem, DocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";

describe("AI-first lawyer review", () => {
  it("analyzeProvision surfaces alternatives and assumptions for ambiguous prohibitions", () => {
    const analysis = analyzeProvision({
      sourceId: "test:src",
      documentTitle: "Test Credit Agreement",
      candidate: {
        candidateId: "c1",
        sourceId: "test:src",
        nodeId: "n1",
        families: ["INDEBTEDNESS"],
        signals: [],
        excerpt:
          "The Borrower shall not Create, incur, assume or suffer to exist any Indebtedness, except: (a) Indebtedness under this Agreement; (b) Indebtedness not exceeding $50,000,000; provided that no Default shall have occurred.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 8,
      },
      definitions: [],
      structuralNodes: [
        {
          nodeId: "n1",
          sourceId: "test:src",
          nodeType: "SECTION",
          sectionRef: "6.01",
          heading: "Limitation on Indebtedness",
          charStart: 0,
          charEnd: 200,
          ambiguous: false,
        },
      ],
    });
    expect(analysis.plainEnglish.length).toBeGreaterThan(40);
    expect(analysis.alternativeInterpretations.length).toBeGreaterThan(0);
    expect(analysis.assumptions.length).toBeGreaterThan(0);
    expect(analysis.interpretationNote).toMatch(/counsel review/i);
  });

  it("preserves counsel edits across reanalysis and flags acceptance conflicts", () => {
    const summary = {
      schemaVersion: "product.covenant-summary.v2",
      sourceId: "s1",
      governingAgreement: "CA",
      issuerCik: "1",
      documentClass: "CREDIT_AGREEMENT",
      generatedAt: new Date().toISOString(),
      promotedToLegalTruth: 0,
      note: "",
      countsByCategory: {},
      items: [
        {
          sectionRef: "6.01",
          plainEnglish: "New AI text about debt.",
          interpretationNote: "ai",
        } as CovenantSummaryItem,
      ],
      definedTermsSample: [],
    } as DocumentCovenantSummary;

    const approvals: ReviewerApproval[] = [
      {
        sourceId: "s1",
        sectionRef: "6.01",
        category: "DEBT_INCURRENCE",
        decision: "EDITED",
        editedPlainEnglish: "Counsel controlling reading.",
        priorPlainEnglish: "Old AI text",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewerLabel: "counsel",
        version: 1,
      },
    ];
    const merged = mergePreservedReviewerDecisions({ summary, priorApprovals: approvals });
    expect(merged.summary.items[0]!.plainEnglish).toBe("Counsel controlling reading.");
    expect(merged.summary.items[0]!.reviewerDecision).toBe("EDITED");

    const accepted: ReviewerApproval[] = [
      {
        ...approvals[0]!,
        decision: "ACCEPTED",
        editedPlainEnglish: undefined,
        priorPlainEnglish: "Old AI text about debt.",
      },
    ];
    const conflicted = mergePreservedReviewerDecisions({ summary, priorApprovals: accepted });
    expect(conflicted.conflicts.length).toBeGreaterThan(0);
  });

  it("Ask overlay prefers edited text and drops rejected items", () => {
    const items = [
      { sectionRef: "6.01", plainEnglish: "AI draft", sourceId: "s1" } as CovenantSummaryItem & {
        sourceId: string;
      },
      { sectionRef: "6.02", plainEnglish: "Reject me", sourceId: "s1" } as CovenantSummaryItem & {
        sourceId: string;
      },
    ];
    const approvals: ReviewerApproval[] = [
      {
        sourceId: "s1",
        sectionRef: "6.01",
        category: "DEBT",
        decision: "EDITED",
        editedPlainEnglish: "Approved edit",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewerLabel: "counsel",
        version: 1,
      },
      {
        sourceId: "s1",
        sectionRef: "6.02",
        category: "DEBT",
        decision: "REJECTED",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewerLabel: "counsel",
        version: 1,
      },
    ];
    const out = applyReviewerOverlayToItems(items, approvals);
    expect(out).toHaveLength(1);
    expect(out[0]!.plainEnglish).toBe("Approved edit");
    expect(out[0]!.reviewerDecision).toBe("EDITED");
  });
});
