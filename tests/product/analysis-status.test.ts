import { describe, expect, it } from "vitest";
import {
  analysisPendingNote,
  analysisStatusOf,
  analysisStatusTone,
  isAnalysisPending,
} from "../../lib/product/customer-intelligence/analysis-status";

describe("rule 158: shared analysis status label", () => {
  it("maps each state to its label", () => {
    expect(analysisStatusOf({ analysisOk: true, processingStatus: "ANALYZED" })).toBe("ANALYZED");
    expect(analysisStatusOf({ analysisOk: false, processingStatus: "STAGED_PENDING_ANALYSIS" })).toBe("STAGED");
    expect(analysisStatusOf({ analysisOk: false, processingStatus: "ANALYZING" })).toBe("ANALYZING");
    expect(analysisStatusOf({ analysisOk: false, processingStatus: "FAILED_RETRYABLE" })).toBe("RETRYABLE");
    expect(analysisStatusOf({ analysisOk: false, processingStatus: null })).toBe("FAILED");
    expect(analysisStatusOf({ analysisOk: false, processingStatus: "ANALYZED" })).toBe("FAILED");
  });

  it("treats pending as pending, never as failed", () => {
    expect(isAnalysisPending({ analysisOk: false, processingStatus: "STAGED_PENDING_ANALYSIS" })).toBe(true);
    expect(isAnalysisPending({ analysisOk: false, processingStatus: "ANALYZING" })).toBe(true);
    expect(isAnalysisPending({ analysisOk: false, processingStatus: "FAILED_RETRYABLE" })).toBe(false);
    expect(isAnalysisPending({ analysisOk: false, processingStatus: null })).toBe(false);
    expect(isAnalysisPending({ analysisOk: true, processingStatus: "ANALYZED" })).toBe(false);
  });

  it("gives pending a distinct tone from failure", () => {
    expect(analysisStatusTone("ANALYZED")).toBe("pass");
    expect(analysisStatusTone("STAGED")).toBe("navy");
    expect(analysisStatusTone("ANALYZING")).toBe("navy");
    expect(analysisStatusTone("RETRYABLE")).toBe("trip");
    expect(analysisStatusTone("FAILED")).toBe("trip");
  });

  it("pending note does not ask for a re-upload", () => {
    expect(analysisPendingNote()).toMatch(/in progress or queued/i);
    expect(analysisPendingNote()).not.toMatch(/re-upload/i);
  });
});
