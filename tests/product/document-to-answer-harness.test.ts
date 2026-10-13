/**
 * Workstream C — document-to-answer acceptance harness (non-authoritative).
 */
import { describe, expect, it } from "vitest";
import { runDocumentToAnswerTrace } from "@/lib/product/document-to-answer-harness";
import { matthewsCompilerPackageDocuments } from "@/lib/product/real-dashboard-vertical-slice/source-excerpts-matthews";

describe("document-to-answer harness (NON_AUTHORITATIVE)", () => {
  it("traces source→compile→OA→financial→simulate→output and refuses AVAILABLE", async () => {
    const docs = matthewsCompilerPackageDocuments();
    const trace = await runDocumentToAnswerTrace({
      questionId: "d2a-matthews-fixed-dollar-1a",
      prompt: "How much Permitted Debt (1)(a) capacity remains for a $50M incurrence?",
      companyId: "harness-matthews",
      packageKey: "matthews-harness",
      asOfDate: "2024-12-31",
      contemplatedAmountUsd: 50_000_000,
      documents: docs.map((d) => ({
        documentId: d.documentId,
        text: d.text,
        label: d.label,
      })),
      // No approved financials / ledger → remaining NEEDS_INPUT; AVAILABLE null.
    });

    expect(trace.mode).toBe("NON_AUTHORITATIVE");
    expect(trace.answer.authoritative).toBe(false);
    expect(trace.answer.availableCapacityUsd).toBeNull();
    expect(trace.integrity.productionAuthorityPublished).toBe(false);
    expect(trace.stages.map((s) => s.stage)).toEqual([
      "source_documents",
      "compilation",
      "operative_authority",
      "financial_state",
      "capacity_simulation",
      "output",
    ]);
    const financial = trace.stages.find((s) => s.stage === "financial_state")!;
    expect(financial.disposition).toBe("NEEDS_INPUT");
    const sim = trace.stages.find((s) => s.stage === "capacity_simulation")!;
    expect(["NEEDS_INPUT", "UNSUPPORTED", "REFUSE"]).toContain(sim.disposition);
    expect(sim.numericClaims.find((n) => n.label === "available")?.amountUsd).toBeNull();
  });

  it("refuses PRODUCTION_AUTHORITY mode without elevating authority", async () => {
    const trace = await runDocumentToAnswerTrace(
      {
        questionId: "d2a-prod-refuse",
        prompt: "Publish production available capacity",
        companyId: "harness-refuse",
        packageKey: "empty",
        asOfDate: "2024-12-31",
        documents: [{ documentId: "doc-a", text: "SECTION 7.01. Reserved." }],
      },
      { mode: "PRODUCTION_AUTHORITY" },
    );
    expect(trace.answer.disposition).toBe("REFUSE");
    expect(trace.answer.blockers).toContain("harness_refuses_production_authority_mode");
    expect(trace.answer.authoritative).toBe(false);
    expect(trace.integrity.productionAuthorityPublished).toBe(false);
  });

  it("refuses empty source documents and preserves uncertainty", async () => {
    const trace = await runDocumentToAnswerTrace({
      questionId: "d2a-empty",
      prompt: "Any capacity?",
      companyId: "harness-empty",
      packageKey: "empty",
      asOfDate: "2024-12-31",
      documents: [{ documentId: "doc-a", text: "   " }],
    });
    expect(trace.stages[0]!.disposition).toBe("REFUSE");
    expect(trace.integrity.uncertaintyPreserved).toBe(true);
    expect(trace.answer.availableCapacityUsd).toBeNull();
  });

  it("with approved facts + ledger, still never publishes AVAILABLE", async () => {
    const docs = matthewsCompilerPackageDocuments();
    const trace = await runDocumentToAnswerTrace({
      questionId: "d2a-ledger",
      prompt: "Remaining after $100M prior usage?",
      companyId: "harness-matthews",
      packageKey: "matthews-harness",
      asOfDate: "2024-12-31",
      contemplatedAmountUsd: 25_000_000,
      documents: docs.slice(0, 1).map((d) => ({
        documentId: d.documentId,
        text: d.text,
        label: d.label,
      })),
      approvedFinancialFacts: [
        {
          key: "Consolidated EBITDA",
          amountUsd: 400_000_000,
          asOfDate: "2024-09-30",
          approvalStatus: "APPROVED",
        },
      ],
      ledgerUsageUsd: 100_000_000,
    });
    expect(trace.answer.availableCapacityUsd).toBeNull();
    expect(trace.integrity.productionAuthorityPublished).toBe(false);
    const availableClaim = trace.stages
      .flatMap((s) => s.numericClaims)
      .filter((n) => n.claimKind === "AVAILABLE");
    expect(availableClaim.every((n) => n.amountUsd == null && n.authoritative === false)).toBe(
      true,
    );
  });
});
